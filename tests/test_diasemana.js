/* Fatia 4 — dia de Coleta/Entrega configurável.
   Verifica que:
   - o padrão (terça/quarta) reproduz o comportamento atual;
   - escolher outro dia (ex.: coleta na segunda) desloca TODAS as datas;
   - o offset de entrega é derivado corretamente;
   - a geração e os feriados seguem o dia escolhido.
   node tests/test_diasemana.js
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

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
  console.log((cond ? '  \u2705 ' : '  \u274c ') + label + (cond ? '' : '  ' + extra));
  if (!cond) fail++;
};

const ano = 2027;

console.log('\n[Datas do dia de coleta]');
const tercas = Utils.tercasFeirasDoAno(ano);            // padrão (terça = 2)
const segundas = Utils.tercasFeirasDoAno(ano, 1);      // coleta na segunda
const sextas = Utils.tercasFeirasDoAno(ano, 5);
check('padrão gera terças (getDay 2)', tercas.every(d => d.getDay() === 2));
check('dia 1 gera segundas (getDay 1)', segundas.every(d => d.getDay() === 1));
check('dia 5 gera sextas (getDay 5)', sextas.every(d => d.getDay() === 5));
check('trocar o dia desloca a 1ª data', tercas[0].getTime() !== segundas[0].getTime());

console.log('\n[Offset de entrega derivado]');
check('terça→quarta = 1', Utils.offsetEntrega({ diaColeta: 2, diaEntrega: 3 }) === 1);
check('segunda→quarta = 2', Utils.offsetEntrega({ diaColeta: 1, diaEntrega: 3 }) === 2);
check('sexta→segunda = 3 (semana seguinte)', Utils.offsetEntrega({ diaColeta: 5, diaEntrega: 1 }) === 3);
check('cfg sem dias → padrão 1', Utils.offsetEntrega({}) === 1);

console.log('\n[Feriado usa o dia de ENTREGA conforme offset]');
{
  // coleta numa segunda; entrega = segunda + 2 = quarta
  const seg = segundas[10];
  const quarta = new Date(seg); quarta.setDate(quarta.getDate() + 2);
  const ferNacQuarta = [new Date(quarta)];
  check('nacional na entrega (offset 2) bloqueia a semana',
    Utils.quartaEhFeriadoNacional(seg, ferNacQuarta, 2) === true);
  check('mesmo feriado NÃO bloqueia se offset for 1 (terça+1)',
    Utils.quartaEhFeriadoNacional(seg, ferNacQuarta, 1) === false);
  // municipal no dia de coleta (segunda)
  const fMun = { 'Altônia': [{ mes: seg.getMonth() + 1, dia: seg.getDate() }] };
  check('municipal no dia de coleta é detectado', Utils.ehFeriadoMunicipal('Altônia', seg, fMun, 2) === true);
}

console.log('\n[Geração completa com dia diferente]');
function gerar(diaColeta, diaEntrega) {
  const cfg = { ...DB.Config.PADRAO, ano, diaColeta, diaEntrega };
  const municipios = DB.Municipios.listar();
  const feriados   = DB.Feriados.carregar();
  const datas = Utils.tercasFeirasDoAno(ano, diaColeta);
  const semanasAtivas = datas.map(t => {
    const m = t.getMonth() + 1;
    return !(m === 1 || m === 12);
  });
  return { plano: Planner.gerar(cfg, municipios, datas, semanasAtivas, feriados), datas };
}
const padrao = gerar(2, 3);
const segunda = gerar(1, 3);
check('plano (padrão) atinge 100% das metas', padrao.plano.taxa === 1, `taxa=${padrao.plano.taxa}`);
check('plano (coleta 2ª) atinge 100% das metas', segunda.plano.taxa === 1, `taxa=${segunda.plano.taxa}`);
check('total distribuído idêntico nos dois dias', padrao.plano.totalDist === segunda.plano.totalDist,
  `${padrao.plano.totalDist} vs ${segunda.plano.totalDist}`);
check('as viagens ativas caíram na segunda-feira',
  segunda.plano.semanasAtivasIdx.every(i => segunda.datas[i].getDay() === 1));
check('as viagens ativas (padrão) caíram na terça-feira',
  padrao.plano.semanasAtivasIdx.every(i => padrao.datas[i].getDay() === 2));

console.log('\n[Feriado que paralisa o processo — bloqueio de semana (fatia 5)]');
{
  const datas = Utils.tercasFeirasDoAno(ano);           // terças de 2027
  const cfgBase = { diaColeta: 2, diaEntrega: 3,
    pontosBloqueio: { 'Umuarama': { coleta: true, entrega: true }, 'Maringá': { coleta: false, entrega: true } } };

  // pega uma terça (coleta) e a quarta (entrega) da mesma semana
  const iAlvo = 20;
  const coleta = datas[iAlvo];
  const entrega = new Date(coleta); entrega.setDate(entrega.getDate() + 1);
  const dd = d => ({ mes: d.getMonth() + 1, dia: d.getDate() });

  // estadual no dia de entrega → bloqueia
  let fer = { nacionais: [], estaduais: [dd(entrega)], municipais: {} };
  check('estadual no dia de entrega bloqueia a semana',
    Utils.calcularSemanasBloqueadas(datas, ano, fer, cfgBase).includes(iAlvo));

  // Umuarama no dia de coleta → bloqueia (config coleta:true)
  fer = { nacionais: [], estaduais: [], municipais: { 'Umuarama': [dd(coleta)] } };
  check('Umuarama no dia de coleta bloqueia (config coleta:true)',
    Utils.calcularSemanasBloqueadas(datas, ano, fer, cfgBase).includes(iAlvo));

  // Maringá no dia de coleta → NÃO bloqueia (config coleta:false); no de entrega → bloqueia
  fer = { nacionais: [], estaduais: [], municipais: { 'Maringá': [dd(coleta)] } };
  check('Maringá no dia de coleta NÃO bloqueia (config coleta:false)',
    !Utils.calcularSemanasBloqueadas(datas, ano, fer, cfgBase).includes(iAlvo));
  fer = { nacionais: [], estaduais: [], municipais: { 'Maringá': [dd(entrega)] } };
  check('Maringá no dia de entrega bloqueia (config entrega:true)',
    Utils.calcularSemanasBloqueadas(datas, ano, fer, cfgBase).includes(iAlvo));

  // município comum (Altônia) no dia de coleta → NÃO bloqueia a semana (só redistribui na geração)
  fer = { nacionais: [], estaduais: [], municipais: { 'Altônia': [dd(coleta)] } };
  check('município comum NÃO bloqueia a semana',
    !Utils.calcularSemanasBloqueadas(datas, ano, fer, cfgBase).includes(iAlvo));

  // config desmarcada → Umuarama deixa de bloquear
  const cfgOff = { diaColeta: 2, diaEntrega: 3, pontosBloqueio: { 'Umuarama': { coleta: false, entrega: false } } };
  fer = { nacionais: [], estaduais: [], municipais: { 'Umuarama': [dd(coleta)] } };
  check('config desmarcada → Umuarama não bloqueia',
    !Utils.calcularSemanasBloqueadas(datas, ano, fer, cfgOff).includes(iAlvo));
}

// ── rangeSemana: intervalo domingo a sábado (semana inteira) ──
check('rangeSemana terça 05/01/2027 → "03 a 09 de jan"', Utils.rangeSemana(new Date(2027,0,5)) === '03 a 09 de jan', Utils.rangeSemana(new Date(2027,0,5)));
check('rangeSemana entre meses (30/03) → "28 de mar a 03 de abr"', Utils.rangeSemana(new Date(2027,2,30)) === '28 de mar a 03 de abr', Utils.rangeSemana(new Date(2027,2,30)));
check('rangeSemana domingo (03/01) → "03 a 09 de jan"', Utils.rangeSemana(new Date(2027,0,3)) === '03 a 09 de jan');

console.log(fail ? `\n\u274c ${fail} falha(s)` : '\n\u2705 Dia de coleta/entrega OK');
process.exit(fail ? 1 : 0);
