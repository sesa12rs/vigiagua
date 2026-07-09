# VigiÁgua — Sistema Integrado de Planejamento de Coletas
**12ª Regional de Saúde do Paraná**

## Estrutura do Projeto

```
vigiagua/
├── index.html          ← Tela de login / roteador
├── planner.html        ← Módulo Regional (invisível ao município)
├── municipio.html      ← Módulo Municipal (Plano de Amostragem)
├── css/
│   └── app.css         ← Design system completo
├── js/
│   ├── data.js         ← Camada de dados (localStorage → Supabase na Fase 2)
│   ├── utils.js        ← Utilitários de data, feriados, cálculos
│   └── planner.js      ← Algoritmo de distribuição de coletas
└── README.md
```

## Como Usar

### Deploy no GitHub Pages
1. Crie um repositório no GitHub
2. Faça upload de todos os arquivos mantendo a estrutura de pastas
3. Vá em **Settings → Pages → Source: main / root**
4. Acesse via `https://seu-usuario.github.io/nome-repo/`

### Abrir localmente (sem servidor)
Basta abrir `index.html` diretamente no navegador. Todos os dados ficam no localStorage.

## Contas de Acesso (Fase 1 — Demonstração)

| Perfil | E-mail | Senha |
|--------|--------|-------|
| Regional (12ª RS) | regional@vigiagua.pr.gov.br | regional123 |
| Umuarama | umuarama@vigiagua.pr.gov.br | municipio123 |
| Altônia | altonia@vigiagua.pr.gov.br | municipio123 |
| Alto Paraíso | altoparaiso@vigiagua.pr.gov.br | municipio123 |
| *Todos os municípios* | *[nome-sem-acento]@vigiagua.pr.gov.br* | municipio123 |

## Fluxo Completo

```
1. Regional faz login → planner.html
2. Configura metas, semanas, feriados
3. Clica "Gerar Plano" → confere distribuição
4. Clica "Publicar para Municípios"

5. Município faz login → municipio.html
6. Preenche dados cadastrais
7. Coletas carregam automaticamente do plano publicado
8. Preenche locais, sistemas, parâmetros
9. Adiciona coletas extras (se houver)
10. Gera e baixa o PDF do Plano de Amostragem
```

## Fase 2 — Integração Supabase

Para migrar para banco de dados real, edite apenas `js/data.js`:
- Substitua as funções `get()`/`set()` por `supabase.from(...).select/insert/upsert`
- Configure autenticação via `supabase.auth.signInWithPassword()`
- Ative RLS no PostgreSQL para isolamento de dados por município

Nenhum outro arquivo precisa ser alterado.

## Prioridades do Algoritmo de Planejamento

| Prioridade | Regra |
|------------|-------|
| P0 | Integridade — sem negativos ou duplicatas |
| P1 | 100% das metas cumpridas |
| P2 | Férias e semanas inativas respeitadas |
| P3 | Feriados (nacionais, estaduais, municipais) |
| P4 | Min 4 / Max 9 frascos por participação |
| P5 | ≥ 50 tipo A + ≥ 50 tipo B por viagem |
| P6 | ~10 municípios por viagem (logística) |

## Municípios e Metas Iniciais

| Meta Anual | Municípios |
|------------|------------|
| 72 | Alto Paraíso, Brasilândia do Sul, Cafezal do Sul, Esperança Nova |
| 108 | Alto Piquiri, Douradina, Francisco Alves, Icaraíma, Ivaté, Maria Helena, Mariluz, Nova Olímpia, Perobal, São Jorge do Patrocínio, Tapira, Xambrê |
| 120 | Iporã, Pérola |
| 132 | Altônia, Cruzeiro do Oeste |
| 265 | Umuarama |

**Total: 21 municípios · 2.353 amostras tipo A · 4.706 amostras no total/ano**
