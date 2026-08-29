# Substituição de Atleta até a Geração das Chaves — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que uma dupla/equipe inscrita substitua um atleta, por convite aceito pelo substituto, até a publicação das chaves da categoria — no backend (Cloud Functions), no app Flutter e no portal do atleta (Angular).

**Architecture:** Convite de substituição vive na coleção existente `tournamentRegistrationInvites` (campos novos `isSubstitutionInvite`, `replacedUid`, `replacedName`, `attachRegistrationId`). Callable nova `sendTournamentSubstitutionInvite` em arquivo próprio (`tournament-substitution.ts`); aceite/recusa reutilizam as callables existentes com um branch que delega via `await import()` (evita ciclo de módulos). O gate lê `tournaments/{id}.categoryOps[categoryId].bracketStatus` — primeira trava server-side sobre esse campo — no envio E dentro da transação do aceite. O `teamId` nunca muda; `participantUids` troca preservando o índice (slots de uniforme da dupla dependem da ordem).

**Tech Stack:** Firebase Cloud Functions v2 (TS, CJS), Firestore, matriz de testes no emulador (`npm run test:registrations`, `--test-concurrency=1`), Flutter/Riverpod, Angular 20 standalone/signals/zoneless.

**Spec:** `docs/superpowers/specs/2026-08-29-athlete-substitution-design.md`

## Global Constraints

- Strings/UI em português; código em inglês (CLAUDE.md).
- Toda mutação de inscrição/equipe é via Cloud Function (Admin SDK) — rules bloqueiam cliente.
- `participantUids`: ordem significativa (índice 0 = slot Player1, 1 = Player2).
- `teamId` da inscrição NUNCA muda numa substituição.
- Gate: `categoryOps[categoryId].bracketStatus` ∈ {`published`, `completed`} bloqueia; `draft` não. Também bloqueiam: torneio cancelado, `category.isCompleted`.
- NÃO chamar `assertTournamentAcceptsRegistration` no fluxo de substituição — a troca deve funcionar com inscrições encerradas.
- Pagamento herdado: `sharePaidUids`/`organizerConfirmedShareUids` trocam out→in; `isPaid`/`paidAmount` intocados.
- `captainUid` nunca é substituído. Dupla: qualquer membro troca qualquer vaga; equipe (trio+): só o capitão, nunca a si.
- TTL do convite: 48h (`INVITE_TTL_MS` existente).
- Mensagem do gate (copy exata): "As chaves desta categoria já foram publicadas — substituições não são mais possíveis. Fale com o organizador."
- `FieldValue.serverTimestamp()` NÃO funciona dentro de elemento de array — usar `Timestamp.now()` no `substitutionHistory`.
- Testes matrix: `cd functions && npm run test:registrations` (emulador Firestore, callables reais via `.run()`).
- Worktree: ler arquivos INTEIROS antes de editar (memória `subagent-worktree-verification`).

## File Map

| Arquivo | Papel |
|---|---|
| `functions/src/tournament-substitution-logic.ts` (novo) | Lógica pura: gate, permissão de vaga, troca posicional |
| `functions/src/tournament-substitution-logic.test.ts` (novo) | Testes unitários da lógica pura (node:test, compilado p/ lib) |
| `functions/src/tournament-substitution.ts` (novo) | Callable de envio + handler de aceite + sweep de stale |
| `functions/src/tournament-partner-invite.ts` | Branch de aceite/recusa, exclusões de sweeps, export `INVITE_TTL_MS` |
| `functions/src/organizer-category-ops.ts` | Chama o sweep ao publicar chave |
| `functions/src/index.ts` | Export da callable nova |
| `functions/test/registration-harness.mjs` | Callable nova + helpers de seed |
| `functions/test/registration-substituicao.test.mjs` (novo) | Matriz de testes da substituição |
| `firestore.rules` + `functions/test/inscription-substitution-history.rules.test.mjs` (novo) | `substitutionHistory` imutável p/ cliente |
| `nexago_app/lib/features/tournaments/domain/tournament_discovery_models.dart` | `bracketPublished` na offer, `captainUid`/histórico na inscrição |
| `nexago_app/lib/features/tournaments/data/tournament_document_mapper.dart` | Parse do `bracketStatus` |
| `nexago_app/lib/features/tournaments/data/my_tournament_registrations_repository.dart` | Parse `captainUid` + `substitutionHistory` |
| `nexago_app/lib/features/tournaments/domain/tournament_partner_invite.dart` | Campos de substituição no convite |
| `nexago_app/lib/features/tournaments/domain/tournament_substitution_logic.dart` (novo) | Lógica pura client (vagas trocáveis) |
| `nexago_app/lib/features/tournaments/data/tournament_partner_invite_service.dart` | `sendSubstitutionInvite` |
| `nexago_app/lib/features/tournaments/presentation/widgets/tournament_registration/tournament_substitution_sheet.dart` (novo) | Sheet de substituição |
| `nexago_app/lib/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_my_registration_tab.dart` | Ação "Substituir atleta" + histórico |
| `nexago_app/lib/features/tournaments/presentation/tournament_partner_invite_page.dart` | Variante de copy do convite |
| `frontend/projects/athlete/src/app/data/tournament-registrations-repository.ts` | Wrapper + parses novos |
| `frontend/projects/athlete/src/app/tournaments/tabs/substitution-view.ts` (novo) + `.spec.ts` | Lógica pura portal |
| `frontend/projects/athlete/src/app/tournaments/tabs/substitution-dialog.component.ts` (novo) | Dialog de substituição |
| `frontend/projects/athlete/src/app/tournaments/tabs/registration-tab.component.{ts,html}` | Botão + gate + histórico |
| `frontend/projects/athlete/src/app/shared/partner-invite/invite-announcement.ts` + `.spec.ts` | Copy do anunciador |
| `docs/business-rules/registrations.md` | Regra de negócio documentada |

---

### Task 1: Lógica pura do backend (`tournament-substitution-logic.ts`)

**Files:**
- Create: `functions/src/tournament-substitution-logic.ts`
- Create: `functions/src/tournament-substitution-logic.test.ts`

**Interfaces:**
- Consumes: `MIN_TEAM_CATEGORY_SIZE` de `./tournament-team-category`.
- Produces (Task 2/3 dependem): `substitutionBlockReason(tournament, category, categoryKeys): SubstitutionBlockReason | null`; `SUBSTITUTION_BLOCK_MESSAGES: Record<SubstitutionBlockReason, string>`; `SUBSTITUTION_MEMBER_LEFT_MESSAGE: string`; `substitutionPermissionError(params): string | null`; `replaceUidInList(list, outUid, inUid): string[]`.

- [ ] **Step 1: Escrever os testes que falham**

`functions/src/tournament-substitution-logic.test.ts`:

```ts
import {describe, test} from "node:test";
import assert from "node:assert/strict";
import {
  SUBSTITUTION_BLOCK_MESSAGES,
  replaceUidInList,
  substitutionBlockReason,
  substitutionPermissionError,
} from "./tournament-substitution-logic";

describe("substitutionBlockReason", () => {
  const keys = new Set(["cat-1", "Dupla Masculina"]);

  test("sem categoryOps: permitido", () => {
    assert.equal(substitutionBlockReason({}, {}, keys), null);
  });

  test("bracketStatus published bloqueia (por qualquer chave equivalente)", () => {
    const t = {categoryOps: {"Dupla Masculina": {bracketStatus: "published"}}};
    assert.equal(substitutionBlockReason(t, {}, keys), "bracket_published");
  });

  test("bracketStatus completed bloqueia; draft não", () => {
    assert.equal(
      substitutionBlockReason({categoryOps: {"cat-1": {bracketStatus: "completed"}}}, {}, keys),
      "bracket_published",
    );
    assert.equal(
      substitutionBlockReason({categoryOps: {"cat-1": {bracketStatus: "draft"}}}, {}, keys),
      null,
    );
  });

  test("torneio cancelado bloqueia", () => {
    assert.equal(substitutionBlockReason({listingStatus: "Cancelado"}, {}, keys), "tournament_cancelled");
  });

  test("categoria concluída bloqueia", () => {
    assert.equal(substitutionBlockReason({}, {isCompleted: true}, keys), "category_completed");
  });

  test("copy do gate cita as chaves publicadas", () => {
    assert.match(SUBSTITUTION_BLOCK_MESSAGES.bracket_published, /chaves.*publicadas/i);
  });
});

describe("substitutionPermissionError", () => {
  const dupla = {participantUids: ["a", "b"], teamSize: 2, captainUid: ""};

  test("dupla: membro troca a própria vaga e a do parceiro", () => {
    assert.equal(substitutionPermissionError({...dupla, initiatorUid: "a", replacedUid: "a", inviteeUid: "c"}), null);
    assert.equal(substitutionPermissionError({...dupla, initiatorUid: "a", replacedUid: "b", inviteeUid: "c"}), null);
  });

  test("quem não é da inscrição não inicia", () => {
    assert.match(
      substitutionPermissionError({...dupla, initiatorUid: "x", replacedUid: "a", inviteeUid: "c"}) ?? "",
      /não é um dos atletas/i,
    );
  });

  test("substituto não pode já estar na inscrição nem ser o iniciador", () => {
    assert.match(
      substitutionPermissionError({...dupla, initiatorUid: "a", replacedUid: "b", inviteeUid: "a"}) ?? "",
      /já está nesta inscrição|si mesmo/i,
    );
  });

  const equipe = {participantUids: ["cap", "m1", "m2"], teamSize: 3, captainUid: "cap"};

  test("equipe: só o capitão inicia", () => {
    assert.match(
      substitutionPermissionError({...equipe, initiatorUid: "m1", replacedUid: "m2", inviteeUid: "c"}) ?? "",
      /capitão/i,
    );
    assert.equal(substitutionPermissionError({...equipe, initiatorUid: "cap", replacedUid: "m1", inviteeUid: "c"}), null);
  });

  test("equipe: capitão não substitui a si mesmo", () => {
    assert.match(
      substitutionPermissionError({...equipe, initiatorUid: "cap", replacedUid: "cap", inviteeUid: "c"}) ?? "",
      /capitão não pode ser substituído/i,
    );
  });
});

describe("replaceUidInList", () => {
  test("preserva a posição do uid trocado", () => {
    assert.deepEqual(replaceUidInList(["a", "b", "c"], "b", "x"), ["a", "x", "c"]);
  });
  test("uid ausente: lista intacta", () => {
    assert.deepEqual(replaceUidInList(["a", "b"], "z", "x"), ["a", "b"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm run build 2>&1 | head -20`
Expected: erro de compilação — `tournament-substitution-logic` não existe.

- [ ] **Step 3: Implementar a lógica pura**

`functions/src/tournament-substitution-logic.ts`:

```ts
/**
 * Substituição de atleta em inscrição de torneio — lógica pura.
 *
 * Regra de negócio: a troca é permitida ATÉ a publicação das chaves da
 * categoria (`categoryOps[categoryId].bracketStatus`). Dupla: qualquer membro
 * troca qualquer vaga; equipe (trio+): só o capitão, e nunca a própria vaga.
 * Efeitos (Firestore, Asaas, notificações) ficam em tournament-substitution.ts.
 */
import {MIN_TEAM_CATEGORY_SIZE} from "./tournament-team-category";

export type SubstitutionBlockReason =
  | "bracket_published"
  | "tournament_cancelled"
  | "category_completed";

export const SUBSTITUTION_BLOCK_MESSAGES: Record<SubstitutionBlockReason, string> = {
  bracket_published:
    "As chaves desta categoria já foram publicadas — substituições não são " +
    "mais possíveis. Fale com o organizador.",
  tournament_cancelled: "Este torneio foi cancelado.",
  category_completed: "Categoria já concluída.",
};

export const SUBSTITUTION_MEMBER_LEFT_MESSAGE = "Este atleta já saiu da equipe.";

/**
 * Motivo do bloqueio da substituição, ou `null` quando permitida.
 *
 * `categoryKeys` são as chaves equivalentes da categoria
 * (`resolveCategoryMatchKeys`): o organizador grava `categoryOps` pela chave
 * que o painel usa, e inscrições legadas podem usar o nome — checar todas.
 * `draft` NÃO trava: a chave em rascunho referencia `teamId`, que não muda.
 */
export function substitutionBlockReason(
  tournament: Record<string, unknown>,
  category: Record<string, unknown> | null,
  categoryKeys: Set<string>,
): SubstitutionBlockReason | null {
  const statusNorm = String(tournament.listingStatus ?? tournament.status ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ");
  if (["cancelled", "canceled", "cancelado", "cancelada"].includes(statusNorm)) {
    return "tournament_cancelled";
  }
  if (category?.isCompleted === true) return "category_completed";

  const ops = tournament.categoryOps;
  if (ops && typeof ops === "object") {
    for (const key of categoryKeys) {
      const entry = (ops as Record<string, unknown>)[key];
      if (!entry || typeof entry !== "object") continue;
      const bracketStatus = String(
        (entry as Record<string, unknown>).bracketStatus ?? "",
      ).trim();
      if (bracketStatus === "published" || bracketStatus === "completed") {
        return "bracket_published";
      }
    }
  }
  return null;
}

/** Erro de permissão de vaga, ou `null` quando o iniciador pode trocar. */
export function substitutionPermissionError(params: {
  initiatorUid: string;
  replacedUid: string;
  inviteeUid: string;
  participantUids: string[];
  /** `registrationTeamSize(registration, category)` — 2 = dupla. */
  teamSize: number;
  /** `""` quando dupla (sem capitão). */
  captainUid: string;
}): string | null {
  const {initiatorUid, replacedUid, inviteeUid, participantUids, teamSize, captainUid} = params;
  if (!participantUids.includes(initiatorUid)) {
    return "Você não é um dos atletas desta inscrição.";
  }
  if (!participantUids.includes(replacedUid)) {
    return "Este atleta não está nesta inscrição.";
  }
  if (participantUids.includes(inviteeUid)) {
    return "Este atleta já está nesta inscrição.";
  }
  if (inviteeUid === initiatorUid) {
    return "Você não pode se convidar como substituto.";
  }
  if (teamSize >= MIN_TEAM_CATEGORY_SIZE) {
    if (initiatorUid !== captainUid) {
      return "Apenas o capitão pode substituir atletas da equipe.";
    }
    if (replacedUid === captainUid) {
      return "O capitão não pode ser substituído.";
    }
  }
  return null;
}

/**
 * Troca [outUid] por [inUid] preservando a POSIÇÃO — os slots de uniforme da
 * dupla dependem do índice em `participantUids` (0 = Player1, 1 = Player2).
 */
export function replaceUidInList(list: string[], outUid: string, inUid: string): string[] {
  return list.map((id) => (id === outUid ? inUid : id));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd functions && npm run build && node --test lib/tournament-substitution-logic.test.js`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/tournament-substitution-logic.ts functions/src/tournament-substitution-logic.test.ts
git commit -m "feat(functions): lógica pura da substituição de atleta (gate + permissão de vaga)"
```

---

### Task 2: Callable `sendTournamentSubstitutionInvite`

**Files:**
- Create: `functions/src/tournament-substitution.ts`
- Modify: `functions/src/tournament-partner-invite.ts:75` (export `INVITE_TTL_MS`)
- Modify: `functions/src/index.ts` (import + export)
- Modify: `functions/test/registration-harness.mjs` (callable + helpers)
- Create: `functions/test/registration-substituicao.test.mjs`

**Interfaces:**
- Consumes: Task 1; de `tournament-partner-invite`: `INVITES_COLLECTION`, `INVITE_TTL_MS`, `asTournamentCategory`, `parseUniformPayload`, `validateUniformPayload`, `categoryRequiresUniform`, `registrationUniformForSlot`, `uniformByUidEntry`, `LGPD_TERM_VERSION`.
- Produces: callable `sendTournamentSubstitutionInvite({registrationId, replacedUid, replacedName, inviteeUid, inviteeName, inviterName})` → `{inviteId}`. Doc do convite: `{tournamentId, categoryId, inviterUid/Name, inviteeUid/Name, status: "pending", createdAt, expiresAt, isSubstitutionInvite: true, replacedUid, replacedName, attachRegistrationId, attachTeamId?, teamName?, teamSize?}`.

**Nota sobre ciclo de módulos:** `tournament-substitution.ts` importa estaticamente helpers de `tournament-partner-invite.ts`; a direção inversa (Task 3) usa `await import()` dinâmico dentro do handler. Nunca inverta isso.

- [ ] **Step 1: Exportar `INVITE_TTL_MS`**

Em `functions/src/tournament-partner-invite.ts`, trocar:

```ts
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;
```

por:

```ts
export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;
```

- [ ] **Step 2: Escrever os testes de envio (falham)**

Adicionar ao harness (`functions/test/registration-harness.mjs`), junto dos outros imports de callables:

```js
const substitution = await import('../lib/tournament-substitution.js');
```

e dentro de `callables`:

```js
  sendSubstitution: substitution.sendTournamentSubstitutionInvite,
```

e no fim do arquivo:

```js
/** Publica a chave da categoria direto no doc (o gate lê categoryOps). */
export async function publishBracket(tournamentId, categoryId) {
  await db.doc(`tournaments/${tournamentId}`).set(
    {categoryOps: {[categoryId]: {bracketStatus: 'published'}}},
    {merge: true},
  );
}

/** Marca cotas pagas direto no doc — o que interessa é o ESTADO, não o caminho. */
export async function markSharePaid(registrationId, uids, {isPaid = false} = {}) {
  await db.doc(`${INSCRIPTIONS}/${registrationId}`).set(
    {sharePaidUids: uids, ...(isPaid ? {isPaid: true, paidAmount: 100} : {})},
    {merge: true},
  );
}

export const markStaleSubstitutionInvitesForCategory =
  substitution.markStaleSubstitutionInvitesForCategory;
```

Criar `functions/test/registration-substituicao.test.mjs`:

```js
/**
 * Matriz da SUBSTITUIÇÃO de atleta: convite → aceite, permitida até a
 * publicação das chaves da categoria (categoryOps[categoryId].bracketStatus).
 */
import {beforeEach, describe, test} from 'node:test';
import assert from 'node:assert/strict';

import {
  INSCRIPTIONS,
  call,
  callExpectingError,
  callables,
  clearFirestore,
  db,
  duplaCategory,
  formDupla,
  formTeam,
  getInvite,
  getRegistration,
  getTeam,
  markSharePaid,
  publishBracket,
  seedMan,
  seedTournament,
  teamCategory,
} from './registration-harness.mjs';

beforeEach(clearFirestore);

/** Dupla A+B formada numa categoria masculina livre de nível. */
async function duplaFormada() {
  const a = await seedMan({uid: 'ana-a', name: 'Atleta A'});
  const b = await seedMan({uid: 'beto-b', name: 'Atleta B'});
  const c = await seedMan({uid: 'caio-c', name: 'Atleta C'});
  const tournamentId = await seedTournament({
    categories: [duplaCategory({id: 'masc', categoryName: 'Dupla Masculina'})],
  });
  const {registrationId, teamId} = await formDupla({
    tournamentId, categoryId: 'masc', inviterUid: a, inviteeUid: b,
  });
  return {a, b, c, tournamentId, registrationId, teamId};
}

function sendPayload(over = {}) {
  return {
    replacedName: 'Atleta B',
    inviteeName: 'Atleta C',
    inviterName: 'Atleta A',
    ...over,
  };
}

describe('substituição — envio do convite', () => {
  test('membro da dupla convida substituto para a vaga do parceiro', async () => {
    const {a, b, c, registrationId, teamId, tournamentId} = await duplaFormada();

    const {inviteId} = await call(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: c,
    }));

    const invite = await getInvite(inviteId);
    assert.equal(invite.isSubstitutionInvite, true);
    assert.equal(invite.replacedUid, b);
    assert.equal(invite.replacedName, 'Atleta B');
    assert.equal(invite.attachRegistrationId, registrationId);
    assert.equal(invite.attachTeamId, teamId);
    assert.equal(invite.tournamentId, tournamentId);
    assert.equal(invite.status, 'pending');
  });

  test('membro também indica substituto para a PRÓPRIA vaga', async () => {
    const {b, c, registrationId} = await duplaFormada();
    const {inviteId} = await call(callables.sendSubstitution, b, sendPayload({
      registrationId, replacedUid: b, inviteeUid: c, inviterName: 'Atleta B',
    }));
    assert.ok(inviteId);
  });

  test('quem não é da inscrição não inicia', async () => {
    const {b, c, registrationId} = await duplaFormada();
    const intruso = await seedMan({uid: 'intruso'});
    const msg = await callExpectingError(callables.sendSubstitution, intruso, sendPayload({
      registrationId, replacedUid: b, inviteeUid: c,
    }));
    assert.match(msg, /não é um dos atletas/i);
  });

  test('chave publicada bloqueia o envio', async () => {
    const {a, b, c, registrationId, tournamentId} = await duplaFormada();
    await publishBracket(tournamentId, 'masc');
    const msg = await callExpectingError(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: c,
    }));
    assert.match(msg, /chaves.*publicadas/i);
  });

  test('substituto já inscrito na categoria é recusado', async () => {
    const {a, b, registrationId, tournamentId} = await duplaFormada();
    const d = await seedMan({uid: 'davi-d'});
    const e = await seedMan({uid: 'edu-e'});
    await formDupla({tournamentId, categoryId: 'masc', inviterUid: d, inviteeUid: e});
    const msg = await callExpectingError(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: d,
    }));
    assert.match(msg, /já está inscrito/i);
  });

  test('um convite pendente por vaga', async () => {
    const {a, b, c, registrationId} = await duplaFormada();
    const d = await seedMan({uid: 'davi-d'});
    await call(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: c,
    }));
    const msg = await callExpectingError(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: d,
    }));
    assert.match(msg, /convite de substituição pendente/i);
  });

  test('substituto fora da faixa de nível da categoria é barrado', async () => {
    // Antes de fixar os códigos de nível, conferir os aceitos por levelRank:
    // grep -n "const LEVEL" -A 12 functions/src/category-level-eligibility.ts
    // e espelhar o padrão do teste de nível em registration-gates.test.mjs.
    const a = await seedMan({uid: 'ana-a', level: 'iniciante'});
    const b = await seedMan({uid: 'beto-b', level: 'iniciante'});
    const forte = await seedMan({uid: 'forte', level: 'avancado'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'inic', categoryName: 'Dupla Iniciante', level: 'iniciante'})],
    });
    const {registrationId} = await formDupla({
      tournamentId, categoryId: 'inic', inviterUid: a, inviteeUid: b,
    });
    const msg = await callExpectingError(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: forte,
    }));
    assert.match(msg, /não pode disputar a categoria/i);
  });

  test('equipe: só o capitão convida, e nunca para a própria vaga', async () => {
    const cap = await seedMan({uid: 'cap'});
    const m1 = await seedMan({uid: 'm1'});
    const m2 = await seedMan({uid: 'm2'});
    const sub = await seedMan({uid: 'sub'});
    const tournamentId = await seedTournament({
      categories: [teamCategory({id: 'trio', categoryName: 'Trio Livre', teamSize: 3, genderMode: 'free'})],
    });
    const {registrationId} = await formTeam({
      tournamentId, categoryId: 'trio', captainUid: cap, memberUids: [m1, m2],
    });

    const naoCapitao = await callExpectingError(callables.sendSubstitution, m1, sendPayload({
      registrationId, replacedUid: m2, inviteeUid: sub,
    }));
    assert.match(naoCapitao, /capitão/i);

    const capitaoSaindo = await callExpectingError(callables.sendSubstitution, cap, sendPayload({
      registrationId, replacedUid: cap, inviteeUid: sub,
    }));
    assert.match(capitaoSaindo, /capitão não pode ser substituído/i);

    const {inviteId} = await call(callables.sendSubstitution, cap, sendPayload({
      registrationId, replacedUid: m1, inviteeUid: sub,
    }));
    assert.ok(inviteId);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd functions && npm run test:registrations 2>&1 | tail -20`
Expected: falha — `../lib/tournament-substitution.js` não existe.

- [ ] **Step 4: Implementar a callable de envio**

Criar `functions/src/tournament-substitution.ts`:

```ts
/**
 * Substituição de atleta em inscrição de torneio — efeitos.
 *
 * Convite na coleção `tournamentRegistrationInvites` com
 * `isSubstitutionInvite: true` + `replacedUid` + `attachRegistrationId`
 * (o attach reaproveita os sweeps existentes: cancelamento da inscrição
 * cancela o convite junto). Aceite/recusa entram pelas callables existentes
 * (`acceptTournamentPartnerInvite`/`cancelTournamentPartnerInvite`), que
 * delegam para cá via import dinâmico — este arquivo importa helpers de
 * tournament-partner-invite, então a volta precisa ser lazy.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {assertTeamLevelEligibility} from "./category-level-eligibility";
import {assertTeamAgeEligibility} from "./category-age-eligibility";
import {
  assertMixedDuoGenderEligibility,
  assertTeamGenderEligibility,
} from "./category-gender-eligibility";
import {
  deliverNotificationToUser,
  markTournamentPartnerInviteInboxResponse,
} from "./notification-delivery";
import {tournamentManagerUids} from "./tournament-acl";
import {
  findCategory,
  loadTournamentData,
  resolveCategoryMatchKeys,
} from "./tournament-registration-guards";
import {formatCategoryInviteNotificationLabel} from "./category-display-labels";
import {
  artifactsInscriptionsPath,
  artifactsTeamsPath,
  getFirebaseProjectId,
} from "./firebase-paths";
import {
  MIN_TEAM_CATEGORY_SIZE,
  evaluateTeamJoin,
  extractTeamMemberUids,
  parseGenderComposition,
  registrationTeamSize,
  teamJoinDenialMessage,
} from "./tournament-team-category";
import {buildPairKey, loadCategoryRegistrationsTx} from "./tournament-pair-uniqueness";
import {
  normalizeAthleteGenderBucket,
  sharePaidUidsFromRegistration,
} from "./tournament-registration-pix-helpers";
import type {AthleteGenderBucket} from "./tournament-registration-pix-helpers";
import {loadUserGenderBucket} from "./tournament-team-roster";
import {deleteAsaasPaymentOrThrow} from "./asaas-booking-payment";
import {
  INVITES_COLLECTION,
  INVITE_TTL_MS,
  LGPD_TERM_VERSION,
  asTournamentCategory,
  categoryRequiresUniform,
  parseUniformPayload,
  registrationUniformForSlot,
  uniformByUidEntry,
  validateUniformPayload,
} from "./tournament-partner-invite";
import {
  SUBSTITUTION_BLOCK_MESSAGES,
  SUBSTITUTION_MEMBER_LEFT_MESSAGE,
  replaceUidInList,
  substitutionBlockReason,
  substitutionPermissionError,
} from "./tournament-substitution-logic";

function str(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function stringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => str(v)).filter((v) => v.length > 0);
}

function inviteExpiredAt(raw: unknown, nowMs: number): boolean {
  const ts = raw as Timestamp | undefined;
  return Boolean(ts && typeof ts.toMillis === "function" && ts.toMillis() < nowMs);
}

/**
 * Convite de substituição: [inviteeUid] entraria no LUGAR de [replacedUid] na
 * inscrição [registrationId]. Permitido até a publicação das chaves da
 * categoria. NÃO passa por `assertTournamentAcceptsRegistration`: a troca deve
 * funcionar com as inscrições já encerradas.
 */
export const sendTournamentSubstitutionInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");

  const registrationId = str(request.data?.registrationId);
  const replacedUid = str(request.data?.replacedUid);
  const inviteeUid = str(request.data?.inviteeUid);
  const inviteeName = str(request.data?.inviteeName) || "Atleta";
  const inviterName = str(request.data?.inviterName) || "Atleta";
  const replacedName = str(request.data?.replacedName) || "Atleta";
  if (!registrationId || !replacedUid || !inviteeUid) {
    throw new HttpsError(
      "invalid-argument",
      "registrationId, replacedUid e inviteeUid são obrigatórios.",
    );
  }

  const projectId = getFirebaseProjectId();
  const db = getFirestore();

  const regRef = db.collection(artifactsInscriptionsPath(projectId)).doc(registrationId);
  const regSnap = await regRef.get();
  if (!regSnap.exists) throw new HttpsError("not-found", "Inscrição não encontrada.");
  const registration = regSnap.data()!;

  const tournamentId = str(registration.tournamentId);
  const categoryId = str(registration.categoryId);
  const tournament = await loadTournamentData(db, projectId, tournamentId);
  if (!tournament) throw new HttpsError("not-found", "Torneio não encontrado.");
  const category = asTournamentCategory(findCategory(tournament, categoryId));
  if (!category) {
    throw new HttpsError("not-found", "Categoria não encontrada neste torneio.");
  }
  const categoryKeys = resolveCategoryMatchKeys(tournament, categoryId);

  const block = substitutionBlockReason(tournament, category, categoryKeys);
  if (block) {
    throw new HttpsError("failed-precondition", SUBSTITUTION_BLOCK_MESSAGES[block], {reason: block});
  }

  const participantUids = stringList(registration.participantUids);
  const teamSize = registrationTeamSize(registration, category);
  const permissionError = substitutionPermissionError({
    initiatorUid: uid,
    replacedUid,
    inviteeUid,
    participantUids,
    teamSize,
    captainUid: str(registration.captainUid),
  });
  if (permissionError) throw new HttpsError("failed-precondition", permissionError);

  // Elegibilidade do elenco PÓS-troca. Gênero com requireDeclared: false no
  // envio (padrão dos convites: ausente só bloqueia no aceite).
  const rosterAfter = replaceUidInList(participantUids, replacedUid, inviteeUid);
  await assertTeamLevelEligibility({db, tournament, category, uids: rosterAfter});
  await assertTeamAgeEligibility({db, tournament, category, uids: rosterAfter});
  if (teamSize >= MIN_TEAM_CATEGORY_SIZE) {
    const composition = parseGenderComposition(category, teamSize);
    if (composition) {
      const others = rosterAfter.filter((id) => id !== inviteeUid);
      const buckets = await Promise.all(others.map((m) => loadUserGenderBucket(db, m)));
      const joiningBucket = await loadUserGenderBucket(db, inviteeUid);
      const joinCheck = evaluateTeamJoin({
        teamSize,
        composition,
        currentBuckets: buckets,
        joiningBucket,
      });
      if (!joinCheck.ok) {
        throw new HttpsError("failed-precondition", teamJoinDenialMessage(joinCheck.reason));
      }
    }
  } else {
    await assertTeamGenderEligibility({db, category, uids: rosterAfter, requireDeclared: false});
    await assertMixedDuoGenderEligibility({db, category, uids: rosterAfter, requireDeclared: false});
  }

  // Substituto não pode já ter inscrição na categoria (qualquer forma dela).
  const inscriptionsSnap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();
  for (const doc of inscriptionsSnap.docs) {
    const data = doc.data();
    if (!categoryKeys.has(str(data.categoryId))) continue;
    if (stringList(data.participantUids).includes(inviteeUid) || str(data.player1Id) === inviteeUid) {
      throw new HttpsError("failed-precondition", "Este atleta já está inscrito nesta categoria.");
    }
  }

  // Um convite de substituição pendente por vaga; sem duplicar pro convidado.
  const invitesSnap = await db
    .collection(INVITES_COLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "pending")
    .get();
  const nowMs = Date.now();
  for (const doc of invitesSnap.docs) {
    const data = doc.data();
    if (data.isSubstitutionInvite !== true) continue;
    if (str(data.attachRegistrationId) !== registrationId) continue;
    if (inviteExpiredAt(data.expiresAt, nowMs)) continue;
    if (str(data.replacedUid) === replacedUid) {
      throw new HttpsError(
        "already-exists",
        "Já existe um convite de substituição pendente para esta vaga.",
      );
    }
    if (str(data.inviteeUid) === inviteeUid) {
      throw new HttpsError(
        "already-exists",
        "Já existe um convite de substituição pendente para este atleta.",
      );
    }
  }

  const teamId = str(registration.teamId);
  const teamName = str(registration.teamName);
  const ref = db.collection(INVITES_COLLECTION).doc();
  await ref.set({
    tournamentId,
    categoryId,
    inviterUid: uid,
    inviterName,
    inviteeUid,
    inviteeName,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(nowMs + INVITE_TTL_MS),
    isSubstitutionInvite: true,
    replacedUid,
    replacedName,
    // attach: os sweeps existentes (cancelamento da inscrição) matam o convite junto.
    attachRegistrationId: registrationId,
    ...(teamId ? {attachTeamId: teamId} : {}),
    ...(teamName ? {teamName} : {}),
    ...(teamSize >= MIN_TEAM_CATEGORY_SIZE ? {teamSize} : {}),
  });

  try {
    const categoryLabel = formatCategoryInviteNotificationLabel(category);
    const tournamentName = str(tournament.name);
    await deliverNotificationToUser({
      userId: inviteeUid,
      title: `${inviterName} te chamou como substituto`,
      body:
        `Entre no lugar de ${replacedName} na categoria ${categoryLabel} ` +
        `do ${tournamentName}.`,
      type: "tournament_substitution_invite",
      data: {inviteId: ref.id, tournamentId, categoryId, inviterUid: uid},
    });
  } catch (notifyError) {
    logger.warn("Falha ao notificar substituto convidado", {inviteId: ref.id, inviteeUid, notifyError});
  }

  logger.info("Tournament substitution invite sent", {
    inviteId: ref.id, tournamentId, categoryId, registrationId, inviterUid: uid, replacedUid, inviteeUid,
  });
  return {inviteId: ref.id};
});
```

- [ ] **Step 5: Exportar no `index.ts`**

Em `functions/src/index.ts`, adicionar após o bloco de import de `./tournament-team-registration`:

```ts
import {sendTournamentSubstitutionInvite} from "./tournament-substitution";
```

e no bloco `export {` que já lista `leaveTournamentTeamRegistration,` adicionar logo abaixo dela:

```ts
  sendTournamentSubstitutionInvite,
```

- [ ] **Step 6: Rodar e ver passar**

Run: `cd functions && npm run test:registrations 2>&1 | tail -20`
Expected: testes de envio PASS (os demais arquivos da matriz continuam verdes).

- [ ] **Step 7: Commit**

```bash
git add functions/src/tournament-substitution.ts functions/src/tournament-partner-invite.ts functions/src/index.ts functions/test/registration-harness.mjs functions/test/registration-substituicao.test.mjs
git commit -m "feat(functions): convite de substituição de atleta (envio + gate de chaves)"
```

---

### Task 3: Aceite da substituição

**Files:**
- Modify: `functions/src/tournament-substitution.ts` (handler `acceptSubstitutionInviteFor` + sweep)
- Modify: `functions/src/tournament-partner-invite.ts` (branch no aceite; secrets do Asaas; exclusões nos sweeps de equipe)
- Modify: `functions/test/registration-substituicao.test.mjs` (testes de aceite)

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: `acceptSubstitutionInviteFor({db, projectId, uid, inviteId, inviteeLgpdAccepted, inviteeUniformRaw})` → `{registrationId, teamId, tournamentId, categoryId}` (mesmo shape do aceite normal — clientes não mudam). Campo novo na inscrição: `substitutionHistory: [{outUid, outName, inUid, inName, byUid, at, outHadPaid}]`.

- [ ] **Step 1: Escrever os testes de aceite (falham)**

Adicionar a `functions/test/registration-substituicao.test.mjs`:

```js
async function enviarConvite({registrationId, replacedUid, inviteeUid, inviterUid}) {
  const {inviteId} = await call(callables.sendSubstitution, inviterUid, sendPayload({
    registrationId, replacedUid, inviteeUid,
  }));
  return inviteId;
}

describe('substituição — aceite', () => {
  test('dupla: substituto entra preservando o índice e o pagamento da vaga', async () => {
    const {a, b, c, registrationId, teamId} = await duplaFormada();
    await markSharePaid(registrationId, [b]);
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});

    const result = await call(callables.acceptInvite, c, {inviteId, lgpdAccepted: true});
    assert.equal(result.registrationId, registrationId);
    assert.equal(result.teamId, teamId, 'teamId nunca muda na troca');

    const reg = await getRegistration(registrationId);
    assert.deepEqual(reg.participantUids, [a, c], 'B era índice 1; C herda a posição');
    assert.deepEqual(reg.sharePaidUids, [c], 'a vaga paga segue paga, agora no nome do substituto');
    assert.ok(reg.lgpdAcceptedUids.includes(c));
    assert.equal(reg.substitutionHistory.length, 1);
    assert.equal(reg.substitutionHistory[0].outUid, b);
    assert.equal(reg.substitutionHistory[0].inUid, c);
    assert.equal(reg.substitutionHistory[0].outHadPaid, true);

    const team = await getTeam(teamId);
    assert.equal(team.player2Id, c, 'espelho legado acompanha');
    assert.equal(team.player1Id, a);

    const invite = await getInvite(inviteId);
    assert.equal(invite.status, 'accepted');
  });

  test('chave publicada entre o envio e o aceite bloqueia', async () => {
    const {a, b, c, registrationId, tournamentId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});
    await publishBracket(tournamentId, 'masc');
    const msg = await callExpectingError(callables.acceptInvite, c, {inviteId});
    assert.match(msg, /chaves.*publicadas/i);
  });

  test('quem sairia já saiu: aceite falha e convite vira stale', async () => {
    const {a, b, c, registrationId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});
    const d = await seedMan({uid: 'davi-d'});
    await db.doc(`${INSCRIPTIONS}/${registrationId}`).set(
      {participantUids: [a, d]}, {merge: true},
    );
    const msg = await callExpectingError(callables.acceptInvite, c, {inviteId});
    assert.match(msg, /já saiu da equipe/i);
    assert.equal((await getInvite(inviteId)).status, 'stale');
  });

  test('substituto que se inscreveu na categoria depois do convite é barrado', async () => {
    const {a, b, c, registrationId, tournamentId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});
    const d = await seedMan({uid: 'davi-d'});
    await formDupla({tournamentId, categoryId: 'masc', inviterUid: c, inviteeUid: d});
    const msg = await callExpectingError(callables.acceptInvite, c, {inviteId});
    assert.match(msg, /já possui inscrição/i);
  });

  test('equipe: capitão troca membro; uniformByUid e memberUids acompanham', async () => {
    const cap = await seedMan({uid: 'cap'});
    const m1 = await seedMan({uid: 'm1'});
    const m2 = await seedMan({uid: 'm2'});
    const sub = await seedMan({uid: 'sub'});
    const tournamentId = await seedTournament({
      categories: [teamCategory({id: 'trio', categoryName: 'Trio Livre', teamSize: 3, genderMode: 'free', uniformType: 'top_only'})],
    });
    const {registrationId, teamId} = await formTeam({
      tournamentId, categoryId: 'trio', captainUid: cap, memberUids: [m1, m2],
    });
    await call(callables.setUniform, m1, {registrationId, uniform: {sizeTop: 'M'}});

    const inviteId = await enviarConvite({registrationId, replacedUid: m1, inviteeUid: sub, inviterUid: cap});
    await call(callables.acceptInvite, sub, {inviteId, inviteeUniform: {sizeTop: 'G'}});

    const reg = await getRegistration(registrationId);
    assert.deepEqual(reg.participantUids, [cap, sub, m2], 'posição preservada');
    assert.equal(reg.uniformByUid?.[m1], undefined, 'uniforme de quem saiu é removido');
    assert.equal(reg.uniformByUid?.[sub]?.sizeTop, 'G');
    assert.equal(reg.partnerPending, false, 'troca não reabre o elenco');

    const team = await getTeam(teamId);
    assert.deepEqual(team.memberUids, [cap, sub, m2]);
  });

  test('aceite mata o convite concorrente da mesma vaga e os convites do substituto na categoria', async () => {
    const {a, b, c, registrationId, tournamentId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});
    // Convite de dupla pendente PARA o substituto na mesma categoria.
    const d = await seedMan({uid: 'davi-d'});
    const {inviteId: conviteDeD} = await call(callables.sendInvite, d, {
      tournamentId, categoryId: 'masc', inviteeUid: c, inviteeName: 'Atleta C', inviterName: 'Davi',
    });

    await call(callables.acceptInvite, c, {inviteId});
    assert.equal((await getInvite(conviteDeD)).status, 'stale');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm run test:registrations 2>&1 | tail -30`
Expected: aceites falham — `acceptTournamentPartnerInvite` trata o convite como convite de dupla comum.

- [ ] **Step 3: Implementar o handler de aceite**

Adicionar ao fim de `functions/src/tournament-substitution.ts`:

```ts
/** Parâmetros do aceite (chamado por `acceptTournamentPartnerInvite`). */
export interface AcceptSubstitutionParams {
  db: Firestore;
  projectId: string;
  /** Convidado (substituto), autenticado. */
  uid: string;
  inviteId: string;
  inviteeLgpdAccepted: boolean;
  inviteeUniformRaw: unknown;
}

export async function acceptSubstitutionInviteFor(
  params: AcceptSubstitutionParams,
): Promise<{registrationId: string; teamId: string; tournamentId: string; categoryId: string}> {
  const {db, projectId, uid, inviteId, inviteeLgpdAccepted, inviteeUniformRaw} = params;

  const inviteRef = db.collection(INVITES_COLLECTION).doc(inviteId);
  const preview = (await inviteRef.get()).data();
  if (!preview) throw new HttpsError("not-found", "Convite não encontrado.");
  if (preview.inviteeUid !== uid) {
    throw new HttpsError("permission-denied", "Este convite não é para você.");
  }
  if (preview.status !== "pending") {
    throw new HttpsError("failed-precondition", "Este convite não está mais pendente.");
  }

  const tournamentId = str(preview.tournamentId);
  const categoryId = str(preview.categoryId);
  const registrationId = str(preview.attachRegistrationId);
  const outUid = str(preview.replacedUid);
  if (!tournamentId || !registrationId || !outUid) {
    throw new HttpsError("failed-precondition", "Convite inválido.");
  }

  const tournament = await loadTournamentData(db, projectId, tournamentId);
  if (!tournament) throw new HttpsError("not-found", "Torneio não encontrado.");
  const category = asTournamentCategory(findCategory(tournament, categoryId));
  if (!category) throw new HttpsError("not-found", "Categoria não encontrada.");
  const categoryKeys = resolveCategoryMatchKeys(tournament, categoryId);

  const regRef = db.collection(artifactsInscriptionsPath(projectId)).doc(registrationId);
  const regPreview = (await regRef.get()).data();
  if (!regPreview) {
    throw new HttpsError("failed-precondition", "A inscrição não existe mais.");
  }

  // Quem sairia já saiu (leave, cancelamento, outra troca): o convite morre.
  // FORA da transação de propósito — marcar stale e lançar dentro dela
  // descartaria a escrita junto (mesmo padrão da expiração no aceite normal).
  const previewParticipants = stringList(regPreview.participantUids);
  if (!previewParticipants.includes(outUid)) {
    await inviteRef.update({
      status: "stale",
      staleReason: "member_left",
      staleAt: FieldValue.serverTimestamp(),
    });
    throw new HttpsError("failed-precondition", SUBSTITUTION_MEMBER_LEFT_MESSAGE);
  }

  // Elegibilidade do elenco pós-troca — requireDeclared: o aceite fecha a vaga.
  const rosterAfter = replaceUidInList(previewParticipants, outUid, uid);
  const teamSize = registrationTeamSize(regPreview, category);
  const isTeam = teamSize >= MIN_TEAM_CATEGORY_SIZE;
  await assertTeamLevelEligibility({db, tournament, category, uids: rosterAfter});
  await assertTeamAgeEligibility({db, tournament, category, uids: rosterAfter});
  if (!isTeam) {
    await assertTeamGenderEligibility({db, category, uids: rosterAfter, requireDeclared: true});
    await assertMixedDuoGenderEligibility({db, category, uids: rosterAfter, requireDeclared: true});
  }

  const inviteeUniform = parseUniformPayload(inviteeUniformRaw);
  validateUniformPayload(
    category,
    inviteeUniform,
    inviteeUniform != null && categoryRequiresUniform(category),
  );

  // Cobrança PIX aberta de quem sai morre ANTES de qualquer escrita (padrão do
  // cancelamento). O doc `pixPending/{uid}` tem o pagador como id.
  const outPixRef = regRef.collection("pixPending").doc(outUid);
  const outPixSnap = await outPixRef.get();
  if (outPixSnap.exists && outPixSnap.data()?.status !== "paid") {
    const asaasId = str(outPixSnap.data()?.asaasPaymentId);
    if (asaasId) {
      try {
        await deleteAsaasPaymentOrThrow(asaasId);
      } catch (e) {
        logger.error("Falha ao cancelar PIX do atleta substituído", {registrationId, asaasId, e});
        throw new HttpsError(
          "unavailable",
          "Não foi possível cancelar a cobrança PIX pendente do atleta que sai. Tente novamente.",
        );
      }
    }
  }

  const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));
  const teamsPath = artifactsTeamsPath(projectId);

  const result = await db.runTransaction(async (tx) => {
    const invite = (await tx.get(inviteRef)).data();
    if (!invite || invite.status !== "pending") {
      throw new HttpsError("failed-precondition", "Este convite não está mais pendente.");
    }
    const expiresAt = invite.expiresAt as Timestamp | undefined;
    if (expiresAt && expiresAt.toMillis() < Date.now()) {
      throw new HttpsError("failed-precondition", "Este convite expirou.");
    }

    // Gate re-lido DENTRO da transação: publicar a chave escreve no doc do
    // torneio, então esta leitura serializa a corrida publicar × aceitar.
    const tournamentTxSnap = await tx.get(db.doc(`tournaments/${tournamentId}`));
    const tournamentTx = tournamentTxSnap.exists ? tournamentTxSnap.data()! : tournament;
    const block = substitutionBlockReason(
      tournamentTx,
      findCategory(tournamentTx, categoryId),
      categoryKeys,
    );
    if (block) {
      throw new HttpsError("failed-precondition", SUBSTITUTION_BLOCK_MESSAGES[block], {reason: block});
    }

    const regSnap = await tx.get(regRef);
    if (!regSnap.exists) {
      throw new HttpsError("failed-precondition", "A inscrição não existe mais.");
    }
    const reg = regSnap.data()!;
    const participants = stringList(reg.participantUids);
    if (!participants.includes(outUid)) {
      throw new HttpsError("failed-precondition", SUBSTITUTION_MEMBER_LEFT_MESSAGE);
    }
    if (participants.includes(uid)) {
      throw new HttpsError("failed-precondition", "Você já está nesta inscrição.");
    }

    const teamId = str(reg.teamId);
    const teamRef = teamId ? db.doc(`${teamsPath}/${teamId}`) : null;
    const teamSnap = teamRef ? await tx.get(teamRef) : null;
    const team = teamSnap?.exists ? teamSnap.data()! : null;

    // Substituto sem OUTRA inscrição na categoria; dupla não pode repetir par.
    const categoryRegs = await loadCategoryRegistrationsTx(
      tx, inscriptionsRef, teamsPath, tournamentId, categoryKeys,
    );
    for (const parsed of categoryRegs) {
      if (parsed.registrationId === registrationId) continue;
      if (parsed.participantUids.includes(uid)) {
        throw new HttpsError("failed-precondition", "Você já possui inscrição nesta categoria.");
      }
    }
    if (!isTeam) {
      const remaining = participants.filter((id) => id !== outUid);
      const newPairKey = remaining.length > 0 ? buildPairKey(remaining[0], uid) : "";
      const duplicate =
        newPairKey.length > 0 &&
        categoryRegs.some(
          (parsed) => parsed.registrationId !== registrationId && parsed.pairKey === newPairKey,
        );
      if (duplicate) {
        throw new HttpsError(
          "failed-precondition",
          "Já existe uma dupla com vocês dois nesta categoria.",
        );
      }
    }

    // Composição de gênero (equipe) contra o elenco ATUAL menos quem sai —
    // relida na transação, como no aceite de convite de equipe.
    if (isTeam) {
      const composition = parseGenderComposition(category, teamSize);
      if (composition) {
        const buckets: Array<AthleteGenderBucket | null> = [];
        for (const memberUid of participants.filter((id) => id !== outUid)) {
          const userSnap = await tx.get(db.doc(`users/${memberUid}`));
          const gender = userSnap.exists ? userSnap.data()?.gender : undefined;
          buckets.push(normalizeAthleteGenderBucket(typeof gender === "string" ? gender : undefined));
        }
        const mySnap = await tx.get(db.doc(`users/${uid}`));
        const myGender = mySnap.exists ? mySnap.data()?.gender : undefined;
        const joinCheck = evaluateTeamJoin({
          teamSize,
          composition,
          currentBuckets: buckets,
          joiningBucket: normalizeAthleteGenderBucket(
            typeof myGender === "string" ? myGender : undefined,
          ),
        });
        if (!joinCheck.ok) {
          throw new HttpsError("failed-precondition", teamJoinDenialMessage(joinCheck.reason, "self"));
        }
      }
    }

    // ── escritas ──
    const outHadPaid = sharePaidUidsFromRegistration(reg).includes(outUid);
    const outIndex = participants.indexOf(outUid);
    const regUpdate: Record<string, unknown> = {
      participantUids: replaceUidInList(participants, outUid, uid),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (str(reg.player1Id) === outUid) regUpdate.player1Id = uid;
    if (outHadPaid) {
      regUpdate.sharePaidUids = replaceUidInList(sharePaidUidsFromRegistration(reg), outUid, uid);
    }
    const confirmedShares = stringList(reg.organizerConfirmedShareUids);
    if (confirmedShares.includes(outUid)) {
      regUpdate.organizerConfirmedShareUids = replaceUidInList(confirmedShares, outUid, uid);
    }
    if (isTeam) {
      regUpdate[`uniformByUid.${outUid}`] = FieldValue.delete();
      if (inviteeUniform) regUpdate[`uniformByUid.${uid}`] = uniformByUidEntry(inviteeUniform);
    } else {
      const slot = outIndex === 0 ? "Player1" : "Player2";
      for (const field of [
        `sizeTop${slot}`, `sizeShorts${slot}`, `jerseyNumber${slot}`, `jerseyName${slot}`,
      ]) {
        regUpdate[field] = FieldValue.delete();
      }
      if (inviteeUniform) {
        Object.assign(regUpdate, registrationUniformForSlot(inviteeUniform, slot));
      }
    }
    if (inviteeLgpdAccepted) {
      regUpdate.lgpdAcceptedUids = FieldValue.arrayUnion(uid);
      regUpdate[`lgpdAcceptedAt.${uid}`] = FieldValue.serverTimestamp();
      regUpdate.lgpdTermVersion = LGPD_TERM_VERSION;
    }
    // Trilha de auditoria. `Timestamp.now()`: serverTimestamp não entra em array.
    regUpdate.substitutionHistory = FieldValue.arrayUnion({
      outUid,
      outName: str(invite.replacedName) || "Atleta",
      inUid: uid,
      inName: str(invite.inviteeName) || "Atleta",
      byUid: str(invite.inviterUid),
      at: Timestamp.now(),
      outHadPaid,
    });
    tx.update(regRef, regUpdate);

    if (teamRef && team) {
      const teamUpdate: Record<string, unknown> = {
        memberUids: replaceUidInList(extractTeamMemberUids(team), outUid, uid),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (str(team.player1Id) === outUid) teamUpdate.player1Id = uid;
      if (str(team.player2Id) === outUid) teamUpdate.player2Id = uid;
      tx.update(teamRef, teamUpdate);
    }

    if (outPixSnap.exists) tx.delete(outPixRef);

    tx.update(inviteRef, {
      status: "accepted",
      registrationId,
      ...(teamId ? {teamId} : {}),
      acceptedAt: FieldValue.serverTimestamp(),
    });

    return {registrationId, teamId, tournamentId, categoryId};
  });

  await markStaleAfterSubstitutionAccept(db, {
    tournamentId, categoryId, registrationId, outUid, substituteUid: uid, acceptedInviteId: inviteId,
  });
  await notifySubstitutionCompleted(db, {
    tournament, category, invite: preview, result, outUid, substituteUid: uid,
    rosterAfter, isTeam,
  });

  try {
    await markTournamentPartnerInviteInboxResponse(uid, inviteId, "accepted", {
      tournamentId, categoryId, registrationId: result.registrationId,
    });
  } catch (inboxError) {
    logger.warn("Falha ao atualizar inbox do convite de substituição", {inviteId, uid, inboxError});
  }

  logger.info("Tournament substitution accepted", {inviteId, ...result, outUid, substituteUid: uid});
  return result;
}

/** Convites tornados obsoletos pelo aceite: outros convites de substituição da
 *  MESMA vaga e convites pendentes que tocam o substituto na categoria. */
async function markStaleAfterSubstitutionAccept(
  db: Firestore,
  params: {
    tournamentId: string;
    categoryId: string;
    registrationId: string;
    outUid: string;
    substituteUid: string;
    acceptedInviteId: string;
  },
): Promise<void> {
  const snap = await db
    .collection(INVITES_COLLECTION)
    .where("tournamentId", "==", params.tournamentId)
    .where("status", "==", "pending")
    .get();
  const batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    if (doc.id === params.acceptedInviteId) continue;
    const data = doc.data();
    const sameSlot =
      data.isSubstitutionInvite === true &&
      str(data.attachRegistrationId) === params.registrationId &&
      str(data.replacedUid) === params.outUid;
    const touchesSubstitute =
      str(data.categoryId) === params.categoryId &&
      (str(data.inviteeUid) === params.substituteUid || str(data.inviterUid) === params.substituteUid);
    if (!sameSlot && !touchesSubstitute) continue;
    batch.update(doc.ref, {
      status: "stale",
      staleReason: "accepted_other_invite",
      staleAt: FieldValue.serverTimestamp(),
    });
    count++;
  }
  if (count > 0) await batch.commit();
}

/** Avisos pós-fato (falha não desfaz a troca): quem saiu, o resto do elenco e
 *  quem opera o torneio. */
async function notifySubstitutionCompleted(
  db: Firestore,
  params: {
    tournament: Record<string, unknown>;
    category: Record<string, unknown>;
    invite: Record<string, unknown>;
    result: {registrationId: string; tournamentId: string; categoryId: string};
    outUid: string;
    substituteUid: string;
    rosterAfter: string[];
    isTeam: boolean;
  },
): Promise<void> {
  const {tournament, category, invite, result, outUid, substituteUid, rosterAfter, isTeam} = params;
  const inName = str(invite.inviteeName) || "O substituto";
  const outName = str(invite.replacedName) || "o atleta";
  const label = formatCategoryInviteNotificationLabel(category);
  const tournamentName = str(tournament.name);

  await deliverNotificationToUser({
    userId: outUid,
    title: "Você foi substituído",
    body:
      `${inName} entrou no seu lugar na categoria ${label} do ${tournamentName}. ` +
      `Fale com ${isTeam ? "o capitão" : "seu parceiro"} se isso não era esperado.`,
    type: "tournament_substitution_out",
    data: {tournamentId: result.tournamentId, categoryId: result.categoryId, registrationId: result.registrationId},
  }).catch(() => undefined);

  const remaining = rosterAfter.filter((id) => id !== substituteUid);
  await Promise.all(
    remaining.map((memberUid) =>
      deliverNotificationToUser({
        userId: memberUid,
        title: "Substituição concluída",
        body: `${inName} entrou no lugar de ${outName} na categoria ${label}.`,
        type: "tournament_substitution_completed",
        data: {tournamentId: result.tournamentId, categoryId: result.categoryId, registrationId: result.registrationId},
      }).catch(() => undefined),
    ),
  );

  try {
    const managers = await tournamentManagerUids(db, result.tournamentId, tournament);
    await Promise.all(
      managers.map((managerUid) =>
        deliverNotificationToUser({
          userId: managerUid,
          title: "Substituição de atleta",
          body: `${inName} entrou no lugar de ${outName} na categoria ${label}.`,
          type: "tournament_substitution_completed",
          data: {
            tournamentId: result.tournamentId,
            registrationId: result.registrationId,
            url: `/painel/eventos/${result.tournamentId}/inscricoes?registrationId=${result.registrationId}`,
          },
        }).catch(() => undefined),
      ),
    );
  } catch (notifyError) {
    logger.warn("Falha ao notificar organizador da substituição", {notifyError});
  }
}
```

- [ ] **Step 4: Branch no aceite + secrets + exclusões nos sweeps**

Em `functions/src/tournament-partner-invite.ts`:

(a) No `acceptTournamentPartnerInvite`, logo APÓS o bloco de expiração do preview (que termina em `throw new HttpsError("failed-precondition", "Este convite expirou.");` seguido de `}` e `}`), e ANTES de `const previewTournamentId = ...`, inserir:

```ts
  // Convite de SUBSTITUIÇÃO: fluxo próprio (gate de chaves, elegibilidade
  // pós-troca, herança de pagamento) — e sem `assertTournamentAcceptsRegistration`,
  // porque a troca vale com as inscrições encerradas. Import dinâmico para não
  // fechar ciclo de módulos (tournament-substitution importa helpers daqui).
  if (invitePreviewData.isSubstitutionInvite === true) {
    const {acceptSubstitutionInviteFor} = await import("./tournament-substitution");
    return await acceptSubstitutionInviteFor({
      db,
      projectId,
      uid,
      inviteId,
      inviteeLgpdAccepted,
      inviteeUniformRaw: request.data?.inviteeUniform,
    });
  }
```

(b) O aceite agora pode cancelar PIX no Asaas — adicionar os secrets na declaração da callable:

```ts
export const acceptTournamentPartnerInvite = onCall({
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT, ...asaasArenaSecrets],
}, async (request) => {
```

(c) Em `sendTeamCategoryInvite`, o filtro de `pendingInvites` ganha a exclusão (substituição não consome vaga — ela troca, não adiciona):

```ts
  const pendingInvites = invitesSnap.docs
    .map((d) => d.data())
    .filter(
      (d) =>
        String(d.attachRegistrationId ?? "").trim() === captainRegId &&
        d.isSubstitutionInvite !== true &&
        !inviteExpired(d, nowMs),
    );
```

(d) Em `markStaleTeamInvitesAfterRosterFull`, dentro do `for`, logo após `const data = doc.data();`:

```ts
    // Convite de substituição não é vaga prometida: elenco completo não o invalida.
    if (data.isSubstitutionInvite === true) continue;
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd functions && npm run test:registrations 2>&1 | tail -30`
Expected: todos os testes de `registration-substituicao` PASS; nenhuma regressão nos demais `registration-*`.

- [ ] **Step 6: Commit**

```bash
git add functions/src/tournament-substitution.ts functions/src/tournament-partner-invite.ts functions/test/registration-substituicao.test.mjs
git commit -m "feat(functions): aceite da substituição — troca posicional, pagamento herdado, gate re-checado"
```

---

### Task 4: Recusa notificada + convites expirados na publicação da chave

**Files:**
- Modify: `functions/src/tournament-substitution.ts` (`markStaleSubstitutionInvitesForCategory`)
- Modify: `functions/src/tournament-partner-invite.ts` (`cancelTournamentPartnerInvite` — notificação na recusa)
- Modify: `functions/src/organizer-category-ops.ts` (chamada do sweep após publicar)
- Modify: `functions/test/registration-substituicao.test.mjs`

**Interfaces:**
- Produces: `markStaleSubstitutionInvitesForCategory(db, tournamentId, categoryId): Promise<number>`; notificação `tournament_substitution_declined` ao iniciador na recusa.

- [ ] **Step 1: Escrever os testes (falham)**

Adicionar a `functions/test/registration-substituicao.test.mjs` (import extra no topo: `markStaleSubstitutionInvitesForCategory` de `./registration-harness.mjs`):

```js
describe('substituição — recusa e publicação da chave', () => {
  test('recusa notifica quem iniciou', async () => {
    const {a, b, c, registrationId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});

    await call(callables.cancelInvite, c, {inviteId, asDecline: true});

    assert.equal((await getInvite(inviteId)).status, 'declined');
    const notifications = await db.collection(`users/${a}/notifications`).get();
    const types = notifications.docs.map((d) => d.data().type);
    assert.ok(types.includes('tournament_substitution_declined'));
  });

  test('publicar a chave marca stale os convites de substituição pendentes da categoria', async () => {
    const {a, b, c, registrationId, tournamentId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});

    const count = await markStaleSubstitutionInvitesForCategory(db, tournamentId, 'masc');

    assert.equal(count, 1);
    const invite = await getInvite(inviteId);
    assert.equal(invite.status, 'stale');
    assert.equal(invite.staleReason, 'bracket_published');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm run test:registrations 2>&1 | tail -20`
Expected: os dois novos testes FAIL.

- [ ] **Step 3: Implementar sweep + notificação de recusa**

Adicionar ao fim de `functions/src/tournament-substitution.ts`:

```ts
/**
 * Marca `stale` (bracket_published) os convites de substituição pendentes da
 * categoria. Chamado por `generateCategoryBracket` após publicar — o aceite
 * re-checa o gate de qualquer forma; isto só mantém o inbox limpo.
 */
export async function markStaleSubstitutionInvitesForCategory(
  db: Firestore,
  tournamentId: string,
  categoryId: string,
): Promise<number> {
  const snap = await db
    .collection(INVITES_COLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "pending")
    .get();
  const batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.isSubstitutionInvite !== true) continue;
    if (str(data.categoryId) !== categoryId) continue;
    batch.update(doc.ref, {
      status: "stale",
      staleReason: "bracket_published",
      staleAt: FieldValue.serverTimestamp(),
    });
    count++;
  }
  if (count > 0) await batch.commit();
  return count;
}
```

Em `functions/src/tournament-partner-invite.ts`, no `cancelTournamentPartnerInvite`, dentro do bloco `if (asDecline) {`, logo após `await inviteRef.update({status: "declined"});`, inserir:

```ts
    // Substituição: quem iniciou está esperando resolver um problema da equipe
    // — a recusa precisa chegar ativamente, não só sumir da lista.
    if (invite.isSubstitutionInvite === true) {
      const inviterUid = (invite.inviterUid as string | undefined)?.trim() ?? "";
      if (inviterUid) {
        try {
          await deliverNotificationToUser({
            userId: inviterUid,
            title: "Convite de substituição recusado",
            body:
              `${String(invite.inviteeName ?? "O atleta").trim() || "O atleta"} recusou entrar ` +
              `no lugar de ${String(invite.replacedName ?? "seu atleta").trim() || "seu atleta"}.`,
            type: "tournament_substitution_declined",
            data: {inviteId, tournamentId: String(invite.tournamentId ?? "").trim()},
          });
        } catch (notifyError) {
          logger.warn("Falha ao notificar recusa de substituição", {inviteId, notifyError});
        }
      }
    }
```

Em `functions/src/organizer-category-ops.ts`, no `generateCategoryBracket`, logo após `await batch.commit();`, inserir:

```ts
  // Convites de substituição pendentes morrem com a publicação da chave.
  try {
    const {markStaleSubstitutionInvitesForCategory} = await import("./tournament-substitution");
    await markStaleSubstitutionInvitesForCategory(db, tournamentId, categoryId);
  } catch (e) {
    logger.warn("generateCategoryBracket: falha ao expirar convites de substituição", {
      tournamentId, categoryId, e,
    });
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd functions && npm run test:registrations 2>&1 | tail -20` e `npm test 2>&1 | tail -5`
Expected: matriz completa PASS; suíte unitária PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/tournament-substitution.ts functions/src/tournament-partner-invite.ts functions/src/organizer-category-ops.ts functions/test/registration-substituicao.test.mjs
git commit -m "feat(functions): recusa notificada e convites de substituição expiram ao publicar a chave"
```

---

### Task 5: Rules — `substitutionHistory` imutável para o cliente

**Files:**
- Modify: `firestore.rules` (nova função + conjunção no update do atleta)
- Create: `functions/test/inscription-substitution-history.rules.test.mjs`

- [ ] **Step 1: Escrever o teste de rules (falha)**

`functions/test/inscription-substitution-history.rules.test.mjs`:

```js
// substitutionHistory é trilha de auditoria escrita só pelas Cloud Functions —
// o atleta não pode forjar nem apagar. Rodar:
// firebase emulators:exec --only firestore "node --test functions/test/inscription-substitution-history.rules.test.mjs"
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test, before, after} from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {doc, setDoc, updateDoc} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-rules-test-substitution';
const APP_ID = PROJECT_ID;
const UID = 'player1-uid';
const INSCRIPTION = `artifacts/${APP_ID}/public/data/inscriptions/reg-1`;
const TEAM = `artifacts/${APP_ID}/public/data/teams/team-1`;

let testEnv;
before(async () => {
  testEnv = await initializeTestEnvironment({projectId: PROJECT_ID, firestore: {rules}});
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, TEAM), {player1Id: UID, player2Id: 'player2-uid'});
    await setDoc(doc(db, INSCRIPTION), {
      tournamentId: 't1',
      categoryId: 'c1',
      teamId: 'team-1',
      participantUids: [UID, 'player2-uid'],
      isPaid: false,
      paidAmount: 0,
      substitutionHistory: [],
    });
  });
});
after(async () => testEnv.cleanup());

function athleteDb() {
  return testEnv.authenticatedContext(UID).firestore();
}

test('atleta ainda atualiza o próprio uniforme', async () => {
  await assertSucceeds(updateDoc(doc(athleteDb(), INSCRIPTION), {sizeTopPlayer1: 'M'}));
});

test('atleta não escreve substitutionHistory', async () => {
  await assertFails(
    updateDoc(doc(athleteDb(), INSCRIPTION), {
      substitutionHistory: [{outUid: 'player2-uid', inUid: 'forjado'}],
    }),
  );
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `firebase emulators:exec --only firestore "node --test functions/test/inscription-substitution-history.rules.test.mjs" 2>&1 | tail -10` (na raiz do repo)
Expected: "atleta não escreve substitutionHistory" FAIL (hoje o update passa).

- [ ] **Step 3: Editar as rules**

Em `firestore.rules`, logo após a função `inscriptionCancellationRequestFieldsUnchanged()`, adicionar:

```
    function inscriptionSubstitutionFieldsUnchanged() {
      // Histórico de substituição é escrito apenas pelas Cloud Functions
      // (aceite do convite de substituição): sem isto o atleta forjaria ou
      // apagaria a trilha da troca.
      return (!('substitutionHistory' in request.resource.data) ||
              request.resource.data.substitutionHistory == resource.data.substitutionHistory);
    }
```

E no `allow update` do match `/artifacts/{appId}/public/data/inscriptions/{registrationId}`, na conjunção do ramo do atleta (após `inscriptionCancellationRequestFieldsUnchanged() &&`), adicionar:

```
          inscriptionSubstitutionFieldsUnchanged() &&
```

- [ ] **Step 4: Rodar e ver passar**

Run: mesmo comando do Step 2.
Expected: 2 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules functions/test/inscription-substitution-history.rules.test.mjs
git commit -m "feat(rules): substitutionHistory imutável para o cliente"
```

---

### Task 6: Flutter — dados (mapper, modelos, service)

**Files:**
- Modify: `nexago_app/lib/features/tournaments/domain/tournament_discovery_models.dart`
- Modify: `nexago_app/lib/features/tournaments/data/tournament_document_mapper.dart`
- Modify: `nexago_app/lib/features/tournaments/data/my_tournament_registrations_repository.dart`
- Modify: `nexago_app/lib/features/tournaments/domain/tournament_partner_invite.dart`
- Modify: `nexago_app/lib/features/tournaments/data/tournament_partner_invite_service.dart`
- Create: `nexago_app/lib/features/tournaments/domain/tournament_substitution_logic.dart`
- Create: `nexago_app/test/features/tournaments/tournament_substitution_logic_test.dart`
- Test: `nexago_app/test/features/tournaments/bracket_published_mapper_test.dart` (novo)

**Interfaces:**
- Produces (Task 7/8 dependem): `TournamentCategoryOffer.bracketPublished: bool`; `MyTournamentRegistration.captainUid: String?` e `.substitutionHistory: List<RegistrationSubstitutionEntry>`; `TournamentPartnerInvite.isSubstitutionInvite/replacedUid/replacedName`; `TournamentPartnerInviteService.sendSubstitutionInvite(...) → Future<String>`; `substitutionReplaceableUids(...) → List<String>`.

- [ ] **Step 1: Testes que falham**

`nexago_app/test/features/tournaments/tournament_substitution_logic_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_substitution_logic.dart';

void main() {
  group('substitutionReplaceableUids', () {
    test('dupla: membro pode trocar qualquer vaga', () {
      expect(
        substitutionReplaceableUids(
          participantUids: ['a', 'b'],
          uid: 'a',
          teamSize: null,
          captainUid: null,
          partnerPending: false,
          bracketPublished: false,
        ),
        ['a', 'b'],
      );
    });

    test('chave publicada ou elenco incompleto: nada trocável', () {
      expect(
        substitutionReplaceableUids(
          participantUids: ['a', 'b'],
          uid: 'a',
          teamSize: null,
          captainUid: null,
          partnerPending: false,
          bracketPublished: true,
        ),
        isEmpty,
      );
      expect(
        substitutionReplaceableUids(
          participantUids: ['a'],
          uid: 'a',
          teamSize: null,
          captainUid: null,
          partnerPending: true,
          bracketPublished: false,
        ),
        isEmpty,
      );
    });

    test('equipe: só o capitão, e nunca a própria vaga', () {
      expect(
        substitutionReplaceableUids(
          participantUids: ['cap', 'm1', 'm2'],
          uid: 'm1',
          teamSize: 3,
          captainUid: 'cap',
          partnerPending: false,
          bracketPublished: false,
        ),
        isEmpty,
      );
      expect(
        substitutionReplaceableUids(
          participantUids: ['cap', 'm1', 'm2'],
          uid: 'cap',
          teamSize: 3,
          captainUid: 'cap',
          partnerPending: false,
          bracketPublished: false,
        ),
        ['m1', 'm2'],
      );
    });
  });
}
```

`nexago_app/test/features/tournaments/bracket_published_mapper_test.dart` (modelar imports/nomes em cima do existente `bracket_format_override_test.dart` — LER esse arquivo antes):

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_document_mapper.dart';

void main() {
  Map<String, dynamic> torneio({Map<String, dynamic>? categoryOps}) => {
        'name': 'Copa Teste',
        'categories': [
          {'id': 'cat-1', 'categoryName': 'Dupla Masculina'},
        ],
        if (categoryOps != null) 'categoryOps': categoryOps,
      };

  test('sem categoryOps: bracketPublished false', () {
    final detail = TournamentDocumentMapper.detailFromMap('t1', torneio());
    expect(detail.categoryOffers.single.bracketPublished, isFalse);
  });

  test('bracketStatus published liga o gate da categoria', () {
    final detail = TournamentDocumentMapper.detailFromMap(
      't1',
      torneio(categoryOps: {
        'cat-1': {'bracketStatus': 'published'},
      }),
    );
    expect(detail.categoryOffers.single.bracketPublished, isTrue);
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/tournament_substitution_logic_test.dart test/features/tournaments/bracket_published_mapper_test.dart`
Expected: erro de compilação (símbolos não existem).

- [ ] **Step 3: Implementar dados**

(a) `tournament_discovery_models.dart` — em `TournamentCategoryOffer`, adicionar ao construtor `this.bracketPublished = false,` e ao corpo:

```dart
  /// Chave da categoria publicada (`categoryOps[id].bracketStatus`): esconde a
  /// ação de substituição no cliente — o servidor é a autoridade do gate.
  final bool bracketPublished;
```

Em `MyTournamentRegistration` (mesmo arquivo), adicionar ao construtor `this.captainUid,` e `this.substitutionHistory = const [],` e ao corpo:

```dart
  /// Capitão da equipe (trio+); `null` em dupla.
  final String? captainUid;

  /// Trocas de atleta já feitas nesta inscrição (`substitutionHistory`).
  final List<RegistrationSubstitutionEntry> substitutionHistory;
```

E, no mesmo arquivo, a classe nova (sem imports de Firestore — domínio puro):

```dart
/// Registro de uma troca de atleta na inscrição, gravado pelo backend no
/// aceite do convite de substituição.
class RegistrationSubstitutionEntry {
  const RegistrationSubstitutionEntry({
    required this.outName,
    required this.inName,
    this.at,
  });

  final String outName;
  final String inName;
  final DateTime? at;
}
```

(b) `tournament_document_mapper.dart` — junto de `_categoryOpsOverride`, adicionar:

```dart
  /// `bracketStatus` publicado/concluído de `categoryOps[categoryId]` — gate
  /// client-side da substituição de atleta.
  static bool _categoryOpsBracketPublished(
    dynamic categoryOpsRaw,
    String categoryId,
  ) {
    if (categoryOpsRaw is! Map) return false;
    final entry = categoryOpsRaw[categoryId];
    if (entry is! Map) return false;
    final status = _str(entry['bracketStatus'])?.trim() ?? '';
    return status == 'published' || status == 'completed';
  }
```

E na construção da offer (onde já entra `bracketFormat: ...`), adicionar:

```dart
        bracketPublished: _categoryOpsBracketPublished(categoryOpsRaw, offerId),
```

(c) `my_tournament_registrations_repository.dart` — no `results.add(MyTournamentRegistration(...))`, adicionar:

```dart
          captainUid: (data['captainUid'] as String?)?.trim().isNotEmpty == true
              ? (data['captainUid'] as String).trim()
              : null,
          substitutionHistory: _substitutionHistoryFromData(data['substitutionHistory']),
```

E o helper estático (o arquivo já importa `cloud_firestore`):

```dart
  static List<RegistrationSubstitutionEntry> _substitutionHistoryFromData(
    dynamic raw,
  ) {
    if (raw is! List) return const [];
    final out = <RegistrationSubstitutionEntry>[];
    for (final item in raw) {
      if (item is! Map) continue;
      final at = item['at'];
      out.add(RegistrationSubstitutionEntry(
        outName: (item['outName'] as String?)?.trim() ?? 'Atleta',
        inName: (item['inName'] as String?)?.trim() ?? 'Atleta',
        at: at is Timestamp ? at.toDate() : null,
      ));
    }
    return out;
  }
```

(d) `tournament_partner_invite.dart` — em `TournamentPartnerInvite`, adicionar ao construtor `this.isSubstitutionInvite = false, this.replacedUid, this.replacedName,`, ao corpo:

```dart
  /// Convite de SUBSTITUIÇÃO: o convidado entraria no LUGAR de [replacedName]
  /// numa inscrição existente — não é vaga nova.
  final bool isSubstitutionInvite;
  final String? replacedUid;
  final String? replacedName;
```

e ao `fromFirestore`:

```dart
      isSubstitutionInvite: d['isSubstitutionInvite'] == true,
      replacedUid: _trimmedOrNull(d['replacedUid']),
      replacedName: _trimmedOrNull(d['replacedName']),
```

(e) `tournament_partner_invite_service.dart` — método novo após `sendInvite`:

```dart
  /// Convite de substituição: [inviteeUid] entraria no lugar de [replacedUid]
  /// na inscrição [registrationId]. Permitido até a publicação das chaves.
  Future<String> sendSubstitutionInvite({
    required String registrationId,
    required String replacedUid,
    required String replacedName,
    required String inviteeUid,
    required String inviteeName,
    required String inviterName,
  }) async {
    try {
      final callable =
          _functions.httpsCallable('sendTournamentSubstitutionInvite');
      final raw = await callable.call(<String, dynamic>{
        'registrationId': registrationId,
        'replacedUid': replacedUid,
        'replacedName': replacedName,
        'inviteeUid': inviteeUid,
        'inviteeName': inviteeName,
        'inviterName': inviterName,
      });
      final data = raw.data;
      final inviteId = data is Map ? data['inviteId'] as String? : null;
      if (inviteId == null || inviteId.isEmpty) {
        throw TournamentPartnerInviteException('Convite não foi criado.');
      }
      return inviteId;
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPartnerInviteException(
        e.message ?? 'Não foi possível enviar o convite de substituição.',
      );
    }
  }
```

(f) `tournament_substitution_logic.dart` (novo):

```dart
/// Substituição de atleta — lógica pura do lado do app.
///
/// Espelha a regra do backend (tournament-substitution-logic.ts): dupla troca
/// qualquer vaga; equipe (trio+) só pelo capitão, nunca a própria. O cliente
/// apenas ESCONDE a ação — o servidor é a autoridade.
library;

/// Vagas que [uid] pode pedir para substituir nesta inscrição.
/// Vazio = ação indisponível.
List<String> substitutionReplaceableUids({
  required List<String> participantUids,
  required String uid,
  required int? teamSize,
  required String? captainUid,
  required bool partnerPending,
  required bool bracketPublished,
}) {
  if (bracketPublished || partnerPending) return const [];
  if (!participantUids.contains(uid)) return const [];
  final isTeam = (teamSize ?? 2) >= 3;
  if (!isTeam) return participantUids;
  if (captainUid == null || uid != captainUid) return const [];
  return participantUids.where((id) => id != captainUid).toList();
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd nexago_app && flutter test test/features/tournaments/tournament_substitution_logic_test.dart test/features/tournaments/bracket_published_mapper_test.dart test/features/tournaments/my_tournament_registrations_repository_test.dart && flutter analyze lib/features/tournaments 2>&1 | tail -5`
Expected: PASS, sem novos issues no analyze.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/tournaments nexago_app/test/features/tournaments
git commit -m "feat(app): dados da substituição — gate no mapper, modelos e service"
```

---

### Task 7: Flutter — sheet de substituição + ação na Minha Inscrição

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/widgets/tournament_registration/tournament_substitution_sheet.dart`
- Modify: `nexago_app/lib/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_my_registration_tab.dart`

**Interfaces:**
- Consumes: Task 6 (`substitutionReplaceableUids`, `sendSubstitutionInvite`, `MyTournamentRegistration.captainUid/substitutionHistory`, `TournamentCategoryOffer.bracketPublished`); `usersRepositoryProvider.getUsersByIds`, `partnerSearchServiceProvider.searchPartners`, `authProvider`.
- Produces: `showTournamentSubstitutionSheet(context, {required MyTournamentRegistration registration, required List<String> replaceableUids})`.

Decisão de escopo (v1): a ação aparece só nos cards CONFIRMADOS (elenco completo — inscrições "em andamento" ainda podem se reorganizar pelos fluxos normais). O servidor aceita mais casos; a UI expõe o principal.

- [ ] **Step 1: Implementar o sheet**

`tournament_substitution_sheet.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/auth/auth_providers.dart';
import '../../../../../core/profiles/app_user_profile.dart';
import '../../../../../core/profiles/users_repository.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../data/partner_search_service.dart';
import '../../../data/tournament_partner_invite_service.dart';
import '../../../domain/tournament_discovery_models.dart';

/// Abre o fluxo "Substituir atleta": escolher a vaga → buscar o substituto →
/// enviar o convite. O substituto precisa ACEITAR para a troca acontecer.
Future<void> showTournamentSubstitutionSheet(
  BuildContext context, {
  required MyTournamentRegistration registration,
  required List<String> replaceableUids,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => TournamentSubstitutionSheet(
      registration: registration,
      replaceableUids: replaceableUids,
    ),
  );
}

class TournamentSubstitutionSheet extends ConsumerStatefulWidget {
  const TournamentSubstitutionSheet({
    super.key,
    required this.registration,
    required this.replaceableUids,
  });

  final MyTournamentRegistration registration;
  final List<String> replaceableUids;

  @override
  ConsumerState<TournamentSubstitutionSheet> createState() =>
      _TournamentSubstitutionSheetState();
}

class _TournamentSubstitutionSheetState
    extends ConsumerState<TournamentSubstitutionSheet> {
  Map<String, AppUserProfile> _members = const {};
  String? _replacedUid;
  final _searchController = TextEditingController();
  List<AppUserProfile> _results = const [];
  bool _searching = false;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _loadMembers();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadMembers() async {
    final members = await ref
        .read(usersRepositoryProvider)
        .getUsersByIds(widget.registration.participantUids);
    if (mounted) setState(() => _members = members);
  }

  String _nameOf(String uid) =>
      _members[uid]?.displayName.trim().isNotEmpty == true
          ? _members[uid]!.displayName
          : 'Atleta';

  Future<void> _search(String query) async {
    final uid = ref.read(authProvider).valueOrNull?.uid ?? '';
    setState(() => _searching = true);
    try {
      final results = await ref.read(partnerSearchServiceProvider).searchPartners(
            currentUserId: uid,
            categoryGenderType: widget.registration.category?.genderType,
            query: query,
          );
      if (!mounted) return;
      setState(() {
        _results = results
            .where((p) => !widget.registration.participantUids.contains(p.uid))
            .toList();
      });
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  Future<void> _send(AppUserProfile substitute) async {
    final replacedUid = _replacedUid;
    if (replacedUid == null || _sending) return;
    final myProfile =
        _members[ref.read(authProvider).valueOrNull?.uid ?? ''];
    setState(() => _sending = true);
    try {
      await ref.read(tournamentPartnerInviteServiceProvider).sendSubstitutionInvite(
            registrationId: widget.registration.registrationId,
            replacedUid: replacedUid,
            replacedName: _nameOf(replacedUid),
            inviteeUid: substitute.uid,
            inviteeName: substitute.displayName,
            inviterName: myProfile?.displayName ?? 'Atleta',
          );
      if (!mounted) return;
      Navigator.pop(context);
      showAppSnackBar(
        context,
        'Convite enviado. A troca acontece quando ${substitute.displayName} aceitar.',
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Substituir atleta',
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          Text(
            'A vaga (e o pagamento dela) passa para o substituto quando ele '
            'aceitar o convite. Válido até a publicação das chaves.',
            style: theme.textTheme.bodySmall
                ?.copyWith(color: colors.onSurfaceMuted),
          ),
          const SizedBox(height: 16),
          Text('Quem sai?', style: theme.textTheme.titleSmall),
          for (final uid in widget.replaceableUids)
            RadioListTile<String>(
              value: uid,
              groupValue: _replacedUid,
              onChanged: (v) => setState(() => _replacedUid = v),
              title: Text(_nameOf(uid)),
              contentPadding: EdgeInsets.zero,
              activeColor: AppColors.brand,
            ),
          if (_replacedUid != null) ...[
            const SizedBox(height: 8),
            TextField(
              controller: _searchController,
              onSubmitted: _search,
              textInputAction: TextInputAction.search,
              decoration: const InputDecoration(
                hintText: 'Buscar substituto por nome',
                prefixIcon: Icon(Icons.search),
              ),
            ),
            const SizedBox(height: 8),
            if (_searching)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator()),
              )
            else
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 280),
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: _results.length,
                  itemBuilder: (context, index) {
                    final profile = _results[index];
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(profile.displayName),
                      trailing: TextButton(
                        onPressed: _sending ? null : () => _send(profile),
                        child: const Text('Convidar'),
                      ),
                    );
                  },
                ),
              ),
          ],
        ],
      ),
    );
  }
}
```

Antes de finalizar: conferir o getter de nome de `AppUserProfile` com `grep -n "displayName\|String get name" nexago_app/lib/core/profiles/app_user_profile.dart` e usar o getter real (ajustar `displayName` se o nome for outro, ex.: `fullName`/`nickname`).

- [ ] **Step 2: Ligar a ação e o histórico na aba Minha Inscrição**

Em `tournament_detail_my_registration_tab.dart`:

(a) imports novos:

```dart
import '../../../../../core/auth/auth_providers.dart';
import '../../../domain/tournament_substitution_logic.dart';
import '../tournament_registration/tournament_substitution_sheet.dart';
```

(b) no `build` do state, calcular o uid: `final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';` e trocar a construção do card confirmado por:

```dart
        for (final reg in confirmed) ...[
          if (inProgress.isNotEmpty || reg != confirmed.first)
            const SizedBox(height: AppSpacing.md),
          _ConfirmedRegistrationCard(
            registration: reg,
            replaceableUids: substitutionReplaceableUids(
              participantUids: reg.participantUids,
              uid: uid,
              teamSize: reg.teamSize,
              captainUid: reg.captainUid,
              partnerPending: reg.partnerPending,
              bracketPublished: reg.category?.bracketPublished ?? false,
            ),
          ),
        ],
```

(c) `_ConfirmedRegistrationCard` ganha o parâmetro `required this.replaceableUids` (`final List<String> replaceableUids;`) e, no `Column` interno do card (depois da `Row` existente — envolver a `Row` atual num `Column` com `crossAxisAlignment: CrossAxisAlignment.stretch`), adicionar:

```dart
          if (registration.substitutionHistory.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            for (final entry in registration.substitutionHistory)
              Text(
                '${entry.inName} entrou no lugar de ${entry.outName}.',
                style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
              ),
          ],
          if (replaceableUids.isNotEmpty)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => showTournamentSubstitutionSheet(
                  context,
                  registration: registration,
                  replaceableUids: replaceableUids,
                ),
                icon: const Icon(Icons.swap_horiz_rounded, size: 18),
                label: const Text('Substituir atleta'),
              ),
            ),
```

- [ ] **Step 3: Verificar**

Run: `cd nexago_app && flutter analyze lib/features/tournaments 2>&1 | tail -5 && flutter test test/features/tournaments/ 2>&1 | tail -5`
Expected: sem novos issues; testes existentes verdes.

- [ ] **Step 4: Dispatch do flutter-test-engineer**

Acionar o agente `flutter-test-engineer` (obrigatório no projeto para funcionalidades Flutter novas) com o escopo: widget tests do sheet (renderiza vagas, busca e CTA) e do card com a ação visível/oculta pelo gate.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/tournaments nexago_app/test/features/tournaments
git commit -m "feat(app): substituir atleta na Minha Inscrição — sheet + histórico"
```

---

### Task 8: Flutter — variante do convite de substituição na tela de convite

**Files:**
- Modify: `nexago_app/lib/features/tournaments/presentation/tournament_partner_invite_page.dart`

**Interfaces:**
- Consumes: Task 6 (`invite.isSubstitutionInvite`, `invite.replacedName`).

O anunciador da home e a notificação abrem esta MESMA tela (`/torneios-convite/:id`) — uma variante aqui cobre todas as entradas.

- [ ] **Step 1: Editar as três copies**

(a) O rótulo do CTA de confirmação (hoje `'Aceitar e formar dupla'`):

```dart
    final continueLabel = category != null && categoryRequiresUniform(category)
        ? 'Continuar'
        : invite.isSubstitutionInvite
            ? 'Aceitar e entrar na vaga'
            : 'Aceitar e formar dupla';
```

(b) O CTA do passo de uniforme (hoje `'Confirmar e formar dupla'`):

```dart
                    : Text(
                        invite.isSubstitutionInvite
                            ? 'Confirmar e entrar na vaga'
                            : 'Confirmar e formar dupla',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
```

(c) Banner acima do `PartnerInviteHeroCard` (dentro do `Column` dos children do `SingleChildScrollView`, antes do hero):

```dart
                if (invite.isSubstitutionInvite) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.brand.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppColors.brand.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Text(
                      'Convite de substituição — você entraria no lugar de '
                      '${invite.replacedName ?? 'um atleta'}'
                      '${invite.teamName != null ? ' na equipe ${invite.teamName}' : ''}. '
                      'A vaga (e o pagamento dela) passa a ser sua ao aceitar.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurface,
                            height: 1.4,
                          ),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
```

- [ ] **Step 2: Verificar e commitar**

Run: `cd nexago_app && flutter analyze lib/features/tournaments/presentation/tournament_partner_invite_page.dart`
Expected: sem issues.

```bash
git add nexago_app/lib/features/tournaments/presentation/tournament_partner_invite_page.dart
git commit -m "feat(app): copy do convite de substituição na tela de convite"
```

---

### Task 9: Portal — camada de dados

**Files:**
- Modify: `frontend/projects/athlete/src/app/data/tournament-registrations-repository.ts`

**Interfaces:**
- Produces (Tasks 10–11 dependem): `sendSubstitutionInvite(functions, params) → Promise<{inviteId: string}>`; `TournamentPartnerInvite.isSubstitutionInvite: boolean` e `.replacedName: string | null`; `AthleteTournamentRegistration.substitutionHistory: RegistrationSubstitutionEntry[]`; `export interface RegistrationSubstitutionEntry {outName; inName; at}`.

- [ ] **Step 1: Editar o repositório**

(a) Interface + parse do histórico — junto das outras interfaces:

```ts
/** Uma troca de atleta já feita na inscrição (`substitutionHistory`), gravada
 *  pelo backend no aceite do convite de substituição. */
export interface RegistrationSubstitutionEntry {
  outName: string;
  inName: string;
  at: Date | null;
}

function substitutionHistoryFromDoc(v: unknown): RegistrationSubstitutionEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      outName: optionalStr(item['outName']) ?? 'Atleta',
      inName: optionalStr(item['inName']) ?? 'Atleta',
      at: toDate(item['at']),
    }));
}
```

Em `AthleteTournamentRegistration`, adicionar `substitutionHistory: RegistrationSubstitutionEntry[];` e em `registrationFromDoc`:

```ts
    substitutionHistory: substitutionHistoryFromDoc(data['substitutionHistory']),
```

(b) Convite: em `TournamentPartnerInvite`, adicionar:

```ts
  /** Convite de SUBSTITUIÇÃO: o convidado entraria no lugar de `replacedName`. */
  isSubstitutionInvite: boolean;
  replacedName: string | null;
```

e em `partnerInvitesFromDocs`, no objeto mapeado:

```ts
        isSubstitutionInvite: data['isSubstitutionInvite'] === true,
        replacedName: optionalStr(data['replacedName']),
```

(c) Wrapper da callable, após `sendPartnerInvite`:

```ts
/** Convite de substituição: `inviteeUid` entraria no lugar de `replacedUid` na
 *  inscrição. Permitido até a publicação das chaves da categoria. */
export async function sendSubstitutionInvite(
  functions: Functions,
  params: {
    registrationId: string;
    replacedUid: string;
    replacedName: string;
    inviteeUid: string;
    inviteeName: string;
    inviterName: string;
  },
): Promise<{ inviteId: string }> {
  try {
    const result = await httpsCallable<typeof params, { inviteId: string }>(
      functions,
      'sendTournamentSubstitutionInvite',
    )(params);
    return result.data;
  } catch (err) {
    throw mapCallableError(err);
  }
}
```

- [ ] **Step 2: Verificar compilação de TODOS os usos de `partnerInvitesFromDocs`**

Run: `cd frontend && grep -rn "partnerInvitesFromDocs\|TournamentPartnerInvite" projects/athlete/src --include=*.ts -l`
Specs que constroem `TournamentPartnerInvite` literalmente precisarão dos campos novos — adicionar `isSubstitutionInvite: false, replacedName: null,` aos literais dos specs que quebrarem.

Run: `cd frontend && npx ng build athlete 2>&1 | tail -5`
Expected: build verde.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/athlete/src/app
git commit -m "feat(athlete-web): dados da substituição no repositório de inscrições"
```

---

### Task 10: Portal — botão, dialog e histórico na Minha Inscrição

**Files:**
- Create: `frontend/projects/athlete/src/app/tournaments/tabs/substitution-view.ts`
- Create: `frontend/projects/athlete/src/app/tournaments/tabs/substitution-view.spec.ts`
- Create: `frontend/projects/athlete/src/app/tournaments/tabs/substitution-dialog.component.ts`
- Modify: `frontend/projects/athlete/src/app/tournaments/tabs/registration-tab.component.ts`
- Modify: `frontend/projects/athlete/src/app/tournaments/tabs/registration-tab.component.html`

**Interfaces:**
- Consumes: Task 9; `searchAthleteDirectory` de `data/public-profiles-repository`; `TournamentLiveStore` (`matches()`, `myRegistrations()`); mapa `athleteProfiles` já existente no tab.
- Produces: `substitutionSlots(registration, uid): string[]` (uids trocáveis); `SubstitutionDialogComponent` com inputs `slots: {uid; name}[]`, `busy: boolean`, `searchFn: (term: string) => Promise<{uid; name}[]>` e outputs `closed`, `send: {replacedUid; replacedName; inviteeUid; inviteeName}`.

Gate client-side no portal: partidas da categoria existem ⇔ chave publicada (`store.matches()` já é ao vivo e por categoria). O servidor continua sendo a autoridade.

- [ ] **Step 1: Spec da lógica pura (falha)**

`substitution-view.spec.ts`:

```ts
import { substitutionSlots } from './substitution-view';
import type { AthleteTournamentRegistration } from '../../data/tournament-registrations-repository';

function reg(over: Partial<AthleteTournamentRegistration>): AthleteTournamentRegistration {
  return {
    id: 'r1', tournamentId: 't1', categoryId: 'c1', teamId: 'team-1',
    partnerPending: false, isPaid: false, waitlist: false, cancellationRequest: null,
    sharePaidUids: [], declaredPaidAt: null, paymentVerifiedByOrganizer: false,
    player1Id: 'a', participantUids: ['a', 'b'], lgpdAcceptedUids: [],
    uniformPlayer1: { sizeTop: null, sizeShorts: null, jerseyNumber: null, jerseyName: null },
    uniformPlayer2: { sizeTop: null, sizeShorts: null, jerseyNumber: null, jerseyName: null },
    teamName: null, teamSize: null, captainUid: null, uniformByUid: {},
    substitutionHistory: [],
    ...over,
  };
}

describe('substitutionSlots', () => {
  it('dupla: membro pode trocar qualquer vaga', () => {
    expect(substitutionSlots(reg({}), 'a')).toEqual(['a', 'b']);
  });

  it('quem não é da inscrição, elenco incompleto: nada', () => {
    expect(substitutionSlots(reg({}), 'x')).toEqual([]);
    expect(substitutionSlots(reg({ partnerPending: true, participantUids: ['a'] }), 'a')).toEqual([]);
  });

  it('equipe: só o capitão, nunca a própria vaga', () => {
    const equipe = reg({ teamSize: 3, captainUid: 'cap', participantUids: ['cap', 'm1', 'm2'] });
    expect(substitutionSlots(equipe, 'm1')).toEqual([]);
    expect(substitutionSlots(equipe, 'cap')).toEqual(['m1', 'm2']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test athlete --watch=false 2>&1 | tail -10`
Expected: falha de compilação (`substitution-view` não existe).

- [ ] **Step 3: Implementar**

`substitution-view.ts`:

```ts
import type { AthleteTournamentRegistration } from '../../data/tournament-registrations-repository';

/** Vagas que `uid` pode pedir para substituir. Espelha a regra do backend
 *  (dupla: qualquer membro troca qualquer vaga; equipe: só o capitão, nunca a
 *  própria). O cliente só esconde a ação — o servidor é a autoridade. */
export function substitutionSlots(r: AthleteTournamentRegistration, uid: string | null): string[] {
  if (!uid || r.partnerPending || !r.participantUids.includes(uid)) return [];
  const isTeam = r.teamSize != null;
  if (!isTeam) return r.participantUids;
  if (r.captainUid !== uid) return [];
  return r.participantUids.filter((id) => id !== r.captainUid);
}
```

`substitution-dialog.component.ts` (standalone, OnPush, signals, template inline):

```ts
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

export interface SubstitutionSlot { uid: string; name: string; }
export interface SubstitutionCandidate { uid: string; name: string; }
export interface SubstitutionSendRequest {
  replacedUid: string;
  replacedName: string;
  inviteeUid: string;
  inviteeName: string;
}

/** Dialog "Substituir atleta": escolher a vaga → buscar o substituto → enviar
 *  o convite. A busca vem por `searchFn` (injetada pelo tab) para o componente
 *  ficar puro e testável. */
@Component({
  selector: 'app-substitution-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sub-backdrop" (click)="closed.emit()">
      <div class="sub-card" (click)="$event.stopPropagation()">
        <h3 class="sub-title">Substituir atleta</h3>
        <p class="sub-hint">
          A vaga (e o pagamento dela) passa para o substituto quando ele aceitar
          o convite. Válido até a publicação das chaves.
        </p>

        <strong class="sub-step">Quem sai?</strong>
        @for (slot of slots(); track slot.uid) {
          <label class="sub-slot">
            <input
              type="radio"
              name="sub-slot"
              [checked]="replaced()?.uid === slot.uid"
              (change)="replaced.set(slot)"
            />
            {{ slot.name }}
          </label>
        }

        @if (replaced()) {
          <input
            class="sub-search"
            type="search"
            placeholder="Buscar substituto por nome"
            [value]="term()"
            (input)="term.set($any($event.target).value)"
            (keydown.enter)="search()"
          />
          <button type="button" class="sub-search-btn" [disabled]="searching()" (click)="search()">
            {{ searching() ? 'Buscando…' : 'Buscar' }}
          </button>
          @for (candidate of results(); track candidate.uid) {
            <div class="sub-result">
              <span>{{ candidate.name }}</span>
              <button
                type="button"
                [disabled]="busy()"
                (click)="send.emit({
                  replacedUid: replaced()!.uid,
                  replacedName: replaced()!.name,
                  inviteeUid: candidate.uid,
                  inviteeName: candidate.name,
                })"
              >
                Convidar
              </button>
            </div>
          }
        }

        <button type="button" class="sub-close" (click)="closed.emit()">Fechar</button>
      </div>
    </div>
  `,
  styles: `
    .sub-backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.5); display: grid; place-items: center; z-index: 60; padding: 16px; }
    .sub-card { background: var(--nx-surface, #fff); color: inherit; border-radius: 16px; padding: 20px; width: min(420px, 100%); max-height: 85vh; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
    .sub-title { margin: 0; font-size: 1.05rem; }
    .sub-hint { margin: 0; font-size: 0.85rem; opacity: 0.75; }
    .sub-step { font-size: 0.9rem; }
    .sub-slot { display: flex; gap: 8px; align-items: center; font-size: 0.95rem; }
    .sub-search { padding: 10px 12px; border-radius: 10px; border: 1px solid rgb(128 128 128 / 0.35); background: transparent; color: inherit; }
    .sub-result { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 0; }
  `,
})
export class SubstitutionDialogComponent {
  readonly slots = input.required<SubstitutionSlot[]>();
  readonly busy = input(false);
  readonly searchFn = input.required<(term: string) => Promise<SubstitutionCandidate[]>>();
  readonly closed = output<void>();
  readonly send = output<SubstitutionSendRequest>();

  protected readonly replaced = signal<SubstitutionSlot | null>(null);
  protected readonly term = signal('');
  protected readonly results = signal<SubstitutionCandidate[]>([]);
  protected readonly searching = signal(false);

  protected async search(): Promise<void> {
    const term = this.term().trim();
    if (term.length < 2 || this.searching()) return;
    this.searching.set(true);
    try {
      this.results.set(await this.searchFn()(term));
    } finally {
      this.searching.set(false);
    }
  }
}
```

No `registration-tab.component.ts`:

(a) imports: `substitutionSlots` de `./substitution-view`; `SubstitutionDialogComponent, type SubstitutionSendRequest` de `./substitution-dialog.component`; `sendSubstitutionInvite` no import de `tournament-registrations-repository`; `searchAthleteDirectory` de `../../data/public-profiles-repository`. Adicionar `SubstitutionDialogComponent` ao array `imports` do decorator.

(b) `RegistrationCard` ganha:

```ts
  /** Vagas que o atleta logado pode substituir; vazio = ação oculta. */
  substitutionSlots: { uid: string; name: string }[];
  substitutionHistory: { outName: string; inName: string }[];
```

(c) em `cardOf(...)`, antes do `return`, calcular (gate: partidas da categoria existem ⇔ chave publicada):

```ts
    const bracketPublished = this.store.matches().some((m) => m.categoryId === r.categoryId);
    const profiles = this.athleteProfiles();
    const slots = bracketPublished
      ? []
      : substitutionSlots(r, uid).map((slotUid) => ({
          uid: slotUid,
          name: profiles.get(slotUid)?.name ?? this.fallbackNameOf(slotUid),
        }));
```

e no objeto retornado:

```ts
      substitutionSlots: slots,
      substitutionHistory: r.substitutionHistory.map((h) => ({ outName: h.outName, inName: h.inName })),
```

(d) estado/handlers no componente:

```ts
  protected readonly substitutionTarget = signal<RegistrationCard | null>(null);
  protected readonly substitutionSending = signal(false);

  /** Busca do dialog: diretório público menos quem já está na inscrição. */
  protected readonly substitutionSearchFn = async (term: string) => {
    const db = this.db;
    const target = this.substitutionTarget();
    if (!db || !target) return [];
    const registration = this.store.myRegistrations().find((r) => r.id === target.id);
    const memberUids = new Set(registration?.participantUids ?? []);
    const results = await searchAthleteDirectory(db, term);
    return results
      .filter((p) => !memberUids.has(p.uid))
      .map((p) => ({ uid: p.uid, name: p.displayName }));
  };

  protected openSubstitution(card: RegistrationCard): void {
    this.substitutionTarget.set(card);
  }

  protected closeSubstitution(): void {
    if (!this.substitutionSending()) this.substitutionTarget.set(null);
  }

  protected async sendSubstitution(request: SubstitutionSendRequest): Promise<void> {
    const target = this.substitutionTarget();
    if (!target || this.substitutionSending()) return;
    this.substitutionSending.set(true);
    try {
      await sendSubstitutionInvite(athleteFunctions(), {
        registrationId: target.id,
        replacedUid: request.replacedUid,
        replacedName: request.replacedName,
        inviteeUid: request.inviteeUid,
        inviteeName: request.inviteeName,
        inviterName: this.auth.user()?.displayName?.trim() || 'Atleta',
      });
      this.substitutionTarget.set(null);
      this.toasts.success(
        'Convite enviado',
        `A troca acontece quando ${request.inviteeName} aceitar.`,
      );
    } catch (err) {
      this.toasts.error(
        'Não foi possível enviar o convite',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu — tente de novo.',
      );
    } finally {
      this.substitutionSending.set(false);
    }
  }
```

Conferir antes o campo de nome de `searchAthleteDirectory` com `grep -n "displayName\|name" frontend/projects/athlete/src/app/data/public-profiles-repository.ts | head` e ajustar `p.displayName` se necessário.

(e) no template (`registration-tab.component.html`), após o bloco `@if (card.canShareCampaign) {...}`:

```html
      @if (card.substitutionHistory.length > 0) {
        <ul class="reg-sub-history">
          @for (entry of card.substitutionHistory; track $index) {
            <li>{{ entry.inName }} entrou no lugar de {{ entry.outName }}.</li>
          }
        </ul>
      }

      @if (card.substitutionSlots.length > 0) {
        <button type="button" class="reg-cta" (click)="openSubstitution(card)">
          Substituir atleta
        </button>
      }
```

e no fim do arquivo, junto dos outros diálogos:

```html
  @if (substitutionTarget(); as target) {
    <app-substitution-dialog
      [slots]="target.substitutionSlots"
      [busy]="substitutionSending()"
      [searchFn]="substitutionSearchFn"
      (closed)="closeSubstitution()"
      (send)="sendSubstitution($event)"
    />
  }
```

No `.scss` do tab, adicionar:

```scss
.reg-sub-history { margin: 0; padding-left: 18px; font-size: 0.85rem; opacity: 0.75; }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx ng test athlete --watch=false 2>&1 | tail -10 && npx ng build athlete 2>&1 | tail -3`
Expected: specs PASS (incluindo `substitution-view.spec`), build verde. Lembrete zoneless: se um spec novo de componente for criado, seguir o padrão dos specs existentes do projeto (provideZonelessChangeDetection — ver `at-invite-announcer.component.spec.ts`).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app
git commit -m "feat(athlete-web): substituir atleta na Minha Inscrição — dialog + gate + histórico"
```

---

### Task 11: Portal — copy do anunciador de convites

**Files:**
- Modify: `frontend/projects/athlete/src/app/shared/partner-invite/invite-announcement.ts`
- Modify: `frontend/projects/athlete/src/app/shared/partner-invite/invite-announcement.spec.ts`

- [ ] **Step 1: Spec primeiro (falha)**

No `invite-announcement.spec.ts`, adicionar (usando os builders de item já existentes no spec — LER o arquivo antes; os literais de convite precisam de `isSubstitutionInvite`/`replacedName` desde a Task 9):

```ts
  it('convite de substituição anuncia a vaga, não uma dupla nova', () => {
    const sub = item('i9');
    sub.invite.isSubstitutionInvite = true;
    sub.invite.replacedName = 'Beto';
    expect(inviteAnnouncementTitle(sub)).toBe('Bia te chamou como substituto');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test athlete --watch=false 2>&1 | tail -10`
Expected: novo spec FAIL.

- [ ] **Step 3: Implementar a variante**

Em `invite-announcement.ts`, na função do título (linha ~74), adicionar como PRIMEIRO branch:

```ts
  if (item.invite.isSubstitutionInvite) {
    return `${item.invite.inviterName} te chamou como substituto`;
  }
```

E na função do corpo (linha ~93), variante equivalente:

```ts
  if (item.invite.isSubstitutionInvite) {
    const alvo = item.invite.replacedName ?? 'um atleta';
    return `Ele te chamou pra entrar no lugar de ${alvo} no ${tournamentName}. A vaga passa a ser sua ao aceitar.`;
  }
```

(Ajustar nomes de variáveis locais ao que o arquivo realmente usa — ler antes.)

- [ ] **Step 4: Rodar e ver passar + commit**

Run: `cd frontend && npx ng test athlete --watch=false 2>&1 | tail -5`

```bash
git add frontend/projects/athlete/src/app/shared/partner-invite
git commit -m "feat(athlete-web): anunciador reconhece convite de substituição"
```

---

### Task 12: Documentação + verificação final

**Files:**
- Modify: `docs/business-rules/registrations.md`

- [ ] **Step 1: Documentar a regra**

Adicionar seção ao `docs/business-rules/registrations.md`:

```markdown
## Substituição de atleta

Uma dupla/equipe inscrita pode trocar um atleta ATÉ a publicação das chaves da
categoria (`tournaments/{id}.categoryOps[categoryId].bracketStatus` em
`published`/`completed` bloqueia; `draft` não). A troca é por CONVITE
(`tournamentRegistrationInvites` com `isSubstitutionInvite: true`): o
substituto precisa aceitar — o aceite colhe LGPD, uniforme e dispara a trava de
nível dele. O gate é checado no envio e re-checado dentro da transação do
aceite (o convite vive 48h).

- Dupla: qualquer membro troca a própria vaga ou a do parceiro. Equipe (trio+):
  só o capitão, nunca a si mesmo (`captainUid` não muda).
- Pagamento fica intacto: a vaga paga segue paga e o substituto herda o status
  (`sharePaidUids`/`organizerConfirmedShareUids` trocam out→in). Acerto entre
  atletas é fora da plataforma. PIX aberto de quem sai é cancelado.
- `teamId` NUNCA muda; `participantUids`/`memberUids` trocam preservando o
  índice (slots de uniforme da dupla dependem da ordem).
- Trilha em `substitutionHistory` na inscrição (imutável para o cliente).
- Organizador não aprova; é notificado (`tournament_substitution_completed`).
- `generateCategoryBracket` marca `stale` (`bracket_published`) os convites de
  substituição pendentes da categoria.
```

- [ ] **Step 2: Verificação completa**

Run (cada um, conferindo saída):

```bash
cd functions && npm run build && npm test 2>&1 | tail -3 && npm run test:registrations 2>&1 | tail -5
```

```bash
firebase emulators:exec --only firestore "node --test functions/test/inscription-substitution-history.rules.test.mjs" 2>&1 | tail -5
```

```bash
cd nexago_app && flutter analyze lib/features/tournaments 2>&1 | tail -3 && flutter test test/features/tournaments/ 2>&1 | tail -3
```

```bash
cd frontend && npx ng test athlete --watch=false 2>&1 | tail -3 && npx ng build athlete 2>&1 | tail -3
```

Expected: tudo verde. Qualquer falha: consertar antes do commit final.

- [ ] **Step 3: Commit**

```bash
git add docs/business-rules/registrations.md
git commit -m "docs: regra de negócio da substituição de atleta"
```

---

## Self-review notes

- **Cobertura da spec**: mecanismo por convite (T2/T3), quem inicia (T1/T2), pagamento herdado (T3), gate por categoria no envio e aceite (T1–T3), organizador só notificado (T3), stale ao publicar (T4), rules (T5), app (T6–T8), portal (T9–T11), erros com copy exata (T1), testes matrix (T2–T4), docs (T12). Fora de escopo da spec permanece fora.
- **Simplificações conscientes de v1 (vs. spec)**: (a) a lista de convites ENVIADOS mostra o convite de substituição pelo fluxo genérico já existente (mesma coleção/queries, com cancelar funcionando) — sem variante de copy própria; (b) no app, a ação aparece só nos cards confirmados (elenco completo) — o servidor aceita também elencos incompletos, a UI expõe o caso principal. As duas são recuperáveis em follow-up sem mudança de backend.
- **Consistência de tipos**: `replaceUidInList`/`substitutionBlockReason`/`SUBSTITUTION_BLOCK_MESSAGES` definidos em T1 e consumidos em T2–T4 com as mesmas assinaturas; resultado do aceite mantém o shape `{registrationId, teamId, tournamentId, categoryId}` que os clientes já parseiam.
- **Riscos apontados nos passos**: ciclo de módulos (import dinâmico), `serverTimestamp` em array (usa `Timestamp.now()`), secrets do Asaas no aceite, sweeps de equipe excluindo convites de substituição, nomes de campos de perfil a conferir por grep antes de finalizar (T7/T10/T11).
