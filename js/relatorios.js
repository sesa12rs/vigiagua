/**
 * VigiÁgua — Relatórios (relatorios.js)
 *
 * Camada de "view model": transforma o plano gerado (DB.Plano) em
 * estruturas prontas para as visões da aba Laboratório — carga semanal,
 * heatmap semana × município e romaneio por viagem. São funções puras
 * (sem DOM), o que as torna testáveis em Node. Depende apenas de Utils.
 */
const Relatorios = (() => {

  /**
   * Agrega o plano em dados de laboratório.
   * Convenção do sistema: cada coleta gera uma amostra físico-química E uma
   * microbiológica (as duas andam sempre juntas). Total de amostras da
   * viagem = coletas × 2. A capacidade do laboratório é medida em coletas
   * (= nº de físico-químicas = nº de microbiológicas = totSem por semana).
   */
  function dadosLaboratorio(plano) {
    if (!plano || !plano.ok) return null;

    const tercas     = plano.tercas.map(s => new Date(s));
    const municipios = plano.municipios || [];
    const idxAtivas  = plano.semanasAtivasIdx || [];
    const capacidade = (plano.cfg && plano.cfg.capacidade != null) ? plano.cfg.capacidade : null;

    // Semanas COM coleta (base do histograma e do romaneio)
    const semanas = [];
    idxAtivas.forEach(si => {
      const totalA = plano.totSem[si] || 0;
      if (totalA <= 0) return;
      const muns = [];
      municipios.forEach((m, mi) => {
        const q = plano.dist[mi][si];
        if (q > 0) muns.push({ nome: m.nome, qtd: q });
      });
      semanas.push({
        idx:          si,
        semana:       si + 1,
        data:         tercas[si],
        totalA,
        totalB:       totalA,      // microbiológicas = físico-químicas (1 de cada por coleta)
        totalFrascos: totalA * 2,  // A + B
        nMun:         muns.length,
        municipios:   muns,
      });
    });

    // Heatmap: linhas = municípios, colunas = semanas com coleta
    const colunas = semanas.map(s => ({ idx: s.idx, data: s.data, semana: s.semana }));
    const linhas  = municipios.map((m, mi) => {
      const celulas = colunas.map(c => plano.dist[mi][c.idx] || 0);
      return {
        nome:    m.nome,
        meta:    m.meta,
        celulas,
        total:   celulas.reduce((a, b) => a + b, 0),
        visitas: celulas.filter(v => v > 0).length,
      };
    });

    const cargaMax        = semanas.reduce((mx, s) => Math.max(mx, s.totalA), 0);
    const totalAmostrasA  = semanas.reduce((a, s) => a + s.totalA, 0);
    const totalFrascosAno = semanas.reduce((a, s) => a + s.totalFrascos, 0);

    return {
      ano: plano.cfg ? plano.cfg.ano : null,
      capacidade,
      semanas,
      heatmap: { colunas, linhas },
      cargaMax,
      totalAmostrasA,
      totalFrascosAno,
    };
  }

  /** CSV de resumo por semana (formato de conferência do laboratório). */
  function csvResumoSemanal(dados) {
    if (!dados) return '';
    let csv = 'Semana,Data,Municipios,Fisico_Quimicas,Microbiologicas,Total_Amostras\n';
    dados.semanas.forEach(s => {
      const data = s.data.toLocaleDateString('pt-BR');
      csv += `${s.semana},${data},${s.nMun},${s.totalA},${s.totalB},${s.totalFrascos}\n`;
    });
    return csv;
  }

  /** CSV do heatmap semana × município (linhas = municípios, colunas = semanas). */
  function csvHeatmap(dados) {
    if (!dados) return '';
    const esc = s => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
    const cols = dados.heatmap.colunas;
    let csv = 'Municipio,' + cols.map(c => c.data.toLocaleDateString('pt-BR')).join(',') + ',Total\n';
    dados.heatmap.linhas.forEach(l => {
      csv += [esc(l.nome), ...l.celulas, l.total].join(',') + '\n';
    });
    csv += 'Total/semana,' + dados.semanas.map(s => s.totalA).join(',') + ',' + dados.totalAmostrasA + '\n';
    return csv;
  }

  /* ── Consolidado das coletas preenchidas pelos municípios ── */
  const SIGLAS = {
    'Alto Paraíso': 'APR', 'Alto Piquiri': 'API', 'Altônia': 'ALT',
    'Brasilândia do Sul': 'BRS', 'Cafezal do Sul': 'CFU', 'Cruzeiro do Oeste': 'COE',
    'Douradina': 'DOD', 'Esperança Nova': 'ENO', 'Francisco Alves': 'FAL',
    'Icaraíma': 'ICA', 'Iporã': 'IPO', 'Ivaté': 'IVT', 'Maria Helena': 'MHE',
    'Mariluz': 'MLZ', 'Nova Olímpia': 'NOL', 'Perobal': 'PER', 'Pérola': 'PRL',
    'São Jorge do Patrocínio': 'SJP', 'Tapira': 'TPR', 'Umuarama': 'UMR', 'Xambrê': 'XBR',
  };

  function _linhaColeta(municipio, sigla, id, tipo, c, ano) {
    const data = c.data || '';
    let semana = '';
    if (data) { try { semana = Utils.semanaISO(new Date(data + 'T00:00:00')); } catch (e) { semana = ''; } }
    return {
      municipio, sigla, id, tipo,
      data, semana,
      mes:      data ? parseInt(data.slice(5, 7), 10) : null,
      local:    c.local || '',
      sistema:  c.sistema || '',
      mb: !!c.mb, tb: !!c.tb, cr: !!c.cr, fl: !!c.fl,
      criterio: c.criterio || '',
    };
  }

  /**
   * Achata os planos municipais (DB.MunPlano) do ano numa lista única de
   * coletas: normais, filhas "-CR" e extras. Reproduz o ID (opção a) pela
   * mesma regra da tela do município: normais ordenadas por data recebem
   * 001..N; as filhas continuam a numeração (após todas as normais, por
   * data); extras recebem EX-001... na ordem de entrada.
   */
  function consolidadoColetas(ano) {
    if (typeof DB === 'undefined' || !DB.Municipios || !DB.MunPlano) {
      return { linhas: [], municipiosPreenchidos: 0 };
    }
    const linhas = [];
    let munsPreenchidos = 0;

    DB.Municipios.listar().forEach(m => {
      const blob = DB.MunPlano.carregar(m.nome, ano);
      if (!blob) return;
      const normais = blob.normais || [];
      const extras  = blob.extras  || [];
      if (!normais.length && !extras.length) return;
      munsPreenchidos++;
      const sigla = SIGLAS[m.nome] || '???';

      // Itens numeráveis (normais + filhas), em ordem natural de emissão
      const itens = [];
      normais.forEach((n, i) => {
        itens.push({ grupo: 0, idx: i, tipo: 'Normal', col: n });
        if (n.filho) itens.push({ grupo: 1, idx: i, tipo: 'Filha', col: n.filho });
      });

      // Numeração canônica: derivadas por último, ambos por data
      const ordenados = [...itens].sort((a, b) =>
        a.grupo - b.grupo ||
        String(a.col.data || '9999-12-31').localeCompare(String(b.col.data || '9999-12-31')) ||
        a.idx - b.idx
      );
      const idDe = new Map();
      ordenados.forEach((it, k) => {
        const ok = it.col.data && sigla !== '???' && ano;
        idDe.set(it, ok ? `${String(k + 1).padStart(3, '0')}${sigla}${ano}` : '—');
      });

      itens.forEach(it => linhas.push(_linhaColeta(m.nome, sigla, idDe.get(it) || '—', it.tipo, it.col, ano)));
      extras.forEach((e, i) => {
        const id = (sigla !== '???' && ano) ? `EX-${String(i + 1).padStart(3, '0')}${sigla}${ano}` : '—';
        linhas.push(_linhaColeta(m.nome, sigla, id, 'Extra', e, ano));
      });
    });

    return { linhas, municipiosPreenchidos: munsPreenchidos };
  }

  /** CSV do consolidado (aceita a lista já filtrada). */
  function csvConsolidado(linhas) {
    const esc = s => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
    let csv = 'Municipio,ID,Data,Semana,Tipo,Local,Sistema,MB,TB,CR,FL,Criterio\n';
    (linhas || []).forEach(l => {
      csv += [
        esc(l.municipio), l.id, l.data, l.semana, l.tipo, esc(l.local), l.sistema,
        l.mb ? 'X' : '', l.tb ? 'X' : '', l.cr ? 'X' : '', l.fl ? 'X' : '', esc(l.criterio),
      ].join(',') + '\n';
    });
    return csv;
  }

  return { dadosLaboratorio, csvResumoSemanal, csvHeatmap, consolidadoColetas, csvConsolidado };
})();

if (typeof window !== 'undefined') window.Relatorios = Relatorios;
