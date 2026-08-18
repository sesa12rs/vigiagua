# VigiÁgua — Fase 2 · Guia de ativação do Supabase

A Fase 2 liga o sistema a um banco de dados real (Supabase), mantendo o
funcionamento atual intacto: **enquanto o Supabase não estiver configurado,
tudo continua 100% local (localStorage), como na Fase 1.**

## Como funciona a arquitetura

O localStorage vira um **cache local de trabalho**. Ao abrir qualquer página,
o sistema baixa os dados do Supabase para o cache (*pull*); a cada gravação,
salva no cache **e** envia ao Supabase em segundo plano (*push*). Nenhuma
tela precisou mudar sua lógica — apenas o `js/data.js` ganhou a camada
`DB.Sync`, como planejado desde a Fase 1.

O que passa a ser guardado no banco:
- Planos anuais, configuração, semanas ativas, feriados e metas (Regional)
- Plano de amostragem preenchido por cada município (campos, locais,
  sistemas, parâmetros, coletas extras) — novidade da Fase 2: isso agora
  também sobrevive a recarregar a página e trocar de computador
- Texto editado da pré-visualização do PDF, por município e ano

## Passo a passo (uma única vez)

1. **Criar o projeto**: acesse https://supabase.com → *New project*
   (plano Free é suficiente). Guarde a senha do banco.

2. **Criar as tabelas**: no painel, abra *SQL Editor* → *New query*,
   cole o conteúdo COMPLETO de `supabase/schema.sql` e execute (*Run*).

3. **Criar os usuários**: em *Authentication → Users → Add user*, crie um
   usuário para a Regional e um para cada município, usando exatamente os
   e-mails listados no fim do `schema.sql` (ex.: `altonia@vigiagua.pr.gov.br`),
   cada um com a senha que você definir. Marque "Auto Confirm User".

4. **Vincular os perfis**: volte ao *SQL Editor* e execute NOVAMENTE apenas
   o bloco 3 do `schema.sql` (o `insert into public.usuarios ...`). Ele lê os
   usuários criados e preenche a tabela de perfis automaticamente.

5. **Configurar o sistema**: em *Settings → API*, copie a *Project URL* e a
   chave *anon public* para `js/supabase-config.js`. Publique os arquivos
   (GitHub Pages). Pronto: o login passa a ser autenticado pelo Supabase e
   os dados ficam no banco.

## Segurança (RLS)

As políticas do `schema.sql` garantem no servidor que:
- Só usuários autenticados leem qualquer dado;
- Só a **Regional** grava planos, configuração, semanas, feriados e metas;
- Cada **município** grava somente o próprio plano de amostragem e o próprio
  texto de preview (as chaves carregam o nome do município, validado contra
  o perfil do usuário logado).

A chave *anon public* pode ficar no arquivo JS publicado — é feita para isso;
a proteção real é o RLS. **Nunca** coloque a chave `service_role` no site.

## Observações

- **Migração de dados existentes**: ao ativar o Supabase, o que estava no
  localStorage da máquina da Regional não sobe sozinho. Basta abrir o
  planner logado, clicar em Salvar e regenerar/publicar os planos do ano —
  cada gravação envia ao banco. (Se preferir, me peça um botão "Enviar tudo
  ao banco" para migrar em um clique.)
- **Conflitos**: a política é "última gravação vence" — adequada ao fluxo
  (um usuário Regional; um usuário por município).
- **Offline**: sem internet, o sistema segue funcionando com o cache local;
  a sincronização retoma nas próximas gravações com conexão.

---

## Backup e restauração dos dados (v46)

Os dados oficiais (planos, configuração e os planos preenchidos pelos
municípios) vivem todos na tabela `va_store`. A partir da v46 o próprio
planner tem, na aba **⚙️ Planejamento**, um card **"🛟 Backup e segurança
dos dados"**:

- **💾 Exportar backup agora** — baixa um arquivo
  `vigiagua_backup_AAAA-MM-DD.json` com **tudo** que está no `va_store`.
  Guarde-o em local seguro (e-mail, drive, pasta de rede). O sistema
  registra a data do último backup **na máquina** e, se passar de uma
  semana sem backup, mostra um aviso discreto no topo do planner.
- **♻️ Restaurar de um arquivo** — lê um backup desses e **regrava** as
  chaves no banco (upsert). É uma restauração: repõe o que estava no
  arquivo e **não apaga** o que foi criado depois do backup. Pede
  confirmação antes.

Recomendação: **exportar toda semana** (o aviso ajuda a lembrar).

### Alternativas de backup automático (opcional)

Se quiser uma cópia automática, no lado do Supabase:

- **Painel do Supabase** → *Database* → *Backups*: o plano Free tem
  retenção limitada; planos pagos têm *Point-in-Time Recovery*.
- **`pg_dump`** (linha de comando), usando a *connection string* do
  projeto (em *Settings → Database*):
  ```
  pg_dump "postgresql://postgres:SENHA@db.SEU-PROJETO.supabase.co:5432/postgres" \
    --table=public.va_store --data-only --column-inserts > va_store_backup.sql
  ```
  Dá para agendar isso num cron da sua máquina/servidor.

---

## Endurecimento do RLS (v46) — o que mudou e como verificar

O `schema.sql` foi atualizado. **Reexecute o bloco de políticas** (a parte
"POLÍTICAS DE ACESSO (RLS)") no *SQL Editor* do Supabase para aplicar. As
mudanças:

1. **Regional = administradora**: passa a poder ler **e gravar** qualquer
   chave (antes só gravava as de planejamento). Isso é necessário para a
   **restauração** de backup, que regrava também os planos dos municípios.
2. **Município = leitura restrita**: antes, qualquer usuário autenticado
   lia **todas** as chaves — inclusive os planos preenchidos dos outros
   municípios. Agora cada município lê apenas o **planejamento publicado**
   (config, planos, semanas, feriados, cadastro de municípios) e as
   **próprias** chaves (`va_munplano_<ele>_*`, `va_previewedit_<ele>_*`).

Nada muda no app: o `pull` continua sendo um `select` sem filtro e o RLS
é que decide o que cada um recebe.

### Roteiro de verificação (faça após aplicar)

No *SQL Editor*, como **regional** (ou via app logado):

- [ ] Logar como **Regional** no sistema e abrir as abas 📊 Acompanhamento,
      🧪 Laboratório e 📋 Consolidado — devem continuar mostrando os dados
      de **todos** os municípios (a Regional lê tudo).
- [ ] Exportar um backup e conferir que o arquivo tem os
      `va_munplano_*` de vários municípios.

Logar como um **município** (ex.: `altonia@...`) e, no console (F12),
rodar `await DB.Sync.pull()` seguido de checagens:

- [ ] `localStorage.getItem('va_plano_2027')` **não** é nulo (lê o
      planejamento publicado). ✔ esperado
- [ ] `localStorage.getItem('va_munplano_Altônia_2027')` **não** é nulo
      (lê o próprio plano). ✔ esperado
- [ ] `localStorage.getItem('va_munplano_Umuarama_2027')` **é** nulo
      (NÃO lê o plano de outro município). ✔ esperado — este é o ponto
      central do endurecimento.

Se o município ainda enxergar a chave de outro, confira se as políticas
antigas (`va_store_select`) foram realmente removidas — o bloco novo já
faz `drop policy if exists` delas, então basta reexecutá-lo.

---

## Painel de usuários (Fase 2) — deploy da Edge Function `admin-usuarios`

Permite que a **Regional crie municípios e resete senhas direto pelo sistema**
(aba Administração → "Acesso dos usuários"), sem abrir o painel do Supabase.

A função guarda a chave-mestra (`service_role`) **no servidor** — nunca no
navegador — e só executa se quem chamou for a Regional.

### Passo a passo (só uma vez)

1. **Instale a CLI do Supabase** (uma vez, na sua máquina):
   - macOS: `brew install supabase/tap/supabase`
   - ou via npm: `npm install -g supabase`

2. **Faça login e conecte ao projeto:**
   ```
   supabase login
   supabase link --project-ref usxaxdbxecdcbnxpkkhx
   ```
   (o `project-ref` é a parte do meio da Project URL:
   `https://usxaxdbxecdcbnxpkkhx.supabase.co`)

3. **Publique a função** (a partir da raiz do projeto, onde está a pasta `supabase/`):
   ```
   supabase functions deploy admin-usuarios
   ```

   Pronto. A função fica disponível em
   `https://usxaxdbxecdcbnxpkkhx.supabase.co/functions/v1/admin-usuarios`
   e o painel do sistema passa a funcionar.

> **Variáveis de ambiente:** não precisa configurar nada. O Supabase injeta
> automaticamente `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
> `SUPABASE_SERVICE_ROLE_KEY` nas Edge Functions.

### Como usar (Regional, dentro do sistema)

- **Aba Administração → "Acesso dos usuários" → Atualizar lista.**
- **Criar conta:** escolha e-mail automático (fake) ou informe um e-mail real,
  confirme a senha temporária e clique em "Criar conta". Repasse a senha ao
  município — ele define a própria senha no 1º acesso.
- **Resetar senha:** gera uma nova senha temporária; o município troca no
  próximo acesso.

### Recuperação de senha

- Contas com **e-mail real** podem usar a recuperação automática por e-mail do
  Supabase (link enviado ao endereço).
- Contas com **e-mail fake**: a recuperação é feita pela Regional com o botão
  "Resetar senha" no painel.

### Segurança / continuidade

- A função só aceita chamadas de quem tem perfil `regional` na tabela `usuarios`.
- O projeto Supabase continua precisando de um **dono na organização** (conta,
  cobrança). Ao repassar o sistema, transfira o acesso ao projeto e mantenha
  este guia junto.
