# Telas restantes do portal do treinador (mock) — design

## Contexto

Terceira rodada de telas restantes do protótipo Claude Design (`NexaGO Treinador - Telas.html`, projeto `nexago`, id `2936d12d-662f-4ad7-a36d-0760b0b95a86`) — ver [[coach-portal-mvp]]. Depois do MVP (19 tarefas), "Comparar atletas" (dado real) e "Plano de evolução & Lesões" (mock), restam 14 telas em 6 grupos. O pedido desta rodada é explícito: **todas as 14, só mockadas, o mais rápido possível, pra ter um protótipo navegável completo** — mesma regra da rodada anterior (UI estática, dado de exemplo, sem Firestore/service/persistência), agora aplicada de uma vez ao restante inteiro do protótipo.

Os 5 arquivos-fonte do protótipo pra este grupo (`tr-screens-fundamentos.jsx`, `tr-screens-competicao.jsx`, `tr-screens-pagamentos.jsx`, `tr-screens-comunicacao.jsx`, `tr-screens-ia.jsx`) foram lidos por completo antes deste spec — o `active=` que cada `TrPanelShell` usa no protótipo informa a qual item de navegação (existente ou novo) cada tela pertence, e essa informação guiou as decisões de IA abaixo em vez de adivinhação.

## Decisões

- **5 itens novos na sidebar** (de 11 para 16): Permissões (ícone `gear`, já existe), Financeiro (ícone novo `wallet` — cobre Pagamentos/Planos/Novo plano), Comunicação (ícone novo `chat`), Biblioteca (ícone novo `folder`), IA do treinador (ícone novo `sparkle`).
- **Estatísticas da equipe e Relatórios não ganham item de sidebar** — o protótipo já as marca como pertencentes aos nav existentes (`torneios` e `historico`, respectivamente). Viram botões nos cabeçalhos das telas Torneios e Histórico.
- **As 5 telas "Diferencial" (Evolução do rating, Recomendação de categoria, Descoberta de talentos, Gestão de metas, Análise pós-torneio) viram cards na nova tela "IA do treinador"**, não botões espalhados pelos cabeçalhos de Atletas/Torneios como o protótipo sugere — decisão pragmática pra não sobrecarregar cabeçalhos já cheios (Atletas já tem 2 botões; adicionar mais 4 lá quebraria o layout). Confirmado com o usuário como parte da aprovação desta rodada.
- **Novo componente reutilizável `co-line-chart`** (`painel/ui/line-chart.component.ts`) — o protótipo usa `ArLineChart` em duas telas (Estatísticas da equipe, Evolução do rating) e esse componente não existe no projeto ainda (a tela Início real, já implementada, cortou o gráfico de rating por falta de dado real — mas aqui é mock, então o gráfico volta). SVG simples com polyline, mesmo espírito do `co-radar-chart` já existente (sem lib externa).
- **Tudo mock, mesma regra da rodada anterior**: dado de exemplo fixo, sem Firestore/service/Cloud Function. Botões de ação que no protótipo levam a uma outra tela mockada (`Novo plano`, `Estatísticas`, `Relatórios`, os cards da IA) navegam de verdade; botões sem tela de destino no escopo desta rodada (`Aprovar promoção`, `Convidar`, `Cobrar`, `Criar treino`, `Enviar arquivo`) ficam visualmente presentes e inertes (sem `(click)` nenhum, ou um `(click)` vazio quando o protótipo já usa `<button>`).

## Mapa de telas → rotas → navegação

| # | Tela (protótipo) | Rota | Entrada |
|---|---|---|---|
| 1 | Permissões | `/painel/permissoes` | Sidebar (novo) |
| 2 | Estatísticas da equipe | `/painel/torneios/estatisticas` | Botão em Torneios |
| 3 | Relatórios | `/painel/historico/relatorios` | Botão em Histórico |
| 4 | Pagamentos | `/painel/financeiro` | Sidebar (novo, "Financeiro") |
| 5 | Planos — listagem | `/painel/financeiro/planos` | Botão em Pagamentos |
| 6 | Planos — novo plano | `/painel/financeiro/planos/novo` | Botão em Planos |
| 7 | Comunicação | `/painel/comunicacao` | Sidebar (novo) |
| 8 | Biblioteca | `/painel/biblioteca` | Sidebar (novo) |
| 9 | IA do treinador | `/painel/ia` | Sidebar (novo) |
| 10 | Evolução do rating | `/painel/ia/evolucao-rating` | Card em IA |
| 11 | Recomendação de categoria | `/painel/ia/recomendacao-categoria` | Card em IA |
| 12 | Descoberta de talentos | `/painel/ia/descoberta-talentos` | Card em IA |
| 13 | Gestão de metas | `/painel/ia/gestao-metas` | Card em IA |
| 14 | Análise pós-torneio | `/painel/ia/analise-pos-torneio` | Card em IA |

## Arquitetura de arquivos

```
painel/ui/
  line-chart.component.ts          (novo — SVG polyline reutilizável)
  icon.component.ts                 (alterado — wallet, chat, folder, sparkle)
  panel-shell.component.ts          (alterado — 5 itens novos em NAV_ITEMS)
painel/permissoes/
  panel-permissoes.component.ts     (novo)
painel/torneios/
  panel-estatisticas.component.ts   (novo)
  panel-torneios.component.ts       (alterado — botão "Estatísticas da equipe")
painel/historico/
  panel-relatorios.component.ts     (novo)
  panel-historico.component.ts      (alterado — botão "Relatórios")
painel/financeiro/
  panel-pagamentos.component.ts     (novo)
  panel-planos.component.ts         (novo)
  panel-novo-plano.component.ts     (novo)
painel/comunicacao/
  panel-comunicacao.component.ts    (novo)
painel/biblioteca/
  panel-biblioteca.component.ts     (novo)
painel/ia/
  panel-ia.component.ts             (novo — hub com FAQ + cards p/ os 5 diferenciais)
  panel-evolucao-rating.component.ts       (novo)
  panel-recomendacao-categoria.component.ts (novo)
  panel-descoberta-talentos.component.ts    (novo)
  panel-gestao-metas.component.ts           (novo)
  panel-analise-pos-torneio.component.ts    (novo)
app.routes.ts                       (alterado — 14 rotas novas)
```

Nenhum arquivo de serviço é criado — mesma regra da rodada anterior.

## Fora de escopo desta entrega

Qualquer persistência real; qualquer lógica por trás de "Aprovar promoção"/"Convidar"/"Cobrar"/"Criar treino"/"Enviar arquivo" (ficam inertes); reorganização de Permissões como hub de configurações (fica como item de sidebar isolado, não dentro de Perfil); o restante do ecossistema (nada — com esta rodada, todas as 39 telas do protótipo original estarão implementadas, ainda que várias como mock).

## Testes

Uma peça nova de lógica: `LineChartComponent`'s cálculo de pontos (normalização de valores pro SVG) é pura o bastante pra merecer um spec unitário (`line-chart-geometry.ts` + `.spec.ts`, mesmo padrão de `radar-geometry.ts`) — extraída como função pura em vez de ficar só dentro do componente, seguindo o precedente já estabelecido no projeto. O resto (13 telas) é puramente visual, sem lógica nova — verificação por `ng build coach` + revisão de código, mesma convenção das rodadas anteriores.
