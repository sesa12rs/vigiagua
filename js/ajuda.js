/* VigiÁgua — conteúdo da Ajuda (Help) exibido em modal.
   Fonte única, reaproveitada no login, no município e na Regional.
   Para atualizar a ajuda do sistema, edite os textos abaixo. */
(function () {
  const MUNICIPIO = `
    <h1>Guia do Município</h1>
    <p class="ajuda-sub">Como preencher o seu plano de amostragem e gerar o documento final.</p>

    <h2>1. Como entrar</h2>
    <ul>
      <li>Selecione o seu <strong>município</strong> na lista "Quem está entrando".</li>
      <li>Digite a <strong>senha</strong> e clique em <strong>Entrar</strong>.</li>
      <li><strong>Primeiro acesso:</strong> ao entrar com a senha temporária que a Regional passou, o sistema pede que você <strong>defina a sua própria senha</strong> antes de continuar.</li>
    </ul>
    <p>Para trocar a senha depois, use o botão <strong>"🔑 Senha"</strong> no topo. Esqueceu a senha? Peça à Regional para resetá-la.</p>

    <h2>2. As quatro etapas</h2>
    <ol>
      <li><strong>Dados</strong> — informações do município e dos responsáveis.</li>
      <li><strong>Coletas</strong> — a tabela com as coletas programadas do ano.</li>
      <li><strong>Coletas extras</strong> — coletas fora do cronograma padrão (se houver).</li>
      <li><strong>Pré-visualização</strong> — o documento pronto, para revisar e baixar.</li>
    </ol>
    <p>Não existe botão de "salvar": o sistema <strong>grava sozinho</strong> (mostra um "✓ salvo"). As datas e a quantidade de coletas vêm do plano publicado pela Regional.</p>

    <h2>3. Etapa 1 — Dados</h2>
    <p>Preencha população, endereço, secretário(a) de saúde, responsável técnico, profissional executor e o setor de vigilância. Esses dados aparecem no cabeçalho e nas assinaturas do documento.</p>

    <h2>4. Etapa 2 — Coletas</h2>
    <p>Para cada linha, complete:</p>
    <ul>
      <li><strong>Local de coleta</strong> — onde a amostra será coletada.</li>
      <li><strong>Sistema</strong> — <strong>SAA</strong> (Sistema de Abastecimento de Água), <strong>SAC</strong> (Solução Alternativa Coletiva) ou <strong>SAI</strong> (Solução Alternativa Individual).</li>
      <li><strong>Parâmetros</strong>: <strong>MB</strong> (Microbiológico), <strong>TB</strong> (Turbidez), <strong>CR</strong> (Cloro Residual), <strong>FL</strong> (Flúor).</li>
      <li><strong>Critério</strong> — o critério de amostragem do ponto.</li>
    </ul>
    <p>A tabela tem altura fixa com rolagem e o cabeçalho fica fixo no topo — role sem perder a referência das colunas.</p>

    <h2>5. Etapa 3 — Coletas extras</h2>
    <p>Coletas fora do cronograma padrão entram aqui (recebem um identificador começando com <strong>EX-</strong>). Se não houver, siga para a próxima etapa.</p>

    <h2>6. Etapa 4 — Pré-visualização e download</h2>
    <ul>
      <li>O <strong>texto</strong> do documento pode ser editado (negrito, itálico, sublinhado pela barra).</li>
      <li>Passe o mouse sobre um bloco para <strong>movê-lo</strong> (⋮⋮) ou <strong>excluí-lo</strong> (✕).</li>
      <li>As <strong>tabelas de coletas</strong> vêm das etapas 2 e 3 e não são editadas aqui.</li>
    </ul>
    <p>Botões de download (as assinaturas saem na última página, em A4):</p>
    <ul>
      <li><strong>⬇️ Baixar PDF</strong> — versão final para imprimir/publicar.</li>
      <li><strong>⬇️ Baixar Word (.docx)</strong> — para editar antes de finalizar.</li>
      <li><strong>📥 CSV das coletas</strong> — as coletas em planilha (Excel).</li>
    </ul>

    <h2>7. Concluir e reabrir</h2>
    <p>Ao terminar, clique em <strong>✓ Concluir plano</strong> — isso avisa a Regional e trava a edição. Precisou ajustar? Clique em <strong>✏️ Reabrir para edição</strong>, ajuste e conclua de novo.</p>

    <h2>8. Dúvidas comuns</h2>
    <ul>
      <li><strong>A tabela está vazia:</strong> a Regional ainda não publicou o plano do ano.</li>
      <li><strong>Trocar uma data de coleta:</strong> as datas vêm do plano da Regional — fale com ela.</li>
      <li><strong>No celular a tabela é larga:</strong> role para o lado para ver todas as colunas.</li>
    </ul>
  `;

  const REGIONAL = `
    <h1>Guia da Regional</h1>
    <p class="ajuda-sub">Definir regras, gerar e publicar o plano, acompanhar, gerenciar acessos e fazer backup.</p>

    <h2>1. Abas</h2>
    <ul>
      <li><strong>Planejamento</strong> — regras, calendário, metas e geração do plano.</li>
      <li><strong>Acompanhamento</strong> — situação de cada município.</li>
      <li><strong>Laboratório</strong> — carga por semana, distribuição do ano e romaneio.</li>
      <li><strong>Consolidado</strong> — visão consolidada das coletas.</li>
      <li><strong>Administração</strong> — planos por ano, backup e acesso dos usuários.</li>
    </ul>
    <p>Configurações e metas <strong>salvam sozinhas</strong>. O ano de trabalho é o do seletor no topo.</p>

    <h2>2. Planejamento</h2>
    <ul>
      <li><strong>Regras:</strong> capacidade, frascos, alerta e municípios/semana (por tipo), dia de coleta/entrega e pontos de bloqueio por feriado.</li>
      <li><strong>Calendário:</strong> semanas ativas (intervalo domingo a sábado). Você pode ativar manualmente uma semana bloqueada, e "Ativar todas" inclui as bloqueadas. Também cadastra feriados.</li>
      <li><strong>Municípios:</strong> metas por município.</li>
      <li><strong>Gerar plano:</strong> monta o cronograma. Se a configuração for inviável (semanas × capacidade não alcançam as metas), o sistema avisa em vermelho e não gera até corrigir.</li>
    </ul>

    <h2>3. Publicar</h2>
    <p><strong>Gerar ≠ Publicar.</strong> Gerar monta o cronograma; <strong>publicar</strong> libera para os municípios. Despublicar recolhe; excluir apaga o ano.</p>

    <h2>4. Acompanhar</h2>
    <p>Cada município mostra a meta e o status. <strong>Só abrir</strong> o plano não conta como iniciado — só quando há dados reais. Use <strong>"Abrir plano ↗"</strong> para entrar no plano de um município e <strong>"← Planejamento"</strong> para voltar.</p>

    <h2>5. Laboratório</h2>
    <ul>
      <li><strong>Exibir datas por: Dia da coleta / Dia da entrega</strong> — muda todas as datas desta aba (histograma, distribuição, romaneio e CSVs).</li>
      <li><strong>Carga semanal</strong>, <strong>Distribuição do ano</strong> (com CSV) e <strong>Romaneio</strong> (Imprimir, CSV resumo semanal e CSV romaneio).</li>
    </ul>

    <h2>6. Acesso dos usuários (Administração)</h2>
    <ul>
      <li><strong>Atualizar lista</strong> — mostra a Regional e os 21 municípios (conta criada ou não).</li>
      <li><strong>➕ Criar conta</strong> — gera o e-mail automático e uma senha temporária para repassar; o município define a senha no 1º acesso.</li>
      <li><strong>🔑 Resetar senha</strong> — nova senha temporária (também é a recuperação de quem esqueceu).</li>
      <li><strong>🔑 Senha</strong> (topo) — troca a sua própria senha.</li>
    </ul>

    <h2>7. Backup</h2>
    <p><strong>Exportar backup</strong> (completo) ou <strong>por município</strong>; <strong>Restaurar</strong> é seletivo (tudo / planejamento / municípios). Faça backup com regularidade e antes de mudanças grandes.</p>

    <h2>8. Boas práticas</h2>
    <ul>
      <li>Confira o ano antes de gerar/publicar.</li>
      <li>Gere e confira antes de publicar.</li>
      <li>Ao criar/resetar contas, anote a senha temporária antes de fechar.</li>
      <li>Proteja a senha da Regional.</li>
    </ul>
  `;

  window.AJUDA = { municipio: MUNICIPIO, regional: REGIONAL };

  window.abrirAjuda = function (qual) {
    const alvo = document.getElementById('ajudaConteudo');
    const modal = document.getElementById('modalAjuda');
    if (!alvo || !modal) return;
    alvo.innerHTML = (window.AJUDA && window.AJUDA[qual]) || '<p>Ajuda indisponível.</p>';
    alvo.scrollTop = 0;
    modal.classList.add('open');
  };
  window.fecharAjuda = function () {
    const modal = document.getElementById('modalAjuda');
    if (modal) modal.classList.remove('open');
  };
})();
