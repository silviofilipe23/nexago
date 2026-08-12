# Modo Focus — portal do atleta (dia do evento)

Data: 2026-08-12
Superfície: `frontend/projects/athlete` (Angular)
Protótipos: A1, B1, B2, C1, C2, F1, F2, F3

## Problema

No dia do torneio o atleta usa o portal para responder cinco perguntas, sempre as mesmas:
quando eu jogo, contra quem, em qual quadra, como estou no grupo, e o que falta até o título.
O portal responde a isso espalhado entre painel, casca de torneio, categoria e chave — cercado
de reservas, ranking, comunidade e busca, que naquele dia não interessam.

O Focus é um modo que esconde o resto do portal e deixa em tela só o que decide o dia.

## Decisões

1. **Rota imersiva própria**, não uma aba a mais. O que faz o portal sumir é a casca do Focus
   não envolver o conteúdo em `AtPanelShellComponent`.
2. **A aba "Hoje" é aposentada.** Ela já era ~60% da seção Agora; manter as duas seria manter
   duas telas contando a mesma coisa, que divergem na primeira mudança.
3. **Entrada automática** no dia em que o atleta tem jogo, com duas travas contra sequestro de
   navegação: dispara uma vez por dia por dispositivo, e sair silencia até o dia seguinte.
4. **Só dado real.** Todo bloco do protótipo sem fonte de dado fica de fora, listado em
   "Fora de escopo" com o motivo. Nada de placeholder nem número inventado.

## Arquitetura

### Rotas

`focus` entra como filho de `torneios/:id`, irmão da casca de abas e da tela de partida, para
herdar a mesma instância de `TournamentLiveStore` já providenciada nessa rota — sem refazer
nenhuma leitura de partidas, equipes ou perfis.

```
torneios/:id                providers: [TournamentLiveStore]
├── partida/:matchId
├── focus                   FocusShellComponent
│   ├── agora
│   ├── trajetoria
│   ├── grupo
│   ├── chave
│   └── ''    → agora
└── ''                      TournamentShellComponent (abas atuais)
```

`/torneios/:id/hoje` passa a redirecionar para `/torneios/:id/focus/agora`, e `visibleTabsOf`
deixa de emitir `'hoje'`.

### Casca (`FocusShellComponent`)

- Header: `×` (sair) · selo `FOCUS` com ponto pulsante quando há partida ao vivo · nome do
  torneio · linha `DIA n DE N · CATEGORIA · ARENA` · relógio de `store.now()`.
  `n` e `N` vêm de `startAt`/`endAt` do torneio contados em dias de São Paulo; sem as duas datas
  a linha omite o trecho `DIA n DE N` em vez de assumir dia 1.
- Navegação idêntica nos dois tamanhos: segmentada no topo em ≥1024px, bottom-nav fixa abaixo.
- Tempo real centralizado: a casca chama `store.acquireLive()` uma vez e libera no destroy.
  Trocar de seção dentro do Focus não derruba e reabre o listener — hoje cada aba assina sozinha.
- Sair volta para `/torneios/:id` e grava o silêncio do dia.

### Entrada automática (`FocusDayService`, root, memoizado por sessão)

1. Se `localStorage['nexago.focus.dismissed']` for a data de hoje (chave por dia, componentes
   locais de `America/Sao_Paulo` — nunca `toISOString()`), não faz nada e não lê nada.
2. Senão: `fetchTeamsForAthlete` → `fetchMatchesForTeam` em paralelo. Havendo partida minha hoje
   e não encerrada, guarda `{tournamentId, matchId}`.
3. O `/painel` renderiza normalmente e redireciona quando a resposta chega. Sem guard bloqueante:
   guard aqui daria tela branca esperando o Firestore.

São as mesmas leituras que o painel já faz hoje (`athlete-painel.component.ts:731`), então o
custo real é próximo de zero, com a fronteira num serviço próprio em vez de dentro de um
componente de 958 linhas.

Fallback permanente: botão "Entrar no Focus" na casca do torneio e no card de acompanhamento do
painel, para quem saiu e quer voltar.

## Seções

### Agora

Bloco principal com três estados, na mesma posição:

| Ordem | Estado | Condição | Conteúdo |
| --- | --- | --- | --- |
| 1º | Chamado | `queueStatus === 'on_court'` **e** o atleta ainda não reconheceu este `matchId` | Hero vermelho, "Quadra X liberada", hora da chamada (`matchStartedAt`), "Ok, estou indo", Mapa, Ver partida |
| 2º | Em quadra | `matchIsLive` | Placar ao vivo e link para o detalhe |
| 3º | Próxima | partida agendada pendente | Contagem regressiva + barra, selo de check-in, card VS com avatares e linha de posição, pílulas hora/quadra/formato, CTA "Como chegar" |

A ordem importa porque `callMatchToCourt` grava `queueStatus: 'on_court'` **e**
`status: inProgress` na mesma escrita — os dois primeiros estados coexistem no dado. "Chamado"
vence enquanto o atleta não tocar em "Ok, estou indo"; a partir daí a mesma partida aparece como
"Em quadra". Sem essa precedência explícita, o alerta vermelho nunca sairia da tela ou nunca
apareceria, dependendo da ordem dos `@if`.

Abaixo: **Avisos** do organizador e **Ordem do seu dia** (timeline com V/D, parciais e marcador
da próxima) — ambos migrados inteiros da aba Hoje.

Notas de honestidade:
- "Ok, estou indo" é reconhecimento **local** (guarda o `matchId`, recolhe o alerta numa barra
  fina). Não existe callable para avisar a mesa; o rótulo diz exatamente o que o botão faz.
- O CTA abre o Maps no **endereço do torneio**, rotulado "Como chegar na Arena X".
  `tournaments/{id}.courts` é só `{id, name}`, sem posição — navegação até a quadra seria mentira.

### Trajetória

- **"N vitórias do título"**: N = colunas de mata-mata a partir de onde o atleta está
  (`buildCategoryBracketLayout`). Omitida enquanto a chave não foi sorteada.
- **Caminho até a final**: timeline vertical com as rodadas jogadas (placar por set), a atual
  destacada e as fases futuras com o rótulo que a própria chave declara (`teamADescription`,
  ex. "2º do Grupo A"). Sem horário estimado — só o que estiver agendado.
- **Seus números no torneio**: sets V–D, pontos totais, média por set, partidas e o gráfico de
  barras "você × adversário" set a set, tudo de `sets[]`.
- **Quem pode cruzar com você**: duplas nos slots opostos da chave, com a campanha real delas
  neste torneio (`campaignOf`) e a posição no grupo. Só quando os slots têm dono.
- **O que este torneio muda**: premiação por colocação de `tournamentPrizes`
  (`{position, value, label}`), marcando a linha que a campanha atual já garante.

### Grupo

- **Classificação** com a linha do atleta destacada e a faixa de `qualifiersPerGroup`.
- **Cenários da rodada**, com trava explícita: simula `buildGroupStandings` com a partida do
  atleta resolvida (vitória e derrota, testando 2–0/2–1 e 0–2/1–2) e **só afirma a posição
  quando ela é a mesma em todos os placares plausíveis**; variando, o texto vira "depende do
  placar". Só roda quando a partida do atleta é a **única pendente do grupo** — com outras em
  aberto, o resultado alheio manda. Fora dessas condições, cai no texto conservador que a Hoje
  já usa (posição atual, quantas faltam, quantos avançam).
  Isso preserva a decisão já tomada em `qualificationOf`: nunca afirmar classificação que
  dependeria de simular critério de desempate.
- **Cruzamento no mata-mata**: exibido quando a chave declara o slot ("1º do Grupo B vs 2º do
  Grupo A"). É fato da chave, não previsão.
- **Ao vivo na categoria**: partidas em quadra com placar (já existente).
- **Onde jogar**: quadra atual, nome e endereço da arena, link do Maps.

### Chave

Reaproveita `CategoryBracketComponent` inteiro (zoom e conectores SVG já prontos). Única
mudança: hoje lê a categoria de `parentCategoryId()`; ganha um `input()` opcional com
prioridade sobre a rota, alimentado por `store.focusCategoryId()`. Retrocompatível — a rota de
categoria segue idêntica.

## Fora de escopo, com motivo

| Bloco do protótipo | Motivo |
| --- | --- |
| Clima (31° · vento 12 km/h) | Nenhuma fonte; exigiria integração externa |
| Contagem de W.O. (8:42) | Não existe prazo em lugar nenhum; seria regra inventada |
| Tempo de caminhada (1 min) | Não há posição de quadra nem do atleta |
| "Como chegar na Quadra 3" | `courts` é só `{id, name}`; entregue como rota até a arena |
| Aquecimento sugerido | Não existe conteúdo |
| Ponto forte/fraco do adversário | Não existe scouting |
| Aproveitamento 68%, erros 19 | Exigiria coleta ponto a ponto que ninguém faz |
| Lado da areia, bola, árbitro | Campos inexistentes; seriam novos no organizador |
| "Onde é o quê" (mesa, hidratação, gelo) | Não há POI de arena |
| Projeção de ranking #412 → #348 | Exigiria rodar a engine de ranking no cliente |
| XP / nível no card de impacto | Mesma razão |
| "Últimos 5" do adversário | Histórico entre torneios; leitura fora do escopo do store |
| Sua evolução na temporada | Idem |
| Compartilhar trajetória | Arte de canvas nova, como o pôster de partida e o card de palpites — entrega própria |

## Arquivos

```
tournaments/focus/
  focus-shell.component.{ts,html,scss}   casca: header + nav + outlet
  focus-day.ts + .spec.ts                é dia de Focus? qual torneio? (puro)
  focus-day.service.ts                   detecção + memo + silêncio do dia
  focus-views.ts + .spec.ts              views migradas da Hoje (puro)
  focus-scenarios.ts + .spec.ts          simulação de cenários com a trava
  focus-journey.ts + .spec.ts            caminho, números, "N vitórias" (puro)
  now/focus-now.component.{ts,html,scss}
  journey/focus-journey.component.{ts,html,scss}
  group/focus-group.component.{ts,html,scss}
```

Alterados: `app.routes.ts` (rota + redirect de `hoje`), `tournament-live.selectors.ts`
(`visibleTabsOf` sem `'hoje'`), `category-bracket.component.ts` (input de categoria),
`tournament-shell.component.*` (botão de entrada), `athlete-painel.component.ts` (redirect +
botão). Removidos: `tabs/today-tab.component.*`.

## Testes

Unitários nos quatro arquivos puros, no padrão de `tournament-live.selectors.spec.ts`:

- `focus-day.spec.ts` — dia com jogo, dia sem jogo, virada de dia no fuso de São Paulo,
  silêncio do dia respeitado, partida encerrada não conta.
- `focus-views.spec.ts` — os três estados do bloco principal, timeline, avisos.
- `focus-scenarios.spec.ts` — o coração da trava: caso invariante afirma a posição; caso que
  muda entre 2–0 e 2–1 devolve "depende do placar"; grupo com outra partida pendente não afirma.
- `focus-journey.spec.ts` — contagem de vitórias até o título, caminho com slots sem dono,
  números derivados de `sets[]`, premiação garantida pela campanha.

Specs de componente, se houver, com `provideZonelessChangeDetection()` nos providers.

## Riscos

- **Regressão na aposentadoria da Hoje**: o conteúdo migra para funções puras antes de sair do
  componente, e o redirect de `/hoje` mantém links antigos e compartilhados vivos.
- **Atleta em mais de uma categoria**: `focusCategoryId()` já resolve pela próxima partida.
- **Mais de um torneio no mesmo dia**: `FocusDayService` escolhe o da partida pendente mais
  próxima; o botão na casca do torneio permite ir ao outro.
- **Atleta sem jogo hoje abrindo o Focus por link**: as seções degradam para o estado de fim de
  dia em vez de quebrar.
