# Nivelamento de atletas — escada de 7 degraus e faixa de nível na categoria

Data: 2026-08-15
Esporte-alvo do v1: vôlei de praia (`VOLEI_PRAIA`)

## 1. Problema

Relato do dono (2026-08-15):

- Muitos atletas ficam "entre" o Intermediário e o Open — não existe degrau que os
  acomode.
- Torneios Open quase não acontecem: há **menos de 16 atletas de nível Open reais**
  na base/região, o que não fecha nem uma chave de 8 duplas.
- Os atletas de alto nível estão insatisfeitos por "não conseguirem e não poderem
  jogar" — não há torneio no nível deles, e a regra anti-sandbagging os proíbe de
  disputar categorias abaixo.
- Muitos atletas declarados Intermediário têm habilidade baixa, o que torna a
  categoria heterogênea demais.

Contexto crítico: **o sistema está no início e o primeiro torneio será operado em
2026-08-16**. Não existe base legada relevante. As decisões abaixo são preventivas,
e o custo de aplicá-las agora é próximo de zero.

## 2. Diagnóstico

Quatro falhas independentes que se reforçam.

### 2.1 A categoria só tem teto, nunca piso

`isTeamEligible` em `functions/src/category-level-eligibility.ts` é
`categoryRank >= rank` para todos os integrantes. Consequências não intencionais:

- A categoria "Intermediário" (rank 2) **aceita rank 0 e 1** — os "intermediários com
  baixa habilidade" são, em boa parte, iniciantes entrando legalmente.
- A categoria "Open" (rank 5) **aceita do rank 0 ao 5**. Open nunca foi categoria de
  elite no sistema: é categoria *livre* (o legado a chama de `livre`).
- Categoria sem nível definido resolve para `HIGHEST_RANK` e também aceita todos.

Esta é a falha de maior impacto e a que o design resolve primeiro.

### 2.2 O degrau "entre" não tem categoria quando o rótulo é legado

O rótulo legado "Intermediário" normaliza para rank 2. Um atleta `intermediario_2`
(rank 3) é barrado dessa categoria e só pode disputar Open. O wizard do organizador
**já oferece os 5 degraus** (`skillLevelOptionsForSport` em
`frontend/projects/organizer/src/app/painel/data/tournament-create.model.ts`), então
o problema só ocorre em categorias criadas com o rótulo legado.

### 2.3 O topo não se repõe

A engine Glicko-2 calcula rating por atleta a cada partida concluída, mas roda com
`shadowMode: true` e `autoPromotionEnabled: false`
(`DEFAULT_LADDER_CONFIG` em `functions/src/rating-config.ts`; os flags vigentes moram
em `ratingLadders/{sportCode}` no Firestore). Ninguém é promovido por desempenho.

Ressalva de curto prazo: a engine só decide com `minRatedMatches: 10` e RD baixo. Com
a base começando agora, **ligar a promoção automática não produz efeito nenhum nos
próximos meses**. Não é solução de curto prazo, e por isso ficou fora do escopo deste
spec.

### 2.4 Ninguém declara nível

Atleta sem nível resolve para rank 0 (`resolveAthleteLevelRank`), e o default de
esporte recém-adicionado também é `iniciante_1` = rank 0. Numa base nova, isso
significa que **qualquer atleta passa em qualquer categoria**. O anti-sandbagging
está deployado e correto, mas não tem em que morder.

## 3. Decisões tomadas

Todas do dono, em 2026-08-15:

| # | Decisão |
|---|---|
| D1 | **Atleta nunca joga abaixo do próprio nível.** Restrição dura; nenhuma válvula de escape (dupla equilibrada por soma, handicap, jogar fora do ranking) foi aceita. |
| D2 | Foco do v1 é **vôlei de praia**. |
| D3 | **Só promoção automática**, nunca rebaixamento automático — a regra "nível só sobe" permanece verdadeira. (Fora do escopo deste spec por falta de volume; registrada para não ser contrariada.) |
| D4 | Criar o degrau **Avançado com dois níveis**, entre Intermediário e Open. |
| D5 | **Categorias agrupam dois degraus** (Iniciante 0–1, Intermediário 2–3, Avançado 4–5). |
| D6 | A **calibração inicial da base entra neste escopo**. |

## 4. Design

### 4.1 Escada de 7 degraus

| degrau | código | rank atual | rank novo |
|---|---|---|---|
| Iniciante 1 | `iniciante_1` | 0 | 0 |
| Iniciante 2 | `iniciante_2` | 1 | 1 |
| Intermediário 1 | `intermediario_1` | 2 | 2 |
| Intermediário 2 | `intermediario_2` | 3 | 3 |
| Avançado 1 | `avancado_1` | — | **4** |
| Avançado 2 | `avancado_2` | — | **5** |
| Open | `open` | 5 | **6** |

O rank 4 era o único inteiro livre entre 3 e 5, e são necessários dois degraus — logo
`open` precisa subir para 6. `HIGHEST_RANK` passa de 5 para 6.

Aliases legados de leitura permanecem inalterados: `iniciante`/`basico` → 0,
`intermediario` → 2, `livre`/`Open / federado` → o rank de `open` (agora 6).

**Isto contraria a regra documentada "nunca renumerar"** em
`docs/business-rules/levels.md`. A renumeração é aceita **exclusivamente porque a base
está vazia** (ver §6). A regra volta a valer integralmente depois desta mudança, e o
documento deve ser reescrito registrando a nova numeração como fixa.

### 4.2 Faixa de nível na categoria

A categoria ganha `minLevel` (novo, opcional) ao lado do `level` existente. `minLevel`
guarda **label**, pelo mesmo motivo que `level` guarda — retrocompatibilidade do
formato já gravado.

Regra nova de elegibilidade:

```
minRank <= min(ranks da dupla)  &&  max(ranks da dupla) <= categoryRank
```

- O **teto** olha o integrante mais forte — regra de hoje, preservada sem alteração.
- O **piso** olha o integrante mais fraco: ninguém abaixo da faixa entra, nem sendo
  carregado por um parceiro forte.
- `minLevel` ausente resolve para rank 0, que é exatamente o comportamento atual.
  **Nenhuma categoria já criada muda de comportamento**; não há migração de categorias.

O piso é uma restrição *adicional* ao teto. Ele impede o atleta fraco de entrar numa
categoria forte — nunca faz ninguém jogar abaixo do próprio nível. Compatível com D1
por construção.

Mensagens de erro devem distinguir os dois casos: barrado por teto ("seu nível é acima
desta categoria") e barrado por piso ("esta categoria exige nível mínimo X").

**Atleta sem nível declarado resolve para rank 0 e é barrado por qualquer piso maior
que 0.** Isso é intencional — é o que dá dente à calibração de §4.5 — mas tem uma
consequência operacional que precisa ser dita em voz alta: **enquanto a base não
estiver calibrada, uma categoria com piso barra praticamente todo mundo.** O piso só
passa a ser utilizável depois que §4.5 estiver no ar e os atletas tiverem declarado
nível. Até lá, o wizard deve manter o preset Livre (0–6) como padrão e avisar o
organizador ao selecionar um preset com piso quando a base ainda tem baixa cobertura
de nível declarado.

### 4.3 Presets de categoria no wizard do organizador

O organizador escolhe um preset; a faixa é derivada. Continua podendo ajustar
`minLevel`/`level` manualmente em modo avançado.

| Preset | Faixa (min–max) | Quem entra |
|---|---|---|
| Iniciante | 0–1 | Iniciante 1 e 2 |
| Intermediário | 2–3 | Intermediário 1 e 2 |
| Avançado | 4–5 | Avançado 1 e 2 |
| Open | 6–6 | só Open |
| Elite | 4–6 | Avançado 1, Avançado 2 e Open |
| Livre | 0–6 | qualquer atleta |

**Elite** é o preset que resolve o problema imediato: junta os menos de 16 opens com os
avançados numa chave só, sem ninguém jogar abaixo do próprio nível (o avançado joga
acima, sempre permitido).

**Renomear "Open" para "Livre"** no preset 0–6 é obrigatório. Hoje o organizador cria
"Open" acreditando estar criando a categoria de elite e cria a categoria que aceita
todo mundo. O nome atual mente sobre o comportamento.

### 4.4 Régua de rating estendida

Os quatro degraus de baixo permanecem **idênticos** aos atuais; a escada só cresce
para cima, mantendo o espaçamento já existente (150 entre degraus, banda de 120 para
promover e ~100 para rebaixar).

| degrau | initialRating | promoteAt | demoteAt |
|---|---|---|---|
| `iniciante_1` | 1250 | 1420 | — |
| `iniciante_2` | 1450 | 1570 | 1350 |
| `intermediario_1` | 1600 | 1720 | 1500 |
| `intermediario_2` | 1750 | 1870 | 1650 |
| `avancado_1` | 1900 | 2020 | 1800 |
| `avancado_2` | 2050 | 2170 | 1950 |
| `open` | 2200 | — | 2100 |

Estes números são **estimativa sem base histórica** — não há partidas suficientes para
calibrar. São editáveis em produção via `ratingLadders/VOLEI_PRAIA` sem deploy, e devem
ser revisados após os primeiros meses de torneios.

### 4.5 Calibração inicial da base

Sem isto, §4.1–4.4 ficam decorativas: todo atleta resolve para rank 0 e o piso não
morde ninguém.

**a) Escolha obrigatória de nível ao adicionar um esporte.** Hoje o esporte entra com
`iniciante_1` por default silencioso. Passa a exigir escolha explícita, sem default
pré-selecionado, com descrição de cada degrau para o atleta se reconhecer. As
descrições já existem em `frontend/shared/levels/index.ts`; faltam as duas do Avançado.

**b) Janela de correção livre.** A regra "nível só sobe" torna qualquer erro para cima
irreversível sem suporte, e a escolha obrigatória vai multiplicar esses erros. Até a
**primeira inscrição confirmada naquele esporte**, o nível pode ser corrigido
livremente, inclusive para baixo. Depois disso o ratchet fecha e vale a regra normal.

Isto exige uma exceção na guarda `athleteLevelsNotDowngraded` das rules. O critério
("primeira inscrição confirmada") não é legível pelas rules sem lookup caro, então a
janela é materializada como um campo no doc do usuário — `sportOnboarding.levelLocked.
{SPORT_CODE}: true` — escrito pelo backend quando a primeira inscrição é confirmada. As
rules permitem baixar o nível de um esporte apenas enquanto o flag correspondente
estiver ausente ou falso, e **nunca permitem que o cliente escreva o próprio flag**.

**c) Confirmação na primeira inscrição.** Antes de confirmar a primeira inscrição em
torneio naquele esporte, exibir o nível declarado e pedir confirmação, com atalho para
ajustar. É o último momento barato de corrigir, e é quando o atleta tem mais incentivo
para acertar.

**d) Promoção pelo organizador após o torneio.** O organizador que acabou de ver o
atleta jogar é a melhor fonte de verdade disponível enquanto a engine de rating não tem
volume. Ao encerrar uma categoria, ele pode **promover** atletas que disputaram o
torneio dele — nunca rebaixar. Só subir mantém D1 e D3 intactos e é seguro contra
abuso: promover um atleta só o restringe.

Reutiliza `setAthleteLevel` em `functions/src/athlete-level-admin.ts`, hoje restrito a
admin. Ganha um caminho de autorização para organizador, limitado a atletas inscritos
num torneio dele e apenas na direção de subida. Toda mudança continua auditada em
`users/{uid}/levelHistory` com `actor`.

## 5. Blast radius

A regra de elegibilidade tem **quatro implementações espelhadas** e o vocabulário de
níveis aparece em ~35 arquivos.

| Superfície | Arquivos principais |
|---|---|
| `functions/` | `category-level-eligibility.ts` (autoritativo), `rating-config.ts`, `rating-ladder.ts`, `rating-engine.ts`, `rating-triggers.ts`, `athlete-level-admin.ts`, `athlete-levels-migration` |
| `firestore.rules` | `athleteLevelRank` (map literal — 4 entradas novas), `athleteLevelsNotDowngraded` (exceção da janela de correção) |
| App Flutter | `category_level_eligibility.dart`, `athlete_profile_options.dart`, `category_ops_logic.dart`, `athlete_firestore_codes.dart`, telas de "Esportes e níveis", filtro de nível do ranking, barras de nível (5 → 7 segmentos), `tournament_create_*` |
| Portal do atleta | `@nexago/levels` (`frontend/shared/levels/index.ts`), `athlete-level.ts`, `tournament-eligibility.ts`, onboarding, ranking, diretório, `public-profiles-repository.ts` |
| Portal do organizador | `tournament-create.model.ts` (`SKILL_LEVEL_LABEL`, `skillLevelOptionsForSport`), `tournament-create-mapper.ts`, `team-level-score.ts` (escala 2–10 → 2–14), wizard, `categoria-detalhe`, `seeds` |
| Backoffice | `athlete-level-dialog.component.ts` |
| Docs | `docs/business-rules/levels.md`, `docs/business-rules/categories.md` |

O map literal das rules é lookup barato, não cadeia de ternários — acrescentar 4
entradas não reencosta no limite de 1000 expressões avaliadas que já foi atingido uma
vez nesse arquivo.

## 6. Migração

O rank é persistido em **um único lugar**: `athleteRatings/*.levelRank`. Todos os
demais lugares guardam código ou label, e portanto não migram:

- `users/{uid}.sportOnboarding.levelsBySport` → código (`open`)
- `categories[].level` → label (`"Open"`)
- `users/{uid}/levelHistory` → códigos (`fromLevel`/`toLevel`)

A migração é **recalcular `levelRank` a partir do código do nível**, e não mapear
5 → 6. Isso a torna idempotente e correta mesmo rodando mais de uma vez, e correta
também para documentos criados entre o deploy e a execução.

Antes de executar, **contar os documentos afetados**. A premissa "base vazia" é o que
autoriza a renumeração; se a contagem contrariar a premissa, o plano precisa ser
revisto antes de prosseguir.

## 7. Ordem de rollout

1. `functions` — vocabulário novo, faixa na elegibilidade, régua de rating
2. `firestore.rules` — ranks novos no map literal, exceção da janela de correção
3. Migração `athleteRatings.levelRank` (dry-run → real)
4. Portais web (organizador, atleta, backoffice)
5. Release do app Flutter

Há uma dependência de produto atravessando essa ordem técnica: **a calibração (§4.5)
precisa estar no ar e ter produzido cobertura de nível declarado antes que qualquer
preset com piso seja usado num torneio real** — caso contrário o piso barra todo mundo
(§4.2). O código do piso pode ser deployado desde o passo 1; o *uso* do piso é que
espera a calibração.

Entre os passos 1 e 5 o app publicado tem a escada de 5 degraus compilada contra um
backend de 7: um atleta em `avancado_1`/`avancado_2` cairia no fallback de nível
desconhecido, e um app antigo regravando nível legado pode levar `permission-denied`.
A base instalada é pequena (versão 1.0.2+3), o que torna a janela aceitável — mas ela
deve ser a mais curta possível.

## 8. Testes

- `functions/src/category-level-eligibility.test.ts` — faixa (piso + teto), dupla com
  integrantes em degraus diferentes, `minLevel` ausente equivalendo ao comportamento
  atual, aliases legados com `open` no rank 6
- `functions/src/rating-ladder.test.ts` — promoção/rebaixamento atravessando os degraus
  novos
- `functions/test/athlete-level-rules.test.mjs` — janela de correção (baixar permitido
  sem o flag, negado com o flag, cliente não consegue escrever o flag). O fixture não
  pode conter o campo legado `role`, que as rules pós-migração `roles[]` rejeitam
- Migração — idempotência e recálculo a partir do código
- Espelhos: `category_level_eligibility_test.dart`, `category_ops_logic_test.dart`,
  `tournament-eligibility.levels.spec.ts`, `tournament-create.levels.spec.ts`,
  `team-level-score.spec.ts` (escala 2–14)
- Paridade das quatro implementações da regra sobre a mesma tabela de casos

## 9. Não-objetivos

- **Ligar `autoPromotionEnabled`.** Sem volume de partidas a engine não decide nada;
  fica para quando houver base com ≥10 partidas rateadas.
- **Rebaixamento automático.** Contraria D3.
- **Qualquer forma de atleta jogar abaixo do próprio nível.** Contraria D1.
- **Escada de rating para beach tennis e futevôlei.** `RATED_SPORT_CODES` permanece
  `VOLEI_PRAIA` e `VOLEI_QUADRA`. Os dois esportes recebem os degraus novos no nível
  declarado, sem rating.
- **Formatos de evento para poucos participantes** (super 8, rodízio, king of the
  court). Complementam este spec e merecem ciclo próprio.

## 10. Riscos

| Risco | Mitigação |
|---|---|
| A premissa "base vazia" estar errada e a renumeração corromper rating real | Contagem obrigatória antes da migração (§6); migração por recálculo, não por mapeamento |
| Sete degraus fragmentarem chaves numa base pequena | Presets agrupam dois degraus (D5); preset Elite (4–6) concentra o topo |
| Régua de rating dos degraus novos estar mal calibrada | Números editáveis em `ratingLadders/VOLEI_PRAIA` sem deploy; revisão após os primeiros meses |
| Janela de correção virar brecha de sandbagging | Fecha na primeira inscrição confirmada; flag escrito só pelo backend, nunca pelo cliente |
| Divergência entre as quatro implementações da regra | Tabela de casos compartilhada, exercida nos testes das quatro superfícies |
| App antigo contra backend novo durante o rollout | Janela curta entre os passos 1 e 5; base instalada pequena |
| Organizador promover atleta indevidamente | Só subida; restrito a atletas de torneio dele; auditado em `levelHistory` com `actor` |
