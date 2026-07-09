/*
 * Teste de regressão das páginas (executar com Node):
 *   npm install jsdom
 *   node tests/test_pages.js
 * Valida: inicialização, valores base, persistência, geração/publicação
 * do plano, filtros (Distribuição e Detalhamento) e módulo municipal.
 */
/* Teste de regressão headless — carrega as páginas reais com jsdom */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = require('path').join(__dirname, '..');

function loadPage(file, { session, seedStorage = {} }) {
  let html = fs.readFileSync(path.join(ROOT, file), 'utf8');

  // Remove scripts de CDN (sem rede no jsdom) — mantém apenas js locais e inline
  html = html.replace(/<script[^>]*src="https?:\/\/[^"]*"[^>]*><\/script>/g, '');

  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.detail || e.message || String(e)));
  vc.on('error', (...a) => errors.push(a.join(' ')));

  const dom = new JSDOM(html, {
    url: 'http://localhost/' + file,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });

  const { window } = dom;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};

  // Pré-semeia localStorage (dados primeiro; sessão por último para não ser sobrescrita)
  for (const [k, v] of Object.entries(seedStorage)) {
    window.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  if (session) window.localStorage.setItem('va_session', JSON.stringify(session));

  // Sessão válida evita redirecionamento em exigirPerfil/exigirLogin
  let redirected = null;

  // Executa scripts locais na ordem em que aparecem
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  try {
    for (const s of srcs) {
      let code = fs.readFileSync(path.join(ROOT, s), 'utf8');
      // const de topo não persiste entre evals — expõe no window como num <script> real
      code += '\n;try{window.DB=DB}catch(e){};try{window.Utils=Utils}catch(e){};try{window.Planner=Planner}catch(e){};';
      window.eval(code);
    }
    for (const code of inline) window.eval(code);
  } catch (e) {
    errors.push('EXCEÇÃO NA INICIALIZAÇÃO: ' + e.message + '\n' + (e.stack || '').split('\n')[1]);
  }

  return { window, errors, redirected };
}

const sessRegional = { userId: 1, perfil: 'regional', nome: '12ª Regional de Saúde', municipioId: null };
const sessMunicipio = { userId: 102, perfil: 'municipio', nome: 'Gestor — Altônia', municipioId: 3 };

let fail = 0;
function check(label, cond, extra = '') {
  console.log((cond ? '  ✅ ' : '  ❌ ') + label + (cond ? '' : '  ' + extra));
  if (!cond) fail++;
}

/* ════════ TESTE 1 — planner.html: init limpo + valores base ════════ */
console.log('\n[1] planner.html — primeira abertura (sem dados salvos)');
{
  const { window, errors } = loadPage('planner.html', { session: sessRegional });
  check('sem erros de inicialização', errors.length === 0, JSON.stringify(errors));
  check('cfgAno preenchido', window.document.getElementById('cfgAno').value === '2026');
  check('capacidade base = 55 (fixo)', window.document.getElementById('cfgCapacidadeExata').value === '55');
  check('entrega mín base = 4', window.document.getElementById('cfgEntregaMin').value === '4');
  check('entrega máx base = 9', window.document.getElementById('cfgEntregaMax').value === '9');
  check('municípios/viagem base = 10', window.document.getElementById('cfgMunicipiosExato').value === '10');
  const statsTxt = window.document.getElementById('metaStats')?.textContent || '';
  check('cards de metas renderizados (21 municípios)', statsTxt.includes('21'), statsTxt.slice(0,80));

  // Estrutura reorganizada (3 grupos A/B/C)
  const doc1 = window.document;
  check('grupo Planos por Ano existe', !!doc1.getElementById('secPlanos'));
  check('grupo Regras de Distribuição existe', !!doc1.getElementById('secRegras'));
  check('grupo Calendário do Ano existe', !!doc1.getElementById('secCalendario'));
  check('seções antigas removidas (secAno/secParams/secSemanas/secFeriados)',
    !doc1.getElementById('secAno') && !doc1.getElementById('secParams') &&
    !doc1.getElementById('secSemanas') && !doc1.getElementById('secFeriados'));
  check('campo de ano fica na barra de contexto (topo)', !!doc1.getElementById('anoInput') && doc1.getElementById('anoInput').type === 'number');
  check('campo global de prazo removido', !doc1.getElementById('cfgPrazoEdicao'));
  check('capacidade mora dentro de Regras de Distribuição',
    doc1.getElementById('secRegras')?.contains(doc1.getElementById('cfgCapacidadeExata')));
  check('semanas e feriados moram dentro de Calendário',
    doc1.getElementById('secCalendario')?.contains(doc1.getElementById('semanasGrid')) &&
    doc1.getElementById('secCalendario')?.contains(doc1.getElementById('feriadosList')));
  check('campo Ano duplicado eliminado (cfgAno agora é hidden)',
    doc1.getElementById('cfgAno')?.type === 'hidden');
}

/* ════════ TESTE 2 — planner.html: persistência da config ════════ */
console.log('\n[2] planner.html — persistência (config salva reaparece)');
{
  const cfgSalva = { ano: 2027, modoCapacidade: 'exato', capacidadeExata: 60, modoAlerta: 'exato', alertaExata: 45, modoEntrega: 'intervalo', entregaMin: 5, entregaMax: 8, modoMunicipios: 'exato', municipiosExato: 9, multiplicadorTeto: 2, pisoMensal: 1 };
  const { window, errors } = loadPage('planner.html', { session: sessRegional, seedStorage: { va_config: cfgSalva } });
  check('sem erros de inicialização', errors.length === 0, JSON.stringify(errors));
  check('ano salvo carregado (2027)', window.document.getElementById('cfgAno').value === '2027');
  check('capacidade salva (60)', window.document.getElementById('cfgCapacidadeExata').value === '60');
  check('entrega mín salva (5)', window.document.getElementById('cfgEntregaMin').value === '5');
  check('campo de ano reflete 2027', window.document.getElementById('anoInput').value === '2027');
}

/* ════════ TESTE 3 — planner.html: gerar plano + filtros ════════ */
console.log('\n[3] planner.html — gerar plano, Distribuição por Município e filtros');
{
  const { window, errors } = loadPage('planner.html', { session: sessRegional });
  window.confirm = () => true;
  window.alert = m => { throw new Error('alert: ' + m); };
  try {
    window.eval('gerarPlano()');
  } catch (e) { errors.push('gerarPlano: ' + e.message); }
  check('gerarPlano sem erros', errors.length === 0, JSON.stringify(errors));
  const doc = window.document;
  check('seção resultado visível', doc.getElementById('secaoResultado')?.classList.contains('visivel'));
  const busca = doc.getElementById('tabelaBusca');
  check('barra de filtro (busca) presente', !!busca);
  const linhasAntes = doc.querySelectorAll('#tabelaBody tr').length;
  // aplica filtro de busca "umuarama"
  if (busca) {
    busca.value = 'umuarama';
    try { window.eval('filtrarTabela()'); } catch (e) { errors.push('filtro: ' + e.message); }
  }
  const visiveis = [...doc.querySelectorAll('#tabelaBody tr')].filter(tr => tr.style.display !== 'none');
  check('filtro de busca funciona (1 visível)', visiveis.length === 1, `visíveis=${visiveis.length} de ${linhasAntes}`);
  check('contador do filtro atualizado', /1 de \d+/.test(doc.getElementById('tabelaCount')?.textContent || ''), doc.getElementById('tabelaCount')?.textContent);
  // Detalhamento por mês: filtros detMeses/detMuns existem?
  try { window.eval('typeof toggleFiltroDet === "function" || typeof mostrarDetalhamento === "function"'); } catch {}
  check('plano persistido em va_plano_2026', !!window.localStorage.getItem('va_plano_2026'));

  // publica e verifica status na recarga
  try { window.eval('publicarPlano()'); } catch (e) { errors.push('publicar: ' + e.message); }
  const p = JSON.parse(window.localStorage.getItem('va_plano_2026'));
  check('publicação persiste status', p.status === 'publicado');
}

/* ════════ TESTE 4 — planner.html: plano salvo reaparece ao recarregar ════════ */
console.log('\n[4] planner.html — plano publicado reaparece após recarregar');
{
  // Gera num contexto, copia storage para outro contexto (simula reload)
  const a = loadPage('planner.html', { session: sessRegional });
  a.window.confirm = () => true; a.window.alert = () => {};
  a.window.eval('gerarPlano()'); a.window.eval('publicarPlano()');
  const seed = {};
  for (let i = 0; i < a.window.localStorage.length; i++) {
    const k = a.window.localStorage.key(i);
    seed[k] = a.window.localStorage.getItem(k);
  }
  const b = loadPage('planner.html', { session: sessRegional, seedStorage: seed });
  check('sem erros ao recarregar', b.errors.length === 0, JSON.stringify(b.errors));
  check('resultado visível no reload', b.window.document.getElementById('secaoResultado')?.classList.contains('visivel'));
  const pill = b.window.document.getElementById('statusPlanoTopo')?.textContent || '';
  check('status "Publicado" exibido', pill.includes('Publicado'), pill);
}

/* ════════ TESTE 5 — municipio.html: ano correto + cronograma do ano ════════ */
console.log('\n[5] municipio.html — seleciona ano do plano publicado mais recente');
{
  // prepara: plano 2027 publicado via planner
  const a = loadPage('planner.html', { session: sessRegional });
  a.window.confirm = () => true; a.window.alert = () => {};
  a.window.document.getElementById('cfgAno').value = '2027';
  a.window.eval('onAnoChange(2027)');
  a.window.eval("typeof salvarConfig==='function' && salvarConfig()");
  a.window.eval('gerarPlano()'); a.window.eval('publicarPlano()');
  const seed = {};
  for (let i = 0; i < a.window.localStorage.length; i++) {
    const k = a.window.localStorage.key(i);
    seed[k] = a.window.localStorage.getItem(k);
  }

  const m = loadPage('municipio.html', { session: sessMunicipio, seedStorage: seed });
  check('sem erros de inicialização', m.errors.length === 0, JSON.stringify(m.errors));
  const doc = m.window.document;
  check('ano padrão = 2027 (último publicado)', doc.getElementById('ano').value === '2027', doc.getElementById('ano').value);
  check('banner "Cronograma regional disponível"', (doc.getElementById('statusCronograma').textContent || '').includes('disponível'));
  // gera planilha e confere datas de 2027
  m.window.alert = msg => m.errors.push('alert: ' + msg);
  doc.getElementById('endereco').value = 'Rua X'; doc.getElementById('secretario').value = 'A';
  doc.getElementById('responsavel').value = 'B'; doc.getElementById('profissional').value = 'C';
  doc.getElementById('vigilancia').value = 'Vigilância Ambiental';
  try { m.window.eval('irEtapa2()'); } catch (e) { m.errors.push('irEtapa2: ' + e.message); }
  check('planilha gerada sem erros', m.errors.length === 0, JSON.stringify(m.errors));
  const primeiraData = doc.querySelector('#corpoTabela .data-input')?.value || '';
  check('coletas são do ano 2027', primeiraData.startsWith('2027'), primeiraData);
}

/* ════════ TESTE 5b — edição do município depende SÓ do prazo (não do "ano mais recente") ════════ */
console.log('\n[5b] municipio.html — prazo por ano governa edição (ano não-mais-recente segue editável)');
{
  // 2026 e 2027 publicados; 2026 com prazo futuro (31/12/2026) deve continuar EDITÁVEL
  const a = loadPage('planner.html', { session: sessRegional });
  a.window.confirm = () => true; a.window.alert = () => {};
  a.window.eval('selecionarAno(2026)'); a.window.eval('gerarPlano()'); a.window.eval('publicarAno(2026)');
  a.window.eval("setPrazoAno(2026, '2026-12-31')");
  a.window.eval('selecionarAno(2027)'); a.window.eval('gerarPlano()'); a.window.eval('publicarAno(2027)');
  const seed = {};
  for (let i = 0; i < a.window.localStorage.length; i++) { const k = a.window.localStorage.key(i); seed[k] = a.window.localStorage.getItem(k); }

  // Verifica diretamente na camada de dados (data atual ~ jun/2026)
  const m = loadPage('municipio.html', { session: sessMunicipio, seedStorage: seed });
  check('podeEditar(2026) verdadeiro — prazo 31/12/2026 no futuro', m.window.eval('DB.Plano.podeEditar(2026)') === true);
  check('podeEditar(2027) verdadeiro — prazo 31/03/2027 no futuro', m.window.eval('DB.Plano.podeEditar(2027)') === true);

  // Seleciona 2026 no módulo municipal e confere que NÃO é somente leitura
  const doc = m.window.document;
  doc.getElementById('ano').value = '2026';
  m.window.eval('onAnoChange()');
  const banner = doc.getElementById('statusCronograma').textContent || '';
  check('2026 não entra em modo leitura (apesar de 2027 existir)', !banner.includes('somente leitura'), banner.slice(0,80));
  check('2026 mostra cronograma disponível', banner.includes('disponível'));

  // Agora vence o prazo de 2026 → vira somente leitura
  m.window.eval("DB.Plano.setPrazo(2026, '2020-01-01')");
  m.window.eval('onAnoChange()');
  const banner2 = doc.getElementById('statusCronograma').textContent || '';
  check('2026 vira somente leitura após prazo vencido', banner2.includes('somente leitura'), banner2.slice(0,80));
}


/* ════════ TESTE 6 — planner.html: filtros do Detalhamento por Mês ════════ */
console.log('\n[6] planner.html — Detalhamento por Mês (filtro de mês e município)');
{
  const { window, errors } = loadPage('planner.html', { session: sessRegional });
  window.confirm = () => true; window.alert = () => {};
  window.eval('gerarPlano()');
  const doc = window.document;
  const blocos = doc.querySelectorAll('#detalheMeses .mes-bloco');
  check('blocos de mês renderizados', blocos.length > 0, `blocos=${blocos.length}`);
  check('pílulas de mês presentes', !!doc.querySelector('#mesPills'));
  // filtra só março (mes=3)
  try { window.eval('toggleMesFiltro(3)'); } catch (e) { errors.push('toggleMes: ' + e.message); }
  const visiveis = [...doc.querySelectorAll('#detalheMeses .mes-bloco')].filter(b => b.style.display !== 'none');
  check('filtro de mês funciona (só março visível)',
        visiveis.length === 1 && visiveis[0].dataset.mes === '3',
        `visíveis=${visiveis.map(b=>b.dataset.mes).join(',')}`);
  // filtro de município destaca tags
  try { window.eval("toggleMunDetalhe('Umuarama')"); } catch (e) { errors.push('toggleMun: ' + e.message); }
  const destacadas = doc.querySelectorAll('#detalheMeses .mun-tag.t-hl').length;
  check('filtro de município destaca Umuarama', destacadas > 0, `destacadas=${destacadas}`);
  // limpar
  try { window.eval('limparFiltrosDetalhe()'); } catch (e) { errors.push('limpar: ' + e.message); }
  const visiveis2 = [...doc.querySelectorAll('#detalheMeses .mes-bloco')].filter(b => b.style.display !== 'none');
  check('limpar filtros restaura todos os meses', visiveis2.length === blocos.length);
  check('sem erros nos filtros', errors.length === 0, JSON.stringify(errors));
}


/* ════════ TESTE 7 — planner.html: Painel de Planos por Ano ════════ */
console.log('\n[7] planner.html — gestão multi-ano pelo painel');
{
  // Semeia dois anos: 2026 publicado, 2027 rascunho
  const a = loadPage('planner.html', { session: sessRegional });
  a.window.confirm = () => true; a.window.alert = () => {};
  // gera 2026 e publica
  a.window.document.getElementById('cfgAno').value = '2026';
  a.window.eval('onAnoChange(2026)');
  a.window.eval('gerarPlano()'); a.window.eval('publicarAno(2026)');
  // gera 2027 (rascunho)
  a.window.document.getElementById('cfgAno').value = '2027';
  a.window.eval('onAnoChange(2027)');
  a.window.eval('gerarPlano()');
  const seed = {};
  for (let i = 0; i < a.window.localStorage.length; i++) { const k = a.window.localStorage.key(i); seed[k] = a.window.localStorage.getItem(k); }

  const { window, errors } = loadPage('planner.html', { session: sessRegional, seedStorage: seed });
  window.confirm = () => true; window.alert = () => {};
  const doc = window.document;
  const linhas = doc.querySelectorAll('#painelPlanos .planos-tabela tbody tr');
  check('painel lista os 2 anos', linhas.length === 2, `linhas=${linhas.length}`);
  const txt = doc.getElementById('painelPlanos').textContent;
  check('mostra 2026 e 2027', txt.includes('2026') && txt.includes('2027'));
  check('mostra status Publicado e Rascunho', txt.includes('Publicado') && txt.includes('Rascunho'));

  // Despublicar 2026 diretamente pelo painel (sem precisar carregá-lo)
  doc.getElementById('cfgAno').value = '2027'; // editando 2027
  window.eval('despublicarAno(2026)');
  check('2026 despublicado diretamente', DB_status(window, 2026) === 'rascunho', DB_status(window, 2026));

  // Publicar 2027 pelo painel
  window.eval('publicarAno(2027)');
  check('2027 publicado pelo painel', DB_status(window, 2027) === 'publicado');

  // Abrir 2026 para edição
  window.eval('abrirPlano(2026)');
  check('abrir 2026 ajusta o ano do formulário', doc.getElementById('cfgAno').value === '2026');
  check('resultado do ano aberto visível', doc.getElementById('secaoResultado').classList.contains('visivel'));

  // Excluir 2027
  window.eval('excluirPlano(2027)');
  const anosRestantes = window.eval('DB.Plano.anos()');
  check('excluir 2027 remove do índice', JSON.stringify(anosRestantes) === '[2026]', JSON.stringify(anosRestantes));
  const linhas2 = doc.querySelectorAll('#painelPlanos .planos-tabela tbody tr');
  check('painel atualiza após excluir (1 linha)', linhas2.length === 1, `linhas=${linhas2.length}`);

  check('sem erros no fluxo do painel', errors.length === 0, JSON.stringify(errors));
}

function DB_status(window, ano) {
  const p = window.eval(`DB.Plano.carregar(${ano})`);
  return p ? p.status : null;
}


/* ════════ TESTE 8 — prazo de edição por ano (na tabela) ════════ */
console.log('\n[8] planner.html — prazo de edição por linha + per-plan');
{
  const a = loadPage('planner.html', { session: sessRegional });
  a.window.confirm = () => true; a.window.alert = () => {};
  a.window.eval('selecionarAno(2027)');
  a.window.eval('gerarPlano()'); a.window.eval('publicarAno(2027)');
  // prazo padrão deve ser 2027-03-31
  const p1 = a.window.eval('DB.Plano.carregar(2027)');
  check('prazo padrão = 31/03 do ano', p1.prazoEdicao === '2027-03-31', p1.prazoEdicao);
  check('podeEditar verdadeiro antes do prazo (jun/2026 < mar/2027)', a.window.eval('DB.Plano.podeEditar(2027)') === true);
  // muda o prazo para uma data passada → não pode mais editar
  a.window.eval("setPrazoAno(2027, '2026-01-01')");
  const p2 = a.window.eval('DB.Plano.carregar(2027)');
  check('prazo atualizado pela tabela', p2.prazoEdicao === '2026-01-01', p2.prazoEdicao);
  check('podeEditar falso após prazo vencido', a.window.eval('DB.Plano.podeEditar(2027)') === false);
  // a tabela mostra um input date com o valor do prazo
  const inp = a.window.document.querySelector('#painelPlanos .prazo-cell input[type=date]');
  check('tabela tem input de prazo editável', !!inp && inp.value === '2026-01-01', inp && inp.value);
}

console.log(fail ? `\n❌ ${fail} falha(s)` : '\n✅ Todos os testes passaram');
process.exit(fail ? 1 : 0);
