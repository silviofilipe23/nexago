# Placar ao vivo ponto a ponto (portal do organizador → portal do atleta)

Data: 2026-08-03 · Branch: `claude/live-scoreboard-matches-c4aa61`

## Problema

Quando o organizador dá o start em uma partida no portal web do organizador, ela precisa
ficar "ao vivo" para os atletas acompanharem, com placar ponto a ponto — a mesma função
que já existe na mesa ao vivo do app Flutter (I1).

Hoje o portal do organizador só tem lançamento de placar final (`PlacarComponent` →
`submitMatchResult`); não existe start, nem ponto a ponto, nem realtime.

## Contexto descoberto

- Partidas: `artifacts/{projectId}/public/data/matches/{matchId}`, leitura pública.
- **Dois placares paralelos hoje:**
  - Mesa do app (I1) escreve **direto no Firestore** em transação: `sets[]` (incluindo o
    set em andamento), `currentSetIndex`, `status`, `servingTeamId`, `resultA/B`,
    `matchStartedAt`, `winnerId`/`matchEndedAt` no fim, + evento em `pointEvents`
    (`seq == pointEventSeq + 1`, validado nas rules).
  - Portal do atleta web lê o agregado `liveScore {setsA,setsB,currentGamesA,currentGamesB}`,
    escrito **só** pela callable `updateLiveMatchScore` (auto-start: seta `In Progress` +
    `matchStartedAt` na 1ª chamada). O app não escreve nem lê `liveScore` nas telas ao vivo.
- `submitMatchResult` valida sets no servidor, seta `Completed`+`winnerId`, apaga `liveScore`.
- Avanço de chave só dispara com `status Completed` + `winnerId` (placar parcial é seguro).
- Regras de pontuação (vôlei de praia/CBV): set até 21, 3º set de MD3 até 15, vantagem 2,
  sem teto. `bestOf` ∈ {1, 3}. Fonte: `MatchScoringLogic` (Dart) e `functions/src/match-scoring.ts`.

## Decisão

**Mesa ao vivo no portal do organizador com o modelo canônico do app + sincronização do
`liveScore` para o portal do atleta.** Zero mudança de backend (callables e rules atuais bastam).

### Portal do organizador (novo)

- Rota `painel/eventos/:id/categorias/:catId/ao-vivo/:matchId` (`MesaAoVivoComponent`),
  irmã de `placar/:matchId`; prefixo adicionado ao item "Jogos & placares" da sidebar.
- Entrada pela tabela de Jogos: botão **Iniciar** (agendada, duplas definidas) ou
  **Mesa ao vivo** (em andamento). Tabela passa a mostrar o status real (`Ao vivo` etc.).
- **Start explícito**: botão "Iniciar partida" chama `updateLiveMatchScore(matchId, 0,0,0,0)`
  → servidor seta `In Progress` + `matchStartedAt` + `liveScore` zerado. A partida fica ao
  vivo no portal do atleta imediatamente, antes do 1º ponto.
- **Ponto a ponto (paridade com a mesa I1 do app)**: cada ponto roda a mesma transação do
  app (atualiza `sets`, `currentSetIndex`, `status`, `servingTeamId`, `resultA/B`, grava
  `pointEvents` com `seq` sequencial). Lógica portada de `MatchScoringLogic` para
  `live-scoring.ts` (puro, com specs). Undo idêntico ao do app (inclusive desfazer ponto
  de match, apagando `winnerId`/`matchEndedAt`).
- **Fim de partida**: a transação do ponto final grava `Completed`+`winnerId`+`matchEndedAt`
  — o trigger `onTournamentMatchCompletedAdvance` avança a chave e recalcula
  `liveMatchesNow`, exatamente como no app. (Sem sincronizador de `liveScore` por ponto:
  o portal do atleta aprendeu a ler o modelo da mesa — ver abaixo — então o agregado só é
  usado no start.)
- Realtime da mesa: `onSnapshot` no doc da partida + na subcoleção `pointEvents`; a tela é
  dirigida pelo doc (sem estado local de placar), igual à mesa do app. O undo usa replay
  dos eventos (não desfaz o mesmo lado duas vezes).

### Portal do atleta (ajustes)

- Novo `matchLiveCurrentSet` unifica os dois escritores de placar ao vivo: mesa ponto a
  ponto (set corrente dentro de `sets[]` + `currentSetIndex`) e agregado
  (`liveScore.currentGames*`), com prioridade pra mesa e fallback pro agregado quando
  todos os sets de `sets[]` estão fechados.
- `matchSetWins`/`matchClosedSets`: não contar set inacabado (o modelo da mesa inclui o
  set corrente em `sets[]`) — regra 21/15 decisivo/vantagem 2 só quando ao vivo; partida
  encerrada mantém a contagem histórica.
- `displaySetsOf`: o set em andamento (de qualquer escritor) aparece como `inProgress`,
  sem duplicar.
- Aba **Partidas** passa a assinar o realtime (`acquireLive`), como Hoje e o detalhe —
  status vira "Ao vivo" e os pontos correm sem recarregar.
- Detalhe da partida e aba Hoje já são realtime e já exibem badge, cronômetro e parciais.

## Fora de escopo

- Check-in / fila de chamada de quadra no web (o start da mesa não exige check-in,
  igual ao atalho do app de iniciar pelo 1º ponto).
- Feed play-by-play para o atleta web (o app já tem; web fica para depois).
- Regras por esporte (o app também usa regra única de vôlei de praia).

## Riscos aceitos

- `servingTeamId` está fora da allowlist do papel `scorer` nas rules — mesma limitação
  já existente na mesa do app; usuários do portal são dono/manager.
- Após completar via mesa, `liveScore` residual só é apagado pelo `submitMatchResult`
  (chamado na sequência); leitores já ignoram `liveScore` quando não está "In Progress".
