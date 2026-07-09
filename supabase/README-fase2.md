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
