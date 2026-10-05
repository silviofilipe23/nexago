# Multiesporte, fase 0: estancar a coerção de esporte

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nenhum caminho do sistema reescreve `tournaments.sport` ou `leagues.sport` para `beachVolleyball` quando encontra um valor que não conhece, as rules impedem que um cliente faça isso, e os quatro bugs de vocabulário de esporte achados no diagnóstico ficam corrigidos.

**Architecture:** O app e o portal passam a carregar, ao lado do enum `TournamentSport`, o valor cru do doc quando o enum não o representa (`sportRaw`), e devolvem esse valor no save. As rules congelam `sport` depois de criado para todo mundo que não é admin. No backend, os três pontos que comparavam ou liam esporte no vocabulário errado passam a usar `tournamentSportToLevelSportCode` e `ATHLETE_SPORT_CODES`, que já são a fonte canônica.

**Tech Stack:** Cloud Functions (TypeScript, `node --test`), Firestore rules (`@firebase/rules-unit-testing` no emulador), Flutter (`flutter test`), Angular 20 (Karma/Jasmine).

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md`, seção "Fases", item "Fase 0: estancar". O spec inteiro vale como contexto: a fase 1 vai apagar as pontes que esta fase só corrige.

## Global Constraints

- Retrocompatibilidade obrigatória (CLAUDE.md): nenhum valor já persistido muda de grafia; o que não é reconhecido é preservado, nunca convertido.
- Português nas strings de UI e mensagens de erro; inglês no código.
- Os VALORES string dos enums são os `name` dos enums Dart e vão pro Firestore. Não renomear.
- Doc sem campo `sport` (legado) continua podendo receber `sport` numa edição: congelar só vale quando o campo já existe.
- Mesário, staff e gestor precisam continuar salvando o torneio quando reenviam o mesmo `sport`. Só valor DIFERENTE é recusado.
- Nenhuma fase posterior entra aqui: sem catálogo, sem beach tennis no enum, sem `scoringProfile`.
- `dart format` reformata o arquivo inteiro; rodar só nos arquivos tocados. Cada commit traz a linha `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. Doc de torneio com `sport` em grafia legada (`beach_tennis`): deve carregar sem erro, exibir o valor cru travado e salvar `beach_tennis` de volta. Teste no Task 5 (mapper) e Task 9 (portal).
2. Sessão local do wizard gravada por um app ANTERIOR a esta mudança, sem a chave `sportRaw`: deve restaurar normalmente com `sportRaw` nulo. Teste no Task 5 (session).
3. Update parcial do torneio sem o campo `sport` (mesário atualizando `liveMatchesNow`, staff mudando nome): as rules precisam aceitar, porque `request.resource.data` herda o `sport` atual. Teste no Task 4.
4. Pedido de convite do Bora Jogar com esporte em minúsculas (`volei_praia`, que é o que os testes antigos mandavam): deve ser aceito e gravado em maiúsculas; código inexistente deve ser recusado. Teste no Task 3.
5. Filtro de esporte do confronto direto recebendo o enum do torneio (`beachVolleyball`) em vez do código de perfil: deve funcionar igual. Teste no Task 2.

---

## Comandos de teste

| Camada | Um arquivo | Tudo |
|---|---|---|
| Functions (unit) | `cd functions && npm run build && node --test lib/head-to-head.test.js` | `cd functions && npm test` |
| Rules | `cd functions && firebase emulators:exec --only firestore --project nexago-rules-test "node --test test/tournament-sport-frozen.rules.test.mjs"` | `cd functions && npm run test:rules` |
| Flutter | `cd nexago_app && flutter test test/features/organizer/tournament_create_mapper_test.dart` | `cd nexago_app && flutter test` |
| Portal organizador | `cd frontend && npx ng test organizer --watch=false --include='**/tournament-create.sport-raw.spec.ts'` | `cd frontend && npx ng test organizer --watch=false` |

---

### Task 1: Sorteio ao vivo lê `sport`, não `sportId`

**Files:**
- Modify: `functions/src/draw-sessions.ts:391`
- Test: `functions/src/draw-sessions-sport.test.ts` (novo)

**Interfaces:**
- Consumes: `tournamentSportToLevelSportCode(sport: unknown): string | null` de `./category-level-eligibility` (já importado em `draw-sessions.ts`).
- Produces: `export function drawSportCodeOf(tournament: Record<string, unknown>): string | null` em `draw-sessions.ts`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// functions/src/draw-sessions-sport.test.ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {drawSportCodeOf} from "./draw-sessions";

describe("draw-sessions · esporte do torneio para o sorteio", () => {
  it("lê o campo `sport` do doc (o que o wizard grava), não `sportId`", () => {
    assert.equal(drawSportCodeOf({sport: "beachVolleyball"}), "VOLEI_PRAIA");
    assert.equal(drawSportCodeOf({sportId: "beachVolleyball"}), null);
  });

  it("torneio sem esporte ou com esporte sem mapeamento cai no nível global (null)", () => {
    assert.equal(drawSportCodeOf({}), null);
    assert.equal(drawSportCodeOf({sport: "padel"}), null);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm run build && node --test lib/draw-sessions-sport.test.js`
Expected: FAIL, `drawSportCodeOf` não exportado (erro de compilação do `tsc`).

- [ ] **Step 3: Implementar**

Em `functions/src/draw-sessions.ts`, logo acima de `export const createDrawSession`, adicionar:

```ts
/**
 * Código de esporte do PERFIL (`VOLEI_PRAIA`) usado pelas potes/cabeças do
 * sorteio. Lê `tournaments/{id}.sport` — o campo que o wizard grava. Até
 * 10/2026 lia `sportId`, que não existe no doc (é só um rename do modelo do
 * portal), então o sorteio ignorava nível e rating por esporte.
 */
export function drawSportCodeOf(tournament: Record<string, unknown>): string | null {
  return tournamentSportToLevelSportCode(tournament.sport);
}
```

E trocar a linha 391:

```ts
  const sportCode = drawSportCodeOf(tournament);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd functions && npm run build && node --test lib/draw-sessions-sport.test.js lib/koc-draw-bracket-agreement.test.js`
Expected: PASS nos dois arquivos.

- [ ] **Step 5: Commit**

```bash
git add functions/src/draw-sessions.ts functions/src/draw-sessions-sport.test.ts
git commit -m "fix(draw): sorteio lia sportId, campo que não existe no torneio

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Confronto direto filtra pelo código de perfil

**Files:**
- Modify: `functions/src/head-to-head.ts:1-5` (import), `:291`, `:318-328`
- Test: `functions/src/head-to-head.test.ts` (adicionar bloco)

**Interfaces:**
- Consumes: `tournamentSportToLevelSportCode` de `./category-level-eligibility`.
- Produces: `export function headToHeadSportMatches(tournamentSport: unknown, requested: string): boolean`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao final de `functions/src/head-to-head.test.ts`:

```ts
import {headToHeadSportMatches} from "./head-to-head";

describe("head-to-head · filtro de esporte", () => {
  it("aceita o código de perfil e compara com o esporte do torneio mapeado", () => {
    assert.equal(headToHeadSportMatches("beachVolleyball", "VOLEI_PRAIA"), true);
    assert.equal(headToHeadSportMatches("indoorVolleyball", "VOLEI_PRAIA"), false);
  });

  it("aceita o enum do torneio como filtro (cliente antigo)", () => {
    assert.equal(headToHeadSportMatches("beachVolleyball", "beachVolleyball"), true);
    assert.equal(headToHeadSportMatches("footvolley", "beachVolleyball"), false);
  });

  it("torneio sem mapeamento de esporte nunca casa com filtro", () => {
    assert.equal(headToHeadSportMatches("padel", "VOLEI_PRAIA"), false);
    assert.equal(headToHeadSportMatches(undefined, "VOLEI_PRAIA"), false);
  });
});
```

Mover o `import` para o topo do arquivo, junto do import existente de `./head-to-head`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm run build && node --test lib/head-to-head.test.js`
Expected: FAIL, `headToHeadSportMatches` não exportado.

- [ ] **Step 3: Implementar**

Em `functions/src/head-to-head.ts`, adicionar o import:

```ts
import {tournamentSportToLevelSportCode} from "./category-level-eligibility";
```

Adicionar antes de `export const getHeadToHeadRecord`:

```ts
/**
 * `sportCode` do pedido pode vir como código de perfil (`VOLEI_PRAIA`) ou
 * como o enum do torneio (`beachVolleyball`). Os dois lados são levados ao
 * código de perfil antes de comparar; torneio sem mapeamento não casa.
 */
export function headToHeadSportMatches(tournamentSport: unknown, requested: string): boolean {
  const wanted =
    tournamentSportToLevelSportCode(requested) ?? requested.trim().toUpperCase();
  const actual = tournamentSportToLevelSportCode(tournamentSport);
  return actual != null && actual === wanted;
}
```

Trocar o filtro (linhas 318-328) por:

```ts
  if (sportCode) {
    const tournamentIds = new Set(matches.map((m) => m.tournamentId).filter(Boolean));
    const sportByTournament = new Map<string, unknown>();
    await Promise.all(
      [...tournamentIds].map(async (id) => {
        const snap = await db.doc(`tournaments/${id}`).get();
        if (!snap.exists) return;
        sportByTournament.set(id, snap.data()?.sport);
      }),
    );
    matches = matches.filter((m) =>
      headToHeadSportMatches(sportByTournament.get(m.tournamentId), sportCode),
    );
  }
```

Atualizar o comentário da callable (linha 279) para: "`sportCode` é opcional; aceita o código de perfil (`VOLEI_PRAIA`) ou o enum do torneio (`beachVolleyball`) e restringe às partidas de torneios daquele esporte."

- [ ] **Step 4: Rodar e ver passar**

Run: `cd functions && npm run build && node --test lib/head-to-head.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/head-to-head.ts functions/src/head-to-head.test.ts
git commit -m "fix(head-to-head): filtro de esporte comparava vocabulários diferentes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Bora Jogar valida e normaliza o esporte

**Files:**
- Modify: `functions/src/friendly-match-logic.ts` (nova função exportada), `functions/src/friendly-match-invite.ts:247-250`
- Test: `functions/src/friendly-match-logic.test.ts` (fixture + bloco novo), `functions/src/friendly-match-invite.test.ts` (fixtures + 2 casos)

**Interfaces:**
- Consumes: `ATHLETE_SPORT_CODES` de `./category-level-eligibility`.
- Produces: `export function normalizeFriendlySport(raw: unknown): string | null` em `friendly-match-logic.ts`.

- [ ] **Step 1: Escrever os testes que falham**

Em `functions/src/friendly-match-logic.test.ts`, trocar a fixture (linha 21):

```ts
    levelsBySport: {VOLEI_PRAIA: "intermediario_1"},
```

e qualquer outra ocorrência de `volei_praia` no arquivo por `VOLEI_PRAIA`. Acrescentar ao final:

```ts
describe("normalizeFriendlySport", () => {
  it("aceita código de perfil em qualquer caixa e devolve em maiúsculas", () => {
    assert.equal(normalizeFriendlySport("VOLEI_PRAIA"), "VOLEI_PRAIA");
    assert.equal(normalizeFriendlySport(" volei_praia "), "VOLEI_PRAIA");
  });

  it("recusa código que não é esporte do perfil", () => {
    assert.equal(normalizeFriendlySport("beachVolleyball"), null);
    assert.equal(normalizeFriendlySport(""), null);
    assert.equal(normalizeFriendlySport(undefined), null);
  });
});
```

Adicionar `normalizeFriendlySport` ao import de `./friendly-match-logic` no topo do teste.

Em `functions/src/friendly-match-invite.test.ts`, trocar TODAS as ocorrências de `volei_praia` por `VOLEI_PRAIA` (fixture de perfil na linha 26 e os `sport:` dos pedidos). Acrescentar dentro do `describe` principal:

```ts
  it("esporte em minúsculas é aceito e gravado em maiúsculas", async () => {
    const fake = new FakeFirestore();
    seedProfile(fake, "a");
    seedProfile(fake, "b");
    const result = await sendFriendlyMatchInviteCore(db(fake), "a", {
      toUids: ["b"],
      sport: "volei_praia",
      objective: "friendly",
      scheduledAtMs: now + 48 * HOUR_MS,
      location: {freeText: "Praia de Camburi"},
    }, now);
    assert.equal(matchData(fake, result.matchId).sport, "VOLEI_PRAIA");
  });

  it("esporte que não é código de perfil é recusado", async () => {
    const fake = new FakeFirestore();
    seedProfile(fake, "a");
    seedProfile(fake, "b");
    await assertHttpsError(
      sendFriendlyMatchInviteCore(db(fake), "a", {
        toUids: ["b"],
        sport: "beachVolleyball",
        objective: "friendly",
        scheduledAtMs: now + 48 * HOUR_MS,
        location: {freeText: "Praia de Camburi"},
      }, now),
      "invalid-argument",
    );
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm run build && node --test lib/friendly-match-logic.test.js lib/friendly-match-invite.test.js`
Expected: FAIL, `normalizeFriendlySport` não existe; o caso "é recusado" falha porque hoje qualquer string passa.

- [ ] **Step 3: Implementar**

Em `functions/src/friendly-match-logic.ts`, adicionar o import e a função:

```ts
import {ATHLETE_SPORT_CODES} from "./category-level-eligibility";

/**
 * `sport` do jogo aberto é um código de esporte do PERFIL (chave de
 * `levelsBySport`, sempre em maiúsculas). O app manda em maiúsculas; o
 * servidor normaliza a caixa e recusa o que não está em `ATHLETE_SPORT_CODES`,
 * senão a proximidade de nível cai em silêncio no valor neutro.
 */
export function normalizeFriendlySport(raw: unknown): string | null {
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return (ATHLETE_SPORT_CODES as readonly string[]).includes(code) ? code : null;
}
```

Em `functions/src/friendly-match-invite.ts`, importar `normalizeFriendlySport` do `./friendly-match-logic` (já há um import desse módulo) e trocar as linhas 247-250 por:

```ts
  const sport = normalizeFriendlySport(input.sport);
  if (!sport) {
    throw new HttpsError("invalid-argument", "Informe o esporte do jogo.");
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd functions && npm run build && node --test lib/friendly-match-logic.test.js lib/friendly-match-invite.test.js lib/friendly-match-sweepers.test.js lib/friendly-match-checkin.test.js`
Expected: PASS. Se algum sweeper/checkin test usar `volei_praia` em fixture, trocar por `VOLEI_PRAIA` também.

- [ ] **Step 5: Commit**

```bash
git add functions/src/friendly-match-logic.ts functions/src/friendly-match-logic.test.ts functions/src/friendly-match-invite.ts functions/src/friendly-match-invite.test.ts
git commit -m "fix(bora-jogar): esporte do jogo validado contra os códigos de perfil

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Rules congelam `sport` de torneio e liga

**Files:**
- Modify: `firestore.rules` (helper novo perto de `staffKeepsTournamentMoneyFields`, linha 125; `allow update` de `tournaments`, linha 2309; `allow update` de `leagues`, linha 2662)
- Modify: `docs/business-rules/tournaments.md` (uma linha na seção de edição)
- Test: `functions/test/tournament-sport-frozen.rules.test.mjs` (novo)

**Interfaces:**
- Produces: função de rules `sportUnchanged()`.

- [ ] **Step 1: Escrever o teste que falha**

```js
// functions/test/tournament-sport-frozen.rules.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-sport-frozen-test';
const DONO = 'dono-uid';
const ADMIN = 'admin-uid';
const MESARIO = 'mesario-uid';
const TORNEIO_BT = 'copa-beach-tennis';
const TORNEIO_SEM_ESPORTE = 'copa-legada';
const LIGA = 'liga-beach-tennis';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', TORNEIO_BT), {
      managerId: DONO, name: 'Copa BT', listingStatus: 'open', sport: 'beachTennis',
    });
    await setDoc(doc(db, 'tournaments', TORNEIO_BT, 'staff', MESARIO), {
      role: 'scorer', status: 'active',
    });
    await setDoc(doc(db, 'tournaments', TORNEIO_SEM_ESPORTE), {
      managerId: DONO, name: 'Copa Legada', listingStatus: 'open',
    });
    await setDoc(doc(db, 'leagues', LIGA), {
      managerId: DONO, name: 'Liga BT', listingStatus: 'open', sport: 'beachTennis',
    });
  });
});

after(async () => { await testEnv.cleanup(); });

const asDono = () => testEnv.authenticatedContext(DONO).firestore();
const asAdmin = () => testEnv.authenticatedContext(ADMIN, { roles: ['admin'] }).firestore();
const asMesario = () => testEnv.authenticatedContext(MESARIO).firestore();

test('dono edita o nome sem mandar sport', async () => {
  await assertSucceeds(updateDoc(doc(asDono(), 'tournaments', TORNEIO_BT), { name: 'Copa BT 2026' }));
});

test('dono reenvia o MESMO sport', async () => {
  await assertSucceeds(
    updateDoc(doc(asDono(), 'tournaments', TORNEIO_BT), { name: 'Copa BT', sport: 'beachTennis' }),
  );
});

// O app da loja só conhece 3 esportes e, ao reeditar, regravava qualquer
// outro como beachVolleyball. A rule é o que segura isso enquanto o build
// mínimo não sobe.
test('dono NÃO troca o sport de um torneio já criado', async () => {
  await assertFails(
    updateDoc(doc(asDono(), 'tournaments', TORNEIO_BT), { sport: 'beachVolleyball' }),
  );
});

test('mesário atualiza liveMatchesNow sem tocar em sport', async () => {
  await assertSucceeds(
    updateDoc(doc(asMesario(), 'tournaments', TORNEIO_BT), { liveMatchesNow: 1 }),
  );
});

test('admin da plataforma pode corrigir o sport', async () => {
  await assertSucceeds(
    updateDoc(doc(asAdmin(), 'tournaments', TORNEIO_BT), { sport: 'padel' }),
  );
});

test('torneio legado sem sport pode receber sport pela primeira vez', async () => {
  await assertSucceeds(
    updateDoc(doc(asDono(), 'tournaments', TORNEIO_SEM_ESPORTE), { sport: 'beachVolleyball' }),
  );
});

test('dono NÃO troca o sport da liga', async () => {
  await assertFails(updateDoc(doc(asDono(), 'leagues', LIGA), { sport: 'beachVolleyball' }));
});

test('dono edita a liga reenviando o mesmo sport', async () => {
  await assertSucceeds(
    updateDoc(doc(asDono(), 'leagues', LIGA), { name: 'Liga BT 2026', sport: 'beachTennis' }),
  );
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && firebase emulators:exec --only firestore --project nexago-rules-test "node --test test/tournament-sport-frozen.rules.test.mjs"`
Expected: FAIL nos casos "NÃO troca" (hoje o dono consegue).

- [ ] **Step 3: Implementar**

Em `firestore.rules`, logo após `staffKeepsTournamentMoneyFields()` (linha 132), adicionar:

```
    /** `sport` congela depois de criado. Só admin da plataforma muda. O app da
     *  loja (até o build que conhece o catálogo) coage esporte desconhecido pra
     *  beachVolleyball ao reeditar; a rule é o que impede o rebaixamento.
     *  Doc legado SEM o campo pode recebê-lo uma vez. Update parcial que não
     *  manda `sport` herda o atual em `request.resource.data` e passa. */
    function sportUnchanged() {
      return !('sport' in resource.data) ||
        request.resource.data.get('sport', null) == resource.data.sport;
    }
```

No `allow update` de `tournaments` (linha 2309), envolver os ramos não-admin:

```
      allow update: if request.auth != null && (
        isAdmin() ||
        isSuperAdmin() ||
        (
          sportUnchanged() && (
            (isTournamentOrganizer() && organizerCanUpdateOwnTournament()) ||
            resource.data.managerId == request.auth.uid ||
            (
              isTournamentStaff(tournamentId, ['manager', 'eventAdmin']) &&
              staffKeepsTournamentMoneyFields()
            ) ||
            (
              canScoreTournament(tournamentId) &&
              scorerCanOnlyEditLiveMatchesNowField()
            )
          )
        )
      );
```

No `allow update` de `leagues` (linha 2662):

```
      allow update: if request.auth != null && (
        isAdmin() ||
        (organizerCanUpdateOwnLeague() && sportUnchanged())
      );
```

Em `docs/business-rules/tournaments.md`, na seção que fala de edição pelo organizador, acrescentar:

```
- **Esporte congela depois de criado.** `sport` só muda por admin da plataforma. Gestor, staff e
  mesário podem reenviar o mesmo valor; valor diferente derruba o save inteiro. Doc legado sem o
  campo pode recebê-lo uma vez. Motivo: o app da loja coage esporte desconhecido pra vôlei de praia
  ao reeditar (spec multiesporte 2026-10-03, fase 0).
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd functions && npm run test:rules`
Expected: PASS em TODOS os arquivos `*.rules.test.mjs`, não só no novo. Se `tournament-event-admin`, `tournament-staff`, `tournament-broadcast` ou `tournament-wallet` falharem, é porque algum deles manda `sport` diferente numa fixture; corrigir a fixture, nunca a rule.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules functions/test/tournament-sport-frozen.rules.test.mjs docs/business-rules/tournaments.md
git commit -m "feat(rules): sport de torneio e liga congela depois de criado

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: App preserva esporte desconhecido no torneio

**Files:**
- Modify: `nexago_app/lib/features/organizer/domain/tournament_create/tournament_create_draft.dart` (helper + campo)
- Modify: `nexago_app/lib/features/organizer/data/tournament_create_mapper.dart:38,146,292-297`
- Modify: `nexago_app/lib/features/organizer/domain/tournament_create/tournament_create_session.dart:84,161-165`
- Modify: `nexago_app/lib/features/organizer/presentation/tournament_create/steps/tournament_create_identity_page.dart:74-91`
- Test: `nexago_app/test/features/organizer/tournament_create_mapper_test.dart`, `nexago_app/test/features/organizer/tournament_create_session_test.dart`, `nexago_app/test/features/organizer/tournament_create_identity_page_sport_raw_test.dart` (novo)

**Interfaces:**
- Produces, em `tournament_create_draft.dart`:
  - `typedef ParsedTournamentSport = ({TournamentSport sport, String? raw});`
  - `ParsedTournamentSport parseTournamentSport(String? value)`
  - `TournamentCreateDraft.sportRaw: String?` e `String get sportFirestoreValue`
- Os Tasks 6 e 7 reutilizam `parseTournamentSport`.

- [ ] **Step 1: Escrever os testes que falham**

Em `tournament_create_mapper_test.dart`, acrescentar:

```dart
  group('sport desconhecido', () {
    test('fromFirestore preserva o valor cru e trava o enum no default', () {
      final load = TournamentCreateMapper.fromFirestore(
        {'name': 'Copa BT', 'sport': 'beachTennis'},
        'torneio-bt',
      );
      expect(load.draft.sport, TournamentSport.beachVolleyball);
      expect(load.draft.sportRaw, 'beachTennis');
      expect(load.draft.sportFirestoreValue, 'beachTennis');
    });

    test('fromFirestore com esporte conhecido não preenche sportRaw', () {
      final load = TournamentCreateMapper.fromFirestore(
        {'name': 'Copa', 'sport': 'footvolley'},
        'torneio-fv',
      );
      expect(load.draft.sport, TournamentSport.footvolley);
      expect(load.draft.sportRaw, isNull);
    });

    test('toFirestore devolve o valor cru, nunca beachVolleyball', () {
      final draft = TournamentCreateDraft(
        sportRaw: 'beach_tennis',
        name: 'Copa BT',
        city: 'Goiânia',
        state: 'GO',
        locationName: 'Arena',
        startAt: DateTime(2026, 3, 28),
        endAt: DateTime(2026, 3, 30),
        registrationOpensAt: DateTime(2026, 3, 1),
        registrationClosesAt: DateTime(2026, 3, 26),
        categories: const [
          TournamentCategoryDraft(id: 'c1', name: 'Open', spots: 16, priceCents: 100),
        ],
      );
      final map = TournamentCreateMapper.toFirestore(
        draft: draft,
        managerId: 'm1',
        publish: false,
      );
      expect(map['sport'], 'beach_tennis');
    });
  });
```

`TournamentCreateMapper.fromFirestore(data, id)` devolve o record `({draft, wizardStep})`; é dele que o teste lê `.draft`.

Em `tournament_create_session_test.dart`, acrescentar (`fromJson` devolve `TournamentCreateSession?` e o json aninha o rascunho em `'draft'`):

```dart
  test('toJson/fromJson preservam sportRaw', () {
    final session = TournamentCreateSession(
      managerUid: 'mgr-1',
      currentStep: TournamentCreateStep.identity,
      updatedAt: DateTime(2026, 1, 10, 9, 30),
      draft: const TournamentCreateDraft(name: 'Copa BT', sportRaw: 'beachTennis'),
    );
    final restored = TournamentCreateSession.fromJson(session.toJson())!;
    expect(restored.draft.sportRaw, 'beachTennis');
    expect(restored.draft.sportFirestoreValue, 'beachTennis');
  });

  test('json de app anterior, sem sportRaw, restaura com sportRaw nulo', () {
    final json = _session().toJson();
    (json['draft'] as Map<String, dynamic>).remove('sportRaw');
    final restored = TournamentCreateSession.fromJson(json)!;
    expect(restored.draft.sportRaw, isNull);
    expect(restored.draft.sport, TournamentSport.beachVolleyball);
  });
```

Novo `tournament_create_identity_page_sport_raw_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_session.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/steps/tournament_create_identity_page.dart';

void main() {
  testWidgets('esporte desconhecido aparece travado, sem dropdown', (tester) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    container.read(tournamentCreateWizardProvider.notifier).restoreSession(
          TournamentCreateSession(
            managerUid: 'mgr-1',
            currentStep: TournamentCreateStep.identity,
            updatedAt: DateTime(2026, 1, 10),
            draft: const TournamentCreateDraft(name: 'Copa BT', sportRaw: 'beachTennis'),
          ),
        );

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(theme: AppTheme.dark, home: const TournamentCreateIdentityPage()),
      ),
    );
    await tester.pump();

    expect(find.byType(DropdownButtonFormField<TournamentSport>), findsNothing);
    expect(find.text('beachTennis'), findsOneWidget);
    expect(find.textContaining('não pode ser alterado nesta versão'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nexago_app && flutter test test/features/organizer/tournament_create_mapper_test.dart test/features/organizer/tournament_create_session_test.dart test/features/organizer/tournament_create_identity_page_sport_raw_test.dart`
Expected: FAIL de compilação (`sportRaw` não existe).

- [ ] **Step 3: Implementar**

Em `tournament_create_draft.dart`, logo abaixo de `enum TournamentSport`:

```dart
/// Leitura de `sport` vinda do Firestore ou da sessão local.
///
/// [raw] só é preenchido quando o valor existe e o enum não o representa.
/// É o que volta pro doc no save: esta versão do app não pode rebaixar um
/// esporte que não conhece (spec multiesporte 2026-10-03, fase 0). Valor
/// ausente ou vazio cai no default sem [raw], porque doc legado sem o campo
/// não é "esporte desconhecido".
typedef ParsedTournamentSport = ({TournamentSport sport, String? raw});

ParsedTournamentSport parseTournamentSport(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return (sport: TournamentSport.beachVolleyball, raw: null);
  }
  for (final known in TournamentSport.values) {
    if (known.name == trimmed) return (sport: known, raw: null);
  }
  return (sport: TournamentSport.beachVolleyball, raw: trimmed);
}
```

Em `TournamentCreateDraft`:

```dart
    this.sport = TournamentSport.beachVolleyball,
    this.sportRaw,
```

```dart
  final TournamentSport sport;

  /// Valor de `sport` que o enum não representa (ver [parseTournamentSport]).
  /// Quando presente, o seletor fica travado e é ele que vai pro Firestore.
  final String? sportRaw;

  /// O que gravar em `tournaments.sport`.
  String get sportFirestoreValue => sportRaw ?? sport.name;
```

No `copyWith`, adicionar o parâmetro `String? sportRaw, bool clearSportRaw = false,` e no construtor de retorno:

```dart
      sportRaw: clearSportRaw ? null : (sportRaw ?? this.sportRaw),
```

Em `tournament_create_mapper.dart`: linha 38 vira `'sport': draft.sportFirestoreValue,`; na leitura (linha 146):

```dart
    final parsedSport = parseTournamentSport(data['sport'] as String?);
    final draft = TournamentCreateDraft(
      tournamentId: id,
      sport: parsedSport.sport,
      sportRaw: parsedSport.raw,
```

Apagar `_parseSport` (linhas 292-297).

Em `tournament_create_session.dart`: em `_draftToJson` (linha 84) adicionar `'sportRaw': draft.sportRaw,` ao lado de `'sport'`; na leitura do rascunho dentro de `fromJson` (linhas 161-165) trocar o `_enumByName(TournamentSport.values, ...)` por:

```dart
      sport: parseTournamentSport(json['sport'] as String?).sport,
      sportRaw: json['sportRaw'] as String? ??
          parseTournamentSport(json['sport'] as String?).raw,
```

Em `tournament_create_identity_page.dart`, trocar o `DropdownButtonFormField` (linhas 76-91) por:

```dart
          if (draft.sportRaw case final sportRaw?)
            TextFormField(
              key: const ValueKey('sport-locked'),
              enabled: false,
              initialValue: sportRaw,
              decoration: _fieldDecoration(context).copyWith(
                helperText:
                    'Esporte não pode ser alterado nesta versão do app.',
              ),
            )
          else
            DropdownButtonFormField<TournamentSport>(
              value: draft.sport,
              decoration: _fieldDecoration(context),
              items: [
                for (final sport in TournamentSport.values)
                  DropdownMenuItem(
                    value: sport,
                    child: Text(sportLabel(sport)),
                  ),
              ],
              onChanged: (value) {
                if (value != null) {
                  ref
                      .read(tournamentCreateWizardProvider.notifier)
                      .setSport(value);
                }
              },
            ),
```

Se a página de revisão do wizard mostrar `sportLabel(draft.sport)`, trocar por `draft.sportRaw ?? sportLabel(draft.sport)` (procurar `sportLabel(` em `presentation/tournament_create/`).

- [ ] **Step 4: Rodar e ver passar**

Run: `cd nexago_app && dart format lib/features/organizer/domain/tournament_create/tournament_create_draft.dart lib/features/organizer/data/tournament_create_mapper.dart lib/features/organizer/domain/tournament_create/tournament_create_session.dart lib/features/organizer/presentation/tournament_create/steps/tournament_create_identity_page.dart && flutter analyze lib/features/organizer && flutter test test/features/organizer/`
Expected: analyze limpo; PASS em toda a pasta `organizer`.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/organizer nexago_app/test/features/organizer
git commit -m "fix(app): torneio preserva esporte que o app não conhece em vez de coagir pra vôlei

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: App preserva esporte desconhecido na liga

**Files:**
- Modify: `nexago_app/lib/features/organizer/domain/league_create/league_create_draft.dart:86,109,136,160`
- Modify: `nexago_app/lib/features/organizer/data/league_create_mapper.dart:36,107,206-210`
- Modify: `nexago_app/lib/features/organizer/domain/league_create/league_create_session.dart:79,107-111`
- Modify: `nexago_app/lib/features/organizer/data/league_stage_tournament_factory.dart:38` (`build`, que cria os torneios das etapas a partir da liga)
- Modify: `nexago_app/lib/features/organizer/presentation/league_create/steps/league_create_identity_page.dart:82-97`
- Test: `nexago_app/test/features/organizer/league_create_mapper_test.dart`, `nexago_app/test/features/organizer/league_create_session_test.dart`

**Interfaces:**
- Consumes: `parseTournamentSport` do Task 5.
- Produces: `LeagueCreateDraft.sportRaw: String?`, `String get sportFirestoreValue`.

- [ ] **Step 1: Escrever os testes que falham**

Em `league_create_mapper_test.dart`, dentro do `group('LeagueCreateMapper')`:

```dart
    test('fromFirestore preserva sport desconhecido e toFirestore devolve igual', () {
      final load = LeagueCreateMapper.fromFirestore(
        {'name': 'Liga BT', 'sport': 'beachTennis'},
        'liga-bt',
      );
      expect(load.draft.sport, TournamentSport.beachVolleyball);
      expect(load.draft.sportRaw, 'beachTennis');

      final map = LeagueCreateMapper.toFirestore(
        draft: load.draft.copyWith(
          seasonStartAt: DateTime(2026, 2, 1),
          seasonEndAt: DateTime(2026, 10, 1),
        ),
        managerId: 'm1',
        publish: false,
      );
      expect(map['sport'], 'beachTennis');
    });

    test('torneio de etapa gerado da liga herda o sport cru', () {
      final league = LeagueCreateDraft(
        name: 'Liga BT',
        sportRaw: 'beachTennis',
        seasonStartAt: DateTime(2026, 2, 1),
        seasonEndAt: DateTime(2026, 10, 1),
        plannedStagesCount: 1,
        categories: const [TournamentCategoryDraft(id: 'c1', name: 'Open', spots: 16)],
        stages: const [LeagueStageDraft(order: 1, name: 'Etapa 1')],
      );
      final map = LeagueStageTournamentFactory.build(
        league: league,
        stage: league.stages.first,
        managerId: 'm1',
        tournamentId: 't1',
      );
      expect(map['sport'], 'beachTennis');
    });
```

`LeagueCreateMapper.fromFirestore(data, id)` devolve `LeagueDraftLoadResult` (`({draft, step})`).

Em `league_create_session_test.dart` (`fromJson` devolve `LeagueCreateSession?`; o json aninha em `'draft'`):

```dart
  test('toJson/fromJson preservam sportRaw e json antigo restaura nulo', () {
    final session = LeagueCreateSession(
      managerUid: 'mgr-1',
      currentStep: LeagueCreateStep.ranking,
      updatedAt: DateTime(2026, 1, 10),
      draft: const LeagueCreateDraft(name: 'Liga BT', sportRaw: 'beachTennis'),
    );
    expect(LeagueCreateSession.fromJson(session.toJson())!.draft.sportRaw, 'beachTennis');

    final old = session.toJson();
    (old['draft'] as Map<String, dynamic>).remove('sportRaw');
    expect(LeagueCreateSession.fromJson(old)!.draft.sportRaw, isNull);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nexago_app && flutter test test/features/organizer/league_create_mapper_test.dart test/features/organizer/league_create_session_test.dart`
Expected: FAIL de compilação (`sportRaw`).

- [ ] **Step 3: Implementar**

`league_create_draft.dart`: mesmo padrão do Task 5. Construtor `this.sportRaw,` após `this.sport`; campo:

```dart
  final TournamentSport sport;

  /// Valor de `sport` que o enum não representa (ver [parseTournamentSport]).
  final String? sportRaw;

  String get sportFirestoreValue => sportRaw ?? sport.name;
```

`copyWith`: `String? sportRaw, bool clearSportRaw = false,` e `sportRaw: clearSportRaw ? null : (sportRaw ?? this.sportRaw),`.

`league_create_mapper.dart`: linha 36 `'sport': draft.sportFirestoreValue,`; linha 107:

```dart
      sport: parseTournamentSport(data['sport'] as String?).sport,
      sportRaw: parseTournamentSport(data['sport'] as String?).raw,
```

Apagar `_parseSport` (206-210). Importar `tournament_create_draft.dart` se ainda não estiver.

`league_create_session.dart`: `'sportRaw': draft.sportRaw,` em `_draftToJson` (linha 79); na leitura do rascunho em `fromJson` (linhas 107-111):

```dart
      sport: parseTournamentSport(json['sport'] as String?).sport,
      sportRaw: json['sportRaw'] as String? ??
          parseTournamentSport(json['sport'] as String?).raw,
```

`league_stage_tournament_factory.dart`, em `build` (linha 38): `sport: league.sport,` continua passando o enum para `_baseTournamentMap`; acrescentar o parâmetro `sportRaw: league.sportRaw,` e em `_baseTournamentMap` (linha 125):

```dart
    required TournamentSport sport,
    String? sportRaw,
```

e na linha 155: `'sport': sportRaw ?? sport.name,`.

`league_create_identity_page.dart` (82-97): o mesmo `if (draft.sportRaw case final sportRaw?) TextFormField(...) else DropdownButtonFormField(...)` do Task 5, com `leagueCreateWizardProvider` no `onChanged` e `key: const ValueKey('sport-locked')`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd nexago_app && dart format lib/features/organizer/domain/league_create lib/features/organizer/data/league_create_mapper.dart lib/features/organizer/data/league_stage_tournament_factory.dart lib/features/organizer/presentation/league_create/steps/league_create_identity_page.dart && flutter analyze lib/features/organizer && flutter test test/features/organizer/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/organizer nexago_app/test/features/organizer
git commit -m "fix(app): liga preserva esporte que o app não conhece

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: App preserva esporte desconhecido ao adicionar etapa

**Files:**
- Modify: `nexago_app/lib/features/organizer/domain/league_stage_create/league_stage_create_draft.dart:115,134,159,179`
- Modify: `nexago_app/lib/features/organizer/domain/league_stage_create/league_stage_create_session.dart:81,107-111`
- Modify: `nexago_app/lib/features/organizer/data/organizer_leagues_repository.dart:15-25,352,483-487`
- Modify: `nexago_app/lib/features/organizer/domain/league_stage_create/league_stage_create_providers.dart:165`
- Modify: `nexago_app/lib/features/organizer/data/league_stage_tournament_factory.dart:91` (`buildFromStageCreate`)
- Test: `nexago_app/test/features/organizer/league_stage_tournament_factory_test.dart`, `nexago_app/test/features/organizer/league_stage_create_local_store_test.dart` (ou o teste de sessão de etapa que existir)

**Interfaces:**
- Consumes: `parseTournamentSport`, `_baseTournamentMap(sportRaw:)` do Task 6.
- Produces: `LeagueStageCreateDraft.sportRaw`, `PublishedLeagueForStageAdd.sportRaw: String?`.

- [ ] **Step 1: Escrever os testes que falham**

Em `league_stage_tournament_factory_test.dart`, acrescentar um caso ao lado do que já chama `buildFromStageCreate`:

```dart
  test('buildFromStageCreate grava o sport cru da liga', () {
    final draft = LeagueStageCreateDraft(
      leagueId: 'liga-bt',
      leagueName: 'Liga BT',
      sportRaw: 'beachTennis',
      leagueCity: 'Goiânia',
      leagueState: 'GO',
      stage: const LeagueStageDraft(id: 's1', name: 'Etapa 1', order: 1),
    );
    final map = LeagueStageTournamentFactory.buildFromStageCreate(
      draft: draft,
      managerId: 'm1',
      tournamentId: 't1',
      publish: false,
    );
    expect(map['sport'], 'beachTennis');
  });
```

Em `league_stage_create_local_store_test.dart`, dentro do `group('LeagueStageCreateLocalStore')`:

```dart
    test('sessão de etapa preserva sportRaw no json', () async {
      final session = LeagueStageCreateSession(
        draft: LeagueStageCreateDraft(
          leagueId: 'league-1',
          leagueName: 'Liga BT',
          sportRaw: 'beachTennis',
          stage: const LeagueStageDraft(id: 'stage-1', name: 'Etapa 1', order: 1),
        ),
        currentStep: LeagueStageCreateStep.categoriesRegistration,
        updatedAt: DateTime(2026, 3, 1, 12),
        managerUid: 'manager-1',
      );
      final restored = LeagueStageCreateSession.fromJson(session.toJson())!;
      expect(restored.draft.sportRaw, 'beachTennis');
      expect(restored.draft.sportFirestoreValue, 'beachTennis');
    });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nexago_app && flutter test test/features/organizer/league_stage_tournament_factory_test.dart test/features/organizer/league_stage_create_local_store_test.dart`
Expected: FAIL de compilação.

- [ ] **Step 3: Implementar**

`league_stage_create_draft.dart`: `this.sportRaw,` após `this.sport`; campo `final String? sportRaw;` com o mesmo doc-comment; `String get sportFirestoreValue => sportRaw ?? sport.name;`; `copyWith` com `String? sportRaw, bool clearSportRaw = false,`.

`league_stage_create_session.dart`: `'sportRaw': draft.sportRaw,` em `_draftToJson` (linha 81); na leitura do rascunho em `fromJson` (linhas 107-111):

```dart
      sport: parseTournamentSport(json['sport'] as String?).sport,
      sportRaw: json['sportRaw'] as String? ??
          parseTournamentSport(json['sport'] as String?).raw,
```

`organizer_leagues_repository.dart`: no typedef `PublishedLeagueForStageAdd` adicionar `String? sportRaw,` após `TournamentSport sport,`; na linha 352:

```dart
      sport: parseTournamentSport(data['sport'] as String?).sport,
      sportRaw: parseTournamentSport(data['sport'] as String?).raw,
```

Apagar `_parseSport` (483-487).

`league_stage_create_providers.dart:165`: após `sport: context.sport,` adicionar `sportRaw: context.sportRaw,`.

`league_stage_tournament_factory.dart`, `buildFromStageCreate` (linha 91): após `sport: draft.sport,` adicionar `sportRaw: draft.sportRaw,`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd nexago_app && dart format lib/features/organizer/domain/league_stage_create lib/features/organizer/data/organizer_leagues_repository.dart lib/features/organizer/data/league_stage_tournament_factory.dart && flutter analyze lib/features/organizer && flutter test test/features/organizer/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/organizer nexago_app/test/features/organizer
git commit -m "fix(app): etapa de liga herda o esporte cru em vez de coagir

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Perfil do atleta mapeia "Futevôlei"

**Files:**
- Modify: `nexago_app/lib/features/athlete/domain/athlete_profile.dart:524-535`
- Test: `nexago_app/test/features/athlete/athlete_profile_sport_label_test.dart` (novo)

- [ ] **Step 1: Escrever o teste que falha**

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_options.dart';

void main() {
  test('todo rótulo de esporte do perfil resolve para um código do Firestore', () {
    for (final label in AthleteProfileOptions.sports) {
      final profile = AthleteProfile(
        id: 'u1',
        name: 'Atleta',
        sport: label,
        level: 'Iniciante 1',
        city: 'Goiânia',
      );
      final onboarding =
          profile.toFirestore()['sportOnboarding'] as Map<String, dynamic>;
      final levels = onboarding['levelsBySport'] as Map<String, dynamic>;
      expect(levels, isNotEmpty, reason: 'rótulo "$label" não virou código');
    }
  });

  test('Futevôlei vira FUTEVOLEI', () {
    final profile = AthleteProfile(
      id: 'u1',
      name: 'Atleta',
      sport: 'Futevôlei',
      level: 'Iniciante 1',
      city: 'Goiânia',
    );
    final onboarding =
        profile.toFirestore()['sportOnboarding'] as Map<String, dynamic>;
    final levels = onboarding['levelsBySport'] as Map<String, dynamic>;
    expect(levels.keys, contains('FUTEVOLEI'));
  });
}
```

`toFirestore()` monta `sportOnboarding` com `primarySportId` (derivado de `primarySportFirestoreId ?? _sportLabelToFirestoreId(sport)`) e `levelsBySport` preenchido para cada esporte matriculado, sem depender de `onboardingCompleted`. Para "Futevôlei" hoje `primarySportId` sai `null` e `levelsBySport` fica vazio: é exatamente o que o teste pega.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nexago_app && flutter test test/features/athlete/athlete_profile_sport_label_test.dart`
Expected: FAIL no primeiro teste em "Futevôlei" e no segundo.

- [ ] **Step 3: Implementar**

Em `_labelToAppSportId` (linha 524), adicionar a entrada que faltava e o comentário:

```dart
  /// Espelha `AthleteProfileOptions.sports` ↔ `AthleteFirestoreCodes`.
  /// Toda entrada da lista de rótulos precisa estar aqui (teste
  /// `athlete_profile_sport_label_test.dart`).
  static String? _labelToAppSportId(String label) {
    const map = {
      'Vôlei de praia': 'beach_volleyball',
      'Vôlei de quadra': 'indoor_volleyball',
      'Futevôlei': 'footvolley',
      'Futebol': 'football',
      'Basquete': 'basketball',
      'Tênis': 'tennis',
      'Beach tennis': 'beach_tennis',
      'Corrida': 'running',
      'Outros': 'other',
    };
    return map[label];
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd nexago_app && dart format lib/features/athlete/domain/athlete_profile.dart && flutter test test/features/athlete/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/athlete/domain/athlete_profile.dart nexago_app/test/features/athlete/athlete_profile_sport_label_test.dart
git commit -m "fix(app): rótulo Futevôlei do perfil não resolvia para código

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Portal do organizador preserva esporte desconhecido no torneio

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/tournament-create.model.ts:8,107,192` (helper + campo)
- Modify: `frontend/projects/organizer/src/app/painel/data/tournament-create-mapper.ts:149,226-228,390`
- Modify: `frontend/projects/organizer/src/app/painel/eventos/wizard/criar-torneio.component.ts:370-372,1432-1434`
- Test: `frontend/projects/organizer/src/app/painel/data/tournament-create.sport-raw.spec.ts` (novo)

**Interfaces:**
- Produces, em `tournament-create.model.ts`:
  - `export const KNOWN_TOURNAMENT_SPORTS: readonly TournamentSport[]`
  - `export interface ParsedTournamentSport { sport: TournamentSport; sportRaw: string | null }`
  - `export function parseTournamentSport(raw: unknown): ParsedTournamentSport`
  - `export function sportFirestoreValue(d: { sport: TournamentSport; sportRaw: string | null }): string`
  - `TournamentCreateDraft.sportRaw: string | null`
- O Task 10 reutiliza `parseTournamentSport` e `sportFirestoreValue`.

- [ ] **Step 1: Escrever o spec que falha**

```ts
// tournament-create.sport-raw.spec.ts
import { emptyTournamentDraft, parseTournamentSport, sportFirestoreValue } from './tournament-create.model';
import { tournamentDraftFromFirestore, tournamentDraftToFirestore } from './tournament-create-mapper';

describe('esporte desconhecido no wizard de torneio', () => {
  it('parseTournamentSport reconhece os 3 esportes do enum', () => {
    expect(parseTournamentSport('footvolley')).toEqual({ sport: 'footvolley', sportRaw: null });
  });

  it('parseTournamentSport guarda o valor cru quando não reconhece', () => {
    expect(parseTournamentSport('beachTennis')).toEqual({ sport: 'beachVolleyball', sportRaw: 'beachTennis' });
    expect(parseTournamentSport(' beach_tennis ')).toEqual({ sport: 'beachVolleyball', sportRaw: 'beach_tennis' });
  });

  it('doc sem sport não é esporte desconhecido', () => {
    expect(parseTournamentSport(undefined)).toEqual({ sport: 'beachVolleyball', sportRaw: null });
    expect(parseTournamentSport('')).toEqual({ sport: 'beachVolleyball', sportRaw: null });
  });

  it('torneio gravado com beachTennis carrega travado e salva beachTennis de volta', () => {
    const { draft } = tournamentDraftFromFirestore({ name: 'Copa BT', sport: 'beachTennis' }, 'torneio-bt');
    expect(draft.sport).toBe('beachVolleyball');
    expect(draft.sportRaw).toBe('beachTennis');

    const map = tournamentDraftToFirestore({
      draft: { ...draft, startAt: new Date(2026, 2, 28), endAt: new Date(2026, 2, 30) },
      managerId: 'm1',
      publish: false,
      isUpdate: true,
      existingListingStatus: 'draft',
    });
    expect(map['sport']).toBe('beachTennis');
  });

  it('draft novo nasce sem sportRaw e grava o enum', () => {
    const draft = emptyTournamentDraft();
    expect(draft.sportRaw).toBeNull();
    expect(sportFirestoreValue(draft)).toBe('beachVolleyball');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test organizer --watch=false --include='**/tournament-create.sport-raw.spec.ts'`
Expected: FAIL de compilação (`parseTournamentSport` não exportado).

- [ ] **Step 3: Implementar**

Em `tournament-create.model.ts`, após a linha 8:

```ts
export const KNOWN_TOURNAMENT_SPORTS: readonly TournamentSport[] = ['beachVolleyball', 'indoorVolleyball', 'footvolley'];

/** Leitura de `sport` vinda do Firestore. `sportRaw` só é preenchido quando o
 *  valor existe e o tipo não o representa: é o que volta pro doc no save, para
 *  esta versão do portal nunca rebaixar um esporte que não conhece (spec
 *  multiesporte 2026-10-03, fase 0). Ausente/vazio cai no default sem raw. */
export interface ParsedTournamentSport {
  sport: TournamentSport;
  sportRaw: string | null;
}

export function parseTournamentSport(raw: unknown): ParsedTournamentSport {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if ((KNOWN_TOURNAMENT_SPORTS as readonly string[]).includes(value)) {
    return { sport: value as TournamentSport, sportRaw: null };
  }
  return { sport: 'beachVolleyball', sportRaw: value || null };
}

/** O que gravar em `sport`. */
export function sportFirestoreValue(d: { sport: TournamentSport; sportRaw: string | null }): string {
  return d.sportRaw ?? d.sport;
}
```

Na interface `TournamentCreateDraft` (linha 107): `sport: TournamentSport;` seguido de `sportRaw: string | null;`. Em `emptyTournamentDraft()` (linha 192): `sportRaw: null,`.

Em `tournament-create-mapper.ts`: linha 149 `sport: sportFirestoreValue(draft),`; apagar `parseSport` (226-228); na linha 390:

```ts
    ...parseTournamentSport(data['sport']),
```

(no lugar de `sport: parseSport(data['sport']),`; o spread preenche `sport` e `sportRaw`). Importar `parseTournamentSport` e `sportFirestoreValue` de `./tournament-create.model`.

Em `criar-torneio.component.ts`, template (linha 370-372):

```html
                    <og-form-field label="Esporte">
                      @if (draft().sportRaw; as sportRaw) {
                        <div class="og-config-row"><span class="val">{{ sportRaw }}</span><span class="lbl">Não pode ser alterado nesta versão do painel.</span></div>
                      } @else {
                        <og-select-chips [options]="sportOptions" [active]="sportLabel[draft().sport]" (changed)="setSport($event)" />
                      }
                    </og-form-field>
```

E `reviewSport()` (linha 1432):

```ts
  protected reviewSport(): string {
    return this.draft().sportRaw ?? SPORT_LABEL[this.draft().sport];
  }
```

Rodar `cd frontend && npx tsc -p projects/organizer/tsconfig.app.json --noEmit` para achar qualquer literal de `TournamentCreateDraft` que agora exige `sportRaw` (specs incluídos; `tsconfig.spec.json` para esses) e completar com `sportRaw: null`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx ng test organizer --watch=false`
Expected: PASS em toda a suíte do organizador.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/data/tournament-create.model.ts frontend/projects/organizer/src/app/painel/data/tournament-create-mapper.ts frontend/projects/organizer/src/app/painel/eventos/wizard/criar-torneio.component.ts frontend/projects/organizer/src/app/painel/data/tournament-create.sport-raw.spec.ts
git commit -m "fix(organizer-web): torneio preserva esporte que o painel não conhece

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Se o `tsc` tiver exigido `sportRaw: null` em outros arquivos, incluí-los no `git add`.

---

### Task 10: Portal do organizador preserva esporte desconhecido ao adicionar etapa

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/league-create.model.ts:448,477,521`
- Test: `frontend/projects/organizer/src/app/painel/data/league-create.spec.ts` (bloco novo)

**Interfaces:**
- Consumes: `parseTournamentSport`, `sportFirestoreValue` do Task 9.
- Produces: `PublishedLeagueForStageAdd.sportRaw: string | null`; `export function publishedLeagueSport(data: Record<string, unknown>): ParsedTournamentSport`.

- [ ] **Step 1: Escrever o spec que falha**

Em `league-create.spec.ts`, acrescentar ao import de `./league-create.model` o nome `publishedLeagueSport` e um bloco:

```ts
describe('league-create · esporte da liga publicada', () => {
  it('liga gravada com beachTennis mantém o valor cru para as etapas', () => {
    expect(publishedLeagueSport({ sport: 'beachTennis' })).toEqual({ sport: 'beachVolleyball', sportRaw: 'beachTennis' });
  });

  it('liga de futevôlei é reconhecida sem raw', () => {
    expect(publishedLeagueSport({ sport: 'footvolley' })).toEqual({ sport: 'footvolley', sportRaw: null });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test organizer --watch=false --include='**/league-create.spec.ts'`
Expected: FAIL, `publishedLeagueSport` não exportado.

- [ ] **Step 3: Implementar**

Em `league-create.model.ts`, importar `parseTournamentSport`, `sportFirestoreValue` e `type ParsedTournamentSport` de `./tournament-create.model`. Na interface `PublishedLeagueForStageAdd` (linha 448): `sport: TournamentSport;` seguido de `sportRaw: string | null;`. Antes de `getPublishedLeagueForStageAdd`:

```ts
/** Esporte da liga lido do doc, preservando o valor cru quando o tipo não o
 *  representa (mesma regra de `parseTournamentSport`). */
export function publishedLeagueSport(data: Record<string, unknown>): ParsedTournamentSport {
  return parseTournamentSport(data['sport']);
}
```

Na linha 477, trocar o ternário por:

```ts
    ...publishedLeagueSport(data),
```

Na linha 521 (`tournamentDoc` em `saveLeagueStage`): `sport: sportFirestoreValue(league),`.

Rodar `npx tsc -p projects/organizer/tsconfig.spec.json --noEmit` para achar literais de `PublishedLeagueForStageAdd` em specs e completar com `sportRaw: null`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx ng test organizer --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/data/league-create.model.ts frontend/projects/organizer/src/app/painel/data/league-create.spec.ts
git commit -m "fix(organizer-web): etapa de liga herda o esporte cru em vez de coagir

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Verificação final e PR

**Files:** nenhum novo.

- [ ] **Step 1: Confirmar que nenhuma coerção sobrou**

Run:
```bash
grep -rn "TournamentSport.beachVolleyball" nexago_app/lib/features/organizer/data nexago_app/lib/features/organizer/domain/*/*_session.dart
grep -rn "'beachVolleyball'" frontend/projects/organizer/src/app/painel/data/tournament-create-mapper.ts frontend/projects/organizer/src/app/painel/data/league-create.model.ts
```
Expected: as únicas ocorrências são o default de `parseTournamentSport`/`parseTournamentSport` (uma por plataforma) e `emptyTournamentDraft`/`emptyLeagueDraft`. Nenhum `_parseSport`, nenhum ternário `=== 'indoorVolleyball' || === 'footvolley'`.

- [ ] **Step 2: Suítes completas**

Run, em sequência:
```bash
cd functions && npm test && npm run test:rules
cd nexago_app && flutter analyze && flutter test
cd frontend && npx ng test organizer --watch=false
```
Expected: tudo PASS. Colar a última linha de cada suíte na descrição do PR.

- [ ] **Step 3: Abrir o PR**

```bash
git push -u origin claude/multi-sport-architecture-f9e84a
gh pr create --title "Multiesporte fase 0: estancar coerção de esporte" --body "$(cat <<'EOF'
## O que muda
Fase 0 do spec `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md`.

- App e portal do organizador preservam `sport` que não reconhecem (`sportRaw`) em vez de regravar como `beachVolleyball`; o seletor fica travado com aviso.
- Rules congelam `sport` de torneio e liga depois de criado (só admin muda; mesmo valor passa; doc legado sem o campo pode recebê-lo).
- Sorteio ao vivo lia `sportId` (campo inexistente) e ignorava nível por esporte.
- Confronto direto comparava código de perfil com enum do torneio.
- Bora Jogar aceita/normaliza só códigos de perfil.
- Perfil do atleta: rótulo "Futevôlei" não resolvia para código.

## Por quê
Antes de qualquer esporte novo existir na base (fase 1 abre beach tennis), o app da loja precisa parar de reescrever o esporte ao reeditar.

## Testes
(colar as linhas finais das suítes do Step 2)

## Rollout
Rules e functions no deploy normal. App: nada muda para quem só cria vôlei/futevôlei. O build que contém esta fase precisa estar na loja antes da fase 1 subir qualquer torneio de beach tennis.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
