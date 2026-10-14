# Comissão técnica (coach) — RBAC fase 1: backend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membros da comissão (auxiliar, preparador físico, fisioterapeuta, psicólogo) passam a ter acesso real, por cargo e por área, aos dados de `coaches/{coachUid}` — nas rules **e** nas callables.

**Architecture:** Espelha o RBAC da arena (`arena-staff-roles.ts`, `arena-area-access.ts`, `arena-staff-ops.ts`, `arena-staff-sync.ts`). Vínculo em `coaches/{coachUid}/staff/{uid}`, convite nominal em `coachStaffInvites`, espelho `users/{uid}/coachStaff/{coachUid}` por trigger. Rules ganham `coachCan(coachUid, area, write)`; as 4 callables existentes passam a aceitar `coachUid` opcional (default = quem chama) e a autorizar por área.

**Tech Stack:** Firebase Functions v2 (TypeScript, `node:test`), Firestore rules (`@firebase/rules-unit-testing`), Auth Admin SDK.

**Spec:** `docs/superpowers/specs/2026-10-14-coach-comissao-tecnica-rbac-design.md` (as 4 perguntas abertas foram resolvidas com as propostas do spec).

## Global Constraints

- Português nas mensagens de erro/UI, inglês no código.
- **Retrocompatível**: sem nenhum doc em `staff`, o comportamento é idêntico ao de hoje (só o dono). Callables sem `coachUid` no payload operam como hoje.
- Escrita em `staff`, `coachStaffInvites` e no espelho: **só Cloud Function** (`allow write: if false` no client, inclusive para o dono).
- O doc raiz `coaches/{coachUid}` **continua só do dono**; nada neste plano o abre para staff.
- Não há plano pago nem limite de assentos para a comissão (diferente da arena) — não copiar `arenaEntitledTier`/`maxArenaStaffSeats`.
- Cargos: `auxiliar`, `preparador_fisico`, `fisioterapeuta`, `psicologo`. O principal é o dono (`uid == coachUid`) e **não** é gravado em `staff`.
- Convite: nominal por e-mail (`emailLower`), validade de 7 dias, e-mail **não verificado** (risco aceito, igual à arena), sempre `pending` até o convidado aceitar — sem o "caminho direto" da arena (o aceite é o consentimento).
- Região das callables: `CLIENT_FACING_REGIONS` (`./function-regions`).
- **Nada é deployado por este plano.** Deploy no dev (`volley-track-dev-4596c`) é decisão do usuário depois da Task 8; ordem: rules → functions (ver memória `deploy-no-changes-mente-apos-falha-parcial`: conferir cada função listada).

## Decisão que muda o spec

O spec listava `treinos` e `presenca` como áreas separadas, mas as duas colunas da matriz são **idênticas** em todos os cargos, e a presença é o campo `attendance` dentro do doc de `trainings` (`trainings.service.ts:38`). Separar exigiria guarda de campo por papel sem ganho nenhum. **Na v1, `presenca` é fundida em `treinos`.** Se um dia as colunas divergirem, `attendance` vai para subcoleção. A Task 1 atualiza o spec.

Análise de "campos congelados" (lição `rule-de-papel-precisa-congelar-campos`): na fase 1 o único escritor de staff via rules é o **auxiliar em `trainings`**, e esse doc não tem campo de identidade nem de dinheiro (`title`, data, `squadId`, `attendance`, `status`, série). Nenhuma guarda de campo é necessária agora; a Task 5 deixa um teste que documenta isso e a regra de revisitar quando um campo sensível aparecer.

## Review Focus

Entradas/condições que o spec implica e nenhuma task "feliz" exercita — cada uma tem teste na task dona:

1. **Callable que ignora o staff** (o Critical da arena): `sendCallUp`/convite de atleta/busca/overview chamados por membro com `coachUid` → Task 6 + Task 8 (e2e).
2. **`coachUid` forjado**: membro de A passa `coachUid` de B; ou estranho passa `coachUid` de alguém → deve negar → Task 2 + Task 8.
3. **Cargo desconhecido/ausente no doc `staff`** (doc editado à mão) → nega, nunca "quase libera" → Task 2 (`decide…`) e Task 5 (rules).
4. **`get()` em doc inexistente** nas rules vira erro de avaliação = deny sem mensagem: usar `exists()` antes → Task 5.
5. **Convite**: aceitar duas vezes, aceitar vencido, aceitar com e-mail de outra conta, dono se convidar, convidar quem já é membro, cargo inválido → Task 3.
6. **Remoção/troca de cargo some do espelho e corta o acesso imediatamente** (rules leem `staff` ao vivo; o espelho só afeta descoberta) → Task 4 + Task 5.
7. **Membro com a claim `coach` sem doc `coaches/{uid}` próprio** não pode ser tratado como "treinador sem cadastro" por `sendCoachAthleteInvite` → Task 6.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `functions/src/coach-staff-roles.ts` (novo) | cargos, áreas, matriz, `coachRoleCanRead/Write`, `normalizeInviteEmail` reexportado |
| `functions/src/coach-area-access.ts` (novo) | `decideCoachAreaAccess` (puro), `assertCoachAreaAccess`, `resolveCoachUid` |
| `functions/src/coach-staff-ops.ts` (novo) | callables: criar/aceitar/revogar convite, trocar cargo, remover, sair |
| `functions/src/coach-staff-sync.ts` (novo) | trigger do espelho `users/{uid}/coachStaff/{coachUid}` |
| `functions/src/coach-athlete-invite.ts`, `coach-athlete-search.ts`, `coach-call-up.ts`, `coach-tournament-overview.ts` | passam a autorizar por área |
| `functions/src/index.ts` | exports |
| `firestore.rules` | `coachCan` + blocos novos + 5 subcoleções migradas |
| `functions/test/coach-staff-rbac.rules.test.mjs` (novo) | rules cargo × área |
| `functions/test/coach-roles-parity.test.mjs` (novo) | matriz do TS == matriz das rules |
| `functions/scripts/qa-coach-staff-rbac-e2e.mjs` (novo) | QA contra o dev, rules + functions juntos |

---

### Task 1: Cargos, áreas e matriz (módulo puro)

**Files:**
- Create: `functions/src/coach-staff-roles.ts`
- Test: `functions/src/coach-staff-roles.test.ts`
- Modify: `docs/superpowers/specs/2026-10-14-coach-comissao-tecnica-rbac-design.md` (fundir `presenca` em `treinos`)

**Interfaces:**
- Produces: `COACH_STAFF_ROLES`, `type CoachStaffRole`, `isCoachStaffRole(v: unknown): v is CoachStaffRole`, `COACH_AREAS`, `type CoachArea`, `coachRoleCanWrite(role, area): boolean`, `coachRoleCanRead(role, area): boolean`. Matriz (escrita implica leitura):

| Área | auxiliar | preparador_fisico | fisioterapeuta | psicologo |
|---|---|---|---|---|
| `atletas` | r | r | r | r |
| `treinos` | rw | r | r | — |
| `convocacoes` | rw | — | — | — |
| `avaliacoes` | r | r | — | — |
| `fisico` | — | rw | r | — |
| `saude` | — | — | rw | — |
| `mental` | — | — | — | rw |
| `comunicacao` | rw | — | — | — |
| `financeiro` | — | — | — | — |
| `equipe` | — | — | — | — |

(`financeiro` e `equipe` ficam sem nenhum cargo de staff: só o dono. `mental`: o dono **não** lê o texto — decisão P2; a leitura do dono é tratada na fase das áreas novas, não por esta matriz.)

- [ ] **Step 1: Escrever o teste que falha**

```ts
import {strict as assert} from "node:assert";
import {test} from "node:test";
import {
  COACH_AREAS,
  COACH_STAFF_ROLES,
  coachRoleCanRead,
  coachRoleCanWrite,
  isCoachStaffRole,
  type CoachArea,
  type CoachStaffRole,
} from "./coach-staff-roles";

test("isCoachStaffRole aceita so os quatro cargos", () => {
  for (const r of ["auxiliar", "preparador_fisico", "fisioterapeuta", "psicologo"]) {
    assert.equal(isCoachStaffRole(r), true, r);
  }
  for (const r of ["principal", "dono", "", undefined, null, 3]) {
    assert.equal(isCoachStaffRole(r), false, String(r));
  }
});

test("escrita implica leitura em toda area e cargo", () => {
  for (const role of COACH_STAFF_ROLES) {
    for (const area of COACH_AREAS) {
      if (coachRoleCanWrite(role, area)) {
        assert.equal(coachRoleCanRead(role, area), true, `${role}/${area}`);
      }
    }
  }
});

test("matriz exata por cargo", () => {
  const expected: Record<CoachStaffRole, {w: CoachArea[]; r: CoachArea[]}> = {
    auxiliar: {w: ["treinos", "convocacoes", "comunicacao"], r: ["atletas", "avaliacoes"]},
    preparador_fisico: {w: ["fisico"], r: ["atletas", "treinos", "avaliacoes"]},
    fisioterapeuta: {w: ["saude"], r: ["atletas", "treinos", "fisico"]},
    psicologo: {w: ["mental"], r: ["atletas"]},
  };
  for (const role of COACH_STAFF_ROLES) {
    const writes = COACH_AREAS.filter((a) => coachRoleCanWrite(role, a));
    const reads = COACH_AREAS.filter((a) => coachRoleCanRead(role, a) && !coachRoleCanWrite(role, a));
    assert.deepEqual(writes.slice().sort(), expected[role].w.slice().sort(), `${role} escreve`);
    assert.deepEqual(reads.slice().sort(), expected[role].r.slice().sort(), `${role} so le`);
  }
});

test("nenhum cargo de staff toca financeiro nem equipe", () => {
  for (const role of COACH_STAFF_ROLES) {
    for (const area of ["financeiro", "equipe"] as const) {
      assert.equal(coachRoleCanRead(role, area), false, `${role}/${area} le`);
      assert.equal(coachRoleCanWrite(role, area), false, `${role}/${area} escreve`);
    }
  }
});

test("cargo invalido nao ganha nada", () => {
  assert.equal(coachRoleCanRead("hacker" as CoachStaffRole, "atletas"), false);
  assert.equal(coachRoleCanWrite("hacker" as CoachStaffRole, "treinos"), false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm run build 2>&1 | tail -5`
Expected: erro de compilação "Cannot find module './coach-staff-roles'".

- [ ] **Step 3: Implementar**

```ts
/**
 * Cargos da comissão técnica do treinador e matriz de acesso por área —
 * consumido pelas callables de equipe e pelo guard `assertCoachAreaAccess`
 * (`coach-area-access.ts`).
 *
 * ESPELHO MANUAL da matriz — existe em DOIS lugares nesta fase e precisam andar juntos:
 *  1. este arquivo;
 *  2. `coachWriteAreas`/`coachReadAreas` em `firestore.rules` (a autoridade de verdade).
 * `functions/test/coach-roles-parity.test.mjs` extrai o mapa das rules e compara com
 * este arquivo — se divergirem, o teste quebra (diferente do que a arena prometia).
 * O model do portal (fase 2) entra nessa mesma comparação.
 *
 * O treinador principal é o dono (`uid == coachUid`) e não é um cargo: não aparece aqui.
 * `presenca` foi fundida em `treinos` (colunas idênticas; a presença é o campo
 * `attendance` do doc de treino).
 */
export const COACH_STAFF_ROLES = [
  "auxiliar",
  "preparador_fisico",
  "fisioterapeuta",
  "psicologo",
] as const;
export type CoachStaffRole = (typeof COACH_STAFF_ROLES)[number];

export function isCoachStaffRole(value: unknown): value is CoachStaffRole {
  return typeof value === "string" &&
    (COACH_STAFF_ROLES as readonly string[]).includes(value);
}

export const COACH_AREAS = [
  "atletas",
  "treinos",
  "convocacoes",
  "avaliacoes",
  "fisico",
  "saude",
  "mental",
  "comunicacao",
  "financeiro",
  "equipe",
] as const;
export type CoachArea = (typeof COACH_AREAS)[number];

/** Áreas em que o cargo escreve. Escrita implica leitura. */
const COACH_WRITE_AREAS: Record<CoachStaffRole, readonly CoachArea[]> = {
  auxiliar: ["treinos", "convocacoes", "comunicacao"],
  preparador_fisico: ["fisico"],
  fisioterapeuta: ["saude"],
  psicologo: ["mental"],
};

/** Áreas só de leitura, somadas às de escrita. */
const COACH_READ_ONLY_AREAS: Record<CoachStaffRole, readonly CoachArea[]> = {
  auxiliar: ["atletas", "avaliacoes"],
  preparador_fisico: ["atletas", "treinos", "avaliacoes"],
  fisioterapeuta: ["atletas", "treinos", "fisico"],
  psicologo: ["atletas"],
};

export function coachRoleCanWrite(role: CoachStaffRole, area: CoachArea): boolean {
  return (COACH_WRITE_AREAS[role] ?? []).includes(area);
}

export function coachRoleCanRead(role: CoachStaffRole, area: CoachArea): boolean {
  return coachRoleCanWrite(role, area) || (COACH_READ_ONLY_AREAS[role] ?? []).includes(area);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd functions && npm run build && node --test lib/coach-staff-roles.test.js`
Expected: 5 testes PASS.

- [ ] **Step 5: Atualizar o spec** — na tabela da seção 2 do spec, remover a linha `presenca` e escrever em `treinos`: "`trainings` (agenda, série e presença — `attendance`)"; apagar o parágrafo "`presenca` mora dentro do doc…" e trocar por uma linha: "`presenca` foi fundida em `treinos`: colunas idênticas em todos os cargos (decisão do plano da fase 1)."

- [ ] **Step 6: Commit**

```bash
git add functions/src/coach-staff-roles.ts functions/src/coach-staff-roles.test.ts docs/superpowers/specs/2026-10-14-coach-comissao-tecnica-rbac-design.md
git commit -m "feat(coach): cargos e matriz de acesso da comissão técnica"
```

---

### Task 2: Guard de autorização por área (puro + Firestore)

**Files:**
- Create: `functions/src/coach-area-access.ts`
- Test: `functions/src/coach-area-access.test.ts`

**Interfaces:**
- Consumes: `isCoachStaffRole`, `coachRoleCanRead`, `coachRoleCanWrite`, `CoachArea` (Task 1).
- Produces:
  - `type CoachAreaAccessMode = "read" | "write"`
  - `decideCoachAreaAccess(coachUid: string, uid: string, staffData: {role?: unknown} | null, area: CoachArea, mode: CoachAreaAccessMode): boolean`
  - `resolveCoachUid(data: unknown, callerUid: string): string` — `data.coachUid` aparado, ou `callerUid` se ausente/vazio.
  - `assertCoachAreaAccess(db: Firestore, uid: string, coachUid: string, area: CoachArea, mode: CoachAreaAccessMode): Promise<void>` — lança `HttpsError("permission-denied", …)`.

- [ ] **Step 1: Teste que falha**

```ts
import {strict as assert} from "node:assert";
import {test} from "node:test";
import {decideCoachAreaAccess, resolveCoachUid} from "./coach-area-access";

test("dono sempre pode, em toda area e modo", () => {
  assert.equal(decideCoachAreaAccess("c1", "c1", null, "financeiro", "write"), true);
  assert.equal(decideCoachAreaAccess("c1", "c1", null, "equipe", "read"), true);
});

test("estranho sem vinculo e negado", () => {
  assert.equal(decideCoachAreaAccess("c1", "x", null, "atletas", "read"), false);
});

test("membro segue a matriz do cargo", () => {
  const aux = {role: "auxiliar"};
  assert.equal(decideCoachAreaAccess("c1", "m", aux, "treinos", "write"), true);
  assert.equal(decideCoachAreaAccess("c1", "m", aux, "atletas", "read"), true);
  assert.equal(decideCoachAreaAccess("c1", "m", aux, "atletas", "write"), false);
  assert.equal(decideCoachAreaAccess("c1", "m", aux, "saude", "read"), false);
});

test("cargo desconhecido ou ausente no doc staff nega tudo", () => {
  for (const staff of [{role: "dono"}, {role: ""}, {}, {role: 7}]) {
    assert.equal(decideCoachAreaAccess("c1", "m", staff, "atletas", "read"), false);
  }
});

test("membro de OUTRO treinador nao passa: staffData e do vinculo com coachUid pedido", () => {
  // o chamador carrega staff do coachUid pedido; sem doc => null => nega
  assert.equal(decideCoachAreaAccess("B", "m", null, "atletas", "read"), false);
});

test("resolveCoachUid: default e quem chama; payload vazio ou so espacos tambem", () => {
  assert.equal(resolveCoachUid({}, "me"), "me");
  assert.equal(resolveCoachUid(undefined, "me"), "me");
  assert.equal(resolveCoachUid({coachUid: "  "}, "me"), "me");
  assert.equal(resolveCoachUid({coachUid: " c1 "}, "me"), "c1");
  assert.equal(resolveCoachUid({coachUid: 42}, "me"), "me");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm run build 2>&1 | tail -3`
Expected: "Cannot find module './coach-area-access'".

- [ ] **Step 3: Implementar**

```ts
/**
 * Autorização por área do portal do treinador para Cloud Functions — espelho
 * server-side de `coachCan` (`firestore.rules`), para as callables cujas
 * leituras/escritas nunca passam pelas rules (convite de atleta, convocação,
 * busca de atleta, visão de torneios) e que antes só aceitavam o dono
 * (`auth.uid` era o `coachUid`).
 *
 * Semântica (idêntica às rules, nesta ordem):
 *  1. Dono (`uid === coachUid`) — sempre, em toda área.
 *  2. Membro: existe `coaches/{coachUid}/staff/{uid}` E o cargo cobre a área no modo pedido.
 *  3. Qualquer outro caso — nega. Bypass de admin NÃO é concedido aqui.
 */
import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";
import {
  coachRoleCanRead,
  coachRoleCanWrite,
  isCoachStaffRole,
  type CoachArea,
} from "./coach-staff-roles";

export type CoachAreaAccessMode = "read" | "write";

export function decideCoachAreaAccess(
  coachUid: string,
  uid: string,
  staffData: {role?: unknown} | null,
  area: CoachArea,
  mode: CoachAreaAccessMode,
): boolean {
  if (coachUid !== "" && coachUid === uid) return true;
  if (!staffData) return false;
  const role = staffData.role;
  if (!isCoachStaffRole(role)) return false;
  return mode === "write" ? coachRoleCanWrite(role, area) : coachRoleCanRead(role, area);
}

/** `coachUid` do payload (aparado) ou, se ausente/vazio/não-string, quem chama. */
export function resolveCoachUid(data: unknown, callerUid: string): string {
  const raw = (data as {coachUid?: unknown} | null | undefined)?.coachUid;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed || callerUid;
}

export async function assertCoachAreaAccess(
  db: Firestore,
  uid: string,
  coachUid: string,
  area: CoachArea,
  mode: CoachAreaAccessMode,
): Promise<void> {
  let staffData: {role?: unknown} | null = null;
  if (coachUid !== uid) {
    const snap = await db.doc(`coaches/${coachUid}/staff/${uid}`).get();
    staffData = snap.exists ? (snap.data() ?? {}) : null;
  }
  if (!decideCoachAreaAccess(coachUid, uid, staffData, area, mode)) {
    throw new HttpsError(
      "permission-denied",
      "Você não tem acesso a esta área da comissão técnica.",
    );
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd functions && npm run build && node --test lib/coach-area-access.test.js`
Expected: 6 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/coach-area-access.ts functions/src/coach-area-access.test.ts
git commit -m "feat(coach): guard de autorização por área para callables"
```

---

### Task 3: Convites e vínculo (callables)

**Files:**
- Create: `functions/src/coach-staff-ops.ts`
- Test: `functions/src/coach-staff-ops.test.ts`
- Modify: `functions/src/index.ts` (após o bloco de `getCoachTournamentOverview`)

**Interfaces:**
- Consumes: `isCoachStaffRole`, `CoachStaffRole` (Task 1); `inviteClaimState`, `normalizeInviteEmail`-equivalente: `normalizeInviteEmail` de `./arena-staff-roles` e `inviteClaimState` de `./arena-staff-ops` (ambos já exportados — **reuso, não cópia**); `withCoachRole` de `./coach-signup`.
- Produces (callables, todas com `region: CLIENT_FACING_REGIONS`):
  - `createCoachStaffInvite({email: string, role: CoachStaffRole}) → {inviteId: string}` — só o dono (`uid` é o `coachUid`).
  - `acceptCoachStaffInvite({inviteId}) → {coachUid: string, role: CoachStaffRole}`
  - `revokeCoachStaffInvite({inviteId}) → {ok: true}` — só o dono do convite.
  - `changeCoachStaffRole({staffUserId, role}) → {ok: true}` — só o dono.
  - `removeCoachStaff({staffUserId}) → {ok: true}` — só o dono.
  - `leaveCoachStaff({coachUid}) → {ok: true}` — o próprio membro.
- Funções puras exportadas para teste: `assertCanInviteSelf(coachUid: string, targetUid: string | null): void`.

Docs gravados — convite `coachStaffInvites/{id}`: `{coachUid, coachName, emailLower, role, status: "pending", invitedBy, acceptedBy: null, createdAt, expiresAt}`. Vínculo `coaches/{coachUid}/staff/{uid}`: `{role, email, displayName, photoUrl, addedBy, addedAt}`.

- [ ] **Step 1: Teste que falha** (só a lógica pura nova; o resto é coberto pelo e2e da Task 8 e pela reutilização de `inviteClaimState`, já testada na arena)

```ts
import {strict as assert} from "node:assert";
import {test} from "node:test";
import {HttpsError} from "firebase-functions/v2/https";
import {assertCanInviteSelf, assertInviteRole} from "./coach-staff-ops";

test("dono nao pode se convidar", () => {
  assert.throws(() => assertCanInviteSelf("c1", "c1"), (e: unknown) =>
    e instanceof HttpsError && e.code === "invalid-argument");
});

test("convidar outra pessoa ou e-mail sem conta (null) passa", () => {
  assert.doesNotThrow(() => assertCanInviteSelf("c1", "u2"));
  assert.doesNotThrow(() => assertCanInviteSelf("c1", null));
});

test("assertInviteRole recusa cargo invalido e devolve o valido", () => {
  assert.equal(assertInviteRole("fisioterapeuta"), "fisioterapeuta");
  for (const bad of ["principal", "", undefined, 3]) {
    assert.throws(() => assertInviteRole(bad), (e: unknown) =>
      e instanceof HttpsError && e.code === "invalid-argument");
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm run build 2>&1 | tail -3`
Expected: "Cannot find module './coach-staff-ops'".

- [ ] **Step 3: Implementar `coach-staff-ops.ts`**

```ts
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {applyRolesToClaims, firestoreRolesPayload, rolesFromClaims} from "./auth-roles";
import {withCoachRole} from "./coach-signup";
import {isCoachStaffRole, type CoachStaffRole} from "./coach-staff-roles";
import {normalizeInviteEmail} from "./arena-staff-roles";
import {inviteClaimState} from "./arena-staff-ops";
import {CLIENT_FACING_REGIONS} from "./function-regions";

const INVITES = "coachStaffInvites";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function assertCanInviteSelf(coachUid: string, targetUid: string | null): void {
  if (targetUid !== null && targetUid === coachUid) {
    throw new HttpsError("invalid-argument", "Você é o treinador principal; não precisa se convidar.");
  }
}

export function assertInviteRole(role: unknown): CoachStaffRole {
  if (!isCoachStaffRole(role)) throw new HttpsError("invalid-argument", "Cargo inválido.");
  return role;
}

function requireUid(request: {auth?: {uid?: string} | null}): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  return uid;
}

/** Concede a claim `coach` de forma SÍNCRONA (o membro é mandado direto ao portal, cujo
 *  guard lê claims/`users/{uid}`). Não cria `coaches/{uid}`: o membro não é treinador. */
async function ensureCoachRole(uid: string): Promise<void> {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const roles = rolesFromClaims(user.customClaims);
  const next = withCoachRole(roles);
  if (next.length !== roles.length) {
    await auth.setCustomUserClaims(
      uid,
      applyRolesToClaims((user.customClaims || {}) as Record<string, unknown>, next),
    );
  }
  await getFirestore().doc(`users/${uid}`).set(firestoreRolesPayload(next), {merge: true});
}

export const createCoachStaffInvite = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const coachUid = requireUid(request);
  const email = normalizeInviteEmail(request.data?.email);
  if (!email.includes("@")) throw new HttpsError("invalid-argument", "Informe um e-mail válido.");
  const role = assertInviteRole(request.data?.role);

  const db = getFirestore();
  const coachSnap = await db.doc(`coaches/${coachUid}`).get();
  if (!coachSnap.exists) {
    throw new HttpsError("failed-precondition", "Complete seu cadastro de treinador antes de montar a comissão.");
  }

  let targetUid: string | null = null;
  try {
    targetUid = (await getAuth().getUserByEmail(email)).uid;
  } catch {
    targetUid = null; // sem conta ainda — o convite espera o cadastro
  }
  assertCanInviteSelf(coachUid, targetUid);
  if (targetUid) {
    if ((await db.doc(`coaches/${coachUid}/staff/${targetUid}`).get()).exists) {
      throw new HttpsError("already-exists", "Esta pessoa já está na comissão.");
    }
  }

  const duplicate = await db.collection(INVITES)
    .where("coachUid", "==", coachUid)
    .where("emailLower", "==", email)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!duplicate.empty) {
    throw new HttpsError("already-exists", "Já existe um convite pendente para este e-mail.");
  }

  const coachName = String(coachSnap.data()?.displayName ?? "").trim();
  const ref = db.collection(INVITES).doc();
  await ref.set({
    coachUid,
    coachName,
    emailLower: email,
    role,
    status: "pending",
    invitedBy: coachUid,
    acceptedBy: null,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + INVITE_TTL_MS),
  });
  logger.info("coachStaff: convite criado", {coachUid, inviteId: ref.id, role});
  return {inviteId: ref.id};
});

export const acceptCoachStaffInvite = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = requireUid(request);
  const inviteId = String(request.data?.inviteId ?? "").trim();
  if (!inviteId) throw new HttpsError("invalid-argument", "inviteId é obrigatório.");

  // E-mail NÃO verificado de propósito (mesmo risco aceito da arena: sem infra de envio).
  const email = normalizeInviteEmail(request.auth?.token?.email);
  const db = getFirestore();
  const ref = db.doc(`${INVITES}/${inviteId}`);

  // Transação: dois aceites simultâneos não podem criar o vínculo duas vezes nem reusar o convite.
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Convite não encontrado.");
    const invite = snap.data() ?? {};

    const state = inviteClaimState(invite, email, Date.now());
    if (state === "email-mismatch") {
      throw new HttpsError(
        "permission-denied",
        `Este convite foi enviado para outro e-mail. Você está conectado como ${
          email || "uma conta sem e-mail"
        } — saia desta conta e entre com o e-mail que recebeu o convite.`,
      );
    }
    if (state === "expired") {
      throw new HttpsError("failed-precondition", "Este convite venceu. Peça um convite novo ao treinador.");
    }
    if (state === "settled") {
      throw new HttpsError("failed-precondition", "Este convite foi cancelado ou já foi usado. Peça um convite novo ao treinador.");
    }

    const coachUid = String(invite.coachUid ?? "");
    const role = invite.role;
    if (!coachUid || !isCoachStaffRole(role)) {
      throw new HttpsError("failed-precondition", "Convite inválido.");
    }
    if (coachUid === uid) {
      throw new HttpsError("invalid-argument", "Você é o treinador principal desta comissão.");
    }
    const staffRef = db.doc(`coaches/${coachUid}/staff/${uid}`);
    if ((await tx.get(staffRef)).exists) {
      tx.set(ref, {status: "accepted", acceptedBy: uid, acceptedAt: FieldValue.serverTimestamp()}, {merge: true});
      throw new HttpsError("already-exists", "Você já faz parte desta comissão.");
    }
    return {coachUid, role, staffRef};
  });

  let user;
  try {
    user = await getAuth().getUser(uid);
  } catch (err: unknown) {
    if ((err as {code?: string})?.code === "auth/user-not-found") {
      throw new HttpsError("unauthenticated", "Sua sessão expirou. Entre novamente para continuar.");
    }
    throw err;
  }

  await result.staffRef.set({
    role: result.role,
    email,
    displayName: user.displayName || email.split("@")[0],
    photoUrl: user.photoURL ?? null,
    addedBy: String((await ref.get()).data()?.invitedBy ?? ""),
    addedAt: FieldValue.serverTimestamp(),
  });
  await ensureCoachRole(uid);
  await ref.set({status: "accepted", acceptedBy: uid, acceptedAt: FieldValue.serverTimestamp()}, {merge: true});
  logger.info("coachStaff: convite aceito", {coachUid: result.coachUid, inviteId, uid, role: result.role});
  return {coachUid: result.coachUid, role: result.role};
});

export const revokeCoachStaffInvite = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = requireUid(request);
  const inviteId = String(request.data?.inviteId ?? "").trim();
  if (!inviteId) throw new HttpsError("invalid-argument", "inviteId é obrigatório.");
  const ref = getFirestore().doc(`${INVITES}/${inviteId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Convite não encontrado.");
  if (snap.data()?.coachUid !== uid) {
    throw new HttpsError("permission-denied", "Apenas o treinador principal gerencia a comissão.");
  }
  await ref.set({status: "revoked", revokedAt: FieldValue.serverTimestamp()}, {merge: true});
  return {ok: true as const};
});

export const changeCoachStaffRole = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = requireUid(request);
  const staffUserId = String(request.data?.staffUserId ?? "").trim();
  if (!staffUserId) throw new HttpsError("invalid-argument", "staffUserId é obrigatório.");
  const role = assertInviteRole(request.data?.role);
  const ref = getFirestore().doc(`coaches/${uid}/staff/${staffUserId}`);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "Membro não encontrado na sua comissão.");
  await ref.set({role, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  return {ok: true as const};
});

export const removeCoachStaff = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = requireUid(request);
  const staffUserId = String(request.data?.staffUserId ?? "").trim();
  if (!staffUserId) throw new HttpsError("invalid-argument", "staffUserId é obrigatório.");
  await getFirestore().doc(`coaches/${uid}/staff/${staffUserId}`).delete();
  logger.info("coachStaff: membro removido", {coachUid: uid, staffUserId});
  return {ok: true as const};
});

export const leaveCoachStaff = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = requireUid(request);
  const coachUid = String(request.data?.coachUid ?? "").trim();
  if (!coachUid) throw new HttpsError("invalid-argument", "coachUid é obrigatório.");
  await getFirestore().doc(`coaches/${coachUid}/staff/${uid}`).delete();
  return {ok: true as const};
});
```

- [ ] **Step 4: Exportar no `index.ts`** (logo após `export {getCoachTournamentOverview} …`):

```ts
export {
  createCoachStaffInvite,
  acceptCoachStaffInvite,
  revokeCoachStaffInvite,
  changeCoachStaffRole,
  removeCoachStaff,
  leaveCoachStaff,
} from "./coach-staff-ops";
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd functions && npm run build && node --test lib/coach-staff-ops.test.js`
Expected: build limpo (sem erro de tipo) e 3 testes PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/coach-staff-ops.ts functions/src/coach-staff-ops.test.ts functions/src/index.ts
git commit -m "feat(coach): callables de convite e gestão da comissão técnica"
```

---

### Task 4: Espelho `users/{uid}/coachStaff/{coachUid}` (trigger)

**Files:**
- Create: `functions/src/coach-staff-sync.ts`
- Test: `functions/src/coach-staff-sync.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `isCoachStaffRole` (Task 1).
- Produces: `buildCoachStaffMirrorData(staffData, coachData): {role: string; coachName: string; coachPhotoUrl: string | null}`; trigger `onCoachStaffWrittenSyncMirror`; trigger `onCoachDeletedCleanupStaff` (apaga `staff` e `coachStaffInvites` do treinador — cada delete de `staff` dispara o sync que limpa o espelho).

- [ ] **Step 1: Teste que falha**

```ts
import {strict as assert} from "node:assert";
import {test} from "node:test";
import {buildCoachStaffMirrorData} from "./coach-staff-sync";

test("espelho leva cargo e nome do treinador", () => {
  assert.deepEqual(
    buildCoachStaffMirrorData({role: "fisioterapeuta"}, {displayName: "Carla Mendes", photoUrl: "https://x/y.png"}),
    {role: "fisioterapeuta", coachName: "Carla Mendes", coachPhotoUrl: "https://x/y.png"},
  );
});

test("cargo invalido no doc vira string vazia (o portal nao libera nada por ele)", () => {
  assert.equal(buildCoachStaffMirrorData({role: "dono"}, {}).role, "");
  assert.equal(buildCoachStaffMirrorData({}, {}).role, "");
});

test("sem nome ou foto: defaults seguros", () => {
  const m = buildCoachStaffMirrorData({role: "auxiliar"}, {});
  assert.equal(m.coachName, "");
  assert.equal(m.coachPhotoUrl, null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm run build 2>&1 | tail -3`
Expected: "Cannot find module './coach-staff-sync'".

- [ ] **Step 3: Implementar**

```ts
/**
 * Espelho e limpeza da comissão técnica — mesmo padrão de `arena-staff-sync.ts`.
 * `users/{uid}/coachStaff/{coachUid}` é como o portal descobre de quais treinadores o
 * usuário é equipe (as rules não deixam consultar `staff` de outro). É só DESCOBERTA:
 * a autorização lê `coaches/{coachUid}/staff/{uid}` ao vivo, então remover o vínculo
 * corta o acesso no mesmo instante, antes do trigger rodar.
 */
import {onDocumentDeleted, onDocumentWritten} from "firebase-functions/v2/firestore";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {isCoachStaffRole} from "./coach-staff-roles";

export function buildCoachStaffMirrorData(
  staffData: Record<string, unknown>,
  coachData: Record<string, unknown>,
): {role: string; coachName: string; coachPhotoUrl: string | null} {
  const photo = coachData.photoUrl;
  return {
    role: isCoachStaffRole(staffData.role) ? staffData.role : "",
    coachName: typeof coachData.displayName === "string" ? coachData.displayName : "",
    coachPhotoUrl: typeof photo === "string" && photo.trim() ? photo : null,
  };
}

export const onCoachStaffWrittenSyncMirror = onDocumentWritten(
  "coaches/{coachUid}/staff/{staffUserId}",
  async (event) => {
    const {coachUid, staffUserId} = event.params;
    const db = getFirestore();
    const mirrorRef = db.doc(`users/${staffUserId}/coachStaff/${coachUid}`);

    const after = event.data?.after;
    if (!after?.exists) {
      await mirrorRef.delete();
      return;
    }
    const coachSnap = await db.doc(`coaches/${coachUid}`).get();
    if (!coachSnap.exists) {
      logger.warn("coachStaff: treinador inexistente, espelho omitido", {coachUid, staffUserId});
      return;
    }
    await mirrorRef.set(
      {
        ...buildCoachStaffMirrorData(after.data() ?? {}, coachSnap.data() ?? {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  },
);

/** Treinador excluído: apaga vínculos (cada delete dispara o sync, que limpa o espelho) e convites. */
export const onCoachDeletedCleanupStaff = onDocumentDeleted(
  "coaches/{coachUid}",
  async (event) => {
    const {coachUid} = event.params;
    const db = getFirestore();
    const [staffSnap, invitesSnap] = await Promise.all([
      db.collection(`coaches/${coachUid}/staff`).get(),
      db.collection("coachStaffInvites").where("coachUid", "==", coachUid).get(),
    ]);
    if (staffSnap.empty && invitesSnap.empty) return;
    const batch = db.batch();
    for (const d of [...staffSnap.docs, ...invitesSnap.docs]) batch.delete(d.ref);
    await batch.commit();
    logger.info("coachStaff: limpeza apos exclusao do treinador", {
      coachUid, staff: staffSnap.size, invites: invitesSnap.size,
    });
  },
);
```

- [ ] **Step 4: Exportar no `index.ts`** (junto do bloco da Task 3):

```ts
export {
  onCoachStaffWrittenSyncMirror,
  onCoachDeletedCleanupStaff,
} from "./coach-staff-sync";
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd functions && npm run build && node --test lib/coach-staff-sync.test.js`
Expected: 3 testes PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/coach-staff-sync.ts functions/src/coach-staff-sync.test.ts functions/src/index.ts
git commit -m "feat(coach): espelho users/{uid}/coachStaff por trigger"
```

---

### Task 5: Rules — `coachCan` e migração das 5 subcoleções

**Files:**
- Modify: `firestore.rules` — bloco `match /coaches/{coachUid}` (hoje ~linhas 2922-2951), `match /coachAthleteInvites` (vizinho, não muda), novos blocos `coachStaffInvites` e `users/{userId}/coachStaff` (junto do `arenaStaff`, ~linha 2080).
- Test: `functions/test/coach-staff-rbac.rules.test.mjs` (novo)

**Interfaces:**
- Consumes: matriz da Task 1 (copiada como mapa literal nas rules).
- Produces: funções de rules `coachStaffExists(coachUid)`, `coachStaffRole(coachUid)`, `coachWriteAreas(role)`, `coachReadAreas(role)`, `coachCan(coachUid, area, write)`.

Definição das funções (inserir imediatamente antes de `match /coaches/{coachUid}`; **as rules não aceitam função dentro de `match` aninhado fora do escopo `/databases/{database}/documents` — inserir no mesmo nível onde `arenaCanWrite` vive**):

```
    // ESPELHO MANUAL de `functions/src/coach-staff-roles.ts` — `functions/test/coach-roles-parity.test.mjs`
    // extrai estes dois mapas e os compara com o TS. Não renomear `coachWriteAreas`/`coachReadAreas`.
    function coachStaffExists(coachUid) {
      return request.auth != null &&
        exists(/databases/$(database)/documents/coaches/$(coachUid)/staff/$(request.auth.uid));
    }
    function coachStaffRole(coachUid) {
      return get(/databases/$(database)/documents/coaches/$(coachUid)/staff/$(request.auth.uid)).data.get('role', '');
    }
    function coachWriteAreas(role) {
      return {
        'auxiliar': ['treinos', 'convocacoes', 'comunicacao'],
        'preparador_fisico': ['fisico'],
        'fisioterapeuta': ['saude'],
        'psicologo': ['mental']
      }.get(role, []);
    }
    function coachReadAreas(role) {
      return {
        'auxiliar': ['treinos', 'convocacoes', 'comunicacao', 'atletas', 'avaliacoes'],
        'preparador_fisico': ['fisico', 'atletas', 'treinos', 'avaliacoes'],
        'fisioterapeuta': ['saude', 'atletas', 'treinos', 'fisico'],
        'psicologo': ['mental', 'atletas']
      }.get(role, []);
    }
    // Dono OU membro cujo cargo cobre a área. `exists()` antes do `get()`: get em doc
    // inexistente é erro de avaliação (deny mudo). Cargo desconhecido cai em [] => nega.
    function coachCan(coachUid, area, write) {
      return request.auth != null && (
        request.auth.uid == coachUid || (
          coachStaffExists(coachUid) && (
            write
              ? coachWriteAreas(coachStaffRole(coachUid)).hasAny([area])
              : coachReadAreas(coachStaffRole(coachUid)).hasAny([area])
          )
        )
      );
    }
```

Substituições nas subcoleções (o doc raiz `coaches/{coachUid}` **não muda**):

| Subcoleção | Antes | Depois |
|---|---|---|
| `squads` | `allow read, write: if uid == coachUid` | `allow read: if coachCan(coachUid, 'atletas', false); allow write: if coachCan(coachUid, 'atletas', true);` |
| `athletes` | idem | idem, área `atletas` |
| `trainings` | idem | read `treinos` false / write `treinos` true |
| `evaluations` | idem | read `avaliacoes` false / write `avaliacoes` true |
| `callUps` | `read`: dono OU `uid in recipients`; `write: false` | `read`: `coachCan(coachUid, 'convocacoes', false) \|\| uid in recipients`; `write: false` (mantém) |

Novos blocos:

```
      // Vínculo da comissão: só o dono e o próprio membro leem; ninguém escreve (Cloud Function).
      match /staff/{staffUserId} {
        allow read: if request.auth != null && (request.auth.uid == coachUid || request.auth.uid == staffUserId);
        allow write: if false;
      }
```
(dentro de `match /coaches/{coachUid}`), e fora dele:

```
    // Convite nominal da comissão. Lido pelo dono e por quem tem o e-mail convidado
    // (a rota de convite precisa ler antes de aceitar). Escrita só via function.
    match /coachStaffInvites/{inviteId} {
      allow read: if request.auth != null && (
        resource.data.get('coachUid', '') == request.auth.uid ||
        (
          resource.data.get('emailLower', '') != '' &&
          request.auth.token.get('email', '') != '' &&
          request.auth.token.email.lower() == resource.data.emailLower
        )
      );
      allow write: if false;
    }
    // Espelho de `coaches/{coachUid}/staff/{uid}` (descoberta no portal). Mantido por trigger.
    match /users/{userId}/coachStaff/{coachUid} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false;
    }
```

- [ ] **Step 1: Escrever o teste de rules que falha**

Arquivo `functions/test/coach-staff-rbac.rules.test.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const COACH = 'coach-uid';
const OUTRO_COACH = 'outro-coach-uid';
const AUX = 'aux-uid';
const PREP = 'prep-uid';
const FISIO = 'fisio-uid';
const PSICO = 'psico-uid';
const ESTRANHO = 'estranho-uid';
const ATLETA = 'atleta-uid';
const CARGOS = [[AUX, 'auxiliar'], [PREP, 'preparador_fisico'], [FISIO, 'fisioterapeuta'], [PSICO, 'psicologo']];

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-coach-staff-rbac-test',
  firestore: { rules },
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const c of [COACH, OUTRO_COACH]) {
      await setDoc(doc(db, 'coaches', c), { displayName: 'Treinador ' + c });
      for (const sub of ['squads', 'athletes', 'trainings', 'evaluations']) {
        await setDoc(doc(db, 'coaches', c, sub, 'x1'), { marker: sub });
      }
      await setDoc(doc(db, 'coaches', c, 'callUps', 'cu1'), { recipients: [ATLETA], title: 't' });
    }
    for (const [uid, role] of CARGOS) {
      await setDoc(doc(db, 'coaches', COACH, 'staff', uid), { role });
    }
    // membro do OUTRO treinador: nao pode tocar no COACH
    await setDoc(doc(db, 'coaches', OUTRO_COACH, 'staff', ESTRANHO), { role: 'auxiliar' });
    // cargo corrompido (editado a mao)
    await setDoc(doc(db, 'coaches', COACH, 'staff', 'cargo-ruim'), { role: 'dono' });
    await setDoc(doc(db, 'coaches', COACH, 'staff', 'sem-cargo'), {});
    await setDoc(doc(db, 'coachStaffInvites', 'conv1'), {
      coachUid: COACH, emailLower: 'novo@x.com', role: 'auxiliar', status: 'pending',
    });
    await setDoc(doc(db, 'coachStaffInvites', 'conv-sem-email'), { coachUid: COACH, status: 'pending' });
    await setDoc(doc(db, 'users', AUX, 'coachStaff', COACH), { role: 'auxiliar' });
  });
});
after(async () => { await testEnv.cleanup(); });

const as = (uid, extra = {}) => testEnv.authenticatedContext(uid, { roles: ['coach'], ...extra }).firestore();
const read = (uid, sub, c = COACH) => getDoc(doc(as(uid), 'coaches', c, sub, 'x1'));
const write = (uid, sub, c = COACH) => setDoc(doc(as(uid), 'coaches', c, sub, 'x1'), { marker: 'novo' });

// area -> subcolecao (areas sem dado ainda nao tem bloco)
const AREAS = { atletas: ['squads', 'athletes'], treinos: ['trainings'], avaliacoes: ['evaluations'] };
// cargo -> { le: [areas], escreve: [areas] } (espelha a matriz da Task 1)
const MATRIZ = {
  [AUX]: { le: ['atletas', 'treinos', 'avaliacoes'], escreve: ['treinos'] },
  [PREP]: { le: ['atletas', 'treinos', 'avaliacoes'], escreve: [] },
  [FISIO]: { le: ['atletas', 'treinos'], escreve: [] },
  [PSICO]: { le: ['atletas'], escreve: [] },
};

test('dono le e escreve tudo', async () => {
  for (const subs of Object.values(AREAS)) for (const s of subs) {
    await assertSucceeds(read(COACH, s));
    await assertSucceeds(write(COACH, s));
  }
  await assertSucceeds(getDoc(doc(as(COACH), 'coaches', COACH)));
});

for (const [uid] of CARGOS) {
  test(`cargo ${uid}: matriz exata de leitura e escrita nas subcolecoes`, async () => {
    for (const [area, subs] of Object.entries(AREAS)) for (const s of subs) {
      const r = MATRIZ[uid].le.includes(area) ? assertSucceeds : assertFails;
      const w = MATRIZ[uid].escreve.includes(area) ? assertSucceeds : assertFails;
      await r(read(uid, s));
      await w(write(uid, s));
    }
  });
}

test('auxiliar apaga e cria treino (escrita inclui delete e create)', async () => {
  await assertSucceeds(setDoc(doc(as(AUX), 'coaches', COACH, 'trainings', 'novo'), { title: 'T' }));
  await assertSucceeds(deleteDoc(doc(as(AUX), 'coaches', COACH, 'trainings', 'novo')));
});

test('ninguem da comissao le o doc raiz do treinador', async () => {
  for (const [uid] of CARGOS) await assertFails(getDoc(doc(as(uid), 'coaches', COACH)));
});

test('ninguem da comissao escreve o doc raiz do treinador', async () => {
  for (const [uid] of CARGOS) await assertFails(updateDoc(doc(as(uid), 'coaches', COACH), { displayName: 'hack' }));
});

test('convocacao: auxiliar le, mas ninguem escreve direto (so function)', async () => {
  await assertSucceeds(getDoc(doc(as(AUX), 'coaches', COACH, 'callUps', 'cu1')));
  await assertFails(getDoc(doc(as(PSICO), 'coaches', COACH, 'callUps', 'cu1')));
  await assertFails(setDoc(doc(as(AUX), 'coaches', COACH, 'callUps', 'cu1'), { title: 'x' }));
  await assertFails(setDoc(doc(as(COACH), 'coaches', COACH, 'callUps', 'cu1'), { title: 'x' }));
});

test('atleta convocado continua lendo a propria convocacao', async () => {
  await assertSucceeds(getDoc(doc(as(ATLETA), 'coaches', COACH, 'callUps', 'cu1')));
});

test('estranho nao le nada; membro de OUTRO treinador tambem nao', async () => {
  for (const uid of [ESTRANHO]) for (const subs of Object.values(AREAS)) for (const s of subs) {
    await assertFails(read(uid, s));
    await assertFails(write(uid, s));
  }
});

test('cargo corrompido ou ausente no doc staff nega tudo, sem erro silencioso que libere', async () => {
  for (const uid of ['cargo-ruim', 'sem-cargo']) {
    await assertFails(read(uid, 'squads'));
    await assertFails(write(uid, 'trainings'));
  }
});

test('ninguem escreve na subcolecao staff, nem o dono; membro nao se promove', async () => {
  await assertFails(setDoc(doc(as(COACH), 'coaches', COACH, 'staff', ESTRANHO), { role: 'auxiliar' }));
  await assertFails(setDoc(doc(as(AUX), 'coaches', COACH, 'staff', AUX), { role: 'auxiliar' }));
  await assertFails(deleteDoc(doc(as(AUX), 'coaches', COACH, 'staff', AUX)));
});

test('staff: dono e o proprio membro leem; outro membro nao', async () => {
  await assertSucceeds(getDoc(doc(as(COACH), 'coaches', COACH, 'staff', AUX)));
  await assertSucceeds(getDoc(doc(as(AUX), 'coaches', COACH, 'staff', AUX)));
  await assertFails(getDoc(doc(as(PSICO), 'coaches', COACH, 'staff', AUX)));
  await assertFails(getDocs(collection(as(PSICO), 'coaches', COACH, 'staff')));
});

test('convite: dono le; convidado le pelo e-mail; terceiro e sessao sem e-mail nao', async () => {
  await assertSucceeds(getDoc(doc(as(COACH), 'coachStaffInvites', 'conv1')));
  await assertSucceeds(getDoc(doc(as('novo', { email: 'novo@x.com' }), 'coachStaffInvites', 'conv1')));
  await assertFails(getDoc(doc(as('outro', { email: 'outro@x.com' }), 'coachStaffInvites', 'conv1')));
  await assertFails(getDoc(doc(as('anon'), 'coachStaffInvites', 'conv-sem-email')));
  await assertFails(setDoc(doc(as(COACH), 'coachStaffInvites', 'novo'), { coachUid: COACH }));
});

test('espelho: so o proprio usuario le, ninguem escreve', async () => {
  await assertSucceeds(getDoc(doc(as(AUX), 'users', AUX, 'coachStaff', COACH)));
  await assertFails(getDoc(doc(as(PSICO), 'users', AUX, 'coachStaff', COACH)));
  await assertFails(setDoc(doc(as(AUX), 'users', AUX, 'coachStaff', OUTRO_COACH), { role: 'auxiliar' }));
});

test('campos congelados: trainings do auxiliar nao tem campo de identidade/dinheiro (revisitar se surgir)', async () => {
  // Documenta a analise do plano: o unico escritor de staff via rules e o auxiliar em
  // `trainings`. Se um campo sensivel (ex.: ownerUid, valor) entrar no doc, este teste
  // deve ser trocado por um assertFails por campo, como em staffKeepsTournamentMoneyFields.
  await assertSucceeds(setDoc(doc(as(AUX), 'coaches', COACH, 'trainings', 'x1'), { attendance: { a: 'presente' }, status: 'done' }));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && firebase emulators:exec --only firestore --project nexago-rules-test "node --test --test-concurrency=1 test/coach-staff-rbac.rules.test.mjs"`
Expected: vários FAIL (staff hoje é negado em tudo, mas os `assertSucceeds` do auxiliar/preparador falham; blocos novos não existem).

- [ ] **Step 3: Editar `firestore.rules`** — inserir as funções e aplicar a tabela de substituições e os blocos novos acima.

- [ ] **Step 4: Rodar a suíte de rules completa**

Run: `cd functions && npm run test:rules 2>&1 | tail -25`
Expected: todos PASS, inclusive os `*.rules.test.mjs` pré-existentes (nenhuma regressão). Se `measure-users-rules-budget` for relevante: este plano não toca em `users/{uid}` update, só adiciona uma subcoleção — nada a medir.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules functions/test/coach-staff-rbac.rules.test.mjs
git commit -m "feat(coach): rules por cargo e área para a comissão técnica"
```

---

### Task 6: Callables existentes autorizam por área

**Files:**
- Modify: `functions/src/coach-athlete-invite.ts` (`sendCoachAthleteInvite` ~l.20-90, `cancelCoachAthleteInvite` ~l.143-183)
- Modify: `functions/src/coach-athlete-search.ts` (~l.28-50)
- Modify: `functions/src/coach-call-up.ts` (`sendCallUp` ~l.18-80)
- Modify: `functions/src/coach-tournament-overview.ts` (~l.54-70)

**Interfaces:**
- Consumes: `resolveCoachUid`, `assertCoachAreaAccess` (Task 2).
- Produces: as 4 callables aceitam `coachUid?: string` no payload; ausente ⇒ comportamento atual. `respondToCallUp` e `acceptCoachAthleteInvite` **não mudam** (são do atleta).

Mapa área × callable (decisão: o que cada uma faz determina a área):

| Callable | Área | Modo |
|---|---|---|
| `sendCoachAthleteInvite` | `atletas` | write |
| `cancelCoachAthleteInvite` (ramo treinador) | `atletas` | write |
| `searchAthleteForCoachInvite` | `atletas` | write (é o passo que antecede o convite) |
| `sendCallUp` | `convocacoes` | write |
| `getCoachTournamentOverview` | `atletas` | read |

Como só o dono tem `atletas` write, convidar atleta continua exclusivo do principal na v1 — o ganho aqui é que o guard já está no lugar para quando a matriz mudar, e que `sendCallUp`/overview passam a funcionar para o auxiliar/demais.

- [ ] **Step 1: Teste que falha** — acrescentar a `functions/src/coach-area-access.test.ts` o contrato que as callables usam:

```ts
test("contrato das callables: payload sem coachUid opera como hoje (dono)", () => {
  const caller = "u1";
  const coachUid = resolveCoachUid({squadId: "s"}, caller);
  assert.equal(coachUid, caller);
  assert.equal(decideCoachAreaAccess(coachUid, caller, null, "convocacoes", "write"), true);
});

test("contrato: coachUid forjado de outro treinador sem vinculo nega", () => {
  const coachUid = resolveCoachUid({coachUid: "B"}, "u1");
  assert.equal(coachUid, "B");
  assert.equal(decideCoachAreaAccess(coachUid, "u1", null, "convocacoes", "write"), false);
});

test("contrato: psicologo nao envia convocacao, auxiliar envia", () => {
  assert.equal(decideCoachAreaAccess("B", "m", {role: "psicologo"}, "convocacoes", "write"), false);
  assert.equal(decideCoachAreaAccess("B", "m", {role: "auxiliar"}, "convocacoes", "write"), true);
});
```

- [ ] **Step 2: Rodar** — `cd functions && npm run build && node --test lib/coach-area-access.test.js` → PASS (guard já existe; este teste trava o contrato).

- [ ] **Step 3: `sendCallUp`** — trocar a obtenção de `coachUid`:

```ts
// antes
const coachUid = request.auth?.uid;
if (!coachUid) {
  throw new HttpsError("unauthenticated", "Usuário não autenticado.");
}
// depois
const uid = request.auth?.uid;
if (!uid) {
  throw new HttpsError("unauthenticated", "Usuário não autenticado.");
}
const coachUid = resolveCoachUid(request.data, uid);
```
e, logo depois de `const db = getFirestore();`, inserir `await assertCoachAreaAccess(db, uid, coachUid, "convocacoes", "write");`. Importar `{resolveCoachUid, assertCoachAreaAccess}` de `./coach-area-access`. O restante (`coachName` lido de `coaches/${coachUid}`, vínculos de `coaches/${coachUid}/athletes`) já usa `coachUid` — nada mais muda. O log final ganha `byUid: uid`.

- [ ] **Step 4: `getCoachTournamentOverview`** — mesma troca de `coachUid`, com `await assertCoachAreaAccess(db, uid, coachUid, "atletas", "read");` depois de `const db = getFirestore();`.

- [ ] **Step 5: `searchAthleteForCoachInvite`** — hoje `const uid = …` e a checagem "é treinador" é `coaches/${uid}` existir. Trocar por:

```ts
const coachUid = resolveCoachUid(request.data, uid);
await assertCoachAreaAccess(db, uid, coachUid, "atletas", "write");
const coachSnap = await db.doc(`coaches/${coachUid}`).get();
if (!coachSnap.exists) {
  throw new HttpsError("permission-denied", "Apenas treinadores podem buscar atletas.");
}
```
(e `logger.info(... {coachUid, byUid: uid, foundUid: user.uid})`). O `db` precisa ser criado antes do `assert`; mover `const db = getFirestore();` para cima se necessário.

- [ ] **Step 6: `sendCoachAthleteInvite`** — `coachUid = resolveCoachUid(request.data, uid)`; `assertCoachAreaAccess(db, uid, coachUid, "atletas", "write")` após `getFirestore()`; a checagem `athleteUid === coachUid` permanece (convidar o próprio treinador-alvo). **Review Focus 7:** a checagem `coaches/${coachUid}` existir usa o `coachUid` resolvido, então um membro (que não tem `coaches/{uid}` próprio) convidando em nome do treinador não cai em "Complete seu cadastro".

- [ ] **Step 7: `cancelCoachAthleteInvite`** — o ramo "treinador" hoje é `invite.coachUid === uid`. Trocar por: `const isCoach = invite["coachUid"] === uid;` **mais** fallback por área:

```ts
let isCoach = invite["coachUid"] === uid;
if (!isCoach && !isAthlete) {
  try {
    await assertCoachAreaAccess(db, uid, String(invite["coachUid"] ?? ""), "atletas", "write");
    isCoach = true;
  } catch {
    isCoach = false;
  }
}
```
posicionado depois de calcular `isAthlete` e antes do `if (!isCoach && !isAthlete)` existente.

- [ ] **Step 8: Build e testes**

Run: `cd functions && npm run build && node --test lib/coach-*.test.js`
Expected: build limpo; todos os `coach-*` PASS (os testes existentes de `coach-call-up`, `coach-athlete-search`, `coach-tournament-overview` testam funções puras e não devem mudar).

- [ ] **Step 9: Commit**

```bash
git add functions/src/coach-athlete-invite.ts functions/src/coach-athlete-search.ts functions/src/coach-call-up.ts functions/src/coach-tournament-overview.ts functions/src/coach-area-access.test.ts
git commit -m "feat(coach): callables do treinador autorizam por área (coachUid opcional)"
```

---

### Task 7: Teste de paridade matriz TS × rules

**Files:**
- Create: `functions/test/coach-roles-parity.test.mjs`
- Modify: `functions/package.json` (script `test`: acrescentar `test/coach-roles-parity.test.mjs` à lista)

**Interfaces:**
- Consumes: `lib/coach-staff-roles.js` (saída do `tsc`, por isso roda depois do build, como os outros testes do `npm test`), `firestore.rules`.

- [ ] **Step 1: Escrever o teste** (falha se o parser achar zero cargos — evita teste vazio que sempre passa):

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COACH_AREAS, COACH_STAFF_ROLES, coachRoleCanRead, coachRoleCanWrite,
} from '../lib/coach-staff-roles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

/** Extrai `function <name>(role) { return { 'cargo': ['a', 'b'], ... }.get(role, []); }`. */
function parseMap(name) {
  const m = rules.match(new RegExp(`function ${name}\\(role\\) \\{\\s*return \\{([\\s\\S]*?)\\}\\.get\\(role, \\[\\]\\);`));
  assert.ok(m, `funcao ${name} nao encontrada em firestore.rules`);
  const out = {};
  for (const line of m[1].split('\n')) {
    const e = line.match(/'([a-z_]+)':\s*\[([^\]]*)\]/);
    if (!e) continue;
    out[e[1]] = e[2].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean).sort();
  }
  return out;
}

const writeMap = parseMap('coachWriteAreas');
const readMap = parseMap('coachReadAreas');

test('as rules cobrem exatamente os mesmos cargos do TS', () => {
  assert.deepEqual(Object.keys(writeMap).sort(), [...COACH_STAFF_ROLES].sort());
  assert.deepEqual(Object.keys(readMap).sort(), [...COACH_STAFF_ROLES].sort());
});

test('escrita: rules == TS, cargo a cargo', () => {
  for (const role of COACH_STAFF_ROLES) {
    const ts = COACH_AREAS.filter((a) => coachRoleCanWrite(role, a)).sort();
    assert.deepEqual(writeMap[role], ts, `escrita de ${role}`);
  }
});

test('leitura: rules == TS (leitura total = escrita + so-leitura), cargo a cargo', () => {
  for (const role of COACH_STAFF_ROLES) {
    const ts = COACH_AREAS.filter((a) => coachRoleCanRead(role, a)).sort();
    assert.deepEqual(readMap[role], ts, `leitura de ${role}`);
  }
});

test('toda area citada nas rules existe no TS (erro de digitacao nao passa)', () => {
  for (const map of [writeMap, readMap]) {
    for (const areas of Object.values(map)) {
      for (const a of areas) assert.ok(COACH_AREAS.includes(a), `area desconhecida: ${a}`);
    }
  }
});
```

- [ ] **Step 2: Rodar**

Run: `cd functions && npm run build && node --test test/coach-roles-parity.test.mjs`
Expected: 4 testes PASS.

- [ ] **Step 3: Provar que o teste morde** — trocar temporariamente `'psicologo': ['mental']` por `['mental', 'saude']` em `firestore.rules`, rodar de novo e ver **FAIL** em "escrita: rules == TS"; reverter a edição (`git checkout firestore.rules` **só se não houver edição pendente da Task 5 não commitada** — como a Task 5 já foi commitada, `git checkout firestore.rules` é seguro).

- [ ] **Step 4: Adicionar o arquivo à lista do script `test`** em `functions/package.json` (após `test/sports-catalog.test.mjs`): ` test/coach-roles-parity.test.mjs`. Rodar `cd functions && npm test 2>&1 | tail -15` → tudo PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/test/coach-roles-parity.test.mjs functions/package.json
git commit -m "test(coach): paridade da matriz de cargos entre TS e rules"
```

---

### Task 8: QA e2e contra o dev (rules + functions juntos)

**Files:**
- Create: `functions/scripts/qa-coach-staff-rbac-e2e.mjs`

**Interfaces:**
- Consumes: **rules e functions já deployadas no dev** (Tasks 3–6). Este script **não** deploya e **não** roda sem o usuário ter autorizado o deploy no dev. Reusa o esqueleto de `functions/scripts/qa-arena-staff-rbac-e2e.mjs` (helpers `signUp`, `call`, `expectError`, `fsGet`, `fsWrite`, `ok`; `PID = "volley-track-dev-4596c"` com trava `if (PID !== …) throw`; `firebase-admin` com ADC para montar/limpar fixture). **Copiar esses helpers literalmente** (mesmo arquivo-fonte, mesmas linhas) em vez de reescrever.

Contas descartáveis: `coach-qa-${ts}@example.test` (treinador), um por cargo (`aux`, `prep`, `fisio`, `psico`), `estranho`, `atleta`. Setup por admin SDK: custom claim `coach` no treinador e `coaches/{coachUid}` com `displayName`; 1 doc em `squads`, `athletes` (vínculo do atleta), `trainings`, `evaluations`.

Asserções (cada uma é um `ok(...)`/`expectError(...)`):

1. **Convite**: treinador `createCoachStaffInvite({email: aux.email, role: "auxiliar"})` → devolve `inviteId`; segundo convite igual → `already-exists`; `role: "principal"` → `invalid-argument`; treinador convidando o próprio e-mail → `invalid-argument`; estranho (sem `coaches/{uid}`) chamando `create` → `failed-precondition`.
2. **Aceite**: e-mail errado → `permission-denied`; e-mail certo → `{coachUid, role}`; segundo aceite → `failed-precondition`; depois do aceite existe `coaches/{coachUid}/staff/{aux}`, o espelho `users/{aux}/coachStaff/{coachUid}` aparece em ≤ 5 s (poll), e o usuário ganhou a claim `coach`.
3. **Rules via REST com o token de cada cargo**: auxiliar lê/escreve `trainings`, lê `squads`/`athletes`/`evaluations`, **não** escreve `squads` nem `evaluations`; preparador lê `evaluations`, não escreve `trainings`; fisio lê `trainings`, não `evaluations`; psicólogo lê `squads`, não `trainings`; ninguém lê `coaches/{coachUid}` raiz; estranho nega tudo.
4. **Callables (o Critical da arena)**: `sendCallUp({coachUid, squadId, title, recipients:[atleta]})` — auxiliar **ok**; psicólogo → `permission-denied`; estranho com `coachUid` forjado → `permission-denied`; membro de A passando `coachUid` de B → `permission-denied`; sem `coachUid` no payload pelo dono → ok (retrocompat). `getCoachTournamentOverview({coachUid})` — psicólogo ok (`atletas` read), estranho nega. `sendCoachAthleteInvite({coachUid, athleteUid})` — auxiliar → `permission-denied` (só dono tem `atletas` write); dono ok.
5. **Corte imediato**: `removeCoachStaff({staffUserId: aux})` → imediatamente depois o token do auxiliar (sem renovar) **já** recebe 403 em `trainings` (rules leem `staff` ao vivo); espelho some em ≤ 5 s. `changeCoachStaffRole` do preparador para `psicologo` → o acesso muda na hora (lê `squads`, perde `evaluations`).
6. **`leaveCoachStaff`** pelo próprio membro remove o vínculo; chamar com `coachUid` de outro treinador não afeta nada (só apaga o doc `…/staff/{próprio uid}`, que não existe lá).
7. **Limpeza** no `finally`: apaga `coaches/{coachUid}` (o trigger remove staff e convites), usuários criados e docs de fixture.

- [ ] **Step 1: Escrever o script** com os helpers copiados + as 7 seções acima; terminar com `console.log(\`${pass} ok, ${fail} falhas\`)` e `process.exit(fail ? 1 : 0)`.
- [ ] **Step 2: Conferir sintaxe sem executar** — Run: `cd functions && node --check scripts/qa-coach-staff-rbac-e2e.mjs` → sem saída (OK).
- [ ] **Step 3: PARAR e perguntar ao usuário** se pode fazer o deploy no dev (rules + as 8 funções novas + 4 alteradas). Só com "sim": `firebase deploy --only firestore:rules --project volley-track-dev-4596c`, depois `firebase deploy --only functions:createCoachStaffInvite,functions:acceptCoachStaffInvite,functions:revokeCoachStaffInvite,functions:changeCoachStaffRole,functions:removeCoachStaff,functions:leaveCoachStaff,functions:onCoachStaffWrittenSyncMirror,functions:onCoachDeletedCleanupStaff,functions:sendCoachAthleteInvite,functions:cancelCoachAthleteInvite,functions:searchAthleteForCoachInvite,functions:sendCallUp,functions:getCoachTournamentOverview --project volley-track-dev-4596c` e **conferir cada função** na saída (um "No changes detected" após falha parcial mente — ver memória `deploy-no-changes-mente-apos-falha-parcial`). Rules **antes** das functions.
- [ ] **Step 4: Rodar o QA** — `cd functions && node scripts/qa-coach-staff-rbac-e2e.mjs` → Expected: `N ok, 0 falhas`.
- [ ] **Step 5: Commit**

```bash
git add functions/scripts/qa-coach-staff-rbac-e2e.mjs
git commit -m "test(coach): QA e2e do RBAC da comissão técnica contra o dev"
```

---

## O que a fase 1 NÃO faz (fica para a fase 2 em diante)

- Nenhuma UI: o portal ainda usa `auth.user().uid` como `coachUid`. Um membro que entrar no portal vê um painel vazio dele mesmo até a fase 2 (`CoachContextService`, seletor, guards, tela Permissões real, rota `/convite-equipe/:id`).
- Sem dados novos (`injuries`, `fisico`, `wellbeingNotes`, `announcements`, `availability`): as áreas `fisico`/`saude`/`mental`/`comunicacao`/`financeiro` existem na matriz e nas rules como mapa, mas ainda sem bloco de `match`.
- Sem notificação ao convidado (o treinador compartilha o link).
- O model do portal entra no teste de paridade na fase 2.

## Self-review

- **Spec coverage:** cargos/áreas/matriz (T1), modelo `staff`/`coachStaffInvites`/espelho (T3, T4, T5), callables de convite/troca/remoção/saída (T3), `coachCan` + migração das 5 subcoleções (T5), guard server-side e os 4 callables existentes (T2, T6), teste de paridade (T7), QA e2e (T8), retrocompat (Global Constraints, T6 step 3–7, T8 §4). Seções 6 (portal), 7 (LGPD) e áreas novas (fase 3) ficam fora de propósito. `presenca` fundida em `treinos` (decisão registrada + T1 step 5).
- **Placeholders:** nenhum. T8 descreve o script por asserções (não por código) porque o esqueleto é cópia de arquivo existente; o executor copia os helpers e escreve as asserções listadas.
- **Consistência de tipos:** `CoachStaffRole`/`CoachArea`/`isCoachStaffRole`/`coachRoleCanRead|Write` (T1) → `decideCoachAreaAccess`/`resolveCoachUid`/`assertCoachAreaAccess` (T2) → T3/T4/T6/T7; assinatura `assertCoachAreaAccess(db, uid, coachUid, area, mode)` é a mesma em T2 e T6; nomes das rules `coachWriteAreas`/`coachReadAreas` batem com o parser da T7.
