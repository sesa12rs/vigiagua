/* Aba Laboratório (item 2, fatia 1):
   - Relatorios.dadosLaboratorio / csvResumoSemanal  (Node puro)
   - render da aba (carga SVG, heatmap, romaneio, badge, estado vazio)  (jsdom)
   node tests/test_laboratorio.js
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
(0, eval)(L('js/planner.js')    + '\nglobalThis.Planner = Planner;');
(0, eval)(L('js/relatorios.js') + '\nglobalThis.Relatorios = Relatorios;');

function rodar(ano, capacidade) {
  const cfg = { ...DB.Config.PADRAO, ano, capacidade };
  const municipios = DB.Municipios.listar();
  const feriados   = DB.Feriados.carregar();
  const tercas = Utils.tercasFeirasDoAno(ano);
  const semanasAtivas = tercas.map(t => { const m = t.getMonth() + 1; return !(m === 1 || m === 12); });
  return Planner.gerar(cfg, municipios, tercas, semanasAtivas, feriados);
}

console.log('\n[dadosLaboratorio — estrutura e totais]');
const p = rodar(2027, 55);
const d = Relatorios.dadosLaboratorio(p);
check('retorna dados', !!d);
check('ano correto', d.ano === 2027);
check('capacidade repassada', d.capacidade === 55);
{
  const somaA = d.semanas.reduce((a, s) => a + s.totalA, 0);
  check('soma tipo A das semanas = total distribuído do plano', somaA === p.totalDist, `${somaA} vs ${p.totalDist}`);
  const okB = d.semanas.every(s => s.totalB === s.totalA && s.totalFrascos === s.totalA * 2);
  check('tipo B espelha A e frascos = A×2', okB);
  const okMun = d.semanas.every(s => s.municipios.length === s.nMun && s.municipios.every(m => m.qtd > 0));
  check('cada viagem lista municípios com qtd > 0', okMun);
  check('só semanas com coleta entram (todas totalA > 0)', d.semanas.every(s => s.totalA > 0));
}

console.log('\n[Heatmap — matriz coerente com o plano]');
{
  check('21 linhas (municípios)', d.heatmap.linhas.length === 21, `n=${d.heatmap.linhas.length}`);
  check('colunas = nº de semanas com coleta', d.heatmap.colunas.length === d.semanas.length);
  const col0 = d.heatmap.colunas[0].idx;
  check('célula [0][0] bate com dist do plano', d.heatmap.linhas[0].celulas[0] === p.dist[0][col0]);
  const linhaSoma = d.heatmap.linhas[0].celulas.reduce((a, b) => a + b, 0);
  check('total da linha = soma das células', d.heatmap.linhas[0].total === linhaSoma);
  check('total da linha = meta do município (100% das metas)', d.heatmap.linhas[0].total === p.municipios[0].meta, `${d.heatmap.linhas[0].total} vs ${p.municipios[0].meta}`);
}

console.log('\n[Capacidade]');
{
  check('nenhuma semana acima da capacidade 55', d.semanas.every(s => s.totalA <= 55));
  const dLivre = Relatorios.dadosLaboratorio(rodar(2027, null));
  check('sem capacidade: campo null e ainda gera dados', dLivre.capacidade === null && dLivre.semanas.length > 0);
}

console.log('\n[CSV resumo semanal]');
{
  const csv = Relatorios.csvResumoSemanal(d);
  const linhas = csv.trim().split('\n');
  check('cabeçalho correto', linhas[0] === 'Semana,Data,Municipios,Amostras_TipoA,Amostras_TipoB,Total_Frascos');
  check('uma linha por semana', linhas.length === d.semanas.length + 1, `${linhas.length - 1} vs ${d.semanas.length}`);
  check('linha com 6 colunas', linhas[1].split(',').length === 6);
}

console.log('\n[Plano inexistente]');
check('dadosLaboratorio(null) = null', Relatorios.dadosLaboratorio(null) === null);
check('dadosLaboratorio({ok:false}) = null', Relatorios.dadosLaboratorio({ ok: false }) === null);

/* ══════════════════ PARTE B — render da aba (jsdom) ══════════════════ */
console.log('\n[Aba Laboratório — render no planner]');
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
a.window.eval('selecionarAno(2027); gerarPlano(); publicarAno(2027); trocarTab(4);');
const doc = a.window.document;

check('sem erros de jsdom no render', a.errs.length === 0, a.errs.slice(0, 2).join(' | '));
check('badge = nº de semanas (numérico)', /^\d+$/.test(doc.getElementById('badgeLaboratorio').textContent));
check('histograma renderizou (svg + barras)', doc.querySelectorAll('#labCarga svg rect').length > 0);
check('linha de capacidade presente (traço vermelho)', /stroke-dasharray/.test(doc.getElementById('labCarga').innerHTML));
check('heatmap com 21 municípios + linha de total', doc.querySelectorAll('#labHeatmap table.lab-heat tbody tr').length === 22);
check('romaneio com viagens', doc.querySelectorAll('#labRomaneio > div > div').length > 0);
check('conteúdo visível, estado vazio oculto', doc.getElementById('labConteudo').style.display !== 'none' && doc.getElementById('labVazio').style.display === 'none');

// Ano sem plano → estado vazio
a.window.eval("labTrocarAno('2035')");
check('ano sem plano → estado vazio exibido', doc.getElementById('labVazio').style.display !== 'none');
check('ano sem plano → conteúdo oculto e badge —', doc.getElementById('labConteudo').style.display === 'none' && doc.getElementById('badgeLaboratorio').textContent === '—');

console.log(fail ? `\n\u274c ${fail} falha(s)` : '\n\u2705 Laboratório OK');
process.exit(fail ? 1 : 0);
