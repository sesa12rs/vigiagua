/*
 * Regras de tipo de sistema (SAA / SAC / SAI) no módulo municipal.
 *   node tests/test_sistemas.js
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function loadPage(file, { session, seedStorage = {} }) {
  let html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  html = html.replace(/<script[^>]*src="https?:\/\/[^"]*"[^>]*><\/script>/g, '');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.detail || e.message || String(e)));
  const dom = new JSDOM(html, { url: 'http://localhost/' + file, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
  for (const [k, v] of Object.entries(seedStorage)) window.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  if (session) window.localStorage.setItem('va_session', JSON.stringify(session));
  const srcs   = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  try {
    for (const s of srcs) window.eval(fs.readFileSync(path.join(ROOT, s), 'utf8') + '\n;try{window.DB=DB}catch(e){};try{window.Utils=Utils}catch(e){};try{window.Planner=Planner}catch(e){};');
    for (const code of inline) window.eval(code);
  } catch (e) { errors.push('INIT: ' + e.message); }
  return { window, errors };
}

const sessRegional  = { userId: 1,   perfil: 'regional',  nome: 'Reg',     municipioId: null };
const sessMunicipio = { userId: 102, perfil: 'municipio', nome: 'Altônia', municipioId: 3 };

let fail = 0;
const check = (label, cond, extra = '') => { console.log((cond ? '  \u2705 ' : '  \u274c ') + label + (cond ? '' : '  ' + extra)); if (!cond) fail++; };

const a = loadPage('planner.html', { session: sessRegional });
a.window.confirm = () => true; a.window.alert = () => {};
a.window.eval('selecionarAno(2027); gerarPlano(); publicarAno(2027);');
const seed = {};
for (let i = 0; i < a.window.localStorage.length; i++) { const k = a.window.localStorage.key(i); seed[k] = a.window.localStorage.getItem(k); }

const m = loadPage('municipio.html', { session: sessMunicipio, seedStorage: seed });
m.window.alert = () => {};
const doc = m.window.document;
['populacao','endereco','secretario','responsavel','profissional','vigilancia'].forEach((id,i) => { doc.getElementById(id).value = i === 0 ? '20500' : (id === 'vigilancia' ? 'Vigilância Ambiental' : 'X'); });
doc.getElementById('municipio').value = 'Altônia';
m.window.eval('irEtapa2()');

const tbody = doc.getElementById('corpoTabela');
const primeira = () => tbody.querySelector('tr:not([data-linked])');
const estado = tr => { const g = c => { const e = tr.querySelector(c); return { checked: e.checked, disabled: e.disabled }; }; return { sistema: tr.querySelector('.sistema-select').value, mb: g('.mb-chk'), tb: g('.tb-chk'), cr: g('.cr-chk'), fl: g('.fl-chk') }; };
const nDerivadas = () => tbody.querySelectorAll('tr[data-linked]').length;
function setSistema(tr, v) { const s = tr.querySelector('.sistema-select'); s.value = v; m.window.aplicarRegrasSistema(tr); }
function setCR(tr, val) { const cr = tr.querySelector('.cr-chk'); cr.checked = val; cr.dispatchEvent(new m.window.Event('change')); }

check('tabela gerada com linhas', tbody.querySelectorAll('tr').length > 0);

console.log('\n[SAA]');
{ const tr = primeira(); setSistema(tr, 'SAA'); const e = estado(tr);
  check('MB marcado e travado', e.mb.checked && e.mb.disabled);
  check('TB marcado e travado', e.tb.checked && e.tb.disabled);
  check('CR marcado e travado', e.cr.checked && e.cr.disabled);
  check('FL marcado e livre',   e.fl.checked && !e.fl.disabled);
  check('sem linha derivada',   nDerivadas() === 0, `n=${nDerivadas()}`); }

console.log('\n[SAC]');
{ const tr = primeira(); setSistema(tr, 'SAC'); const e = estado(tr);
  check('MB/TB marcados e travados', e.mb.checked && e.mb.disabled && e.tb.checked && e.tb.disabled);
  check('CR marcado por padrão e livre', e.cr.checked && !e.cr.disabled);
  check('FL desmarcado e livre', !e.fl.checked && !e.fl.disabled);
  check('sem derivada (CR presente)', nDerivadas() === 0, `n=${nDerivadas()}`);
  setCR(tr, false);
  check('CR desmarcado gera 1 derivada', nDerivadas() === 1, `n=${nDerivadas()}`);
  const der = tbody.querySelector('tr[data-linked]'); const de = estado(der);
  check('derivada é SAA travado', de.sistema === 'SAA' && der.querySelector('.sistema-select').disabled);
  check('derivada só CR marcado', de.cr.checked && !de.mb.checked && !de.tb.checked && !de.fl.checked);
  check('derivada tudo travado', de.mb.disabled && de.tb.disabled && de.cr.disabled && de.fl.disabled);
  check('derivada numerada com -CR', /-CR$/.test(der.querySelector('.td-numero').textContent.trim()), der.querySelector('.td-numero').textContent);
  setCR(tr, true);
  check('CR remarcado remove a derivada', nDerivadas() === 0, `n=${nDerivadas()}`); }

console.log('\n[SAI]');
{ const tr = primeira(); setSistema(tr, 'SAI'); const e = estado(tr);
  check('MB/TB marcados e travados', e.mb.checked && e.mb.disabled && e.tb.checked && e.tb.disabled);
  check('CR desmarcado e livre', !e.cr.checked && !e.cr.disabled);
  check('FL desmarcado e livre', !e.fl.checked && !e.fl.disabled);
  check('SAI sem CR gera 1 derivada', nDerivadas() === 1, `n=${nDerivadas()}`);
  setSistema(tr, 'SAA');
  check('mudar para SAA remove a derivada', nDerivadas() === 0, `n=${nDerivadas()}`); }

console.log('\n[Sem duplicacao]');
{ const tr = primeira(); setSistema(tr, 'SAC'); setCR(tr, false);
  setSistema(tr, 'SAI'); setSistema(tr, 'SAC'); setCR(tr, false); setCR(tr, false);
  check('nunca cria mais de 1 derivada por linha', nDerivadas() === 1, `n=${nDerivadas()}`); }

console.log('\n[Coletas normais nao podem ser excluidas]');
{ const tr = primeira();
  check('linha normal (pai) nao tem botao de excluir', !tr.querySelector('.td-acao button, td:last-child button'));
  setSistema(tr, 'SAC'); setCR(tr, false);
  const der = tbody.querySelector('tr[data-linked]');
  check('linha derivada nao tem botao de excluir', !(der && der.querySelector('.td-acao button, td:last-child button')));
  const dPai = tr.querySelector('.data-input').value;
  const dDer = der.querySelector('.data-input');
  check('data da derivada herda a do pai', dDer.value === dPai, `${dDer.value} vs ${dPai}`);
  check('data da derivada e editavel', !dDer.disabled && !dDer.readOnly);
  setCR(tr, true); }

console.log('\n[Padrao de ID: NNN + SIGLA + ANO]');
{ m.window.eval('atualizarIDs()');
  const ids = [...tbody.querySelectorAll('tr:not([data-linked]) .td-id')].map(td => td.textContent).filter(t => t && t !== '\u2014');
  check('IDs no formato NNN+SIGLA+ANO (ex.: 001ALT2027)', ids.length > 0 && /^\d{3}ALT2027$/.test(ids[0]), ids[0]);
  check('primeiro ID e 001ALT2027', ids[0] === '001ALT2027', ids[0]); }

console.log('\n[Coletas EXTRAS sao livres]');
{ m.window.eval('adicionarColetaExtra()');
  const ex = doc.querySelector('#corpoTabelaExtras tr');
  check('extra criada', !!ex);
  const g = c => ex.querySelector(c).disabled;
  check('extra: MB livre', !g('.mb-chk'));
  check('extra: TB livre', !g('.tb-chk'));
  check('extra: CR livre', !g('.cr-chk'));
  check('extra: FL livre', !g('.fl-chk'));
  check('extra: sistema livre', !ex.querySelector('.sistema-select').disabled);
  const sel = ex.querySelector('.sistema-select'); sel.value = 'SAC'; m.window.aplicarRegrasSistema(ex);
  const crEx = ex.querySelector('.cr-chk'); crEx.checked = false; crEx.dispatchEvent(new m.window.Event('change'));
  check('extra SAC/SAI sem CR NAO gera derivada', doc.querySelectorAll('#corpoTabelaExtras tr[data-linked]').length === 0);
  check('extra tem botao de excluir', !!ex.querySelector('.td-acao button, td:last-child button'));
  m.window.eval('atualizarIDsExtras()');
  const idEx = ex.querySelector('.td-id').textContent;
  check('ID de extra no formato EX-001ALT2027', idEx === 'EX-001ALT2027', idEx);
  m.window.eval("excluirColetaExtra(document.querySelector('#corpoTabelaExtras tr'))");
  check('extra excluida', doc.querySelectorAll('#corpoTabelaExtras tr').length === 0); }

console.log(fail ? `\n\u274c ${fail} falha(s)` : '\n\u2705 Regras de sistema OK');
process.exit(fail ? 1 : 0);
