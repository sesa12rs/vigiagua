/**
 * VigiÁgua — Camada de Dados (data.js)  v3.0
 *
 * Chaves do localStorage:
 *   va_session        — sessão do usuário logado
 *   va_municipios     — cadastro de municípios, metas e regras individuais
 *   va_config         — configurações globais do planner (inclui prazoEdicao 'MM-DD')
 *   va_semanas_YYYY   — estado das semanas do ano YYYY
 *   va_feriados       — feriados cadastrados (extras)
 *   va_plano_YYYY     — plano do ano YYYY (formato multi-ano, v3)
 *   va_planos_index   — lista de anos com plano salvo
 *   va_plano          — plano legado v2 (migrado automaticamente)
 *   va_usuarios       — usuários cadastrados
 *
 * Fase 2: substituir implementações por chamadas Supabase apenas aqui.
 */

const DB = (() => {

  function get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  let _syncRef = null;   // preenchido no fim do módulo (evita TDZ durante a carga)
  function set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
    if (_syncRef) _syncRef.notify(key);
  }

  /* ══════════════════════════════════════════════
     DEFAULTS
     ══════════════════════════════════════════════ */

  /**
   * Regras individuais padrão — herdadas das configurações globais.
   * Cada campo null = "herdar global".
   */
  const REGRAS_PADRAO_MUN = {
    modoEntrega:    'herdar',   // 'herdar' | 'exato' | 'intervalo'
    entregaExata:   null,       // número (quando modoEntrega='exato')
    entregaMin:     null,       // número (quando modoEntrega='intervalo')
    entregaMax:     null,       // número (quando modoEntrega='intervalo')
    periodicidade:  'herdar',   // 'herdar' | 'livre' | '1xmes' | '2xmes' | '3xmes'
    pisoMensal:     null,       // null = herdar global
    multiplicadorTeto: null,    // null = herdar global
  };

  const MUNICIPIOS_PADRAO = [
    { id: 1,  nome: 'Alto Paraíso',            meta: 72,  regras: { ...REGRAS_PADRAO_MUN } },
    { id: 2,  nome: 'Alto Piquiri',             meta: 108, regras: { ...REGRAS_PADRAO_MUN } },
    { id: 3,  nome: 'Altônia',                  meta: 132, regras: { ...REGRAS_PADRAO_MUN } },
    { id: 4,  nome: 'Brasilândia do Sul',       meta: 72,  regras: { ...REGRAS_PADRAO_MUN } },
    { id: 5,  nome: 'Cafezal do Sul',           meta: 72,  regras: { ...REGRAS_PADRAO_MUN } },
    { id: 6,  nome: 'Cruzeiro do Oeste',        meta: 132, regras: { ...REGRAS_PADRAO_MUN } },
    { id: 7,  nome: 'Douradina',                meta: 108, regras: { ...REGRAS_PADRAO_MUN } },
    { id: 8,  nome: 'Esperança Nova',           meta: 72,  regras: { ...REGRAS_PADRAO_MUN } },
    { id: 9,  nome: 'Francisco Alves',          meta: 108, regras: { ...REGRAS_PADRAO_MUN } },
    { id: 10, nome: 'Icaraíma',                 meta: 108, regras: { ...REGRAS_PADRAO_MUN } },
    { id: 11, nome: 'Iporã',                    meta: 120, regras: { ...REGRAS_PADRAO_MUN } },
    { id: 12, nome: 'Ivaté',                    meta: 108, regras: { ...REGRAS_PADRAO_MUN } },
    { id: 13, nome: 'Maria Helena',             meta: 108, regras: { ...REGRAS_PADRAO_MUN } },
    { id: 14, nome: 'Mariluz',                  meta: 108, regras: { ...REGRAS_PADRAO_MUN } },
    { id: 15, nome: 'Nova Olímpia',             meta: 108, regras: { ...REGRAS_PADRAO_MUN } },
    { id: 16, nome: 'Perobal',                  meta: 108, regras: { ...REGRAS_PADRAO_MUN } },
    { id: 17, nome: 'Pérola',                   meta: 120, regras: { ...REGRAS_PADRAO_MUN } },
    { id: 18, nome: 'São Jorge do Patrocínio',  meta: 108, regras: { ...REGRAS_PADRAO_MUN } },
    { id: 19, nome: 'Tapira',                   meta: 108, regras: { ...REGRAS_PADRAO_MUN } },
    { id: 20, nome: 'Umuarama',                 meta: 265, regras: { ...REGRAS_PADRAO_MUN } },
    { id: 21, nome: 'Xambrê',                   meta: 108, regras: { ...REGRAS_PADRAO_MUN } },
  ];

  const FERIADOS_PADRAO = {
    nacionais: [],   // extras além dos automáticos
    estaduais: [],
    municipais: {
      'Alto Paraíso':            [{ mes: 5,  dia: 9  }, { mes: 5,  dia: 13 }],
      'Alto Piquiri':            [{ mes: 3,  dia: 19 }, { mes: 7,  dia: 25 }, { mes: 8,  dia: 15 }],
      'Altônia':                 [{ mes: 1,  dia: 20 }, { mes: 12, dia: 8  }, { mes: 12, dia: 12 }],
      'Brasilândia do Sul':      [{ mes: 1,  dia: 1  }, { mes: 6,  dia: 12 }],
      'Cafezal do Sul':          [{ mes: 6,  dia: 24 }, { mes: 7,  dia: 20 }],
      'Cruzeiro do Oeste':       [{ mes: 5,  dia: 13 }, { mes: 8,  dia: 12 }, { mes: 8,  dia: 26 }],
      'Douradina':               [{ mes: 1,  dia: 17 }, { mes: 2,  dia: 1  }],
      'Esperança Nova':          [{ mes: 6,  dia: 13 }, { mes: 12, dia: 21 }],
      'Francisco Alves':         [{ mes: 3,  dia: 1  }, { mes: 10, dia: 31 }],
      'Icaraíma':                [{ mes: 7,  dia: 25 }, { mes: 8,  dia: 15 }],
      'Iporã':                   [{ mes: 6,  dia: 13 }, { mes: 10, dia: 12 }, { mes: 10, dia: 31 }],
      'Ivaté':                   [{ mes: 5,  dia: 2  }, { mes: 8,  dia: 15 }],
      'Maria Helena':            [{ mes: 7,  dia: 25 }, { mes: 8,  dia: 15 }, { mes: 11, dia: 27 }],
      'Mariluz':                 [{ mes: 6,  dia: 13 }, { mes: 11, dia: 29 }],
      'Nova Olímpia':            [{ mes: 8,  dia: 6  }, { mes: 11, dia: 13 }, { mes: 12, dia: 8  }],
      'Perobal':                 [{ mes: 4,  dia: 29 }, { mes: 6,  dia: 26 }, { mes: 6,  dia: 29 }, { mes: 10, dia: 4 }],
      'Pérola':                  [{ mes: 5,  dia: 13 }, { mes: 9,  dia: 14 }],
      'São Jorge do Patrocínio': [{ mes: 6,  dia: 22 }, { mes: 8,  dia: 12 }],
      'Tapira':                  [{ mes: 1,  dia: 20 }, { mes: 2,  dia: 2  }, { mes: 11, dia: 15 }],
      'Umuarama':                [{ mes: 6,  dia: 26 }, { mes: 8,  dia: 15 }, { mes: 10, dia: 4  }],
      'Xambrê':                  [{ mes: 7,  dia: 16 }, { mes: 7,  dia: 25 }],
    }
  };

  /**
   * Configurações globais do planner.
   *
   * Campos de entrega e municípios por viagem usam modo + valores:
   *   modo 'exato'     → usa xxxExato
   *   modo 'intervalo' → usa xxxMin + xxxMax
   */
  const CONFIG_PADRAO = {
    ano: 2026,

    // ── Capacidade do laboratório (frascos tipo A) POR SEMANA ──
    // Restrição real: o teto (exato ou máx) é respeitado pelo nivelamento.
    modoCapacidade:  'exato',   // 'exato' | 'intervalo'
    capacidadeExata: 55,
    capacidadeMin:   45,
    capacidadeMax:   55,

    // ── Alerta de frascos POR SEMANA (poucos/muitos) — apenas aviso ──
    modoAlerta:  'exato',       // 'exato' | 'intervalo'
    alertaExata: 48,
    alertaMin:   45,
    alertaMax:   55,

    // P4 — Frascos por município POR SEMANA
    modoEntrega:  'intervalo',  // 'exato' | 'intervalo'
    entregaExata: 5,
    entregaMin:   4,
    entregaMax:   9,

    // P6 — Municípios POR SEMANA
    modoMunicipios:  'exato',   // 'exato' | 'intervalo'
    municipiosExato: 10,
    municipiosMin:   6,
    municipiosMax:   12,

    // P7 — Teto mensal (multiplicador da média; null = desativado)
    multiplicadorTeto: 2,

    // P8 — Piso mensal (participações mínimas por mês; null = desativado)
    pisoMensal: 1,

    // ── Campos derivados (recalculados em lerConfig; mantidos p/ compatibilidade) ──
    capacidade:    55,   // teto semanal efetivo
    capacidadePiso: 45,  // piso semanal alvo (intervalo) — null no modo exato
    alvoMin: 48,         // "poucos frascos" efetivo
    alvoMax: null,       // "muitos frascos" efetivo
  };

  const USUARIOS_PADRAO = [
    {
      id: 1, nome: '12ª Regional de Saúde',
      email: 'regional@vigiagua.pr.gov.br', senha: 'regional123',
      perfil: 'regional', municipioId: null,
    },
    ...MUNICIPIOS_PADRAO.map((m, i) => ({
      id: 100 + i,
      nome: `Gestor — ${m.nome}`,
      email: `${m.nome.toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'.').replace(/[^a-z.]/g,'')}@vigiagua.pr.gov.br`,
      senha: 'municipio123', perfil: 'municipio', municipioId: m.id,
    }))
  ];

  /* ══════════════════════════════════════════════
     AUTH
     ══════════════════════════════════════════════ */
  const Auth = {
    login(email, senha) {
      const u = DB.Usuarios.listar().find(u =>
        u.email.toLowerCase() === email.toLowerCase() && u.senha === senha
      );
      if (!u) return { ok: false, erro: 'E-mail ou senha inválidos.' };
      const sessao = { userId: u.id, perfil: u.perfil, nome: u.nome, municipioId: u.municipioId };
      set('va_session', sessao);
      return { ok: true, sessao };
    },
    logout()      { localStorage.removeItem('va_session'); },
    sessaoAtual() { return get('va_session'); },
    exigirPerfil(perfil, url = 'index.html') {
      const s = this.sessaoAtual();
      if (!s || s.perfil !== perfil) { window.location.href = url; }
      return s;
    },
    exigirLogin(url = 'index.html') {
      const s = this.sessaoAtual();
      if (!s) { window.location.href = url; }
      return s;
    },
  };

  /* ══════════════════════════════════════════════
     USUÁRIOS
     ══════════════════════════════════════════════ */
  const Usuarios = {
    listar() { return get('va_usuarios') || USUARIOS_PADRAO; },
    salvar(lista) { set('va_usuarios', lista); },
  };

  /* ══════════════════════════════════════════════
     MUNICÍPIOS
     ══════════════════════════════════════════════ */
  const Municipios = {
    listar() {
      const saved = get('va_municipios');
      if (!saved) return JSON.parse(JSON.stringify(MUNICIPIOS_PADRAO));
      // Garantir que todos têm o campo regras (migração de versão anterior)
      return saved.map(m => ({
        ...m,
        regras: { ...REGRAS_PADRAO_MUN, ...(m.regras || {}) }
      }));
    },
    salvar(lista) {
      set('va_municipios', lista);
      /* TODO Fase 2: await supabase.from('municipios').upsert(lista) */
    },
    resetar() { set('va_municipios', JSON.parse(JSON.stringify(MUNICIPIOS_PADRAO))); },
    buscarPorId(id)   { return this.listar().find(m => m.id === id)   || null; },
    buscarPorNome(n)  { return this.listar().find(m => m.nome === n)  || null; },
    REGRAS_PADRAO: REGRAS_PADRAO_MUN,
  };

  /* ══════════════════════════════════════════════
     CONFIG
     ══════════════════════════════════════════════ */
  const Config = {
    carregar() {
      const stored = get('va_config');
      const c = { ...CONFIG_PADRAO, ...(stored || {}) };
      // Instalação nova (sem config salva): usa o ano atual como padrão.
      if (!stored || stored.ano == null) c.ano = new Date().getFullYear();
      return c;
    },
    salvar(cfg) { set('va_config', cfg); },
    PADRAO: CONFIG_PADRAO,
  };

  /* ══════════════════════════════════════════════
     SEMANAS
     ══════════════════════════════════════════════ */
  const Semanas = {
    carregar(ano) { return get(`va_semanas_${ano}`) || null; },
    salvar(ano, estado) { set(`va_semanas_${ano}`, estado); },
  };

  /* ══════════════════════════════════════════════
     FERIADOS
     ══════════════════════════════════════════════ */
  const Feriados = {
    carregar() {
      const s = get('va_feriados');
      if (!s) return JSON.parse(JSON.stringify(FERIADOS_PADRAO));
      return {
        nacionais:  s.nacionais  || [],
        estaduais:  s.estaduais  || [],
        municipais: s.municipais || JSON.parse(JSON.stringify(FERIADOS_PADRAO.municipais)),
      };
    },
    salvar(f)  { set('va_feriados', f); },
    resetar()  { set('va_feriados', JSON.parse(JSON.stringify(FERIADOS_PADRAO))); },
  };

  /* ══════════════════════════════════════════════
     PLANO
     ══════════════════════════════════════════════ */
  const Plano = {

    /* ── Índice de anos ───────────────────────── */
    _index()      { return get('va_planos_index') || []; },
    _setIndex(a)  { set('va_planos_index', [...new Set(a)].map(Number).sort((x, y) => x - y)); },

    /* ── Migração do formato legado (va_plano) ── */
    _migrar() {
      const legado = get('va_plano');
      if (!legado) return;
      const ano = legado.cfg?.ano;
      if (ano && !get(`va_plano_${ano}`)) {
        set(`va_plano_${ano}`, legado);
        this._setIndex([...this._index(), ano]);
      }
      localStorage.removeItem('va_plano');
      /* TODO Fase 2: migração não se aplica — dados já estarão no Supabase */
    },

    /* ── Listagens ────────────────────────────── */
    anos() {
      this._migrar();
      return this._index();
    },
    anosPublicados() {
      return this.anos().filter(a => get(`va_plano_${a}`)?.status === 'publicado');
    },

    /* ── CRUD ─────────────────────────────────── */
    /** Prazo padrão de edição: 31 de março do ano do plano (formato 'YYYY-MM-DD'). */
    _prazoPadrao(ano) { return `${ano}-03-31`; },

    salvar(p) {
      const ano = p.cfg?.ano;
      if (!ano) return;
      const prazoEdicao = p.prazoEdicao || this._prazoPadrao(ano);
      set(`va_plano_${ano}`, { ...p, prazoEdicao, publicadoEm: new Date().toISOString(), status: 'rascunho' });
      this._setIndex([...this.anos(), ano]);
      /* TODO Fase 2: await supabase.from('planos').upsert(...) */
    },
    publicar(p) {
      const ano = p.cfg?.ano;
      if (!ano) return;
      const prazoEdicao = p.prazoEdicao || this._prazoPadrao(ano);
      set(`va_plano_${ano}`, { ...p, prazoEdicao, publicadoEm: new Date().toISOString(), status: 'publicado' });
      this._setIndex([...this.anos(), ano]);
    },
    despublicar(ano) {
      const p = get(`va_plano_${ano}`);
      if (p) set(`va_plano_${ano}`, { ...p, status: 'rascunho' });
    },

    /** Publica um ano já salvo, sem precisar tê-lo carregado em memória. */
    publicarAno(ano) {
      const p = get(`va_plano_${ano}`);
      if (p) set(`va_plano_${ano}`, { ...p, status: 'publicado', publicadoEm: new Date().toISOString() });
    },

    /** Define o prazo de edição (data completa 'YYYY-MM-DD') de um plano específico. */
    setPrazo(ano, dataFull) {
      const p = get(`va_plano_${ano}`);
      if (p) set(`va_plano_${ano}`, { ...p, prazoEdicao: dataFull || null });
    },

    /** Prazo efetivo de um ano: do próprio plano, ou o padrão 31/03. */
    prazoDe(ano) {
      const p = get(`va_plano_${ano}`);
      return (p && p.prazoEdicao) ? p.prazoEdicao : this._prazoPadrao(ano);
    },

    /** Exclui completamente o plano de um ano (rascunho ou publicado). */
    excluir(ano) {
      localStorage.removeItem(`va_plano_${ano}`);
      this._setIndex(this.anos().filter(a => a !== Number(ano)));
      /* TODO Fase 2: await supabase.from('planos').delete().eq('ano', ano) */
    },

    /** Resumo leve de todos os anos, para o painel de gestão. */
    resumos() {
      this._migrar();
      return this._index().map(ano => {
        const p = get(`va_plano_${ano}`);
        return {
          ano,
          status:      p?.status || 'rascunho',
          taxa:        p?.taxa ?? null,
          totalDist:   p?.totalDist ?? null,
          geradoEm:    p?.geradoEm || null,
          publicadoEm: p?.publicadoEm || null,
          prazoEdicao: (p && p.prazoEdicao) ? p.prazoEdicao : this._prazoPadrao(ano),
        };
      });
    },

    /**
     * carregar(ano) — plano daquele ano (ou null).
     * carregar()    — plano mais recente, qualquer status (uso do planner).
     */
    carregar(ano) {
      this._migrar();
      if (ano) return get(`va_plano_${ano}`);
      const anos = this._index();
      if (!anos.length) return null;
      return get(`va_plano_${anos[anos.length - 1]}`);
    },

    /** Plano publicado mais recente (uso do módulo municipal). */
    carregarMaisRecentePublicado() {
      const pubs = this.anosPublicados();
      if (!pubs.length) return null;
      return get(`va_plano_${pubs[pubs.length - 1]}`);
    },

    estaPublicado(ano) {
      const p = ano ? this.carregar(ano) : this.carregar();
      return !!p && p.status === 'publicado';
    },

    /* ── Prazo de edição pelos municípios ─────── */
    podeEditar(ano) {
      const prazo = this._prazoEfetivo(ano);
      if (!prazo) return true;
      return new Date() <= new Date(`${prazo}T23:59:59`);
    },

    textoPrazo(ano) {
      const prazo = this._prazoEfetivo(ano);
      if (!prazo) return null;
      return new Date(`${prazo}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    },

    /**
     * Prazo efetivo ('YYYY-MM-DD'): preferência para o prazo do próprio plano;
     * se ausente, cai no antigo prazo global ('MM-DD') por compatibilidade.
     */
    _prazoEfetivo(ano) {
      const p = get(`va_plano_${ano}`);
      if (p && p.prazoEdicao) return p.prazoEdicao;             // 'YYYY-MM-DD'
      const cfg = DB.Config.carregar();
      if (cfg.prazoEdicao) {                                    // legado 'MM-DD'
        const [mes, dia] = cfg.prazoEdicao.split('-');
        if (mes && dia) return `${ano}-${mes}-${dia}`;
      }
      return null;
    },
  };

  /* ══════════════════════════════════════════════
     SYNC — Fase 2 (Supabase como fonte de verdade,
     localStorage como cache local de trabalho)

     Estratégia: ao abrir a página, baixa todas as chaves
     sincronizáveis do Supabase para o localStorage (pull);
     a cada gravação, além do localStorage, empurra a chave
     para o Supabase em segundo plano (push, com debounce).
     Com os campos de js/supabase-config.js vazios, tudo
     funciona 100% local, como na Fase 1.
     ══════════════════════════════════════════════ */
  const SYNC_EXATAS   = ['va_config', 'va_planos_index', 'va_feriados', 'va_municipios'];
  const SYNC_PREFIXOS = ['va_plano_', 'va_semanas_', 'va_previewedit_', 'va_munplano_'];

  const Sync = {
    _client: null,
    _timers: {},
    _pronto: null,

    habilitado() {
      const cfg = (typeof window !== 'undefined' && window.VIGIAGUA_SUPABASE) || {};
      return !!(cfg.url && cfg.anonKey && typeof window !== 'undefined' && window.supabase);
    },

    client() {
      if (!this._client && this.habilitado()) {
        const cfg = window.VIGIAGUA_SUPABASE;
        // Normaliza a URL: aceita colada com /rest/v1, /auth/v1, barra final ou espaços.
        // A URL correta é apenas a raiz do projeto: https://xxxx.supabase.co
        const url = String(cfg.url).trim()
          .replace(/\/+$/, '')
          .replace(/\/(rest|auth|realtime|storage)\/v1$/i, '')
          .replace(/\/+$/, '');
        this._client = window.supabase.createClient(url, String(cfg.anonKey).trim());
      }
      return this._client;
    },

    _sincronizavel(key) {
      return SYNC_EXATAS.includes(key) || SYNC_PREFIXOS.some(p => key.startsWith(p));
    },

    /** Baixa todas as chaves do banco para o localStorage. */
    async pull() {
      if (!this.habilitado()) return { ok: true, local: true };
      const cli = this.client();
      const { data: sess } = await cli.auth.getSession();
      if (!sess?.session) return { ok: true, semLogin: true };
      const { data, error } = await cli.from('va_store').select('key, value');
      if (error) { console.warn('[Sync] pull falhou:', error.message); return { ok: false, erro: error.message }; }
      (data || []).forEach(row => {
        if (this._sincronizavel(row.key)) localStorage.setItem(row.key, row.value);
      });
      return { ok: true, chaves: (data || []).length };
    },

    /** Agenda o envio de uma chave (chamado por set() e pelos módulos). */
    notify(key) {
      if (!this.habilitado() || !this._sincronizavel(key)) return;
      clearTimeout(this._timers[key]);
      this._timers[key] = setTimeout(() => this._push(key), 800);
    },

    async _push(key) {
      try {
        const cli = this.client();
        const { data: sess } = await cli.auth.getSession();
        if (!sess?.session) return;
        const value = localStorage.getItem(key);
        if (value === null) {
          const { error } = await cli.from('va_store').delete().eq('key', key);
          if (error) console.warn('[Sync] delete falhou:', key, error.message);
        } else {
          const { error } = await cli.from('va_store').upsert(
            { key, value, updated_at: new Date().toISOString() },
            { onConflict: 'key' }
          );
          if (error) console.warn('[Sync] push falhou:', key, error.message);
        }
      } catch (e) { console.warn('[Sync] push exception:', key, e.message); }
    },

    /** Promise que as páginas aguardam antes de inicializar. */
    get ready() {
      if (!this._pronto) this._pronto = this.pull().catch(() => ({ ok: false }));
      return this._pronto;
    },
  };

  /* Auth com Supabase (quando configurado) e fallback demo local. */
  const AuthSupabase = {
    async login(email, senha) {
      const cli = Sync.client();
      const { data, error } = await cli.auth.signInWithPassword({ email, password: senha });
      if (error) return { ok: false, erro: 'E-mail ou senha inválidos.' };
      const uid = data.user.id;
      const { data: rows, error: e2 } = await cli.from('usuarios').select('*').eq('id', uid).limit(1);
      if (e2 || !rows || !rows.length) {
        await cli.auth.signOut();
        return { ok: false, erro: 'Usuário autenticado, mas sem perfil cadastrado (tabela usuarios).' };
      }
      const u = rows[0];
      const sessao = { userId: u.id, perfil: u.perfil, nome: u.nome, municipioId: u.municipio_id };
      set('va_session', sessao);
      await Sync.pull();               // agora autenticado: baixa os dados
      return { ok: true, sessao };
    },
    async logout() {
      localStorage.removeItem('va_session');
      try { const cli = Sync.client(); if (cli) await cli.auth.signOut(); } catch (e) {}
    },
  };

  // Login unificado: Supabase quando ativo, demo local caso contrário.
  // Sempre retorna Promise — o index.html usa await.
  Auth.loginAsync = async function (email, senha) {
    if (Sync.habilitado()) return AuthSupabase.login(email, senha);
    return this.login(email, senha);
  };
  Auth.logoutAsync = async function () {
    if (Sync.habilitado()) return AuthSupabase.logout();
    this.logout();
  };

  _syncRef = Sync;
  return { Auth, Usuarios, Municipios, Config, Semanas, Feriados, Plano, Sync };
})();
