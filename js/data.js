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

if (typeof window !== 'undefined') {
  window.VIGIAGUA_VERSAO = 'fase2-v68';
  try { console.log('%c[VigiÁgua] versão ' + window.VIGIAGUA_VERSAO, 'color:#1e40af;font-weight:bold'); } catch (e) {}
}

const DB = (() => {

  function get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  let _syncRef = null;   // preenchido no fim do módulo (evita TDZ durante a carga)
  function set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
    if (_syncRef) _syncRef.notify(key);
  }
  /** Apaga uma chave do cache E sincroniza a remoção (deleta a linha no Supabase). */
  function del(key) {
    localStorage.removeItem(key);
    if (_syncRef) _syncRef.pushAgora(key);
  }

  /** Mesmo usuário logado? (para detectar troca de conta na mesma máquina) */
  function _mesmoUsuario(a, b) {
    return !!a && !!b && a.userId === b.userId && a.perfil === b.perfil && a.municipioId === b.municipioId;
  }

  /** Limpa o CACHE local de dados (chaves va_*), preservando o que for indicado.
   *  IMPORTANTE: é uma limpeza SÓ do cache da máquina — usa removeItem direto e
   *  NUNCA sincroniza (jamais deleta dados do Supabase). O token de login do
   *  Supabase (sb-...) não começa com "va_", então é sempre preservado. */
  function limparCacheDados(preservar) {
    const keep = new Set(preservar || ['va_ultimo_backup']);
    const rm = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('va_') === 0 && !keep.has(k)) rm.push(k);
    }
    rm.forEach(k => localStorage.removeItem(k));   // só local, sem sync
    return rm.length;
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
      'Alto Paraíso':            [{ mes: 5,  dia: 9,  nome: 'Aniversário de Emancipação Política' }, { mes: 5, dia: 13, nome: 'Nossa Senhora de Fátima' }],
      'Alto Piquiri':            [{ mes: 3,  dia: 19, nome: 'São José (Padroeiro)' }, { mes: 7, dia: 25, nome: 'São Tiago (Dia do Colono / Motorista)' }, { mes: 8, dia: 15, nome: 'Assunção de Nossa Senhora (Padroeira)' }],
      'Altônia':                 [{ mes: 1,  dia: 20, nome: 'São Sebastião (Padroeiro)' }, { mes: 12, dia: 8, nome: 'Nossa Senhora da Conceição' }, { mes: 12, dia: 12, nome: 'Aniversário de Emancipação Política' }],
      'Brasilândia do Sul':      [{ mes: 1,  dia: 1,  nome: 'Confraternização Universal / Aniversário da Cidade' }, { mes: 6, dia: 12, nome: 'Aniversário de Emancipação Política' }],
      'Cafezal do Sul':          [{ mes: 6,  dia: 24, nome: 'São João Batista (Padroeiro)' }, { mes: 7, dia: 20, nome: 'Aniversário de Emancipação Política' }],
      'Cruzeiro do Oeste':       [{ mes: 5,  dia: 13, nome: 'Nossa Senhora de Fátima (Padroeira)' }, { mes: 8, dia: 12, nome: 'Aniversário de Fundação' }, { mes: 8, dia: 26, nome: 'Aniversário de Emancipação Política' }],
      'Douradina':               [{ mes: 1,  dia: 17, nome: 'Aniversário de Emancipação Política' }, { mes: 2, dia: 1, nome: 'Padroeiro do Município' }],
      'Esperança Nova':          [{ mes: 6,  dia: 13, nome: 'Santo Antônio (Padroeiro)' }, { mes: 12, dia: 21, nome: 'Aniversário de Emancipação Política' }],
      'Francisco Alves':         [{ mes: 3,  dia: 1,  nome: 'Aniversário de Emancipação Política' }, { mes: 10, dia: 31, nome: 'Dia do Evangélico / Fundação' }],
      'Icaraíma':                [{ mes: 7,  dia: 25, nome: 'São Tiago (Padroeiro)' }, { mes: 8, dia: 15, nome: 'Assunção de Nossa Senhora' }],
      'Iporã':                   [{ mes: 6,  dia: 13, nome: 'Santo Antônio (Padroeiro)' }, { mes: 10, dia: 12, nome: 'Nossa Senhora Aparecida' }, { mes: 10, dia: 31, nome: 'Dia do Evangélico / Aniversário da Cidade' }],
      'Ivaté':                   [{ mes: 5,  dia: 2,  nome: 'Aniversário de Emancipação Política' }, { mes: 8, dia: 15, nome: 'Assunção de Nossa Senhora (Padroeira)' }],
      'Maria Helena':            [{ mes: 7,  dia: 25, nome: 'São Tiago (Padroeiro)' }, { mes: 8, dia: 15, nome: 'Assunção de Nossa Senhora' }, { mes: 11, dia: 27, nome: 'Aniversário de Emancipação Política' }],
      'Mariluz':                 [{ mes: 6,  dia: 13, nome: 'Santo Antônio (Padroeiro)' }, { mes: 11, dia: 29, nome: 'Aniversário de Emancipação Política' }],
      'Nova Olímpia':            [{ mes: 8,  dia: 6,  nome: 'Bom Jesus (Padroeiro)' }, { mes: 11, dia: 13, nome: 'Aniversário de Emancipação Política' }, { mes: 12, dia: 8, nome: 'Nossa Senhora da Conceição' }],
      'Perobal':                 [{ mes: 4,  dia: 29, nome: 'Aniversário de Emancipação Política' }, { mes: 6, dia: 26, nome: 'Data comemorativa local' }, { mes: 6, dia: 29, nome: 'São Pedro e São Paulo' }, { mes: 10, dia: 4, nome: 'São Francisco de Assis (Padroeiro)' }],
      'Pérola':                  [{ mes: 5,  dia: 13, nome: 'Nossa Senhora de Fátima (Padroeira)' }, { mes: 9, dia: 14, nome: 'Aniversário de Emancipação / Exaltação da Santa Cruz' }],
      'São Jorge do Patrocínio': [{ mes: 6,  dia: 22, nome: 'Aniversário de Emancipação Política' }, { mes: 8, dia: 12, nome: 'Data comemorativa local / Padroeiro' }],
      'Tapira':                  [{ mes: 1,  dia: 20, nome: 'São Sebastião' }, { mes: 2, dia: 2, nome: 'Nossa Senhora das Candeias (Padroeira)' }, { mes: 11, dia: 15, nome: 'Proclamação da República / Aniversário da Cidade' }],
      'Umuarama':                [{ mes: 6,  dia: 26, nome: 'Aniversário de Fundação / Emancipação de Umuarama' }, { mes: 8, dia: 15, nome: 'Assunção de Nossa Senhora (Padroeira)' }, { mes: 10, dia: 4, nome: 'São Francisco de Assis' }],
      'Xambrê':                  [{ mes: 7,  dia: 16, nome: 'Nossa Senhora do Carmo (Padroeira)' }, { mes: 7, dia: 25, nome: 'São Tiago / Aniversário de Emancipação' }],
      // Maringá NÃO é um dos 21 municípios (não recebe coletas nem conta metas):
      // entra só como ponto de feriado (laboratório). Feriados oficiais da cidade.
      'Maringá':                 [{ mes: 5,  dia: 10, nome: 'Aniversário de Maringá' }, { mes: 8, dia: 15, nome: 'N. Sra. da Glória (Padroeira)' }],
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

    // ── Dia da semana de Coleta e Entrega (0=Dom … 6=Sáb) ──
    // Padrão: coleta terça (2), entrega quarta (3).
    diaColeta:  2,
    diaEntrega: 3,

    // ── Pontos cujo feriado PARALISA o processo (bloqueia a semana) ──
    // Nacional e estadual sempre bloqueiam. Estes bloqueiam conforme marcado,
    // no dia de coleta e/ou de entrega.
    pontosBloqueio: {
      'Umuarama': { coleta: true,  entrega: true  },  // recebe as coletas dos 21 municípios
      'Maringá':  { coleta: false, entrega: true  },  // laboratório (recebe no dia da entrega)
    },

    // ── Capacidade do laboratório (físico-químicas) POR SEMANA ──
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
      // Troca de conta na mesma máquina → limpa o cache do usuário anterior
      const anterior = get('va_session');
      if (anterior && !_mesmoUsuario(anterior, sessao)) limparCacheDados();
      set('va_session', sessao);
      return { ok: true, sessao };
    },
    logout()      { limparCacheDados(); },
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
      const padraoMun = FERIADOS_PADRAO.municipais;
      // Traz chaves municipais padrão AUSENTES (ex.: Maringá) sem sobrescrever
      // as personalizações do usuário nas chaves já existentes.
      const municipais = {
        ...JSON.parse(JSON.stringify(padraoMun)),
        ...(s.municipais || {}),
      };
      // Enriquece NOMES por data: se um feriado salvo bate a data de um padrão e
      // está sem nome, herda o nome oficial — sem alterar datas nem apagar os
      // feriados personalizados (datas fora do padrão ficam sem nome).
      Object.keys(padraoMun).forEach(mun => {
        const lista = municipais[mun];
        if (!Array.isArray(lista)) return;
        lista.forEach(f => {
          if (f && f.nome == null) {
            const p = padraoMun[mun].find(pp => pp.mes === f.mes && pp.dia === f.dia && pp.nome);
            if (p) f.nome = p.nome;
          }
        });
      });
      return {
        nacionais:  s.nacionais  || [],
        estaduais:  s.estaduais  || [],
        municipais,
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
      // Cascata: remove TUDO que pertence ao ano, cada peça sincronizada.
      del(`va_plano_${ano}`);
      del(`va_semanas_${ano}`);
      this._chavesMunicipaisDoAno(ano).forEach(del);
      this._setIndex(this.anos().filter(a => a !== Number(ano)));
    },

    /** Chaves municipais (planos preenchidos + prévias) de um ano, presentes no cache. */
    _chavesMunicipaisDoAno(ano) {
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          if ((k.startsWith('va_munplano_') || k.startsWith('va_previewedit_')) && k.endsWith('_' + ano)) out.push(k);
        }
      } catch (e) { /* ambiente sem length/key */ }
      return out;
    },

    /** Quantos municípios têm plano preenchido neste ano (para o aviso da exclusão). */
    municipiosComDados(ano) {
      let n = 0;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('va_munplano_') && k.endsWith('_' + ano)) n++;
        }
      } catch (e) { /* ignora */ }
      return n;
    },

    /** Dados de suporte (semanas/munplano/previewedit) cujo ANO não tem plano nenhum. */
    orfaos() {
      const comPlano = new Set(this._anosPresentes());
      const res = { total: 0, semanas: 0, munplano: 0, previewedit: 0, anos: [], chaves: [] };
      const anosSet = new Set();
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          let m, ano = null, tipo = null;
          if      ((m = k.match(/^va_semanas_(\d{4})$/)))         { ano = +m[1]; tipo = 'semanas'; }
          else if ((m = k.match(/^va_munplano_.+_(\d{4})$/)))     { ano = +m[1]; tipo = 'munplano'; }
          else if ((m = k.match(/^va_previewedit_.+_(\d{4})$/)))  { ano = +m[1]; tipo = 'previewedit'; }
          if (ano && !comPlano.has(ano)) { res.chaves.push(k); res[tipo]++; res.total++; anosSet.add(ano); }
        }
      } catch (e) { /* ignora */ }
      res.anos = [...anosSet].sort((a, b) => a - b);
      return res;
    },

    /** Remove (sincronizando) todos os dados órfãos. Retorna o resumo do que foi limpo. */
    limparOrfaos() {
      const o = this.orfaos();
      o.chaves.forEach(del);
      return o;
    },

    /** Anos com plano REALMENTE presente no cache, mesmo que o índice esteja
     *  dessincronizado. Cura órfãos antigos (plano gravado mas fora do índice),
     *  tornando-os visíveis no painel para poderem ser excluídos. Só leitura. */
    _anosPresentes() {
      const doIndice = this._index();
      const escaneados = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          const m = k && k.match(/^va_plano_(\d{4})$/);
          if (m) escaneados.push(Number(m[1]));
        }
      } catch (e) { /* ambiente sem length/key: usa só o índice */ }
      return [...new Set([...doIndice, ...escaneados])].sort((a, b) => a - b);
    },

    /** Resumo leve de todos os anos, para o painel de gestão. */
    resumos() {
      this._migrar();
      return this._anosPresentes().map(ano => {
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
     PLANO MUNICIPAL — leitura de acompanhamento
     ══════════════════════════════════════════════
     Lê os blobs va_munplano_<Nome>_<Ano> (gravados pelo
     módulo municipal) de forma centralizada, para o painel
     de acompanhamento da Regional e para o próprio município
     concluir/reabrir o plano. Não muda o formato de
     armazenamento — apenas soma os campos status/concluidoEm
     ao blob que já existe.

     status:
       'nao_iniciado' — não existe blob do município no ano
       'rascunho'     — existe blob, ainda não concluído (padrão)
       'concluido'    — o município marcou como concluído
     "fora do prazo" NÃO é um status gravado: é derivado do
     prazo de edição do ano (DB.Plano.podeEditar) — sempre atual.
     ══════════════════════════════════════════════ */
  const MunPlano = {
    _key(nome, ano) { return `va_munplano_${nome}_${ano}`; },

    carregar(nome, ano) { return get(this._key(nome, ano)); },

    /** Status bruto (sem considerar prazo): nao_iniciado | rascunho | concluido. */
    statusBruto(nome, ano) {
      const p = this.carregar(nome, ano);
      if (!p) return 'nao_iniciado';
      return p.status === 'concluido' ? 'concluido' : 'rascunho';
    },

    /**
     * true quando o prazo de edição do ano já encerrou e o plano
     * ainda não foi concluído (aplica-se inclusive a "não iniciado",
     * que representa município que perdeu o prazo sem entregar).
     */
    foraDoPrazo(nome, ano) {
      if (this.statusBruto(nome, ano) === 'concluido') return false;
      return !DB.Plano.podeEditar(ano);
    },

    /**
     * Progresso de preenchimento: quantas coletas (normais +
     * filhas + extras) já têm o LOCAL informado, sobre o total.
     */
    progresso(nome, ano) {
      const p = this.carregar(nome, ano);
      if (!p) return { total: 0, comLocal: 0, pct: 0 };
      let total = 0, comLocal = 0;
      const conta = c => { if (!c) return; total++; if ((c.local || '').trim()) comLocal++; };
      (p.normais || []).forEach(n => { conta(n); if (n.filho) conta(n.filho); });
      (p.extras  || []).forEach(conta);
      return { total, comLocal, pct: total ? Math.round((comLocal / total) * 100) : 0 };
    },

    /** Marca como concluído (chamado pelo próprio município). */
    concluir(nome, ano) {
      const k = this._key(nome, ano);
      const p = get(k);
      if (!p) return false;
      set(k, { ...p, status: 'concluido', concluidoEm: new Date().toISOString() });
      return true;
    },

    /** Reabre para edição (volta a rascunho). */
    reabrir(nome, ano) {
      const k = this._key(nome, ano);
      const p = get(k);
      if (!p) return false;
      const q = { ...p, status: 'rascunho' };
      delete q.concluidoEm;
      set(k, q);
      return true;
    },

    /** Resumo consolidado de todos os municípios de um ano (para o painel). */
    resumoTodos(ano) {
      return DB.Municipios.listar().map(m => {
        const p    = this.carregar(m.nome, ano);
        const prog = this.progresso(m.nome, ano);
        return {
          id:          m.id,
          nome:        m.nome,
          meta:        m.meta,
          status:      this.statusBruto(m.nome, ano),
          foraDoPrazo: this.foraDoPrazo(m.nome, ano),
          total:       prog.total,
          comLocal:    prog.comLocal,
          pct:         prog.pct,
          salvoEm:     p?.salvoEm     || null,
          concluidoEm: p?.concluidoEm || null,
        };
      });
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

    /** Envia a chave IMEDIATAMENTE (troca de etapa, botões, saída da página). */
    pushAgora(key) {
      if (!this.habilitado() || !this._sincronizavel(key)) return;
      clearTimeout(this._timers[key]);
      this._push(key);
    },

    /** Agenda o envio de uma chave (chamado por set() e pelos módulos). */
    notify(key) {
      if (!this.habilitado() || !this._sincronizavel(key)) return;
      clearTimeout(this._timers[key]);
      this._timers[key] = setTimeout(() => this._push(key), 800);
    },

    ultimoErro: null,

    _falha(key, msg) {
      this.ultimoErro = { key, msg, em: new Date().toISOString() };
      console.error('[Sync] FALHA ao enviar "' + key + '": ' + msg);
      if (typeof window !== 'undefined' && typeof window.mostrarToast === 'function') {
        window.mostrarToast('⚠️ Não foi possível salvar no banco: ' + msg);
      }
    },

    async _push(key) {
      try {
        const cli = this.client();
        const { data: sess } = await cli.auth.getSession();
        if (!sess?.session) { this._falha(key, 'sem sessão de login no Supabase (entre novamente)'); return; }
        const value = localStorage.getItem(key);
        if (value === null) {
          const { error } = await cli.from('va_store').delete().eq('key', key);
          if (error) this._falha(key, error.message);
        } else {
          const { error } = await cli.from('va_store').upsert(
            { key, value, updated_at: new Date().toISOString() },
            { onConflict: 'key' }
          );
          if (error) this._falha(key, error.message);
          else console.log('[Sync] ✓ enviado:', key);
        }
      } catch (e) { this._falha(key, e.message); }
    },

    /** Diagnóstico completo — rode DB.Sync.diagnostico() no console (F12). */
    async diagnostico() {
      const rel = { versao: (typeof window !== 'undefined' && window.VIGIAGUA_VERSAO) || '?', habilitado: this.habilitado() };
      if (!rel.habilitado) { console.table(rel); return rel; }
      const cli = this.client();
      const { data: s } = await cli.auth.getSession();
      rel.sessaoSupabase = s?.session ? (s.session.user.email || s.session.user.id) : 'NENHUMA — faça login de novo';
      let sess = null; try { sess = JSON.parse(localStorage.getItem('va_session') || 'null'); } catch (e) {}
      rel.perfilLocal = sess ? `${sess.perfil} / ${sess.nome}` : 'nenhum';
      if (s?.session) {
        const { data: u, error: eu } = await cli.from('usuarios').select('*').eq('id', s.session.user.id).limit(1);
        const linha = u && u[0];
        rel.tabelaUsuarios = eu ? 'ERRO: ' + eu.message : (linha ? `${linha.perfil} / municipio_nome=${JSON.stringify(linha.municipio_nome)}` : 'USUÁRIO NÃO ENCONTRADO — rode o bloco 3 do schema.sql');
        if (linha) {
          const chaveTeste = linha.perfil === 'regional'
            ? 'va_plano_teste_diagnostico'
            : 'va_munplano_' + linha.municipio_nome + '_teste_diagnostico';
          rel.chaveTestada = chaveTeste;
          const { error: ew } = await cli.from('va_store').upsert(
            { key: chaveTeste, value: 'diagnostico', updated_at: new Date().toISOString() }, { onConflict: 'key' });
          rel.escritaNoBanco = ew ? 'FALHOU: ' + ew.message : 'OK ✓';
          if (!ew) await cli.from('va_store').delete().eq('key', chaveTeste);
        }
      }
      rel.ultimoErro = this.ultimoErro ? `${this.ultimoErro.key}: ${this.ultimoErro.msg}` : 'nenhum';
      console.table(rel);
      return rel;
    },

    /** Promise que as páginas aguardam antes de inicializar. */
    get ready() {
      if (!this._pronto) this._pronto = this.pull().catch(() => ({ ok: false }));
      return this._pronto;
    },

    /**
     * Exporta TODO o va_store para um objeto { registros: {key: value} }.
     * Com Supabase ativo, lê do banco (a Regional lê tudo); sem Supabase,
     * exporta o cache local. É a cópia de segurança dos dados oficiais.
     */
    async exportar() {
      const registros = {};
      if (this.habilitado()) {
        const cli = this.client();
        const { data: sess } = await cli.auth.getSession();
        if (!sess?.session) return { ok: false, erro: 'sem sessão de login no Supabase (entre novamente)' };
        const { data, error } = await cli.from('va_store').select('key, value');
        if (error) return { ok: false, erro: error.message };
        (data || []).forEach(r => { registros[r.key] = r.value; });
        return { ok: true, origem: 'supabase', geradoEm: new Date().toISOString(), total: Object.keys(registros).length, registros };
      }
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (this._sincronizavel(k)) registros[k] = localStorage.getItem(k);
      }
      return { ok: true, origem: 'local', geradoEm: new Date().toISOString(), total: Object.keys(registros).length, registros };
    },

    /**
     * Restaura um backup: regrava (upsert) cada chave no banco e no cache.
     * Semântica de restauração (não apaga chaves criadas depois do backup).
     * Só toca em chaves sincronizáveis (proteção contra lixo no arquivo).
     */
    async importar(registros) {
      if (!registros || typeof registros !== 'object') return { ok: false, erro: 'backup inválido' };
      const chaves = Object.keys(registros).filter(k => this._sincronizavel(k));
      chaves.forEach(k => localStorage.setItem(k, registros[k]));   // cache local sempre
      if (!this.habilitado()) return { ok: true, origem: 'local', total: chaves.length, erros: [] };
      const cli = this.client();
      const { data: sess } = await cli.auth.getSession();
      if (!sess?.session) return { ok: false, erro: 'sem sessão de login no Supabase (entre novamente)' };
      const erros = [];
      for (let i = 0; i < chaves.length; i += 200) {
        const lote = chaves.slice(i, i + 200).map(k => ({ key: k, value: registros[k], updated_at: new Date().toISOString() }));
        const { error } = await cli.from('va_store').upsert(lote, { onConflict: 'key' });
        if (error) erros.push(error.message);
      }
      return { ok: erros.length === 0, origem: 'supabase', total: chaves.length, erros };
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
        const detalhe = e2 ? ` Detalhe técnico: ${e2.message}` : ' A tabela usuarios está vazia para este usuário — execute o bloco 3 do schema.sql.';
        return { ok: false, erro: 'Usuário autenticado, mas o perfil não pôde ser lido.' + detalhe };
      }
      const u = rows[0];
      const sessao = { userId: u.id, perfil: u.perfil, nome: u.nome, municipioId: u.municipio_id };
      // Troca de conta na mesma máquina → limpa o cache do usuário anterior
      // ANTES do pull, para o novo usuário começar com dados limpos.
      const anterior = get('va_session');
      if (anterior && !_mesmoUsuario(anterior, sessao)) limparCacheDados();
      set('va_session', sessao);
      await Sync.pull();               // agora autenticado: baixa os dados
      return { ok: true, sessao };
    },
    async logout() {
      try { const cli = Sync.client(); if (cli) await cli.auth.signOut(); } catch (e) {}
      limparCacheDados();              // esvazia o cache va_ (preserva o lembrete de backup)
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
  return { Auth, Usuarios, Municipios, Config, Semanas, Feriados, Plano, MunPlano, Sync, limparCacheDados };
})();

// Exposição explícita no window (const de script clássico não vira window.DB sozinho)
if (typeof window !== 'undefined') window.DB = DB;
