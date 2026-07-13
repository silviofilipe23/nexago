# Comparar atletas (Portal do Treinador) — design

## Contexto

O [[coach-portal-mvp]] cobriu 10 módulos + Perfil de um total de 39 telas do protótipo Claude Design (`NexaGO Treinador - Telas.html`). Esta rodada trata o primeiro corte do restante: o grupo "Atletas & equipes" do protótipo tem duas telas ainda não implementadas — "Comparação entre atletas" (19) e "Formação de duplas" (17).

No protótipo, "Comparação" mostra dois atletas lado a lado com radar de fundamentos técnicos e uma tabela com Rating, Presença, Win rate e Pódios. "Formação de duplas" mostra sugestões automáticas de dupla geradas por "IA" a partir de rating, histórico de jogos juntos e aproveitamento.

Levantamento de dados reais mostrou:
- Rating numérico, Win rate e Pódios **não existem** no schema do coach (rating já havia sido cortado do MVP original por falta de dado confiável; vitórias/derrotas e histórico de confrontos nunca foram coletados).
- Radar de fundamentos técnicos **existe e é real**: `coaches/{uid}/evaluations` já grava as 9 notas técnicas (`saque`, `recepcao`, `levantamento`, `ataque`, `defesa`, `bloqueio`, `condicionamento`, `comunicacao`, `mental`), usadas hoje em Nova Avaliação.
- Presença **é derivável**: `coaches/{uid}/trainings/{id}.attendance` já guarda o status de cada atleta por treino "realizado"; uma taxa de presença por atleta é só uma agregação client-side, sem dado novo.
- "Histórico juntos" / "aproveitamento" de uma dupla **não existem em lugar nenhum** — exigiria uma nova coleção de resultados de confrontos, fora do escopo desta entrega.

## Decisões

- **As duas telas do protótipo viram uma só: "Comparar atletas".** Como a única forma viável de "Formação de duplas" sem inventar dado é a comparação manual entre 2 atletas escolhidos pelo treinador, o conteúdo fica idêntico ao de "Comparação entre atletas". Manter duas rotas/entradas de menu renderizando a mesma coisa seria duplicação sem propósito. Decisão do dono do produto, confirmada em brainstorming.
- **Sem alegação de IA.** Nenhuma sugestão automática de dupla, nenhum texto de "compatibilidade calculada" — o treinador escolhe os 2 atletas manualmente em dois seletores.
- **Métricas mostradas: só o que é real.** Radar de fundamentos (última avaliação de cada atleta) + média geral da avaliação + % de presença. Rating, Win rate e Pódios do protótipo ficam de fora, mesmo critério do MVP original.
- **Escopo do roster: equipe ativa**, mesma fonte (`SquadContextService`) que a tela Atletas já usa — consistente com o resto do painel.
- **Entrada pela tela Atletas**, um botão no cabeçalho (mesmo padrão de "Convidar atleta"/"Nova equipe"), não um item novo na sidebar — a tela é uma ação secundária de "Atletas", não um módulo de primeiro nível.
- **Refatoração pequena e amarrada ao escopo:** a lista dos 9 fundamentos (chave + rótulo) está hoje hard-coded dentro de `panel-nova-avaliacao.component.ts` (`FUNDAMENTALS`). Vira uma constante exportada em `evaluation-stats.ts`, reaproveitada pelos dois componentes — evita duplicar a mesma lista de 9 itens.
- **Aba "Estatísticas" da tela Atletas continua fora de escopo** — depende de dados de torneio (Task 16 original), não muda aqui.

## Dados e cálculo (sem mudança de schema — tudo client-side)

Nenhuma coleção ou campo novo no Firestore. Toda a lógica é agregação sobre dados já existentes, lida pelos serviços que já existem (`AthletesService`, `EvaluationsService`, `TrainingsService`):

- **Radar por atleta**: última avaliação (`latestTwoByAthlete`, já existe em `evaluation-stats.ts`) mapeada para `RadarAxis[]` via a constante `FUNDAMENTALS` compartilhada. Sem avaliação registrada → estado vazio no lugar do radar ("Sem avaliação registrada").
- **Média geral**: `averageScore(latest.scores)`, já existe.
- **Taxa de presença**: nova função pura `attendanceRate(athleteUid, trainings): number | null` em `attendance-stats.ts` (novo arquivo, ao lado de `evaluation-stats.ts`) — conta `presente` + `atrasado` sobre o total de entradas de `attendance` em treinos com `status === 'realizado'` daquele atleta; retorna `null` se não há nenhum treino realizado com esse atleta presente no mapa de presença (estado vazio: "Sem dados de presença").

## Arquitetura de arquivos

```
painel/atletas/
  attendance-stats.ts              (novo — função pura attendanceRate + spec)
  attendance-stats.spec.ts         (novo)
  panel-comparar-atletas.component.ts   (novo — tela)
  panel-atletas.component.ts       (alterado — botão "Comparar atletas" no cabeçalho)
painel/avaliacoes/
  evaluation-stats.ts              (alterado — exporta FUNDAMENTALS)
  panel-nova-avaliacao.component.ts (alterado — importa FUNDAMENTALS em vez de redefinir)
app.routes.ts                      (alterado — nova rota painel/atletas/comparar)
```

**`PanelCompararAtletasComponent`** (`co-panel-comparar-atletas`):
- `co-page-header` título "Comparar atletas".
- Dois `co-form-select` (Atleta A / Atleta B) com o roster da equipe ativa; default para os 2 primeiros atletas do roster quando houver.
- Estado vazio se o roster tiver menos de 2 atletas: "Adicione ao menos 2 atletas a esta equipe para comparar."
- Dois `co-panel-card` lado a lado (grid 2 colunas): avatar, nome, categoria/posição, `co-radar-chart` com a última avaliação (ou estado vazio).
- Um `co-panel-card` full-width abaixo com as linhas de comparação direta: Média geral, % de presença (cada linha destaca em verde o lado com valor maior, mesmo padrão visual de `TrCompareStat` do protótipo).

Segue os mesmos padrões de change detection (`OnPush`), signals e reactive forms do resto do painel — nenhuma novidade de arquitetura.

## Fora de escopo desta entrega

Qualquer sugestão automática de dupla; Rating/Win rate/Pódios; aba "Estatísticas" da tela Atletas; as outras 18 telas ainda pendentes do protótipo (Permissões, Plano de evolução, Lesões, Estatísticas da equipe, Relatórios, Financeiro, Comunicação, Biblioteca, e todo o bloco de Inteligência NexaGO) — ficam para rodadas futuras de brainstorming, uma de cada vez.

## Testes

`attendanceRate` ganha spec unitário (`attendance-stats.spec.ts`), mesmo padrão de `evaluation-stats.spec.ts`/`radar-geometry.spec.ts` — casos: nenhum treino realizado (`null`), todos presentes (100%), mix de status incluindo `justificado`/`ausente` não contando como presença, atleta sem nenhuma entrada em `attendance` de um treino realizado (ignora esse treino, não conta como ausência). Componentes Angular seguem a convenção do projeto (sem suíte dedicada além disso).
