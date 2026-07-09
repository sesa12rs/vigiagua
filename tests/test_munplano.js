/* Persistência do plano municipal (etapas 1–3) + smoke do DB.Sync.
   node tests/test_munplano.js */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

function loadPage(file, { session, seedStorage = {} }) {
  let html = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/<script[^>]*src="https?:\/\/[^"]*"[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url:'http://localhost/'+file, runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:new VirtualConsole() });
  const { window } = dom;
  window.HTMLElement.prototype.scrollIntoView=()=>{}; window.scrollTo=()=>{};
  for (const [k,v] of Object.entries(seedStorage)) window.localStorage.setItem(k, typeof v==='string'?v:JSON.stringify(v));
  if (session) window.localStorage.setItem('va_session', JSON.stringify(session));
  const srcs=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]);
  const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  for (const s of srcs) window.eval(fs.readFileSync(path.join(ROOT,s),'utf8')+'\n;try{window.DB=DB}catch(e){};try{window.Utils=Utils}catch(e){};try{window.Planner=Planner}catch(e){}');
  for (const code of inline) window.eval(code);
  return { window };
}
let fail=0; const check=(l,c,e='')=>{console.log((c?'  ✅ ':'  ❌ ')+l+(c?'':'  '+e));if(!c)fail++;};

// Regional publica 2027
const a = loadPage('planner.html', { session:{userId:1,perfil:'regional',nome:'R',municipioId:null} });
a.window.confirm=()=>true; a.window.alert=()=>{};
a.window.eval('selecionarAno(2027); gerarPlano(); publicarAno(2027);');
const seed={}; for(let i=0;i<a.window.localStorage.length;i++){const k=a.window.localStorage.key(i);seed[k]=a.window.localStorage.getItem(k);}

// ── Sessão 1 do município: preenche tudo e deixa salvar ──
const m1 = loadPage('municipio.html', { session:{userId:102,perfil:'municipio',nome:'Altônia',municipioId:3}, seedStorage:seed });
m1.window.alert=()=>{};
const d1=m1.window.document;
['populacao','endereco','secretario','responsavel','profissional'].forEach((id,i)=>d1.getElementById(id).value = i===0?'20500':'Fulano-'+id);
d1.getElementById('municipio').value='Altônia';
d1.getElementById('vigilancia').value='Vigilância Ambiental';
m1.window.eval('irEtapa2()');
// locais + linha 0 vira SAC sem CR (gera filha) + data da filha alterada
d1.querySelectorAll('#corpoTabela tr:not([data-linked]) .local-input').forEach((el,i)=>el.value='Ponto '+(i+1));
const tr0 = d1.querySelector('#corpoTabela tr:not([data-linked])');
tr0.querySelector('.sistema-select').value='SAC'; m1.window.eval("aplicarRegrasSistema(document.querySelector('#corpoTabela tr:not([data-linked])'))");
const cr0 = tr0.querySelector('.cr-chk'); cr0.checked=false; cr0.dispatchEvent(new m1.window.Event('change'));
const filha1 = d1.querySelector('#corpoTabela tr[data-linked]');
filha1.querySelector('.data-input').value='2027-06-15';
filha1.querySelector('.local-input').value='SAA da sede';
// extra
m1.window.eval('adicionarColetaExtra()');
const ex1 = d1.querySelector('#corpoTabelaExtras tr');
ex1.querySelector('.local-input').value='Reclamação bairro X';
ex1.querySelector('.mb-chk').checked=false;
m1.window.eval('salvarPlanoMunicipal()');
const chave = m1.window.eval('_munplanoKey()');
check('plano municipal salvo no localStorage', !!m1.window.localStorage.getItem(chave), chave);

// ── Sessão 2 (recarga): tudo deve voltar ──
const seed2={}; for(let i=0;i<m1.window.localStorage.length;i++){const k=m1.window.localStorage.key(i);seed2[k]=m1.window.localStorage.getItem(k);}
const m2 = loadPage('municipio.html', { session:{userId:102,perfil:'municipio',nome:'Altônia',municipioId:3}, seedStorage:seed2 });
m2.window.alert=()=>{};
const d2=m2.window.document;
d2.getElementById('municipio').value='Altônia';
m2.window.eval('irEtapa2()');
check('campo população restaurado', d2.getElementById('populacao').value==='20500');
check('campo vigilância restaurado', d2.getElementById('vigilancia').value==='Vigilância Ambiental');
const r0 = d2.querySelector('#corpoTabela tr:not([data-linked])');
check('local da 1ª coleta restaurado', r0.querySelector('.local-input').value==='Ponto 1');
check('sistema SAC restaurado', r0.querySelector('.sistema-select').value==='SAC');
check('CR desmarcado restaurado', r0.querySelector('.cr-chk').checked===false);
const filha2 = d2.querySelector('#corpoTabela tr[data-linked]');
check('linha derivada recriada', !!filha2);
check('data editada da filha restaurada', filha2 && filha2.querySelector('.data-input').value==='2027-06-15', filha2?.querySelector('.data-input').value);
check('local da filha restaurado', filha2 && filha2.querySelector('.local-input').value==='SAA da sede');
const ex2 = d2.querySelector('#corpoTabelaExtras tr');
check('coleta extra recriada', !!ex2);
check('local da extra restaurado', ex2 && ex2.querySelector('.local-input').value==='Reclamação bairro X');
check('MB da extra (desmarcado) restaurado', ex2 && ex2.querySelector('.mb-chk').checked===false);

// ── Smoke do DB.Sync com Supabase falso ──
console.log('\n[DB.Sync — smoke com cliente falso]');
const m3 = loadPage('municipio.html', { session:{userId:102,perfil:'municipio',nome:'Altônia',municipioId:3}, seedStorage:seed2 });
const w = m3.window;
const upserts=[]; const store={};
w.VIGIAGUA_SUPABASE = { url:'https://x.supabase.co', anonKey:'k' };
w.supabase = { createClient: () => ({
  auth: { getSession: async () => ({ data:{ session:{ user:{id:'u1'} } } }) },
  from: () => ({
    select: async () => ({ data: [{key:'va_config', value: JSON.stringify({ano:2031})}], error:null }),
    upsert: async (row) => { upserts.push(row); return { error:null }; },
    delete: () => ({ eq: async () => ({ error:null }) }),
  }),
})};
check('habilitado() com config+lib', w.eval('DB.Sync.habilitado()')===true);
(async () => {
  const pr = await w.eval('DB.Sync.pull()');
  check('pull baixa chaves para o cache', pr.ok===true && w.localStorage.getItem('va_config')!==null && JSON.parse(w.localStorage.getItem('va_config')).ano===2031);
  w.eval("DB.Config.salvar({ ano: 2032 })");
  await new Promise(r=>setTimeout(r, 1200));   // espera debounce do push
  check('set() dispara push (upsert va_config)', upserts.some(u=>u.key==='va_config'), JSON.stringify(upserts.map(u=>u.key)));
  console.log(fail?`\n❌ ${fail} falha(s)`:'\n✅ Plano municipal + Sync OK');
  process.exit(fail?1:0);
})();
