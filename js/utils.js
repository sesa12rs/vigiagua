/**
 * VigiÁgua — Utilitários de data e feriados (utils.js)
 */

const Utils = (() => {

  const MESES_PT = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ];

  /* ── Páscoa (algoritmo de Butcher-Meeus) ──── */
  function calcularPascoa(ano) {
    const a = ano % 19;
    const b = Math.floor(ano / 100);
    const c = ano % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes, dia);
  }

  /* ── Feriados nacionais fixos e móveis ────── */
  function feriadosNacionaisAno(ano, extras = []) {
    const pascoa      = calcularPascoa(ano);
    const carnaval    = _addDays(pascoa, -47);
    const sextaSanta  = _addDays(pascoa, -2);
    const corpusChristi = _addDays(pascoa, 60);

    const lista = [
      new Date(ano, 0,  1),  // Ano Novo
      carnaval,
      sextaSanta,
      pascoa,
      new Date(ano, 3, 21),  // Tiradentes
      new Date(ano, 4,  1),  // Trabalho
      corpusChristi,
      new Date(ano, 8,  7),  // Independência
      new Date(ano, 9, 12),  // N. Sra. Aparecida
      new Date(ano, 10, 2),  // Finados
      new Date(ano, 10,15),  // Proclamação da República
      new Date(ano, 10,20),  // Consciência Negra
      new Date(ano, 11,25),  // Natal
    ];

    extras.forEach(f => {
      lista.push(new Date(ano, f.mes - 1, f.dia));
    });

    return lista;
  }

  /* ── Todas as datas do DIA DE COLETA no ano (padrão: terça = 2) ── */
  function tercasFeirasDoAno(ano, diaColeta = 2) {
    const lista = [];
    let d = new Date(ano, 0, 1);
    while (d.getDay() !== diaColeta) d = _addDays(d, 1);
    while (d.getFullYear() === ano) {
      lista.push(new Date(d));
      d = _addDays(d, 7);
    }
    return lista;
  }

  /* ── Distância (em dias) entre coleta e entrega a partir da config ── */
  function offsetEntrega(cfg) {
    const c = cfg && cfg.diaColeta, e = cfg && cfg.diaEntrega;
    if (c == null || e == null) return 1;   // padrão: entrega = coleta + 1 (quarta)
    return (((e - c) % 7) + 7) % 7;
  }

  /* ── Verifica se o DIA DE ENTREGA da semana é feriado nacional ─ */
  function quartaEhFeriadoNacional(terca, feriadosNac, offset = 1) {
    const entrega = _addDays(terca, offset);
    return feriadosNac.some(f =>
      f.getDate()  === entrega.getDate() &&
      f.getMonth() === entrega.getMonth()
    );
  }

  /* ── Verifica feriado municipal no dia de COLETA ou de ENTREGA ─── */
  function ehFeriadoMunicipal(munNome, terca, feriadosMunicipais, offset = 1) {
    const lista = feriadosMunicipais[munNome];
    if (!lista) return false;
    const entrega = _addDays(terca, offset);
    return lista.some(f => {
      const isDiaColeta  = f.mes === terca.getMonth()   + 1 && f.dia === terca.getDate();
      const isDiaEntrega = f.mes === entrega.getMonth() + 1 && f.dia === entrega.getDate();
      return isDiaColeta || isDiaEntrega;
    });
  }

  /* ── Semanas de férias automáticas (dez/jan) ─ */
  function semanasDeFerias(tercas) {
    return tercas.map((t, i) => {
      const mes = t.getMonth() + 1;
      const dia = t.getDate();
      return (mes === 12 && dia >= 10) || (mes === 1 && dia <= 15) ? i : -1;
    }).filter(i => i >= 0);
  }

  /* ── Semanas com feriado nacional na quarta ─ */
  function semanasComFeriadoNacQua(tercas, feriadosNac, offset = 1) {
    return tercas.map((t, i) =>
      quartaEhFeriadoNacional(t, feriadosNac, offset) ? i : -1
    ).filter(i => i >= 0);
  }

  /* ── Semanas INATIVAS por feriado que PARALISA o processo ──
     Bloqueia a semana se, no dia de coleta OU de entrega, houver:
       • feriado nacional ou estadual (sempre bloqueiam); ou
       • feriado de um "ponto de bloqueio" (ex.: Umuarama/Maringá) no dia
         marcado na configuração (cfg.pontosBloqueio[nome] = {coleta, entrega}). */
  function calcularSemanasBloqueadas(datasColeta, ano, feriados, cfg) {
    const off    = offsetEntrega(cfg);
    const nac    = feriadosNacionaisAno(ano, feriados.nacionais || []);
    const est    = (feriados.estaduais || []).map(f => new Date(ano, f.mes - 1, f.dia));
    const pontos = (cfg && cfg.pontosBloqueio) || {};
    const bate   = (d, alvo) => d.getDate() === alvo.getDate() && d.getMonth() === alvo.getMonth();
    const bloq   = [];
    datasColeta.forEach((coleta, i) => {
      const entrega = _addDays(coleta, off);
      // Nacional e estadual paralisam quando caem no dia de ENTREGA
      // (laboratório fechado no recebimento) — mantém a lógica histórica.
      let block = nac.some(d => bate(d, entrega)) || est.some(d => bate(d, entrega));
      if (!block) {
        // Pontos-chave (Umuarama/Maringá): bloqueiam no dia de coleta e/ou de
        // entrega, conforme marcado na configuração.
        for (const nome of Object.keys(pontos)) {
          const p     = pontos[nome] || {};
          const lista = (feriados.municipais || {})[nome] || [];
          const emColeta  = lista.some(f => f.mes === coleta.getMonth()  + 1 && f.dia === coleta.getDate());
          const emEntrega = lista.some(f => f.mes === entrega.getMonth() + 1 && f.dia === entrega.getDate());
          if ((p.coleta && emColeta) || (p.entrega && emEntrega)) { block = true; break; }
        }
      }
      if (block) bloq.push(i);
    });
    return bloq;
  }

  /* ── Período para "1 por mês" (Jan+Dez = 0) ─ */
  function getPeriodo(terca) {
    const mes = terca.getMonth() + 1;
    return (mes === 1 || mes === 12) ? 0 : mes;
  }

  /* ── Formatação ──────────────────────────── */
  function fmtData(d, opts = { day:'2-digit', month:'2-digit' }) {
    return d.toLocaleDateString('pt-BR', opts);
  }

  function fmtDataLonga(d) {
    return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
  }

  function nomeMes(idx) { return MESES_PT[idx]; } // 0-based

  function _addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  /* ── Semana ISO ──────────────────────────── */
  function semanaISO(d) {
    const dt = new Date(d);
    dt.setHours(0,0,0,0);
    dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
    const semana1 = new Date(dt.getFullYear(), 0, 4);
    return 1 + Math.round(((dt - semana1) / 86400000 - 3 + ((semana1.getDay() + 6) % 7)) / 7);
  }

  return {
    calcularPascoa, feriadosNacionaisAno, tercasFeirasDoAno, offsetEntrega,
    quartaEhFeriadoNacional, ehFeriadoMunicipal,
    semanasDeFerias, semanasComFeriadoNacQua, calcularSemanasBloqueadas, getPeriodo,
    fmtData, fmtDataLonga, nomeMes, semanaISO,
    MESES_PT,
  };
})();
