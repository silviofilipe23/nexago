# Telão ao vivo — painel do organizador + TV da arena

Data: 2026-08-03 · Status: aprovado pelo dono (conversa telao-ao-vivo-painel)

## Objetivo

Exibir num painel/TV da arena os jogos ao vivo de cada quadra (placar em tempo
real, avatares das duplas), a fila de próximos jogos e a chamada de atletas —
para que atletas na arena saibam como está a partida e quando devem se
apresentar. Referência visual: mocks "30 · Telão · configuração no painel" e
"31 · Telão ao vivo · TV da arena (1920×1080)".

## Decisões aprovadas

1. **Acesso da TV: login do organizador.** Rota autenticada
   `/telao/:tournamentId` fora do shell do painel (sem sidebar), protegida só
   por `authGuard` (sem `organizerGuard` — staff logado também pode exibir).
   O pareamento por código (`nexago.app/tv` + `NX-XXXX` do mock) fica para v2.
   Motivo: `public_profiles` exige auth nas rules; rota logada dá nomes+fotos
   sem mudar rules nem backend.
2. **Escopo v1 completo**: próximos jogos, chamada de atletas, avatares e
   rotação automática — os 4 recursos do mock funcionam de verdade.
3. **Navegação: item global "Telão"** na sidebar (nível portal), página
   `/painel/telao` com seletor de "Evento exibido" dentro dela (igual ao mock).
4. **Config persistida no doc do torneio**:
   `tournaments/{id}.bigScreen = { courtIds: string[], showUpcoming,
   showCall, showAvatars, autoRotate: boolean }`, escrita direta via
   `updateDoc` (rules já permitem update pelo `managerId`). A TV escuta o doc
   do torneio e reage ao vivo a mudanças de config. Defaults quando ausente:
   todas as quadras marcadas, todos os recursos ligados.
5. **Placar real, não o do mock.** O mock desenha placar de tênis
   (games + 40/30); o modelo do nexaGO grava sets (21 pts, mesa CBV). O telão
   renderiza chips dos sets fechados + pontos do set corrente em destaque,
   reutilizando a semântica de `matchLiveCurrentSet` do portal do atleta.
   O pontinho laranja ao lado da dupla é o indicador de saque
   (`servingTeamId`), como no mock.

## Arquitetura

### Componente de tela compartilhado

`TelaoScreenComponent` renderiza a arte 1920×1080 e é usado em dois lugares:

- rota fullscreen `/telao/:tournamentId`;
- pré-visualização dentro da página de config, reduzida por `transform: scale()`.

O componente desenha num canvas lógico fixo de 1920×1080 e um wrapper mede o
container (ResizeObserver) para calcular a escala — TV 1080p = escala 1,
preview do painel ≈ 0.5. Assim o preview do mock é a tela real, ao vivo.

### Dados (somente leitura)

Novo `telao-repository.ts` em `painel/data/` com:

- `watchTournament(id)` — `onSnapshot` no doc (nome, quadras, `bigScreen`);
- `watchMatchesForTournament(id)` — `onSnapshot` na query de `matches` por
  `tournamentId` (porte do
  `frontend/projects/athlete/src/app/data/matches-repository.ts:185`);
- helpers puros portados do athlete: `matchLiveCurrentSet`, `matchSetWins`,
  `matchClosedSets`, `matchIsLive` (novo `live-set-display.ts`, com specs);
- hidratação de nomes/fotos com cache: `fetchTeamNames` (`teams` →
  `public_profiles`) + `fetchDisplayProfiles` já existentes, re-hidratando
  quando o conjunto de `teamIds`/`playerIds` muda (padrão do
  `TournamentLiveStore` do athlete).

O parse de partidas do telão inclui `liveScore`, `currentSetIndex`,
`servingTeamId` e `sets[]` — campos que o `TournamentMatch` do organizer não
mapeia hoje.

### Seleção do que aparece em cada quadra

Para cada `courtId` selecionado, em ordem:

1. partida `in_progress` na quadra (desempate: `matchStartedAt` mais recente)
   → estado **AO VIVO**;
2. senão, próxima `scheduled` futura na quadra → **EM SEGUIDA · HH:MM**
   (duplas listadas sem placar);
3. senão → **Quadra livre** (card vazio discreto).

### Fila "Próximos jogos" (showUpcoming)

Partidas `scheduled` com `scheduleTime` futuro (tolerância −10 min) nas
quadras selecionadas, ordenadas por horário, limite 6. Primeiro item
destacado com "apresentar-se à quadra". Jogo de outro dia mostra o dia junto
da hora. Horários sempre em `America/Sao_Paulo` (`spTimeLabel`/`spDayLabel`).

### Chamada de atletas (showCall)

Automática: o jogo da fila com menor `scheduleTime` futuro gera a barra
inferior "**A vs B** — apresentar-se à Quadra N até HH:MM", onde o limite é
`scheduleTime − 5 min`. Sem jogo futuro → barra mostra só "Atualizado em
tempo real".

### Rotação automática (autoRotate)

A grade mostra até 4 quadras por página (2×2). Com 5+ quadras selecionadas e
`autoRotate` ligado, alterna as páginas a cada 20 s. Desligado, mostra as 4
primeiras selecionadas.

### Página de config `/painel/telao`

- Seletor "Evento exibido": torneios do organizador (mesma fonte da lista de
  eventos), persistindo a escolha na URL (`?evento=id`).
- "Quadras no telão": checkbox por quadra com status ao lado (AO VIVO /
  próximo horário), gravando `bigScreen.courtIds`.
- 4 toggles de exibição → demais campos de `bigScreen`.
- Botões "Copiar link" (clipboard: URL absoluta de `/telao/:id`) e "Abrir
  telão em tela cheia" (nova aba).
- Card "TV da arena" com instruções v1: fazer login na TV e abrir o link
  (substitui o pareamento por código do mock).
- Pré-visualização ao vivo com badge "TRANSMITINDO" quando o evento está
  selecionado e os listeners conectados.

### Rotas e navegação

- `app.routes.ts`: rota `telao/:tournamentId` (irmã de `painel`, `authGuard`)
  + filho `telao` no nível global do `painel`.
- `panel-shell.component.ts`: item "Telão" na sidebar global.

## Erros e casos-limite

- Torneio sem `courts[]` → fallback `Q1..Qn` (`courtsFromRaw`, já existe).
- Partida sem `courtName` → `formatCourtLabel`/`resolveCourtNames`.
- Dupla sem `teamName` e sem perfis → "A definir" (padrão do portal).
- Snapshot com erro → banner discreto "Reconectando…" sem derrubar a tela;
  listeners do Firestore se reconectam sozinhos.
- Relógio do header: `setInterval` 1 s (padrão da mesa ao vivo).
- Budget Angular de estilo por componente (8 kB warn/12 kB error): estilos do
  telão divididos entre componentes filhos se necessário.

## Testes

- Specs de lógica pura: seleção de partida por quadra, montagem da fila,
  chamada (limite −5 min), paginação da rotação, `matchLiveCurrentSet`
  portado (novo arquivo `telao-selectors.spec.ts` + `live-set-display.spec.ts`).
- Specs de componente com `provideZonelessChangeDetection()` no TestBed
  (obrigatório no workspace zoneless).
- `ng build organizer` limpo.

## Fora de escopo (v2+)

- Pareamento por código / custom token (`nexago.app/tv`).
- Rotação de categorias dentro da mesma quadra.
- Telão multi-evento simultâneo.
- QR code no telão para o atleta abrir o app.
