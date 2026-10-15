# Comissão técnica (coach) — RBAC fase 3: saúde, evolução física, acompanhamento mental e consentimento

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** As áreas `saude`, `fisico` e `mental` ganham dados reais com rules por cargo, protegidas pelo consentimento LGPD do atleta; as telas Lesões e Plano de evolução deixam de ser mock e nasce a tela Acompanhamento (psicólogo).

**Architecture:** Dados clínicos (`injuries`, `wellbeingNotes`) só são escritos por callables (valida cargo, vínculo e consentimento, grava auditoria e atualiza o `status` do atleta) e só são lidos pelo cliente com `consentActive == true` (campo virado em lote quando o atleta concede/revoga). A autoridade do consentimento é um doc do próprio atleta (`users/{atleta}/healthConsents/{coachUid}`). `goals` (fisico) tem escrita direta por `coachCan`. O principal vê só metadados das notas mentais. Portal: serviços com listeners que seguem o cargo (padrão da fase 2), telas reais, página de consentimento e checkbox no aceite do convite do treinador.

**Tech Stack:** Firebase Functions v2 (TypeScript, `node:test`), Firestore rules (`@firebase/rules-unit-testing`), Angular (standalone, signals, OnPush), Karma/Jasmine.

**Spec:** `docs/superpowers/specs/2026-10-14-coach-comissao-fase-3-saude-design.md` (continua `2026-10-14-coach-comissao-tecnica-rbac-design.md` §2/§7/P2).

## Global Constraints

- **Branch a partir da `main`, PR direto para a `main`. Não empilhar PRs** (a fase 2 encalhou no branch-base; ver memória `pilha-mergeada-no-branch-base-nao-chega-na-main`). Fases 1 e 2 já estão na `main`.
- Português nas strings/UI e mensagens de erro; inglês no código.
- **Retrocompatível**: `acceptCoachAthleteInvite` continua aceitando `{inviteId}` sem `healthConsent` (app antigo); vínculos antigos ficam com consentimento "pendente"; nada de backfill. Treinador sem nenhum dado novo se comporta como hoje.
- Escrita clínica (`injuries`, `wellbeingNotes`, `wellbeingNoteMeta`, `healthConsents`, campo `healthConsent` do vínculo) **só por Cloud Function** (`allow write: if false` no cliente; o campo do vínculo é congelado por `diff().affectedKeys()`).
- O **principal não lê o texto** das notas mentais e **não as escreve**; só o psicólogo **autor** lê o texto. Matriz de cargos de staff **inalterada** (paridade continua valendo); a única exceção é `roleCanAccess('principal','mental','write') === false` no portal.
- Consentimento: autoridade = `users/{atleta}/healthConsents/{coachUid}.granted === true`, lido por Admin SDK nas callables. Revogar vira `consentActive=false` nos registros do atleta naquele treinador (lote de até 400 por batch).
- **Lição de effects (fase 2):** reset de estado dentro de `effect` vai em `untracked(...)`; as dependências rastreadas dos listeners são só `activeCoachUid()` e `can(área)`; consultas clínicas usam `where('consentActive','==',true)` (formato que as rules aceitam). Resetar/reassinar quando o cargo muda.
- Regras do frontend (`frontend/.claude/CLAUDE.md`): standalone sem `standalone: true`, OnPush, `input()`/`output()`, signals/`computed()`, `inject()`, `@if/@for/@switch`, sem `ngClass`/`ngStyle`, `host: {}`, formulários reativos, sem `any`.
- Todo caminho de `src/` do portal é relativo a `frontend/projects/coach/`. Build/teste em worktree: symlink `node_modules` (`frontend/` aponta para o checkout principal; `functions/` aponta para um `functions/node_modules` instalado) e rodar `ng` com caminho absoluto do worktree.
- **Nada é deployado por este plano** até a Task 11, que **para e pede autorização** (dev `volley-track-dev-4596c`: rules primeiro, depois functions, conferindo cada função; "No changes detected" pós-falha parcial mente).
- O texto do termo LGPD precisa de revisão jurídica antes de produção (registrado na Task 7 e no PR).

## Review Focus

1. **Forja de consentimento**: o dono grava `healthConsent` no link pelo cliente (create e update) → negado; o consentimento real é o doc do atleta → Task 2.
2. **Revogação esconde de verdade**: lesão/nota com `consentActive=false` não é legível por ninguém (nem pelo dono); consulta sem o filtro `consentActive` é negada → Task 2 e 3.
3. **Principal vs notas mentais**: dono não lê texto (rules), não escreve (callable exige staff `psicologo`), portal não oferece o botão → Tasks 2, 4, 6, 10.
4. **Outro psicólogo / outro autor**: psicólogo B não lê nota do psicólogo A → Task 2.
5. **Bypass por callable**: `saveInjury` por auxiliar/preparador/psicólogo; atleta não vinculado; atleta sem consentimento; `coachUid` forjado → Task 3.
6. **Consentimento**: `setHealthConsent` de atleta não vinculado ao treinador; `requestHealthConsent` por cargo sem `saude`; conceder/revogar vira `consentActive` em lote (incl. >400 registros) → Task 1.
7. **Vínculo antigo sem consentimento**: telas clínicas mostram "autorização pendente" e o botão "Pedir autorização", sem erro cru → Tasks 7 e 8.
8. **Status do atleta**: abrir lesão não sobrescreve `afastado`/`ferias`; liberar a última volta a `ativo` só se estava `lesionado` → Task 3.
9. **Listeners e cargo**: serviços clínicos param quando o cargo perde a área e reiniciam quando ganha, sem loop de effect → Tasks 8, 9, 10; QA no navegador na Task 11.
10. **Deriva do termo**: versão do termo igual em functions e portal → Task 7.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `functions/src/health-consent.ts` (+ test) | versão do termo, `isConsentGranted`, `chunkArray`, `assertHealthConsent`, `applyHealthConsent` |
| `functions/src/injury-rules.ts` (+ test) | validação de lesão, `nextAthleteStatus` |
| `functions/src/wellbeing-rules.ts` (+ test) | validação de nota, `assertWellbeingAuthor` |
| `functions/src/coach-health.ts` | callables: `setHealthConsent`, `requestHealthConsent`, `saveInjury`, `deleteInjury`, `saveWellbeingNote`, `deleteWellbeingNote` |
| `functions/src/coach-athlete-invite.ts` (modifica) | `acceptCoachAthleteInvite` aceita `healthConsent` |
| `functions/src/index.ts` (modifica) | exports |
| `firestore.rules` (modifica) | `athletes` (congela `healthConsent`), `injuries`, `goals`, `wellbeingNotes`, `wellbeingNoteMeta`, `users/{u}/healthConsents` |
| `functions/test/coach-health-rbac.rules.test.mjs` (novo) | rules cargo × coleção × consentimento |
| `functions/test/coach-roles-parity.test.mjs` (modifica, Task 7) | versão do termo igual nos dois lados |
| `functions/scripts/qa-coach-health-e2e.mjs` (novo) | QA contra o dev |
| `src/app/painel/access/coach-roles.model.ts` (modifica) | principal não escreve `mental` |
| `src/app/painel/saude/*` (novo) | termo, serviço de consentimento, serviço e modelo de lesões |
| `src/app/painel/evolucao/goals.service.ts` (novo) | metas (fisico) |
| `src/app/painel/acompanhamento/*` (novo) | serviço e telas das notas mentais |
| `src/app/convites/consentimento-saude.component.ts` (novo), `convite-atleta.component.ts` (modifica) | consentimento do atleta |
| `src/app/painel/lesoes/*`, `evolucao/*` (reescreve) | telas reais |
| `src/app/app.routes.ts`, `app.routes.spec.ts`, shell, `icon.component.ts` (modifica) | rotas, menu, ícone |

---

### Task 1: Consentimento — núcleo no backend

**Files:**
- Create: `functions/src/health-consent.ts`, `functions/src/health-consent.test.ts`, `functions/src/coach-health.ts` (só as 2 callables de consentimento nesta task)
- Modify: `functions/src/coach-athlete-invite.ts` (aceite), `functions/src/index.ts`

**Interfaces:**
- Consumes: `resolveCoachUid`, `assertCoachAreaAccess` (`./coach-area-access`), `deliverNotificationToUser` (`./notification-delivery`), `CLIENT_FACING_REGIONS`.
- Produces: `HEALTH_TERM_VERSION: string`; `isConsentGranted(data: unknown): boolean`; `chunkArray<T>(items: readonly T[], size: number): T[][]`; `assertHealthConsent(db, athleteUid, coachUid): Promise<void>` (lança `failed-precondition`); `applyHealthConsent(db, athleteUid, coachUid, granted: boolean, coachName: string): Promise<void>`; callables `setHealthConsent({coachUid, granted}) → {ok:true}` (do atleta) e `requestHealthConsent({coachUid?, athleteUid}) → {ok:true}` (cargo com `saude`/write).

- [ ] **Step 1: Teste que falha** (`health-consent.test.ts`)

```ts
import {strict as assert} from "node:assert";
import {test} from "node:test";
import {HEALTH_TERM_VERSION, chunkArray, isConsentGranted} from "./health-consent";

test("isConsentGranted so aceita granted === true", () => {
  assert.equal(isConsentGranted({granted: true}), true);
  for (const v of [{granted: false}, {granted: "true"}, {}, null, undefined, "x", 1]) {
    assert.equal(isConsentGranted(v), false, JSON.stringify(v));
  }
});

test("chunkArray divide em lotes e preserva a ordem", () => {
  assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunkArray([], 3), []);
  assert.equal(chunkArray(Array.from({length: 1000}, (_, i) => i), 400).length, 3);
});

test("chunkArray recusa tamanho invalido", () => {
  assert.throws(() => chunkArray([1], 0));
  assert.throws(() => chunkArray([1], -1));
});

test("a versao do termo tem o formato AAAA-MM", () => {
  assert.match(HEALTH_TERM_VERSION, /^\d{4}-\d{2}$/);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd functions && npm run build 2>&1 | tail -3` → "Cannot find module './health-consent'".

- [ ] **Step 3: Implementar `health-consent.ts`**

```ts
/**
 * Consentimento LGPD do atleta para dados de saúde (lesões e acompanhamento).
 * Autoridade: `users/{atleta}/healthConsents/{coachUid}` (escrito só aqui, por Admin SDK).
 * O link `coaches/{c}/athletes/{a}.healthConsent` é só um espelho para exibição (congelado nas rules).
 * Cada lesão/nota carrega `consentActive`; conceder/revogar vira o campo em lote.
 */
import {HttpsError} from "firebase-functions/v2/https";
import {FieldValue, type Firestore} from "firebase-admin/firestore";

/** Versão do texto do termo — duplicada em `frontend/.../painel/saude/health-term.ts`
 *  (o teste de paridade compara). Mudou o texto ⇒ subir a versão nos DOIS. */
export const HEALTH_TERM_VERSION = "2026-10";

const BATCH_SIZE = 400;

export function isConsentGranted(data: unknown): boolean {
  return (data as {granted?: unknown} | null | undefined)?.granted === true;
}

export function chunkArray<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) throw new Error("size inválido");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function assertHealthConsent(db: Firestore, athleteUid: string, coachUid: string): Promise<void> {
  const snap = await db.doc(`users/${athleteUid}/healthConsents/${coachUid}`).get();
  if (!isConsentGranted(snap.data())) {
    throw new HttpsError(
      "failed-precondition",
      "O atleta ainda não autorizou o registro de dados de saúde. Peça a autorização dele primeiro.",
    );
  }
}

/** Grava o consentimento (autoridade + espelho no vínculo) e vira `consentActive` nos registros do atleta. */
export async function applyHealthConsent(
  db: Firestore,
  athleteUid: string,
  coachUid: string,
  granted: boolean,
  coachName: string,
): Promise<void> {
  await db.doc(`users/${athleteUid}/healthConsents/${coachUid}`).set({
    granted,
    termVersion: HEALTH_TERM_VERSION,
    coachName,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.doc(`coaches/${coachUid}/athletes/${athleteUid}`).set(
    {healthConsent: {granted, termVersion: HEALTH_TERM_VERSION, at: FieldValue.serverTimestamp()}},
    {merge: true},
  );
  for (const col of ["injuries", "wellbeingNotes"]) {
    const snap = await db.collection(`coaches/${coachUid}/${col}`).where("athleteUid", "==", athleteUid).get();
    for (const group of chunkArray(snap.docs, BATCH_SIZE)) {
      const batch = db.batch();
      for (const d of group) batch.update(d.ref, {consentActive: granted});
      await batch.commit();
    }
  }
}
```
Atenção: o `set(..., {merge: true})` no link só roda se o vínculo existir — as callables (Step 5) checam o vínculo **antes** de chamar `applyHealthConsent`.

- [ ] **Step 4: Rodar e ver passar** — `npm run build && node --test lib/health-consent.test.js` → 4 PASS.

- [ ] **Step 5: Callables de consentimento em `coach-health.ts`**

```ts
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {assertCoachAreaAccess, assertSafeDocId, resolveCoachUid} from "./coach-area-access";
import {applyHealthConsent} from "./health-consent";
import {deliverNotificationToUser} from "./notification-delivery";

function requireUid(request: {auth?: {uid?: string} | null}): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  return uid;
}

/** O ATLETA concede ou revoga o consentimento para um treinador a que está vinculado. */
export const setHealthConsent = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const athleteUid = requireUid(request);
  const coachUid = String(request.data?.coachUid ?? "").trim();
  assertSafeDocId(coachUid, "coachUid");
  if (typeof request.data?.granted !== "boolean") {
    throw new HttpsError("invalid-argument", "granted deve ser verdadeiro ou falso.");
  }
  const db = getFirestore();
  const link = await db.doc(`coaches/${coachUid}/athletes/${athleteUid}`).get();
  if (!link.exists) {
    throw new HttpsError("not-found", "Você não está vinculado a este treinador.");
  }
  const coachSnap = await db.doc(`coaches/${coachUid}`).get();
  const coachName = String(coachSnap.data()?.displayName ?? "").trim();
  await applyHealthConsent(db, athleteUid, coachUid, request.data.granted, coachName);
  logger.info("healthConsent: atualizado", {athleteUid, coachUid, granted: request.data.granted});
  return {ok: true as const};
});

/** A COMISSÃO (cargo com `saude`/write) pede ao atleta que autorize o registro de dados de saúde. */
export const requestHealthConsent = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request);
  const coachUid = resolveCoachUid(request.data, uid);
  const athleteUid = String(request.data?.athleteUid ?? "").trim();
  assertSafeDocId(athleteUid, "athleteUid");
  const db = getFirestore();
  await assertCoachAreaAccess(db, uid, coachUid, "saude", "write");
  const link = await db.doc(`coaches/${coachUid}/athletes/${athleteUid}`).get();
  if (!link.exists) {
    throw new HttpsError("not-found", "Este atleta não está vinculado a esta comissão.");
  }
  const coachSnap = await db.doc(`coaches/${coachUid}`).get();
  const coachName = String(coachSnap.data()?.displayName ?? "").trim() || "Seu treinador";
  try {
    await deliverNotificationToUser({
      userId: athleteUid,
      title: `${coachName} pede sua autorização`,
      body: "Toque para ver e autorizar o registro de dados de saúde pela comissão técnica.",
      type: "health_consent_request",
      data: {coachUid, url: `/consentimento-saude/${coachUid}`},
    });
  } catch (error) {
    logger.warn("healthConsent: falha ao notificar", {athleteUid, coachUid, error});
  }
  return {ok: true as const};
});
```

- [ ] **Step 6: Aceite do convite com consentimento** — em `coach-athlete-invite.ts`, `acceptCoachAthleteInvite`: ler `const healthConsent = request.data?.healthConsent === true;` e, **depois** da transação que cria o vínculo (o `result.coachUid` já existe), se `healthConsent` for `true` chamar `applyHealthConsent(db, uid, result.coachUid, true, <coachName do invite>)` (o nome já está no doc do convite; leia `invite["coachName"]` dentro da transação e devolva-o em `result`). Sem o campo, comportamento idêntico ao de hoje. Importe `applyHealthConsent`.

- [ ] **Step 7: Exports** — em `index.ts`: `export {setHealthConsent, requestHealthConsent} from "./coach-health";`.

- [ ] **Step 8: Verificar** — `cd functions && npm run build && node --test lib/health-consent.test.js lib/coach-*.test.js` (build com lint limpo) e `npm test` uma vez.

- [ ] **Step 9: Commit**

```bash
git add functions/src/health-consent.ts functions/src/health-consent.test.ts functions/src/coach-health.ts functions/src/coach-athlete-invite.ts functions/src/index.ts
git commit -m "feat(coach): consentimento LGPD do atleta para dados de saúde (núcleo)"
```

---

### Task 2: Rules — dados clínicos, metas, notas mentais e congelamento do consentimento

**Files:**
- Modify: `firestore.rules` (bloco `match /coaches/{coachUid}`, vizinho do espelho `users/{userId}/coachStaff/{coachUid}`)
- Create: `functions/test/coach-health-rbac.rules.test.mjs`

**Interfaces:**
- Consumes: `coachCan`, `coachStaffExists` (rules da fase 1).
- Produces: as coleções `injuries`, `goals`, `wellbeingNotes`, `wellbeingNoteMeta`, `users/{u}/healthConsents/{coachUid}` com as regras do spec; o campo `healthConsent` do vínculo congelado para o cliente.

- [ ] **Step 1: Teste de rules que falha** (`coach-health-rbac.rules.test.mjs`) — reutilize o esqueleto de `functions/test/coach-staff-rbac.rules.test.mjs` (mesmos imports, `initializeTestEnvironment`, helper `as(uid, extra)`). Seed (com rules desligadas):

```js
const COACH = 'coach-uid', OUTRO = 'outro-coach';
const AUX = 'aux-uid', PREP = 'prep-uid', FISIO = 'fisio-uid', PSICO = 'psico-uid', PSICO2 = 'psico2-uid';
const ATLETA = 'atleta-uid';
// staff: aux, prep, fisio, psico, psico2 (cada um com {role})
// coaches/COACH {displayName}; athletes/ATLETA {athleteUid, status:'ativo'};
// injuries: i-ok {athleteUid, status:'recuperacao', consentActive:true}, i-off {..., consentActive:false}
// goals: g1 {athleteUid, title}
// wellbeingNotes: n-ok {athleteUid, authorUid: PSICO, body:'x', consentActive:true}, n-off {authorUid: PSICO, consentActive:false}
// wellbeingNoteMeta: n-ok {athleteUid, authorUid: PSICO}
// users/ATLETA/healthConsents/COACH {granted:true}
```
Testes (cada `assertSucceeds`/`assertFails` com o contexto indicado):
  1. `injuries`: leem o doc `i-ok` → dono ✓, fisio ✓; aux ✗, prep ✗, psico ✗, estranho ✗. `i-off` (consentActive false) → dono ✗, fisio ✗.
  2. Query `query(collection(db,'coaches',COACH,'injuries'), where('consentActive','==',true))`: fisio ✓ e dono ✓; **sem** o `where` → fisio ✗ (a consulta não prova o filtro); aux ✗.
  3. Escrita em `injuries` por qualquer um (dono, fisio) ✗.
  4. `goals`: leem → dono ✓, prep ✓, fisio ✓; aux ✗, psico ✗. Escrevem (set/delete) → dono ✓, prep ✓; fisio ✗, aux ✗.
  5. `wellbeingNotes`: lê `n-ok` → PSICO ✓; **dono ✗**; PSICO2 ✗; fisio ✗. `n-off` → PSICO ✗. Query do autor `where('authorUid','==',PSICO)+where('consentActive','==',true)` por PSICO ✓; por PSICO2 com `authorUid==PSICO2` ✓ (vazio); por PSICO2 pedindo `authorUid==PSICO` ✗. Escrita por PSICO e dono ✗.
  6. `wellbeingNoteMeta`: lê → dono ✓, PSICO ✓, PSICO2 ✓ (têm `mental` read); aux ✗, fisio ✗, prep ✗. Escrita ✗.
  7. `users/ATLETA/healthConsents/COACH`: lê → ATLETA ✓; COACH ✗, outro ✗. Escrita (inclusive ATLETA) ✗.
  8. Congelamento em `athletes/{ATLETA}`: dono `updateDoc(..., {status:'lesionado'})` ✓ (retrocompat do `updateAthleteLink`); dono `updateDoc(..., {healthConsent:{granted:true}})` ✗; dono `setDoc(doc 'novo-atleta', {athleteUid:'novo', healthConsent:{granted:true}})` ✗; dono `setDoc(doc 'novo-atleta', {athleteUid:'novo'})` ✓ (create sem o campo); dono `setDoc(athletes/ATLETA, {status:'ativo'}, {merge:true})` ✓ (merge não toca `healthConsent`); fisio `updateDoc(athletes/ATLETA, {status:'lesionado'})` ✗ (sem `atletas`/write).
  9. Retrocompat: dono lê/escreve `squads`, `trainings`, `evaluations` como antes (um `assertSucceeds` de cada).

- [ ] **Step 2: Rodar e ver falhar** — de `functions/`: `firebase emulators:exec --only firestore --project nexago-rules-test "node --test --test-concurrency=1 test/coach-health-rbac.rules.test.mjs"` → vários FAIL.

- [ ] **Step 3: Editar `firestore.rules`** — substituir o bloco `match /athletes/{athleteUid}` e acrescentar os novos blocos dentro de `match /coaches/{coachUid}`:

```
      match /athletes/{athleteUid} {
        allow read: if coachCan(coachUid, 'atletas', false);
        // `healthConsent` é espelho do consentimento do atleta, escrito só por Cloud Function:
        // nem o dono o toca (senão o treinador forjaria a autorização).
        allow create: if coachCan(coachUid, 'atletas', true)
          && !request.resource.data.keys().hasAny(['healthConsent']);
        allow update: if coachCan(coachUid, 'atletas', true)
          && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['healthConsent']);
        allow delete: if coachCan(coachUid, 'atletas', true);
      }

      // Lesões: só legíveis com consentimento ativo; escrita só por callable.
      match /injuries/{injuryId} {
        allow read: if coachCan(coachUid, 'saude', false)
          && resource.data.get('consentActive', false) == true;
        allow write: if false;
      }

      // Metas de evolução física: sem dado clínico, escrita direta por cargo.
      match /goals/{goalId} {
        allow read: if coachCan(coachUid, 'fisico', false);
        allow write: if coachCan(coachUid, 'fisico', true);
      }

      // Notas do psicólogo: o TEXTO só o autor lê (o dono NÃO usa coachCan aqui); escrita só por callable.
      match /wellbeingNotes/{noteId} {
        allow read: if request.auth != null
          && resource.data.get('authorUid', '') == request.auth.uid
          && resource.data.get('consentActive', false) == true;
        allow write: if false;
      }
      // Metadados (atleta, data, autor) visíveis ao dono e ao psicólogo; sem texto.
      match /wellbeingNoteMeta/{noteId} {
        allow read: if coachCan(coachUid, 'mental', false);
        allow write: if false;
      }
```
e, ao lado de `match /users/{userId}/coachStaff/{coachUid}`:

```
    // Consentimento do atleta para dados de saúde (autoridade). Escrito só por Cloud Function.
    match /users/{userId}/healthConsents/{coachUid} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false;
    }
```
Se algum `lista`/query do Step 1 falhar por causa de `resource.data.get(...)`, troque o `get` pelo acesso direto (`resource.data.consentActive == true`, e `resource.data.authorUid == request.auth.uid`), documentando no commit — a fase 2 já mostrou que `get` com default funciona em query quando a consulta fixa o campo.

- [ ] **Step 4: Rodar e ver passar**, depois a suíte inteira: `npm run test:rules` (todos verdes, incluindo `coach-staff-rbac.rules.test.mjs`).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules functions/test/coach-health-rbac.rules.test.mjs
git commit -m "feat(coach): rules de lesões, metas, notas mentais e consentimento do atleta"
```

---

### Task 3: Lesões — validação e callables

**Files:**
- Create: `functions/src/injury-rules.ts`, `functions/src/injury-rules.test.ts`
- Modify: `functions/src/coach-health.ts` (acrescenta `saveInjury`, `deleteInjury`), `functions/src/index.ts`

**Interfaces:**
- Consumes: `assertCoachAreaAccess`, `resolveCoachUid`, `assertSafeDocId`, `assertHealthConsent` (Tasks 1 e fase 1).
- Produces: `INJURY_STATUSES = ["recuperacao","restricao","liberado"] as const`, `type InjuryStatus`; `interface InjuryInput {athleteUid: string; type: string; occurredOn: string; forecastOn: string | null; doctor: string; status: InjuryStatus; notes: string}`; `parseInjuryInput(data: unknown): InjuryInput`; `isOpenInjury(status: string): boolean`; `nextAthleteStatus(current: string, openInjuries: number): string`; callables `saveInjury({coachUid?, injuryId?, ...InjuryInput}) → {injuryId: string}` e `deleteInjury({coachUid?, injuryId}) → {ok: true}`.

- [ ] **Step 1: Teste que falha** (`injury-rules.test.ts`)

```ts
import {strict as assert} from "node:assert";
import {test} from "node:test";
import {HttpsError} from "firebase-functions/v2/https";
import {isOpenInjury, nextAthleteStatus, parseInjuryInput} from "./injury-rules";

const base = {athleteUid: "a1", type: "Entorse de tornozelo", occurredOn: "2026-10-01", status: "recuperacao"};

test("parseInjuryInput normaliza e aplica defaults", () => {
  const i = parseInjuryInput({...base, doctor: "  Dra. Ana  ", notes: " obs ", forecastOn: "2026-10-20"});
  assert.deepEqual(i, {
    athleteUid: "a1", type: "Entorse de tornozelo", occurredOn: "2026-10-01",
    forecastOn: "2026-10-20", doctor: "Dra. Ana", status: "recuperacao", notes: "obs",
  });
  assert.equal(parseInjuryInput(base).forecastOn, null);
});

test("parseInjuryInput recusa entradas invalidas com invalid-argument", () => {
  const bad: unknown[] = [
    null, {}, {...base, athleteUid: ""}, {...base, athleteUid: "a/b"}, {...base, type: "  "},
    {...base, type: "x".repeat(121)}, {...base, occurredOn: "01/10/2026"}, {...base, occurredOn: "2026-13-40"},
    {...base, forecastOn: "amanha"}, {...base, status: "curado"}, {...base, notes: "x".repeat(2001)},
    {...base, doctor: "x".repeat(121)},
  ];
  for (const b of bad) {
    assert.throws(() => parseInjuryInput(b), (e: unknown) => e instanceof HttpsError && e.code === "invalid-argument", JSON.stringify(b));
  }
});

test("lesao aberta e toda que nao esta liberada", () => {
  assert.equal(isOpenInjury("recuperacao"), true);
  assert.equal(isOpenInjury("restricao"), true);
  assert.equal(isOpenInjury("liberado"), false);
});

test("nextAthleteStatus: abre lesao so sobre ativo; nao sobrescreve afastado/ferias", () => {
  assert.equal(nextAthleteStatus("ativo", 1), "lesionado");
  assert.equal(nextAthleteStatus("lesionado", 2), "lesionado");
  assert.equal(nextAthleteStatus("afastado", 1), "afastado");
  assert.equal(nextAthleteStatus("ferias", 3), "ferias");
});

test("nextAthleteStatus: ao fechar a ultima, lesionado volta a ativo; demais ficam", () => {
  assert.equal(nextAthleteStatus("lesionado", 0), "ativo");
  assert.equal(nextAthleteStatus("afastado", 0), "afastado");
  assert.equal(nextAthleteStatus("ativo", 0), "ativo");
  assert.equal(nextAthleteStatus("ferias", 0), "ferias");
});
```

- [ ] **Step 2: Rodar e ver falhar** (`npm run build` → módulo ausente).

- [ ] **Step 3: Implementar `injury-rules.ts`**

```ts
import {HttpsError} from "firebase-functions/v2/https";

export const INJURY_STATUSES = ["recuperacao", "restricao", "liberado"] as const;
export type InjuryStatus = (typeof INJURY_STATUSES)[number];

export interface InjuryInput {
  athleteUid: string;
  type: string;
  occurredOn: string;
  forecastOn: string | null;
  doctor: string;
  status: InjuryStatus;
  notes: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function bad(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function isValidIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function text(raw: unknown, max: number): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s.length > max) bad(`Texto longo demais (máximo ${max} caracteres).`);
  return s;
}

export function parseInjuryInput(data: unknown): InjuryInput {
  if (!data || typeof data !== "object") bad("Dados da lesão inválidos.");
  const d = data as Record<string, unknown>;
  const athleteUid = typeof d.athleteUid === "string" ? d.athleteUid.trim() : "";
  if (!athleteUid || athleteUid.includes("/")) bad("Atleta inválido.");
  const type = text(d.type, 120);
  if (!type) bad("Informe o tipo de lesão.");
  const occurredOn = typeof d.occurredOn === "string" ? d.occurredOn.trim() : "";
  if (!isValidIsoDate(occurredOn)) bad("Data da ocorrência inválida.");
  const forecastRaw = typeof d.forecastOn === "string" ? d.forecastOn.trim() : "";
  if (forecastRaw && !isValidIsoDate(forecastRaw)) bad("Previsão de retorno inválida.");
  const status = d.status;
  if (!(INJURY_STATUSES as readonly unknown[]).includes(status)) bad("Status inválido.");
  return {
    athleteUid,
    type,
    occurredOn,
    forecastOn: forecastRaw || null,
    doctor: text(d.doctor, 120),
    status: status as InjuryStatus,
    notes: text(d.notes, 2000),
  };
}

export function isOpenInjury(status: string): boolean {
  return status !== "liberado";
}

/** `lesionado` só sobe sobre `ativo` (não sobrescreve afastado/ferias) e só desce a `ativo` quando era `lesionado`. */
export function nextAthleteStatus(current: string, openInjuries: number): string {
  if (openInjuries > 0) return current === "ativo" ? "lesionado" : current;
  return current === "lesionado" ? "ativo" : current;
}
```

- [ ] **Step 4: Rodar e ver passar** — `npm run build && node --test lib/injury-rules.test.js` → 5 PASS.

- [ ] **Step 5: Callables em `coach-health.ts`** — **numa transação do Firestore todas as leituras vêm antes de qualquer escrita**; por isso o link do atleta e as lesões do atleta são lidos primeiro e a decisão do status é uma função síncrona:

```ts
import {FieldValue, type DocumentSnapshot, type QuerySnapshot} from "firebase-admin/firestore";
import {assertHealthConsent} from "./health-consent";
import {isOpenInjury, nextAthleteStatus, parseInjuryInput} from "./injury-rules";

/** Novo `status` do atleta a partir das lesões abertas (exceto `skipId`) + a que está sendo gravada. Síncrona: as leituras já foram feitas. */
function athleteStatusAfter(
  link: DocumentSnapshot,
  injuries: QuerySnapshot,
  skipId: string,
  extraOpen: boolean,
): string | null {
  if (!link.exists) return null;
  const open = injuries.docs.filter((d) => d.id !== skipId && isOpenInjury(String(d.data().status))).length +
    (extraOpen ? 1 : 0);
  const current = String(link.data()?.status ?? "ativo");
  const next = nextAthleteStatus(current, open);
  return next !== current ? next : null;
}

export const saveInjury = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request);
  const coachUid = resolveCoachUid(request.data, uid);
  const db = getFirestore();
  await assertCoachAreaAccess(db, uid, coachUid, "saude", "write");
  const input = parseInjuryInput(request.data);
  const injuryIdRaw = String(request.data?.injuryId ?? "").trim();
  if (injuryIdRaw) assertSafeDocId(injuryIdRaw, "injuryId");

  const linkRef = db.doc(`coaches/${coachUid}/athletes/${input.athleteUid}`);
  if (!(await linkRef.get()).exists) {
    throw new HttpsError("not-found", "Este atleta não está vinculado a esta comissão.");
  }
  await assertHealthConsent(db, input.athleteUid, coachUid);

  const col = db.collection(`coaches/${coachUid}/injuries`);
  const ref = injuryIdRaw ? col.doc(injuryIdRaw) : col.doc();
  await db.runTransaction(async (tx) => {
    // LEITURAS primeiro
    const existing = injuryIdRaw ? await tx.get(ref) : null;
    const link = await tx.get(linkRef);
    const all = await tx.get(col.where("athleteUid", "==", input.athleteUid));
    if (existing && !existing.exists) throw new HttpsError("not-found", "Lesão não encontrada.");
    if (existing && existing.data()?.athleteUid !== input.athleteUid) {
      throw new HttpsError("invalid-argument", "A lesão pertence a outro atleta.");
    }
    // ESCRITAS depois
    tx.set(ref, {
      ...input,
      consentActive: true,
      ...(existing ? {} : {createdBy: uid, createdAt: FieldValue.serverTimestamp()}),
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    const next = athleteStatusAfter(link, all, ref.id, isOpenInjury(input.status));
    if (next) tx.update(linkRef, {status: next});
  });
  logger.info("injury: salva", {coachUid, byUid: uid, injuryId: ref.id});
  return {injuryId: ref.id};
});

export const deleteInjury = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request);
  const coachUid = resolveCoachUid(request.data, uid);
  const injuryId = String(request.data?.injuryId ?? "").trim();
  assertSafeDocId(injuryId, "injuryId");
  const db = getFirestore();
  await assertCoachAreaAccess(db, uid, coachUid, "saude", "write");
  const col = db.collection(`coaches/${coachUid}/injuries`);
  const ref = col.doc(injuryId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Lesão não encontrada.");
    const athleteUid = String(snap.data()?.athleteUid ?? "");
    const linkRef = db.doc(`coaches/${coachUid}/athletes/${athleteUid}`);
    const link = await tx.get(linkRef);
    const all = await tx.get(col.where("athleteUid", "==", athleteUid));
    tx.delete(ref);
    const next = athleteStatusAfter(link, all, injuryId, false);
    if (next) tx.update(linkRef, {status: next});
  });
  logger.info("injury: excluída", {coachUid, byUid: uid, injuryId});
  return {ok: true as const};
});
```

- [ ] **Step 6: Export** — `index.ts`: acrescentar `saveInjury, deleteInjury` ao export de `./coach-health`.

- [ ] **Step 7: Verificar** — `npm run build` (lint limpo) + `node --test lib/injury-rules.test.js lib/health-consent.test.js` + `npm test`.

- [ ] **Step 8: Commit**

```bash
git add functions/src/injury-rules.ts functions/src/injury-rules.test.ts functions/src/coach-health.ts functions/src/index.ts
git commit -m "feat(coach): callables de lesão (saude) com consentimento e status do atleta"
```

---

### Task 4: Acompanhamento mental — validação e callables

**Files:**
- Create: `functions/src/wellbeing-rules.ts`, `functions/src/wellbeing-rules.test.ts`
- Modify: `functions/src/coach-health.ts` (acrescenta `saveWellbeingNote`, `deleteWellbeingNote`), `functions/src/index.ts`

**Interfaces:**
- Consumes: `assertSafeDocId`, `resolveCoachUid`, `assertHealthConsent`.
- Produces: `parseNoteInput(data: unknown): {athleteUid: string; body: string}` (body 1..4000); `assertWellbeingAuthor(db: Firestore, uid: string, coachUid: string): Promise<void>` — **só** staff com `role === "psicologo"` (o dono, mesmo com `uid === coachUid`, é negado); callables `saveWellbeingNote({coachUid, noteId?, athleteUid, body}) → {noteId}` e `deleteWellbeingNote({coachUid, noteId}) → {ok: true}`.

- [ ] **Step 1: Teste que falha**

```ts
import {strict as assert} from "node:assert";
import {test} from "node:test";
import {HttpsError} from "firebase-functions/v2/https";
import {isWellbeingAuthorRole, parseNoteInput} from "./wellbeing-rules";

test("parseNoteInput aceita e apara", () => {
  assert.deepEqual(parseNoteInput({athleteUid: " a1 ", body: "  texto  "}), {athleteUid: "a1", body: "texto"});
});

test("parseNoteInput recusa invalidos", () => {
  const bad: unknown[] = [null, {}, {athleteUid: "", body: "x"}, {athleteUid: "a/b", body: "x"}, {athleteUid: "a", body: "   "}, {athleteUid: "a", body: "x".repeat(4001)}];
  for (const b of bad) {
    assert.throws(() => parseNoteInput(b), (e: unknown) => e instanceof HttpsError && e.code === "invalid-argument");
  }
});

test("so o cargo psicologo escreve nota", () => {
  assert.equal(isWellbeingAuthorRole("psicologo"), true);
  for (const r of ["auxiliar", "preparador_fisico", "fisioterapeuta", "principal", "", undefined, null]) {
    assert.equal(isWellbeingAuthorRole(r), false, String(r));
  }
});
```

- [ ] **Step 2: Rodar e ver falhar** (módulo ausente).

- [ ] **Step 3: Implementar**

```ts
import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";

export function isWellbeingAuthorRole(role: unknown): boolean {
  return role === "psicologo";
}

export function parseNoteInput(data: unknown): {athleteUid: string; body: string} {
  if (!data || typeof data !== "object") throw new HttpsError("invalid-argument", "Dados da nota inválidos.");
  const d = data as Record<string, unknown>;
  const athleteUid = typeof d.athleteUid === "string" ? d.athleteUid.trim() : "";
  if (!athleteUid || athleteUid.includes("/")) throw new HttpsError("invalid-argument", "Atleta inválido.");
  const body = typeof d.body === "string" ? d.body.trim() : "";
  if (!body) throw new HttpsError("invalid-argument", "Escreva a nota.");
  if (body.length > 4000) throw new HttpsError("invalid-argument", "Nota longa demais (máximo 4000 caracteres).");
  return {athleteUid, body};
}

/** Só o PSICÓLOGO da comissão escreve/edita nota — o dono não, mesmo com `uid === coachUid`. */
export async function assertWellbeingAuthor(db: Firestore, uid: string, coachUid: string): Promise<void> {
  const snap = await db.doc(`coaches/${coachUid}/staff/${uid}`).get();
  if (!snap.exists || !isWellbeingAuthorRole(snap.data()?.role)) {
    throw new HttpsError("permission-denied", "Apenas o psicólogo da comissão registra notas de acompanhamento.");
  }
}
```

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Callables** (`coach-health.ts`) — nota e metadado no **mesmo** id, numa transação; só o autor edita/exclui:

```ts
import {assertWellbeingAuthor, parseNoteInput} from "./wellbeing-rules";

export const saveWellbeingNote = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request);
  const coachUid = resolveCoachUid(request.data, uid);
  const db = getFirestore();
  await assertWellbeingAuthor(db, uid, coachUid);
  const {athleteUid, body} = parseNoteInput(request.data);
  const noteIdRaw = String(request.data?.noteId ?? "").trim();
  if (noteIdRaw) assertSafeDocId(noteIdRaw, "noteId");

  const link = await db.doc(`coaches/${coachUid}/athletes/${athleteUid}`).get();
  if (!link.exists) throw new HttpsError("not-found", "Este atleta não está vinculado a esta comissão.");
  await assertHealthConsent(db, athleteUid, coachUid);

  const col = db.collection(`coaches/${coachUid}/wellbeingNotes`);
  const metaCol = db.collection(`coaches/${coachUid}/wellbeingNoteMeta`);
  const ref = noteIdRaw ? col.doc(noteIdRaw) : col.doc();
  await db.runTransaction(async (tx) => {
    const existing = noteIdRaw ? await tx.get(ref) : null;
    if (existing && !existing.exists) throw new HttpsError("not-found", "Nota não encontrada.");
    if (existing && (existing.data()?.authorUid !== uid || existing.data()?.athleteUid !== athleteUid)) {
      throw new HttpsError("permission-denied", "Só o autor edita a própria nota.");
    }
    const now = FieldValue.serverTimestamp();
    tx.set(ref, {
      athleteUid, authorUid: uid, body, consentActive: true,
      ...(existing ? {} : {createdAt: now}), updatedAt: now,
    }, {merge: true});
    tx.set(metaCol.doc(ref.id), {
      athleteUid, authorUid: uid, ...(existing ? {} : {createdAt: now}), updatedAt: now,
    }, {merge: true});
  });
  return {noteId: ref.id};
});

export const deleteWellbeingNote = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request);
  const coachUid = resolveCoachUid(request.data, uid);
  const noteId = String(request.data?.noteId ?? "").trim();
  assertSafeDocId(noteId, "noteId");
  const db = getFirestore();
  await assertWellbeingAuthor(db, uid, coachUid);
  const ref = db.doc(`coaches/${coachUid}/wellbeingNotes/${noteId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Nota não encontrada.");
    if (snap.data()?.authorUid !== uid) throw new HttpsError("permission-denied", "Só o autor exclui a própria nota.");
    tx.delete(ref);
    tx.delete(db.doc(`coaches/${coachUid}/wellbeingNoteMeta/${noteId}`));
  });
  return {ok: true as const};
});
```
Exports em `index.ts`. (`createdAt` fica fora do `set` no update para não ser sobrescrito; `merge: true` preserva o campo.)

- [ ] **Step 6: Verificar** — `npm run build && node --test lib/wellbeing-rules.test.js` + `npm test`.

- [ ] **Step 7: Commit**

```bash
git add functions/src/wellbeing-rules.ts functions/src/wellbeing-rules.test.ts functions/src/coach-health.ts functions/src/index.ts
git commit -m "feat(coach): callables de nota de acompanhamento mental (só o psicólogo autor)"
```

---

### Task 5: Script e2e de saúde, consentimento e notas mentais

**Files:**
- Create: `functions/scripts/qa-coach-health-e2e.mjs`

(O teste de paridade da versão do termo é escrito na Task 7, junto do `health-term.ts` do portal.)

- [ ] **Step 1: Escrever `qa-coach-health-e2e.mjs`** a partir do esqueleto de `functions/scripts/qa-coach-staff-rbac-e2e.mjs` (copie os helpers `signUp`, `call`, `expectError`, `fsGet`, `fsWrite`, `ok`, a trava `PID === "volley-track-dev-4596c"`, o setup por Admin e a limpeza no `finally`). Contas descartáveis: dono, aux, prep, fisio, psico, psico2, atleta (+ `estranho`). O setup monta a comissão chamando `createCoachStaffInvite`/`acceptCoachStaffInvite` com o dono e cada membro, e o vínculo do atleta por Admin (`coaches/{A}/athletes/{atleta}`). Seções (cada uma com `ok(...)`/`expectError(...)` e código de erro checado):
  1. **Sem consentimento**: `saveInjury` pelo fisio → `failed-precondition`; `saveWellbeingNote` pelo psicólogo → `failed-precondition`.
  2. **Consentimento**: `setHealthConsent({coachUid, granted:true})` pelo atleta → ok; por `estranho` (não vinculado) → `not-found`; doc `users/{atleta}/healthConsents/{A}` existe com `granted:true`; o vínculo ganhou `healthConsent`. `requestHealthConsent` pelo auxiliar → `permission-denied`; pelo fisio → ok.
  3. **Lesão**: `saveInjury` pelo fisio (status `recuperacao`) → ok; o vínculo vira `status:'lesionado'`; auxiliar/prep/psico → `permission-denied`; `coachUid` de outro treinador → `permission-denied`; atleta não vinculado → `not-found`. Edição para `liberado` → vínculo volta a `ativo`. Se o vínculo estava `afastado` antes, abrir lesão **não** muda (cenário à parte). `deleteInjury` recalcula.
  4. **Rules via REST (token de cada cargo)**: fisio e dono **leem** `injuries` com o filtro `consentActive==true` (via `:runQuery`); aux/prep/psico **não**; consulta **sem** o filtro pelo fisio → negada; ninguém escreve `injuries`.
  5. **Nota mental**: psicólogo → `saveWellbeingNote` ok; dono → `permission-denied`; psico2 → ok (nota própria) mas **não** edita a nota do psico (`permission-denied`); psicólogo lê o texto via REST (query `authorUid==psico` + `consentActive==true`); **dono não lê o texto** (403) mas lê `wellbeingNoteMeta`; psico2 não lê o texto da nota do psico.
  6. **Metas (fisico)** por REST: prep cria `goals`; fisio lê e não escreve; aux e psico negados.
  7. **Revogação**: `setHealthConsent({granted:false})` pelo atleta → em seguida fisio e dono **não leem mais** a lesão (consulta com `consentActive==true` volta vazia) e o psicólogo não lê a nota; `saveInjury` volta a `failed-precondition`; reconceder → volta a ler.
  8. **Aceite do convite com consentimento**: um convite novo do treinador ao `estranho`-atleta2 aceito com `healthConsent:true` cria o doc de consentimento; aceito **sem** o campo, não cria (retrocompat).
  9. Limpeza no `finally` (apaga `coaches/{A}` recursivamente, convites, `users/{uid}`, Auth).
- [ ] **Step 2: Conferir sintaxe sem executar** — `cd functions && node --check scripts/qa-coach-health-e2e.mjs`.
- [ ] **Step 3: Commit**

```bash
git add functions/scripts/qa-coach-health-e2e.mjs
git commit -m "test(coach): QA e2e de saúde, consentimento e notas mentais contra o dev"
```
(A execução é a Task 11, depois do deploy autorizado.)

---

### Task 6: Portal — modelo, rotas, menu e ícone

**Files:**
- Modify: `src/app/painel/access/coach-roles.model.ts`, `coach-roles.model.spec.ts`, `src/app/painel/ui/icon.component.ts`, `src/app/painel/ui/panel-shell.component.ts` (`NAV_ITEMS`), `src/app/app.routes.ts`, `src/app/app.routes.spec.ts`

**Interfaces:**
- Produces: `roleCanAccess('principal', 'mental', 'write') === false` (principal vê metadados, não escreve nota); ícone `'heart'`; item de menu `{id:'acompanhamento', label:'Acompanhamento', icon:'heart', route:'/painel/acompanhamento', area:'mental'}`; rotas `painel/acompanhamento` (mental/read), `painel/acompanhamento/nova` e `painel/acompanhamento/:id/editar` (mental/write), `consentimento-saude/:coachUid` (só `authGuard`).

- [ ] **Step 1: Spec que falha** — em `coach-roles.model.spec.ts` acrescentar:

```ts
it('o principal lê metadados de mental mas não escreve nota (só o psicólogo escreve)', () => {
  expect(roleCanAccess('principal', 'mental', 'read')).toBeTrue();
  expect(roleCanAccess('principal', 'mental', 'write')).toBeFalse();
  expect(roleCanAccess('psicologo', 'mental', 'write')).toBeTrue();
});

it('exceção do principal em mental não afeta as demais áreas', () => {
  for (const area of ['atletas', 'treinos', 'convocacoes', 'avaliacoes', 'fisico', 'saude', 'comunicacao', 'financeiro', 'equipe'] as const) {
    expect(roleCanAccess('principal', area, 'write')).withContext(area).toBeTrue();
  }
});
```
Rodar (`npx ng test coach --watch=false --browsers=ChromeHeadless --include='**/coach-roles.model.spec.ts'`) → o primeiro falha.

- [ ] **Step 2: Implementar** — em `roleCanAccess`, antes do `if (role === 'principal') return true;`:

```ts
  // O principal vê só os metadados do acompanhamento mental e nunca escreve nota (só o psicólogo).
  if (role === 'principal' && area === 'mental' && mode === 'write') {
    return false;
  }
```
Comentário no topo do arquivo: a exceção não entra no teste de paridade (só cargos de staff).
- [ ] **Step 3: Ícone** — em `icon.component.ts` acrescentar `'heart'` ao tipo `PanelIconName` e o `@case ('heart')` com `<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />`.
- [ ] **Step 4: Menu** — `NAV_ITEMS`: inserir `{ id: 'acompanhamento', label: 'Acompanhamento', icon: 'heart', route: '/painel/acompanhamento', area: 'mental' }` depois de `lesoes`.
- [ ] **Step 5: Rotas** — acrescentar (com `canActivate: [authGuard, coachGuard, areaGuard]` e `data`):

| Rota | `data` |
|---|---|
| `painel/acompanhamento` | `{ area: 'mental' }` |
| `painel/acompanhamento/nova` | `{ area: 'mental', mode: 'write' }` |
| `painel/acompanhamento/:id/editar` | `{ area: 'mental', mode: 'write' }` |

e, fora do painel (como `convite-atleta/:id`): `{ path: 'consentimento-saude/:coachUid', title: 'Autorização de saúde — NexaGO Treinador', canActivate: [authGuard], loadComponent: () => import('./convites/consentimento-saude.component').then((m) => m.ConsentimentoSaudeComponent) }`. Componentes das rotas de acompanhamento: `acompanhamento/panel-acompanhamento.component` (`PanelAcompanhamentoComponent`) e `acompanhamento/panel-nova-nota.component` (`PanelNovaNotaComponent`, usado nas duas rotas de escrita) — crie **stubs** mínimos agora (standalone, OnPush, `<co-panel-shell>` com o título) para a rota compilar; as Tasks 9–10 os preenchem. O mesmo para `convites/consentimento-saude.component.ts` (stub com o título), preenchido na Task 7.
- [ ] **Step 6: `app.routes.spec.ts`** — acrescentar ao mapa literal: `'painel/acompanhamento': ['mental','read'], 'painel/acompanhamento/nova': ['mental','write'], 'painel/acompanhamento/:id/editar': ['mental','write']`. O spec "menu e rotas concordam" já cobre o novo item.
- [ ] **Step 7: Verificar** — `npx ng test coach --watch=false --browsers=ChromeHeadless` (tudo verde) e `npx ng build coach --configuration development` (limpo; template só pelo build).
- [ ] **Step 8: Commit**

```bash
git add frontend/projects/coach/src
git commit -m "feat(coach-web): rota, menu e ícone do Acompanhamento; principal não escreve mental"
```

---

### Task 7: Portal — termo, serviço de consentimento e páginas do atleta

**Files:**
- Create: `src/app/painel/saude/health-term.ts` (+ `health-term.spec.ts`), `src/app/painel/saude/health-consent.service.ts`
- Modify (preenche): `src/app/convites/consentimento-saude.component.ts`
- Modify: `src/app/convites/convite-atleta.component.ts` (checkbox), `src/app/painel/atletas/athletes.service.ts` (campo `healthConsent` do vínculo), `src/app/painel/atletas/panel-atletas.component.ts` (chip + "Pedir autorização"), `functions/test/coach-roles-parity.test.mjs` (versão do termo)

**Interfaces:**
- Consumes: callables `setHealthConsent`, `requestHealthConsent`, `acceptCoachAthleteInvite({inviteId, healthConsent})` (Task 1); `users/{uid}/healthConsents/{coachUid}`.
- Produces: `HEALTH_TERM_VERSION`, `HEALTH_TERM_PARAGRAPHS: readonly string[]`; `type ConsentState = 'granted' | 'pending' | 'revoked'`; `consentState(link: {healthConsent: {granted: boolean} | null}): ConsentState`; `HealthConsentService` com `status(coachUid): Promise<{granted: boolean; termVersion: string; coachName: string} | null>`, `set(coachUid, granted): Promise<void>`, `request(athleteUid): Promise<void>`; `AthleteLink.healthConsent: {granted: boolean} | null`.

- [ ] **Step 1: Termo + estado (spec primeiro)** — `health-term.spec.ts`:

```ts
import { HEALTH_TERM_PARAGRAPHS, HEALTH_TERM_VERSION, consentState } from './health-term';

describe('health-term', () => {
  it('a versão tem o formato AAAA-MM e o texto não está vazio', () => {
    expect(HEALTH_TERM_VERSION).toMatch(/^\d{4}-\d{2}$/);
    expect(HEALTH_TERM_PARAGRAPHS.length).toBeGreaterThan(2);
  });
  it('consentState: sem registro é pendente; granted true/false mapeiam', () => {
    expect(consentState({ healthConsent: null })).toBe('pending');
    expect(consentState({ healthConsent: { granted: true } })).toBe('granted');
    expect(consentState({ healthConsent: { granted: false } })).toBe('revoked');
  });
});
```
Implementar `health-term.ts`:

```ts
/** Versão do termo — duplicada em functions/src/health-consent.ts (o teste de paridade compara). */
export const HEALTH_TERM_VERSION = '2026-10';

/** TEXTO PROVISÓRIO: precisa de revisão jurídica antes de produção. */
export const HEALTH_TERM_PARAGRAPHS: readonly string[] = [
  'Ao autorizar, você permite que o treinador e os membros da comissão técnica que ele indicar registrem e consultem informações sobre a sua saúde relacionadas à prática esportiva: lesões, restrições de treino e acompanhamento psicológico.',
  'Cada tipo de informação só é acessível ao cargo responsável: lesões ao fisioterapeuta e ao treinador principal; as notas de acompanhamento psicológico apenas ao psicólogo que as escreveu.',
  'Você pode revogar a autorização a qualquer momento. Ao revogar, os registros deixam de ser exibidos para a comissão e nenhum novo registro pode ser criado até você autorizar de novo.',
  'Esses dados são usados apenas para cuidar de você e organizar seus treinos, e não são compartilhados com terceiros.',
];

export type ConsentState = 'granted' | 'pending' | 'revoked';

export function consentState(link: { healthConsent: { granted: boolean } | null }): ConsentState {
  if (!link.healthConsent) return 'pending';
  return link.healthConsent.granted ? 'granted' : 'revoked';
}
```
Rodar o spec (falha→passa).
- [ ] **Step 2: Paridade da versão** — em `functions/test/coach-roles-parity.test.mjs`, ao fim:

```js
test('a versão do termo de saúde é a mesma nas functions e no portal', () => {
  const fn = fs.readFileSync(path.join(__dirname, '../src/health-consent.ts'), 'utf8').match(/HEALTH_TERM_VERSION = "([^"]+)"/)?.[1];
  const portal = fs.readFileSync(path.join(__dirname, '../../frontend/projects/coach/src/app/painel/saude/health-term.ts'), 'utf8').match(/HEALTH_TERM_VERSION = '([^']+)'/)?.[1];
  assert.ok(fn && portal, 'versão não encontrada');
  assert.equal(portal, fn);
});
```
Rodar `cd functions && npm run build && node --test test/coach-roles-parity.test.mjs` (8 testes).
- [ ] **Step 3: `HealthConsentService`**

```ts
import { Injectable } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { FUNCTIONS_REGION } from '@nexago/firebase-config';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { inject } from '@angular/core';
import { CoachContextService } from '../access/coach-context.service';

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

export interface HealthConsentStatus { granted: boolean; termVersion: string; coachName: string }

@Injectable({ providedIn: 'root' })
export class HealthConsentService {
  private readonly auth = inject(AuthService);
  private readonly ctx = inject(CoachContextService);
  private readonly firestore = createFirestore();

  /** Consentimento do usuário logado (ATLETA) para um treinador; `null` se nunca respondeu. */
  async status(coachUid: string): Promise<HealthConsentStatus | null> {
    const uid = this.auth.user()?.uid;
    if (!uid) throw new Error('Usuário não autenticado.');
    const snap = await getDoc(doc(this.firestore, 'users', uid, 'healthConsents', coachUid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return { granted: d['granted'] === true, termVersion: String(d['termVersion'] ?? ''), coachName: String(d['coachName'] ?? '') };
  }

  async set(coachUid: string, granted: boolean): Promise<void> {
    await httpsCallable(getFunctions(getApps()[0]!, FUNCTIONS_REGION), 'setHealthConsent')({ coachUid, granted });
  }

  /** A comissão pede a autorização ao atleta (notificação). */
  async request(athleteUid: string): Promise<void> {
    await httpsCallable(getFunctions(getApps()[0]!, FUNCTIONS_REGION), 'requestHealthConsent')({
      coachUid: this.ctx.activeCoachUid(), athleteUid,
    });
  }
}
```
(Organize os imports sem duplicar `inject`.)
- [ ] **Step 4: Página do atleta `/consentimento-saude/:coachUid`** (`consentimento-saude.component.ts`) — mesmo visual do `convite-atleta` (`.wrap/.card`, `createFirestore` não é necessário: usa o serviço). Estados `loading | ready | error`. Mostra: "Autorização de dados de saúde", o nome do treinador (do doc de consentimento se existir; senão o doc `coaches/{uid}` **não** é legível pelo atleta — mostre "seu treinador"), os parágrafos do termo e o estado atual ("Você autorizou em …"/"Você ainda não autorizou"/"Você revogou"). Botões: **Autorizar** (`set(coachUid, true)`) / **Revogar** (`set(coachUid, false)`) conforme o estado; sucesso mostra mensagem e permite voltar; erro (`not-found`: "Você não está vinculado a este treinador") via `co-alert`. Rota só com `authGuard`.
- [ ] **Step 5: Aceite do convite** (`convite-atleta.component.ts`): abaixo do texto "quer te adicionar", um bloco **opcional** com checkbox "Autorizo o registro de dados de saúde pela comissão técnica" e o link/expansão com `HEALTH_TERM_PARAGRAPHS`; `accept()` envia `{ inviteId, healthConsent: this.healthConsent() }`. Padrão desmarcado (consentimento é livre e específico); recusar o convite não depende dele.
- [ ] **Step 6: Vínculo e lista de atletas** — `athletes.service.ts`: `AthleteLink` ganha `healthConsent: { granted: boolean } | null` (`readAthleteLink` lê `data['healthConsent']?.granted` como boolean ou `null` se ausente). `panel-atletas.component.ts`: junto do status de cada atleta, um `co-pill` "Saúde: autorizada | pendente | revogada" (via `consentState`) e, quando `ctx.can('saude','write')` e o estado não é `granted`, o botão "Pedir autorização" → `HealthConsentService.request(athleteUid)` com feedback ("Pedido enviado"). Ocultar o pill/botão para cargos sem `saude` read.
- [ ] **Step 7: Verificar** — specs verdes, `ng build coach --configuration development`, e o teste de paridade (8).
- [ ] **Step 8: Commit**

```bash
git add frontend/projects/coach/src functions/test/coach-roles-parity.test.mjs
git commit -m "feat(coach-web): consentimento de saúde do atleta (termo, página, aceite do convite e pedido da comissão)"
```

---

### Task 8: Portal — Lesões reais

**Files:**
- Create: `src/app/painel/saude/injury-model.ts` (+ `injury-model.spec.ts`), `src/app/painel/saude/injuries.service.ts`
- Modify (reescreve): `src/app/painel/lesoes/panel-lesoes.component.ts`, `src/app/painel/lesoes/panel-registro-lesao.component.ts`

**Interfaces:**
- Consumes: callables `saveInjury`, `deleteInjury` (Task 3); `AthletesService.roster()` com `healthConsent`; `consentState`; `CoachContextService`.
- Produces: `interface Injury {id; athleteUid; type; occurredOn; forecastOn: string | null; doctor; status: InjuryStatus; notes}`; `InjuryStatus = 'recuperacao'|'restricao'|'liberado'`; `INJURY_STATUS_LABEL`, `INJURY_STATUS_TONE: Record<InjuryStatus, PillTone>`; `isOpen(i: Injury): boolean`; `splitInjuries(list: Injury[]): {open: Injury[]; released: Injury[]}` (abertas por `occurredOn` desc; liberadas idem); `InjuriesService` com `injuries: Signal<Injury[]>`, `ready: Signal<boolean>`, `save(input): Promise<string>`, `remove(id): Promise<void>`.

- [ ] **Step 1: Spec do modelo (falha)**

```ts
import { isOpen, splitInjuries, type Injury } from './injury-model';

const inj = (id: string, status: Injury['status'], occurredOn: string): Injury => ({
  id, athleteUid: 'a', type: 't', occurredOn, forecastOn: null, doctor: '', status, notes: '',
});

describe('injury-model', () => {
  it('lesão aberta é a que não está liberada', () => {
    expect(isOpen(inj('1', 'recuperacao', '2026-10-01'))).toBeTrue();
    expect(isOpen(inj('2', 'restricao', '2026-10-01'))).toBeTrue();
    expect(isOpen(inj('3', 'liberado', '2026-10-01'))).toBeFalse();
  });
  it('splitInjuries separa abertas e liberadas, mais recentes primeiro', () => {
    const r = splitInjuries([inj('a', 'liberado', '2026-09-01'), inj('b', 'recuperacao', '2026-10-01'), inj('c', 'restricao', '2026-10-10'), inj('d', 'liberado', '2026-09-20')]);
    expect(r.open.map((i) => i.id)).toEqual(['c', 'b']);
    expect(r.released.map((i) => i.id)).toEqual(['d', 'a']);
  });
});
```
Implementar `injury-model.ts` (tipos, rótulos "Recuperação"/"Restrição"/"Liberado" e tons `yellow`/`red`/`green` como o mock, `isOpen`, `splitInjuries` com ordenação por `occurredOn` decrescente).
- [ ] **Step 2: `InjuriesService`** — padrão dos serviços da fase 2 (read o `trainings.service.ts` atual):

```ts
// effect: dependências rastreadas = activeCoachUid() e can('saude') (via role); reset em untracked
effect((onCleanup) => {
  const uid = this.ctx.activeCoachUid();
  const allowed = this.ctx.can('saude');
  untracked(() => { this.state.set([]); this.ready.set(false); });
  if (!uid || !allowed) {
    untracked(() => this.ready.set(true));
    return;
  }
  const stop = onSnapshot(
    query(collection(this.firestore, 'coaches', uid, 'injuries'), where('consentActive', '==', true)),
    (snap) => { this.state.set(snap.docs.map((d) => readInjury(d.id, d.data()))); this.ready.set(true); },
    (error) => { console.warn('Injuries: listener falhou', error); this.state.set([]); this.ready.set(true); },
  );
  onCleanup(stop);
});
```
`save(input)` chama `saveInjury({ coachUid: activeCoachUid, injuryId?, ...input })` e devolve `injuryId`; `remove(id)` chama `deleteInjury`. Erros sobem (a tela usa `staffErrorMessage`-like: mensagens do servidor em português para `failed-precondition`, `permission-denied`, `not-found`, `invalid-argument`; fallback genérico — reutilize `staffErrorMessage` de `access/coach-staff.service.ts` ou extraia um helper comum se a lista de códigos precisar crescer).
- [ ] **Step 3: Tela de lista** (`panel-lesoes.component.ts`) — reescreve o mock mantendo o layout (`co-page-header`, `co-panel-card`, `co-row`, `co-pill`, `co-athlete-avatar`): subtítulo "N ativas"; cartão "Ativas" (por lesão: nome do atleta via roster, tipo, `desde dd/mm`, previsão ou "sem previsão", pill de status) e cartão "Liberadas". Ações por linha **só com `ctx.can('saude','write')`**: "Editar" (rota `lesoes/:id/editar`? — reutilize a rota de novo com query `?id=`), "Liberar" (salva com `status:'liberado'`), "Excluir" (2 passos, sem `confirm()`). Estado vazio: "Nenhuma lesão registrada." (+ link "Registrar lesão" só com write). Se existem atletas com consentimento **pendente/revogado**, uma nota: "N atletas ainda não autorizaram o registro de saúde" com link para Atletas. Sem dados mock (some "Lucas Ramos" etc.).
- [ ] **Step 4: Formulário** (`panel-registro-lesao.component.ts`) — reactive form com os campos do mock, agora reais: atleta (`<select>` nativo com `[selected]`, só atletas com `consentState === 'granted'`; se nenhum, aviso + link para Atletas "Pedir autorização"), tipo (obrigatório), data da ocorrência (`co-form-field type="date"`, obrigatório), previsão (`type="date"`), médico, status (`co-form-select` com os 3 rótulos), observações. Modo edição por `?id=` (carrega do serviço). `submit()` com guarda `if (!ctx.can('saude','write')) return;`, `busy`, erro em `co-alert`, volta a `/painel/lesoes`. Remove o "Histórico de lesões" mock; mostra o histórico real do atleta selecionado (lesões liberadas dele).
- [ ] **Step 5: Verificar** — specs (incluindo o do modelo), `ng build coach --configuration development`.
- [ ] **Step 6: Commit**

```bash
git add frontend/projects/coach/src
git commit -m "feat(coach-web): Lesões reais (lista, ficha e histórico) com consentimento"
```

---

### Task 9: Portal — Plano de evolução real (metas)

**Files:**
- Create: `src/app/painel/evolucao/goal-model.ts` (+ `goal-model.spec.ts`), `src/app/painel/evolucao/goals.service.ts`
- Modify (reescreve): `src/app/painel/evolucao/panel-plano-evolucao.component.ts`, `panel-novo-objetivo.component.ts`

**Interfaces:**
- Produces: `interface Goal {id; athleteUid; title; fundamento; deadline: string | null; notes; status: 'ativo'|'concluido'}`; `goalsForAthlete(list: Goal[], athleteUid: string): Goal[]` (ativas antes das concluídas; por prazo crescente, sem prazo por último); `GoalsService` com `goals`, `ready`, `create(input)`, `update(id, patch)`, `remove(id)` — escrita **direta** no Firestore (`coaches/{uid}/goals`), gateada por `ctx.can('fisico','write')`.

- [ ] **Step 1: Spec do modelo (falha)** — `goalsForAthlete` filtra por atleta; ordena `ativo` antes de `concluido`; dentro do grupo, por `deadline` crescente com `null` por último; não muta a entrada.
- [ ] **Step 2: Implementar** `goal-model.ts` e `GoalsService` (mesmo padrão de `trainings.service.ts`: effect com `activeCoachUid()` e `can('fisico')`, reset em `untracked`, `onSnapshot(collection(..., 'goals'))`; escritas com `setDoc/updateDoc/deleteDoc` e `serverTimestamp`; `requireUid` → "Nenhum painel de treinador ativo."). Campos gravados: `athleteUid, title, fundamento, deadline, notes, status, createdAt/updatedAt`.
- [ ] **Step 3: Telas** — `panel-plano-evolucao`: seletor de atleta (do roster; `atletas`/read); metas do atleta (título, fundamento, prazo, status) no layout do mock; botão "Novo objetivo" e ações "Concluir"/"Reabrir"/"Excluir" só com `ctx.can('fisico','write')`; vazio: "Nenhum objetivo para este atleta." `panel-novo-objetivo`: form reativo (título obrigatório, fundamento — `co-form-select` com os fundamentos do mock, prazo `type="date"`, observações) que chama `create`; guarda no `submit()`; volta a `/painel/atletas/plano-evolucao`. Remove os dados mock ("Ana Beatriz").
- [ ] **Step 4: Verificar** — specs + `ng build coach --configuration development`.
- [ ] **Step 5: Commit**

```bash
git add frontend/projects/coach/src
git commit -m "feat(coach-web): Plano de evolução real (metas por atleta, área fisico)"
```

---

### Task 10: Portal — Acompanhamento (notas mentais)

**Files:**
- Create: `src/app/painel/acompanhamento/wellbeing.service.ts`, `src/app/painel/acompanhamento/wellbeing-model.ts` (+ spec)
- Modify (preenche os stubs da Task 6): `panel-acompanhamento.component.ts`, `panel-nova-nota.component.ts`

**Interfaces:**
- Consumes: callables `saveWellbeingNote`, `deleteWellbeingNote` (Task 4); coleções `wellbeingNotes` (texto; só o autor) e `wellbeingNoteMeta` (dono e psicólogo).
- Produces: `interface NoteMeta {id; athleteUid; authorUid; createdAtMs: number | null; updatedAtMs: number | null}`; `interface Note extends NoteMeta {body: string}`; `groupMetaByAthlete(meta: NoteMeta[]): Map<string, NoteMeta[]>` (cada grupo por data desc); `WellbeingService` com `meta: Signal<NoteMeta[]>`, `myNotes: Signal<Note[]>`, `ready`, `save({noteId?, athleteUid, body})`, `remove(noteId)`.

- [ ] **Step 1: Spec de `groupMetaByAthlete` (falha→passa)** — agrupa por atleta e ordena por `createdAtMs` decrescente; `null` por último.
- [ ] **Step 2: `WellbeingService`** — dois listeners no mesmo `effect` (dependências: `activeCoachUid()` e `can('mental')`; reset em `untracked`):
  - `meta`: `onSnapshot(collection(..., 'wellbeingNoteMeta'))` — dono e psicólogo leem.
  - `myNotes`: **só se `ctx.role() === 'psicologo'`**: `onSnapshot(query(collection(..., 'wellbeingNotes'), where('authorUid', '==', uid), where('consentActive', '==', true)))` (o formato que as rules aceitam; `uid` = `auth.user().uid`). Para o principal não assina (as rules negariam).
  - `save`/`remove` chamam as callables com `coachUid` ativo; erros sobem.
- [ ] **Step 3: Tela `painel/acompanhamento`** — **psicólogo**: "Minhas notas" agrupadas por atleta (nome via roster; data; trecho de 140 caracteres), botão "Nova nota" (`ctx.can('mental','write')`), ações Editar/Excluir (2 passos); atletas **sem consentimento** não aparecem para nova nota (aviso + link para Atletas). **Principal** (`role() === 'principal'`): cartão "Acompanhamento psicológico" explicando "Por privacidade, você vê apenas que há acompanhamento — o conteúdo é visível só ao psicólogo", lista de **metadados** agrupados por atleta (nome, nº de notas, última data, autor pelo nome do membro via `CoachStaffService.watchMembers`), **sem botão de escrita**. Sem texto de nota em nenhum lugar do DOM do principal.
- [ ] **Step 4: `panel-nova-nota`** (rotas `nova` e `:id/editar`): form reativo (atleta `<select>` nativo com `[selected]`, só com consentimento; corpo `co-form-textarea`, obrigatório, máx. 4000 com contador); modo edição carrega de `myNotes()` (se a nota não for do usuário, redireciona); `submit()` com guarda `if (!ctx.can('mental','write')) return;`. A rota já é `mental/write`, então o principal nunca chega aqui.
- [ ] **Step 5: Verificar** — specs + build.
- [ ] **Step 6: Commit**

```bash
git add frontend/projects/coach/src
git commit -m "feat(coach-web): Acompanhamento — notas do psicólogo (autor) e metadados para o principal"
```

---

### Task 11: Deploy no dev, e2e e QA no navegador (PARA e pede autorização)

**Files:** nenhum arquivo de produção (correções do QA como commits à parte).

- [ ] **Step 1: Verificação local** — `ng test coach` (verde), `ng build coach` dev e produção (limpos), `cd functions && npm test` (verde, paridade 8), `npm run test:rules` (verde).
- [ ] **Step 2: PARAR e pedir autorização ao usuário** para o deploy no dev (`volley-track-dev-4596c`). Só com "sim": comparar o ruleset ao vivo com o da `main` (para não reverter nada), `firebase deploy --only firestore:rules`, depois as 6 callables novas + `acceptCoachAthleteInvite` (`functions:setHealthConsent,functions:requestHealthConsent,functions:saveInjury,functions:deleteInjury,functions:saveWellbeingNote,functions:deleteWellbeingNote,functions:acceptCoachAthleteInvite`), conferindo cada função na saída (as duas regiões). Aguardar ~1 min antes do e2e (propagação do IAM das funções novas).
- [ ] **Step 3: e2e** — `cd functions && node scripts/qa-coach-health-e2e.mjs` → `N ok, 0 falhas` (se o 401 aparecer logo após o deploy, repetir).
- [ ] **Step 4: QA no navegador** (browser pane, `ng serve coach` contra o dev, contas descartáveis, limpeza ao final via Admin como na fase 2). Roteiro:
  1. Atleta antigo (vínculo sem consentimento): fisio abre Lesões → aviso "N atletas ainda não autorizaram"; "Registrar lesão" não lista o atleta; em Atletas o chip "pendente" e "Pedir autorização".
  2. Atleta recebe o pedido (notificação não é verificável no navegador): abre `/consentimento-saude/:coachUid` → lê o termo → Autorizar → o chip vira "autorizada".
  3. Fisio registra lesão → o atleta passa a "lesionado" (anel do avatar e card do Início); liberar → volta a "ativo".
  4. Auxiliar e preparador: Lesões **não** aparece no menu; `/painel/lesoes` redireciona.
  5. Revogar no atleta → a lesão some para fisio e dono em tempo real (sem recarregar); reautorizar → volta.
  6. Preparador cria metas no Plano de evolução; fisio vê sem botões; auxiliar não vê o item.
  7. Psicólogo cria nota; o **principal** abre Acompanhamento e vê só metadados (e o DOM não contém o texto); outro psicólogo não vê a nota do primeiro.
  8. Convite novo de atleta com checkbox marcado → consentimento já concedido; sem marcar → "pendente".
  9. Dono + cargo em dois painéis: troca de painel zera listas clínicas (nada do outro treinador por um instante).
  10. Mudar o cargo do fisio para auxiliar com o portal aberto → o menu perde Lesões e a lista clínica some sem recarregar (listener segue o cargo).
- [ ] **Step 5: Corrigir o que o QA achar**, limpar contas/docs de teste e reverter qualquer `launch.json` temporário.
- [ ] **Step 6: Abrir o PR direto para a `main`** (sem empilhar), descrevendo: o que muda, o que diverge do pedido, como foi testado, **texto do termo provisório (revisão jurídica)** e que comunicação (chat) é a fase 4.

---

## O que a fase 3 NÃO faz

- `comunicacao` (chat da equipe/atleta) — fase 4 (precisa do lado do atleta e de push).
- `financeiro` — já é real e só do dono; sem cargo de staff.
- Log de leitura dos dados clínicos e exclusão de dados a pedido do atleta — dependem da revisão jurídica (LGPD) e de passar a leitura por callable.
- Verificação de e-mail do convite da comissão: reavaliar antes de produção, agora que existem dados de saúde.
- Produção: nada é tocado.

## Self-review

- **Cobertura do spec:** consentimento (T1, T7), rules (T2), lesões + status (T3, T8), mental com P2 (T4, T6, T10), fisico (T9), paridade da versão do termo (T7), e2e e QA (T5, T11), matriz de staff inalterada e exceção do principal em `mental` (T6). Comunicação e financeiro explicitamente fora.
- **Placeholders:** nenhum. As telas (T7–T10) descrevem estrutura e campos em vez de transcrever os templates inteiros, mas cada uma lista os dados, guardas e estados; serviços, modelos puros, callables e rules estão com código completo. A ordem de leituras antes de escritas nas transações (T3) está explícita.
- **Consistência de tipos/nomes:** `HEALTH_TERM_VERSION`, `isConsentGranted`, `chunkArray`, `assertHealthConsent`, `applyHealthConsent` (T1) → T3/T4; `parseInjuryInput`, `isOpenInjury`, `nextAthleteStatus` (T3); `parseNoteInput`, `assertWellbeingAuthor`, `isWellbeingAuthorRole` (T4); callables `setHealthConsent`, `requestHealthConsent`, `saveInjury`, `deleteInjury`, `saveWellbeingNote`, `deleteWellbeingNote` iguais no backend, no e2e e nos serviços do portal; `consentState`/`ConsentState` (T7) usado em T8/T10; `Injury`/`splitInjuries` (T8); `Goal`/`goalsForAthlete` (T9); `NoteMeta`/`groupMetaByAthlete` (T10).
- **Review Focus → tarefa:** 1 (T2 teste 8), 2 (T2 testes 1–2, 5; T11 passo 5), 3 (T2, T4, T6, T10), 4 (T2 teste 5), 5 (T3 + e2e seção 3), 6 (T1, e2e seções 2 e 7), 7 (T7, T8), 8 (T3 testes de `nextAthleteStatus`, e2e seção 3), 9 (T8–T10 + T11 passo 10), 10 (T7 passo 2).
