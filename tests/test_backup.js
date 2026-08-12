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

// "banco" Supabase falso + captura de upserts e deletes
const banco = {};
const upserts = [];
const deletes = [];
global.window = {
  VIGIAGUA_SUPABASE: { url: 'https://x.supabase.co', anonKey: 'k' },
  mostrarToast() {},
  supabase: {
    createClient: () => ({
      auth: { getSession: async () => ({ data: { session: { user: { id: 'reg1', email: 'regional@vigiagua.pr.gov.br' } } } }) },
      from: () => ({
        select: async () => ({ data: Object.entries(banco).map(([key, value]) => ({ key, value })), error: null }),
        upsert: async (rows) => { (Array.isArray(rows) ? rows : [rows]).forEach(r => { banco[r.key] = r.value; upserts.push(r.key); }); return { error: null }; },
        delete: () => ({ eq: async (_col, key) => { delete banco[key]; deletes.push(key); return { error: null }; } }),
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

  console.log('\n[Excluir plano em CASCATA sincroniza a deleção de tudo]');
  {
    // Ano 2028: plano + semanas + 2 municípios (munplano + previewedit)
    const seed = {
      'va_plano_2028': JSON.stringify({ cfg: { ano: 2028 }, status: 'publicado' }),
      'va_semanas_2028': JSON.stringify([true, false]),
      'va_munplano_Altônia_2028': JSON.stringify({ v: 1 }),
      'va_previewedit_Altônia_2028': JSON.stringify({ b: [] }),
      'va_munplano_Umuarama_2028': JSON.stringify({ v: 1 }),
    };
    Object.entries(seed).forEach(([k, v]) => { banco[k] = v; localStorage.setItem(k, v); });
    localStorage.setItem('va_planos_index', JSON.stringify([2028]));
    deletes.length = 0;

    check('conta 2 municípios com dados no ano', DB.Plano.municipiosComDados(2028) === 2, String(DB.Plano.municipiosComDados(2028)));
    DB.Plano.excluir(2028);
    await new Promise(r => setTimeout(r, 80));

    const esperadas = Object.keys(seed);
    check('todas as peças removidas do cache local', esperadas.every(k => localStorage.getItem(k) === null));
    check('DELETE remoto de plano+semanas+munplano+previewedit', esperadas.every(k => deletes.includes(k)), JSON.stringify(deletes));
    check('nada do ano 2028 sobrou no banco', !Object.keys(banco).some(k => k.endsWith('_2028') || k === 'va_plano_2028' || k === 'va_semanas_2028'));
    check('índice não contém mais 2028', !JSON.parse(localStorage.getItem('va_planos_index')).includes(2028));
  }

  console.log('\n[Limpeza de dados órfãos]');
  {
    // Anos SEM plano com peças soltas + 1 ano COM plano (não deve ser tocado)
    localStorage.setItem('va_plano_2027', JSON.stringify({ cfg: { ano: 2027 }, status: 'publicado' }));
    localStorage.setItem('va_planos_index', JSON.stringify([2027]));
    localStorage.setItem('va_semanas_2027', JSON.stringify([true]));        // legítimo (2027 tem plano)
    localStorage.setItem('va_munplano_Altônia_2027', JSON.stringify({ v: 1 })); // legítimo
    localStorage.setItem('va_semanas_2035', JSON.stringify([true]));        // órfão
    localStorage.setItem('va_munplano_Altônia_2035', JSON.stringify({ v: 1 })); // órfão
    localStorage.setItem('va_previewedit_Umuarama_2040', JSON.stringify({ b: [] })); // órfão
    deletes.length = 0;

    const o = DB.Plano.orfaos();
    check('detecta 3 órfãos (2 em 2035, 1 em 2040)', o.total === 3, JSON.stringify(o));
    check('anos órfãos = 2035, 2040', o.anos.join(',') === '2035,2040', o.anos.join(','));
    check('NÃO marca as peças de 2027 (tem plano)', !o.chaves.some(k => k.endsWith('_2027')));

    DB.Plano.limparOrfaos();
    await new Promise(r => setTimeout(r, 60));
    check('órfãos removidos do cache', localStorage.getItem('va_semanas_2035') === null && localStorage.getItem('va_previewedit_Umuarama_2040') === null);
    check('órfãos deletados no Supabase', deletes.includes('va_semanas_2035') && deletes.includes('va_previewedit_Umuarama_2040'));
    check('peças de 2027 PRESERVADAS', localStorage.getItem('va_semanas_2027') !== null && localStorage.getItem('va_munplano_Altônia_2027') !== null);
    check('nada de 2027 foi deletado', !deletes.some(k => k.endsWith('_2027')));
  }

  console.log('\n[Limpeza de cache na troca de usuário / logout (fatia 3)]');
  {
    // Cache do usuário anterior + token de login + lembrete de backup
    localStorage.setItem('va_session', JSON.stringify({ userId: 1, perfil: 'regional', municipioId: null }));
    localStorage.setItem('va_plano_2027', JSON.stringify({ ok: true }));
    localStorage.setItem('va_munplano_Altônia_2027', JSON.stringify({ v: 1 }));
    localStorage.setItem('va_ultimo_backup', '2026-08-01');
    localStorage.setItem('sb-xyz-auth-token', 'TOKEN123');   // token do Supabase (não é va_)
    banco['va_plano_2027'] = JSON.stringify({ ok: true });    // continua no banco
    deletes.length = 0;

    const n = DB.limparCacheDados();
    check('removeu as chaves va_ de dados', localStorage.getItem('va_plano_2027') === null && localStorage.getItem('va_munplano_Altônia_2027') === null && localStorage.getItem('va_session') === null);
    check('preservou o lembrete de backup (va_ultimo_backup)', localStorage.getItem('va_ultimo_backup') === '2026-08-01');
    check('preservou o token de login do Supabase', localStorage.getItem('sb-xyz-auth-token') === 'TOKEN123');
    check('NÃO deletou nada no banco (é só cache local)', deletes.length === 0 && 'va_plano_2027' in banco, `deletes=${deletes.length}`);
    check('retornou a contagem do que limpou (≥ 3)', n >= 3, String(n));
  }

  console.log(fail ? `\n\u274c ${fail} falha(s)` : '\n\u2705 Backup/restauração OK');
  process.exit(fail ? 1 : 0);
})();
