# Migração `role` → `roles[]` — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar o campo legado `role` (string) de docs de usuário, custom claims e todos os fallbacks; `roles[]` vira a única fonte de papéis; cadastro de atleta cria `users/{uid}` com `roles: ['athlete']`.

**Architecture:** Migração em camadas com ordem de deploy fixa: índices → functions (param de emitir legado) → backfill (limpa docs+claims) → app Flutter (novo cadastro, queries só `roles`/`hasAthleteRole`) → rules (bloqueiam `role`). Spec: `docs/superpowers/specs/2026-07-15-role-to-roles-migration-design.md`.

**Tech Stack:** Firebase (Firestore, Auth, Cloud Functions v2/TypeScript), Flutter/Dart (Riverpod), Angular (portais web), firebase-admin (script de backfill).

## Global Constraints

- Papéis válidos: `admin`, `organizer`, `athlete`, `arena`, `coach` (constante `ALLOWED_APP_ROLES` em `functions/src/auth-roles.ts`).
- Projeto dev: `volley-track-dev-4596c`. Prod NÃO entra neste plano (deploy prod é decisão posterior do dono).
- `role` de staff de torneio (`tournaments/{t}/staff`) e de membro de equipe de arena são OUTRO conceito — nunca tocar.
- Firestore permite apenas UM `array-contains` por query: onde `role ==` combinava com outro `array-contains` (ex. `discoverSportIds`), a substituição é `hasAthleteRole == true`, não `roles array-contains`.
- Ordem de deploy dev (Task 10): índices → functions → backfill → app → rules. Rules NUNCA antes do backfill.
- Convenções do repo: strings/UI em português, código em inglês; comentários explicam restrições, não a mudança.
- Working tree tem `frontend/projects/arena/src/app/painel/ranking/panel-ranking.component.ts` modificado (trabalho alheio a este plano) — NÃO commitar esse arquivo junto.

---

### Task 1: Functions — `auth-roles.ts` para de emitir o legado

**Files:**
- Modify: `functions/src/auth-roles.ts`
- Test: `functions/src/auth-roles.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `rolesFromClaims(claims)` → `AppRole[]` (sem fallback de `claims.role`); `applyRolesToClaims(previous, nextRoles)` → claims SEM a chave `role`; `firestoreRolesPayload(roles)` → `{roles: AppRole[], role: FieldValue.delete()}`. Tasks 2 e 3 dependem desses contratos.

- [ ] **Step 1: Reescrever os testes para o contrato novo**

Substituir em `functions/src/auth-roles.test.ts` os testes que asseguram o legado (os `it` "sets roles list and legacy role=coach...", "prefers arena over coach in the legacy role field...", "prefers coach over athlete in the legacy role field" e a asserção `payload["role"] === "coach"`) por:

```ts
import {FieldValue} from "firebase-admin/firestore";
import {applyRolesToClaims, firestoreRolesPayload, isAllowedRole, rolesFromClaims} from "./auth-roles";

it("sets the roles list and strips the legacy role claim", () => {
  const claims = applyRolesToClaims({role: "coach", other: 1}, ["coach"]);
  assert.deepEqual(claims["roles"], ["coach"]);
  assert.equal("role" in claims, false);
  assert.equal(claims["other"], 1);
});

it("ignores the legacy role claim when reading roles", () => {
  assert.deepEqual(rolesFromClaims({role: "athlete"}), []);
  assert.deepEqual(rolesFromClaims({roles: ["athlete"], role: "arena"}), ["athlete"]);
});

it("firestoreRolesPayload purges the legacy role field", () => {
  const payload = firestoreRolesPayload(["coach", "athlete"]);
  assert.deepEqual(payload["roles"], ["athlete", "coach"]);
  assert.ok((payload["role"] as FieldValue).isEqual(FieldValue.delete()));
});
```

Manter os testes existentes que não citam o legado (ex.: "accepts coach as a valid role").

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm run build && node --test lib/auth-roles.test.js`
Expected: FAIL (o código atual ainda grava `role` legado e `rolesFromClaims` ainda tem fallback).

- [ ] **Step 3: Implementar**

Em `functions/src/auth-roles.ts`:

Adicionar no topo: `import {FieldValue} from "firebase-admin/firestore";`

Substituir `rolesFromClaims` (remove o fallback das linhas 24–27):

```ts
export function rolesFromClaims(claims: {[key: string]: unknown} | undefined): AppRole[] {
  if (!claims) return [];
  const rolesClaim = claims["roles"];
  if (!Array.isArray(rolesClaim)) return [];
  const out: AppRole[] = [];
  for (const x of rolesClaim) {
    if (typeof x === "string" && isAllowedRole(x) && !out.includes(x)) {
      out.push(x);
    }
  }
  return out.sort();
}
```

Substituir `applyRolesToClaims`:

```ts
/**
 * Atualiza claims com a lista de papéis (`roles`) e remove o claim legado
 * `role`. Remove `superAdmin` se não houver mais papel admin.
 */
export function applyRolesToClaims(
  previous: Record<string, unknown>,
  nextRoles: AppRole[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {...previous};
  const sorted = uniqueSortedRoles(nextRoles);
  out["roles"] = sorted;
  delete out["role"];
  if (!sorted.includes("admin")) {
    delete out["superAdmin"];
  }
  return out;
}
```

Substituir `firestoreRolesPayload`:

```ts
/** Campos de papéis para `users/{uid}` — purga o legado `role` em todo write. */
export function firestoreRolesPayload(roles: AppRole[]): Record<string, unknown> {
  return {
    roles: uniqueSortedRoles(roles),
    role: FieldValue.delete(),
  };
}
```

Atualizar o comentário da linha 50 (`/** Gestor de arena no app mobile (\`role\` / \`roles\` contém \`arena\`). */`) para citar só `roles`.

- [ ] **Step 4: Rodar testes**

Run: `cd functions && npm run build && node --test lib/auth-roles.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add functions/src/auth-roles.ts functions/src/auth-roles.test.ts
git commit -m "feat(functions): auth-roles emite apenas roles[], purga legado role"
```

---

### Task 2: Functions — leitores/escritores auxiliares sem legado

**Files:**
- Modify: `functions/src/search-keywords.ts:115-122,236`
- Modify: `functions/src/public-profile-sync.ts:29`
- Modify: `functions/src/user-account-ops.ts:161-208,479-486`
- Modify: `functions/src/user-profile-link.ts:67-101`
- Modify: `functions/src/user-role-ops.ts` (remover `migrateUsersToMultiRole`, linhas ~246-301, e o comentário legado da linha 18)
- Modify: `functions/src/index.ts:207` (remover export de `migrateUsersToMultiRole`)
- Test: `functions/src/search-keywords.test.ts`, `functions/src/public-profile-sync.test.ts`, `functions/src/arena-signup.test.ts`, `functions/src/coach-signup.test.ts`

**Interfaces:**
- Consumes: `firestoreRolesPayload`/`rolesFromClaims` da Task 1 (contratos novos).
- Produces: `buildUserSearchFields(data)` deriva `hasAthleteRole`/`hasOrganizerRole` SÓ de `data.roles`; `PUBLIC_PROFILE_FIELDS` sem `"role"`; `getUserRole` retorna `{roles, role: roles[0] ?? null}` (campo `role` da RESPOSTA é derivado, mantido por compat de API do backoffice).

- [ ] **Step 1: Atualizar testes que asseguram o legado**

Em `search-keywords.test.ts`: localizar (grep `role`) asserções em que um doc só com `{role: 'athlete'}` produz `hasAthleteRole: true` — inverter para esperar `false`, e garantir que exista caso com `{roles: ['athlete']}` → `true`. Em `public-profile-sync.test.ts`: asserções de que `role` é espelhado passam a esperar que `role` NÃO apareça no resultado de `buildPublicProfileData({role: 'athlete', ...})`. Em `arena-signup.test.ts`/`coach-signup.test.ts`: asserções sobre claims/payload com `role` legado passam a esperar ausência da chave (claims) e sentinela de delete (payload), como na Task 1.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm test`
Expected: FAIL nos testes ajustados.

- [ ] **Step 3: Implementar**

`search-keywords.ts` — substituir `userDocHasRole` (linhas 115–122):

```ts
function userDocHasRole(data: Record<string, unknown>, role: string): boolean {
  const roles = data.roles;
  return Array.isArray(roles) &&
    roles.some((r) => typeof r === "string" && r.trim().toLowerCase() === role);
}
```

e na linha 236 trocar a lista por:

```ts
  const keys = ["fullName", "name", "nickname", "email", "roles"];
```

`public-profile-sync.ts` — remover a linha `"role",` (linha 29) de `PUBLIC_PROFILE_FIELDS`.

`user-account-ops.ts` — em `backofficeUserMatchesSearch` (linhas 166–178), remover `legacy`/`roleStr` e tirar `roleStr` de `pieces`. Em `backofficeRowFromUserRecord` (linhas 193–197):

```ts
function backofficeRowFromUserRecord(u: UserRecord, fullName: string | null) {
  const roles = rolesFromClaims(u.customClaims);
  const role = roles.length > 0 ? roles[0]! : null;
```

Em `getUserRole` (linhas 479–486):

```ts
    const user = await getAuth().getUser(uid);
    const roles = rolesFromClaims(user.customClaims);
    return {
      roles,
      role: roles[0] ?? null,
    };
```

`user-profile-link.ts` — substituir o bloco das linhas 67–72 por:

```ts
      const userData = userSnap.exists ? userSnap.data() || {} : {};
      const existingRoles = Array.isArray(userData["roles"]) ?
        (userData["roles"] as unknown[]).filter((r): r is string => typeof r === "string") :
        [];
      const nextPayload: Record<string, unknown> = {
        email: normalizedEmail,
        roles: existingRoles.length > 0 ? existingRoles : ["athlete"],
        role: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      };
```

e no merge com conta legada (linhas 92–101), substituir a linha do `role` por união de `roles`:

```ts
        const legacyData = legacySnap.data() || {};
        const legacyRoles = Array.isArray(legacyData["roles"]) ?
          (legacyData["roles"] as unknown[]).filter((r): r is string => typeof r === "string") :
          [];
        const mergedPayload: Record<string, unknown> = {
          ...legacyData,
          ...nextPayload,
          email: normalizedEmail,
          roles: Array.from(new Set([...legacyRoles, ...(nextPayload["roles"] as string[])])),
          role: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        };
```

`user-role-ops.ts` — apagar a função `migrateUsersToMultiRole` inteira (do `export const migrateUsersToMultiRole = onCall(...)` até seu `});`) e atualizar o comentário da linha 18 para `* Grava claim \`roles: [role]\` (o legado \`role\` é purgado).`. Em `index.ts`, remover a linha `migrateUsersToMultiRole,` do bloco de exports de `./user-role-ops`.

- [ ] **Step 4: Rodar testes e lint**

Run: `cd functions && npm test && npm run lint --if-present`
Expected: PASS (nenhum teste referencia mais `migrateUsersToMultiRole`; se algum referenciar, remover o teste junto).

- [ ] **Step 5: Commit**

```bash
git add functions/src
git commit -m "feat(functions): leitura/escrita de papéis só via roles[]; remove migrateUsersToMultiRole"
```

---

### Task 3: Script de backfill `backfill-remove-legacy-role.js`

**Files:**
- Create: `functions/scripts/backfill-remove-legacy-role.js`
- Delete: `functions/scripts/backfill-athlete-roles.js` (superado — reescreveria o legado `role`)

**Interfaces:**
- Consumes: nada de código do repo (usa firebase-admin puro; duplica a constante de papéis de propósito, para o script ser autônomo).
- Produces: estado de dados que as Tasks 8 (rules) e 10 (deploy) pressupõem: todo doc `users`/`public_profiles` com `roles[]` e sem `role`; claims sem a chave `role`. Dry-run serve de auditoria (Task 10 reexecuta esperando 0 pendências).

- [ ] **Step 1: Escrever o script**

Criar `functions/scripts/backfill-remove-legacy-role.js`:

```js
/* eslint-disable */
/**
 * Remove o campo legado `role` de users/{uid}, public_profiles/{uid} e dos
 * custom claims do Auth, garantindo `roles[]` como única fonte de papéis.
 *
 * Passe A — usuários do Auth: resolve papéis efetivos
 *   (claims.roles → [claims.role] → doc.roles → [doc.role] → ['athlete']),
 *   regrava claims sem `role` e o doc com roles[]/hasAthleteRole/
 *   hasOrganizerRole. Cria doc mínimo quando não existe (mesmo formato que
 *   o app novo grava no cadastro).
 * Passe B — varredura de users/: docs sem conta no Auth (ex.: pré-cadastro
 *   de parceiro) que ainda tenham `role` ou estejam sem `roles[]`.
 * Passe C — varredura de public_profiles/: deleta `role` remanescente.
 *
 * Rode DEPOIS do deploy das functions novas (o sync antigo re-espelharia
 * `role` de volta).
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-remove-legacy-role.js --project volley-track-dev-4596c
 *   node scripts/backfill-remove-legacy-role.js --project <projectId> --yes
 *   node scripts/backfill-remove-legacy-role.js --project <projectId> --yes --limit 50
 */

const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
const LIMIT = parseInt(argValue("--limit") || "0", 10);

if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

admin.initializeApp({projectId});
const auth = admin.auth();
const db = admin.firestore();

const ALLOWED_ROLES = ["admin", "organizer", "athlete", "arena", "coach"];

function normalizeRoles(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (typeof r !== "string") continue;
    const v = r.trim().toLowerCase();
    if (ALLOWED_ROLES.includes(v) && !out.includes(v)) out.push(v);
  }
  return out.sort();
}

function legacyRoleOf(raw) {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return ALLOWED_ROLES.includes(v) ? v : null;
}

function roleFlags(roles) {
  return {
    hasAthleteRole: roles.includes("athlete"),
    hasOrganizerRole: roles.includes("organizer"),
  };
}

/** claims.roles → [claims.role] → doc.roles → [doc.role] → ['athlete'] */
function effectiveRoles(claims, docData) {
  const fromClaims = normalizeRoles(claims && claims.roles);
  if (fromClaims.length > 0) return fromClaims;
  const legacyClaim = legacyRoleOf(claims && claims.role);
  if (legacyClaim) return [legacyClaim];
  const fromDoc = normalizeRoles(docData && docData.roles);
  if (fromDoc.length > 0) return fromDoc;
  const legacyDoc = legacyRoleOf(docData && docData.role);
  if (legacyDoc) return [legacyDoc];
  return ["athlete"];
}

async function passA() {
  let processed = 0;
  let claimsUpdated = 0;
  let docsUpdated = 0;
  let docsCreated = 0;
  let pageToken;

  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      if (LIMIT > 0 && processed >= LIMIT) return {processed, claimsUpdated, docsUpdated, docsCreated};
      processed += 1;

      const claims = u.customClaims || {};
      const docRef = db.doc(`users/${u.uid}`);
      const docSnap = await docRef.get();
      const docData = docSnap.exists ? docSnap.data() || {} : null;
      const roles = effectiveRoles(claims, docData);

      const claimsClean =
        JSON.stringify(normalizeRoles(claims.roles)) === JSON.stringify(roles) &&
        !("role" in claims);
      if (!claimsClean) {
        claimsUpdated += 1;
        console.log(`[claims] ${u.uid}: roles=${JSON.stringify(roles)} (antes: roles=${JSON.stringify(claims.roles)}, role=${JSON.stringify(claims.role)})`);
        if (APPLY) {
          const next = {...claims, roles};
          delete next.role;
          if (!roles.includes("admin")) delete next.superAdmin;
          await auth.setCustomUserClaims(u.uid, next);
        }
      }

      if (docData) {
        const docClean =
          JSON.stringify(normalizeRoles(docData.roles)) === JSON.stringify(roles) &&
          docData.role === undefined &&
          docData.hasAthleteRole === roles.includes("athlete") &&
          docData.hasOrganizerRole === roles.includes("organizer");
        if (!docClean) {
          docsUpdated += 1;
          console.log(`[doc] users/${u.uid}: roles=${JSON.stringify(roles)}, deleta role=${JSON.stringify(docData.role)}`);
          if (APPLY) {
            await docRef.set(
              {roles, role: FieldValue.delete(), ...roleFlags(roles)},
              {merge: true},
            );
          }
        }
      } else {
        docsCreated += 1;
        console.log(`[doc] users/${u.uid}: criando doc mínimo roles=${JSON.stringify(roles)}`);
        if (APPLY) {
          const payload = {roles, ...roleFlags(roles), createdAt: FieldValue.serverTimestamp()};
          if (u.email) payload.email = u.email.trim().toLowerCase();
          if (u.displayName) payload.fullName = u.displayName;
          await docRef.set(payload);
        }
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  return {processed, claimsUpdated, docsUpdated, docsCreated};
}

async function scanCollection(name, fixer) {
  let fixed = 0;
  let scanned = 0;
  let last;
  for (;;) {
    let q = db.collection(name).orderBy("__name__").limit(300);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      scanned += 1;
      if (await fixer(doc)) fixed += 1;
    }
    last = snap.docs[snap.docs.length - 1];
  }
  return {scanned, fixed};
}

async function passB() {
  return scanCollection("users", async (doc) => {
    const data = doc.data();
    const roles = normalizeRoles(data.roles);
    const hasLegacy = data.role !== undefined;
    const flags = roleFlags(roles.length > 0 ? roles : ["athlete"]);
    const flagsWrong =
      data.hasAthleteRole !== flags.hasAthleteRole ||
      data.hasOrganizerRole !== flags.hasOrganizerRole;
    if (!hasLegacy && roles.length > 0 && !flagsWrong) return false;
    const nextRoles = roles.length > 0 ? roles : effectiveRoles(null, data);
    console.log(`[users-scan] ${doc.id}: roles=${JSON.stringify(nextRoles)}, deleta role=${JSON.stringify(data.role)}`);
    if (APPLY) {
      await doc.ref.set(
        {roles: nextRoles, role: FieldValue.delete(), ...roleFlags(nextRoles)},
        {merge: true},
      );
    }
    return true;
  });
}

async function passC() {
  return scanCollection("public_profiles", async (doc) => {
    if (doc.data().role === undefined) return false;
    console.log(`[mirror] ${doc.id}: deleta role`);
    if (APPLY) {
      await doc.ref.set({role: FieldValue.delete()}, {merge: true});
    }
    return true;
  });
}

(async () => {
  console.log(`Projeto: ${projectId} | modo: ${APPLY ? "APLICAR" : "dry-run"}${LIMIT ? ` | limit=${LIMIT}` : ""}`);
  const a = await passA();
  console.log(`Passe A (Auth): processados=${a.processed} claims=${a.claimsUpdated} docsAtualizados=${a.docsUpdated} docsCriados=${a.docsCreated}`);
  const b = await passB();
  console.log(`Passe B (users/): escaneados=${b.scanned} corrigidos=${b.fixed}`);
  const c = await passC();
  console.log(`Passe C (public_profiles/): escaneados=${c.scanned} corrigidos=${c.fixed}`);
  if (!APPLY) console.log("Dry-run: nada foi gravado. Rode com --yes para aplicar.");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Nota (desvio consciente do spec, já validado no design): o Passe A também CRIA doc mínimo para conta do Auth sem doc — fecha o buraco "conta sem doc" que as rules antigas toleravam.

- [ ] **Step 2: Validar sintaxe e remover o script superado**

Run: `node --check functions/scripts/backfill-remove-legacy-role.js && git rm functions/scripts/backfill-athlete-roles.js`
Expected: sem erro de sintaxe; script antigo removido.

- [ ] **Step 3: Commit**

```bash
git add functions/scripts/backfill-remove-legacy-role.js
git commit -m "feat(scripts): backfill que remove o legado role de docs e claims"
```

(A execução real contra o dev acontece na Task 10, depois do deploy das functions.)

---

### Task 4: Flutter core — `user_roles.dart`, `search_keywords.dart`, `app_user_profile.dart`

**Files:**
- Modify: `nexago_app/lib/core/auth/user_roles.dart`
- Modify: `nexago_app/lib/core/search/search_keywords.dart:100-108`
- Modify: `nexago_app/lib/core/profiles/app_user_profile.dart` (campo `role` sai do modelo)
- Test: `nexago_app/test/core/auth/user_roles_test.dart`, `nexago_app/test/core/search/search_keywords_test.dart`, `nexago_app/test/features/tournaments/app_user_profile_test.dart`

**Interfaces:**
- Consumes: nada (camada base do app).
- Produces: `appRolesFromIdToken(IdTokenResult)` → `List<String>` sem fallback; `userDocHasRole({required String requiredRole, List<String> roles})` e `userDocHasAthleteRole({List<String> roles})` SEM o parâmetro `legacyRole`; `AppUserProfile` sem o campo `role`. Task 5 compila contra essas assinaturas.

- [ ] **Step 1: Atualizar os testes**

Em `user_roles_test.dart`: remover todo uso de `legacyRole:` (o parâmetro deixa de existir). O teste "falls back to legacy role when roles is empty" vira o contrato inverso:

```dart
test('roles vazio nao vira atleta implicitamente no doc', () {
  expect(userDocHasAthleteRole(roles: []), isFalse);
});
test('doc com roles decide sozinho, sem legado', () {
  expect(userDocHasAthleteRole(roles: ['athlete']), isTrue);
  expect(userDocHasAthleteRole(roles: ['arena']), isFalse);
});
```

(O arquivo testa só as funções puras de doc — `appRolesFromIdToken` recebe `IdTokenResult` e não tem fake ali; a remoção do fallback nele é garantida pelo analyzer + QA da Task 10, item 3.)

Em `search_keywords_test.dart`: casos com doc só `{'role': 'athlete'}` → `hasAthleteRole` esperado `false`. Em `app_user_profile_test.dart`: remover referências ao campo `role`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nexago_app && flutter test test/core/auth/user_roles_test.dart test/core/search/search_keywords_test.dart test/features/tournaments/app_user_profile_test.dart`
Expected: FAIL (compilação: parâmetro `legacyRole` ainda existe / lógica legada).

- [ ] **Step 3: Implementar**

`user_roles.dart` — substituir `appRolesFromIdToken`, `userDocHasRole`, `userDocHasAthleteRole` e o doc-comment do topo:

```dart
/// Valores em `customClaims['roles']` (array) — alinhado a `functions/src/auth-roles.ts`.

/// Extrai papéis do token (claim `roles`).
List<String> appRolesFromIdToken(IdTokenResult result) {
  final roles = result.claims?['roles'];
  if (roles is List) {
    return roles.whereType<String>().toList();
  }
  return [];
}

/// Papéis do documento Firestore (`roles[]`).
bool userDocHasRole({
  required String requiredRole,
  List<String> roles = const [],
}) {
  final role = requiredRole.trim().toLowerCase();
  return roles.map((r) => r.trim().toLowerCase()).contains(role);
}

bool userDocHasAthleteRole({List<String> roles = const []}) {
  return userDocHasRole(requiredRole: kAthleteAppRole, roles: roles);
}
```

`search_keywords.dart` — substituir `_userDocHasRole` (linhas 100–108):

```dart
bool _userDocHasRole(Map<String, dynamic> data, String role) {
  final roles = data['roles'];
  return roles is List &&
      roles.any((r) => r is String && r.trim().toLowerCase() == role);
}
```

`app_user_profile.dart` — remover o campo `role` (parâmetro do construtor na linha 16, declaração na 36, mapping `role: _str(data['role'])` na 82 e qualquer `copyWith`/`toMap` que o cite — conferir com `grep -n "\brole\b" app_user_profile.dart`). A linha 120 vira:

```dart
  return userDocHasAthleteRole(roles: user.roles);
```

Depois, corrigir TODOS os call sites quebrados: `grep -rn "legacyRole" nexago_app/lib nexago_app/test` deve retornar vazio ao final.

- [ ] **Step 4: Rodar testes e analyzer**

Run: `cd nexago_app && flutter analyze lib/core && flutter test test/core test/features/tournaments/app_user_profile_test.dart`
Expected: PASS, zero erros novos de analyzer.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib nexago_app/test
git commit -m "feat(app): papéis do token/doc só via roles[]; remove campo role do modelo"
```

---

### Task 5: Flutter dados — escritores e queries sem legado

**Files:**
- Modify: `nexago_app/lib/features/athlete/data/athlete_profile_repository.dart:74-82`
- Modify: `nexago_app/lib/core/profiles/users_repository.dart` (queries ~170-306 e `createMinimalUserProfile` ~367-404)
- Modify: `nexago_app/lib/features/athlete/data/athlete_discover_repository.dart:208-209`
- Test: `nexago_app/test/features/athlete/athlete_profile_repository_test.dart`

**Interfaces:**
- Consumes: `userDocHasAthleteRole(roles:)` e `kAthleteAppRole` da Task 4.
- Produces: `saveProfile` não grava mais `role`; `createMinimalUserProfile({required String email, required String fullName, required String gender, required String invitedByUid, String partnerInviteStatus = 'pending'})` (parâmetro `role` REMOVIDO — sem callers hoje); queries de diretório usam só `roles array-contains` / `hasAthleteRole ==`.

- [ ] **Step 1: Atualizar os testes do repositório de perfil**

Em `athlete_profile_repository_test.dart`, trocar toda expectativa `expect(written!['role'], 'athlete');` por `expect(written!.containsKey('role'), isFalse);` (4 ocorrências) e atualizar o comentário do teste dual-role (linhas 89–91) — a lista `roles` é a única fonte. Ajustar o comentário do cabeçalho do arquivo (linhas 1–5): o save garante `roles`/`hasAthleteRole`, não mais `role`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nexago_app && flutter test test/features/athlete/athlete_profile_repository_test.dart`
Expected: FAIL (o save ainda grava `role: 'athlete'`).

- [ ] **Step 3: Implementar**

`athlete_profile_repository.dart` — remover a linha `data['role'] = 'athlete';` (linha 78) e ajustar o comentário das linhas 74–76 para citar só `roles`/`hasAthleteRole`:

```dart
    // Garante papel de atleta em todo save (não só na criação), senão
    // contas que já existiam antes desse campo ficam de fora de queries
    // por `roles`/`hasAthleteRole` para sempre.
    final existingRoles = exists ? (snap.data()?['roles']) : null;
    data['roles'] = <String>{
      if (existingRoles is List) ...existingRoles.whereType<String>(),
      'athlete',
    }.toList();
```

`users_repository.dart` — em `searchProfiles`, apagar o helper `mergeAthleteRoleQueries` (linhas 171–177) e a variável `useMultiRoleAthleteFilter`; o bloco `if (roleFilter != null && roleFilter.isNotEmpty)` inteiro vira:

```dart
    if (roleFilter != null && roleFilter.isNotEmpty) {
      for (final prefix in nicknameSearchPrefixes(t)) {
        await mergeQuery(
          _publicProfiles
              .where('roles', arrayContains: roleFilter)
              .where('nickname', isGreaterThanOrEqualTo: prefix)
              .where('nickname', isLessThan: '$prefix\uf8ff'),
        );
      }

      await mergeQuery(
        _publicProfiles
            .where('roles', arrayContains: roleFilter)
            .where('fullName', isGreaterThanOrEqualTo: t)
            .where('fullName', isLessThan: '$t\uf8ff'),
      );

      // Busca por email fica em `users` (o espelho nao tem email - PII).
      // Apos o aperto das rules este caminho vira no-op para nao-admins e a
      // busca por email devera migrar para uma Cloud Function.
      final emailTerm = t.toLowerCase();
      await mergeQuery(
        _users
            .where('roles', arrayContains: roleFilter)
            .where('email', isGreaterThanOrEqualTo: emailTerm)
            .where('email', isLessThan: '$emailTerm\uf8ff'),
      );
      if (emailTerm != t) {
        await mergeQuery(
          _users
              .where('roles', arrayContains: roleFilter)
              .where('email', isGreaterThanOrEqualTo: t)
              .where('email', isLessThan: '$t\uf8ff'),
        );
      }
    }
```

Em `listAthleteProfiles`, remover o fallback legado (a `_paginateProfiles` com `where('role', isEqualTo: kAthleteAppRole)`, linhas 299–305), mantendo `hasAthleteRole` e o fallback `roles array-contains`.

Em `createMinimalUserProfile`, remover o parâmetro `String role = 'athlete',` e trocar a escrita:

```dart
    await _users.doc(uid).set({
      'email': normalizedEmail,
      'fullName': name,
      'gender': gender.trim(),
      'roles': ['athlete'],
      'hasAthleteRole': true,
      'createdAt': FieldValue.serverTimestamp(),
      'partnerInviteStatus': partnerInviteStatus,
      'invitedByUid': invitedByUid,
      'invitedAt': FieldValue.serverTimestamp(),
    });
```

`athlete_discover_repository.dart` — linha 209:

```dart
    Query<Map<String, dynamic>> query =
        _users.where('hasAthleteRole', isEqualTo: true);
```

(`_users` deste repositório aponta para `public_profiles`; a troca para `hasAthleteRole` é obrigatória porque a query combina com `arrayContains` de esporte — Firestore só permite um `array-contains` por query.)

Por fim: `grep -rn "isEqualTo: kAthleteAppRole\|'role', isEqualTo\|\"role\", isEqualTo" nexago_app/lib` deve retornar vazio.

- [ ] **Step 4: Rodar testes e analyzer**

Run: `cd nexago_app && flutter analyze lib && flutter test`
Expected: PASS; nenhuma referência restante quebrada.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib nexago_app/test
git commit -m "feat(app): escritores e queries de diretório sem o legado role"
```

---

### Task 6: Flutter — cadastro cria `users/{uid}` com `roles: ['athlete']`

**Files:**
- Modify: `nexago_app/lib/core/profiles/users_repository.dart` (novo método `ensureSignupUserDoc`)
- Modify: `nexago_app/lib/features/auth/domain/post_login_bootstrap.dart:116-150` (hook em `_loadAppData`)
- Test: Create `nexago_app/test/core/profiles/users_repository_signup_doc_test.dart`

**Interfaces:**
- Consumes: `appRolesFromIdToken`/`kAthleteAppRole` (Task 4); provider do repositório em `users_repository.dart:~431` (conferir o nome exato — `final <nome> = Provider((ref) => UsersRepository(ref.watch(firestoreProvider)))`).
- Produces: `Future<void> ensureSignupUserDoc({required String uid, String? email, String? fullName})` — cria doc mínimo se ausente; no-op se existir.

- [ ] **Step 1: Escrever o teste (novo arquivo)**

`users_repository_signup_doc_test.dart` — reusar o padrão do fake hand-rolled de `test/features/athlete/athlete_profile_repository_test.dart` (`_FakeFirestore implements FirebaseFirestore` cobrindo `collection('users').doc(id).get()/set()`; copiar as classes fake para o arquivo novo, adaptando o `set` sem merge):

```dart
test('cria doc mínimo com roles [athlete] quando não existe', () async {
  final firestore = _FakeFirestore(existingUsers: {});
  final repo = UsersRepository(firestore);

  await repo.ensureSignupUserDoc(
    uid: 'u1',
    email: 'Ana@Email.com ',
    fullName: 'Ana Souza',
  );

  final written = firestore.lastWrite('u1');
  expect(written, isNotNull);
  expect(written!['roles'], ['athlete']);
  expect(written['hasAthleteRole'], isTrue);
  expect(written.containsKey('role'), isFalse);
  expect(written['email'], 'ana@email.com');
  expect(written['fullName'], 'Ana Souza');
});

test('não sobrescreve doc existente', () async {
  final firestore = _FakeFirestore(
    existingUsers: {
      'u1': {'roles': ['organizer'], 'fullName': 'Gestor'},
    },
  );
  final repo = UsersRepository(firestore);

  await repo.ensureSignupUserDoc(uid: 'u1', email: 'x@y.com');

  expect(firestore.lastWrite('u1'), isNull);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nexago_app && flutter test test/core/profiles/users_repository_signup_doc_test.dart`
Expected: FAIL ("ensureSignupUserDoc" não definido).

- [ ] **Step 3: Implementar**

Em `users_repository.dart`, adicionar:

```dart
  /// Garante `users/{uid}` após cadastro/primeiro login de atleta: cria o
  /// doc mínimo com `roles: ['athlete']` quando não existe. Contas de outros
  /// portais (arena/coach/organizer) nascem nas Cloud Functions de signup.
  Future<void> ensureSignupUserDoc({
    required String uid,
    String? email,
    String? fullName,
  }) async {
    if (uid.trim().isEmpty) return;
    final ref = _users.doc(uid);
    final snap = await ref.get();
    if (snap.exists) return;
    final normalizedEmail = email?.trim().toLowerCase() ?? '';
    final name = fullName?.trim() ?? '';
    await ref.set({
      if (normalizedEmail.isNotEmpty) 'email': normalizedEmail,
      if (name.isNotEmpty) 'fullName': name,
      'roles': [kAthleteAppRole],
      'hasAthleteRole': true,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }
```

Em `post_login_bootstrap.dart`, dentro de `_loadAppData`, logo após `final roles = mobileRolesFromIdToken(token);` (linha 126):

```dart
  // Cadastro por email/social não cria doc — garante `users/{uid}` com
  // roles ['athlete'] no primeiro login. Contas com papel de outro portal
  // já nascem com doc via Cloud Function (e as rules barrariam o create).
  final claimRoles = appRolesFromIdToken(token);
  final isAthleteOnly = claimRoles.isEmpty ||
      (claimRoles.length == 1 && claimRoles.first == kAthleteAppRole);
  if (isAthleteOnly) {
    try {
      await ref.read(usersRepositoryProvider).ensureSignupUserDoc(
            uid: user.uid,
            email: user.email,
            fullName: user.displayName,
          );
    } catch (_) {
      // Rede/permissão falhou — o save de perfil recria o doc depois.
    }
  }
```

(Confirmar o nome real do provider na linha ~431 de `users_repository.dart` e importar; se o nome for outro, usar o real.)

- [ ] **Step 4: Rodar testes**

Run: `cd nexago_app && flutter analyze lib && flutter test test/core/profiles/users_repository_signup_doc_test.dart && flutter test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib nexago_app/test
git commit -m "feat(app): cadastro garante users/{uid} com roles ['athlete']"
```

---

### Task 7: Índices do Firestore

**Files:**
- Modify: `firestore.indexes.json`

**Interfaces:**
- Consumes: formas de query definidas na Task 5 (`hasAthleteRole ==` + gender/lookingForPartner/sport em `public_profiles`; `roles array-contains` + nickname/fullName/email).
- Produces: índices que a Task 10 deploya ANTES do app.

- [ ] **Step 1: Remover os compostos com `role`**

Apagar TODAS as entradas cujo primeiro campo é `role` (9 em `users`: +email, +fullName, +nickname, +gender, +lookingForPartner, +discoverSportIds, +gender+discoverSportIds, +sportOnboarding.primarySportId, +sportOnboarding.secondarySportIds; e 8 equivalentes em `public_profiles`).

- [ ] **Step 2: Adicionar os substitutos com `hasAthleteRole` (public_profiles)**

Os compostos `roles CONTAINS + email/fullName/nickname` já existem (users e public_profiles) — não duplicar. Adicionar em `indexes`:

```json
{"collectionGroup": "public_profiles", "queryScope": "COLLECTION", "fields": [
  {"fieldPath": "hasAthleteRole", "order": "ASCENDING"},
  {"fieldPath": "gender", "order": "ASCENDING"},
  {"fieldPath": "__name__", "order": "ASCENDING"}
]},
{"collectionGroup": "public_profiles", "queryScope": "COLLECTION", "fields": [
  {"fieldPath": "hasAthleteRole", "order": "ASCENDING"},
  {"fieldPath": "lookingForPartner", "order": "ASCENDING"},
  {"fieldPath": "__name__", "order": "ASCENDING"}
]},
{"collectionGroup": "public_profiles", "queryScope": "COLLECTION", "fields": [
  {"fieldPath": "hasAthleteRole", "order": "ASCENDING"},
  {"fieldPath": "discoverSportIds", "arrayConfig": "CONTAINS"}
]},
{"collectionGroup": "public_profiles", "queryScope": "COLLECTION", "fields": [
  {"fieldPath": "hasAthleteRole", "order": "ASCENDING"},
  {"fieldPath": "gender", "order": "ASCENDING"},
  {"fieldPath": "discoverSportIds", "arrayConfig": "CONTAINS"}
]},
{"collectionGroup": "public_profiles", "queryScope": "COLLECTION", "fields": [
  {"fieldPath": "hasAthleteRole", "order": "ASCENDING"},
  {"fieldPath": "sportOnboarding.primarySportId", "order": "ASCENDING"},
  {"fieldPath": "__name__", "order": "ASCENDING"}
]},
{"collectionGroup": "public_profiles", "queryScope": "COLLECTION", "fields": [
  {"fieldPath": "hasAthleteRole", "order": "ASCENDING"},
  {"fieldPath": "sportOnboarding.secondarySportIds", "arrayConfig": "CONTAINS"}
]}
```

(Espelham 1:1 as combinações que os índices `role+…` de `public_profiles` cobriam — o discover consulta `public_profiles`. Não recriar as variantes em `users`: nenhuma query nova as usa.)

- [ ] **Step 3: Validar JSON e commit**

Run: `python3 -c "import json; json.load(open('firestore.indexes.json')); print('ok')"`
Expected: `ok`

```bash
git add firestore.indexes.json
git commit -m "feat(firestore): índices hasAthleteRole substituem compostos do legado role"
```

---

### Task 8: Firestore rules — `roles[]` obrigatório, `role` bloqueado

**Files:**
- Modify: `firestore.rules` (linhas ~5-11, ~247-306, ~1101-1162)

**Interfaces:**
- Consumes: garantia do backfill (Task 3/10): todo doc tem `roles[]`, nenhum tem `role`.
- Produces: contrato de segurança que o app (Tasks 5/6) satisfaz. Deploy SÓ na Task 10, por último.

- [ ] **Step 1: Editar as funções helper**

`hasRoleClaim` (linhas 5–11):

```
    // Multi-role: claim `roles` (lista) é a única fonte de papéis
    function hasRoleClaim(r) {
      return request.auth != null &&
        request.auth.token.roles is list && r in request.auth.token.roles;
    }
```

`userDocIsPublicAthlete` (linhas 247–253): remover a linha `resource.data.role == 'athlete'` (e o `||` anterior).

`authUserHasAthleteProfile` (linhas 255–264):

```
    function authUserHasAthleteProfile() {
      return exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.roles is list &&
        'athlete' in get(/databases/$(database)/documents/users/$(request.auth.uid)).data.roles;
    }
```

- [ ] **Step 2: Pré-cadastro de parceiro exige `roles: ['athlete']`**

`isPartnerPreRegistrationCreate` (linhas 271–290): trocar `request.resource.data.role == 'athlete' &&` e o bloco opcional de `roles` por:

```
        !('role' in request.resource.data) &&
        request.resource.data.roles is list &&
        request.resource.data.roles.hasOnly(['athlete']) &&
        request.resource.data.roles.size() > 0 &&
```

(demais condições — partnerInviteStatus/invitedByUid/fullName/email/superAdmin — inalteradas).

`isPartnerPreRegistrationUpdateByInviter` (linhas 291–306): mesma troca (`request.resource.data.role == 'athlete'` e o bloco opcional de `roles` viram as 4 linhas acima).

- [ ] **Step 3: Create/update de `users/{uid}`**

Self-create (linhas 1113–1127) — o trecho de `role`/`roles` vira:

```
        (
          request.auth.uid == userId &&
          !('role' in request.resource.data) &&
          request.resource.data.roles is list &&
          request.resource.data.roles.hasOnly(['athlete']) &&
          request.resource.data.roles.size() > 0 &&
          (!('superAdmin' in request.resource.data) || request.resource.data.superAdmin == false) &&
          // Reputação (Bora Jogar) é derivada por Cloud Function — usuário
          // novo não pode nascer com reputação pré-fabricada.
          !('reputation' in request.resource.data)
        ) ||
```

Self-update (linhas 1145–1162) — substituir o bloco de congelamento do `role` (com o comentário "Contas antigas sem `role`...") por `!('role' in request.resource.data) &&`, e simplificar o bloco de `roles`:

```
          !('role' in request.resource.data) &&
          (
            !('roles' in request.resource.data) ||
            request.resource.data.roles == resource.data.roles
          ) &&
```

Atualizar o comentário da linha 1132 ("sem alterar role/superAdmin" → "sem alterar roles/superAdmin").

ATENÇÃO: não tocar em `tournaments/{t}/staff` (linha ~86 e ~1476) nem em roles de equipe de arena.

- [ ] **Step 4: Validar sintaxe (dry-run local) e commit**

Run: `firebase deploy --only firestore:rules --project volley-track-dev-4596c --dry-run 2>&1 | tail -5` (se `--dry-run` não estiver disponível na versão do CLI, usar `firebase emulators:exec --only firestore "true" 2>&1 | tail -5` apenas para compilar as rules — NÃO deployar aqui; deploy real é a última etapa da Task 10).
Expected: rules compilam sem erro.

```bash
git add firestore.rules
git commit -m "feat(rules): roles[] obrigatório em users; campo legado role bloqueado"
```

---

### Task 9: Portais web — gates athlete e arena sem legado

**Files:**
- Modify: `frontend/projects/athlete/src/app/auth/auth.service.ts:25-40,138-142`
- Modify: `frontend/projects/arena/src/app/auth/auth.service.ts:22-34`

**Interfaces:**
- Consumes: docs com `roles[]` garantidos pelo backfill.
- Produces: `docHasNonAthleteRole(data)` e `docHasArenaRole(data)` lendo só `roles[]`.
- Auditoria já feita no planejamento: `backoffice/invite.component.ts` e `coach/panel-permissoes.component.ts` usam `role` só como texto de UI/mock (não é o campo do doc de usuário) e `arena/panel-team.component.ts` usa `role` de membro de equipe — nenhum dos três entra nesta task.

- [ ] **Step 1: Portal atleta**

Substituir `docHasNonAthleteRole` (e o comentário acima dele):

```ts
/** Doc ausente ou sem `roles` conta como atleta (default do cadastro). Só
 *  bloqueia quando `roles[]` traz, de forma explícita, papel de outro portal. */
function docHasNonAthleteRole(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const roles = data['roles'];
  return Array.isArray(roles) && roles.some((r) => NON_ATHLETE_ROLES.includes(String(r)));
}
```

Atualizar o comentário das linhas ~140-141 (que cita `role`/`roles`) para citar só `roles`.

- [ ] **Step 2: Portal arena**

Substituir `docHasArenaRole`:

```ts
/** Só autoriza quando o doc TEM, de forma explícita, a role `arena` em
 *  `roles[]` — allowlist, diferente do blocklist do portal atleta. */
function docHasArenaRole(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const roles = data['roles'];
  return Array.isArray(roles) && roles.some((r) => String(r) === ARENA_ROLE);
}
```

Atualizar o comentário da linha 22 (`roles[]/role legado`) para só `roles[]`.

- [ ] **Step 3: Build dos dois projetos**

Run: `cd frontend && npx ng build athlete && npx ng build arena`
Expected: builds verdes.

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/athlete/src/app/auth/auth.service.ts frontend/projects/arena/src/app/auth/auth.service.ts
git commit -m "feat(web): gates de papel dos portais atleta/arena só leem roles[]"
```

---

### Task 10: Deploy dev na ordem, backfill, auditoria e QA

**Files:**
- Nenhum arquivo novo — execução operacional. Requer as Tasks 1–9 commitadas.

**Interfaces:**
- Consumes: tudo acima.
- Produces: dev migrado e auditado. Prod fica explicitamente FORA (decisão posterior).

- [ ] **Step 1: Deploy dos índices (primeiro — build assíncrono)**

Run: `firebase deploy --only firestore:indexes --project volley-track-dev-4596c`
Expected: sucesso; conferir no console que os índices novos saem de "Building".

- [ ] **Step 2: Deploy das functions**

Run: `cd functions && npm run build && firebase deploy --only functions --project volley-track-dev-4596c`
Expected: sucesso (o sync novo para de espelhar `role`).

- [ ] **Step 3: Backfill — dry-run, aplicar, auditar**

```bash
cd functions
node scripts/backfill-remove-legacy-role.js --project volley-track-dev-4596c          # dry-run: revisar o relatório
node scripts/backfill-remove-legacy-role.js --project volley-track-dev-4596c --yes    # aplicar
node scripts/backfill-remove-legacy-role.js --project volley-track-dev-4596c          # auditoria: TUDO deve reportar 0
```

Expected na auditoria final: `claims=0 docsAtualizados=0 docsCriados=0`, passes B e C com `corrigidos=0`.

- [ ] **Step 4: QA manual no app (dev)**

Rodar o app apontando para o dev (`cd nexago_app && flutter run`) e conferir:
1. Cadastro por email novo → doc `users/{uid}` nasce com `roles: ['athlete']`, `hasAthleteRole: true`, sem `role`.
2. Primeiro login Google com conta sem doc → idem.
3. Usuário multi-role (usar `addUserRole` via backoffice/console para dar `organizer` a um atleta de teste) → tela de seleção de papel aparece no login; troca de papel funciona.
4. Busca de atletas (discover e busca por nome/nickname) retorna resultados.
5. Save de perfil não regrava `role` (conferir doc no console).
6. Portal web atleta e portal arena logam normalmente.

- [ ] **Step 5: Deploy das rules (por último) e re-QA de escrita**

Run: `firebase deploy --only firestore:rules --project volley-track-dev-4596c`
Expected: sucesso. Repetir QA itens 1 e 5 (create/save continuam passando nas rules novas); tentar um save contendo `role` (ex. via console ou versão antiga do app) → deve ser NEGADO.

- [ ] **Step 6: Commit final de qualquer ajuste + registrar pendência de prod**

```bash
git status   # working tree limpo exceto panel-ranking.component.ts (alheio ao plano)
```

Registrar (memória do projeto/goals): prod pendente — mesma ordem (índices → functions → backfill → app nas lojas → rules), e as rules de prod SÓ depois do app novo publicado.
