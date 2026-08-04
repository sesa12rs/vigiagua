/* Backup e restauração (item 4, parte A):
   Sync.exportar / Sync.importar com um cliente Supabase falso.
   node tests/test_backup.js
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, cond, extra = '') => {
  console.log((cond ? '  \u2705 ' : '  \u274c ') + label + (cond ? '' : '  ' + extra));
  if (!cond) fail++;
};

// localStorage falso (com length/key, usados pelo exportar local)
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  get length() { return Object.keys(store).length; },
  key: i => Object.keys(store)[i],
};

// "banco" Supabase falso + captura de upserts
const banco = {};
const upserts = [];
global.window = {
  VIGIAGUA_SUPABASE: { url: 'https://x.supabase.co', anonKey: 'k' },
  mostrarToast() {},
  supabase: {
    createClient: () => ({
      auth: { getSession: async () => ({ data: { session: { user: { id: 'reg1', email: 'regional@vigiagua.pr.gov.br' } } } }) },
      from: () => ({
        select: async () => ({ data: Object.entries(banco).map(([key, value]) => ({ key, value })), error: null }),
        upsert: async (rows) => { (Array.isArray(rows) ? rows : [rows]).forEach(r => { banco[r.key] = r.value; upserts.push(r.key); }); return { error: null }; },
        delete: () => ({ eq: async () => ({ error: null }) }),
      }),
    }),
  },
};

const L = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
(0, eval)(L('js/utils.js') + '\nglobalThis.Utils = Utils;');
(0, eval)(L('js/data.js')  + '\nglobalThis.DB = DB;');

check('Sync habilitado (config + lib falsa)', DB.Sync.habilitado() === true);

// Popular o "banco" com dados oficiais (planejamento + planos municipais)
banco['va_config']                  = JSON.stringify({ ano: 2027 });
banco['va_planos_index']            = JSON.stringify([2027]);
banco['va_plano_2027']              = JSON.stringify({ ok: true, status: 'publicado' });
banco['va_semanas_2027']            = JSON.stringify([true, false]);
banco['va_munplano_Altônia_2027']   = JSON.stringify({ v: 1, normais: [{ local: 'A' }] });
banco['va_munplano_Umuarama_2027']  = JSON.stringify({ v: 1, normais: [{ local: 'B' }] });
banco['va_previewedit_Altônia_2027'] = JSON.stringify({ blocos: [] });

(async () => {
  console.log('\n[Exportar]');
  const exp = await DB.Sync.exportar();
  check('exportar ok, origem supabase', exp.ok && exp.origem === 'supabase');
  check('total = nº de chaves do banco (7)', exp.total === 7, `total=${exp.total}`);
  check('inclui planejamento (va_plano_2027)', 'va_plano_2027' in exp.registros);
  check('inclui plano municipal (va_munplano_Altônia_2027)', 'va_munplano_Altônia_2027' in exp.registros);
  check('valor preservado no export', JSON.parse(exp.registros['va_munplano_Altônia_2027']).normais[0].local === 'A');

  // Guarda o backup e simula PERDA total dos dados
  const backup = JSON.parse(JSON.stringify(exp.registros));
  for (const k of Object.keys(banco)) delete banco[k];
  upserts.length = 0;
  check('banco esvaziado (simula perda)', Object.keys(banco).length === 0);

  console.log('\n[Restaurar]');
  const imp = await DB.Sync.importar(backup);
  check('importar ok', imp.ok, JSON.stringify(imp));
  check('total restaurado = 7', imp.total === 7, `total=${imp.total}`);
  check('banco repovoado com as 7 chaves', Object.keys(banco).length === 7);
  check('PLANO MUNICIPAL restaurado pela Regional (va_munplano_*)', 'va_munplano_Altônia_2027' in banco && upserts.includes('va_munplano_Altônia_2027'));
  check('valor íntegro após restauração', JSON.parse(banco['va_munplano_Umuarama_2027']).normais[0].local === 'B');
  check('cache local também recebeu as chaves', localStorage.getItem('va_config') !== null);

  console.log('\n[Filtro de chaves sincronizáveis]');
  upserts.length = 0;
  const impFiltro = await DB.Sync.importar({ 'va_config': JSON.stringify({ ano: 2028 }), 'lixo_naosync': 'x', '': 'y' });
  check('só chaves sincronizáveis são gravadas (1)', impFiltro.total === 1, `total=${impFiltro.total}`);
  check('chave estranha NÃO foi ao banco', !upserts.includes('lixo_naosync') && !('lixo_naosync' in banco));
  check('chave estranha NÃO foi ao cache', localStorage.getItem('lixo_naosync') === null);

  console.log('\n[Backup inválido]');
  const ruim = await DB.Sync.importar(null);
  check('importar(null) retorna erro', ruim.ok === false);

  console.log('\n[Exportar em modo local (sem Supabase)]');
  const supabaseBackup = window.supabase;
  window.supabase = undefined;                 // desabilita Supabase
  store['va_munplano_Tapira_2027'] = JSON.stringify({ v: 1 });
  store['va_session'] = JSON.stringify({ perfil: 'regional' }); // não sincronizável → não deve entrar
  const expLocal = await DB.Sync.exportar();
  check('export local ok, origem local', expLocal.ok && expLocal.origem === 'local');
  check('export local pega chaves va_ sincronizáveis', 'va_munplano_Tapira_2027' in expLocal.registros);
  check('export local ignora va_session (não sincronizável)', !('va_session' in expLocal.registros));
  window.supabase = supabaseBackup;

  console.log(fail ? `\n\u274c ${fail} falha(s)` : '\n\u2705 Backup/restauração OK');
  process.exit(fail ? 1 : 0);
})();
