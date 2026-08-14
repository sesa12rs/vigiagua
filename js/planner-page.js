/* VigiÁgua — Lógica da página do Planejador (Regional).
   Extraído do <script> inline de planner.html (Fase 1, item 3) — sem alteração de comportamento.
   Mantido como script GLOBAL (não módulo): os onclick= do HTML dependem das funções globais. */
/* ════════════════════════════════════════════
   ESTADO GLOBAL
   ════════════════════════════════════════════ */
let municipios    = [];
let feriados      = {};
let tercas        = [];
let semanasAtivas = [];
let planoAtual    = null;
let munEditIdx    = null;
let ferEditRef    = null;

/* ════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════ */
function init() {
  const s = DB.Auth.exigirPerfil('regional');
  document.getElementById('nomeUsuario').textContent = s.nome;

  municipios = DB.Municipios.listar();
  feriados   = DB.Feriados.carregar();

  carregarConfigUI();
  inicializarSemanas();

  sincronizarAnoInput();
  renderResumos();
  renderMunicipios();
  renderSemanasGrid();
  renderFeriados();
  renderStatusPlano();
  renderPainelPlanos();
  renderAcompanhamento();
  renderLaboratorio();
  renderConsolidado();
  atualizarAnoContexto();
  _backupInfo();
  document.addEventListener('click', e => {
    if (_yearpickAberto && !e.target.closest('#yearpick')) fecharYearpick();
  });

  // Carrega o plano do ANO atualmente no formulário (não "o mais recente"),
  // mantendo formulário e resultado sempre coerentes.
  const anoForm = parseInt(document.getElementById('cfgAno').value) || null;
  planoAtual = anoForm ? DB.Plano.carregar(anoForm) : null;
  if (planoAtual && planoAtual.ok) mostrarResultado();
}
if (DB.Sync.habilitado()) { DB.Sync.ready.then(init); } else { init(); }

/* ════════════════════════════════════════════
   TABS
   ════════════════════════════════════════════ */
function trocarTab(n) {
  [1, 3, 4, 5, 6].forEach(i => {
    const t = document.getElementById('tab' + i);
    if (t) t.style.display = (n === i) ? 'block' : 'none';
    const b = document.getElementById('tabBtn' + i);
    if (b) b.classList.toggle('active', n === i);
  });
  if (n === 3) renderAcompanhamento();
  if (n === 4) renderLaboratorio();
  if (n === 5) renderConsolidado();
  if (n === 6) { renderPainelPlanos(); _backupInfo(); }
}

/* ── Sub-navegação da aba Planejamento ── */
function trocarSubPlan(nome) {
  ['Regras', 'Calendario', 'Municipios', 'Gerar'].forEach(k => {
    const p = document.getElementById('sub' + k);
    if (p) p.style.display = (k === nome) ? 'block' : 'none';
    const b = document.getElementById('subBtn' + k);
    if (b) b.classList.toggle('active', k === nome);
  });
}

/* ════════════════════════════════════════════
   ACOMPANHAMENTO DOS MUNICÍPIOS (aba 3)
   Lê os planos municipais (DB.MunPlano) do ano em contexto e
   monta cards de resumo + lista com status e progresso.
   Não altera o armazenamento — apenas consulta os blobs.
   ════════════════════════════════════════════ */
function acompAno() {
  return parseInt(document.getElementById('cfgAno').value, 10) || new Date().getFullYear();
}

function acompTrocarAno(v) {
  const ano = parseInt(v, 10);
  if (!ano) return;
  document.getElementById('cfgAno').value = ano;
  renderAcompanhamento();
}

async function acompAtualizar() {
  const btn = document.getElementById('btnAcompAtualizar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Atualizando…'; }
  try { if (DB.Sync.habilitado()) await DB.Sync.pull(); } catch (e) { /* ignora */ }
  if (btn) { btn.disabled = false; btn.textContent = '🔄 Atualizar'; }
  renderAcompanhamento();
  mostrarToast('🔄 Acompanhamento atualizado com os dados do banco.');
}

// Rótulo + cores de cada status (usa tokens do design system)
function _acompBadge(l) {
  if (l.status === 'concluido')
    return { txt: '✅ Concluído', bg: 'var(--green-50)',  bd: 'var(--green-600)',  fg: 'var(--green-700)' };
  if (l.status === 'rascunho')
    return { txt: '✏️ Em preenchimento', bg: 'var(--blue-50)', bd: 'var(--blue-600)', fg: 'var(--blue-700)' };
  return { txt: '⚪ Não iniciado', bg: 'var(--slate-100)', bd: 'var(--slate-400)', fg: 'var(--slate-600)' };
}

function _acompCard(rotulo, valor, cor, bg) {
  return `<div style="flex:1;min-width:130px;background:${bg};border:1px solid ${cor}22;border-radius:12px;padding:14px 16px;">
    <div style="font-size:26px;font-weight:800;line-height:1;color:${cor};font-family:var(--font-display);">${valor}</div>
    <div style="font-size:12.5px;color:var(--slate-600);margin-top:6px;font-weight:600;">${rotulo}</div>
  </div>`;
}

function renderAcompanhamento() {
  const ano = acompAno();
  const inp = document.getElementById('acompAnoInput');
  if (inp) inp.value = ano;

  if (typeof DB === 'undefined' || !DB.MunPlano) return;
  const linhas = DB.MunPlano.resumoTodos(ano);

  const total  = linhas.length;
  const nConcl = linhas.filter(l => l.status === 'concluido').length;
  const nRasc  = linhas.filter(l => l.status === 'rascunho').length;
  const nNao   = linhas.filter(l => l.status === 'nao_iniciado').length;
  const nFora  = linhas.filter(l => l.foraDoPrazo).length;

  const badge = document.getElementById('badgeAcompanhamento');
  if (badge) badge.textContent = `${nConcl}/${total}`;

  // ── Cards de resumo + barra de progresso geral ──
  const resumo = document.getElementById('acompResumo');
  if (resumo) {
    const pctGeral = total ? Math.round((nConcl / total) * 100) : 0;
    let cards = `<div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px;">`
      + _acompCard('Concluídos',      nConcl, 'var(--green-600)', 'var(--green-50)')
      + _acompCard('Em preenchimento', nRasc,  'var(--blue-600)',  'var(--blue-50)')
      + _acompCard('Não iniciados',    nNao,   'var(--slate-500)', 'var(--slate-100)')
      + _acompCard('Fora do prazo',    nFora,  nFora ? 'var(--red-600)' : 'var(--slate-400)', nFora ? 'var(--red-50)' : 'var(--slate-100)')
      + `</div>`;
    cards += `<div style="background:var(--slate-100);border-radius:999px;height:14px;overflow:hidden;">`
      + `<div style="width:${pctGeral}%;height:100%;background:var(--green-500);border-radius:999px;transition:width .3s;"></div></div>`
      + `<div style="text-align:center;font-size:13px;color:var(--slate-600);margin-top:6px;font-weight:600;">`
      + `${nConcl} de ${total} planos concluídos (${pctGeral}%)</div>`;
    resumo.innerHTML = cards;
  }

  // ── Lista filtrada ──
  const busca  = (document.getElementById('acompBusca')?.value || '').trim().toLowerCase();
  const filtro = document.getElementById('acompFiltro')?.value || 'todos';
  let vis = linhas.filter(l => l.nome.toLowerCase().includes(busca));
  if (filtro === 'fora_prazo')       vis = vis.filter(l => l.foraDoPrazo);
  else if (filtro !== 'todos')       vis = vis.filter(l => l.status === filtro);

  const lista = document.getElementById('acompLista');
  if (!lista) return;
  if (!vis.length) {
    lista.innerHTML = `<p style="text-align:center;color:var(--slate-500);padding:24px;">Nenhum município neste filtro.</p>`;
    return;
  }

  const fmt = iso => iso ? new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' })
                          + ' ' + new Date(iso).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) : '—';

  let html = `<div style="display:flex;flex-direction:column;gap:8px;">`;
  vis.forEach(l => {
    const b = _acompBadge(l);
    const foraTag = l.foraDoPrazo
      ? `<span style="margin-left:6px;background:var(--red-50);border:1px solid var(--red-300);color:var(--red-700);border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;">⏰ fora do prazo</span>`
      : '';
    const barCor = l.status === 'concluido' ? 'var(--green-500)' : 'var(--blue-500)';
    const prog = l.total
      ? `<div style="display:flex;align-items:center;gap:8px;min-width:190px;">
           <div style="flex:1;background:var(--slate-100);border-radius:999px;height:8px;overflow:hidden;">
             <div style="width:${l.pct}%;height:100%;background:${barCor};"></div>
           </div>
           <span style="font-size:12px;color:var(--slate-600);white-space:nowrap;">${l.comLocal}/${l.total} locais</span>
         </div>`
      : `<span style="font-size:12px;color:var(--slate-400);min-width:190px;">sem coletas preenchidas</span>`;
    const quando = l.status === 'concluido'
      ? `concluído ${fmt(l.concluidoEm)}`
      : (l.salvoEm ? `atualizado ${fmt(l.salvoEm)}` : 'nunca aberto');

    html += `<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;
                 border:1px solid var(--slate-200);border-radius:12px;padding:12px 16px;background:#fff;">
      <div style="min-width:200px;">
        <div style="font-weight:700;color:var(--slate-800);">${l.nome}${foraTag}</div>
        <div style="font-size:12px;color:var(--slate-500);margin-top:2px;">meta anual: ${l.meta} por tipo (${l.meta*2} amostras) · ${quando}</div>
      </div>
      ${prog}
      <span style="background:${b.bg};border:1px solid ${b.bd};color:${b.fg};border-radius:999px;
                   padding:5px 12px;font-size:12.5px;font-weight:700;white-space:nowrap;">${b.txt}</span>
    </div>`;
  });
  html += `</div>`;
  lista.innerHTML = html;
}

/* ════════════════════════════════════════════
   LABORATÓRIO (aba 4) — carga, heatmap, romaneio
   Usa Relatorios.dadosLaboratorio(plano) como fonte.
   ════════════════════════════════════════════ */
var _labDados = null;  // var (não let): init() roda antes desta linha no script

function labAno() {
  return parseInt(document.getElementById('cfgAno').value, 10) || new Date().getFullYear();
}
function labTrocarAno(v) {
  const a = parseInt(v, 10);
  if (!a) return;
  document.getElementById('cfgAno').value = a;
  renderLaboratorio();
}
function _fmtDDMM(d) {
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}

function renderLaboratorio() {
  const ano = labAno();
  const inp = document.getElementById('labAnoInput');
  if (inp) inp.value = ano;

  const plano = (typeof DB !== 'undefined' && DB.Plano) ? DB.Plano.carregar(ano) : null;
  const dados = (typeof Relatorios !== 'undefined') ? Relatorios.dadosLaboratorio(plano) : null;
  _labDados = dados;

  const badge = document.getElementById('badgeLaboratorio');
  const vazio = document.getElementById('labVazio');
  const cont  = document.getElementById('labConteudo');

  if (!dados) {
    if (badge) badge.textContent = '—';
    if (cont)  cont.style.display = 'none';
    if (vazio) {
      vazio.style.display = '';
      vazio.innerHTML = `<div class="card" style="text-align:center;color:var(--slate-500);padding:32px;">`
        + `🧪 Nenhum plano gerado para <strong>${ano}</strong>. Gere e publique o plano na aba `
        + `<strong>⚙️ Planejamento</strong> para ver a carga do laboratório, o heatmap e o romaneio.</div>`;
    }
    return;
  }

  if (badge) badge.textContent = String(dados.semanas.length);
  if (vazio) vazio.style.display = 'none';
  if (cont)  cont.style.display = '';

  // Totais + escala
  const totais = document.getElementById('labResumoTotais');
  if (totais) {
    totais.innerHTML = `No ano: <strong>${dados.totalAmostrasA}</strong> físico-químicas + <strong>${dados.totalAmostrasA}</strong> microbiológicas = `
      + `<strong>${dados.totalFrascosAno}</strong> amostras · em <strong>${dados.semanas.length}</strong> viagens`
      + (dados.capacidade != null ? ` · capacidade <strong>${dados.capacidade}</strong>/semana por tipo (${dados.capacidade * 2} análises no total)` : '');
  }

  renderLabCarga(dados);
  renderLabHeatmap(dados);
  renderLabRomaneio(dados);
}

function renderLabCarga(dados) {
  const el = document.getElementById('labCarga');
  if (!el) return;
  const n = dados.semanas.length;
  const cap = dados.capacidade;
  const barW = 20, gap = 8, chartH = 168, padTop = 12, padBottom = 30, padLeft = 34;
  const scaleMax = (Math.max(dados.cargaMax, cap || 0) * 1.12) || 1;
  const W = padLeft + n * (barW + gap) + 12;
  const H = padTop + chartH + padBottom;
  const yBase = padTop + chartH;
  const rotulaCada = Math.ceil(n / 26) || 1;

  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="inherit">`;
  // baseline
  svg += `<line x1="${padLeft}" y1="${yBase}" x2="${W - 4}" y2="${yBase}" stroke="var(--slate-300)"/>`;
  // linha de capacidade
  if (cap != null && cap > 0) {
    const yc = yBase - (cap / scaleMax) * chartH;
    svg += `<line x1="${padLeft}" y1="${yc.toFixed(1)}" x2="${W - 4}" y2="${yc.toFixed(1)}" stroke="var(--red-500)" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    svg += `<text x="${padLeft}" y="${(yc - 4).toFixed(1)}" font-size="10" fill="var(--red-600)" font-weight="700">capacidade ${cap}/tipo</text>`;
  }
  dados.semanas.forEach((s, i) => {
    const x = padLeft + i * (barW + gap);
    const h = (s.totalA / scaleMax) * chartH;
    const y = yBase - h;
    let cor = 'var(--blue-500)';
    if (cap != null && cap > 0) {
      if (s.totalA > cap)          cor = 'var(--red-500)';
      else if (s.totalA >= cap * 0.9) cor = 'var(--amber-500)';
    }
    svg += `<rect x="${x}" y="${y.toFixed(1)}" width="${barW}" height="${Math.max(h, 0).toFixed(1)}" rx="3" fill="${cor}"><title>Semana ${s.semana} (${_fmtDDMM(s.data)}): ${s.totalA} físico-químicas · ${s.totalA} microbiológicas · ${s.totalFrascos} amostras</title></rect>`;
    svg += `<text x="${x + barW / 2}" y="${(y - 4).toFixed(1)}" font-size="9.5" text-anchor="middle" fill="var(--slate-600)">${s.totalA}</text>`;
    if (i % rotulaCada === 0)
      svg += `<text x="${x + barW / 2}" y="${yBase + 14}" font-size="9" text-anchor="middle" fill="var(--slate-500)">${_fmtDDMM(s.data)}</text>`;
  });
  svg += `</svg>`;
  el.innerHTML = svg;
}

function renderLabHeatmap(dados) {
  const el = document.getElementById('labHeatmap');
  if (!el) return;
  const cellStyle = v => {
    if (!v)      return '';
    if (v === 1) return 'background:var(--blue-100);color:var(--slate-700);';
    if (v === 2) return 'background:var(--blue-300);color:var(--slate-800);';
    if (v === 3) return 'background:var(--blue-500);color:#fff;font-weight:700;';
    return 'background:var(--blue-700);color:#fff;font-weight:700;';
  };
  let h = '<table class="lab-heat"><thead><tr><th class="lab-heat__mun">Município</th>';
  dados.heatmap.colunas.forEach(c => {
    h += `<th title="Semana ${c.semana} — ${c.data.toLocaleDateString('pt-BR')}">${_fmtDDMM(c.data)}</th>`;
  });
  h += '<th class="lab-heat__tot">Total</th></tr></thead><tbody>';
  dados.heatmap.linhas.forEach(l => {
    h += `<tr><td class="lab-heat__mun">${l.nome}</td>`;
    l.celulas.forEach(v => { h += `<td style="${cellStyle(v)}">${v || ''}</td>`; });
    h += `<td class="lab-heat__tot">${l.total}</td></tr>`;
  });
  h += `<tr class="lab-heat__foot"><td class="lab-heat__mun">Total/semana (coletas)</td>`;
  dados.semanas.forEach(s => { h += `<td>${s.totalA}</td>`; });
  h += `<td>${dados.totalAmostrasA}</td></tr>`;
  h += '</tbody></table>';
  el.innerHTML = h;
}

function renderLabRomaneio(dados) {
  const el = document.getElementById('labRomaneio');
  if (!el) return;
  let r = '<div style="display:flex;flex-direction:column;gap:12px;">';
  dados.semanas.forEach(s => {
    r += `<div style="border:1px solid var(--slate-200);border-radius:12px;padding:12px 16px;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:baseline;border-bottom:1px solid var(--slate-100);padding-bottom:8px;margin-bottom:8px;">
        <strong style="color:var(--slate-800);">Semana ${s.semana} · ${s.data.toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'2-digit' })}</strong>
        <span style="font-size:12.5px;color:var(--slate-600);">${s.nMun} municípios · <strong>${s.totalA}</strong> físico-químicas · <strong>${s.totalB}</strong> microbiológicas · <strong>${s.totalFrascos}</strong> amostras</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">`;
    s.municipios.forEach(m => {
      r += `<span style="background:var(--slate-100);border-radius:999px;padding:3px 10px;font-size:12px;color:var(--slate-700);">${m.nome} <strong>${m.qtd}</strong></span>`;
    });
    r += `</div></div>`;
  });
  r += '</div>';
  el.innerHTML = r;
}

function baixarCsvResumoSemanal() {
  if (!_labDados) { mostrarToast('Gere o plano do ano primeiro.'); return; }
  const csv = Relatorios.csvResumoSemanal(_labDados);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `vigiagua_resumo_semanal_${_labDados.ano}.csv`;
  a.click();
}

function baixarCsvHeatmap() {
  if (!_labDados) { mostrarToast('Gere o plano do ano primeiro.'); return; }
  const csv = Relatorios.csvHeatmap(_labDados);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `vigiagua_heatmap_${_labDados.ano}.csv`;
  a.click();
}

function imprimirRomaneio() {
  if (!_labDados) { mostrarToast('Gere o plano do ano primeiro.'); return; }
  const d = _labDados;
  let body = `<h1>Romaneio de coletas — 12ª RS · ${d.ano}</h1>`
    + `<p class="sub">Total no ano: <b>${d.totalAmostrasA}</b> físico-químicas + <b>${d.totalAmostrasA}</b> microbiológicas = <b>${d.totalFrascosAno}</b> amostras`
    + (d.capacidade != null ? ` · capacidade ${d.capacidade}/semana por tipo (${d.capacidade * 2} no total)` : '') + `.</p>`;
  d.semanas.forEach(s => {
    body += `<div class="viagem"><h2>Semana ${s.semana} — ${s.data.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}</h2>`
      + `<table><thead><tr><th>Município</th><th>Coletas</th></tr></thead><tbody>`;
    s.municipios.forEach(m => { body += `<tr><td>${m.nome}</td><td>${m.qtd}</td></tr>`; });
    body += `<tr class="tot"><td>Total físico-químicas</td><td>${s.totalA}</td></tr>`
      + `<tr class="tot"><td>Total microbiológicas</td><td>${s.totalB}</td></tr>`
      + `<tr class="tot"><td>Total de amostras</td><td>${s.totalFrascos}</td></tr>`
      + `</tbody></table></div>`;
  });
  const win = window.open('', '_blank');
  if (!win) { mostrarToast('Permita pop-ups para imprimir o romaneio.'); return; }
  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Romaneio ${d.ano}</title>`
    + `<style>body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;margin:24px;}`
    + `h1{font-size:20px;margin:0 0 4px;}.sub{color:#475569;margin:0 0 18px;font-size:13px;}`
    + `.viagem{margin-bottom:18px;break-inside:avoid;page-break-inside:avoid;}`
    + `h2{font-size:14px;margin:0 0 6px;border-bottom:2px solid #0ea5e9;padding-bottom:3px;}`
    + `table{border-collapse:collapse;width:100%;max-width:520px;font-size:12.5px;}`
    + `th,td{border:1px solid #cbd5e1;padding:4px 8px;text-align:left;}th{background:#f1f5f9;}`
    + `td:last-child,th:last-child{text-align:right;width:130px;}tr.tot td{font-weight:bold;background:#f8fafc;}`
    + `</style></head><body>${body}<script>window.onload=function(){window.print();}<\/script></body></html>`);
  win.document.close();
}

/* ════════════════════════════════════════════
   CONSOLIDADO DE COLETAS (aba 5)
   Achata os planos municipais (Relatorios.consolidadoColetas) numa
   tabela única filtrável e exportável. Não altera o armazenamento.
   ════════════════════════════════════════════ */
var _consLinhas    = [];   // var (não let): evita TDZ se init rodar antes
var _consFiltradas = [];

function consAno() {
  return parseInt(document.getElementById('cfgAno').value, 10) || new Date().getFullYear();
}
function consTrocarAno(v) {
  const a = parseInt(v, 10);
  if (!a) return;
  document.getElementById('cfgAno').value = a;
  renderConsolidado();
}
function _consFmtData(iso) {
  if (!iso) return '—';
  const p = iso.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}
function _consChk(v) {
  return v ? '<span style="color:var(--green-600);font-weight:700;">✓</span>' : '<span style="color:var(--slate-300);">–</span>';
}
function _consTipoBadge(t) {
  const c = t === 'Normal' ? ['var(--blue-50)', 'var(--blue-700)']
          : t === 'Filha'  ? ['var(--amber-50)', 'var(--amber-700)']
          :                  ['var(--slate-100)', 'var(--slate-600)'];
  const rot = t === 'Filha' ? 'Filha -CR' : t;
  return `<span style="background:${c[0]};color:${c[1]};border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;white-space:nowrap;">${rot}</span>`;
}

function renderConsolidado() {
  const ano = consAno();
  const inp = document.getElementById('consAnoInput');
  if (inp) inp.value = ano;

  const res = (typeof Relatorios !== 'undefined') ? Relatorios.consolidadoColetas(ano) : { linhas: [], municipiosPreenchidos: 0 };
  _consLinhas = res.linhas;

  const badge = document.getElementById('badgeConsolidado');
  const vazio = document.getElementById('consVazio');
  const cont  = document.getElementById('consConteudo');

  if (!_consLinhas.length) {
    if (badge) badge.textContent = '—';
    if (cont)  cont.style.display = 'none';
    if (vazio) {
      vazio.style.display = '';
      vazio.innerHTML = `<div class="card" style="text-align:center;color:var(--slate-500);padding:32px;">`
        + `📋 Nenhum município preencheu coletas em <strong>${ano}</strong> ainda. `
        + `Assim que os municípios começarem a preencher seus planos, elas aparecem aqui.</div>`;
    }
    return;
  }

  if (badge) badge.textContent = String(_consLinhas.length);
  if (vazio) vazio.style.display = 'none';
  if (cont)  cont.style.display = '';

  // Cards de resumo (totais do ano)
  const resumo = document.getElementById('consResumo');
  if (resumo) {
    const nNorm = _consLinhas.filter(l => l.tipo === 'Normal').length;
    const nFilh = _consLinhas.filter(l => l.tipo === 'Filha').length;
    const nExtr = _consLinhas.filter(l => l.tipo === 'Extra').length;
    const cMB = _consLinhas.filter(l => l.mb).length;
    const cTB = _consLinhas.filter(l => l.tb).length;
    const cCR = _consLinhas.filter(l => l.cr).length;
    const cFL = _consLinhas.filter(l => l.fl).length;
    resumo.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:10px;">`
      + _acompCard('Total de coletas',      _consLinhas.length, 'var(--blue-600)',  'var(--blue-50)')
      + _acompCard('Municípios preenchidos', res.municipiosPreenchidos, 'var(--green-600)', 'var(--green-50)')
      + _acompCard('Normais / Filhas / Extras', `${nNorm}/${nFilh}/${nExtr}`, 'var(--slate-600)', 'var(--slate-100)')
      + `</div>`
      + `<div style="display:flex;flex-wrap:wrap;gap:8px;font-size:12.5px;color:var(--slate-600);">`
      + `<span style="background:#fff;border:1px solid var(--slate-200);border-radius:999px;padding:4px 12px;">MB <strong>${cMB}</strong></span>`
      + `<span style="background:#fff;border:1px solid var(--slate-200);border-radius:999px;padding:4px 12px;">TB <strong>${cTB}</strong></span>`
      + `<span style="background:#fff;border:1px solid var(--slate-200);border-radius:999px;padding:4px 12px;">CR <strong>${cCR}</strong></span>`
      + `<span style="background:#fff;border:1px solid var(--slate-200);border-radius:999px;padding:4px 12px;">FL <strong>${cFL}</strong></span>`
      + `</div>`;
  }

  // Filtro de município (preserva a seleção atual)
  const sel = document.getElementById('consMun');
  if (sel) {
    const atual = sel.value;
    const muns = [...new Set(_consLinhas.map(l => l.municipio))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    sel.innerHTML = `<option value="">Todos os municípios</option>` + muns.map(m => `<option value="${m}">${m}</option>`).join('');
    if (muns.includes(atual)) sel.value = atual;
  }

  aplicarFiltrosConsolidado();
}

function aplicarFiltrosConsolidado() {
  const mun     = document.getElementById('consMun')?.value || '';
  const mes     = document.getElementById('consMes')?.value || '';
  const sistema = document.getElementById('consSistema')?.value || '';
  const param   = document.getElementById('consParam')?.value || '';
  const tipo    = document.getElementById('consTipo')?.value || '';
  const busca   = (document.getElementById('consBusca')?.value || '').trim().toLowerCase();

  _consFiltradas = _consLinhas.filter(l => {
    if (mun && l.municipio !== mun) return false;
    if (mes && String(l.mes) !== mes) return false;
    if (sistema && l.sistema !== sistema) return false;
    if (tipo && l.tipo !== tipo) return false;
    if (param && !l[param]) return false;
    if (busca && !l.local.toLowerCase().includes(busca)) return false;
    return true;
  });

  const cont = document.getElementById('consContagem');
  if (cont) cont.innerHTML = `Mostrando <strong>${_consFiltradas.length}</strong> de ${_consLinhas.length} coletas.`;

  const tbl = document.getElementById('consTabela');
  if (!tbl) return;
  if (!_consFiltradas.length) {
    tbl.innerHTML = `<p style="text-align:center;color:var(--slate-500);padding:24px;">Nenhuma coleta neste filtro.</p>`;
    return;
  }

  let h = `<table class="cons-table"><thead><tr>`
    + `<th>Município</th><th>ID</th><th>Data</th><th>Sem</th><th>Tipo</th><th>Local</th><th>Sistema</th>`
    + `<th>MB</th><th>TB</th><th>CR</th><th>FL</th><th>Critério</th></tr></thead><tbody>`;
  _consFiltradas.forEach(l => {
    h += `<tr>`
      + `<td>${l.municipio}</td>`
      + `<td style="white-space:nowrap;font-variant-numeric:tabular-nums;">${l.id}</td>`
      + `<td style="white-space:nowrap;">${_consFmtData(l.data)}</td>`
      + `<td>${l.semana || '—'}</td>`
      + `<td>${_consTipoBadge(l.tipo)}</td>`
      + `<td>${l.local ? l.local : '<span style="color:var(--red-500);">— sem local —</span>'}</td>`
      + `<td>${l.sistema}</td>`
      + `<td>${_consChk(l.mb)}</td><td>${_consChk(l.tb)}</td><td>${_consChk(l.cr)}</td><td>${_consChk(l.fl)}</td>`
      + `<td style="white-space:nowrap;">${l.criterio || '—'}</td>`
      + `</tr>`;
  });
  h += `</tbody>`;

  // Rodapé de TOTAIS (da visão filtrada), com contagem por parâmetro
  const mostrarNao = document.getElementById('consMostrarNao')?.checked;
  const n = _consFiltradas.length;
  const contarParam = p => _consFiltradas.filter(l => l[p]).length;
  const cMB = contarParam('mb'), cTB = contarParam('tb'), cCR = contarParam('cr'), cFL = contarParam('fl');
  const cel = com => mostrarNao
    ? `<strong>${com}</strong> <span style="color:var(--slate-400);">/ ${n - com}</span>`
    : `<strong>${com}</strong>`;
  h += `<tfoot><tr class="cons-foot">`
    + `<td colspan="7">TOTAIS — ${n} coleta(s)${mostrarNao ? ' · <span style="color:var(--slate-400);">✓ com / ✗ sem</span>' : ''}</td>`
    + `<td>${cel(cMB)}</td><td>${cel(cTB)}</td><td>${cel(cCR)}</td><td>${cel(cFL)}</td><td></td>`
    + `</tr></tfoot>`;

  h += `</table>`;
  tbl.innerHTML = h;
}

function baixarCsvConsolidado() {
  if (!_consFiltradas || !_consFiltradas.length) { mostrarToast('Nenhuma coleta para exportar.'); return; }
  const csv = Relatorios.csvConsolidado(_consFiltradas);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `vigiagua_consolidado_${consAno()}.csv`;
  a.click();
}

/* ════════════════════════════════════════════
   BACKUP E SEGURANÇA (Regional)
   Exporta/restaura todo o va_store via DB.Sync. Sem armazenamento
   novo — arquivo JSON local + upsert no banco. O lembrete usa uma
   marca local por máquina (va_ultimo_backup em localStorage).
   ════════════════════════════════════════════ */
var _BACKUP_DIAS = 7;

function _ultimoBackup() {
  const v = localStorage.getItem('va_ultimo_backup');
  return v ? new Date(v) : null;
}
function _diasDesde(d) {
  return d ? Math.floor((Date.now() - d.getTime()) / 86400000) : Infinity;
}

async function exportarBackup() {
  mostrarToast('💾 Preparando backup…');
  let res;
  try { res = await DB.Sync.exportar(); }
  catch (e) { mostrarToast('⚠️ Falha ao exportar: ' + e.message); return; }
  if (!res || !res.ok) { mostrarToast('⚠️ Falha ao exportar: ' + ((res && res.erro) || 'erro')); return; }
  const arquivo = {
    app: 'VigiÁgua', tipo: 'backup-va_store',
    versao: (window.VIGIAGUA_VERSAO || '?'),
    geradoEm: res.geradoEm, origem: res.origem, total: res.total,
    registros: res.registros,
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(arquivo, null, 2)], { type: 'application/json' }));
  a.download = `vigiagua_backup_${res.geradoEm.slice(0, 10)}.json`;
  a.click();
  localStorage.setItem('va_ultimo_backup', new Date().toISOString());
  _backupInfo();
  mostrarToast(`✅ Backup gerado (${res.total} registros).`);
}

/* ── Classificação de chaves para escopo de restauração ── */
function _ehChaveMunicipio(k) {
  return k.startsWith('va_munplano_') || k.startsWith('va_previewedit_');
}
function _municipioDaChave(k) {
  let rest = null;
  if (k.startsWith('va_munplano_'))    rest = k.slice('va_munplano_'.length);
  else if (k.startsWith('va_previewedit_')) rest = k.slice('va_previewedit_'.length);
  if (rest == null) return null;
  const i = rest.lastIndexOf('_');   // separa o _ANO final (o nome do município nao tem "_")
  return i > 0 ? rest.slice(0, i) : rest;
}
function _municipiosNoBackup(registros) {
  const set = new Set();
  Object.keys(registros).forEach(k => { if (_ehChaveMunicipio(k)) { const m = _municipioDaChave(k); if (m) set.add(m); } });
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
function _filtrarRegistros(registros, escopo, muns) {
  const out = {};
  Object.entries(registros).forEach(([k, v]) => {
    const ehMun = _ehChaveMunicipio(k);
    if (escopo === 'tudo') out[k] = v;
    else if (escopo === 'planejamento') { if (!ehMun) out[k] = v; }
    else if (escopo === 'municipios')   { if (ehMun && muns.includes(_municipioDaChave(k))) out[k] = v; }
  });
  return out;
}

/* ── Restauracao seletiva (abre modal) ── */
var _restoreRegistros = null, _restoreMeta = null;

async function restaurarBackup(file) {
  if (!file) return;
  let arquivo;
  try { arquivo = JSON.parse(await file.text()); }
  catch (e) { mostrarToast('⚠️ Arquivo inválido (não é um JSON).'); return; }
  const registros = arquivo && arquivo.registros;
  if (!registros || typeof registros !== 'object') { mostrarToast('⚠️ Este arquivo não é um backup do VigiÁgua.'); return; }
  _restoreRegistros = registros;
  _restoreMeta = {
    quando: arquivo.geradoEm ? new Date(arquivo.geradoEm).toLocaleString('pt-BR') : 'data desconhecida',
    total: Object.keys(registros).length,
  };
  abrirModalRestore();
}

function abrirModalRestore() {
  document.getElementById('restoreInfo').innerHTML =
    `Arquivo de <strong>${_restoreMeta.quando}</strong> · ${_restoreMeta.total} registro(s). Escolha o que restaurar:`;
  document.querySelector('input[name="restoreEscopo"][value="tudo"]').checked = true;
  const muns = _municipiosNoBackup(_restoreRegistros);
  const lista = document.getElementById('restoreMunList');
  lista.innerHTML = muns.length
    ? muns.map(m => {
        const n = Object.keys(_restoreRegistros).filter(k => _ehChaveMunicipio(k) && _municipioDaChave(k) === m).length;
        return `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
          <input type="checkbox" class="restore-mun-chk" value="${m.replace(/"/g,'&quot;')}" onchange="_atualizarResumoRestore()"> ${m} <span style="color:var(--slate-400);font-size:11.5px;">(${n})</span></label>`;
      }).join('')
    : '<span style="font-size:12.5px;color:var(--slate-400);">Nenhum município neste arquivo.</span>';
  document.getElementById('restoreMunTodos').checked = false;
  onRestoreEscopoChange();
  document.getElementById('modalRestore').classList.add('open');
}
function fecharModalRestore() { document.getElementById('modalRestore').classList.remove('open'); _restoreRegistros = null; _restoreMeta = null; }

function _escopoRestore() { return (document.querySelector('input[name="restoreEscopo"]:checked') || {}).value || 'tudo'; }
function _munsMarcados() { return [...document.querySelectorAll('.restore-mun-chk:checked')].map(c => c.value); }

function onRestoreEscopoChange() {
  document.getElementById('restoreMunBox').style.display = _escopoRestore() === 'municipios' ? '' : 'none';
  _atualizarResumoRestore();
}
function onRestoreMunTodos() {
  const on = document.getElementById('restoreMunTodos').checked;
  document.querySelectorAll('.restore-mun-chk').forEach(c => { c.checked = on; });
  _atualizarResumoRestore();
}
function _atualizarResumoRestore() {
  if (!_restoreRegistros) return;
  const escopo = _escopoRestore();
  const filtrado = _filtrarRegistros(_restoreRegistros, escopo, _munsMarcados());
  const n = Object.keys(filtrado).length;
  const el = document.getElementById('restoreResumo');
  if (escopo === 'municipios' && _munsMarcados().length === 0) el.textContent = 'Marque ao menos um município.';
  else el.textContent = `${n} chave(s) serão restauradas.`;
}

async function confirmarRestore() {
  if (!_restoreRegistros) return;
  const escopo = _escopoRestore();
  const muns = _munsMarcados();
  if (escopo === 'municipios' && muns.length === 0) { mostrarToast('⚠️ Marque ao menos um município.'); return; }
  const filtrado = _filtrarRegistros(_restoreRegistros, escopo, muns);
  const n = Object.keys(filtrado).length;
  if (n === 0) { mostrarToast('⚠️ Nada a restaurar com esse escopo.'); return; }
  const desc = escopo === 'tudo' ? 'tudo (planejamento + municípios)'
             : escopo === 'planejamento' ? 'apenas o planejamento'
             : `apenas ${muns.length} município(s)`;
  if (!confirm(`Restaurar ${n} chave(s) — ${desc}?\n\nIsto sobrescreve no banco as chaves selecionadas. O que foi criado depois do backup NÃO é apagado.`)) return;
  fecharModalRestore();
  mostrarToast('♻️ Restaurando…');
  let res;
  try { res = await DB.Sync.importar(filtrado); }
  catch (e) { mostrarToast('⚠️ Falha ao restaurar: ' + e.message); return; }
  if (!res || !res.ok) { mostrarToast('⚠️ Falha ao restaurar: ' + ((res && (res.erro || (res.erros || []).join('; '))) || 'erro')); return; }
  try { if (DB.Sync.habilitado()) await DB.Sync.pull(); } catch (e) { /* segue com o cache */ }
  renderStatusPlano(); renderPainelPlanos(); renderAcompanhamento(); renderLaboratorio(); renderConsolidado();
  _backupInfo();
  mostrarToast(`✅ Restauração concluída (${res.total} registros).`);
}

/* ── Exportacao por municipio ── */
async function exportarBackupMunicipio() {
  const mun = document.getElementById('expMunicipio').value;
  if (!mun) { mostrarToast('Selecione um município.'); return; }
  mostrarToast('📤 Preparando…');
  let res;
  try { res = await DB.Sync.exportar(); }
  catch (e) { mostrarToast('⚠️ Falha ao exportar: ' + e.message); return; }
  if (!res || !res.ok) { mostrarToast('⚠️ Falha ao exportar: ' + ((res && res.erro) || 'erro')); return; }
  const registros = {};
  Object.entries(res.registros).forEach(([k, v]) => { if (_ehChaveMunicipio(k) && _municipioDaChave(k) === mun) registros[k] = v; });
  const n = Object.keys(registros).length;
  if (n === 0) { mostrarToast(`Nenhum dado salvo para ${mun}.`); return; }
  const arquivo = {
    app: 'VigiÁgua', tipo: 'backup-va_store', escopo: 'municipio', municipio: mun,
    versao: (window.VIGIAGUA_VERSAO || '?'),
    geradoEm: res.geradoEm, origem: res.origem, total: n, registros,
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(arquivo, null, 2)], { type: 'application/json' }));
  a.download = `vigiagua_${mun.replace(/[^\w]+/g, '_')}_${res.geradoEm.slice(0, 10)}.json`;
  a.click();
  mostrarToast(`✅ Backup de ${mun} gerado (${n} registros).`);
}

function _backupInfo() {
  const sel = document.getElementById('expMunicipio');
  if (sel && !sel.options.length) {
    sel.innerHTML = '<option value="">Selecione…</option>' +
      DB.Municipios.listar().map(m => `<option value="${m.nome.replace(/"/g,'&quot;')}">${m.nome}</option>`).join('');
  }
  const d = _ultimoBackup();
  const dias = _diasDesde(d);
  const info = document.getElementById('backupInfo');
  if (info) {
    info.textContent = d
      ? `Último backup: ${d.toLocaleDateString('pt-BR')} (${dias === 0 ? 'hoje' : dias + ' dia(s) atrás'}).`
      : 'Nenhum backup feito ainda nesta máquina.';
  }
  const rem = document.getElementById('backupReminder');
  if (rem) {
    if (dias >= _BACKUP_DIAS) {
      rem.style.display = '';
      rem.style.marginBottom = '12px';
      rem.className = 'alert alert--warning';
      rem.innerHTML = `<span class="alert__icon">⚠️</span><div class="alert__body">`
        + (d ? `Faz <strong>${dias} dias</strong> desde o último backup dos dados oficiais.`
             : `Você ainda <strong>não fez backup</strong> dos dados oficiais.`)
        + ` <a href="#" onclick="exportarBackup();return false;" style="font-weight:700;">Exportar agora</a>.</div>`;
    } else {
      rem.style.display = 'none';
    }
  }
}

/* ════════════════════════════════════════════
   SEÇÕES COLAPSÁVEIS
   ════════════════════════════════════════════ */
function toggleSecao(id) {
  const el = document.getElementById(id);
  el.classList.toggle('aberta');
}

function abrirSecao(id) {
  document.getElementById(id).classList.add('aberta');
  document.getElementById(id).scrollIntoView({ behavior:'smooth', block:'nearest' });
}

/* ════════════════════════════════════════════
   RESUMOS DOS CABEÇALHOS
   ════════════════════════════════════════════ */
/* ════════════════════════════════════════════
   HELPERS DE RESUMO — funções puras que
   constroem textos de exibição sem nunca
   mostrar "null", "undefined" ou "?"
   ════════════════════════════════════════════ */

// Retorna texto descritivo dos frascos por visita com base no modo ativo
function textoFrascos() {
  const exato = document.getElementById('btnEntregaExato').classList.contains('ativo');
  if (exato) {
    const v = parseNum('cfgEntregaExata');
    return v ? `${v} frascos/visita (fixo)` : 'Frascos fixo (sem valor)';
  }
  const mn = parseNum('cfgEntregaMin');
  const mx = parseNum('cfgEntregaMax');
  if (mn && mx) return `${mn}–${mx} frascos`;
  if (mn)       return `≥${mn} frascos`;
  if (mx)       return `≤${mx} frascos`;
  return 'Frascos (sem limite)';
}

// Retorna texto descritivo dos municípios por semana com base no modo ativo
function textoMunicipios() {
  const exato = document.getElementById('btnMunsExato').classList.contains('ativo');
  if (exato) {
    const v = parseNum('cfgMunicipiosExato');
    return `${v || 10} municípios/semana`;
  }
  const mn = parseNum('cfgMunicipiosMin');
  const mx = parseNum('cfgMunicipiosMax');
  if (mn && mx) return `${mn}–${mx} municípios/semana`;
  if (mn)       return `≥${mn} municípios/semana`;
  if (mx)       return `≤${mx} municípios/semana`;
  return 'Municípios/semana (sem valor)';
}

// Atualiza o texto azul dentro da seção de parâmetros
function updateInfoMunAlvo() {
  const el = document.getElementById('infoMunAlvo');
  if (el) el.textContent = textoMunicipios();
}

// Atualiza TODOS os resumos de cabeçalho de seção de uma vez
// Mostra, ao vivo, o total dos dois tipos (FQ + Micro) ao lado dos campos "por tipo".
function atualizarTotaisPorTipo() {
  const num = id => { const el = document.getElementById(id); if (!el) return null; const v = parseInt(el.value); return isNaN(v) ? null : v; };
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt || ''; };
  const fixo = (n, unidade) => n == null ? '' : `= ${n} Físico-Químicas + ${n} Microbiológicas = ${n * 2} ${unidade}`;
  const faixa = (a, b, unidade) => (a == null || b == null) ? '' : `= ${a * 2} a ${b * 2} ${unidade} no total (os dois tipos somados)`;

  set('capTotalInfo',       fixo(num('cfgCapacidadeExata'), 'análises/semana'));
  set('capTotalInfoInt',    faixa(num('cfgCapacidadeMin'), num('cfgCapacidadeMax'), 'análises/semana'));
  set('alertaTotalInfo',    fixo(num('cfgAlertaExata'), 'frascos/semana'));
  set('alertaTotalInfoInt', faixa(num('cfgAlertaMin'), num('cfgAlertaMax'), 'frascos/semana'));
  set('entregaTotalInfo',   fixo(num('cfgEntregaExata'), 'amostras'));
  set('entregaTotalInfoInt', faixa(num('cfgEntregaMin'), num('cfgEntregaMax'), 'amostras'));
}

function renderResumos() {
  atualizarTotaisPorTipo();
  // Ano (alimenta o badge da aba — fonte única: cfgAno)
  const ano = parseInt(document.getElementById('cfgAno').value) || 2026;
  document.getElementById('badgePlanejamento').textContent = ano;

  // GRUPO B — Regras de Distribuição
  const capExatoAtivo = document.getElementById('btnCapExato')?.classList.contains('ativo');
  let capacTxt;
  if (capExatoAtivo) {
    const v = parseNum('cfgCapacidadeExata');
    capacTxt = v ? `${v}/sem` : 'sem limite';
  } else {
    const mn = parseNum('cfgCapacidadeMin'), mx = parseNum('cfgCapacidadeMax');
    capacTxt = mx ? `${mn || '?'}–${mx}/sem` : 'sem limite';
  }
  const rRegras = document.getElementById('resumoRegras');
  if (rRegras) rRegras.textContent = `${textoMunicipios()} · ${textoFrascos()} · lab ${capacTxt} · por tipo`;

  // GRUPO C — Calendário (semanas + feriados)
  const ativas  = semanasAtivas.filter(Boolean).length;
  const nExtras = (feriados.nacionais?.length || 0) + (feriados.estaduais?.length || 0) +
    Object.values(feriados.municipais || {}).reduce((s, v) => s + v.length, 0);
  const feriadosTxt = nExtras > 0 ? `13 automáticos + ${nExtras} extras` : '13 automáticos';

  const rCal = document.getElementById('resumoCalendario');
  if (rCal) rCal.textContent = `${ativas} semanas ativas · ${nExtras > 0 ? nExtras + ' feriados extras' : 'feriados padrão'}`;
  const dotCal = document.getElementById('dotCalendario');
  if (dotCal) dotCal.className = `status-dot status-dot--${ativas > 0 ? 'ok' : 'aviso'}`;

  const hintSem = document.getElementById('hintSemanas');
  if (hintSem) hintSem.textContent = `${ativas} de ${tercas.length}`;
  const hintFer = document.getElementById('hintFeriados');
  if (hintFer) hintFer.textContent = feriadosTxt;

  // Municípios badge (outra aba)
  const _bm = document.getElementById('badgeMunicipios');
  if (_bm) _bm.textContent = municipios.length;

  // Texto azul interno (infoMunAlvo)
  updateInfoMunAlvo();
}

/* ════════════════════════════════════════════
   ANO — sincronizado
   ════════════════════════════════════════════ */
function _diaColeta()  { const el = document.getElementById('cfgDiaColeta');  return el ? (parseInt(el.value)) : 2; }
function _diaEntrega() { const el = document.getElementById('cfgDiaEntrega'); return el ? (parseInt(el.value)) : 3; }
function _offsetEntrega() { return (((_diaEntrega() - _diaColeta()) % 7) + 7) % 7; }

// Lê as caixas de "pontos que paralisam o processo" (Umuarama, Maringá)
function _lerPontosBloqueio() {
  const padrao = (DB.Config.PADRAO.pontosBloqueio) || {};
  const out = {};
  Object.keys(padrao).forEach(nome => {
    const c = document.getElementById('cfgBloq_' + nome + '_coleta');
    const e = document.getElementById('cfgBloq_' + nome + '_entrega');
    out[nome] = {
      coleta:  c ? c.checked : padrao[nome].coleta,
      entrega: e ? e.checked : padrao[nome].entrega,
    };
  });
  return out;
}

// Trocar o dia de coleta/entrega desloca TODAS as datas → recalcula as semanas.
// Mudar os PONTOS de bloqueio (Umuarama/Maringá) não muda as datas → aplica o
// bloqueio de forma conservadora (desativa recém-bloqueadas, preserva o resto).
function onPontosBloqueioChange() {
  DB.Config.salvar(lerConfig());              // persiste a marcação ao vivo
  const n = _encaixarFeriadosNasSemanas();    // desativa recém-bloqueadas
  renderStatusPlano();
  mostrarToast(n > 0
    ? `🛑 Regra aplicada — ${n} semana(s) desativada(s).`
    : '🛑 Regra de bloqueio atualizada.');
}

// Trocar dia de coleta/entrega recalcula tudo.
function onDiaColetaChange() {
  const ano = parseInt(document.getElementById('cfgAno').value) || 2026;
  const cfg = lerConfig();             // config AO VIVO (reflete as caixas/selects atuais)
  DB.Config.salvar(cfg);               // persiste a regra
  tercas = Utils.tercasFeirasDoAno(ano, cfg.diaColeta);
  semanasAtivas = calcularSemanasDefault(ano, cfg);
  DB.Semanas.salvar(ano, semanasAtivas);
  renderSemanasGrid();
  renderStatusPlano();
  renderResumos();
  mostrarToast('📅 Regra atualizada — semanas recalculadas.');
}

function onAnoChange(val) {
  const ano = parseInt(val) || 2026;
  document.getElementById('cfgAno').value = ano;
  renderSemanasGrid();          // inicializarSemanas: reconstrói datas, carrega e aplica bloqueio
  renderFeriados();             // atualiza o cabeçalho do ano e as datas dos nacionais automáticos
  renderResumos();
  renderPainelPlanos();
  atualizarAnoContexto();
  if (typeof sincronizarAnoInput === 'function') sincronizarAnoInput();
}

/* ════════════════════════════════════════════
   PAINEL DE PLANOS POR ANO
   ════════════════════════════════════════════ */
function renderPainelPlanos() {
  const wrap = document.getElementById('painelPlanos');
  if (!wrap) return;

  const resumos = DB.Plano.resumos();
  const anoEdit = parseInt(document.getElementById('cfgAno').value) || null;

  // Resumo no cabeçalho da seção
  const nPub  = resumos.filter(r => r.status === 'publicado').length;
  const nRas  = resumos.length - nPub;
  const resEl = document.getElementById('resumoPlanos');
  if (resEl) {
    resEl.textContent = resumos.length === 0
      ? 'Nenhum plano ainda'
      : `${resumos.length} ano(s) · ${nPub} publicado(s) · ${nRas} rascunho(s)`;
  }

  if (resumos.length === 0) {
    wrap.innerHTML = `<div class="plano-vazio">
      Nenhum plano criado ainda. Digite o ano na barra acima, ajuste os parâmetros e clique em
      <strong>Gerar Plano</strong>.
    </div>`;
    return;
  }

  // Mais recentes primeiro
  const linhas = [...resumos].sort((a, b) => b.ano - a.ano).map(r => {
    const ativo = r.ano === anoEdit;
    const statusBadge = r.status === 'publicado'
      ? `<span class="badge badge--success">🟢 Publicado</span>`
      : `<span class="badge badge--warning">🟡 Rascunho</span>`;

    const taxa = r.taxa != null ? `${(r.taxa * 100).toFixed(0)}%` : '—';
    const amostras = r.totalDist != null ? `${r.totalDist.toLocaleString('pt-BR')} amostras` : '';

    const gerado = r.geradoEm
      ? new Date(r.geradoEm).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' })
      : '—';

    // Prazo de edição — editável na própria linha (data completa 'YYYY-MM-DD')
    const venceu = r.status === 'publicado' && !DB.Plano.podeEditar(r.ano);
    const prazoCell = `
      <div class="prazo-cell">
        <input type="date" value="${r.prazoEdicao || ''}" onchange="setPrazoAno(${r.ano}, this.value)"
               title="Prazo de edição pelos municípios">
        ${venceu ? '<span class="prazo-venceu">encerrado</span>' : ''}
      </div>`;

    // Ações conforme status
    const acaoStatus = r.status === 'publicado'
      ? `<button class="btn btn--danger btn--sm" onclick="despublicarAno(${r.ano})" title="Tornar invisível aos municípios">🔒 Despublicar</button>`
      : `<button class="btn btn--success btn--sm" onclick="publicarAno(${r.ano})" title="Tornar visível aos municípios">📢 Publicar</button>`;

    const acaoAbrir = ativo
      ? `<button class="btn btn--secondary btn--sm" disabled title="Já está sendo editado">✏️ Em edição</button>`
      : `<button class="btn btn--secondary btn--sm" onclick="abrirPlano(${r.ano})" title="Carregar para editar">📂 Abrir</button>`;

    return `
      <tr class="${ativo ? 'plano-ativo' : ''}">
        <td class="plano-ano-cell">${r.ano}${ativo ? '<span class="tag-edit">editando</span>' : ''}</td>
        <td>${statusBadge}</td>
        <td>${taxa}<br><span style="font-size:11px;color:var(--slate-500);">${amostras}</span></td>
        <td>${gerado}</td>
        <td>${prazoCell}</td>
        <td>
          <div class="plano-acoes">
            ${acaoAbrir}
            ${acaoStatus}
            <button class="btn btn--ghost btn--sm" style="color:var(--red-500);" onclick="excluirPlano(${r.ano})" title="Excluir definitivamente">🗑️</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table class="planos-tabela">
      <thead>
        <tr>
          <th>Ano</th><th>Status</th><th>Metas</th><th>Gerado</th><th>Prazo de edição</th><th style="text-align:right;">Ações</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>`;
}

// Banner contextual dentro da seção Ano
function atualizarAnoContexto() {
  const el = document.getElementById('anoContexto');
  if (!el) return;
  const ano   = parseInt(document.getElementById('cfgAno').value) || null;
  const plano = ano ? DB.Plano.carregar(ano) : null;

  if (!plano) {
    el.innerHTML = `📝 Você está configurando o ano <strong>${ano || '—'}</strong>. Ainda não existe plano gerado para ele — ajuste os parâmetros e clique em <strong>Gerar Plano</strong>.`;
    el.style.background = 'var(--blue-50)'; el.style.borderColor = 'var(--blue-200)';
  } else if (plano.status === 'publicado') {
    el.innerHTML = `🟢 O plano de <strong>${ano}</strong> está <strong>publicado</strong> — os municípios já o veem. Gerar novamente substitui o conteúdo (a publicação é mantida). Para tirar do ar, use <strong>Despublicar</strong> na tabela abaixo.`;
    el.style.background = 'var(--green-50)'; el.style.borderColor = 'var(--green-200)';
  } else {
    el.innerHTML = `🟡 O plano de <strong>${ano}</strong> é um <strong>rascunho</strong> — só você o vê. Quando estiver pronto, publique-o na tabela abaixo para liberar aos municípios.`;
    el.style.background = 'var(--amber-50)'; el.style.borderColor = 'var(--amber-200)';
  }
}

/* ── Campo de ano (barra de contexto) ───────── */
function sincronizarAnoInput() {
  renderAnoGlobal(parseInt(document.getElementById('cfgAno').value) || new Date().getFullYear());
}

/* ── Seletor de ano GLOBAL (roleta) — governa todas as abas ──
   Fonte de verdade continua o hidden #cfgAno; aplicar = irParaAno(). */
var _yearpickAberto = false;

function _anoPublicado(a) {
  try { return DB.Plano.anosPublicados().includes(a); } catch (e) { return false; }
}

// Faixa: do mais antigo com plano (ou 2 anos atrás do atual, o que for menor) até +5.
function _anoFaixa(anoAtual) {
  let comPlano = [];
  try { comPlano = (DB.Plano.anos && DB.Plano.anos()) || []; } catch (e) { comPlano = []; }
  const min = Math.min(anoAtual - 5, ...(comPlano.length ? comPlano : [anoAtual]));
  const max = anoAtual + 5;
  return { min, max };
}

function renderAnoGlobal(anoAtual) {
  const ano = anoAtual || parseInt(document.getElementById('cfgAno').value) || new Date().getFullYear();
  const disp = document.getElementById('yearpickAtual');
  if (disp) disp.innerHTML = `${ano}${_anoPublicado(ano) ? ' <span style="color:var(--green-600);">✓</span>' : ''}`;
  // Só reconstrói a lista quando fechada (evita perder a rolagem enquanto aberta).
  if (!_yearpickAberto) _montarRoletaAnos(ano);
}

function _montarRoletaAnos(ano) {
  const wheel = document.getElementById('yearpickWheel');
  if (!wheel) return;
  const { min, max } = _anoFaixa(ano);
  let html = '';
  for (let a = min; a <= max; a++) {   // ordem crescente (menor no topo)
    const sel = a === ano;
    const pub = _anoPublicado(a);
    html += `<div class="yearpick__year${sel ? ' yearpick__year--sel' : ''}" role="option" aria-selected="${sel}" onclick="yearpickEscolher(${a})">`
      + `${a}${pub ? ' <span class="yearpick__check">✓</span>' : ''}</div>`;
  }
  wheel.innerHTML = html;
}

function toggleYearpick(forcar) {
  const pop = document.getElementById('yearpickPop');
  const disp = document.getElementById('yearpickDisplay');
  if (!pop) return;
  const abrir = (forcar === undefined) ? (pop.style.display === 'none') : forcar;
  _yearpickAberto = abrir;
  pop.style.display = abrir ? 'block' : 'none';
  if (disp) disp.setAttribute('aria-expanded', abrir ? 'true' : 'false');
  if (abrir) {
    const ano = parseInt(document.getElementById('cfgAno').value) || new Date().getFullYear();
    _montarRoletaAnos(ano);
    const inp = document.getElementById('yearpickInput');
    if (inp) inp.value = '';
    const sel = document.querySelector('#yearpickWheel .yearpick__year--sel');
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'center' });
  }
}

function fecharYearpick() { toggleYearpick(false); }

function yearpickEscolher(a) {
  toggleYearpick(false);
  irParaAno(a);
}

function yearpickDigitar(v) {
  const a = parseInt(v, 10);
  if (!a || a < 1900 || a > 9999) { mostrarToast('Digite um ano válido (1900–9999).'); return; }
  toggleYearpick(false);
  irParaAno(a);
}

/**
 * Vai para um ano (mesmo campo serve para abrir existente ou começar novo).
 * Valida 1900–9999; carrega o plano se existir, senão prepara configuração nova.
 */
function irParaAno(v) {
  const ano = parseInt(v);
  if (!ano || ano < 1900 || ano > 9999) {
    alert('Informe um ano válido (1900–9999).');
    sincronizarAnoInput();
    return;
  }
  const atual = parseInt(document.getElementById('cfgAno').value) || null;
  if (ano === atual) { sincronizarAnoInput(); return; }   // mesmo ano: nada a fazer

  const existia = !!DB.Plano.carregar(ano);
  selecionarAno(ano);
  if (!existia) {
    document.getElementById('secRegras').scrollIntoView({ behavior: 'smooth', block: 'start' });
    mostrarToast(`📝 Ano ${ano} — configure e clique em Gerar Plano.`);
  } else {
    mostrarToast(`📂 Plano de ${ano} carregado.`);
  }
}

/**
 * Troca o ano em planejamento. Carrega o plano daquele ano se existir,
 * ou prepara uma configuração nova. Recarrega semanas e feriados.
 */
function selecionarAno(ano, opts = {}) {
  ano = parseInt(ano);
  if (!ano) return;
  document.getElementById('cfgAno').value = ano;
  onAnoChange(ano);                       // recarrega semanas/feriados do ano
  const plano = DB.Plano.carregar(ano);
  if (plano && plano.ok) {
    planoAtual = plano;
    if (plano.cfg) { DB.Config.salvar(plano.cfg); carregarConfigUI(); renderResumos(); }
    mostrarResultado();
    if (opts.scroll) document.getElementById('secaoResultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    planoAtual = null;
    document.getElementById('secaoResultado').classList.remove('visivel');
  }
  sincronizarAnoInput();
  renderPainelPlanos();
  atualizarAnoContexto();
  renderStatusPlano();
  renderAcompanhamento();
  renderLaboratorio();
  renderConsolidado();
}

// Abrir um plano existente a partir da tabela (com aviso de carregamento)
function abrirPlano(ano) {
  selecionarAno(ano, { scroll: true });
  mostrarToast(`📂 Plano de ${ano} carregado.`);
}

function publicarAno(ano) {
  if (!DB.Plano.carregar(ano)) return;
  if (!confirm(`Publicar o plano de ${ano}? Os municípios passarão a ver este cronograma.`)) return;
  DB.Plano.publicarAno(ano);
  if (planoAtual && planoAtual.cfg?.ano === ano) { planoAtual.status = 'publicado'; mostrarResultado(); }
  sincronizarAnoInput();
  renderPainelPlanos();
  atualizarAnoContexto();
  renderStatusPlano();
  mostrarToast(`📢 Plano de ${ano} publicado!`);
}

function despublicarAno(ano) {
  if (!confirm(`Despublicar o plano de ${ano}? Os municípios deixarão de ver este cronograma (o plano continua salvo como rascunho).`)) return;
  DB.Plano.despublicar(ano);
  if (planoAtual && planoAtual.cfg?.ano === ano) { planoAtual.status = 'rascunho'; mostrarResultado(); }
  sincronizarAnoInput();
  renderPainelPlanos();
  atualizarAnoContexto();
  renderStatusPlano();
  mostrarToast(`🔒 Plano de ${ano} despublicado.`);
}

function excluirPlano(ano) {
  const plano = DB.Plano.carregar(ano);
  const nMun = DB.Plano.municipiosComDados(ano);
  const publicado = plano?.status === 'publicado';

  let aviso = publicado
    ? `⚠️ O plano de ${ano} está PUBLICADO.\n\nExcluir apaga TUDO deste ano permanentemente: o plano, as semanas e o que os municípios preencheram.`
    : `Excluir definitivamente o plano de ${ano}?\n\nApaga o plano e as semanas deste ano.`;
  if (nMun > 0) aviso += `\n\n🗑️ Também serão apagados os planos preenchidos de ${nMun} município(s) para ${ano}.`;
  aviso += `\n\n💡 Se você só quer tirar do ar mas GUARDAR o que foi preenchido, feche esta janela e use "🔒 Despublicar" — não Excluir.`;
  aviso += `\n\nEsta ação NÃO pode ser desfeita. Continuar?`;
  if (!confirm(aviso)) return;

  DB.Plano.excluir(ano);
  if (planoAtual && planoAtual.cfg?.ano === ano) {
    planoAtual = null;
    const sr = document.getElementById('secaoResultado');
    if (sr) sr.classList.remove('visivel');
  }
  sincronizarAnoInput();
  renderPainelPlanos();
  atualizarAnoContexto();
  renderStatusPlano();
  renderAcompanhamento();
  renderConsolidado();
  mostrarToast(`🗑️ Plano de ${ano} e seus dados foram removidos.`);
}

// Limpar dados órfãos (peças de anos sem plano) — botão da Administração
function limparOrfaosUI() {
  const o = DB.Plano.orfaos();
  if (!o.total) { mostrarToast('✅ Nenhum dado órfão encontrado — banco limpo.'); return; }
  const aviso = `Encontrados ${o.total} registros órfãos (de anos SEM plano):\n\n`
    + `• ${o.semanas} configuração(ões) de semanas\n`
    + `• ${o.munplano} plano(s) municipal(is) preenchido(s)\n`
    + `• ${o.previewedit} prévia(s) de PDF\n\n`
    + `Anos afetados: ${o.anos.join(', ')}\n\n`
    + `Remover todos definitivamente? (recomendado exportar um backup antes)`;
  if (!confirm(aviso)) return;
  const r = DB.Plano.limparOrfaos();
  renderPainelPlanos();
  renderAcompanhamento();
  renderConsolidado();
  mostrarToast(`🧹 ${r.total} registro(s) órfão(s) removido(s).`);
}

// Editar o prazo de edição de um plano direto na tabela
function setPrazoAno(ano, dataFull) {
  DB.Plano.setPrazo(ano, dataFull || null);
  renderPainelPlanos();
  if (planoAtual && planoAtual.cfg?.ano === parseInt(ano)) renderStatusPlano();
  mostrarToast(dataFull ? `🗓️ Prazo de ${ano} atualizado.` : `🗓️ Prazo de ${ano} removido.`);
}

/* ════════════════════════════════════════════
   CONFIG
   ════════════════════════════════════════════ */
function carregarConfigUI() {
  const cfg = DB.Config.carregar();
  document.getElementById('cfgAno').value = cfg.ano || 2026;

  const selC = document.getElementById('cfgDiaColeta');
  const selE = document.getElementById('cfgDiaEntrega');
  if (selC) selC.value = String(cfg.diaColeta ?? 2);
  if (selE) selE.value = String(cfg.diaEntrega ?? 3);

  // Pontos que paralisam o processo (Umuarama, Maringá)
  const pontos = cfg.pontosBloqueio || DB.Config.PADRAO.pontosBloqueio || {};
  Object.keys(pontos).forEach(nome => {
    const c = document.getElementById('cfgBloq_' + nome + '_coleta');
    const e = document.getElementById('cfgBloq_' + nome + '_entrega');
    if (c) c.checked = !!pontos[nome].coleta;
    if (e) e.checked = !!pontos[nome].entrega;
  });

  // Capacidade do laboratório / semana (fixo ou intervalo)
  setModoCapacidade(cfg.modoCapacidade || 'exato', true);
  document.getElementById('cfgCapacidadeExata').value = cfg.capacidadeExata ?? '';
  document.getElementById('cfgCapacidadeMin').value   = cfg.capacidadeMin ?? '';
  document.getElementById('cfgCapacidadeMax').value   = cfg.capacidadeMax ?? '';

  // Alerta de frascos / semana (fixo ou intervalo)
  setModoAlerta(cfg.modoAlerta || 'exato', true);
  document.getElementById('cfgAlertaExata').value = cfg.alertaExata ?? '';
  document.getElementById('cfgAlertaMin').value   = cfg.alertaMin ?? '';
  document.getElementById('cfgAlertaMax').value   = cfg.alertaMax ?? '';

  setModoEntrega(cfg.modoEntrega || 'intervalo', true);
  document.getElementById('cfgEntregaExata').value = cfg.entregaExata || '';
  document.getElementById('cfgEntregaMin').value   = cfg.entregaMin   || '';
  document.getElementById('cfgEntregaMax').value   = cfg.entregaMax   || '';

  setModoMuns(cfg.modoMunicipios || 'exato', true);
  document.getElementById('cfgMunicipiosExato').value = cfg.municipiosExato || 10;
  document.getElementById('cfgMunicipiosMin').value   = cfg.municipiosMin   || '';
  document.getElementById('cfgMunicipiosMax').value   = cfg.municipiosMax   || '';
  renderResumos();
}

function lerConfig() {
  const modoE = document.getElementById('btnEntregaExato').classList.contains('ativo') ? 'exato' : 'intervalo';
  const modoM = document.getElementById('btnMunsExato').classList.contains('ativo') ? 'exato' : 'intervalo';
  const modoC = document.getElementById('btnCapExato').classList.contains('ativo') ? 'exato' : 'intervalo';
  const modoA = document.getElementById('btnAlertaExato').classList.contains('ativo') ? 'exato' : 'intervalo';

  // Capacidade: teto efetivo (exato → fixo; intervalo → máx) e piso alvo (intervalo → mín)
  const capExata = parseNum('cfgCapacidadeExata');
  const capMin   = parseNum('cfgCapacidadeMin');
  const capMax   = parseNum('cfgCapacidadeMax');
  const capacidade     = modoC === 'exato' ? capExata : capMax;
  const capacidadePiso = modoC === 'intervalo' ? capMin : null;

  // Alerta: "poucos" (exato → fixo; intervalo → mín) e "muitos" (intervalo → máx)
  const alExata = parseNum('cfgAlertaExata');
  const alMin   = parseNum('cfgAlertaMin');
  const alMax   = parseNum('cfgAlertaMax');
  const alvoMin = modoA === 'exato' ? alExata : alMin;
  const alvoMax = modoA === 'intervalo' ? alMax : null;

  return {
    ano:             parseInt(document.getElementById('cfgAno').value) || 2026,

    diaColeta:       _diaColeta(),
    diaEntrega:      _diaEntrega(),
    pontosBloqueio:  _lerPontosBloqueio(),

    modoCapacidade:  modoC,
    capacidadeExata: capExata,
    capacidadeMin:   capMin,
    capacidadeMax:   capMax,
    capacidade,            // teto efetivo (usado pelo algoritmo)
    capacidadePiso,        // piso alvo do intervalo (usado pelo algoritmo)

    modoAlerta:  modoA,
    alertaExata: alExata,
    alertaMin:   alMin,
    alertaMax:   alMax,
    alvoMin,               // "poucos frascos"
    alvoMax,               // "muitos frascos"

    modoEntrega:     modoE,
    entregaExata:    parseNum('cfgEntregaExata'),
    entregaMin:      parseNum('cfgEntregaMin'),
    entregaMax:      parseNum('cfgEntregaMax'),
    modoMunicipios:  modoM,
    municipiosExato: parseNum('cfgMunicipiosExato') || 10,
    municipiosMin:   parseNum('cfgMunicipiosMin'),
    municipiosMax:   parseNum('cfgMunicipiosMax'),
    multiplicadorTeto: null,
    pisoMensal:      null,
  };
}

function parseNum(id) {
  const v = parseFloat(document.getElementById(id)?.value);
  return isNaN(v) ? null : v;
}

function salvarConfig() {
  DB.Config.salvar(lerConfig());
  renderResumos();
  mostrarToast('✅ Configurações salvas!');
}

function setModoEntrega(modo, silencioso = false) {
  document.getElementById('btnEntregaExato').classList.toggle('ativo',    modo === 'exato');
  document.getElementById('btnEntregaIntervalo').classList.toggle('ativo', modo === 'intervalo');
  document.getElementById('camposEntregaExato').style.display    = modo === 'exato'    ? 'flex' : 'none';
  document.getElementById('camposEntregaIntervalo').style.display = modo === 'intervalo'? 'flex' : 'none';
  if (!silencioso) renderResumos();
}

function setModoMuns(modo, silencioso = false) {
  document.getElementById('btnMunsExato').classList.toggle('ativo',    modo === 'exato');
  document.getElementById('btnMunsIntervalo').classList.toggle('ativo', modo === 'intervalo');
  document.getElementById('camposMunsExato').style.display    = modo === 'exato'    ? 'flex' : 'none';
  document.getElementById('camposMunsIntervalo').style.display = modo === 'intervalo'? 'flex' : 'none';
  if (!silencioso) renderResumos();
}

function setModoCapacidade(modo, silencioso = false) {
  document.getElementById('btnCapExato').classList.toggle('ativo',     modo === 'exato');
  document.getElementById('btnCapIntervalo').classList.toggle('ativo', modo === 'intervalo');
  document.getElementById('camposCapExato').style.display     = modo === 'exato'    ? 'flex' : 'none';
  document.getElementById('camposCapIntervalo').style.display = modo === 'intervalo'? 'flex' : 'none';
  if (!silencioso) renderResumos();
}

function setModoAlerta(modo, silencioso = false) {
  document.getElementById('btnAlertaExato').classList.toggle('ativo',     modo === 'exato');
  document.getElementById('btnAlertaIntervalo').classList.toggle('ativo', modo === 'intervalo');
  document.getElementById('camposAlertaExato').style.display     = modo === 'exato'    ? 'flex' : 'none';
  document.getElementById('camposAlertaIntervalo').style.display = modo === 'intervalo'? 'flex' : 'none';
  if (!silencioso) renderResumos();
}

/* ════════════════════════════════════════════
   SEMANAS
   ════════════════════════════════════════════ */
function calcularSemanasDefault(ano, cfg) {
  cfg = cfg || DB.Config.carregar();
  const dc  = cfg.diaColeta ?? 2;
  const t   = Utils.tercasFeirasDoAno(ano, dc);
  const a   = t.map(() => true);
  Utils.semanasDeFerias(t).forEach(i => { a[i] = false; });
  Utils.calcularSemanasBloqueadas(t, ano, feriados, cfg).forEach(i => { a[i] = false; });
  return a;
}

function inicializarSemanas(forcar = false) {
  const ano  = parseInt(document.getElementById('cfgAno').value) || 2026;
  tercas = Utils.tercasFeirasDoAno(ano, _diaColeta());
  const salvas = DB.Semanas.carregar(ano);
  semanasAtivas = (salvas && salvas.length === tercas.length && !forcar)
    ? salvas
    : calcularSemanasDefault(ano);
  // Propagação conservadora: garante que as semanas com feriado que PARALISA o
  // processo fiquem inativas — em qualquer carregamento (troca de ano, render,
  // etc.). Só DESATIVA; nunca reativa, preservando ajustes manuais e recesso.
  Utils.calcularSemanasBloqueadas(tercas, ano, feriados, DB.Config.carregar())
    .forEach(i => { semanasAtivas[i] = false; });
  DB.Semanas.salvar(ano, semanasAtivas);
}

function renderSemanasGrid() {
  inicializarSemanas();
  const ativas   = semanasAtivas.filter(Boolean).length;
  const inativas = semanasAtivas.length - ativas;
  const ano      = parseInt(document.getElementById('cfgAno').value) || 2026;

  const DIAS = ['domingos','segundas-feiras','terças-feiras','quartas-feiras','quintas-feiras','sextas-feiras','sábados'];
  const info = document.getElementById('calendarioDiaInfo');
  if (info) info.innerHTML = `📅 Coleta às <strong>${DIAS[_diaColeta()]}</strong> · entrega às <strong>${DIAS[_diaEntrega()]}</strong> (definido nas Regras).`;

  document.getElementById('semanasResumo').innerHTML = `
    <div class="stat-card stat-card--success">
      <div class="stat-card__label">Ativas</div>
      <div class="stat-card__value">${ativas}</div>
    </div>
    <div class="stat-card stat-card--danger">
      <div class="stat-card__label">Inativas</div>
      <div class="stat-card__value">${inativas}</div>
    </div>
    <div class="stat-card stat-card--info">
      <div class="stat-card__label">Total ${ano}</div>
      <div class="stat-card__value">${tercas.length}</div>
    </div>
  `;

  const grid = document.getElementById('semanasGrid');
  grid.innerHTML = '';
  tercas.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'week-card ' + (semanasAtivas[i] ? 'active' : 'inactive');
    div.onclick = () => {
      semanasAtivas[i] = !semanasAtivas[i];
      DB.Semanas.salvar(ano, semanasAtivas);
      renderSemanasGrid();
      renderResumos();
    };
    div.innerHTML = `
      <div class="week-card__status">${semanasAtivas[i] ? '✅' : '❌'}</div>
      <div class="week-card__num">Sem. ${i + 1}</div>
      <div class="week-card__date">${Utils.fmtData(t, { day:'2-digit', month:'short' })}</div>
    `;
    grid.appendChild(div);
  });

  renderResumos();
}

function ativarTodas() {
  const ano = parseInt(document.getElementById('cfgAno').value) || 2026;
  semanasAtivas = tercas.map(() => true);
  DB.Semanas.salvar(ano, semanasAtivas);
  renderSemanasGrid();
  mostrarToast('✅ Todas as semanas ativadas.');
}

function reaplicarFerias() {
  inicializarSemanas(true);
  renderSemanasGrid();
  mostrarToast('🔄 Recesso reaplicado.');
}

function ativarSoFeriadosNac() {
  const ano = parseInt(document.getElementById('cfgAno').value) || 2026;
  const cfg = DB.Config.carregar();
  semanasAtivas = tercas.map(() => true);
  Utils.calcularSemanasBloqueadas(tercas, ano, feriados, cfg).forEach(i => { semanasAtivas[i] = false; });
  DB.Semanas.salvar(ano, semanasAtivas);
  renderSemanasGrid();
  mostrarToast('🎉 Bloqueadas as semanas com feriado que paralisa o processo.');
}

/* ════════════════════════════════════════════
   FERIADOS
   ════════════════════════════════════════════ */
function toggleFerMun() {
  document.getElementById('ferMunGroup').style.display =
    document.getElementById('ferTipo').value === 'municipal' ? 'block' : 'none';
}
function toggleEditFerMun() {
  document.getElementById('editFerMunGroup').style.display =
    document.getElementById('editFerTipo').value === 'municipal' ? 'block' : 'none';
}

function popularSelectMunicipios(id) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '<option value="">Selecione...</option>';
  municipios.forEach(m => {
    const o = document.createElement('option');
    o.value = m.nome; o.textContent = m.nome;
    sel.appendChild(o);
  });
}

// Popula um <select> de município para feriados: os 21 + Maringá (laboratório).
function _popularSelectFeriadoMun(id) {
  popularSelectMunicipios(id);
  const sel = document.getElementById(id);
  if (sel && ![...sel.options].some(o => o.value === 'Maringá')) {
    const o = document.createElement('option');
    o.value = 'Maringá'; o.textContent = 'Maringá (laboratório)';
    sel.appendChild(o);
  }
}

function renderFeriados() {
  _popularSelectFeriadoMun('ferMunicipio');
  _popularSelectFeriadoMun('editFerMunicipio');

  const list = document.getElementById('feriadosList');
  list.innerHTML = '';
  const ano = parseInt(document.getElementById('cfgAno').value) || 2026;

  const NOMES_NAC = [
    'Ano Novo','Carnaval','Sexta-feira Santa','Páscoa','Tiradentes',
    'Dia do Trabalho','Corpus Christi','Independência',
    'N. Sra. Aparecida','Finados','Proclamação da República',
    'Consciência Negra','Natal'
  ];
  const ferNacAuto = Utils.feriadosNacionaisAno(ano, []);

  function secLabel(txt) {
    const el = document.createElement('div');
    el.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--slate-400);margin:12px 0 6px;';
    el.textContent = txt;
    list.appendChild(el);
  }

  secLabel('📌 Nacionais automáticos — calculados para ' + ano);
  ferNacAuto.forEach((d, i) => {
    const div = document.createElement('div');
    div.className = 'feriado-item feriado-item--auto';
    const dia = String(d.getDate()).padStart(2,'0');
    const mes = String(d.getMonth()+1).padStart(2,'0');
    div.innerHTML = `
      <span>${NOMES_NAC[i] || ''} — ${dia}/${mes}</span>
      <span class="badge badge--neutral" style="font-size:11px;">Automático</span>
    `;
    list.appendChild(div);
  });

  const fmt = f => `${String(f.dia).padStart(2,'0')}/${String(f.mes).padStart(2,'0')}${f.nome ? ' · ' + f.nome : ''}`;
  const temExtras = feriados.nacionais.length || feriados.estaduais.length ||
    Object.values(feriados.municipais || {}).some(v => v.length);

  if (temExtras) {
    secLabel('➕ Feriados extras cadastrados');
    feriados.nacionais.forEach((f, i) => addFerItem(list, fmt(f), 'nacional', 'nacional', i));
    feriados.estaduais.forEach((f, i) => addFerItem(list, fmt(f), 'estadual', 'estadual', i));
    Object.entries(feriados.municipais || {}).forEach(([mun, lista]) =>
      lista.forEach((f, i) => addFerItem(list, `${mun} — ${fmt(f)}`, 'municipal', mun, i))
    );
  } else {
    const el = document.createElement('div');
    el.style.cssText = 'color:var(--slate-400);font-size:13px;padding:8px 0;';
    el.textContent = 'Nenhum feriado extra cadastrado.';
    list.appendChild(el);
  }

  renderResumos();
}

function addFerItem(list, label, tipo, chave, idx) {
  const corMap = { nacional:'danger', estadual:'warning', municipal:'info' };
  const div = document.createElement('div');
  div.className = `feriado-item feriado-item--${tipo}`;
  div.innerHTML = `
    <div>
      <span class="badge badge--${corMap[tipo]}" style="font-size:11px;">${tipo.charAt(0).toUpperCase()+tipo.slice(1)}</span>
      <span style="margin-left:8px;">${label}</span>
    </div>
    <div style="display:flex;gap:4px;">
      <button class="btn btn--ghost btn--sm" onclick="editarFeriado('${tipo}','${chave}',${idx})">✏️</button>
      <button class="btn btn--ghost btn--sm" style="color:var(--red-500);" onclick="removerFeriado('${tipo}','${chave}',${idx})">🗑️</button>
    </div>
  `;
  list.appendChild(div);
}

function parseFerData(str) {
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const dia = parseInt(m[1]), mes = parseInt(m[2]);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  return { dia, mes };
}

function adicionarFeriado() {
  const f    = parseFerData(document.getElementById('ferData').value);
  const tipo = document.getElementById('ferTipo').value;
  const mun  = document.getElementById('ferMunicipio').value;
  if (!f)                           { alert('Data inválida! Use dd/mm'); return; }
  if (tipo === 'municipal' && !mun) { alert('Selecione o município!');   return; }
  const nome = (document.getElementById('ferNome')?.value || '').trim();
  if (nome) f.nome = nome;
  if (tipo === 'nacional') feriados.nacionais.push(f);
  else if (tipo === 'estadual') feriados.estaduais.push(f);
  else { if (!feriados.municipais[mun]) feriados.municipais[mun] = []; feriados.municipais[mun].push(f); }
  DB.Feriados.salvar(feriados);
  document.getElementById('ferData').value = '';
  if (document.getElementById('ferNome')) document.getElementById('ferNome').value = '';
  renderFeriados();
  const n = _encaixarFeriadosNasSemanas();   // desativa semanas que passaram a ter feriado bloqueante
  mostrarToast(n > 0
    ? `✅ Feriado adicionado — ${n} semana(s) desativada(s) automaticamente.`
    : '✅ Feriado adicionado.');
}

/* Ao adicionar/editar um feriado, desativa as semanas ativas que passaram a
   ter um feriado que paralisa o processo (nacional, estadual ou ponto-chave).
   Não reativa nada (respeita desativações manuais). Retorna quantas desativou. */
function _encaixarFeriadosNasSemanas() {
  const ano = parseInt(document.getElementById('cfgAno').value) || 2026;
  const cfg = DB.Config.carregar();
  const bloq = Utils.calcularSemanasBloqueadas(tercas, ano, feriados, cfg);
  let n = 0;
  bloq.forEach(i => { if (semanasAtivas[i]) { semanasAtivas[i] = false; n++; } });
  if (n > 0) { DB.Semanas.salvar(ano, semanasAtivas); renderSemanasGrid(); }
  return n;
}

function editarFeriado(tipo, chave, idx) {
  ferEditRef = { tipo, chave, idx };
  let f;
  if (tipo === 'municipal') f = feriados.municipais[chave]?.[idx];
  else f = feriados[tipo === 'nacional' ? 'nacionais' : 'estaduais']?.[idx];
  if (!f) return;
  document.getElementById('editFerData').value = `${String(f.dia).padStart(2,'0')}/${String(f.mes).padStart(2,'0')}`;
  document.getElementById('editFerTipo').value  = tipo;
  const nomeEl = document.getElementById('editFerNome');
  if (nomeEl) nomeEl.value = f.nome || '';
  if (tipo === 'municipal') {
    _popularSelectFeriadoMun('editFerMunicipio');
    document.getElementById('editFerMunicipio').value = chave;
    document.getElementById('editFerMunGroup').style.display = 'block';
  } else { document.getElementById('editFerMunGroup').style.display = 'none'; }
  document.getElementById('modalFeriado').classList.add('open');
}

function salvarEdicaoFeriado() {
  if (!ferEditRef) return;
  const f   = parseFerData(document.getElementById('editFerData').value);
  const tipo = document.getElementById('editFerTipo').value;
  const mun  = document.getElementById('editFerMunicipio').value;
  if (!f) { alert('Data inválida!'); return; }
  if (tipo === 'municipal' && !mun) { alert('Selecione o município!'); return; }
  const nome = (document.getElementById('editFerNome')?.value || '').trim();
  if (nome) f.nome = nome;
  removerFeriadoDireto(ferEditRef.tipo, ferEditRef.chave, ferEditRef.idx);
  if (tipo === 'nacional') feriados.nacionais.push(f);
  else if (tipo === 'estadual') feriados.estaduais.push(f);
  else { if (!feriados.municipais[mun]) feriados.municipais[mun] = []; feriados.municipais[mun].push(f); }
  DB.Feriados.salvar(feriados);
  fecharModalFeriado();
  renderFeriados();
  const n = _encaixarFeriadosNasSemanas();
  mostrarToast(n > 0
    ? `✅ Feriado atualizado — ${n} semana(s) desativada(s).`
    : '✅ Feriado atualizado.');
}

function removerFeriadoDireto(tipo, chave, idx) {
  if (tipo === 'municipal') feriados.municipais[chave]?.splice(idx, 1);
  else (tipo === 'nacional' ? feriados.nacionais : feriados.estaduais).splice(idx, 1);
}

function removerFeriado(tipo, chave, idx) {
  if (!confirm('Remover este feriado?')) return;
  removerFeriadoDireto(tipo, chave, idx);
  DB.Feriados.salvar(feriados);
  renderFeriados();
  mostrarToast('🗑️ Feriado removido.');
}

function resetarFeriados() {
  if (!confirm('Restaurar feriados municipais padrão?')) return;
  DB.Feriados.resetar();
  feriados = DB.Feriados.carregar();
  renderFeriados();
  mostrarToast('🔄 Feriados restaurados.');
}

function fecharModalFeriado() {
  document.getElementById('modalFeriado').classList.remove('open');
  ferEditRef = null;
}

/* ════════════════════════════════════════════
   MUNICÍPIOS / METAS
   ════════════════════════════════════════════ */
function renderMunicipios() {
  const totalA = municipios.reduce((s, m) => s + m.meta, 0);
  document.getElementById('metaStats').innerHTML = `
    <div class="stat-card stat-card--info">
      <div class="stat-card__label">Municípios</div>
      <div class="stat-card__value">${municipios.length}</div>
    </div>
    <div class="stat-card stat-card--info">
      <div class="stat-card__label">Total por tipo</div>
      <div class="stat-card__value">${totalA.toLocaleString('pt-BR')}</div>
      <div class="stat-card__sub">físico-químicas/ano (= igual de microbiológicas)</div>
    </div>
    <div class="stat-card stat-card--accent">
      <div class="stat-card__label">Total Geral de Amostras</div>
      <div class="stat-card__value">${(totalA*2).toLocaleString('pt-BR')}</div>
      <div class="stat-card__sub">amostras/ano (FQ + Micro)</div>
    </div>
    <div class="stat-card stat-card--success">
      <div class="stat-card__label">Com regras próprias</div>
      <div class="stat-card__value">${municipios.filter(m => temRegraPersonalizada(m.regras)).length}</div>
    </div>
  `;

  const cfg  = lerConfig();
  const list = document.getElementById('municipiosList');
  list.innerHTML = '';
  municipios.forEach((m, i) => {
    const div = document.createElement('div');
    div.className = 'mun-row';
    div.onclick   = () => abrirModalRegras(i);
    const badges  = gerarBadgesMunicipio(m, cfg);
    div.innerHTML = `
      <div>
        <div class="mun-row__nome">${m.nome}</div>
        <div class="mun-row__sub">Meta: ${m.meta} físico-químicas e ${m.meta} microbiológicas &nbsp;·&nbsp; ${m.meta*2} amostras</div>
      </div>
      <div class="mun-row__right">
        <input type="number" value="${m.meta}" min="1" max="999" style="width:80px;text-align:right;font-weight:700;"
          onclick="event.stopPropagation()"
          onchange="event.stopPropagation(); municipios[${i}].meta = Math.max(1, parseInt(this.value)||0); renderMunicipios();">
        <div>${badges}</div>
      </div>
    `;
    list.appendChild(div);
  });
}

function temRegraPersonalizada(r) {
  if (!r) return false;
  // Modo exato só conta como personalizado se tiver valor preenchido
  const temEntregaCustom =
    (r.modoEntrega === 'exato'     && r.entregaExata != null) ||
    (r.modoEntrega === 'intervalo' && (r.entregaMin != null || r.entregaMax != null));
  const temPeriodo = r.periodicidade != null && r.periodicidade !== 'herdar';
  return temEntregaCustom || temPeriodo || r.pisoMensal != null || r.multiplicadorTeto != null;
}

function gerarBadgesMunicipio(m, cfg) {
  const r = m.regras || {};
  if (!temRegraPersonalizada(r)) return `<span class="regra-badge regra-badge--herda">Herda global</span>`;
  const p = [];
  // Proteção contra null: só exibir badge se o valor for válido
  if (r.modoEntrega === 'exato' && r.entregaExata != null)
    p.push(`<span class="regra-badge regra-badge--custom">⚡ ${r.entregaExata}/visita</span>`);
  if (r.modoEntrega === 'intervalo' && r.entregaMin != null && r.entregaMax != null)
    p.push(`<span class="regra-badge regra-badge--custom">⚡ ${r.entregaMin}–${r.entregaMax}</span>`);
  if (r.periodicidade === '1xmes') p.push(`<span class="regra-badge regra-badge--custom">📅 1×/mês</span>`);
  if (r.periodicidade === '2xmes') p.push(`<span class="regra-badge regra-badge--custom">📅 2×/mês</span>`);
  if (r.periodicidade === '3xmes') p.push(`<span class="regra-badge regra-badge--custom">📅 3×/mês</span>`);
  // Se o modo é fixo/intervalo mas não tem valores válidos, tratar como "Herda global"
  if (!p.length) return `<span class="regra-badge regra-badge--herda">Herda global</span>`;
  return p.join('');
}

function salvarMetas() { DB.Municipios.salvar(municipios); mostrarToast('✅ Metas salvas!'); }
function resetarMetas() {
  if (!confirm('Restaurar metas e regras padrão?')) return;
  DB.Municipios.resetar();
  municipios = DB.Municipios.listar();
  renderMunicipios();
  mostrarToast('🔄 Metas restauradas.');
}

/* ════════════════════════════════════════════
   MODAL REGRAS POR MUNICÍPIO
   ════════════════════════════════════════════ */
function abrirModalRegras(idx) {
  munEditIdx = idx;
  const m   = municipios[idx];
  const r   = { ...DB.Municipios.REGRAS_PADRAO, ...(m.regras || {}) };
  const cfg = lerConfig();
  const mesesN = 12;
  const sugestao = m.meta % mesesN === 0 ? m.meta / mesesN : null;
  const gDescE = cfg.modoEntrega === 'exato' ? `Fixo: ${cfg.entregaExata}` : `${cfg.entregaMin}–${cfg.entregaMax}`;

  document.getElementById('modalRegrasTitle').textContent = `Regras — ${m.nome}`;
  document.getElementById('modalRegrasBody').innerHTML = `
    <div style="background:var(--blue-50);border:1px solid var(--blue-200);border-radius:var(--radius-md);padding:12px 14px;margin-bottom:16px;font-size:13px;line-height:1.7;">
      <strong>Meta anual:</strong> ${m.meta} físico-químicas e ${m.meta} microbiológicas · ${m.meta*2} amostras
      ${sugestao ? `<br><span style="color:var(--green-700);">💡 Para 1×/mês: <strong>${sugestao} frascos/visita</strong> (${m.meta} ÷ 12 = ${sugestao})</span>` : ''}
    </div>

    <div class="regra-section-title">Frascos por visita</div>
    <div class="param-row">
      <label>Modo</label>
      <div class="param-control">
        <div class="modo-toggle" id="toggleModoEntregaMun">
          <button onclick="setModoEntregaMun('herdar')"   id="btnMunHerdar">Herdar global</button>
          <button onclick="setModoEntregaMun('exato')"    id="btnMunExato">Fixo</button>
          <button onclick="setModoEntregaMun('intervalo')" id="btnMunIntervalo">Intervalo</button>
        </div>
        <span style="color:var(--slate-400);font-size:12px;">Global: ${gDescE}</span>
      </div>
    </div>
    <div id="camposMunExato" class="param-row" style="display:none;">
      <label>Quantidade fixa</label>
      <div class="param-control">
        <input type="number" id="munEntregaExata" min="1" max="50" style="width:80px;" value="${r.entregaExata||''}">
        <span class="form-hint">frascos/visita</span>
      </div>
    </div>
    <div id="camposMunIntervalo" class="param-row" style="display:none;">
      <label>Intervalo</label>
      <div class="param-control">
        <input type="number" id="munEntregaMin" min="1" max="50" style="width:70px;" placeholder="Mín" value="${r.entregaMin||''}">
        <span style="color:var(--slate-400);">até</span>
        <input type="number" id="munEntregaMax" min="1" max="50" style="width:70px;" placeholder="Máx" value="${r.entregaMax||''}">
      </div>
    </div>

    <div class="regra-section-title">Periodicidade</div>
    <div class="param-row">
      <label>Frequência mensal</label>
      <div class="param-control">
        <div class="modo-toggle">
          <button onclick="setPeriod('herdar')" id="btnPeriodHerdar">Herdar</button>
          <button onclick="setPeriod('livre')"  id="btnPeriodLivre">Livre</button>
          <button onclick="setPeriod('1xmes')"  id="btnPeriod1x">1×/mês</button>
          <button onclick="setPeriod('2xmes')"  id="btnPeriod2x">2×/mês</button>
          <button onclick="setPeriod('3xmes')"  id="btnPeriod3x">3×/mês</button>
        </div>
      </div>
    </div>
  `;

  setModoEntregaMun(r.modoEntrega || 'herdar', true);
  setPeriod(r.periodicidade || 'herdar', true);
  document.getElementById('modalRegras').classList.add('open');
}

function setModoEntregaMun(modo, s=false) {
  ['herdar','exato','intervalo'].forEach(m => {
    const el = document.getElementById(`btnMun${m.charAt(0).toUpperCase()+m.slice(1)}`);
    if (el) el.classList.toggle('ativo', m === modo);
  });
  const ex  = document.getElementById('camposMunExato');
  const int = document.getElementById('camposMunIntervalo');
  if (ex)  ex.style.display  = modo === 'exato'    ? 'flex' : 'none';
  if (int) int.style.display = modo === 'intervalo'? 'flex' : 'none';
}

function setPeriod(modo, s=false) {
  const map = {herdar:'btnPeriodHerdar',livre:'btnPeriodLivre','1xmes':'btnPeriod1x','2xmes':'btnPeriod2x','3xmes':'btnPeriod3x'};
  Object.entries(map).forEach(([m, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('ativo', m === modo);
  });
}

function getModoEntregaMun() {
  if (document.getElementById('btnMunExato')?.classList.contains('ativo'))    return 'exato';
  if (document.getElementById('btnMunIntervalo')?.classList.contains('ativo')) return 'intervalo';
  return 'herdar';
}

function getPeriodicidade() {
  if (document.getElementById('btnPeriodLivre')?.classList.contains('ativo')) return 'livre';
  if (document.getElementById('btnPeriod1x')?.classList.contains('ativo'))    return '1xmes';
  if (document.getElementById('btnPeriod2x')?.classList.contains('ativo'))    return '2xmes';
  if (document.getElementById('btnPeriod3x')?.classList.contains('ativo'))    return '3xmes';
  return 'herdar';
}

function salvarRegrasModal() {
  if (munEditIdx === null) return;
  const modo = getModoEntregaMun();

  // Validar campos obrigatórios antes de salvar
  if (modo === 'exato') {
    const v = parseFloat(document.getElementById('munEntregaExata')?.value);
    if (!v || v < 1) {
      // Campo vazio: reverter para herdar em vez de salvar null
      const inp = document.getElementById('munEntregaExata');
      if (inp) { inp.style.borderColor = 'var(--red-500)'; inp.focus(); }
      mostrarToast('⚠️ Informe a quantidade fixa ou selecione "Herdar global".');
      return;
    }
  }
  if (modo === 'intervalo') {
    const mn = parseFloat(document.getElementById('munEntregaMin')?.value);
    const mx = parseFloat(document.getElementById('munEntregaMax')?.value);
    if (!mn || !mx) {
      mostrarToast('⚠️ Preencha o mínimo e o máximo do intervalo.');
      return;
    }
    if (mn > mx) {
      mostrarToast('⚠️ Mínimo não pode ser maior que o máximo.');
      return;
    }
  }

  municipios[munEditIdx].regras = {
    modoEntrega:   modo,
    entregaExata:  modo === 'exato'    ? parseFloat(document.getElementById('munEntregaExata')?.value) || null : null,
    entregaMin:    modo === 'intervalo'? parseFloat(document.getElementById('munEntregaMin')?.value)  || null : null,
    entregaMax:    modo === 'intervalo'? parseFloat(document.getElementById('munEntregaMax')?.value)  || null : null,
    periodicidade: getPeriodicidade(),
    multiplicadorTeto: null, pisoMensal: null,
  };
  fecharModalRegras();
  DB.Municipios.salvar(municipios);
  renderMunicipios();
  mostrarToast('✅ Regras salvas para ' + municipios[munEditIdx].nome);
}

function resetarRegrasModal() {
  if (munEditIdx === null) return;
  municipios[munEditIdx].regras = { ...DB.Municipios.REGRAS_PADRAO };
  fecharModalRegras();
  DB.Municipios.salvar(municipios);
  renderMunicipios();
  mostrarToast('🔄 Regras resetadas.');
}

function fecharModalRegras() {
  document.getElementById('modalRegras').classList.remove('open');
  munEditIdx = null;
}

/* ════════════════════════════════════════════
   GERAR PLANO
   ════════════════════════════════════════════ */
function gerarPlano() {
  const cfg = lerConfig();

  // Se o ano já está publicado, avisar que será atualizado mantendo a publicação.
  const eraPublicado = DB.Plano.estaPublicado(cfg.ano);
  if (eraPublicado &&
      !confirm(`O plano de ${cfg.ano} está PUBLICADO. Gerar novamente substitui o conteúdo e ele continuará publicado — os municípios passarão a ver a versão nova. Continuar?`)) {
    return;
  }

  DB.Config.salvar(cfg);
  inicializarSemanas();

  const validacao = Planner.validar(cfg, municipios, tercas, semanasAtivas, feriados);
  const boxEl     = document.getElementById('validacaoBox');
  const secRes    = document.getElementById('secaoResultado');

  if (!validacao.ok) {
    // Limpar resultado anterior e mostrar apenas os erros
    document.getElementById('resultadosContent').innerHTML = '';
    document.getElementById('detalhesContent').innerHTML   = '';
    document.getElementById('resultadoTitulo').textContent = 'Erros encontrados';
    document.getElementById('resultadoSub').textContent    = 'Corrija os problemas abaixo antes de gerar o plano';
    document.getElementById('resultadoAcoes').innerHTML    = '';
    boxEl.innerHTML = `
      <div style="background:var(--red-50);border:1.5px solid var(--red-300);border-radius:var(--radius-md);padding:18px 20px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:var(--red-700);margin-bottom:12px;font-size:15px;">
          🚫 Corrija os erros antes de gerar
        </div>
        ${validacao.erros.map(e => `
          <div style="display:flex;gap:8px;align-items:flex-start;color:var(--red-700);font-size:13.5px;padding:6px 0;border-top:1px solid var(--red-100);">
            <span style="flex-shrink:0;">❌</span>
            <span>${e.msg}</span>
          </div>`).join('')}
        ${validacao.avisos?.length ? `
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--red-200);">
            ${validacao.avisos.map(a => `
              <div style="display:flex;gap:8px;color:var(--amber-700);font-size:13px;padding:4px 0;">
                <span>💡</span><span>${a.msg}</span>
              </div>`).join('')}
          </div>` : ''}
      </div>
    `;
    secRes.classList.add('visivel');
    secRes.scrollIntoView({ behavior:'smooth' });
    return;
  }

  const resultado = Planner.gerar(cfg, municipios, tercas, semanasAtivas, feriados);
  if (!resultado.ok) { alert(resultado.erro); return; }

  planoAtual = resultado;
  DB.Plano.salvar(planoAtual);
  // Mantém a publicação se o ano já estava no ar
  if (eraPublicado) { DB.Plano.publicarAno(cfg.ano); planoAtual.status = 'publicado'; }

  // Avisos (sem erros)
  if (validacao.avisos?.length) {
    boxEl.innerHTML = `
      <div style="background:var(--amber-50);border:1px solid var(--amber-200);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:16px;">
        <div style="font-weight:600;color:var(--amber-700);margin-bottom:6px;font-size:13px;">💡 Avisos</div>
        ${validacao.avisos.map(a => `<div style="color:var(--amber-700);font-size:13px;padding:2px 0;">${a.msg}</div>`).join('')}
      </div>
    `;
  } else {
    boxEl.innerHTML = '';
  }

  mostrarResultado();
  renderPainelPlanos();
  atualizarAnoContexto();
  sincronizarAnoInput();
  renderStatusPlano();
  secRes.scrollIntoView({ behavior:'smooth' });
  mostrarToast('✅ Plano gerado com sucesso!');
}

/* ════════════════════════════════════════════
   RESULTADO
   ════════════════════════════════════════════ */
function mostrarResultado() {
  if (!planoAtual) return;
  const p    = planoAtual;
  const taxa = (p.taxa * 100).toFixed(1);
  const isP  = DB.Plano.estaPublicado(p.cfg.ano);

  document.getElementById('secaoResultado').classList.add('visivel');
  document.getElementById('resultadoTitulo').textContent = `Plano ${p.cfg.ano} — ${taxa}% das metas`;
  document.getElementById('resultadoSub').textContent    =
    `${p.totalDist.toLocaleString('pt-BR')} físico-químicas + ${(p.totalDist*2).toLocaleString('pt-BR')} amostras totais · gerado em ${new Date(p.geradoEm).toLocaleDateString('pt-BR')}`;

  document.getElementById('resultadoAcoes').innerHTML = `
    <span id="statusPlanoTopo"></span>
    <button class="btn btn--sm" style="color:#fff;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.15);" onclick="exportarCSV()">📥 CSV</button>
    ${!isP
      ? '<button class="btn btn--success" onclick="publicarPlano()">📢 Publicar para Municípios</button>'
      : '<button class="btn btn--danger btn--sm" onclick="despublicarPlano()">🔒 Despublicar</button>'
    }
  `;
  renderStatusPlano();

  let pubBanner = '';
  if (isP) {
    pubBanner = '<div class="pub-banner" style="margin-bottom:20px;"><div><h3>✅ Plano publicado!</h3><p>Os municípios já podem acessar seus cronogramas.</p></div><span style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.3);border-radius:20px;padding:5px 14px;font-size:12px;font-weight:700;">PUBLICADO</span></div>';
  }

  const mps    = p.semanasAtivasIdx.map(si => p.munPorSem[si]).filter(v => v > 0);
  const mpsMin = mps.length ? Math.min(...mps) : 0;
  const mpsMax = mps.length ? Math.max(...mps) : 0;
  const mpsMed = mps.length ? (mps.reduce((a,b)=>a+b,0)/mps.length).toFixed(1) : 0;
  const unifCt = (p.uniformidade||[]).filter(u => u.uniforme).length;

  let alertasHtml = '';
  const inc = (p.alertas||[]).find(a => a.tipo === 'incompleto');
  alertasHtml += inc
    ? `<div class="alert alert--danger"><span class="alert__icon">❌</span><div class="alert__body"><div class="alert__title">Metas não atingidas:</div>${inc.items.map(x=>`<div>${x.nome}: faltam ${x.faltam}</div>`).join('')}</div></div>`
    : '<div class="alert alert--success"><span class="alert__icon">✅</span><div class="alert__body"><strong>100% das metas cumpridas!</strong></div></div>';
  (p.alertas||[]).filter(a=>a.tipo==='viagem_baixa').forEach(a=>{
    alertasHtml += `<div class="alert alert--warning"><span class="alert__icon">⚠️</span><div class="alert__body">${a.quantidade} semana(s) com menos de ${a.alvo} frascos (poucos).</div></div>`;
  });
  (p.alertas||[]).filter(a=>a.tipo==='viagem_alta').forEach(a=>{
    alertasHtml += `<div class="alert alert--warning"><span class="alert__icon">⚠️</span><div class="alert__body">${a.quantidade} semana(s) com mais de ${a.alvo} frascos (muitos).</div></div>`;
  });
  (p.alertas||[]).filter(a=>a.tipo==='capacidade_abaixo_piso').forEach(a=>{
    alertasHtml += `<div class="alert alert--info"><span class="alert__icon">ℹ️</span><div class="alert__body">${a.quantidade} semana(s) abaixo do piso de capacidade (${a.piso} frascos/semana; menor: ${a.menor}). É só um aviso de subutilização — o plano está completo.</div></div>`;
  });
  (p.alertas||[]).filter(a=>a.tipo==='capacidade_excedida').forEach(a=>{
    alertasHtml += `<div class="alert alert--danger"><span class="alert__icon">⚠️</span><div class="alert__body">${a.quantidade} semana(s) acima da capacidade de ${a.capacidade} frascos/semana (maior: ${a.maior}). Considere aumentar a capacidade, ativar mais semanas ou reduzir municípios por viagem.</div></div>`;
  });

  // Alerta de periodicidade não cumprida
  const periodViolada = (p.alertas||[]).find(a => a.tipo === 'periodicidade_nao_cumprida');
  if (periodViolada) {
    const detalhes = periodViolada.items.map(item => {
      const mesesStr = item.meses.map(m =>
        `${m.mes}: ${m.planejado}× planejado, ${m.esperado}× esperado`
      ).join(' · ');
      return `<div style="padding:4px 0;border-top:1px solid rgba(180,83,9,.15);margin-top:4px;">
        <strong>${item.municipio}</strong> — periodicidade <em>${item.period}</em> (${item.ppMes}×/mês)
        <div style="font-size:12px;margin-top:3px;color:var(--amber-700);">${mesesStr}</div>
      </div>`;
    }).join('');
    alertasHtml += `
      <div class="alert alert--warning">
        <span class="alert__icon">📅</span>
        <div class="alert__body">
          <div class="alert__title">Periodicidade não cumprida em alguns meses</div>
          <div style="font-size:12.5px;margin-bottom:6px;color:var(--amber-700);">
            A periodicidade configurada não pôde ser totalmente respeitada — isso ocorre quando
            a regra de <strong>mínimo de municípios por viagem (P6)</strong> precisou mover
            participações entre semanas, quebrando o padrão mensal.
            Para resolver: reduza o mínimo de municípios/viagem ou flexibilize a periodicidade.
          </div>
          ${detalhes}
        </div>
      </div>`;
  }

  document.getElementById('resultadosContent').innerHTML = pubBanner + `
    <div class="stats-row">
      <div class="stat-card stat-card--${taxa==='100.0'?'success':'danger'}">
        <div class="stat-card__label">Cumprimento</div><div class="stat-card__value">${taxa}%</div>
        <div class="stat-card__sub">${p.totalDist} / ${p.totalEsper}</div>
      </div>
      <div class="stat-card stat-card--info">
        <div class="stat-card__label">Total de amostras</div>
        <div class="stat-card__value">${(p.totalDist*2).toLocaleString('pt-BR')}</div>
        <div class="stat-card__sub">amostras no ano</div>
      </div>
      <div class="stat-card stat-card--info">
        <div class="stat-card__label">Mun./viagem (média)</div>
        <div class="stat-card__value">${mpsMed}</div>
        <div class="stat-card__sub">min ${mpsMin} · máx ${mpsMax}</div>
      </div>
      <div class="stat-card stat-card--${unifCt===p.municipios.length?'success':'warning'}">
        <div class="stat-card__label">Dist. uniforme</div>
        <div class="stat-card__value">${unifCt}/${p.municipios.length}</div>
        <div class="stat-card__sub">municípios ✅</div>
      </div>
    </div>
    ${alertasHtml}
    <div class="card" style="margin-top:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div class="card__title" style="margin-bottom:0;">📋 Distribuição por Município</div>
        <span class="filtro-count" id="tabelaCount">${p.municipios.length} municípios</span>
      </div>
      <div class="filtro-bar">
        <div class="filtro-busca">
          <span class="filtro-busca-icon">🔍</span>
          <input type="text" id="tabelaBusca" placeholder="Buscar município..." oninput="filtrarTabela()">
        </div>
        <div class="filtro-sep"></div>
        <button class="fpill" id="fpStatus" onclick="toggleFpill(this,'tabelaStatus','ok')">✅ Meta OK</button>
        <button class="fpill" id="fpPendente" onclick="toggleFpill(this,'tabelaStatus','pendente')">❌ Pendente</button>
        <div class="filtro-sep"></div>
        <button class="fpill" id="fpCustom" onclick="toggleFpill(this,'tabelaRegra','custom')">⚡ Custom</button>
        <div class="filtro-sep"></div>
        <button class="fpill" id="fpNaoUnif" onclick="toggleFpill(this,'tabelaUnif','nao')">⚠️ Não uniforme</button>
        <button class="fpill" onclick="limparFiltrosTabela()" style="margin-left:auto;padding:4px 10px;font-size:11.5px;">✕ Limpar</button>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Município</th><th>Meta A</th><th>Planejado</th>
            <th>Participações</th><th>Qtd/visita</th><th>Uniforme</th><th>Regra</th><th>Status</th>
          </tr></thead>
          <tbody id="tabelaBody">
            ${p.municipios.map((m, i) => {
              const total  = p.dist[i].reduce((s,v)=>s+v,0);
              const partic = p.dist[i].filter(v=>v>0).length;
              const u      = p.uniformidade?.[i];
              const qtdStr = u ? (u.min===u.max?`${u.min}`:`${u.min}–${u.max}`) : '—';
              const unifOk = u?.uniforme !== false;
              const ok     = total >= m.meta;
              const isCust = temRegraPersonalizada(m.regras);
              return `<tr data-nome="${m.nome.toLowerCase()}" data-ok="${ok}" data-custom="${isCust}" data-unif="${unifOk}">
                <td><strong>${m.nome}</strong></td>
                <td>${m.meta}</td><td>${total}</td>
                <td>${partic}×</td>
                <td><strong>${qtdStr}</strong></td>
                <td>${unifOk?'<span class="badge badge--success">✅</span>':'<span class="badge badge--warning">⚠️</span>'}</td>
                <td>${isCust?'<span class="badge badge--info">Custom</span>':'<span class="badge badge--neutral">Global</span>'}</td>
                <td><span class="badge badge--${ok?'success':'danger'}">${ok?'✅':'❌'}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  renderDetalhamento(p);
}

/* filtros tabela */
const _filtros = { tabelaBusca:'', tabelaStatus:null, tabelaRegra:null, tabelaUnif:null, detMeses:new Set(), detMuns:new Set() };

function toggleFpill(btn, campo, valor) {
  _filtros[campo] = _filtros[campo]===valor ? null : valor;
  document.querySelectorAll(`[onclick*="${campo}"]`).forEach(b=>b.classList.remove('ativo'));
  if(_filtros[campo]) btn.classList.add('ativo');
  filtrarTabela();
}

function filtrarTabela() {
  _filtros.tabelaBusca = (document.getElementById('tabelaBusca')?.value||'').toLowerCase();
  const rows = document.querySelectorAll('#tabelaBody tr');
  let vis = 0;
  rows.forEach(tr => {
    let show = true;
    if(_filtros.tabelaBusca && !(tr.dataset.nome||'').includes(_filtros.tabelaBusca)) show=false;
    if(_filtros.tabelaStatus==='ok'       && tr.dataset.ok!=='true')    show=false;
    if(_filtros.tabelaStatus==='pendente'  && tr.dataset.ok==='true')    show=false;
    if(_filtros.tabelaRegra ==='custom'    && tr.dataset.custom!=='true') show=false;
    if(_filtros.tabelaUnif  ==='nao'       && tr.dataset.unif==='true')   show=false;
    tr.style.display = show ? '' : 'none';
    if(show) vis++;
  });
  const cnt = document.getElementById('tabelaCount');
  if(cnt) cnt.textContent = `${vis} de ${rows.length} municípios`;
}

function limparFiltrosTabela() {
  _filtros.tabelaBusca=_filtros.tabelaStatus=_filtros.tabelaRegra=_filtros.tabelaUnif=null;
  const inp=document.getElementById('tabelaBusca'); if(inp) inp.value='';
  document.querySelectorAll('.fpill').forEach(b=>b.classList.remove('ativo'));
  filtrarTabela();
}

/* detalhamento */
function renderDetalhamento(p) {
  const tercasD  = p.tercas.map(s=>new Date(s));
  const mesesDisp = [...new Set(p.semanasAtivasIdx.map(si=>tercasD[si].getMonth()+1))].sort((a,b)=>a-b);
  document.getElementById('detalhesContent').innerHTML = `
    <div style="margin-top:24px;">
      <div style="font-family:var(--font-display);font-size:16px;font-weight:700;color:var(--slate-800);margin-bottom:16px;">📋 Detalhamento por Mês</div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="mun-ms" id="munMsWrap">
          <button class="mun-ms-trigger" id="munMsTrigger" onclick="toggleMunMs()">
            <span id="munMsLabel">Todos os municípios</span><span style="color:var(--slate-400);font-size:11px;">▼</span>
          </button>
          <div class="mun-ms-dropdown" id="munMsDropdown">
            <div class="mun-ms-search"><input type="text" placeholder="Buscar..." oninput="filtrarOpsMunMs(this.value)"></div>
            <div id="munMsOpts">${p.municipios.map((m,i)=>`
              <label class="mun-ms-opt" id="munOpt${i}">
                <input type="checkbox" value="${m.nome}" onchange="toggleMunDetalhe('${m.nome}')"> ${m.nome}
              </label>`).join('')}</div>
            <div class="mun-ms-foot">
              <button class="btn btn--secondary btn--sm" onclick="limparMunDetalhe()">Limpar</button>
              <button class="btn btn--primary btn--sm" onclick="toggleMunMs()">OK</button>
            </div>
          </div>
        </div>
        <div class="mes-pills" style="margin-bottom:0;gap:5px;" id="mesPills">
          <button class="mes-pill mes-pill--todos ativo" onclick="toggleMesFiltro(0)" data-mes="0">Todos</button>
          ${mesesDisp.map(m=>`<button class="mes-pill" onclick="toggleMesFiltro(${m})" data-mes="${m}">${Utils.MESES_PT[m-1].substring(0,3)}</button>`).join('')}
        </div>
        <button class="fpill" onclick="limparFiltrosDetalhe()" style="padding:4px 10px;font-size:11.5px;">✕ Limpar</button>
      </div>
      <div id="detalheMeses">
        ${mesesDisp.map(mes => {
          const semMes = p.semanasAtivasIdx.filter(si=>tercasD[si].getMonth()+1===mes);
          const totMes = semMes.reduce((s,si)=>s+p.totSem[si],0);
          return `<div class="mes-bloco" data-mes="${mes}">
            <div class="mes-header">
              <span>${Utils.MESES_PT[mes-1]} ${p.cfg.ano}</span>
              <span>${totMes.toLocaleString('pt-BR')} amostras · ${semMes.length} viagens</span>
            </div>
            ${semMes.map(si => {
              const muns = p.municipios.map((m,i)=>({nome:m.nome,qtd:p.dist[i][si]})).filter(x=>x.qtd>0).sort((a,b)=>b.qtd-a.qtd);
              return `<div class="semana-card" data-sem="${si}">
                <div class="semana-card__header">
                  <div><strong>Semana ${si+1}</strong> · ${Utils.fmtData(tercasD[si],{weekday:'short',day:'2-digit',month:'2-digit'})}</div>
                  <div style="display:flex;gap:6px;">
                    <span class="badge badge--info">${p.totSem[si]} A + ${p.totSem[si]} B</span>
                    <span class="badge badge--neutral">${muns.length} municípios</span>
                  </div>
                </div>
                <div>${muns.map(m=>`<span class="mun-tag" data-mun="${m.nome}">${m.nome} <strong>${m.qtd}</strong></span>`).join('')}</div>
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  document.addEventListener('click', fecharMunMsFora);
}

function toggleMunMs() {
  const d=document.getElementById('munMsDropdown'), t=document.getElementById('munMsTrigger');
  if(!d||!t) return;
  d.classList.toggle('open'); t.classList.toggle('open');
}
function fecharMunMsFora(e) {
  const w=document.getElementById('munMsWrap');
  if(w&&!w.contains(e.target)) {
    document.getElementById('munMsDropdown')?.classList.remove('open');
    document.getElementById('munMsTrigger')?.classList.remove('open');
  }
}
function filtrarOpsMunMs(t) {
  document.querySelectorAll('.mun-ms-opt').forEach(o=>{o.style.display=o.textContent.toLowerCase().includes(t.toLowerCase())?'':' none';});
}
function toggleMunDetalhe(nome) {
  if(_filtros.detMuns.has(nome)) _filtros.detMuns.delete(nome); else _filtros.detMuns.add(nome);
  atualizarLabelMunMs(); aplicarFiltrosDetalhe();
}
function limparMunDetalhe() {
  _filtros.detMuns.clear();
  document.querySelectorAll('.mun-ms-opt input').forEach(cb=>{cb.checked=false;});
  document.querySelectorAll('.mun-ms-opt').forEach(o=>o.classList.remove('sel'));
  atualizarLabelMunMs(); aplicarFiltrosDetalhe();
}
function atualizarLabelMunMs() {
  const l=document.getElementById('munMsLabel'); if(!l) return;
  const n=_filtros.detMuns.size;
  l.textContent = n===0?'Todos os municípios':n===1?[..._filtros.detMuns][0]:`${n} municípios selecionados`;
  document.querySelectorAll('.mun-ms-opt').forEach(o=>{
    const cb=o.querySelector('input'), nm=cb?.value;
    if(cb) cb.checked=_filtros.detMuns.has(nm);
    o.classList.toggle('sel',_filtros.detMuns.has(nm));
  });
}
function toggleMesFiltro(mes) {
  if(mes===0) {
    _filtros.detMeses.clear();
    document.querySelectorAll('#mesPills .mes-pill').forEach(p=>p.classList.remove('ativo'));
    document.querySelector('#mesPills .mes-pill--todos')?.classList.add('ativo');
  } else {
    document.querySelector('#mesPills .mes-pill--todos')?.classList.remove('ativo');
    const btn=document.querySelector(`#mesPills [data-mes="${mes}"]`);
    if(_filtros.detMeses.has(mes)) { _filtros.detMeses.delete(mes); btn?.classList.remove('ativo'); }
    else { _filtros.detMeses.add(mes); btn?.classList.add('ativo'); }
    if(_filtros.detMeses.size===0) document.querySelector('#mesPills .mes-pill--todos')?.classList.add('ativo');
  }
  aplicarFiltrosDetalhe();
}
function limparFiltrosDetalhe() {
  _filtros.detMeses.clear(); _filtros.detMuns.clear();
  document.querySelectorAll('#mesPills .mes-pill').forEach(p=>p.classList.remove('ativo'));
  document.querySelector('#mesPills .mes-pill--todos')?.classList.add('ativo');
  limparMunDetalhe();
}
function aplicarFiltrosDetalhe() {
  const temMes=_filtros.detMeses.size>0, temMun=_filtros.detMuns.size>0;
  document.querySelectorAll('#detalheMeses .mes-bloco').forEach(bloco=>{
    const mes=parseInt(bloco.dataset.mes);
    if(temMes && !_filtros.detMeses.has(mes)) { bloco.style.display='none'; return; }
    bloco.style.display='';
    bloco.querySelectorAll('.semana-card').forEach(card=>{
      if(!temMun) {
        card.classList.remove('s-dim');
        card.querySelectorAll('.mun-tag').forEach(t=>{t.classList.remove('t-hl','t-dim');});
        return;
      }
      const tags=card.querySelectorAll('.mun-tag');
      const temAlgum=[...tags].some(t=>_filtros.detMuns.has(t.dataset.mun));
      card.classList.toggle('s-dim',!temAlgum);
      tags.forEach(t=>{
        const sel=_filtros.detMuns.has(t.dataset.mun);
        t.classList.toggle('t-hl', temAlgum && sel);
        t.classList.toggle('t-dim', temAlgum && !sel);
      });
    });
  });
}


function renderStatusPlano() {
  const el = document.getElementById('statusPlanoTopo');
  const ano = planoAtual?.cfg?.ano || parseInt(document.getElementById('cfgAno').value) || null;
  const p  = ano ? DB.Plano.carregar(ano) : null;
  if (!el || !p) { if (el) el.innerHTML = ''; return; }
  const dt  = new Date(p.publicadoEm).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});

  let prazoHtml = '';
  if (p.status === 'publicado' && ano) {
    const textoPrazo = DB.Plano.textoPrazo(ano);
    const podeEditar = DB.Plano.podeEditar(ano);
    if (textoPrazo) {
      prazoHtml = podeEditar
        ? `<span class="badge badge--success" style="margin-left:8px;font-size:11px;">Edição até ${textoPrazo}</span>`
        : `<span class="badge badge--danger" style="margin-left:8px;font-size:11px;">⚠️ Prazo encerrado</span>`;
    }
  }

  el.innerHTML = p.status === 'publicado'
    ? `<span class="status-pill status-pill--pub">✅ Publicado ${dt}</span>${prazoHtml}`
    : `<span class="status-pill status-pill--draft">⏳ Rascunho ${dt}</span>`;

  const barInfo = document.getElementById('gerarBarInfo');
  const barSub  = document.getElementById('gerarBarSub');
  if (barInfo && barSub) {
    if (p.status === 'publicado') {
      barInfo.textContent = `Plano ${ano || ''} publicado`;
      barSub.textContent  = 'Os municípios já podem acessar seus cronogramas';
    } else {
      barInfo.textContent = `Rascunho — ${((p.taxa||0)*100).toFixed(0)}% das metas planejadas`;
      barSub.textContent  = 'Clique em Gerar Plano para atualizar';
    }
  }
}

function publicarPlano() {
  if (!planoAtual?.cfg?.ano) return;
  publicarAno(planoAtual.cfg.ano);
}

function despublicarPlano() {
  if (!planoAtual?.cfg?.ano) return;
  despublicarAno(planoAtual.cfg.ano);
}

/* ════════════════════════════════════════════
   CSV
   ════════════════════════════════════════════ */
function exportarCSV() {
  if (!planoAtual) return;
  const p      = planoAtual;
  const tercasD = p.tercas.map(s => new Date(s));
  let csv = 'Semana,Data,Mes,Municipio,Regra,Tipo_A,Tipo_B,Total_Viagem\n';
  for (const si of p.semanasAtivasIdx) {
    const data = Utils.fmtData(tercasD[si]);
    const mes  = Utils.MESES_PT[tercasD[si].getMonth()];
    let first  = true;
    p.municipios.forEach((m, i) => {
      const qtd = p.dist[i][si];
      if (qtd > 0) {
        const regra = temRegraPersonalizada(m.regras) ? 'Personalizado' : 'Global';
        csv += `${si+1},${data},${mes},${m.nome},${regra},${qtd},${qtd},${first ? p.totSem[si]*2 : ''}\n`;
        first = false;
      }
    });
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8;' }));
  a.download = `vigiagua_plano_${p.cfg.ano}.csv`;
  a.click();
}

/* ════════════════════════════════════════════
   UTILS
   ════════════════════════════════════════════ */
function sair() { DB.Auth.logoutAsync().finally(() => { window.location.href = 'index.html'; }); }

let _tt;
function mostrarToast(msg) {
  let t = document.getElementById('_toast');
  if (!t) {
    t = document.createElement('div'); t.id = '_toast';
    Object.assign(t.style, {
      position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)',
      background:'var(--slate-800)', color:'#fff', padding:'10px 22px',
      borderRadius:'8px', fontSize:'13.5px', fontWeight:'500',
      boxShadow:'var(--shadow-lg)', zIndex:'9999',
      transition:'opacity .3s', pointerEvents:'none',
    });
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(_tt);
  _tt = setTimeout(() => { t.style.opacity = '0'; }, 2800);
}
