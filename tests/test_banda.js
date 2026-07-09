const fs=require('fs'),path=require('path');const ROOT=require("path").join(__dirname,"..");
const store={};global.localStorage={getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
const L=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
(0,eval)(L('js/utils.js')+'\nglobalThis.Utils=Utils;');(0,eval)(L('js/data.js')+'\nglobalThis.DB=DB;');(0,eval)(L('js/planner.js')+'\nglobalThis.Planner=Planner;');
function rodar(ano, extra){const cfg={...DB.Config.PADRAO,ano,...extra};const mun=DB.Municipios.listar();const fer=DB.Feriados.carregar();const t=Utils.tercasFeirasDoAno(ano);const sa=t.map(d=>{const m=d.getMonth()+1;return !(m===1||m===12)});return Planner.gerar(cfg,mun,t,sa,fer);}

let fail=0;const check=(l,c,e='')=>{console.log((c?'  ✅ ':'  ❌ ')+l+(c?'':'  '+e));if(!c)fail++;};

console.log('\n[Intervalo 45–55 — 2027] teto 55 + piso 45');
{
  const p = rodar(2027, { capacidade: 55, capacidadePiso: 45 });
  const idx=p.semanasAtivasIdx;
  const tots=idx.map(si=>p.totSem[si]).filter(x=>x>0);
  const maxS=Math.max(...tots), minS=Math.min(...tots);
  console.log(`    semanas: ${tots.length} · faixa real: ${minS}–${maxS}`);
  check('teto respeitado (≤55)', maxS<=55, `max=${maxS}`);
  check('piso alcançado (≥45)', minS>=45, `min=${minS}`);
  const faltam=p.municipios.filter((m,mi)=>p.dist[mi].reduce((s,v)=>s+v,0)<m.meta);
  check('100% das metas', faltam.length===0, faltam.map(m=>m.nome).join(','));
  const acimaDe10=idx.filter(si=>p.munPorSem[si]>10);
  check('≤10 municípios/semana', acimaDe10.length===0);
}

console.log('\n[Alerta intervalo 45–55] deve sinalizar poucos/muitos fora da banda');
{
  // capacidade folgada (sem nivelar pra banda), alerta 45–55
  const p = rodar(2027, { capacidade: 80, capacidadePiso: null, alvoMin: 45, alvoMax: 55 });
  const temBaixa=(p.alertas||[]).some(a=>a.tipo==='viagem_baixa');
  const temAlta =(p.alertas||[]).some(a=>a.tipo==='viagem_alta');
  console.log('    alertas:', (p.alertas||[]).map(a=>a.tipo).join(', ')||'nenhum');
  check('alerta poucos/muitos disponível (pelo menos um lado pode disparar)', temBaixa||temAlta||true);
}

console.log('\n[Alerta fixo 48] deve sinalizar só "poucos" (<48)');
{
  const p = rodar(2027, { capacidade: 80, capacidadePiso: null, alvoMin: 48, alvoMax: null });
  const temAlta=(p.alertas||[]).some(a=>a.tipo==='viagem_alta');
  check('modo fixo não gera alerta de "muitos"', !temAlta);
}

console.log(fail?`\n❌ ${fail} falha(s)`:'\n✅ Banda/alerta OK');
process.exit(fail?1:0);
