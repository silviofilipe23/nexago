# Pontuação do modo Livre pela força real do campo

**Data:** 2026-09-10
**Branch:** `claude/tournament-scoring-calculation-81d516`
**Origem:** o dono relatou que `DESAFIO OPEN - JHON JHON` "tinha muita gente boa
mas a pontuação ficou pequena".

## 1. Problema

O preset `livre` (faixa 0–6) pesa **0.125** em `functions/src/category-presets.ts`
— o mesmo peso do Iniciante, 8× menos que o Open. O peso foi escolhido pelo
**piso declarado** da faixa, assumindo o pior campo possível.

Medição no DEV (`volley-track-dev-4596c`), torneio `KuKKDJ6LX62wOaUv7HWD`:

- Categoria única `level: "Open"`, `minLevel: "Iniciante 1"` → faixa 0–6 → preset `livre`.
- `rankingEnabled: true`, sem `leagueId`, `rankingWeight` ausente (→ 1).
- 10 duplas pagas (≥ 8, logo `bracketSizeFactor` = 1).
- Conta que rodou: `1000 × 0.125 × 1 × 1` = **125** para o campeão.

O campo **não era fraco**. Todos os 20 atletas têm rating e degrau:

| Composição da dupla | Rating médio | Colocação | Pontos |
|---|---|---|---|
| intermediário 1 + **open** | 2288 | 1º | 125 |
| **avançado 1 + open** | 2124 | 2º | 100 |
| intermediário 1 + intermediário 2 | 1816 | 3º | 75 |
| intermediário 1 + **open** | 1910 | 4º | 63 |

5 das 10 duplas tinham um Open; o campeão foi a dupla de maior rating do torneio.
Distribuição de degraus individuais: `{0:1, 2:10, 3:3, 4:1, 6:5}`.

Dois agravantes descobertos na investigação:

1. **`livre` é o preset padrão** — categoria nova nasce Livre nas duas superfícies.
   Todo organizador que não mexe nos chips de nível cria uma categoria pagando 1/8.
   No DEV, 100% do histórico pontuado é `livre` ou legado: não existe uma única
   categoria de faixa fechada.
2. **`livre` é o único preset sem participação.** `tournament-ranking.ts:436`
   exclui o balde `groups`. Em `5° BOLO DE CENOURA`: 34 duplas pagas, 16 com
   resultado — **18 duplas pagaram e saíram com zero**.

## 2. Decisões

Todas tomadas pelo dono nesta sessão.

| # | Decisão | Escolha |
|---|---|---|
| D1 | Alvo | Peso do Livre medido pela **força real do campo**, não pela faixa declarada |
| D2 | Medida | **Média do degrau da dupla**, onde a dupla vale o integrante mais forte |
| D3 | Teto | **1.0 (Open)** — Livre nunca alcança Elite (1.2) |
| D4 | Participação | **Volta a pagar**, como todos os outros presets |
| D5 | Retroativo | **Recalcular e completar** — reescrever os existentes e criar os faltantes |
| D6 | Abordagem | **Carimbar na geração da chave** (contra a recomendação de medir na premiação) |
| D7 | Arredondamento | `Math.round` do degrau médio |
| D8 | Tamanho da chave | `bracketSizeFactor` **não** congela — segue contando pagas a cada premiação |

D2 reusa a convenção que a plataforma já aplica na elegibilidade
(`category-level-eligibility.ts`: *"Para duplas, vale o atleta de MAIOR nível"*).

D6 foi escolhido apesar do risco de estado derivado envelhecer. O risco é menor do
que parecia: a substituição de atleta já é bloqueada a partir de
`categoryOps[cat].bracketStatus`, então o elenco congela no mesmo instante do
carimbo. O que ainda pode mudar depois é confirmação de pagamento tardia e estorno
— e por D8 essas mudanças continuam afetando `bracketSizeFactor`, só não a força.

## 3. A medida (módulo puro)

Arquivo novo `functions/src/category-field-strength.ts`, sem I/O:

```ts
/** Degrau da dupla = integrante mais forte. null se nenhum é conhecido. */
teamLevelRank(memberRanks: Array<number | null>): number | null

/** Degrau do campo = média das duplas mensuráveis. null se nenhuma é. */
fieldStrengthRank(teamRanks: Array<number | null>): number | null

/** Degrau → peso, ancorado na escada de presets fechados. */
weightFromRank(rank: number): number
```

`weightFromRank` usa `Math.round(rank)` (D7) e a tabela:

| Degrau arredondado | Faixa equivalente | Peso |
|---|---|---|
| 0–1 | Iniciante | 0.125 |
| 2–3 | Intermediário | 0.25 |
| 4–5 | Avançado | 0.5 |
| 6 | Open | 1.0 |

Clamp final em `[0.125, 1.0]` (D3).

**Fallbacks:**
- Dupla sem nenhum degrau conhecido não entra na média.
- Nenhuma dupla mensurável → peso declarado do preset (0.125), sem carimbo útil.

**Fonte do degrau:** `athleteRatings/{uid}_{SPORT_CODE}.levelRank`, o mesmo
número que o fluxo de nível mantém em sincronia com
`users/{uid}.sportOnboarding.levelsBySport`. Escolhido sobre o doc de usuário por
ser carregável em lote (`getAll` por id) e já vir com o rank calculado. Atleta sem
doc de rating para o esporte conta como degrau desconhecido.

**Escopo:** aplica-se **somente** ao preset `livre`. Os demais presets e as
categorias legadas (`LEGACY_CATEGORY_WEIGHT`) seguem exatamente como hoje.

Verificação no caso de origem: degraus das duplas `6,6,6,6,6,3,3,2,2,2` → média
**4.2** → `round` 4 → peso **0.5** → campeão **500** (era 125).

## 4. O carimbo

Coleção nova: `artifacts/{appId}/public/data/tournamentCategoryFieldStrength`,
doc id `{tournamentId}_{categoryId}`.

```
tournamentId, categoryId, presetKey,
fieldRank: number,        // média não arredondada, para auditoria
weight: number,           // já arredondado e clampado
measuredTeams: number,    // duplas que entraram na média
totalPaidTeams: number,   // duplas pagas no carimbo — AUDITORIA apenas (ver D8)
source: "bracket" | "lazy" | "backfill",
stampedAt: Timestamp
```

**Campo imensurável não é carimbado.** Se `measuredTeams` seria 0 (nenhum atleta
com degrau conhecido), o carimbo **não** é gravado: a premiação cai no peso
declarado (0.125) e o caminho preguiçoso tenta medir de novo a cada partida, já que
os atletas podem declarar nível depois. Carimbar um zero congelaria o pior caso
para sempre.

**Escrita:** em `runGenerateCategoryBracket`
(`functions/src/organizer-category-ops.ts`), no **mesmo batch** que publica a
chave — atômico com ela. Regenerar a chave re-carimba.

**Regras** (`firestore.rules`), no regime da família de ranking:

```
match /artifacts/{appId}/public/data/tournamentCategoryFieldStrength/{stampId} {
  allow read: if true;
  allow create, update, delete: if request.auth != null && isAdmin();
}
```

O organizador não alcança o carimbo — o peso continua à prova de adulteração no
cliente, princípio que o cabeçalho de `tournament-ranking.ts` já defende.

## 5. O consumo

Em `tryAwardGlobalRankingForMatch`:

1. Se `preset?.key !== "livre"`, nada muda — `presetWeight` segue vindo de
   `categoryPreset(category)`.
2. Se for `livre`, lê o carimbo (1 doc) e usa `stamp.weight` como `presetWeight`.
3. **Fallback preguiçoso:** sem carimbo (chave publicada antes do deploy), mede na
   hora — `participantUids` já vêm no snapshot que `loadPaidTeamIds` busca, e os
   degraus saem de um `getAll` dos docs `athleteRatings/{uid}_{SPORT_CODE}` —
   e grava o carimbo com `source: "lazy"`. Elimina o buraco dos torneios em curso
   sem exigir migração prévia ao deploy.
4. Cai a exceção `preset?.key !== "livre"` da linha 436 (D4): o Livre volta a
   conceder o balde `groups`, já multiplicado pelo peso medido.

`loadPaidTeamIds` ganha uma variante que devolve também os `participantUids` por
time, a partir do mesmo snapshot — **sem leitura nova**.

O esporte sai de `tournamentSportToLevelSportCode(tournament.sport)`, o mesmo
resolvedor que a elegibilidade usa.

## 6. Retroativo

**Paridade:** a matemática de `category-field-strength.ts` é espelhada em
`functions/scripts/lib/ranking-recompute.js` (cópia literal, script standalone
sem import do bundle) e travada por teste de paridade — o padrão que
`bracket-placement-tiers` já estabeleceu no repo.

`functions/scripts/recompute-ranking-weights.js` passa a, para categorias `livre`:

1. Carregar inscrições pagas + degraus dos atletas, calcular a força e carimbar
   com `source: "backfill"`.
2. Reescrever os resultados existentes com o peso medido.
3. **Criar** os resultados de participação que nunca existiram — duplas pagas sem
   doc de resultado e fora do mata-mata (18 no `5° BOLO DE CENOURA`). Exige portar
   o equivalente de `loadKnockoutTeamIds` para o script.

O passo 3 é novo em natureza: até aqui o script só reescrevia. Ele deixa de ser
puramente convergente por reescrita e passa a ter um lado criador — a
idempotência vem de checar a existência do doc antes de criar.

**Ordem obrigatória, preservada:** `rederive-knockout-placements.js` **antes** de
`recompute-ranking-weights.js`, senão quem caiu nos grupos é promovido a oitavas.

**PROD:** entra atrás de duas migrações ainda pendentes lá — o ×10
(`backfill-ranking-scale-x10.js`) e a repesagem de 19/08. A ordem DEV → PROD e
deploy → script continua obrigatória.

## 7. Testes

- **Unitários puros** de `category-field-strength.ts`: max da dupla, média do
  campo, tabela de degraus, `Math.round` na fronteira (5.5 → 6), clamp nos dois
  extremos, dupla sem degrau, campo inteiro sem degrau.
- **Fluxo** em `tournament-ranking.test.ts` com o `seededDb({paidTeams})` que já
  existe: Livre com carimbo, Livre sem carimbo (caminho preguiçoso), preset
  fechado inalterado, participação concedida ao Livre.
- **Paridade** TS ↔ JS da matemática nova.
- **Regressão do caso de origem:** fixture com os degraus reais do Jhon Jhon
  (`6,6,6,6,6,3,3,2,2,2`) exigindo campeão = 500.

## 8. Fora de escopo

- Superfície: nenhuma tela passa a exibir o peso medido. Se o organizador quiser
  ver a força da categoria, é spec própria.
- Os demais presets e as categorias legadas seguem com peso declarado.
- Rating Glicko não é usado como sinal — a medida é por degrau declarado.
- Ranking de liga (`league-ranking.ts`) não é tocado: a mudança é só do geral.
