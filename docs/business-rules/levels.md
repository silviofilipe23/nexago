# Nível

## Conceito
"Nível" é diferente de [ranking](ranking.md): não é sobre colocação em torneios, é sobre a **força do atleta**, usada para decidir em quais categorias ele pode se inscrever (anti-sandbagging). Existem duas camadas, hoje coexistindo:

- **Nível declarado** — escolhido pelo próprio atleta (app ou portal web), só pode subir. É o que vale hoje para elegibilidade de categoria.
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

**Ranks 0–6 contíguos desde 15/08/2026.** A renumeração ÚNICA (`open` 5→6) foi feita em 15/08/2026 com a base vazia, antes do primeiro torneio operado. A partir daí, a numeração é fixa — **nunca renumerar**. Valores legados são aceitos só em LEITURA, aliasados ao degrau inferior do split: `iniciante`/`basico`→0, `intermediario`→2, `livre`/`Open / federado`→6. Migração: `migrateAthleteRatingLevelRanks` recalcula `athleteRatings.levelRank` pelo CÓDIGO.

**Precondição do dry-run:** antes de rodar `migrateAthleteRatingLevelRanks` (dry-run ou real), inspecionar os docs `ratingLadders/{sportCode}` no Firestore. Um doc com array `levels` SOBRESCREVE a escada padrão de 7 degraus deployada — a migração recalcularia `levelRank` contra a ladder ANTIGA gravada no doc, não contra a escada nova. Atualizar ou remover esses docs antes de rodar a migração.

## Onde o nível é guardado (fonte única)
- **Única escrita**: `users/{uid}.sportOnboarding.levelsBySport.{SPORT_CODE} = <código>`. É onde escrevem o app, o portal web do atleta, a engine de rating (promoção/rebaixamento) e o backfill de migração. Default de esporte recém-adicionado: `iniciante_1`.
- **Sport codes (9)**: `VOLEI_PRAIA`, `VOLEI_QUADRA`, `BEACH_TENNIS`, `FUTEVOLEI`, `FUTEBOL`, `BASQUETE`, `TENIS`, `CORRIDA`, `OUTROS`. Futevôlei virou esporte próprio do perfil (antes era alias de Futebol); torneios de `footvolley` usam o nível `FUTEVOLEI`.
- **Campos legados, só leitura** (não são mais escritos por código novo): `level` (label global), `nivel`, `sportProfile.level` (código), `levelsBySportFirestore` (campo fantasma — nunca foi escrito; os fallbacks de leitura no backend foram removidos), `discoverLevelLabel` (nunca lido; escrita removida).
- **Cadeia canônica de leitura**: `levelsBySport[sportCode]` → `level` global legado → (só exibição: `nivel` → `sportProfile.level`) → ausente. Ausente resolve para: rank 0 (permissivo) em elegibilidade; "sem nível" em exibição; `null` em filtros de ranking.
- **Vocabulário compartilhado**: `functions/src/category-level-eligibility.ts` (autoritativo, exporta `LEVEL_CODES`/`ATHLETE_SPORT_CODES`), `AthleteProfileOptions` no app, `@nexago/levels` (`frontend/shared/levels`) nos portais web.

## Nível declarado — regra "só sobe"
- O atleta pode subir de nível a qualquer momento, com confirmação explícita ("o nível só pode subir; para reduzir, fale com o suporte").
- Nunca pode descer sozinho — downgrade é operação de suporte/super admin.
- Aplicado em 3 camadas: UI (app "Esportes e níveis" e portal web `/perfil/esportes` bloqueiam visualmente os níveis abaixo do salvo), lógica do cliente, e as rules do Firestore (`athleteLevelsNotDowngraded`) — que recusam o update inteiro do doc se qualquer nível regredir. A guarda das rules cobre **os 9 esportes** + os campos legados `level`/`sportProfile.level` (clientes antigos ainda os escrevem); rewrite de MESMO rank é permitido (app antigo regravando código legado).
- **Por quê**: sem o ratchet, o atleta rebaixava o próprio nível na véspera de uma inscrição pra caber numa categoria mais fácil — furava o anti-sandbagging.

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
- Toda mudança de nível (subida manual `self_upgrade`, promoção/rebaixamento da engine, `migration` do backfill) fica em `users/{uid}/levelHistory` com o motivo.

## Migração/backfill (`migrateAthleteLevels`, super admin)
- Normaliza TODO valor presente em `levelsBySport` (qualquer esporte, qualquer formato legado) pro código canônico do MESMO rank (rank-neutro — não dispara self-upgrade).
- Semeia entradas ausentes dos esportes inscritos: principal ← `level` global normalizado (senão `sportProfile.level`, senão `iniciante_1`); secundários ← `iniciante_1` (o global NÃO propaga pra secundários).
- Campos legados ficam intocados no doc. Idempotente; paginado (`startAfterId` até `done`); `dryRun` só conta. Obs.: seed de esporte rateado com rank > 0 dispara o re-seed de rating do trigger de self-upgrade — esperado e inofensivo (par de entradas `migration`+`self_upgrade` no levelHistory).

## O que o atleta vê
- App, "Esportes e níveis": nível atual por esporte (7 chips, um por degrau de nível); níveis abaixo do salvo bloqueados; subir pede confirmação. Barras de nível têm 7 segmentos (um por degrau).
- Portal web do atleta, `/perfil/esportes`: paridade — ver/subir nível por esporte e adicionar esporte (entra como Iniciante 1).
- Card de "zona" da engine (só esportes rateados com dado suficiente): estável, zona de acesso, zona de reclassificação, ou "consolidando".

## Regras
- Nível nunca desce por ação do próprio atleta.
- Elegibilidade de categoria: o **piso** (minLevel) é validado pelo integrante mais fraco (rank mínimo); o **teto** (level) pelo mais forte (rank máximo).
- Nível e rating são sempre por esporte — não existe um valor único cruzando esportes (o `level` global é legado, só fallback de leitura).
- A escada é uma só (7 níveis) para todos os esportes; rating automático só nos esportes de `RATED_SPORT_CODES`.
