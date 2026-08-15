/* Testa a geração do Word (.docx) da etapa 4:
   monta a prévia real, chama _construirDocx, empacota e verifica o conteúdo.
   Pula (sem falhar) se a lib 'docx' não estiver instalada no ambiente. */
const fs = require('fs');
let nodeDocx = null;
try { nodeDocx = require('docx'); }
catch (e) { console.log('  \u23ed\ufe0f  test_docx pulado (lib "docx" não instalada — instale com: npm install docx@8.5.0)'); process.exit(0); }

const { JSDOM, VirtualConsole } = require('jsdom');
let fail = 0;
function check(nome, cond, extra) {
  if (cond) console.log('  \u2705 ' + nome);
  else { console.log('  \u274c ' + nome + (extra !== undefined ? '  ' + extra : '')); fail++; }
}
const EXPOSE = '\n;try{window.DB=DB}catch(e){};try{window.Utils=Utils}catch(e){};try{window.Planner=Planner}catch(e){};try{window.Relatorios=Relatorios}catch(e){}';

function loadPlanner() {
  let h = fs.readFileSync('planner.html', 'utf8').replace(/<script[^>]*src="https?:\/\/[^"]*"[^>]*><\/script>/g, '');
  const dom = new JSDOM(h, { url: 'http://localhost/planner.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window; w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
  w.localStorage.setItem('va_session', JSON.stringify({ userId: 1, perfil: 'regional', nome: 'R' }));
  for (const s of [...h.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1])) w.eval(fs.readFileSync(s, 'utf8') + EXPOSE);
  for (const c of [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])) w.eval(c);
  w.confirm = () => true; w.mostrarToast = () => {}; w.alert = () => {};
  w.eval('selecionarAno(2027); gerarPlano(); publicarAno(2027);');
  const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o;
}

(async () => {
  const seed = loadPlanner();
  let h = fs.readFileSync('municipio.html', 'utf8').replace(/<script[^>]*src="https?:\/\/[^"]*"[^>]*><\/script>/g, '');
  const dom = new JSDOM(h, { url: 'http://localhost/municipio.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window; w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
  w.docx = nodeDocx;   // no navegador vem do CDN
  Object.keys(seed).forEach(k => { if (k.startsWith('va_') || k.startsWith('sb-')) w.localStorage.setItem(k, seed[k]); });
  w.localStorage.setItem('va_session', JSON.stringify({ userId: 102, perfil: 'municipio', nome: 'Altônia', municipioId: 3 }));
  w.localStorage.setItem('va_munplano_Altônia_2027', JSON.stringify({ v: 1, status: 'rascunho', campos: { populacao: '20000', endereco: 'Rua X', secretario: 'Y', responsavel: 'Z', profissional: 'W', vigilancia: 'Vigilância Sanitária' }, normais: [{ data: '2027-03-02', local: 'Escola Municipal Central', sistema: 'SAA', mb: true, tb: true, cr: true, fl: false }], extras: [] }));
  for (const s of [...h.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1])) w.eval(fs.readFileSync(s, 'utf8') + EXPOSE);
  for (const c of [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])) w.eval(c);
  w.confirm = () => true; w.mostrarToast = () => {}; w.alert = () => {};
  await new Promise(r => setTimeout(r, 20));

  w.eval('irEtapa2(); irEtapa3b(); irEtapa4();');   // gera a prévia
  console.log('[Geração do DOCX]');
  check('_construirDocx é função', w.eval('typeof _construirDocx') === 'function');
  const doc = w.eval('_construirDocx(document.getElementById("previewContent"))');
  check('_construirDocx retorna um Document', !!doc);

  const buf = await nodeDocx.Packer.toBuffer(doc);
  check('gera um .docx (zip PK) não vazio', buf.length > 2000 && buf.slice(0, 2).toString() === 'PK', buf.length + ' bytes');

  // Descompacta o document.xml em memória e confere o conteúdo
  const tmp = '/tmp/_test_docx_' + Date.now() + '.docx';
  fs.writeFileSync(tmp, buf);
  const { execSync } = require('child_process');
  let xml = '';
  try { xml = execSync(`unzip -p ${tmp} word/document.xml`, { maxBuffer: 20 * 1024 * 1024 }).toString(); } catch (e) {}
  fs.unlinkSync(tmp);
  check('contém o Anexo 1 (Coletas Programadas)', /Coletas Programadas/.test(xml));
  check('contém o ID de coleta real (001ALT2027)', /001ALT2027/.test(xml));
  check('contém o local preenchido (Escola Municipal Central)', /Escola Municipal Central/.test(xml));
  check('cabeçalho azul presente (1E3A8A)', /1E3A8A/.test(xml));
  check('contém pelo menos uma tabela', (xml.match(/<w:tbl>/g) || []).length >= 1);

  console.log(fail ? `\n\u274c ${fail} falha(s)` : '\n\u2705 DOCX OK');
  process.exit(fail ? 1 : 0);
})();
