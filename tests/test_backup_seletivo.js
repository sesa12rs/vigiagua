/* Testa a filtragem por escopo da importação seletiva (fatia 6).
   Carrega planner.html num JSDOM e exercita _filtrarRegistros / _municipiosNoBackup
   / _municipioDaChave / _ehChaveMunicipio, além de um smoke do modal. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

let fail = 0;
function check(nome, cond, extra) {
  if (cond) console.log('  \u2705 ' + nome);
  else { console.log('  \u274c ' + nome + (extra !== undefined ? '  ' + extra : '')); fail++; }
}

let h = fs.readFileSync('planner.html', 'utf8').replace(/<script[^>]*src="https?:\/\/[^"]*"[^>]*><\/script>/g, '');
const dom = new JSDOM(h, { url: 'http://localhost/planner.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
const w = dom.window;
w.HTMLElement.prototype.scrollIntoView = function () {};
w.scrollTo = () => {};
w.localStorage.setItem('va_session', JSON.stringify({ userId: 1, perfil: 'regional', nome: 'R', municipioId: null }));
const EXPOSE = '\n;try{window.DB=DB}catch(e){};try{window.Utils=Utils}catch(e){}';
for (const s of [...h.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1])) w.eval(fs.readFileSync(s, 'utf8') + EXPOSE);
for (const c of [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])) w.eval(c);
w.confirm = () => true; w.mostrarToast = () => {}; w.alert = () => {};

// Backup fictício: planejamento + 2 municípios (um deles com nome composto/acento)
const registros = {
  'va_config': { a: 1 },
  'va_feriados': { nacionais: [] },
  'va_planos_index': [2027],
  'va_semanas_2027': [true, false],
  'va_plano_2027': { status: 'publicado' },
  'va_munplano_Altônia_2027': { v: 1 },
  'va_previewedit_Altônia_2027': '<p>x</p>',
  'va_munplano_São Jorge do Patrocínio_2027': { v: 1 },
  'va_previewedit_São Jorge do Patrocínio_2026': '<p>y</p>',
};
w.__reg = registros;

console.log('[Classificação de chaves]');
check('va_config NÃO é município', w.eval('_ehChaveMunicipio("va_config")') === false);
check('va_munplano_* é município', w.eval('_ehChaveMunicipio("va_munplano_Altônia_2027")') === true);
check('va_previewedit_* é município', w.eval('_ehChaveMunicipio("va_previewedit_Altônia_2027")') === true);
check('nome simples extraído', w.eval('_municipioDaChave("va_munplano_Altônia_2027")') === 'Altônia');
check('nome composto (com espaços) extraído', w.eval('_municipioDaChave("va_munplano_São Jorge do Patrocínio_2027")') === 'São Jorge do Patrocínio');
check('previewedit de ano diferente também extrai', w.eval('_municipioDaChave("va_previewedit_São Jorge do Patrocínio_2026")') === 'São Jorge do Patrocínio');

console.log('\n[Municípios no backup]');
const muns = w.eval('_municipiosNoBackup(window.__reg)');
check('lista os 2 municípios (dedup)', muns.length === 2 && muns.includes('Altônia') && muns.includes('São Jorge do Patrocínio'), JSON.stringify(muns));

console.log('\n[Escopo: tudo]');
const tudo = w.eval('_filtrarRegistros(window.__reg, "tudo", [])');
check('inclui todas as 9 chaves', Object.keys(tudo).length === 9);

console.log('\n[Escopo: planejamento]');
const plan = w.eval('_filtrarRegistros(window.__reg, "planejamento", [])');
const planKeys = Object.keys(plan);
check('inclui config/feriados/index/semanas/plano (5)', planKeys.length === 5);
check('NÃO inclui nenhuma chave de município', planKeys.every(k => !k.startsWith('va_munplano_') && !k.startsWith('va_previewedit_')));
check('inclui va_plano_2027', planKeys.includes('va_plano_2027'));

console.log('\n[Escopo: municípios (só Altônia)]');
const soAlt = w.eval('_filtrarRegistros(window.__reg, "municipios", ["Altônia"])');
const altKeys = Object.keys(soAlt);
check('inclui só as 2 chaves de Altônia', altKeys.length === 2 && altKeys.every(k => k.includes('Altônia')));
check('NÃO inclui planejamento', altKeys.every(k => k.startsWith('va_munplano_') || k.startsWith('va_previewedit_')));
check('NÃO inclui o outro município', altKeys.every(k => !k.includes('São Jorge')));

console.log('\n[Escopo: municípios (São Jorge — 2 anos diferentes)]');
const soSJ = w.eval('_filtrarRegistros(window.__reg, "municipios", ["São Jorge do Patrocínio"])');
check('pega munplano 2027 e previewedit 2026', Object.keys(soSJ).length === 2);

console.log('\n[Smoke do modal de restauração]');
w.__meta = { quando: 'hoje', total: 9 };
w.eval('_restoreRegistros = window.__reg; _restoreMeta = window.__meta; abrirModalRestore();');
check('modal abriu', w.document.getElementById('modalRestore').classList.contains('open'));
check('lista de municípios renderizada (2 checkboxes)', w.document.querySelectorAll('.restore-mun-chk').length === 2);
// seleciona escopo municípios + marca Altônia
w.document.querySelector('input[name="restoreEscopo"][value="municipios"]').checked = true;
w.eval('onRestoreEscopoChange()');
check('caixa de municípios visível ao escolher escopo', w.document.getElementById('restoreMunBox').style.display !== 'none');
w.document.querySelector('.restore-mun-chk').checked = true;
w.eval('_atualizarResumoRestore()');
check('resumo mostra contagem de chaves', /chave\(s\)/.test(w.document.getElementById('restoreResumo').textContent));
check('seletor de exportação por município populado', (function(){ w.eval('_backupInfo()'); return w.document.getElementById('expMunicipio').options.length > 1; })());

console.log(fail ? `\n\u274c ${fail} falha(s)` : '\n\u2705 Backup seletivo OK');
process.exit(fail ? 1 : 0);
