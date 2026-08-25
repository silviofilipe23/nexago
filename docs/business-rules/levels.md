# Nível

## Conceito
"Nível" é diferente de [ranking](ranking.md): não é sobre colocação em torneios, é sobre a **força do atleta**, usada para decidir em quais categorias ele pode se inscrever (anti-sandbagging). Existem duas camadas, hoje coexistindo:

- **Nível declarado** — escolhido pelo próprio atleta (app ou portal web); só pode subir depois que a 1ª inscrição trava o esporte (antes disso, janela de correção — ver [Calibração de nível](#calibração-de-nível-janela-de-correção) abaixo). É o que vale hoje para elegibilidade de categoria.
- **Rating automático (Glicko-2)** — calculado a partir dos resultados reais em partida, por esporte. Já roda e calcula tudo em produção, mas a promoção/rebaixamento automáticos ainda dependem de flags de rollout (ver seção própria).

## Escada única (unificada em 24/07/2026, ampliada para 7 em 15/08/2026)
**Todos os esportes usam a mesma escada de 7 níveis** — não existe mais escada de 3 nem planos de escada D/C/B/A separada para beach tennis:

| código (storage) | label | rank |
|---|---|---|
| `iniciante_1` | Iniciante 1 | 0 |
| `iniciante_2` | Iniciante 2 | 1 |
| `intermediario_1` | Intermediário 1 | 2 |
| `intermediario_2` | Intermediário 2 | 3 |
| `avancado_1` | Avançado 1 | 4 |
| `avancado_2` | Avançado 2 | 5 |
| `open` | Open | 6 |

**Ranks 0–6 contíguos desde 15/08/2026.** A renumeração ÚNICA (`open` 5→6) foi feita em 15–17/08/2026. A partir daí, a numeração é fixa — **nunca renumerar**. Valores legados são aceitos só em LEITURA, aliasados ao degrau inferior do split: `iniciante`/`basico`→0, `intermediario`→2, `'Avançado'`→`avancado_1`, `livre`/`Open / federado`→6.

Duas ferramentas de migração/realinhamento, com papéis diferentes:
- `migrateAthleteRatingLevelRanks` (callable) recalcula `athleteRatings.levelRank` pelo CÓDIGO do nível.
- `functions/scripts/backfill-open-rank-6.js` cobre o realinhamento completo do Open: docs de `artifacts/{projectId}/public/data/athleteRatings` com `levelRank == 5` recebem `levelRank: 6`, rating elevado ao piso de ≥2200 (quando ainda abaixo), zona/observação da escada zeradas e proteção de promoção de 120 dias — além de regravar os arrays `levels` de `ratingLadders/{esporte}`.

**Precondição do dry-run:** antes de rodar qualquer migração (dry-run ou real), inspecionar os docs `ratingLadders/{sportCode}` no Firestore. Um doc com array `levels` SOBRESCREVE a escada padrão de 7 degraus deployada — a migração recalcularia `levelRank` contra a ladder ANTIGA gravada no doc, não contra a escada nova. O `backfill-open-rank-6.js` já regrava esses arrays; para a callable, atualizar ou remover os docs antes.

## Onde o nível é guardado (fonte única)
- **Única escrita**: `users/{uid}.sportOnboarding.levelsBySport.{SPORT_CODE} = <código>`. É onde escrevem o app, o portal web do atleta, a engine de rating (promoção/rebaixamento) e o backfill de migração. Desde a calibração de 17–18/08/2026 (ver seção própria), nenhuma superfície de atleta grava um esporte novo sem escolha explícita — não existe mais default silencioso de `iniciante_1` ao adicionar esporte; o backfill de migração (super admin) é a única escrita que ainda semeia `iniciante_1` automaticamente, e só para esportes secundários sem entrada (ver "Migração/backfill" abaixo).
- **Sport codes (9)**: `VOLEI_PRAIA`, `VOLEI_QUADRA`, `BEACH_TENNIS`, `FUTEVOLEI`, `FUTEBOL`, `BASQUETE`, `TENIS`, `CORRIDA`, `OUTROS`. Futevôlei virou esporte próprio do perfil (antes era alias de Futebol); torneios de `footvolley` usam o nível `FUTEVOLEI`.
- **Campos legados, só leitura** (não são mais escritos por código novo): `level` (label global), `nivel`, `sportProfile.level` (código), `levelsBySportFirestore` (campo fantasma — nunca foi escrito; os fallbacks de leitura no backend foram removidos), `discoverLevelLabel` (nunca lido; escrita removida).
- **Cadeia canônica de leitura**: `levelsBySport[sportCode]` → `level` global legado → (só exibição: `nivel` → `sportProfile.level`) → ausente. Ausente resolve para: rank 0 (permissivo) em elegibilidade; "sem nível" em exibição; `null` em filtros de ranking.
- **Vocabulário compartilhado**: `functions/src/category-level-eligibility.ts` (autoritativo, exporta `LEVEL_CODES`/`ATHLETE_SPORT_CODES`), `AthleteProfileOptions` no app, `@nexago/levels` (`frontend/shared/levels`) nos portais web.

## Nível declarado — regra "só sobe"
- O atleta pode subir de nível a qualquer momento, com confirmação explícita ("o nível só pode subir; para reduzir, fale com o suporte").
- Nunca pode descer sozinho — downgrade é operação de suporte/super admin — **exceto dentro da janela de correção por esporte** (antes da 1ª inscrição ativa naquele esporte; ver [Calibração de nível](#calibração-de-nível-janela-de-correção) abaixo).
- Aplicado em 3 camadas: UI (app "Esportes e níveis" e portal web `/perfil/esportes` bloqueiam visualmente os níveis abaixo do salvo, exceto durante a janela), lógica do cliente, e as rules do Firestore (`athleteLevelsNotDowngraded`) — que recusam o update inteiro do doc se qualquer nível regredir NUM ESPORTE JÁ TRAVADO. A guarda das rules cobre **os 9 esportes** + os campos legados `level`/`sportProfile.level` (clientes antigos ainda os escrevem, sempre ratcheted, janela ou não); rewrite de MESMO rank é permitido (app antigo regravando código legado).
- **Por quê**: sem o ratchet, o atleta rebaixava o próprio nível na véspera de uma inscrição pra caber numa categoria mais fácil — furava o anti-sandbagging. A janela de correção (abaixo) existe para não punir quem só errou a autoavaliação inicial e ainda não jogou valendo.

## Calibração de nível (janela de correção)
Implementada em 17–18/08/2026 sobre o "só sobe" acima — dá ao atleta uma chance de corrigir a autoavaliação inicial, esporte por esporte, sem reabrir o furo de sandbagging que o ratchet existe para fechar.

- **Escolha obrigatória**: nenhum fluxo que define o nível declarado — onboarding do app, "adicionar esporte" do app, onboarding do portal web, "adicionar esporte" do portal web — pode default um nível em silêncio. O atleta sempre escolhe explicitamente antes de o esporte entrar em `levelsBySport`.
- **A janela**: por esporte, enquanto `sportOnboarding.levelLocked.{SPORT_CODE}` não é `true`, o próprio atleta pode DESCER o nível declarado daquele esporte livremente (autocorreção, sem passar por suporte). Assim que o lock é gravado, o ratchet "só sobe" volta a valer para sempre naquele esporte — não existe reabertura pelo atleta; um administrador ainda pode ajustar via bypass de super admin.
- **O que fecha a janela — `levelLocked`**: gravado só pelo trigger de backend `onInscriptionWrittenLockLevels` (`functions/src/tournament-level-lock.ts`), nunca pelo cliente — as rules recusam qualquer update do dono que mude `sportOnboarding.levelLocked` (predicado `levelLockedUnchanged()`).
  - Dispara na **1ª inscrição ATIVA** do atleta naquele esporte: tanto uma inscrição nova (solo, dupla, equipe) quanto o atleta **entrando** numa reserva que já existia — aceitar convite de parceiro, ou "attach" pelo organizador. Os dois casos passam por validação de elegibilidade de categoria no momento em que acontecem, então os dois merecem travar (sem isso, aceitar convite seria uma porta lateral pra nunca travar).
  - **Entrar na lista de espera também tranca** (ruling do controlador): a fila já passou pela validação de elegibilidade com o nível declarado; deixar descer enquanto espera vaga reabriria o furo justamente no caso em que o atleta sabe que vai jogar.
  - **"Ativa" = o doc de inscrição existe.** A coleção de inscrições (`artifacts/{appId}/public/data/inscriptions`) não tem campo de status persistido: cancelamento — pelo atleta, pelo organizador, ou por pedido de cancelamento aprovado — é sempre exclusão (hard delete) do documento; a auditoria vai para uma coleção à parte. Por isso **cancelar nunca destrava**: o flag `levelLocked` só é gravado como `true`, nunca apagado ou revertido.
  - Campos legados de nível global (`level`, `sportProfile.level`) não têm granularidade por esporte — continuam ratcheted sempre, com ou sem janela.
- **Correção pré-lock e o rating**: TODA descida do próprio atleta dentro da janela grava `levelHistory` com `reason: "self_correction"` (é auditoria, não é um "upgrade" automático) — inclusive quando o atleta ainda não tem doc em `athleteRatings` pro esporte, o caso mais comum da janela (autocorreção antes de qualquer partida rateada). O rating Glicko só é re-semeado (rating, RD, `levelCode` e `levelRank` todos realinhados pro nível novo) quando o atleta ainda não tem nenhuma partida rateada (`ratedMatches === 0`); com histórico de partidas, corrigir o nível DECLARADO não mexe no rating calculado. Uma escrita PRIVILEGIADA (admin via backoffice, ou organizador promovendo — ver abaixo) nunca gera essa entrada `self_correction`: `setAthleteLevel` estampa `sportOnboarding.levelChangeBy` (`"admin"`/`"organizer"`) na mesma escrita que muda `levelsBySport`, o trigger `onUserWrittenTrackLevelChanges` lê esse marcador pra pular a auditoria e depois o apaga, e cada caminho privilegiado audita sob o próprio motivo (`reason: "admin_manual"` ou `"organizer_promotion"`, ver seção de promoção abaixo).
- **Confirmação na 1ª inscrição**: antes de a 1ª inscrição de um esporte disparar o lock, o atleta vê um último aviso — "Você vai se inscrever como {nível} em {esporte}. Após a inscrição, o nível só poderá subir." — com a opção de seguir ou ir ajustar o nível primeiro. Cobre TODO ponto de entrada que cria ou ativa uma inscrição nas duas superfícies, inclusive aceitar convite de parceiro (o caminho mais usado, e o que mais fácil escapa de um wiring incompleto):
  - **App**: tela de inscrição em torneio e tela de aceite de convite de parceiro.
  - **Portal web do atleta**: fluxo de inscrição (solo/dupla/equipe, e aceite de convite embutido na própria tela), aceite rápido pelo painel, aceite pela Agenda, e o modal automático de convite ao entrar no portal — 4 pontos distintos.
- **Promoção pelo organizador**: `setAthleteLevel` ganhou um segundo caminho além do admin de plataforma — o ORGANIZADOR dono do torneio (`managerId`) pode subir o nível de um atleta no esporte do próprio torneio, desde que o atleta tenha inscrição ativa nele.
  - Esporte do torneio precisa bater com o esporte do pedido — sem essa checagem, o organizador de um torneio de esporte A promoveria o atleta em QUALQUER esporte B só por ele estar inscrito nesse torneio.
  - Só pode SUBIR — **exceto** quando o atleta ainda não tem nível declarado naquele esporte: nesse caso o organizador pode semear qualquer degrau (não há "descer" de um nível que não existe).
  - Auditado em `levelHistory` com `reason: "organizer_promotion"`, `tournamentId` e `actor: "organizer:{uid}"`.
  - Staff/mesário NÃO pode promover (ruling deliberada) — só o dono do torneio responde por essa ação, irreversível sem suporte; delegar para a mesa fica como follow-up se o dono pedir.
  - Não notifica o atleta promovido nesta rodada (fora de escopo).
  - **Consequência não coberta por teste (ruling do controlador)**: "Promover nível" NÃO é gated na categoria estar concluída/chave fechada — o backend (dono + esporte + inscrição ativa) já é o gate real, de propósito (ver acima). Isso abre uma janela: promover um atleta com reserva SOLO (aguardando parceiro) durante o período de inscrições pode empurrá-lo ACIMA do teto da categoria; a partir daí, `assertTeamLevelEligibility` (`functions/src/category-level-eligibility.ts`) reavalia os níveis dos DOIS jogadores no momento do ACEITE (não só no envio do convite) e passa a REJEITAR o parceiro convidado — o convite pendente fica permanentemente inaceitável. Não há reconciliação automática (cancelar/recriar o convite numa categoria compatível, ou trocar de categoria, fica a cargo de quem perceber o travamento).

### Pendências de rollout (registrar, não executar)
- **Ordem de deploy**: `firebase deploy --only firestore:indexes` PRIMEIRO — índice composto novo em `inscriptions` (`tournamentId ASC` + `participantUids CONTAINS`) — → depois functions (trigger novo `onInscriptionWrittenLockLevels`) → rules → portais web → release do app. Fora de ordem, o trigger ou as rules podem rodar contra um índice ou uma função ainda ausente.
- **Backfill pendente — a base INTEIRA nasce destravada**: `levelLocked` é campo novo; NENHUM atleta o tem gravado no momento do deploy. Isso não é "quem já tiver inscrição ativa fica destravado" (condicional) — é a base INTEIRA, em TODOS os esportes que já joga, inclusive quem já disputou torneios e cuja janela de correção, por definição, já deveria estar fechada há tempos. Até fazer uma NOVA inscrição naquele esporte (que finalmente dispara o trigger e trava), cada um desses atletas pode descer o nível declarado à vontade no(s) esporte(s) que já disputou — reabrindo, pra quem já tem histórico, a MESMA porta de sandbagging que a janela existe para fechar. Marcar `levelLocked` retroativo para os esportes já inscritos exige rodar um script admin avulso — não construído nesta rodada; decisão de fazer (e quando) fica com o dono.
  - **Custo operacional do backfill, se rodado**: cada atleta recém-travado custa 1 write extra em `users/{uid}` (`set({sportOnboarding: {levelLocked: {...}}}, {merge: true})`), que dispara os MESMOS 4 triggers de qualquer escrita nesse doc — `onUserWrittenSyncPublicProfile` (public-profile-sync.ts), `onUserProfileUpdatedSyncGamification` (profile-completion-gamification.ts), `onUserWrittenTrackLevelChanges` (rating-triggers.ts) e `onUserSearchKeywordsSync` (search-keywords-sync.ts). Bounded: no máximo 1 write por atleta por esporte (`lockLevelForUid` é idempotente — só escreve se ainda não travado), mas numa base grande isso é N atletas × M esportes já disputados de uma vez, cada write fanning out pras 4 triggers — rodar o backfill em lotes, não tudo de uma vez.
- Ainda em aberto do plano anterior: inspecionar os docs `ratingLadders/{sportCode}` antes de rodar `migrateAthleteRatingLevelRanks` (ver seção "Escada única" acima) — um doc com `levels` sobrescreve a escada padrão e a migração recalcularia contra a ladder antiga.

## Elegibilidade de categoria (o que o nível decide)
- Atleta precisa caber na **faixa**: `minLevel <= nível <= level`. `categories[].level` é o **teto** (label; ausente = Open) e `categories[].minLevel` é o **piso** (label; ausente = sem piso). Categoria sem piso não tem limite mínimo; sem teto = Open (rank 6).
- Numa dupla: o **piso** é validado pelo integrante **mais fraco** (rank mínimo); o **teto**, pelo mais forte (rank máximo) — regra completa e exemplo trabalhado na seção [Faixa de nível (minLevel)](#faixa-de-nível-minlevel) abaixo.
- Categoria sem nível definido (ou "Open") aceita qualquer nível. `categories[].level` guarda o **label** ("Iniciante 1") — formato mantido por retrocompatibilidade; os normalizadores aceitam label e código.
- Mapeamento esporte do torneio → esporte do perfil: `beachVolleyball`→`VOLEI_PRAIA`, `indoorVolleyball`→`VOLEI_QUADRA`, `footvolley`→`FUTEVOLEI`, `beachTennis`→`BEACH_TENNIS`; sem equivalente → nível global legado.

## Faixa de nível (minLevel)
- `categories[].level` é o **teto** (label; ausente = Open) e `categories[].minLevel` é o **piso** (label; ausente = sem piso).
- Regra: `minRank <= min(ranks) && max(ranks) <= categoryRank`, onde `minRank` e `categoryRank` são os ranks normalizados de `minLevel` e `level`.
- Numa dupla: o **piso** é validado pelo integrante **mais fraco** (rank mínimo); o **teto**, pelo mais forte (rank máximo).
- Exemplo: categoria "Intermediário 1 a Avançado 1" tem `level="Avançado 1"` (rank 4) e `minLevel="Intermediário 1"` (rank 2). Uma dupla (Intermediário 2, Avançado 1) entra: min(3,4)=3 ≥ 2 ✓ e max(3,4)=4 ≤ 4 ✓. Dupla (Iniciante 2, Avançado 1) não: min(1,4)=1 < 2 ✗.

## Rating automático (escada Glicko-2)
- Um rating por atleta **por esporte**. Esportes rateados no v1: só `VOLEI_PRAIA` e `VOLEI_QUADRA` (`RATED_SPORT_CODES` em `functions/src/rating-config.ts`) — ter nível declarado NÃO significa ter rating: beach tennis e futevôlei têm nível declarado, sem escada de rating ainda (a engine tem gate explícito por `RATED_SPORT_CODES`).
- **7 degraus com régua de rating**:
  - Iniciante 1: rating inicial 1250, promove ≥1420
  - Iniciante 2: rating inicial 1450, promove ≥1570, rebaixa ≤1350
  - Intermediário 1: rating inicial 1600, promove ≥1720, rebaixa ≤1500
  - Intermediário 2: rating inicial 1750, promove ≥1870, rebaixa ≤1650
  - Avançado 1 (novo): rating ~1900, promove ≥2020, rebaixa ≤1800
  - Avançado 2 (novo): rating ~2050, promove ≥2170, rebaixa ≤1950
  - Open (novo): rating ~2200, rebaixa ≤2100 (topo)
  - *Régua dos degraus novos (Avançado 1/2/Open) é estimativa sem histórico; ajustar via `ratingLadders/VOLEI_PRAIA`.*
- Toda partida concluída (exceto W.O.) atualiza o rating. Só decide promover/rebaixar com ≥10 partidas rateadas e RD baixo. Promoção: 120 dias de proteção. Rebaixamento: 90 dias de observação (≥6 partidas no período). Inatividade nunca rebaixa sozinha.
- Promoção/rebaixamento efetivos escrevem SÓ `sportOnboarding.levelsBySport.{sportCode}` + auditoria em `users/{uid}/levelHistory`.
- Flags de rollout em `ratingLadders/{esporte}` no Firestore (editável sem deploy) — checar o doc de config para saber o estado vigente em produção.

## Nível declarado × rating automático
- Subida manual dispara `onUserWrittenTrackLevelChanges` (observa só `sportOnboarding.levelsBySport`), que realinha o rating do esporte (nunca abaixo do inicial do novo degrau) com proteção de 120 dias.
- Toda mudança de nível fica em `users/{uid}/levelHistory` com o motivo (`reason`): subida manual (`self_upgrade`), descida dentro da janela de correção (`self_correction`), promoção/rebaixamento automáticos da engine (`promotion`/`relegation`), ajuste manual do backoffice (`admin_manual`), promoção pelo organizador (`organizer_promotion`), e o backfill de migração (`migration`).

## Migração/backfill (`migrateAthleteLevels`, super admin)
- Normaliza TODO valor presente em `levelsBySport` (qualquer esporte, qualquer formato legado) pro código canônico do MESMO rank (rank-neutro — não dispara self-upgrade).
- Semeia entradas ausentes dos esportes inscritos: principal ← `level` global normalizado (senão `sportProfile.level`, senão `iniciante_1`); secundários ← `iniciante_1` (o global NÃO propaga pra secundários).
- Campos legados ficam intocados no doc. Idempotente; paginado (`startAfterId` até `done`); `dryRun` só conta. Obs.: seed de esporte rateado com rank > 0 dispara o re-seed de rating do trigger de self-upgrade — esperado e inofensivo (par de entradas `migration`+`self_upgrade` no levelHistory).

## O que o atleta vê
- App, "Esportes e níveis": nível atual por esporte (7 chips, um por degrau de nível); níveis abaixo do salvo bloqueados, exceto durante a janela de correção daquele esporte; subir pede confirmação. Barras de nível têm 7 segmentos (um por degrau).
- Portal web do atleta, `/perfil/esportes`: paridade — ver/subir nível por esporte (mesma exceção da janela) e adicionar esporte, escolhendo o nível explicitamente (sem default — ver "Escolha obrigatória" em Calibração de nível).
- Card de "zona" da engine (só esportes rateados com dado suficiente): estável, zona de acesso, zona de reclassificação, ou "consolidando".

## Regras
- Nível nunca desce por ação do próprio atleta — exceto dentro da janela de correção por esporte, antes da 1ª inscrição ativa naquele esporte (`levelLocked`, ver Calibração de nível acima).
- Cancelar inscrição nunca destrava um esporte já travado — o lock só é gravado, nunca desfeito.
- Elegibilidade de categoria: o **piso** (minLevel) é validado pelo integrante mais fraco (rank mínimo); o **teto** (level) pelo mais forte (rank máximo).
- Nível e rating são sempre por esporte — não existe um valor único cruzando esportes (o `level` global é legado, só fallback de leitura).
- A escada é uma só (7 níveis) para todos os esportes; rating automático só nos esportes de `RATED_SPORT_CODES`.
