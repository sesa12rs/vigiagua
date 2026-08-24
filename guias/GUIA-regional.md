# VigiÁgua — Guia da Regional

**Sistema de planejamento das coletas de qualidade da água — 12ª Regional de Saúde (Umuarama/PR)**

Este guia é para a **Regional**, que define as regras, gera e publica o cronograma anual, acompanha o preenchimento dos municípios, gerencia os acessos e cuida dos backups.

---

## 1. Entrar como Regional

1. Abra o endereço do sistema.
2. Em "Quem está entrando", selecione **12ª Regional de Saúde** (primeira opção).
3. Digite a **senha** e clique em **Entrar**.

O ano de trabalho é escolhido no **seletor de ano no topo** — confira sempre se está no ano certo antes de gerar ou publicar.

> **Trocar a sua senha:** botão **"🔑 Senha"** no topo. A conta da Regional é a de maior alcance — guarde bem a senha.

---

## 2. As abas da Regional

- **Planejamento** — regras, calendário, metas e geração do plano (sub-abas abaixo).
- **Acompanhamento** — situação de cada município e acesso direto ao plano deles.
- **Laboratório** — carga por semana, distribuição do ano e o romaneio de cada viagem.
- **Consolidado** — visão consolidada das coletas.
- **Administração** — planos por ano, backup e **acesso dos usuários**.

Campos de configuração e metas **salvam sozinhos** ("✓ salvo"). Botões existem só para **ações** (gerar, publicar, criar conta, etc.).

---

## 3. Planejamento — as sub-abas

### 3.1 Regras
- **Capacidade por semana**, **frascos/entrega**, **alerta** e **municípios por semana** — cada um pode ser valor exato ou intervalo. Os limites são **por tipo** (físico-químicas e microbiológicas): uma capacidade de 55 significa 55 + 55 = 110 análises/semana.
- **Dia da coleta e da entrega** (padrão: coleta na terça, entrega na quarta). Mudar recalcula datas e semanas — gere o plano de novo para aplicar.
- **Pontos de bloqueio** (Umuarama e Maringá) — em quais o feriado bloqueia coleta e/ou entrega.

### 3.2 Calendário
- **Semanas ativas** — cada card mostra o intervalo da semana (**domingo a sábado**). O bloqueio por feriado/recesso é aplicado automaticamente, mas você pode **ativar manualmente** uma semana bloqueada se quiser, e **"Ativar todas"** ativa todas (inclusive as bloqueadas).
- **Feriados** — nacionais, estaduais e municipais. Feriado nacional/estadual bloqueia conforme a regra; feriado municipal exclui só aquele município naquela semana.

### 3.3 Municípios
- **Metas por município** — edite direto no campo (salva sozinho). "Restaurar padrão" volta às metas padrão.

### 3.4 Gerar plano
- **🚀 Gerar Plano** — monta o cronograma do ano com base nas regras, semanas, feriados e metas.
- **Validação automática:** se a configuração for **inviável** (por exemplo, poucas semanas ativas × capacidade não alcançam o total de metas), o sistema mostra um aviso em vermelho com a explicação e **não gera** até você corrigir (aumentar a capacidade ou ativar mais semanas).

---

## 4. Publicar o plano

Depois de gerar e conferir, **publique** o plano do ano. Só depois de publicado os municípios veem o cronograma e conseguem preencher.

> **Gerar ≠ Publicar.** Gerar monta/atualiza o cronograma; publicar é o ato de liberar para os municípios. **Despublicar** recolhe (guarda tudo); **Excluir** apaga o ano por completo.

---

## 5. Acompanhar os municípios

Na aba **Acompanhamento**, cada município aparece com a meta e o **status** (não iniciado, em preenchimento, concluído, fora do prazo).

- **Só abrir** o plano de um município **não** o marca como iniciado — ele só conta como "em preenchimento" quando há **dados reais** (algum campo da 1ª etapa ou algum local de coleta).
- Cada município tem **"Abrir plano ↗"**, que leva você ao plano dele para visualizar ou ajudar a preencher. Ao entrar, use o botão **"← Planejamento"** no topo para voltar.

---

## 6. Laboratório — carga, distribuição e romaneio

- **Exibir datas por: Dia da coleta / Dia da entrega** — um seletor no topo que muda todas as datas desta aba (histograma, distribuição do ano, romaneio e CSVs) entre o dia da coleta e o dia da entrega no laboratório.
- **Carga semanal** — histograma da quantidade por semana, com a linha de capacidade.
- **Distribuição do ano — semana × município** — o mapa de calor; exporta em **CSV**.
- **Romaneio** — a lista de cada viagem (por município: físico-químicas, microbiológicas e total; com total por semana). Botões: **Imprimir romaneio**, **CSV resumo semanal** e **CSV romaneio**.

---

## 7. Acesso dos usuários (aba Administração)

Aqui a Regional gerencia as contas **pelo próprio sistema**, sem abrir o painel do Supabase.

> Requer a função de administração publicada no Supabase (uma vez só — ver o guia de manutenção).

- **Atualizar lista** — mostra a **Regional (você)** e os 21 municípios, com o status "criada / sem conta" e o e-mail.
- **➕ Criar conta** (municípios sem conta): o sistema já sugere o e-mail automático (`municipio@vigiagua.pr.gov.br`) e uma senha temporária. Confirme e crie. O sistema mostra o e-mail + a senha temporária para você repassar; o município define a senha dele no 1º acesso.
- **🔑 Resetar senha** — gera uma nova senha temporária (o município troca no próximo acesso). É também a forma de **recuperar** o acesso de quem esqueceu a senha.

> **Recuperação de senha:** é feita por você, no painel, com "Resetar senha".

---

## 8. Backup e restauração

Na aba **Administração**:
- **💾 Exportar backup agora** — baixa uma cópia completa (planejamento + todos os municípios).
- **📤 Exportar município** — só os dados de um município.
- **♻️ Restaurar de um arquivo** — janela com opções: **tudo**, **só o planejamento** ou **municípios escolhidos**. A restauração sobrescreve as chaves do arquivo e não apaga o que foi criado depois.

> Sugestão: backup **semanal** e sempre **antes de mudanças grandes**.

---

## 9. Boas práticas

- Confira o **ano** no topo antes de gerar/publicar.
- **Gere e confira** antes de **publicar**.
- Faça **backup** com regularidade.
- Proteja a **senha da Regional** (é a conta que altera tudo).
- Ao criar/resetar contas, **anote a senha temporária** antes de fechar a janela.

---

*VigiÁgua — 12ª Regional de Saúde do Paraná.*
