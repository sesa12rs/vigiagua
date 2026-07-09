/**
 * VigiÁgua — Algoritmo de Planejamento (planner.js) v4.0
 *
 * LÓGICA CENTRAL:
 *   1. Calcular semanas ativas e disponíveis por município
 *   2. Determinar nPartic de cada município tal que sum = nSemAtivas × 9
 *      (exatamente 9 não-Umuarama por semana), todos com qtd/visita >= minFrascos
 *   3. Distribuir as participações uniformemente no tempo (slots espaçados)
 *   4. Montar a grade semanal garantindo exatamente 10 municípios por semana
 *   5. Quando Umuarama tem feriado, outro município entra no lugar
 */

const Planner = (() => {

  /* ── Resolver configurações ─────────────────── */
  function resolverMinFrascos(cfg, r) {
    const s = (!r || r.modoEntrega === 'herdar') ? cfg : r;
    if (s.modoEntrega === 'exato')     return s.entregaExata ?? 4;
    if (s.modoEntrega === 'intervalo') return s.entregaMin   ?? 4;
    return cfg.entregaMin ?? 4;
  }
  function resolverMaxFrascos(cfg, r) {
    const s = (!r || r.modoEntrega === 'herdar') ? cfg : r;
    if (s.modoEntrega === 'exato')     return s.entregaExata ?? 9;
    if (s.modoEntrega === 'intervalo') return s.entregaMax   ?? 9;
    return cfg.entregaMax ?? 9;
  }
  function resolverMunicipiosPorViagem(cfg) {
    if (cfg.modoMunicipios === 'exato') return cfg.municipiosExato ?? 10;
    if (cfg.modoMunicipios === 'intervalo') {
      // No modo intervalo, usar a média arredondada como alvo de trabalho.
      // O algoritmo respeita min como piso e max como teto.
      const mn = cfg.municipiosMin ?? 8;
      const mx = cfg.municipiosMax ?? 12;
      return Math.round((mn + mx) / 2);
    }
    return 10;
  }

  // Retorna { min, max } para uso nos limites de semanas
  function resolverMunicipiosRange(cfg) {
    if (cfg.modoMunicipios === 'exato') {
      const v = cfg.municipiosExato ?? 10;
      return { min: v, max: v };
    }
    if (cfg.modoMunicipios === 'intervalo') {
      return { min: cfg.municipiosMin ?? 8, max: cfg.municipiosMax ?? 12 };
    }
    return { min: 10, max: 10 };
  }

  // Retorna a periodicidade efetiva do município (herda global = 'livre')
  function resolverPeriodicidade(r) {
    if (!r || !r.periodicidade || r.periodicidade === 'herdar') return 'livre';
    return r.periodicidade; // '1xmes' | '2xmes' | '3xmes' | 'livre'
  }

  // Converte periodicidade em número de participações por mês
  function particPorMes(period) {
    if (period === '1xmes') return 1;
    if (period === '2xmes') return 2;
    if (period === '3xmes') return 3;
    return null; // livre
  }

  /* ── Validador ──────────────────────────────── */
  function validar(cfg, municipios, tercas, semanasAtivas, feriados) {
    const erros = [], avisos = [];
    const fMun  = feriados.municipais || {};
    const idx   = semanasAtivas.map((a,i) => a ? i : -1).filter(i => i >= 0);
    const nSem  = idx.length;

    // ── Sem semanas ativas ──────────────────────
    if (!nSem) {
      erros.push({ msg: 'Nenhuma semana ativa. Ative pelo menos algumas semanas na seção Semanas.' });
      return { ok: false, erros, avisos };
    }

    const minFrascos = cfg.entregaMin ?? 4;
    const maxFrascos = cfg.entregaMax ?? 9;
    const munRange   = resolverMunicipiosRange(cfg);
    const munAlvo    = resolverMunicipiosPorViagem(cfg);
    const munMinV    = munRange.min;
    const munMaxV    = munRange.max;
    const nMun       = municipios.length;
    const umuIdx     = municipios.findIndex(m => m.nome === 'Umuarama');

    // ── Frascos: mín > máx ──────────────────────
    if (minFrascos > maxFrascos) {
      erros.push({ msg: `Frascos por visita: mínimo (${minFrascos}) maior que máximo (${maxFrascos}). Corrija os parâmetros.` });
      return { ok: false, erros, avisos };
    }

    // ── Municípios/viagem: valor impossível ─────
    if (munMinV > nMun) {
      erros.push({ msg: `Mínimo de municípios por viagem (${munMinV}) é maior que o total de municípios cadastrados (${nMun}). Reduza o valor.` });
    }
    if (munMaxV > nMun) {
      erros.push({ msg: `Máximo de municípios por viagem (${munMaxV}) é maior que o total de municípios cadastrados (${nMun}). Reduza o valor.` });
    }
    if (munMaxV < 2) {
      erros.push({ msg: `Municípios por viagem deve ser pelo menos 2 (Umuarama + 1 outro).` });
    }
    if (munMinV > munMaxV) {
      erros.push({ msg: `Municípios por viagem: mínimo (${munMinV}) maior que máximo (${munMaxV}).` });
    }

    // ── Slots matemáticos: P6 vs metas ─────────
    const semUmu    = umuIdx >= 0
      ? idx.filter(si => !Utils.ehFeriadoMunicipal('Umuarama', tercas[si], fMun))
      : idx;
    const semUmuSet = new Set(semUmu);

    // Usar munMaxV como teto de slots por semana
    const slotsPorSemV = idx.map(si => semUmuSet.has(si) ? munMaxV - 1 : munMaxV);
    const totalSlotsV  = slotsPorSemV.reduce((a,b) => a+b, 0);

    const totalMetaNaoUmu = municipios
      .filter((_, i) => i !== umuIdx)
      .reduce((s, m) => s + m.meta, 0);
    const maxColetasSlots = totalSlotsV * maxFrascos;

    if (totalMetaNaoUmu > maxColetasSlots) {
      const slotsNec = Math.ceil(totalMetaNaoUmu / maxFrascos);
      erros.push({
        msg: `Municípios por viagem (máx ${munMaxV}) gera apenas ${totalSlotsV} slots ao longo do ano, ` +
             `mas as metas somam ${totalMetaNaoUmu} coletas — precisaria de pelo menos ${slotsNec} slots ` +
             `(${Math.ceil(slotsNec / nSem)} municípios extras por semana). ` +
             `Aumente os "Municípios por viagem" ou reduza as metas.`
      });
    }

    // Aviso se slots forem poucos para distribuição uniforme
    const slotsIdealPorMun = totalSlotsV / Math.max(nMun - 1, 1);
    if (!erros.length && slotsIdealPorMun < 8 && munMaxV < 10) {
      avisos.push({
        msg: `Com máx ${munMaxV} municípios/viagem, cada município não-Umuarama participará em média ` +
             `${slotsIdealPorMun.toFixed(1)} semanas. O padrão recomendado é 10 municípios por viagem.`
      });
    }

    // ── Capacidade do laboratório ───────────────
    if (cfg.capacidade) {
      const metaTotal = municipios.reduce((s, m) => s + m.meta, 0);
      const maxCapAno = cfg.capacidade * nSem;
      if (metaTotal > maxCapAno) {
        erros.push({
          msg: `Capacidade do laboratório (${cfg.capacidade}/semana × ${nSem} semanas = ${maxCapAno}) ` +
               `é menor que o total de metas (${metaTotal}). Aumente a capacidade ou ative mais semanas.`
        });
      }
    }

    // ── Por município: meta vs semanas disponíveis e max frascos ──
    municipios.forEach((m, i) => {
      const semDisp = idx.filter(si =>
        !Utils.ehFeriadoMunicipal(m.nome, tercas[si], fMun)
      ).length;

      if (semDisp === 0) {
        erros.push({ municipio: m.nome,
          msg: `${m.nome}: nenhuma semana disponível — todos os feriados municipais coincidem com semanas ativas.` });
        return;
      }

      // Usar o max individual do município (ou global se herdar)
      const r = m.regras || {};
      const mxMun = r.modoEntrega === 'exato'     ? (r.entregaExata ?? maxFrascos)
                  : r.modoEntrega === 'intervalo'  ? (r.entregaMax   ?? maxFrascos)
                  : maxFrascos;
      const mnMun = r.modoEntrega === 'exato'     ? (r.entregaExata ?? minFrascos)
                  : r.modoEntrega === 'intervalo'  ? (r.entregaMin   ?? minFrascos)
                  : minFrascos;

      // Meta impossível dado maxFrascos × semanas disponíveis
      const maxPossivel = mxMun * semDisp;
      if (m.meta > maxPossivel) {
        erros.push({ municipio: m.nome,
          msg: `${m.nome}: meta ${m.meta} impossível — máximo possível é ${mxMun} frascos × ${semDisp} semanas = ${maxPossivel}. ` +
               `Reduza a meta, aumente o máximo de frascos ou ative mais semanas.` });
      }

      // Aviso: meta muito baixa vs mínimo de frascos
      if (mnMun > 0 && m.meta < mnMun) {
        erros.push({ municipio: m.nome,
          msg: `${m.nome}: meta ${m.meta} é menor que o mínimo de frascos por visita (${mnMun}). ` +
               `Impossível realizar qualquer visita. Corrija a meta ou o mínimo.` });
      }

      // Aviso: quantidade fixa mas meta não divisível
      if (r.modoEntrega === 'exato' && r.entregaExata != null) {
        const qtdFixa = r.entregaExata;
        if (m.meta % qtdFixa !== 0) {
          avisos.push({ municipio: m.nome,
            msg: `${m.nome}: meta ${m.meta} não é divisível por ${qtdFixa} (quantidade fixa). ` +
                 `A última visita terá ${m.meta % qtdFixa} frasco(s) em vez de ${qtdFixa}.` });
        }
      }

      // Validar periodicidade individual
      const period = resolverPeriodicidade(r);
      const ppMes  = particPorMes(period);
      if (ppMes !== null) {
        // Meses disponíveis para este município
        const mesesDispMun = new Set(
          idx.filter(si => !Utils.ehFeriadoMunicipal(m.nome, tercas[si], fMun))
             .map(si => tercas[si].getMonth() + 1)
        );
        const nMesesMun = mesesDispMun.size;
        const nParticPeriod = ppMes * nMesesMun;

        // Meta impossível com essa periodicidade
        const maxComPeriod = nParticPeriod * mxMun;
        if (m.meta > maxComPeriod) {
          erros.push({ municipio: m.nome,
            msg: `${m.nome}: periodicidade "${period}" (${ppMes}×/mês × ${nMesesMun} meses = ${nParticPeriod} visitas) ` +
                 `com máx ${mxMun} frascos/visita permite no máximo ${maxComPeriod} coletas, mas a meta é ${m.meta}. ` +
                 `Aumente o máximo de frascos, reduza a periodicidade ou reduza a meta.` });
        }

        // Meta subdimensionada para a periodicidade (sobrarão visitas vazias)
        const minComPeriod = nParticPeriod * mnMun;
        if (m.meta < minComPeriod) {
          avisos.push({ municipio: m.nome,
            msg: `${m.nome}: periodicidade "${period}" gera ${nParticPeriod} visitas mínimas (${ppMes}×/mês × ${nMesesMun} meses). ` +
                 `Com mínimo ${mnMun} frascos/visita, o mínimo seria ${minComPeriod} coletas, mas a meta é ${m.meta}. ` +
                 `Considere reduzir a periodicidade ou aumentar a meta.` });
        }

        // Sugestão de quantidade ideal
        if (m.meta % nParticPeriod === 0) {
          const sug = m.meta / nParticPeriod;
          if (sug >= mnMun && sug <= mxMun) {
            avisos.push({ tipo: 'sugestao', municipio: m.nome,
              msg: `${m.nome}: com periodicidade "${period}" (${nParticPeriod} visitas/ano), ` +
                   `quantidade ideal = ${sug} frascos/visita (${m.meta} ÷ ${nParticPeriod} = ${sug}).` });
          }
        }
      }
    });

    return { ok: !erros.length, erros, avisos };
  }

  /* ── Gerador principal ──────────────────────── */
  function gerar(cfg, municipios, tercas, semanasAtivas, feriados) {
    const fMun        = feriados.municipais || {};
    const nMun        = municipios.length;
    const nSem        = tercas.length;
    const idx         = semanasAtivas.map((a,i) => a ? i : -1).filter(i => i >= 0);
    const nSemAtivas  = idx.length;

    if (!nSemAtivas) return { ok: false, erro: 'Nenhuma semana ativa.' };

    const munRange    = resolverMunicipiosRange(cfg);
    const munAlvo     = resolverMunicipiosPorViagem(cfg); // valor central para distribuição
    const munMin      = munRange.min;
    const munMax      = munRange.max;
    const minFrascos  = cfg.entregaMin ?? 4;
    const maxFrascos  = cfg.entregaMax ?? 9;

    // Índice do Umuarama
    const umuIdx = municipios.findIndex(m => m.nome === 'Umuarama');

    // Semanas disponíveis por município (sem feriado municipal próprio)
    const semDispMun = municipios.map(m =>
      idx.filter(si => !Utils.ehFeriadoMunicipal(m.nome, tercas[si], fMun))
    );

    // Semanas onde Umuarama está disponível
    const semUmu    = umuIdx >= 0 ? semDispMun[umuIdx] : idx;
    const semSemUmu = new Set(semUmu);

    // Slots disponíveis para não-Umuarama por semana:
    //   - Semanas onde Umuarama participa: (munAlvo - 1) slots
    //   - Semanas onde Umuarama tem feriado: munAlvo slots (outro entra no lugar)
    const slotsPorSem = idx.map(si =>
      semSemUmu.has(si) ? munAlvo - 1 : munAlvo
    );
    const totalSlots = slotsPorSem.reduce((a, b) => a + b, 0);

    // ── Helpers para ler regras por município ──
    function getMinMun(m) {
      const r = m.regras || {};
      if (r.modoEntrega === 'exato')     return r.entregaExata ?? minFrascos;
      if (r.modoEntrega === 'intervalo') return r.entregaMin   ?? minFrascos;
      return minFrascos; // herdar global
    }
    function getMaxMun(m) {
      const r = m.regras || {};
      if (r.modoEntrega === 'exato')     return r.entregaExata ?? maxFrascos;
      if (r.modoEntrega === 'intervalo') return r.entregaMax   ?? maxFrascos;
      return maxFrascos; // herdar global
    }
    // Para municípios com quantidade fixa, min === max
    function isQtdFixa(m) {
      const r = m.regras || {};
      return r.modoEntrega === 'exato' && r.entregaExata != null;
    }

    // ── ETAPA 1: Calcular nPartic para cada município ──
    // Prioridade:
    //   - Umuarama: todas as semanas disponíveis
    //   - Quantidade fixa: ceil(meta / qtdFixa)
    //   - Periodicidade configurada: ppMes × nMesesDisp (fixo, não ajustável)
    //   - Livre: começar com ceil(meta / maxFrascos), aumentar iterativamente

    // Meses ativos no ano (com pelo menos 1 semana ativa)
    const mesesAtivos = new Set(idx.map(si => tercas[si].getMonth() + 1));

    const nPartics = municipios.map((m, i) => {
      if (i === umuIdx) return semUmu.length;
      const mxMun = getMaxMun(m);
      if (isQtdFixa(m)) {
        return Math.ceil(m.meta / m.regras.entregaExata);
      }
      // Verificar periodicidade individual
      const period = resolverPeriodicidade(m.regras);
      const ppMes  = particPorMes(period);
      if (ppMes !== null) {
        // Contar meses disponíveis para este município especificamente
        const mesesDispMun = new Set(
          semDispMun[i].map(si => tercas[si].getMonth() + 1)
        );
        return ppMes * mesesDispMun.size;
      }
      return Math.ceil(m.meta / mxMun); // livre: mínimo de participações
    });

    // Slots já ocupados pelos municípios com regra fixa
    const alvoNaoUmu  = totalSlots;
    const totalNaoUmu = () => nPartics.reduce((s, v, i) => i === umuIdx ? s : s + v, 0);

    let iter = 0;
    while (totalNaoUmu() < alvoNaoUmu && iter < 10000) {
      iter++;
      let melhorIdx = -1, maiorQtd = -1;
      for (let i = 0; i < nMun; i++) {
        if (i === umuIdx) continue;
        if (isQtdFixa(municipios[i])) continue;
        // Não ajustar municípios com periodicidade definida — nPartic já está fixado
        if (particPorMes(resolverPeriodicidade(municipios[i].regras)) !== null) continue;
        if (nPartics[i] >= semDispMun[i].length) continue;
        const mnMun  = getMinMun(municipios[i]);
        const qtdAtual = municipios[i].meta / nPartics[i];
        if (qtdAtual <= mnMun) continue;
        if (qtdAtual > maiorQtd) { maiorQtd = qtdAtual; melhorIdx = i; }
      }
      if (melhorIdx === -1) break;
      nPartics[melhorIdx]++;
    }

    // ── ETAPA 2: Calcular quantidades por visita ──
    // Para municípios com quantidade fixa: distribuir exatamente qtdFixa por visita
    // (com possível sobra de 1 na última visita se meta não for divisível)
    const qtdInfo = municipios.map((m, i) => {
      const np = nPartics[i];
      if (isQtdFixa(m) && i !== umuIdx) {
        const qtdFixa = m.regras.entregaExata;
        const sobra   = m.meta - qtdFixa * (np - 1); // última visita absorve a diferença
        // se meta é divisível: todas iguais; senão a última visita leva o resto
        const nExtra  = m.meta % np;
        const qtdBase = Math.floor(m.meta / np);
        return { np, qtdBase, nExtra, qtdExtra: qtdBase + (nExtra > 0 ? 1 : 0), fixo: qtdFixa };
      }
      const qtdBase = Math.floor(m.meta / np);
      const nExtra  = m.meta % np;
      return { np, qtdBase, nExtra, qtdExtra: qtdBase + (nExtra > 0 ? 1 : 0), fixo: null };
    });

    // ── ETAPA 3: Distribuir participações uniformemente no tempo ──
    const pedidos = [];
    for (let mi = 0; mi < nMun; mi++) {
      if (mi === umuIdx) continue;
      const { np, qtdBase, nExtra, qtdExtra } = qtdInfo[mi];
      if (!np) continue;
      const sems = semDispMun[mi];
      const nS   = sems.length;

      const period = resolverPeriodicidade(municipios[mi].regras);
      const ppMes  = particPorMes(period);

      if (ppMes !== null) {
        // Periodicidade configurada: distribuir ppMes slots por mês,
        // escolhendo semanas espaçadas dentro de cada mês
        const mesesDispMun = [...new Set(sems.map(si => tercas[si].getMonth() + 1))].sort((a,b) => a-b);
        let k = 0;
        for (const mes of mesesDispMun) {
          const semsDoMes = sems.filter(si => tercas[si].getMonth() + 1 === mes);
          for (let p = 0; p < ppMes && p < semsDoMes.length; p++) {
            // Distribuir as ppMes participações uniformemente dentro do mês
            const pos      = (p + 0.5) * (semsDoMes.length / ppMes);
            const semIdeal = semsDoMes[Math.min(Math.round(pos), semsDoMes.length - 1)];
            const qtd      = k < nExtra ? qtdExtra : qtdBase;
            pedidos.push({ mi, semIdeal, qtd });
            k++;
          }
        }
      } else {
        // Livre: distribuir np participações uniformemente no ano
        for (let k = 0; k < np; k++) {
          const pos      = (k + 0.5) * (nS / np);
          const semIdeal = sems[Math.min(Math.round(pos), nS - 1)];
          const qtd      = k < nExtra ? qtdExtra : qtdBase;
          pedidos.push({ mi, semIdeal, qtd });
        }
      }
    }
    pedidos.sort((a, b) => a.semIdeal - b.semIdeal);

    // ── ETAPA 4: Alocar na grade respeitando slots disponíveis ──
    const dist        = Array.from({ length: nMun }, () => new Array(nSem).fill(0));
    const slotsUsados = new Array(nSem).fill(0); // quantos não-Umuarama já alocados

    // Limite real de slots por semana: usa munMax (teto do intervalo ou valor fixo)
    // Para semanas com feriado de Umuarama, o slot dela fica disponível
    const limiteSlots = idx.map(si =>
      semSemUmu.has(si) ? munMax - 1 : munMax
    );

    // Alocar Umuarama primeiro
    if (umuIdx >= 0) {
      const { qtdBase, nExtra, qtdExtra } = qtdInfo[umuIdx];
      semUmu.forEach((si, k) => {
        dist[umuIdx][si] = k < nExtra ? qtdExtra : qtdBase;
      });
    }

    // Alocar demais municípios
    for (const { mi, semIdeal, qtd } of pedidos) {
      // Tentar semana ideal; se cheia (≥ munMax-1), buscar a mais próxima com espaço
      let melhor = -1, menorDist = Infinity;
      for (const si of semDispMun[mi]) {
        if (dist[mi][si] > 0) continue; // já alocado nesta semana
        const idxPos = idx.indexOf(si);
        const lim    = idxPos >= 0 ? limiteSlots[idxPos] : munMax - 1;
        if (slotsUsados[si] >= lim) continue; // semana no limite
        const d = Math.abs(si - semIdeal);
        if (d < menorDist) { menorDist = d; melhor = si; }
      }

      if (melhor === -1) {
        // Todas as semanas no limite: alocar na mais próxima disponível mesmo assim
        for (const si of semDispMun[mi]) {
          if (dist[mi][si] > 0) continue;
          const d = Math.abs(si - semIdeal);
          if (d < menorDist) { menorDist = d; melhor = si; }
        }
      }

      if (melhor === -1) continue;
      dist[mi][melhor] = qtd;
      slotsUsados[melhor]++;
    }

    // ── ETAPA 5: Balancear semanas com excesso ──
    for (let iter2 = 0; iter2 < 4; iter2++) {
      let moveu = false;
      for (const si of idx) {
        const idxPos = idx.indexOf(si);
        const lim    = idxPos >= 0 ? limiteSlots[idxPos] : munMax - 1;
        if (slotsUsados[si] <= lim) continue;

        let candidatos = [];
        for (let mi = 0; mi < nMun; mi++) {
          if (mi === umuIdx || dist[mi][si] <= 0) continue;
          const livres = semDispMun[mi].filter(sj => {
            if (sj === si || dist[mi][sj] > 0) return false;
            const ip  = idx.indexOf(sj);
            const lsj = ip >= 0 ? limiteSlots[ip] : munMax - 1;
            return slotsUsados[sj] < lsj;
          });
          candidatos.push({ mi, livres: livres.length, qtd: dist[mi][si] });
        }
        candidatos.sort((a, b) => b.livres - a.livres);

        for (const { mi, qtd } of candidatos) {
          const ipSi = idx.indexOf(si);
          const limSi = ipSi >= 0 ? limiteSlots[ipSi] : munMax - 1;
          if (slotsUsados[si] <= limSi) break;
          // Encontrar destino mais próximo
          let destino = -1, menorD = Infinity;
          for (const sj of semDispMun[mi]) {
            if (sj === si || dist[mi][sj] > 0) continue;
            const ipSj = idx.indexOf(sj);
            const limSj = ipSj >= 0 ? limiteSlots[ipSj] : munMax - 1;
            if (slotsUsados[sj] >= limSj) continue;
            const d = Math.abs(sj - si);
            if (d < menorD) { menorD = d; destino = sj; }
          }
          if (destino === -1) continue;
          dist[mi][destino] = qtd;
          dist[mi][si] = 0;
          slotsUsados[si]--;
          slotsUsados[destino]++;
          moveu = true;
        }
      }
      if (!moveu) break;
    }

    // ── ETAPA 5B: Completar semanas abaixo do mínimo ──────────
    // Após balancear o excesso, verificar semanas com slotsUsados < (munMin - 1)
    // Incluindo Umuarama na contagem: uma semana com só Umuarama = munPorSem=1
    // O mínimo para não-Umuarama é (munMin - 1) quando Umuarama está presente,
    // ou (munMin) quando Umuarama tem feriado nessa semana.

    // Recalcular munPorSem provisório
    const slotsProvisorio = [...slotsUsados];

    for (let iter3 = 0; iter3 < 5; iter3++) {
      let moveu = false;

      for (const si of idx) {
        const idxPos  = idx.indexOf(si);
        const limMax  = idxPos >= 0 ? limiteSlots[idxPos] : munMax - 1;
        const limMin  = semSemUmu.has(si) ? munMin - 1 : munMin; // não-Umuarama mínimo
        if (slotsProvisorio[si] >= limMin) continue; // já tem o suficiente

        // Semana abaixo do mínimo: puxar município de semana com mais espaço
        // Candidatos: municípios que têm participação em semana com excesso
        // E que podem ir nesta semana (sem feriado, sem duplicata)

        // Ordenar semanas por excesso (mais sobrecarregadas primeiro)
        const semsComExcesso = idx
          .filter(sj => sj !== si && slotsProvisorio[sj] > limMax)
          .sort((a, b) => slotsProvisorio[b] - slotsProvisorio[a]);

        // Também aceitar municípios de semanas com mais do que o mínimo
        const semsComFolga = idx
          .filter(sj => sj !== si && slotsProvisorio[sj] > limMin)
          .sort((a, b) => slotsProvisorio[b] - slotsProvisorio[a]);

        const semsOrigem = [...new Set([...semsComExcesso, ...semsComFolga])];

        let preencheu = false;
        for (const sj of semsOrigem) {
          if (slotsProvisorio[si] >= limMin) break;

          // Encontrar município em sj que pode ser movido para si
          // Priorizar: 1) sem periodicidade definida, 2) mais participações (menor impacto)
          // NÃO mover municípios com periodicidade definida se houver alternativa
          let candidatos = [];
          for (let mi = 0; mi < nMun; mi++) {
            if (mi === umuIdx) continue;
            if (dist[mi][sj] <= 0) continue;
            if (dist[mi][si] > 0) continue;
            if (Utils.ehFeriadoMunicipal(municipios[mi].nome, tercas[si], fMun)) continue;
            const nParticMi  = idx.filter(s => dist[mi][s] > 0).length;
            const temPeriod  = particPorMes(resolverPeriodicidade(municipios[mi].regras)) !== null;
            // Verificar que mover não quebra a periodicidade deste município neste mês
            const mesOrigem  = tercas[sj].getMonth() + 1;
            const mesDestino = tercas[si].getMonth() + 1;
            const ppMesMun   = particPorMes(resolverPeriodicidade(municipios[mi].regras));
            let quebraPeriodicidade = false;
            if (ppMesMun !== null) {
              if (mesOrigem !== mesDestino) {
                // Mover para outro mês: verifica se reduzir origem ficaria abaixo de ppMes
                const countOrigem = idx.filter(s => tercas[s].getMonth()+1===mesOrigem && dist[mi][s]>0).length;
                // Semanas disponíveis em outubro para este município
                const semsDispOrigem = semDispMun[mi].filter(s => tercas[s].getMonth()+1===mesOrigem).length;
                // Só proteger se a remoção colocaria abaixo do desejado E ainda há semanas disponíveis
                if (countOrigem - 1 < Math.min(ppMesMun, semsDispOrigem)) quebraPeriodicidade = true;
              }
              // Não adicionar visita extra no mês destino além de ppMes
              const countDestino = idx.filter(s => tercas[s].getMonth()+1===mesDestino && dist[mi][s]>0).length;
              if (countDestino >= ppMesMun) quebraPeriodicidade = true;
            }
            if (!quebraPeriodicidade) {
              candidatos.push({ mi, nPartic: nParticMi, temPeriod });
            }
          }
          // Ordenar: sem periodicidade primeiro, depois mais participações
          candidatos.sort((a, b) => {
            if (a.temPeriod !== b.temPeriod) return a.temPeriod ? 1 : -1;
            return b.nPartic - a.nPartic;
          });

          for (const { mi } of candidatos) {
            if (slotsProvisorio[si] >= limMin) break;
            const qtdMover = dist[mi][sj];
            dist[mi][si] = qtdMover;
            dist[mi][sj] = 0;
            slotsProvisorio[si]++;
            slotsProvisorio[sj]--;
            slotsUsados[si]++;
            slotsUsados[sj]--;
            moveu = true;
            preencheu = true;
          }
        }

        // Se não encontrou de semanas com excesso, puxar da semana com mais municípios
        // — mas nunca quebrar periodicidade
        if (!preencheu && slotsProvisorio[si] < limMin) {
          const semsDisponiveis = idx
            .filter(sj => sj !== si && slotsProvisorio[sj] > 1)
            .sort((a, b) => slotsProvisorio[b] - slotsProvisorio[a]);

          for (const sj of semsDisponiveis) {
            if (slotsProvisorio[si] >= limMin) break;
            const mesOrigem  = tercas[sj].getMonth() + 1;
            const mesDestino = tercas[si].getMonth() + 1;
            for (let mi = 0; mi < nMun; mi++) {
              if (mi === umuIdx) continue;
              if (dist[mi][sj] <= 0 || dist[mi][si] > 0) continue;
              if (Utils.ehFeriadoMunicipal(municipios[mi].nome, tercas[si], fMun)) continue;
              // Proteger periodicidade também no fallback
              const ppMesMunFb = particPorMes(resolverPeriodicidade(municipios[mi].regras));
              if (ppMesMunFb !== null && mesOrigem !== mesDestino) {
                const countOrig = idx.filter(s => tercas[s].getMonth()+1===mesOrigem && dist[mi][s]>0).length;
                const semsDispOrig = semDispMun[mi].filter(s => tercas[s].getMonth()+1===mesOrigem).length;
                if (countOrig - 1 < Math.min(ppMesMunFb, semsDispOrig)) continue;
                const countDest = idx.filter(s => tercas[s].getMonth()+1===mesDestino && dist[mi][s]>0).length;
                if (countDest >= ppMesMunFb) continue;
              }
              dist[mi][si] = dist[mi][sj];
              dist[mi][sj] = 0;
              slotsProvisorio[si]++;
              slotsProvisorio[sj]--;
              slotsUsados[si]++;
              slotsUsados[sj]--;
              moveu = true;
              break;
            }
          }
        }
      }
      if (!moveu) break;
    }
    for (let mi = 0; mi < nMun; mi++) {
      const totalPlan = dist[mi].reduce((s, v) => s + v, 0);
      let faltam = municipios[mi].meta - totalPlan;
      if (faltam <= 0) continue;

      // Aumentar quantidades existentes primeiro
      for (const si of semDispMun[mi]) {
        if (faltam <= 0) break;
        if (dist[mi][si] <= 0) continue;
        const add = Math.min(faltam, maxFrascos - dist[mi][si]);
        if (add > 0) { dist[mi][si] += add; faltam -= add; }
      }
      // Depois adicionar novas participações
      if (faltam > 0) {
        const semsLivres = semDispMun[mi]
          .filter(si => dist[mi][si] === 0)
          .sort((a, b) => slotsUsados[a] - slotsUsados[b]);
        for (const si of semsLivres) {
          if (faltam <= 0) break;
          const qtd = Math.min(faltam, maxFrascos);
          if (qtd < minFrascos && faltam >= minFrascos) continue;
          dist[mi][si] = qtd;
          slotsUsados[si]++;
          faltam -= qtd;
        }
      }
    }

    // ── ETAPA 6: Nivelar capacidade semanal (frascos tipo A) ──
    // Mantém 10 municípios/viagem trocando um município de quantidade alta
    // (em semana acima da capacidade) por um de quantidade menor (em semana
    // com folga). Cada troca preserva o nº de municípios de ambas as semanas
    // e a participação/quantidade de cada município — só muda a semana.
    if (cfg.capacidade) {
      const cap        = cfg.capacidade;
      const totSemOf   = si => { let t = 0; for (let mi = 0; mi < nMun; mi++) t += dist[mi][si]; return t; };
      const mesDe      = si => tercas[si].getMonth() + 1;
      const temPeriod  = mi => particPorMes(resolverPeriodicidade(municipios[mi].regras)) !== null;

      for (let pass = 0; pass < 300; pass++) {
        const acima = idx.filter(si => totSemOf(si) > cap).sort((a, b) => totSemOf(b) - totSemOf(a));
        if (!acima.length) break;
        let moveu = false;

        for (const W of acima) {
          if (totSemOf(W) <= cap) continue;

          // Municípios que podem sair de W, maior quantidade primeiro
          const sairW = [];
          for (let mi = 0; mi < nMun; mi++) {
            if (mi === umuIdx || dist[mi][W] <= 0) continue;
            sairW.push({ mi, q: dist[mi][W] });
          }
          sairW.sort((a, b) => b.q - a.q);

          let trocou = false;
          for (const { mi: A, q: qA } of sairW) {
            if (totSemOf(W) <= cap) break;

            // Semanas com folga, menor total primeiro
            const comFolga = idx.filter(si => si !== W && totSemOf(si) < cap)
                                .sort((a, b) => totSemOf(a) - totSemOf(b));

            for (const U of comFolga) {
              // A precisa poder ir para U (disponível, sem duplicar)
              if (dist[A][U] > 0) continue;
              if (!semDispMun[A].includes(U)) continue;

              // Achar B em U (quantidade menor) que possa vir para W
              let B = -1, qB = Infinity;
              for (let mi = 0; mi < nMun; mi++) {
                if (mi === umuIdx || mi === A) continue;
                if (dist[mi][U] <= 0 || dist[mi][W] > 0) continue;
                if (!semDispMun[mi].includes(W)) continue;
                if (dist[mi][U] < qB) { qB = dist[mi][U]; B = mi; }
              }
              if (B === -1) continue;
              if (qA <= qB) continue;                                  // troca precisa reduzir W
              if (totSemOf(U) + (qA - qB) > cap) continue;             // não criar novo excesso em U

              // Proteger periodicidade quando a troca cruza meses
              if (mesDe(W) !== mesDe(U) && (temPeriod(A) || temPeriod(B))) continue;

              // Executar troca: A vai W→U, B vai U→W
              dist[A][U] = qA; dist[A][W] = 0;
              dist[B][W] = qB; dist[B][U] = 0;
              trocou = true; moveu = true;
              break;
            }
            if (trocou) break;
          }
        }
        if (!moveu) break;
      }

      // ── FASE 2: puxar para cima semanas abaixo do piso (modo intervalo) ──
      // Best-effort: traz um município de quantidade alta de uma semana doadora
      // (que permanece ≥ piso) e devolve um de quantidade menor — sem ultrapassar
      // o teto na semana que recebe. Mantém 10 municípios por semana.
      const piso = cfg.capacidadePiso;
      if (piso) {
        for (let pass = 0; pass < 300; pass++) {
          const abaixo = idx.filter(si => totSemOf(si) > 0 && totSemOf(si) < piso)
                            .sort((a, b) => totSemOf(a) - totSemOf(b));
          if (!abaixo.length) break;
          let moveu = false;

          for (const W of abaixo) {
            if (totSemOf(W) >= piso) continue;

            // Municípios de W que podem sair, menor quantidade primeiro
            const sairW = [];
            for (let mi = 0; mi < nMun; mi++) {
              if (mi === umuIdx || dist[mi][W] <= 0) continue;
              sairW.push({ mi, q: dist[mi][W] });
            }
            sairW.sort((a, b) => a.q - b.q);

            let trocou = false;
            for (const { mi: B, q: qB } of sairW) {
              if (totSemOf(W) >= piso) break;

              // Doadoras: semanas acima do piso, maior total primeiro
              const doadoras = idx.filter(si => si !== W && totSemOf(si) > piso)
                                  .sort((a, b) => totSemOf(b) - totSemOf(a));

              for (const D of doadoras) {
                if (dist[B][D] > 0) continue;            // B não pode duplicar em D
                if (!semDispMun[B].includes(D)) continue;

                // Achar A em D (quantidade maior) que possa vir para W
                let A = -1, qA = -Infinity;
                for (let mi = 0; mi < nMun; mi++) {
                  if (mi === umuIdx || mi === B) continue;
                  if (dist[mi][D] <= 0 || dist[mi][W] > 0) continue;
                  if (!semDispMun[mi].includes(W)) continue;
                  if (dist[mi][D] > qA) { qA = dist[mi][D]; A = mi; }
                }
                if (A === -1) continue;
                if (qA <= qB) continue;                                   // troca precisa elevar W
                if (totSemOf(W) + (qA - qB) > cap) continue;              // não estourar o teto em W
                if (totSemOf(D) - (qA - qB) < piso) continue;             // não derrubar D abaixo do piso

                if (mesDe(W) !== mesDe(D) && (temPeriod(A) || temPeriod(B))) continue;

                // Executar troca: A vai D→W, B vai W→D
                dist[A][W] = qA; dist[A][D] = 0;
                dist[B][D] = qB; dist[B][W] = 0;
                trocou = true; moveu = true;
                break;
              }
              if (trocou) break;
            }
          }
          if (!moveu) break;
        }
      }
    }

    // ── Totais finais ──
    const totSem    = new Array(nSem).fill(0);
    const munPorSem = new Array(nSem).fill(0);
    for (let mi = 0; mi < nMun; mi++)
      for (let si = 0; si < nSem; si++)
        if (dist[mi][si] > 0) { totSem[si] += dist[mi][si]; munPorSem[si]++; }

    // ── Uniformidade por município ──
    const uniformidade = municipios.map((m, mi) => {
      const vals = idx.map(si => dist[mi][si]).filter(v => v > 0);
      if (!vals.length) return { min: 0, max: 0, uniforme: true, partic: 0 };
      const vmin = Math.min(...vals), vmax = Math.max(...vals);
      return { min: vmin, max: vmax, uniforme: vmax - vmin <= 1, partic: vals.length };
    });

    // ── Alertas ──
    const alertas = [];
    const totMun  = municipios.map((m, mi) => dist[mi].reduce((s, v) => s + v, 0));

    const incompletos = municipios
      .map((m, i) => ({ nome: m.nome, meta: m.meta, planejado: totMun[i], faltam: m.meta - totMun[i] }))
      .filter(x => x.faltam > 0);
    if (incompletos.length)
      alertas.push({ tipo: 'incompleto', items: incompletos });

    // Semanas fora do range esperado de municípios
    // No modo fixo: alerta se diferente do valor exato
    // No modo intervalo: alerta apenas se abaixo do mínimo ou acima do máximo
    const semsForaDoAlvo = idx.filter(si => {
      const mps = munPorSem[si];
      if (mps === 0) return false;
      return mps < munMin || mps > munMax;
    });
    if (semsForaDoAlvo.length)
      alertas.push({ tipo: 'semanas_fora_alvo', quantidade: semsForaDoAlvo.length,
        alvo: munMin === munMax ? munMin : `${munMin}–${munMax}` });

    // Capacidade semanal excedida (após nivelamento)
    if (cfg.capacidade) {
      const acima = idx.filter(si => totSem[si] > cfg.capacidade);
      if (acima.length) {
        const maxTot = Math.max(...acima.map(si => totSem[si]));
        alertas.push({ tipo: 'capacidade_excedida', quantidade: acima.length,
          capacidade: cfg.capacidade, maior: maxTot });
      }
    }

    // Capacidade — semanas abaixo do piso do intervalo (aviso, não erro)
    if (cfg.capacidadePiso) {
      const abaixo = idx.filter(si => totSem[si] > 0 && totSem[si] < cfg.capacidadePiso);
      if (abaixo.length) {
        const menor = Math.min(...abaixo.map(si => totSem[si]));
        alertas.push({ tipo: 'capacidade_abaixo_piso', quantidade: abaixo.length,
          piso: cfg.capacidadePiso, menor });
      }
    }

    // Alerta de frascos por semana — poucos
    if (cfg.alvoMin) {
      const baixas = idx.filter(si => totSem[si] > 0 && totSem[si] < cfg.alvoMin);
      if (baixas.length) alertas.push({ tipo: 'viagem_baixa', quantidade: baixas.length, alvo: cfg.alvoMin });
    }

    // Alerta de frascos por semana — muitos
    if (cfg.alvoMax) {
      const altas = idx.filter(si => totSem[si] > cfg.alvoMax);
      if (altas.length) alertas.push({ tipo: 'viagem_alta', quantidade: altas.length, alvo: cfg.alvoMax });
    }

    // ── Verificar cumprimento da periodicidade por município ──
    // Compara o que foi planejado vs o que foi configurado mês a mês
    const periodicidadeViolada = [];
    municipios.forEach((m, mi) => {
      if (mi === umuIdx) return;
      const period = resolverPeriodicidade(m.regras);
      const ppMes  = particPorMes(period);
      if (ppMes === null) return; // 'livre' — não verificar

      const mesesComDesvio = [];
      for (const mes of mesesAtivos) {
        // Semanas disponíveis para este município neste mês
        const semsDispMes = semDispMun[mi].filter(si => tercas[si].getMonth() + 1 === mes);
        if (!semsDispMes.length) continue;

        // Participações planejadas neste mês
        const participacoes = idx.filter(si =>
          tercas[si].getMonth() + 1 === mes && dist[mi][si] > 0
        ).length;

        // Máximo possível dado o número de semanas disponíveis
        const maxPossivel = Math.min(ppMes, semsDispMes.length);

        if (participacoes !== maxPossivel) {
          mesesComDesvio.push({
            mes:          Utils.MESES_PT[mes - 1],
            planejado:    participacoes,
            esperado:     maxPossivel,
            disponiveis:  semsDispMes.length,
          });
        }
      }

      if (mesesComDesvio.length > 0) {
        periodicidadeViolada.push({
          municipio: m.nome,
          period,
          ppMes,
          meses: mesesComDesvio,
        });
      }
    });

    if (periodicidadeViolada.length > 0) {
      alertas.push({ tipo: 'periodicidade_nao_cumprida', items: periodicidadeViolada });
    }

    const totalDist  = totSem.reduce((a, b) => a + b, 0);
    const totalEsper = municipios.reduce((a, m) => a + m.meta, 0);

    return {
      ok: true, cfg, municipios,
      tercas:           tercas.map(t => t.toISOString()),
      semanasAtivas,    semanasAtivasIdx: idx,
      dist, totSem, munPorSem, uniformidade,
      alertas, totalDist, totalEsper,
      taxa: totalEsper > 0 ? totalDist / totalEsper : 0,
      geradoEm: new Date().toISOString(),
    };
  }

  /* ── Cronograma para módulo municipal ─────── */
  function toCronograma(plano) {
    if (!plano?.ok) return null;
    const tercas = plano.tercas.map(s => new Date(s));
    const muns   = {};
    plano.municipios.forEach((m, mi) => {
      const coletas = [];
      plano.semanasAtivasIdx.forEach(si => {
        const qtd = plano.dist[mi][si];
        if (qtd > 0) coletas.push({
          date:    tercas[si].toISOString().split('T')[0],
          isoWeek: Utils.semanaISO(tercas[si]),
          count:   qtd,
        });
      });
      if (coletas.length) muns[m.nome] = coletas;
    });
    const datas = tercas.filter((_, si) => plano.totSem[si] > 0);
    return {
      meta: {
        year:      plano.cfg.ano,
        firstDate: datas.length ? datas[0].toISOString().split('T')[0] : '',
        lastDate:  datas.length ? datas[datas.length-1].toISOString().split('T')[0] : '',
        dateCount: plano.semanasAtivasIdx.filter(si => plano.totSem[si] > 0).length,
      },
      municipios: muns,
      geradoEm:   plano.geradoEm,
      status:     plano.status || 'rascunho',
    };
  }

  return { gerar, validar, toCronograma };
})();
