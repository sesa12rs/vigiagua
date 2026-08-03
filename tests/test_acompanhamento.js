/* Acompanhamento dos municípios (item 1):
   - DB.MunPlano.statusBruto / progresso / foraDoPrazo / resumoTodos / concluir / reabrir  (Node puro)
   - botão Concluir/Reabrir do módulo municipal + preservação do status ao salvar  (jsdom)
   node tests/test_acompanhamento.js
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, cond, extra = '') => {
  console.log((cond ? '  \u2705 ' : '  \u274c ') + label + (cond ? '' : '  ' + extra));
  if (!cond) fail++;
};

/* ══════════════════════════════════════════════════════
   PARTE A — DB.MunPlano em Node puro (localStorage falso)
   ══════════════════════════════════════════════════════ */
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
const L = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
(0, eval)(L('js/utils.js') + '\nglobalThis.Utils = Utils;');
(0, eval)(L('js/data.js')  + '\nglobalThis.DB = DB;');

const dISO = d => d.toISOString().slice(0, 10);
const hoje = new Date();
const FUTURO  = dISO(new Date(hoje.getTime() + 30 * 864e5));
const PASSADO = dISO(new Date(hoje.getTime() - 30 * 864e5));

function seedPlano(prazo) {
  localStorage.setItem('va_plano_2027', JSON.stringify({ ok: true, cfg: { ano: 2027 }, status: 'publicado', prazoEdicao: prazo }));
  localStorage.setItem('va_planos_index', JSON.stringify([2027]));
}
function seedMun(nome, obj) { localStorage.setItem(`va_munplano_${nome}_2027`, JSON.stringify(obj)); }

seedPlano(FUTURO);

// Umuarama: rascunho, 2 de 4 locais preenchidos (inclui uma coleta filha)
seedMun('Umuarama', {
  v: 1, salvoEm: new Date().toISOString(), status: 'rascunho',
  campos: {}, extras: [],
  normais: [
    { local: 'Escola Central', filho: null },
    { local: '' },
    { local: 'Poço 3', filho: { local: '' } },
  ],
});
// Altônia: concluído, todos os locais preenchidos
seedMun('Altônia', {
  v: 1, salvoEm: new Date().toISOString(), status: 'concluido', concluidoEm: new Date().toISOString(),
  campos: {}, extras: [{ local: 'Reclamação bairro X' }],
  normais: [{ local: 'Ponto 1' }, { local: 'Ponto 2' }],
});
// Xambrê: sem blob → não iniciado

console.log('\n[Status bruto]');
check('Altônia = concluido',      DB.MunPlano.statusBruto('Altônia', 2027) === 'concluido');
check('Umuarama = rascunho',      DB.MunPlano.statusBruto('Umuarama', 2027) === 'rascunho');
check('Xambrê = nao_iniciado',    DB.MunPlano.statusBruto('Xambrê', 2027) === 'nao_iniciado');

console.log('\n[Progresso de preenchimento]');
{
  const p = DB.MunPlano.progresso('Umuarama', 2027);
  check('total conta normais + filhas (4)', p.total === 4, `total=${p.total}`);
  check('locais preenchidos = 2',           p.comLocal === 2, `comLocal=${p.comLocal}`);
  check('percentual = 50%',                 p.pct === 50, `pct=${p.pct}`);
  const z = DB.MunPlano.progresso('Xambrê', 2027);
  check('não iniciado tem progresso zero',  z.total === 0 && z.pct === 0);
}

console.log('\n[Fora do prazo — derivado do prazo de edição]');
{
  seedPlano(FUTURO);
  check('dentro do prazo: rascunho NÃO está fora',   DB.MunPlano.foraDoPrazo('Umuarama', 2027) === false);
  check('dentro do prazo: não iniciado NÃO está fora', DB.MunPlano.foraDoPrazo('Xambrê', 2027) === false);
  seedPlano(PASSADO);
  check('prazo vencido: rascunho fica fora do prazo',        DB.MunPlano.foraDoPrazo('Umuarama', 2027) === true);
  check('prazo vencido: não iniciado fica fora do prazo',    DB.MunPlano.foraDoPrazo('Xambrê', 2027) === true);
  check('concluído NUNCA fica fora do prazo (mesmo vencido)', DB.MunPlano.foraDoPrazo('Altônia', 2027) === false);
  seedPlano(FUTURO);
}

console.log('\n[Resumo consolidado]');
{
  const r = DB.MunPlano.resumoTodos(2027);
  check('cobre os 21 municípios', r.length === 21, `n=${r.length}`);
  const alt = r.find(x => x.nome === 'Altônia');
  check('Altônia no resumo com concluidoEm', alt && alt.status === 'concluido' && !!alt.concluidoEm);
  const uma = r.find(x => x.nome === 'Umuarama');
  check('Umuarama traz pct 50 e salvoEm', uma && uma.pct === 50 && !!uma.salvoEm);
}

console.log('\n[Concluir / Reabrir]');
{
  seedMun('Ivaté', { v: 1, salvoEm: new Date().toISOString(), status: 'rascunho', campos: {}, extras: [], normais: [{ local: 'A' }] });
  check('parte como rascunho', DB.MunPlano.statusBruto('Ivaté', 2027) === 'rascunho');
  DB.MunPlano.concluir('Ivaté', 2027);
  const c = DB.MunPlano.carregar('Ivaté', 2027);
  check('concluir → status concluido + concluidoEm', c.status === 'concluido' && !!c.concluidoEm);
  check('concluir preserva as coletas', Array.isArray(c.normais) && c.normais.length === 1);
  DB.MunPlano.reabrir('Ivaté', 2027);
  const r = DB.MunPlano.carregar('Ivaté', 2027);
  check('reabrir → volta a rascunho, sem concluidoEm', r.status === 'rascunho' && !r.concluidoEm);
}

/* ══════════════════════════════════════════════════════
   PARTE B — botão do módulo municipal (jsdom)
   ══════════════════════════════════════════════════════ */
console.log('\n[Módulo municipal — botão Concluir/Reabrir + persistência]');
const { JSDOM, VirtualConsole } = require('jsdom');

function loadPage(file, { session, seedStorage = {} }) {
  let html = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/<script[^>]*src="https?:\/\/[^"]*"[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'http://localhost/' + file, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const { window } = dom;
  window.HTMLElement.prototype.scrollIntoView = () => {}; window.scrollTo = () => {};
  for (const [k, v] of Object.entries(seedStorage)) window.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  if (session) window.localStorage.setItem('va_session', JSON.stringify(session));
  const srcs   = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  for (const s of srcs) window.eval(fs.readFileSync(path.join(ROOT, s), 'utf8') + '\n;try{window.DB=DB}catch(e){};try{window.Utils=Utils}catch(e){};try{window.Planner=Planner}catch(e){}');
  for (const code of inline) window.eval(code);
  return { window };
}

// Regional publica 2027
const a = loadPage('planner.html', { session: { userId: 1, perfil: 'regional', nome: 'R', municipioId: null } });
a.window.confirm = () => true; a.window.alert = () => {};
a.window.eval('selecionarAno(2027); gerarPlano(); publicarAno(2027);');
const seed = {}; for (let i = 0; i < a.window.localStorage.length; i++) { const k = a.window.localStorage.key(i); seed[k] = a.window.localStorage.getItem(k); }

// Município Altônia preenche a planilha e usa o botão
const m = loadPage('municipio.html', { session: { userId: 102, perfil: 'municipio', nome: 'Altônia', municipioId: 3 }, seedStorage: seed });
m.window.alert = () => {}; m.window.mostrarToast = () => {};
const d = m.window.document;
['populacao', 'endereco', 'secretario', 'responsavel', 'profissional'].forEach((id, i) => d.getElementById(id).value = i === 0 ? '20500' : 'X');
d.getElementById('municipio').value = 'Altônia';
d.getElementById('vigilancia').value = 'Vigilância Ambiental';
m.window.eval('irEtapa2()');           // gera a tabela de coletas a partir do cronograma
const ano = d.getElementById('ano').value;
check('planilha gerada (há coletas normais)', d.querySelectorAll('#corpoTabela tr:not([data-linked])').length > 0);

m.window.eval('salvarPlanoMunicipal(true)');
check('salva como rascunho por padrão', m.window.DB.MunPlano.statusBruto('Altônia', ano) === 'rascunho');

m.window.eval('alternarConclusao()');   // → concluído
check('botão conclui o plano', m.window.DB.MunPlano.statusBruto('Altônia', ano) === 'concluido');
check('botão vira "Reabrir"', /Reabrir/.test(d.getElementById('btnConcluir').innerHTML));
check('selo de concluído visível', d.getElementById('seloConclusao').style.display !== 'none');

m.window.eval('salvarPlanoMunicipal(true)');   // editar depois de concluir não deve reverter
check('salvar após concluir PRESERVA o status concluído', m.window.DB.MunPlano.statusBruto('Altônia', ano) === 'concluido');

m.window.eval('alternarConclusao()');   // → reabre
check('botão reabre o plano', m.window.DB.MunPlano.statusBruto('Altônia', ano) === 'rascunho');
check('botão volta a "Concluir"', /Concluir/.test(d.getElementById('btnConcluir').innerHTML));

console.log(fail ? `\n\u274c ${fail} falha(s)` : '\n\u2705 Acompanhamento OK');
process.exit(fail ? 1 : 0);
