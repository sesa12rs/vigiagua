# VigiÁgua — Guia de Manutenção

**Documento técnico para quem mantém o sistema.**

Cobre a arquitetura, como publicar atualizações, o Supabase, a gestão de usuários (Fase 2), backup, testes e solução de problemas.

---

## 1. Visão geral da arquitetura

Sistema web **sem servidor próprio**:

- **Frontend:** HTML, CSS e JavaScript puros (sem frameworks).
- **Hospedagem:** **GitHub Pages** (arquivos estáticos).
- **Backend (login e sincronização):** **Supabase** (banco + autenticação).
- **Gestão de usuários (Fase 2):** uma **Supabase Edge Function** (`admin-usuarios`) que roda no servidor do Supabase.
- **Geração de documentos:** no navegador — **jsPDF** (PDF) e **docx** (Word).

O navegador carrega os arquivos do GitHub Pages e conversa direto com o Supabase.

---

## 2. Estrutura dos arquivos

```
index.html          → login
planner.html        → área da Regional
municipio.html      → área do município
css/app.css         → estilos
js/
  data.js           → dados, autenticação, sync, DB.Admin, e a VERSÃO
  utils.js          → utilitários (datas, semanas, cálculos)
  planner.js        → geração/validação do plano
  relatorios.js     → relatórios (laboratório, consolidado, CSVs)
  planner-page.js   → tela da Regional
  municipio-page.js → tela do município (etapas, PDF, Word, CSV)
  supabase-config.js→ URL e chave pública (anon) do Supabase
supabase/
  schema.sql        → estrutura do banco e políticas (RLS)
  README-fase2.md   → configuração do Supabase + DEPLOY da Edge Function
  functions/admin-usuarios/index.ts → a Edge Function de administração
tests/              → 13 suítes de teste (jsdom)
```

A **versão** fica em `js/data.js`, em `VIGIAGUA_VERSAO` (ex.: `fase2-v88`). Atualize a cada publicação.

---

## 3. Publicar uma atualização (GitHub Pages)

Servido a partir do repositório, branch `main`, raiz do projeto.

1. Substitua os arquivos no repositório (mesma estrutura de pastas).
2. **Commit** e **push** para `main`.
3. O GitHub Pages republica sozinho em alguns instantes.

Em **Settings → Pages**, a origem deve ser **`main` / `root`**. Endereço atual: `https://sesa12rs.github.io/vigiagua/`.

**Cache:** depois de publicar, recarregue sem cache (Ctrl+F5). Conferir a versão em `js/data.js` confirma que a nova subiu.

> **Nunca** publique a pasta `node_modules` nem arquivos de teste temporários.

---

## 4. Supabase (login e sincronização)

- Credenciais em `js/supabase-config.js` (**Project URL** e chave **anon public**). A chave `anon` é pública por natureza — a segurança vem das **políticas RLS** no banco, não do sigilo dela.
- Estrutura e políticas em `supabase/schema.sql`; configuração em `supabase/README-fase2.md`.
- **Regra de segurança:** o sistema só usa o login real quando o Supabase está configurado. Sem credenciais, cai num **modo demo** (senhas fixas). **Em produção o Supabase precisa estar ligado.**

**Checagem rápida de segurança:** tente entrar com senha **errada** — deve recusar.

### Avisos "SECURITY DEFINER"
São **cosméticos** nesse contexto; podem ser tratados numa manutenção futura, sem urgência.

---

## 5. Contas e senhas (Fase 2)

São **22 contas**: a Regional e os 21 municípios. Login por e-mail/senha (Supabase Auth).

Padrão do e-mail automático: nome do município em minúsculo, sem acento e sem espaço + `@vigiagua.pr.gov.br` (ex.: `saojorgedopatrocinio@vigiagua.pr.gov.br`). Regional = `regional@vigiagua.pr.gov.br`.

**Tudo é gerenciado pela Regional dentro do sistema** (aba Administração → "Acesso dos usuários"):
- **Criar conta** (e-mail automático) com senha temporária.
- **Resetar senha** (gera nova temporária — é também a recuperação de acesso).
- **Definir senha no 1º acesso** — contas novas/resetadas (marcadas com `senhaDefinida=false`) são obrigadas a definir a própria senha ao entrar. As contas antigas não são afetadas.
- **Troca de senha self-service** — botão "🔑 Senha" no topo (Regional e municípios).

### Recurso de e-mail real (desativado por opção)
O login "entrar com e-mail", o botão "Trocar e-mail" e a opção de informar e-mail real ao criar conta estão **ocultos** por uma chave única em `js/data.js`:
```js
window.VIGIAGUA_EMAIL_REAL = false;   // true reativa tudo isso de uma vez
```
O código continua pronto: para reativar (permitir e-mails reais e recuperação por e-mail do Supabase), basta trocar para `true` — não precisa mexer em mais nada.

### A Edge Function `admin-usuarios`
É a peça que permite criar/resetar/trocar-email **sem abrir o painel do Supabase**. Ela guarda a chave-mestra (`service_role`) **no servidor** e só executa se o chamador tiver perfil `regional`.

**Deploy (uma vez):** ver `supabase/README-fase2.md` → seção "Painel de usuários". Resumo: pela CLI (`supabase functions deploy admin-usuarios`, rodado **de dentro da pasta do projeto**) ou criando a função pela **Dashboard do Supabase** (Edge Functions → nova função `admin-usuarios` → colar o conteúdo de `functions/admin-usuarios/index.ts` → Deploy). As variáveis (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) são injetadas automaticamente.

---

## 6. Backup e restauração

Aba Administração. O backup é um **JSON** com as chaves do sistema (`va_config`, `va_feriados`, `va_semanas_ANO`, `va_plano_ANO`, `va_planos_index`, e por município `va_munplano_<mun>_<ano>` / `va_previewedit_<mun>_<ano>`). A restauração é **seletiva** (tudo / planejamento / municípios) e faz *upsert* (não apaga o que veio depois). Mantenha backups periódicos e um do estado inicial de produção.

---

## 7. Dependências externas (CDN)

Carregadas pelo navegador (exigem internet):

| Biblioteca | Uso | Origem |
|---|---|---|
| supabase-js v2 | login e sincronização | jsDelivr |
| jsPDF 2.5.1 + autotable 3.5.31 | geração do PDF | cdnjs |
| docx 8.5.0 | geração do Word (.docx) | jsDelivr |
| Sortable | mover blocos na etapa 4 | CDN |

Se mudar alguma versão, teste PDF/Word depois.

---

## 8. Testes automatizados

13 suítes em `tests/`, rodam com **Node + jsdom**; a suíte do Word usa a lib **docx**.

```bash
# instalar as dependências de teste
npm install jsdom docx@8.5.0

# rodar todas
for t in tests/test_*.js; do node "$t"; done
```

Cada suíte imprime `✅`/`❌`. A suíte do Word (`test_docx.js`) é pulada se a lib `docx` não estiver instalada.

> Os testes cobrem **lógica e estrutura** (dados, regras, geração, backup, auto-save, PDF/Word). **Não** cobrem aparência/responsividade nem as chamadas reais ao Supabase (Edge Function, criação de usuários) — isso é validado no ambiente real.

---

## 9. Solução de problemas

**Login aceita senha errada.** Supabase desligado — confira `js/supabase-config.js`.

**Município não vê o cronograma.** O ano precisa estar **publicado**.

**Painel "Acesso dos usuários" não cria/reseta.** A Edge Function `admin-usuarios` não está publicada, ou deu erro. Confira o deploy (seção 5) e o console do navegador.

**Erro no deploy da função: "entrypoint path does not exist".** O comando foi rodado na pasta errada — rode de **dentro da pasta do projeto** (a que tem `supabase/functions/admin-usuarios/index.ts`). Se reclamar de Docker, use `--use-api`. Alternativa: criar pela Dashboard.

**Conta com e-mail real não entra pela lista.** Correto — ela entra por "entrar com e-mail".

**PDF ou Word não gera.** Biblioteca ainda carregando ou sem internet. Recarregue.

**Mudança publicada não aparece.** Cache — Ctrl+F5. Confira a versão em `js/data.js`.

---

## 10. Checklist rápido de publicação

1. Atualizar `VIGIAGUA_VERSAO` em `js/data.js`.
2. Publicar no GitHub (`main` / raiz) — sem `node_modules`.
3. Aguardar o GitHub Pages e recarregar sem cache.
4. Conferir a versão nova.
5. Testar: login (senha certa e errada), abrir um município pela Regional, gerar PDF e Word, e — se mexeu em usuários — criar/resetar uma conta de teste.
6. Fazer um backup.

---

*VigiÁgua — 12ª Regional de Saúde do Paraná. Documento de manutenção.*
