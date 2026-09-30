# Categoria "até um nível" (libera os níveis inferiores)

**Data:** 2026-09-30
**Status:** Aprovado no chat, aguardando revisão da spec escrita

## Contexto

Na criação do torneio, a faixa de nível da categoria é escolhida por 6 presets
fechados (spec emendada de 18/08, `functions/src/category-presets.ts`):

| Preset | Faixa (rank) | Peso no ranking geral |
|---|---|---|
| Iniciante | 0–1 | 0.125 |
| Intermediário | 2–3 | 0.25 |
| Avançado | 4–5 | 0.5 |
| Open | 4–6 | 1.0 |
| Elite | 6–6 | 1.2 |
| Livre | 0–6 | medido pela força do campo, 0.125–1.0 (spec 2026-09-10) |

A categoria grava `minLevel` (piso, label) e `level` (teto, label). O preset
nunca é gravado: ele sai da faixa exata via `presetFromRange`, o que deixa o
peso à prova de adulteração pelo cliente.

O organizador quer escolher **um nível e liberar todos os inferiores**, por
exemplo "até Intermediário 2" (aberta a Iniciante 1, Iniciante 2,
Intermediário 1 e Intermediário 2).

### O que já funciona

A elegibilidade das 3 superfícies (functions, portal do atleta, app) já aplica
`piso ≤ nível ≤ teto`, com a dupla valendo pelo integrante mais forte. Uma
categoria `minLevel: "Iniciante 1"`, `level: "Intermediário 2"` já é gravável
e já barra quem está acima. Não há regra de Firestore sobre `minLevel`.

### O problema escondido

`presetFromRange(0, 3)` não bate com nenhuma linha da tabela, então devolve
`null`, e a premiação cai em `LEGACY_CATEGORY_WEIGHT` (1.0), o peso de Open. Um
campo só de iniciantes numa categoria "até Intermediário 2" pontuaria como Open.
É o farm que os presets vieram fechar ("iniciantes se inscrevem no Open só
pelos pontos").

## Decisões

- **D1. Teto em qualquer um dos 7 níveis.** O organizador escolhe X entre
  Iniciante 1, Iniciante 2, Intermediário 1, Intermediário 2, Avançado 1,
  Avançado 2 e Open. A faixa gravada é `Iniciante 1 → X`.
- **D2. Sem campo novo.** "Até X" é a faixa com piso rank 0 que não bate com
  nenhum preset fechado. A categoria é derivada da faixa, como todo o resto.
  Descartados: gravar `levelMode: 'upTo'` (contraria "preset nunca gravado" e
  obrigaria as 3 superfícies de elegibilidade a ler um campo novo) e 5 linhas
  fixas novas na tabela (mesmo efeito, multiplicado em 4 espelhos).
- **D3. Peso medido, com teto na família de X.** Mesma regra do Livre: o peso
  vem da força real das duplas pagas, com piso 0.125 e teto igual ao peso da
  família de X. O Livre vira o caso particular "até Open", e o peso dele não
  muda.
- **D4. Coincidências com presets existentes.** "Até Iniciante 2" (0–1) é o
  preset Iniciante e "até Open" (0–6) é o Livre. Como regra e peso são os
  mesmos, a tabela exata tem precedência e nada muda para essas duas faixas.
- **D5. Escopo de tela:** wizard de torneio no painel web e editor de
  categoria de torneio no app. Liga (web e app) e criação de etapa não mudam.
  O motor da liga ganha só a generalização da trava anti-farm (ver §2.4).
- **D6. Lado do atleta sem mudança.** O selo já mostra
  "Iniciante 1 – Intermediário 2" (`categoryLevelRangeLabel` no portal e
  `_levelRangeLabel` no app) e a elegibilidade já barra quem está acima.

## 1. Regra

| Teto X | Faixa | Preset derivado | Peso |
|---|---|---|---|
| Iniciante 1 | 0–0 | `ate` | medido, teto 0.125 (na prática, sempre 0.125) |
| Iniciante 2 | 0–1 | `iniciante` (tabela) | 0.125, sem mudança |
| Intermediário 1 | 0–2 | `ate` | medido, 0.125–0.25 |
| Intermediário 2 | 0–3 | `ate` | medido, 0.125–0.25 |
| Avançado 1 | 0–4 | `ate` | medido, 0.125–0.5 |
| Avançado 2 | 0–5 | `ate` | medido, 0.125–0.5 |
| Open | 0–6 | `livre` (tabela) | medido, 0.125–1.0, sem mudança |

O teto de peso de X é `weightFromRank(X)` (0–1 → 0.125, 2–3 → 0.25,
4–5 → 0.5, 6 → 1), a mesma escada que o Livre já usa para converter degrau
médio em peso. O Livre nunca alcança o Elite (1.2), e o "até X" também não.

Como a elegibilidade barra quem está acima de X, a média do campo tende a
ficar abaixo do teto sozinha. O teto é uma guarda para dois casos: a medição
usa `athleteRatings.levelRank` e a elegibilidade usa
`sportOnboarding.levelsBySport`, que podem divergir; e o `levelRank` só sobe,
então um atleta promovido depois da inscrição pode puxar a média para cima.

## 2. Backend (functions)

### 2.1 `category-presets.ts`

- `CategoryPresetKey` ganha `"ate"`.
- `CategoryPreset` ganha:
  - `measured: boolean`: o peso vem da força do campo (`true` no `livre` e no
    `ate`, `false` nos fechados);
  - `maxWeight: number`: o teto do peso medido (`1` no `livre`; igual a
    `weight` nos fechados, onde não é usado).
- `presetFromRange(minRank, maxRank)`:
  1. `minRank == null` → `null` (legado; sem mudança);
  2. linha exata da tabela → essa linha (sem mudança);
  3. `minRank === 0` → preset sintetizado
     `{key: "ate", label: "Até <label de X>", minRank: 0, maxRank: X,
     weight: 0.125, measured: true, maxWeight: weightFromRank(X)}`;
  4. qualquer outra faixa → `null` (legado; sem mudança).
- O label de X vem de `levelLabelForRank` (`category-level-eligibility.ts`).
- `weightFromRank` hoje mora em `category-field-strength.ts`. A dependência
  passa a ser presets → field-strength, sem ciclo, porque field-strength não
  importa presets.

### 2.2 `category-field-strength.ts`

- `weightFromRank(rank, maxWeight = LIVRE_MAX_WEIGHT)`: clamp em
  `[LIVRE_MIN_WEIGHT, maxWeight]`.
- `fieldStrengthFromTeamRanks(teamRanks, maxWeight = LIVRE_MAX_WEIGHT)`
  repassa o teto.
- Os defaults preservam todas as chamadas atuais do Livre.

### 2.3 `category-field-strength-store.ts`

- `measureFieldStrength` recebe `maxWeight` e repassa para
  `fieldStrengthFromTeamRanks`. O carimbo gravado já sai com o peso clampado.
- Entra `measureCategoryFieldStrength`: recebe o doc da categoria, deriva o
  preset e devolve `null` quando o peso não é medido. A publicação da chave
  passa a chamar só ela, o que tira a decisão "mede ou não" da fiação e a põe
  numa função testável.
- `presetKey` do carimbo passa a ser `"ate"` nessas categorias. Continua sendo
  só metadado de auditoria.

### 2.4 Chamadores (`key === "livre"` → `measured`)

- `tournament-ranking.ts`: `resolveLivreWeight` vira `resolveMeasuredWeight`,
  com `presetKey` e `maxWeight` vindos do preset. O clamp na leitura do carimbo
  usa `[LIVRE_MIN_WEIGHT, preset.maxWeight]`. A condição passa a ser
  `preset?.measured`.
- `organizer-category-ops.ts` (carimbo na publicação da chave): mesma troca de
  condição, com `maxWeight` repassado.
- `league-ranking.ts`: a trava de participação `preset?.key !== "livre"` vira
  `!preset?.measured`. Hoje nenhuma tela cria "até X" em etapa de liga, mas se
  uma categoria assim chegar lá por edição, ela herda a trava anti-farm do Livre
  em vez de pagar participação com peso declarado. O comentário "Não corrigir"
  continua valendo.

### 2.5 Script de histórico (`functions/scripts/`)

O `recompute-ranking-weights.js` roda com PROD ainda pendente e tem cópia
própria da tabela. Sem espelho, uma reexecução aplicaria peso 1.0 às
categorias "até X" e sobrescreveria os pontos certos.

- `lib/ranking-recompute.js`:
  - `presetWeightForCategory` passa a devolver também `measured` e `maxWeight`.
    Com `minRank === 0` e sem linha exata, devolve
    `{weight: 0.125, presetKey: "ate", inferred: false, measured: true, maxWeight: weightFromRank(maxRank)}`;
  - `weightFromRank` e `fieldStrengthFromTeamRanks` recebem o teto, e entra
    `clampMeasuredWeight` (espelho do §2.2);
  - Livre ganha `measured: true, maxWeight: 1`.
- `recompute-ranking-weights.js`: duas checagens `presetKey === "livre"` passam
  a ser `measured`: a resolução do peso (carimbo → medição → declarado, com
  clamp e medição usando o `maxWeight` da categoria) e o relatório. A função
  `measureLivreFieldStrength` vira `measureCategoryFieldStrength`.
- A passada retroativa `criarParticipacaoFaltanteDoLivre` **continua só no
  Livre**. Ela existe para recriar a participação que a antiga exceção do Livre
  nunca gravou, e uma categoria "até X" nunca passou por essa exceção.
- `rederive-knockout-placements.js` não muda. Ele grava os pontos com
  `peso.weight` (o declarado, 0.125), exatamente como já faz com o Livre. Quem
  aplica o peso medido é o `recompute-ranking-weights.js`, que roda depois
  dele na ordem obrigatória.

## 3. Painel web (`frontend/projects/organizer`)

### 3.1 `tournament-create.model.ts`

- `categoryUpToLevel(c): SkillLevel | null` devolve X quando
  `c.minSkillLevel === 'iniciante1'` e a faixa não bate com nenhum
  `CATEGORY_LEVEL_PRESETS`. Nos demais casos devolve `null`.
- `suggestCategoryName` e `categoryTags`: quando `categoryUpToLevel` devolve X,
  a parte de nível é `até <X>` ("Masculino até Intermediário 2"). As demais
  faixas mantêm o comportamento atual.

### 3.2 `criar-torneio.component.ts`

```
FAIXA DE NÍVEL
[Iniciante] [Intermediário] [Avançado] [Open] [Elite] [Livre] [Até um nível]

  (só com "Até um nível" ativo)
  ATÉ O NÍVEL
  [Iniciante 1] [Iniciante 2] [Intermediário 1] [Intermediário 2] [Avançado 1] [Avançado 2] [Open]
  Libera de Iniciante 1 até Intermediário 2. Quem está acima não se inscreve.
```

- Estado local `levelUpToMode`. Ele nasce ativo quando `categoryUpToLevel(cat())`
  não é `null` e é reavaliado ao trocar de categoria. Sem esse estado, escolher
  Iniciante 2 ou Open na segunda linha faria o chip pular para Iniciante ou
  Livre no meio da edição.
- Tocar em "Até um nível" ativa o modo, grava `minSkillLevel: 'iniciante1'` e
  mantém o teto atual.
- Tocar num nível da segunda linha grava `skillLevel: X` e
  `minSkillLevel: 'iniciante1'`.
- Tocar num preset desativa o modo (comportamento atual).
- Dica sob a segunda linha: "Libera de Iniciante 1 até <X>. Quem está acima não
  se inscreve." Com X = Iniciante 2 ou Open, a dica acrescenta "Mesma regra do
  preset Iniciante" ou "Mesma regra do Livre".
- O aviso "Faixa personalizada (legado)" só aparece quando não há preset e
  também não há "até X".
- O mapper não muda: já grava `minLevel` e `level` como labels.

## 4. App (`nexago_app`)

### 4.1 `tournament_create_logic.dart`

- `categoryLevelUpToCeiling(draft): TournamentSkillLevel?`, espelho do
  `categoryUpToLevel` web (`minLevel == 'Iniciante 1'` e
  `activeCategoryLevelPreset(draft) == null`).
- `_categoryLevelNamePart`: com teto "até", devolve `até <label>`.
- `activeCategoryLevelPreset` **não muda**. O editor de liga
  (`league_category_editor_sheet.dart`) também a consome.

### 4.2 `tournament_category_editor_sheet.dart`

- Mesmo desenho do §3.2. O chip "Até um nível" entra ao fim do
  `OrganizerChipSelector` de presets. A segunda linha é outro
  `OrganizerChipSelector` com rolagem horizontal. A dica usa `bodySmall` e
  `onSurfaceMuted`, como o aviso de legado.
- Estado local `_levelUpToMode`, inicializado a partir de
  `categoryLevelUpToCeiling(_category)`.
- O aviso de legado segue a mesma condição do web.

## 5. Retrocompatibilidade

- Livre, presets fechados e categorias legadas (sem `minLevel`): peso,
  elegibilidade e nome idênticos.
- Único efeito retroativo: uma categoria já gravada com piso `Iniciante 1` e
  teto Iniciante 1, Intermediário 1/2 ou Avançado 1/2. Ela só pode vir da época
  do "Personalizado", removido em 18/08. O peso dessa categoria cai de 1.0 para
  o medido nas próximas premiações e numa reexecução do script. **Antes do
  deploy:** contar essas categorias no dev (o dry-run do
  `recompute-ranking-weights.js` as lista) e reportar.
- App antigo (sem esta versão) ao abrir uma categoria "até X": mostra o aviso
  "Faixa personalizada (legado)" e preserva a faixa (passthrough existente).
  Nada se perde.

## 6. Testes

- **functions:**
  - `category-presets.test.ts`: as 7 linhas da tabela do §1, legado
    (`minRank == null`) e faixa sem piso 0 fora da tabela continuam `null`;
  - `category-field-strength.test.ts`: clamp com `maxWeight`;
  - premiação: categoria "até Intermediário 2" com campo forte fica em 0.25, e
    com campo fraco fica em 0.125;
  - `organizer-category-ops.field-strength.test.ts`: carimbo na publicação da
    chave com `presetKey: "ate"` e peso clampado;
  - liga: "até X" sem bucket de participação.
- **script:** `test/ranking-recompute.test.mjs` cobre `presetWeightForCategory`
  para `ate` e a paridade do teto.
- **web:** spec do model (detecção, nome, tags) e spec do componente (ativar
  modo, trocar teto, voltar a preset, modo não pula com Iniciante 2/Open).
- **app:** `tournament_create_logic_test.dart` (ceiling e nome) e widget test
  do editor (chips e gravação da faixa).
- Conferência visual no browser pane (web) e golden/captura do editor (app).

## 7. Rollout

1. Functions primeiro, para o motor e o carimbo entenderem "até X" antes de
   qualquer categoria ser criada. Deploy a partir da main atualizada: deploy de
   branch atrasada reverte o que já está na main.
2. Portal do organizador.
3. Release do app.

## Fora de escopo

- Tela de liga (web e app) e criação de etapa de liga.
- Mudar o selo do atleta para "Até X" (o texto atual já é correto).
- Corrigir a divergência de nome já existente no web, que não consulta a
  tabela de presets para Iniciante, Intermediário e Elite.
