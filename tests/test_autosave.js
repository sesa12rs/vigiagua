/* Testa o salvamento automático dos campos (fatia de consistência):
   - botões "Salvar configuração" e "Salvar" (metas) removidos
   - indicador de auto-save presente
   - onMetaChange atualiza + agenda o salvamento das metas
   - edição de config grava (via _flushSalvarConfig) e gerarPlano faz o flush */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

let fail = 0;
function check(nome, cond, extra) {
  if (cond) console.log('  \u2705 ' + nome);
  else { console.log('  \u274c ' + nome + (extra !== undefined ? '  ' + extra : '')); fail++; }
}

let h = fs.readFileSync('planner.html', 'utf8').replace(/<script[^>]*src="https?:\/\/[^"]*"[^>]*><\/script>/g, '');
const dom = new JSDOM(h, { url: 'http://localhost/planner.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
const w = dom.window;
w.HTMLElement.prototype.scrollIntoView = function () {};
w.scrollTo = () => {};
w.localStorage.setItem('va_session', JSON.stringify({ userId: 1, perfil: 'regional', nome: 'R', municipioId: null }));
const EXPOSE = '\n;try{window.DB=DB}catch(e){};try{window.Utils=Utils}catch(e){};try{window.Planner=Planner}catch(e){}';
for (const s of [...h.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1])) w.eval(fs.readFileSync(s, 'utf8') + EXPOSE);
for (const c of [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])) w.eval(c);
w.confirm = () => true; w.mostrarToast = () => {}; w.alert = () => {};
const d = w.document;

console.log('[Botões de salvar removidos]');
check('sem "Salvar configuração"', !/Salvar configuração/.test(d.body.innerHTML));
check('sem botão salvarMetas()', !d.querySelector('[onclick="salvarMetas()"]'));
check('indicador autoSaveInd existe', !!d.getElementById('autoSaveInd'));

console.log('\n[Auto-save das metas via onMetaChange]');
w.eval('trocarSubPlan("Municipios"); renderMunicipios();');
check('onMetaChange é função global', w.eval('typeof onMetaChange') === 'function');
w.eval('onMetaChange(0, "150")');
check('indicador mostra "salvando"', /salvando/.test(d.getElementById('autoSaveInd').textContent));
w.eval('salvarMetas()');
check('meta 150 gravada no banco', w.eval('DB.Municipios.listar()[0].meta') === 150);

console.log('\n[Auto-save da configuração]');
d.getElementById('cfgCapacidadeExata').value = '58';
w.eval('_flushSalvarConfig()');
check('config gravada (capacidade=58)', w.eval('DB.Config.carregar().capacidadeExata') === 58);

console.log('\n[gerarPlano faz flush da config]');
d.getElementById('cfgCapacidadeExata').value = '59';
w.eval('selecionarAno(2027); gerarPlano();');
check('gerarPlano gravou config na hora (capacidade=59)', w.eval('DB.Config.carregar().capacidadeExata') === 59);

console.log(fail ? `\n\u274c ${fail} falha(s)` : '\n\u2705 Auto-save OK');
process.exit(fail ? 1 : 0);
