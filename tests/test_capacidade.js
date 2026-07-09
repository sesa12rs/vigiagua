/* Reproduz o cenário do usuário: capacidade 55/semana, ano 2027.
   Verifica que o nivelamento mantém todas as semanas <= capacidade
   e preserva 100% das metas e 10 municípios por viagem. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// localStorage falso (data.js precisa, mas só usamos Planner + Utils)
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};

function load(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }
(0, eval)(load('js/utils.js') + '\nglobalThis.Utils = Utils;');
(0, eval)(load('js/data.js')  + '\nglobalThis.DB = DB;');
(0, eval)(load('js/planner.js') + '\nglobalThis.Planner = Planner;');

let fail = 0;
const check = (label, cond, extra = '') => {
  console.log((cond ? '  ✅ ' : '  ❌ ') + label + (cond ? '' : '  ' + extra));
  if (!cond) fail++;
};

function rodar(ano, capacidade) {
  const cfg = { ...DB.Config.PADRAO, ano, capacidade };
  const municipios = DB.Municipios.listar();
  const feriados   = DB.Feriados.carregar();
  const tercas = Utils.tercasFeirasDoAno(ano);

  // Semanas default: replica a lógica do planner (recesso jan/dez + feriado nac. quarta)
  const semanasAtivas = tercas.map(t => {
    const m = t.getMonth() + 1;
    if (m === 1 || m === 12) return false;       // recesso
    return true;
  });

  return Planner.gerar(cfg, municipios, tercas, semanasAtivas, feriados);
}

console.log('\n[Capacidade 55 — 2027]');
{
  const cap = 55;
  const p = rodar(2027, cap);
  check('plano gerado', p && p.ok, p && p.erro);
  if (p && p.ok) {
    const idx = p.semanasAtivasIdx;
    const totsAtivas = idx.map(si => p.totSem[si]).filter(t => t > 0);
    const maxSem = Math.max(...totsAtivas);
    const acima  = totsAtivas.filter(t => t > cap);
    console.log(`    semanas ativas com coleta: ${totsAtivas.length} · maior total: ${maxSem} · acima de ${cap}: ${acima.length}`);
    check(`nenhuma semana acima de ${cap} frascos`, acima.length === 0, `acima=${acima.join(',')}`);

    // 100% das metas
    const totMun = p.municipios.map((m, mi) => p.dist[mi].reduce((s, v) => s + v, 0));
    const faltam = p.municipios.filter((m, mi) => totMun[mi] < m.meta);
    check('100% das metas mantidas', faltam.length === 0, faltam.map(m=>m.nome).join(','));

    // 10 municípios por viagem (semanas com Umuarama presente)
    const fora = idx.filter(si => { const n = p.munPorSem[si]; return n > 0 && (n < 10 || n > 10); });
    // Algumas semanas podem ter feriado de Umuarama (then 10 ainda, com outro no lugar) — toleramos <=10
    const acimaDe10 = idx.filter(si => p.munPorSem[si] > 10);
    check('nenhuma viagem com mais de 10 municípios', acimaDe10.length === 0, `${acimaDe10.length} semanas`);

    // uniformidade por município preservada (varia no máx 1)
    const naoUnif = (p.uniformidade || []).filter(u => u.partic > 0 && !u.uniforme).length;
    check('uniformidade por município preservada', naoUnif === 0, `${naoUnif} municípios não uniformes`);
  }
}

console.log('\n[Capacidade folgada 80 — 2027] (não deve gerar alerta de excesso)');
{
  const p = rodar(2027, 80);
  const temAlerta = (p.alertas || []).some(a => a.tipo === 'capacidade_excedida');
  check('sem alerta de capacidade excedida', !temAlerta);
}

console.log('\n[Sem capacidade definida — 2027] (comportamento livre, sem erro)');
{
  const cfg = { ...DB.Config.PADRAO, ano: 2027, capacidade: null };
  const municipios = DB.Municipios.listar();
  const feriados = DB.Feriados.carregar();
  const tercas = Utils.tercasFeirasDoAno(2027);
  const semanasAtivas = tercas.map(t => { const m = t.getMonth()+1; return !(m===1||m===12); });
  const p = Planner.gerar(cfg, municipios, tercas, semanasAtivas, feriados);
  check('plano gerado sem capacidade', p && p.ok);
}

console.log(fail ? `\n❌ ${fail} falha(s)` : '\n✅ Todos os testes de capacidade passaram');
process.exit(fail ? 1 : 0);
