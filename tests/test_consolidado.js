/* Consolidado de coletas (item 2, fatia 2):
   - Relatorios.consolidadoColetas / csvConsolidado (reprodução de ID, opção a)  (Node puro)
   - render da aba: tabela, filtros, contadores, estado vazio  (jsdom)
   node tests/test_consolidado.js
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, cond, extra = '') => {
  console.log((cond ? '  \u2705 ' : '  \u274c ') + label + (cond ? '' : '  ' + extra));
  if (!cond) fail++;
};

/* ══════════════════ PARTE A — Relatorios (Node puro) ══════════════════ */
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
const L = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
(0, eval)(L('js/utils.js')      + '\nglobalThis.Utils = Utils;');
(0, eval)(L('js/data.js')       + '\nglobalThis.DB = DB;');
(0, eval)(L('js/relatorios.js') + '\nglobalThis.Relatorios = Relatorios;');

const setMun = (nome, obj) => localStorage.setItem(`va_munplano_${nome}_2027`, JSON.stringify(obj));

// Altônia: 2 normais (a 2ª com filha -CR) + 1 extra
setMun('Altônia', {
  v: 1, salvoEm: new Date().toISOString(), status: 'rascunho', campos: {},
  normais: [
    { data: '2027-03-02', local: 'Escola Central', sistema: 'SAA', mb: true, tb: true, cr: true, fl: true, criterio: 'LE-1' },
    { data: '2027-03-09', local: 'Posto de Saúde', sistema: 'SAC', mb: true, tb: true, cr: false, fl: false, criterio: 'LE-1',
      filho: { data: '2027-03-09', local: 'Rede — ponto CR', sistema: 'SAA', mb: false, tb: false, cr: true, fl: false, criterio: 'LE-1' } },
  ],
  extras: [
    { data: '2027-04-06', local: 'Reclamação bairro X', sistema: 'SAC', mb: true, tb: false, cr: true, fl: false, criterio: 'DE-1' },
  ],
});
// Umuarama: 2 normais, sem filha/extra
setMun('Umuarama', {
  v: 1, salvoEm: new Date().toISOString(), status: 'concluido', campos: {},
  normais: [
    { data: '2027-03-02', local: 'Reservatório', sistema: 'SAA', mb: true, tb: true, cr: true, fl: true, criterio: 'LE-1' },
    { data: '2027-03-16', local: 'Escola Rural',  sistema: 'SAA', mb: true, tb: true, cr: true, fl: false, criterio: 'LE-1' },
  ],
  extras: [],
});
// Xambrê: sem blob

const r = Relatorios.consolidadoColetas(2027);
const L2 = r.linhas;
const acha = (mun, id) => L2.find(x => x.municipio === mun && x.id === id);

console.log('\n[Estrutura e contagem]');
check('2 municípios preenchidos', r.municipiosPreenchidos === 2, `n=${r.municipiosPreenchidos}`);
check('6 linhas no total (2+1 filha+1 extra + 2)', L2.length === 6, `n=${L2.length}`);
check('tipos presentes', ['Normal', 'Filha', 'Extra'].every(t => L2.some(x => x.tipo === t)));

console.log('\n[Reprodução do ID — opção a]');
check('1ª normal (por data) = 001ALT2027', !!acha('Altônia', '001ALT2027') && acha('Altônia', '001ALT2027').tipo === 'Normal');
check('2ª normal = 002ALT2027', !!acha('Altônia', '002ALT2027'));
{
  const filha = L2.find(x => x.municipio === 'Altônia' && x.tipo === 'Filha');
  check('filha numerada APÓS as normais (003ALT2027)', filha && filha.id === '003ALT2027', filha && filha.id);
  check('filha é SAA e só CR marcado', filha && filha.sistema === 'SAA' && filha.cr && !filha.mb && !filha.tb && !filha.fl);
}
check('extra = EX-001ALT2027', !!acha('Altônia', 'EX-001ALT2027') && acha('Altônia', 'EX-001ALT2027').tipo === 'Extra');
check('Umuarama usa sigla UMR (001UMR2027)', !!acha('Umuarama', '001UMR2027'));

console.log('\n[Campos derivados]');
{
  const n1 = acha('Altônia', '001ALT2027');
  check('parâmetros preservados (MB/TB/CR/FL da 1ª normal)', n1.mb && n1.tb && n1.cr && n1.fl);
  check('mês derivado da data (março = 3)', n1.mes === 3, `mes=${n1.mes}`);
  check('semana ISO calculada (> 0)', typeof n1.semana === 'number' && n1.semana > 0, `sem=${n1.semana}`);
  check('local preservado', n1.local === 'Escola Central');
}

console.log('\n[CSV consolidado]');
{
  const csv = Relatorios.csvConsolidado(L2);
  const linhas = csv.trim().split('\n');
  check('cabeçalho correto', linhas[0] === 'Municipio,ID,Data,Semana,Tipo,Local,Sistema,MB,TB,CR,FL,Criterio');
  check('uma linha por coleta', linhas.length === L2.length + 1, `${linhas.length - 1} vs ${L2.length}`);
  check('local com vírgula é escapado com aspas', csv.includes('"Reclamação bairro X"') || csv.includes('"Escola Central"'));
}

console.log('\n[Ano sem preenchimento]');
{
  const vazio = Relatorios.consolidadoColetas(2099);
  check('linhas vazias e 0 municípios', vazio.linhas.length === 0 && vazio.municipiosPreenchidos === 0);
}

/* ══════════════════ PARTE B — render da aba (jsdom) ══════════════════ */
console.log('\n[Aba Consolidado — render no planner]');
const { JSDOM, VirtualConsole } = require('jsdom');
function loadPage(file, { session, seedStorage = {} }) {
  let html = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/<script[^>]*src="https?:\/\/[^"]*"[^>]*><\/script>/g, '');
  const errs = []; const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push(e.detail || e.message || String(e)));
  const dom = new JSDOM(html, { url: 'http://localhost/' + file, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom;
  window.HTMLElement.prototype.scrollIntoView = () => {}; window.scrollTo = () => {};
  for (const [k, v] of Object.entries(seedStorage)) window.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  if (session) window.localStorage.setItem('va_session', JSON.stringify(session));
  const srcs   = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  for (const s of srcs) window.eval(fs.readFileSync(path.join(ROOT, s), 'utf8') + '\n;try{window.DB=DB}catch(e){};try{window.Utils=Utils}catch(e){};try{window.Planner=Planner}catch(e){};try{window.Relatorios=Relatorios}catch(e){}');
  for (const code of inline) window.eval(code);
  return { window, errs };
}

const a = loadPage('planner.html', { session: { userId: 1, perfil: 'regional', nome: 'R', municipioId: null } });
a.window.confirm = () => true; a.window.alert = () => {}; a.window.mostrarToast = () => {};
a.window.eval('selecionarAno(2027); gerarPlano(); publicarAno(2027);');
// Semeia os planos municipais e abre a aba
a.window.localStorage.setItem('va_munplano_Altônia_2027', store['va_munplano_Altônia_2027']);
a.window.localStorage.setItem('va_munplano_Umuarama_2027', store['va_munplano_Umuarama_2027']);
a.window.eval('trocarTab(5)');
const doc = a.window.document;

check('sem erros de jsdom no render', a.errs.length === 0, a.errs.slice(0, 2).join(' | '));
check('badge = total de coletas (6)', doc.getElementById('badgeConsolidado').textContent === '6', doc.getElementById('badgeConsolidado').textContent);
check('tabela com 6 linhas', doc.querySelectorAll('#consTabela table.cons-table tbody tr').length === 6);
check('filtro de município populado (Altônia + Umuarama)', doc.querySelectorAll('#consMun option').length === 3);
check('resumo renderizado', doc.getElementById('consResumo').innerHTML.length > 0);

// Filtra por município Altônia → 4 linhas
doc.getElementById('consMun').value = 'Altônia';
a.window.eval('aplicarFiltrosConsolidado()');
check('filtro município Altônia → 4 linhas', doc.querySelectorAll('#consTabela table.cons-table tbody tr').length === 4);

// + tipo Extra → 1 linha
doc.getElementById('consTipo').value = 'Extra';
a.window.eval('aplicarFiltrosConsolidado()');
check('filtro Altônia+Extra → 1 linha', doc.querySelectorAll('#consTabela table.cons-table tbody tr').length === 1);

// Filtro por parâmetro FL (limpando os outros) → só coletas com FL
doc.getElementById('consMun').value = '';
doc.getElementById('consTipo').value = '';
doc.getElementById('consParam').value = 'fl';
a.window.eval('aplicarFiltrosConsolidado()');
{
  const linhasFL = doc.querySelectorAll('#consTabela table.cons-table tbody tr').length;
  check('filtro parâmetro FL retorna só coletas com FL', linhasFL === a.window.eval('_consLinhas.filter(l=>l.fl).length'), `n=${linhasFL}`);
}

// Ano sem plano → estado vazio
a.window.eval("consTrocarAno('2099')");
check('ano sem coletas → estado vazio exibido', doc.getElementById('consVazio').style.display !== 'none');
check('ano sem coletas → conteúdo oculto e badge —', doc.getElementById('consConteudo').style.display === 'none' && doc.getElementById('badgeConsolidado').textContent === '—');

console.log(fail ? `\n\u274c ${fail} falha(s)` : '\n\u2705 Consolidado OK');
process.exit(fail ? 1 : 0);
