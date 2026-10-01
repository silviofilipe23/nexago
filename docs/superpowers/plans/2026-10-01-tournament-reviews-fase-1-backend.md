# Avaliação do torneio — Fase 1 (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pôr no ar, com a flag desligada, todo o backend da avaliação de torneio pelos atletas. Isso inclui:
- coleções e rules;
- job diário que abre, lembra e fecha as janelas;
- callable de envio;
- trigger de agregados e de XP;
- push com rota segura para builds antigos.

**Architecture:** As regras de negócio moram em funções puras: entrada, agregação, janela e elegibilidade, payload de push. A orquestração fica em funções "core", que recebem o `db` e são testadas com o `FakeFirestore` em memória. Os wrappers `onCall`/`onSchedule`/`onDocument*` só repassam. O cliente nunca grava nada nessas coleções. O que o cliente pode ler fica nas rules, com teste no emulador.

**Tech Stack:**
- Cloud Functions v2 (TypeScript, `firebase-functions` 7, `firebase-admin` 13).
- `node:test`.
- `@firebase/rules-unit-testing`.
- Angular (portal do organizador, só o `webUrl`).

**Spec:** `docs/superpowers/specs/2026-10-01-tournament-athlete-reviews-design.md`. Leia junto: este plano é a fase 1 da seção 7 da spec.

## Global Constraints

**Ambiente de trabalho**
- **Worktree:** todo arquivo é editado em `/Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422`.
  - Os caminhos de arquivo são sempre `<worktree> + <caminho relativo do repo>`, nunca o caminho "lógico" do repo principal.
  - Antes de cada commit, rode `pwd && git branch --show-current` e confira se a branch é `claude/tournament-athlete-rating-361422`.
  - Já aconteceu 8 vezes de editar ou commitar na árvore errada.
- **Subagentes:** não use `haiku` para implementar. O piso é `sonnet`.

**Escrita e estilo**
- **Idioma:** textos ao usuário e comentários em português; identificadores em inglês.
- **Estilo das functions:** aspas duplas, 2 espaços e o `tsconfig` do projeto (`strict`, `noUnusedLocals`, `target es2017`).
  - Não use `Object.fromEntries`, `Array.prototype.flat` nem `Promise.allSettled`.

**Firebase**
- **Sem deploy:** não faça deploy nem grave em nenhum projeto Firebase (dev ou prod) durante a implementação. O deploy é pós-merge, com aprovação do dono (Task 16).
- **Regiões:**
  - A callable usa `region: CLIENT_FACING_REGIONS` (de `./function-regions`).
  - Triggers e o job não passam região: herdam `southamerica-east1` de `global-options`.

**Valores da spec (literais)**
- Limite mínimo: **3**.
- Janela: **14 dias**.
- Lembrete: **3 dias** após abrir.
- Corte de candidatura: **3 dias**.
- Folga do `endAt`: **12 h**.
- Comentário: **1000** caracteres (`String.length`).
- XP: **10**.
- Agenda do job: `"0 10 * * *"`, fuso `America/Sao_Paulo`.

**Nomes exatos**
- Aspectos, nesta ordem: `organization`, `schedule`, `refereeing`, `venue`, `prizes`.
- Coleções:
  - `users/{uid}/tournamentReviewInvites/{tournamentId}`
  - `tournamentReviews/{tournamentId}_{uid}`
  - `tournaments/{tid}/anonymousReviews/{anonId}`
  - `tournamentReviewSummaries/{tid}`
  - `organizerReputation/{organizerId}`
- Tipos de push: `tournament_review_request`, `tournament_review_reminder`, `tournament_review_closed`.
- Flag: `appConfig/tournamentReviews { enabled }`. Doc ausente = desligado.

**Push e compatibilidade com builds antigos**
- O `url` do push é sempre uma rota que já existe no app antigo:
  - atleta: `/torneios/{id}`;
  - organizador: `/organizer/tournaments/{id}`.
- O portal do organizador usa `webUrl` (`/painel/eventos/{id}/avaliacoes`).

**Refinamentos da spec feitos neste plano** (a spec é atualizada no mesmo commit do plano)
- O resumo ganha `tournamentName`, `tournamentStartAt` e `invitesComplete`. Os dois primeiros são lidos pelas fases 3 e 5; o terceiro serve para retomar uma abertura interrompida.
- Torneio sem elegíveis ganha resumo já `closed`. Assim o organizador não recebe push de fechamento com "0 avaliações".
- A flag não precisa de seed: doc ausente = desligado. O Task 15 cria o script que liga e desliga.
- A fiação da callable e do job é testada com as funções "core" sobre o `FakeFirestore` (padrão do repo, ex.: `submitFriendlyMatchReviewCore`), não com o emulador. O emulador fica para as rules, onde ele é insubstituível.

## Review Focus

Entradas que a spec implica e que nenhum teste "natural" pegaria. Cada uma tem um teste no task dono:

1. **Torneio com mais de 400 atletas confirmados** (batch do Firestore tem teto de 500 escritas). Todo mundo tem que receber convite. Teste no Task 10.
2. **`endAt`/`completedAt` gravados como texto ou número** em torneio legado. Não pode quebrar o job nem abrir janela. Teste no Task 5.
3. **Envio no instante exato de `closesAt`, com o convite ainda `pending`** porque o job do dia não rodou. Tem que ser recusado. Teste no Task 7.
4. **Job que caiu entre gravar o resumo e criar os convites.** A execução seguinte tem que completar sem duplicar convite nem push. Teste no Task 10.
5. **Edição que tira a nota de um aspecto.** O aspecto tem que sumir do resumo; um `set` com merge deixaria o valor velho no mapa. Teste no Task 8.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `functions/src/fake-firestore.test-helper.ts` (modificar) | + filtros `<` `<=` `>` `>=` e `collectionGroup` |
| `functions/src/fake-firestore-queries.test.ts` (criar) | testes das extensões do fake |
| `functions/src/tournament-review-constants.ts` | aspectos, limites, nomes de coleção, caminhos, tipos de push |
| `functions/src/tournament-review-config.ts` | flag `appConfig/tournamentReviews` |
| `functions/src/tournament-review-input.ts` | validação da entrada da callable (pura) |
| `functions/src/tournament-review-aggregate.ts` | agregação com limite de 3 (pura) |
| `functions/src/tournament-review-window.ts` | candidatura, elegibilidade, ação da janela (puras) |
| `functions/src/tournament-review-notifications.ts` | payloads dos 3 pushes (puros) |
| `functions/src/tournament-review-submit.ts` | core + callable `submitTournamentReview` |
| `functions/src/tournament-review-derived.ts` | core + trigger `onTournamentReviewWritten` (cópia anônima, resumo, reputação) |
| `functions/src/tournament-review-gamification.ts` | core + trigger `onTournamentReviewCreatedAwardXp` |
| `functions/src/tournament-review-sweep.ts` | core + job `tournamentReviewDailySweep` |
| `functions/src/*.test.ts` correspondentes | testes `node:test` |
| `functions/src/index.ts` (modificar) | exports das 4 funções |
| `firestore.rules` (modificar) | regras novas; remove `category_feedbacks` |
| `functions/test/tournament-reviews.rules.test.mjs` (criar) | teste das rules no emulador |
| `firestore.indexes.json` (modificar) | +2 índices; remove os 3 de `category_feedbacks` |
| `frontend/projects/organizer/src/app/painel/data/notifications-repository.ts` (modificar) | `notificationTargetUrl`: `webUrl ?? url` |
| `frontend/projects/organizer/src/app/painel/data/notifications-repository.spec.ts` (criar) | teste |
| `frontend/projects/organizer/public/push-sw.js` (modificar) | clique abre `webUrl ?? url` |
| `functions/scripts/set-tournament-reviews-flag.js` (criar) | liga e desliga a flag |

**Como rodar um teste de functions:** em `<worktree>/functions`, `npm run build && node --test lib/<arquivo>.test.js`.
- O `build` compila tudo.
- Enquanto o módulo testado não existe, a falha esperada é erro de compilação (`TS2307: Cannot find module`).

---

### Task 1: `FakeFirestore` com consultas de intervalo e `collectionGroup`

O job consulta `endAt >= x && endAt <= y` e `collectionGroup("tournamentReviewInvites")`. O fake atual só faz igualdade e `array-contains`.

**Files:**
- Modify: `functions/src/fake-firestore.test-helper.ts` (método `collection`, linhas ~124-184)
- Create: `functions/src/fake-firestore-queries.test.ts`

**Interfaces:**
- Produces:
  - `FakeFirestore.collection(path).where(field, "<" | "<=" | ">" | ">=", value)`. Compara `Timestamp` por millis e número com número. Campo ausente ou de outro tipo não casa.
  - `FakeFirestore.collectionGroup(collectionId)`, com os mesmos `where`/`orderBy`/`limit`/`get`. Casa todo doc cuja coleção-pai tem esse id, em qualquer profundidade.

- [ ] **Step 1: Escrever o teste que falha**

`functions/src/fake-firestore-queries.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";

async function ids(query: {get: () => Promise<{docs: Array<{id: string}>}>}): Promise<string[]> {
  return (await query.get()).docs.map((d) => d.id).sort();
}

describe("FakeFirestore — filtros de intervalo", () => {
  it("compara Timestamp com >=, <=, < e >", async () => {
    const db = new FakeFirestore();
    db.seedDoc("tournaments/a", {endAt: Timestamp.fromMillis(1_000)});
    db.seedDoc("tournaments/b", {endAt: Timestamp.fromMillis(2_000)});
    db.seedDoc("tournaments/c", {endAt: Timestamp.fromMillis(3_000)});
    const col = db.collection("tournaments");
    assert.deepEqual(await ids(col.where("endAt", ">=", Timestamp.fromMillis(2_000))), ["b", "c"]);
    assert.deepEqual(
      await ids(col.where("endAt", ">=", Timestamp.fromMillis(1_500)).where("endAt", "<=", Timestamp.fromMillis(2_000))),
      ["b"],
    );
    assert.deepEqual(await ids(col.where("endAt", "<", Timestamp.fromMillis(2_000))), ["a"]);
    assert.deepEqual(await ids(col.where("endAt", ">", Timestamp.fromMillis(2_000))), ["c"]);
  });

  it("campo ausente ou de outro tipo nunca casa num filtro de intervalo", async () => {
    const db = new FakeFirestore();
    db.seedDoc("tournaments/ok", {endAt: Timestamp.fromMillis(5_000)});
    db.seedDoc("tournaments/sem", {name: "sem endAt"});
    db.seedDoc("tournaments/texto", {endAt: "2026-10-01"});
    assert.deepEqual(
      await ids(db.collection("tournaments").where("endAt", ">=", Timestamp.fromMillis(0))),
      ["ok"],
    );
  });
});

describe("FakeFirestore — collectionGroup", () => {
  it("acha a subcoleção em qualquer pai e respeita os filtros", async () => {
    const db = new FakeFirestore();
    db.seedDoc("users/u1/tournamentReviewInvites/t1", {tournamentId: "t1", status: "pending"});
    db.seedDoc("users/u2/tournamentReviewInvites/t1", {tournamentId: "t1", status: "submitted"});
    db.seedDoc("users/u3/tournamentReviewInvites/t2", {tournamentId: "t2", status: "pending"});
    db.seedDoc("users/u4/notifications/t1", {tournamentId: "t1", status: "pending"});
    const snap = await db
      .collectionGroup("tournamentReviewInvites")
      .where("tournamentId", "==", "t1")
      .where("status", "==", "pending")
      .get();
    assert.deepEqual(snap.docs.map((d) => d.ref.parent.parent?.id), ["u1"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build`

Expected: erro de compilação `Property 'collectionGroup' does not exist on type 'FakeFirestore'`.

- [ ] **Step 3: Implementar**

Em `functions/src/fake-firestore.test-helper.ts`:
- Atualize o comentário do topo para listar também "intervalos (`<`, `<=`, `>`, `>=`) e `collectionGroup`".
- Substitua o método `collection(path: string) { ... }` inteiro (do `collection(path: string) {` até o `}` que fecha o `return {doc, add, ...makeQuery}`) por:

```ts
  collection(path: string) {
    const self = this;
    return {
      doc: (id?: string) => self.makeRef(`${path}/${id ?? self.nextAutoId()}`),
      add: async (data: DocData) => {
        const id = self.nextAutoId();
        self.write(`${path}/${id}`, data);
        return self.makeRef(`${path}/${id}`);
      },
      ...self.makeQuery((parentPath) => parentPath === path),
    };
  }

  /** `collectionGroup` do Admin SDK: toda coleção com esse id, em qualquer profundidade. */
  collectionGroup(collectionId: string) {
    return this.makeQuery((parentPath) => parentPath.split("/").pop() === collectionId);
  }

  private makeQuery(inScope: (parentPath: string) => boolean) {
    const self = this;
    interface QuerySpec {
      filters: Array<(doc: DocData) => boolean>;
      orderField?: string;
      startAfterValue?: unknown;
      limitCount?: number;
    }
    const build = (spec: QuerySpec) => ({
      where: (field: string, op: string, value: unknown) =>
        build({
          ...spec,
          filters: [...spec.filters, (doc: DocData) => matchesWhere(doc[field], op, value)],
        }),
      orderBy: (field: string) => build({...spec, orderField: field}),
      startAfter: (value: unknown) => build({...spec, startAfterValue: value}),
      limit: (count: number) => build({...spec, limitCount: count}),
      get: async () => {
        let entries = [...self.store.entries()]
          .filter(([docPath]) => inScope(docPath.slice(0, docPath.lastIndexOf("/"))))
          .filter(([, data]) => spec.filters.every((fn) => fn(data)));
        if (spec.orderField) {
          const field = spec.orderField;
          entries = entries.sort(([, a], [, b]) => {
            const av = orderValue(a[field]);
            const bv = orderValue(b[field]);
            return av < bv ? -1 : av > bv ? 1 : 0;
          });
          if (spec.startAfterValue != null) {
            const cutoff = orderValue(spec.startAfterValue);
            entries = entries.filter(([, data]) => orderValue(data[field]) > cutoff);
          }
        }
        if (spec.limitCount != null) entries = entries.slice(0, spec.limitCount);
        return {
          docs: entries.map(([docPath]) => self.snapshotOf(docPath)),
          empty: entries.length === 0,
          size: entries.length,
        };
      },
    });
    return build({filters: []});
  }
```

Logo abaixo da função `orderValue` (no topo do arquivo), acrescente:

```ts
/** `where` do fake: igualdade, `array-contains` e intervalos. Intervalo só compara valores do
 *  mesmo tipo (Timestamp vira millis), como o Firestore — campo ausente ou de outro tipo não casa. */
function matchesWhere(actual: unknown, op: string, value: unknown): boolean {
  if (op === "array-contains") return Array.isArray(actual) && actual.includes(value);
  if (op === "<" || op === "<=" || op === ">" || op === ">=") {
    if (actual == null) return false;
    const a = orderValue(actual);
    const b = orderValue(value);
    if (typeof a !== typeof b) return false;
    if (op === "<") return a < b;
    if (op === "<=") return a <= b;
    if (op === ">") return a > b;
    return a >= b;
  }
  return actual === value;
}
```

`orderValue` não muda: devolve número para `Timestamp` e número, e string para o resto. Por isso o `typeof a !== typeof b` separa os tipos.

- [ ] **Step 4: Rodar o teste novo e a suíte inteira (o fake é usado por dezenas de testes)**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm test`

Expected: tudo `pass`, inclusive os 3 testes de `fake-firestore-queries`. Nenhum `fail`.

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add functions/src/fake-firestore.test-helper.ts functions/src/fake-firestore-queries.test.ts
git commit -m "test(functions): FakeFirestore ganha filtros de intervalo e collectionGroup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Constantes e flag

**Files:**
- Create: `functions/src/tournament-review-constants.ts`
- Create: `functions/src/tournament-review-config.ts`
- Test: `functions/src/tournament-review-config.test.ts`

**Interfaces:**
- Produces (todos os tasks seguintes importam daqui):
  - `TOURNAMENT_REVIEW_ASPECTS` (readonly tuple) e `type TournamentReviewAspect`.
  - `MIN_PUBLIC_REVIEWS = 3`, `REVIEW_WINDOW_DAYS = 14`, `REVIEW_REMINDER_AFTER_DAYS = 3`, `REVIEW_LOOKBACK_DAYS = 3`, `REVIEW_END_GRACE_HOURS = 12`, `MAX_REVIEW_COMMENT_LENGTH = 1000`, `XP_TOURNAMENT_REVIEW = 10`, `DAY_MS`, `HOUR_MS`.
  - Coleções: `TOURNAMENT_REVIEWS_COLLECTION`, `TOURNAMENT_REVIEW_SUMMARIES_COLLECTION`, `ORGANIZER_REPUTATION_COLLECTION`, `TOURNAMENT_REVIEW_INVITES_SUBCOLLECTION`, `ANONYMOUS_REVIEWS_SUBCOLLECTION`.
  - `TOURNAMENT_REVIEW_NOTIFICATION_TYPES` (`request`, `reminder`, `closed`).
  - `tournamentReviewDocId(tid, uid)`, `reviewInvitePath(uid, tid)`, `anonymousReviewPath(tid, anonId)`.
  - `parseTournamentReviewsConfig(raw): {enabled: boolean}`, `loadTournamentReviewsConfig(db)`, `TOURNAMENT_REVIEWS_CONFIG_PATH`.

- [ ] **Step 1: Escrever o teste que falha**

`functions/src/tournament-review-config.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  loadTournamentReviewsConfig,
  parseTournamentReviewsConfig,
  TOURNAMENT_REVIEWS_CONFIG_PATH,
} from "./tournament-review-config";
import {
  anonymousReviewPath,
  reviewInvitePath,
  TOURNAMENT_REVIEW_ASPECTS,
  tournamentReviewDocId,
} from "./tournament-review-constants";

describe("parseTournamentReviewsConfig", () => {
  it("desligado quando o doc falta ou o valor não é exatamente true", () => {
    for (const raw of [undefined, null, {}, {enabled: "true"}, {enabled: 1}, {enabled: false}]) {
      assert.equal(parseTournamentReviewsConfig(raw).enabled, false);
    }
  });

  it("ligado só com enabled: true", () => {
    assert.equal(parseTournamentReviewsConfig({enabled: true}).enabled, true);
  });
});

describe("loadTournamentReviewsConfig", () => {
  it("lê appConfig/tournamentReviews", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    assert.equal((await loadTournamentReviewsConfig(db)).enabled, false);
    fake.seedDoc(TOURNAMENT_REVIEWS_CONFIG_PATH, {enabled: true});
    assert.equal((await loadTournamentReviewsConfig(db)).enabled, true);
  });
});

describe("caminhos e aspectos", () => {
  it("monta os caminhos que as rules e os clientes esperam", () => {
    assert.equal(tournamentReviewDocId("t1", "u1"), "t1_u1");
    assert.equal(reviewInvitePath("u1", "t1"), "users/u1/tournamentReviewInvites/t1");
    assert.equal(anonymousReviewPath("t1", "a1"), "tournaments/t1/anonymousReviews/a1");
  });

  it("a lista de aspectos é a da spec, nesta ordem", () => {
    assert.deepEqual(
      [...TOURNAMENT_REVIEW_ASPECTS],
      ["organization", "schedule", "refereeing", "venue", "prizes"],
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build`

Expected: `TS2307: Cannot find module './tournament-review-config'`.

- [ ] **Step 3: Implementar**

`functions/src/tournament-review-constants.ts`:

```ts
/**
 * Avaliação do torneio pelos atletas — constantes e caminhos compartilhados.
 * Spec: docs/superpowers/specs/2026-10-01-tournament-athlete-reviews-design.md
 *
 * A lista de aspectos tem cópias no app e nos portais; o teste de paridade de cada
 * superfície compara com esta.
 */

export const TOURNAMENT_REVIEW_ASPECTS = [
  "organization",
  "schedule",
  "refereeing",
  "venue",
  "prizes",
] as const;

export type TournamentReviewAspect = typeof TOURNAMENT_REVIEW_ASPECTS[number];

/** Abaixo disso não há nota pública, nem comentário legível pelo organizador. */
export const MIN_PUBLIC_REVIEWS = 3;
export const REVIEW_WINDOW_DAYS = 14;
export const REVIEW_REMINDER_AFTER_DAYS = 3;
/** Só abre janela de torneio encerrado há no máximo isso: o deploy (ou ligar a flag) não pode
 *  disparar push para torneio antigo. */
export const REVIEW_LOOKBACK_DAYS = 3;
/** Sem `completed`, a janela abre `endAt` + isto. */
export const REVIEW_END_GRACE_HOURS = 12;
export const MAX_REVIEW_COMMENT_LENGTH = 1000;
export const XP_TOURNAMENT_REVIEW = 10;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const TOURNAMENT_REVIEWS_COLLECTION = "tournamentReviews";
export const TOURNAMENT_REVIEW_SUMMARIES_COLLECTION = "tournamentReviewSummaries";
export const ORGANIZER_REPUTATION_COLLECTION = "organizerReputation";
export const TOURNAMENT_REVIEW_INVITES_SUBCOLLECTION = "tournamentReviewInvites";
export const ANONYMOUS_REVIEWS_SUBCOLLECTION = "anonymousReviews";

export const TOURNAMENT_REVIEW_NOTIFICATION_TYPES = {
  request: "tournament_review_request",
  reminder: "tournament_review_reminder",
  closed: "tournament_review_closed",
} as const;

export function tournamentReviewDocId(tournamentId: string, uid: string): string {
  return `${tournamentId}_${uid}`;
}

export function reviewInvitePath(uid: string, tournamentId: string): string {
  return `users/${uid}/${TOURNAMENT_REVIEW_INVITES_SUBCOLLECTION}/${tournamentId}`;
}

export function anonymousReviewPath(tournamentId: string, anonId: string): string {
  return `tournaments/${tournamentId}/${ANONYMOUS_REVIEWS_SUBCOLLECTION}/${anonId}`;
}
```

`functions/src/tournament-review-config.ts`:

```ts
import type {Firestore} from "firebase-admin/firestore";

/**
 * Kill-switch do rollout da avaliação de torneio — doc `appConfig/tournamentReviews`.
 * Ausente ou inválido = desligado: o job sobe sem mandar push até alguém ligar
 * (`functions/scripts/set-tournament-reviews-flag.js`).
 */
export const TOURNAMENT_REVIEWS_CONFIG_PATH = "appConfig/tournamentReviews";

export type TournamentReviewsConfig = {enabled: boolean};

export function parseTournamentReviewsConfig(raw: unknown): TournamentReviewsConfig {
  const data = (raw ?? {}) as Record<string, unknown>;
  return {enabled: data.enabled === true};
}

export async function loadTournamentReviewsConfig(db: Firestore): Promise<TournamentReviewsConfig> {
  const snap = await db.doc(TOURNAMENT_REVIEWS_CONFIG_PATH).get();
  return parseTournamentReviewsConfig(snap.exists ? snap.data() : undefined);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build && node --test lib/tournament-review-config.test.js`

Expected: 5 testes `pass`.

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add functions/src/tournament-review-constants.ts functions/src/tournament-review-config.ts functions/src/tournament-review-config.test.ts
git commit -m "feat(functions): constantes e flag da avaliação de torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Validação da entrada da callable

**Files:**
- Create: `functions/src/tournament-review-input.ts`
- Test: `functions/src/tournament-review-input.test.ts`

**Interfaces:**
- Consumes: `MAX_REVIEW_COMMENT_LENGTH`, `TOURNAMENT_REVIEW_ASPECTS`, `TournamentReviewAspect` (Task 2).
- Produces:
  - `type TournamentReviewAspects = Partial<Record<TournamentReviewAspect, number>>`.
  - `interface TournamentReviewInput {tournamentId: string; overall: number; aspects: TournamentReviewAspects; comment: string | null}`.
  - `parseTournamentReviewInput(raw: unknown): TournamentReviewInput`. Lança `HttpsError("invalid-argument", ...)`.

- [ ] **Step 1: Escrever o teste que falha**

`functions/src/tournament-review-input.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import {parseTournamentReviewInput} from "./tournament-review-input";

function rejects(raw: unknown, messagePart: string): void {
  assert.throws(() => parseTournamentReviewInput(raw), (error: unknown) => {
    assert.ok(error instanceof HttpsError);
    assert.equal(error.code, "invalid-argument");
    assert.match(error.message, new RegExp(messagePart));
    return true;
  });
}

describe("parseTournamentReviewInput", () => {
  it("aceita só a nota geral e normaliza o resto", () => {
    assert.deepEqual(parseTournamentReviewInput({tournamentId: " t1 ", overall: 4}), {
      tournamentId: "t1",
      overall: 4,
      aspects: {},
      comment: null,
    });
  });

  it("aceita aspectos conhecidos e ignora os nulos", () => {
    const input = parseTournamentReviewInput({
      tournamentId: "t1",
      overall: 5,
      aspects: {schedule: 2, venue: null, prizes: 5},
    });
    assert.deepEqual(input.aspects, {schedule: 2, prizes: 5});
  });

  it("recorta o comentário e transforma vazio em null", () => {
    const base = {tournamentId: "t1", overall: 3};
    assert.equal(parseTournamentReviewInput({...base, comment: "  Atrasou muito  "}).comment, "Atrasou muito");
    assert.equal(parseTournamentReviewInput({...base, comment: " \n\t "}).comment, null);
  });

  it("aceita comentário de exatamente 1000 caracteres", () => {
    const input = parseTournamentReviewInput({tournamentId: "t1", overall: 3, comment: "a".repeat(1000)});
    assert.equal(input.comment?.length, 1000);
  });

  it("recusa torneio ausente", () => {
    rejects({overall: 4}, "Torneio");
    rejects({tournamentId: "  ", overall: 4}, "Torneio");
  });

  it("recusa nota geral que não é inteiro de 1 a 5", () => {
    for (const overall of [undefined, null, 0, 6, 3.5, "5"]) {
      rejects({tournamentId: "t1", overall}, "nota geral");
    }
  });

  it("recusa aspecto desconhecido, fora de 1 a 5, ou mapa malformado", () => {
    rejects({tournamentId: "t1", overall: 4, aspects: {food: 5}}, "Aspecto desconhecido");
    rejects({tournamentId: "t1", overall: 4, aspects: {venue: 0}}, "1 a 5");
    rejects({tournamentId: "t1", overall: 4, aspects: [5]}, "aspecto");
  });

  it("recusa comentário acima de 1000 caracteres ou que não é texto", () => {
    rejects({tournamentId: "t1", overall: 4, comment: "a".repeat(1001)}, "1000");
    rejects({tournamentId: "t1", overall: 4, comment: 42}, "Comentário");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build`

Expected: `TS2307: Cannot find module './tournament-review-input'`.

- [ ] **Step 3: Implementar**

`functions/src/tournament-review-input.ts`:

```ts
import {HttpsError} from "firebase-functions/v2/https";
import {
  MAX_REVIEW_COMMENT_LENGTH,
  TOURNAMENT_REVIEW_ASPECTS,
  type TournamentReviewAspect,
} from "./tournament-review-constants";

export type TournamentReviewAspects = Partial<Record<TournamentReviewAspect, number>>;

export interface TournamentReviewInput {
  tournamentId: string;
  overall: number;
  aspects: TournamentReviewAspects;
  comment: string | null;
}

function isStar(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

/**
 * Entrada de `submitTournamentReview`. Única validação do sistema: o cliente nunca grava nas
 * coleções da avaliação, então o que passa daqui é o que fica guardado.
 */
export function parseTournamentReviewInput(raw: unknown): TournamentReviewInput {
  const data = (raw ?? {}) as Record<string, unknown>;

  const tournamentId = typeof data.tournamentId === "string" ? data.tournamentId.trim() : "";
  if (!tournamentId) throw new HttpsError("invalid-argument", "Torneio inválido.");

  const overall = data.overall;
  if (!isStar(overall)) {
    throw new HttpsError("invalid-argument", "Dê uma nota geral de 1 a 5 estrelas.");
  }

  const aspects: TournamentReviewAspects = {};
  const rawAspects = data.aspects;
  if (rawAspects != null) {
    if (typeof rawAspects !== "object" || Array.isArray(rawAspects)) {
      throw new HttpsError("invalid-argument", "Notas por aspecto inválidas.");
    }
    for (const [key, value] of Object.entries(rawAspects as Record<string, unknown>)) {
      if (!(TOURNAMENT_REVIEW_ASPECTS as readonly string[]).includes(key)) {
        throw new HttpsError("invalid-argument", `Aspecto desconhecido: ${key}.`);
      }
      if (value == null) continue;
      if (!isStar(value)) {
        throw new HttpsError("invalid-argument", "Cada aspecto vai de 1 a 5 estrelas.");
      }
      aspects[key as TournamentReviewAspect] = value;
    }
  }

  let comment: string | null = null;
  if (data.comment != null) {
    if (typeof data.comment !== "string") {
      throw new HttpsError("invalid-argument", "Comentário inválido.");
    }
    const trimmed = data.comment.trim();
    if (trimmed.length > MAX_REVIEW_COMMENT_LENGTH) {
      throw new HttpsError(
        "invalid-argument",
        `O comentário passa de ${MAX_REVIEW_COMMENT_LENGTH} caracteres.`,
      );
    }
    comment = trimmed.length > 0 ? trimmed : null;
  }

  return {tournamentId, overall, aspects, comment};
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build && node --test lib/tournament-review-input.test.js`

Expected: 8 testes `pass`.

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add functions/src/tournament-review-input.ts functions/src/tournament-review-input.test.ts
git commit -m "feat(functions): validação da entrada da avaliação de torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Agregação com limite de 3

**Files:**
- Create: `functions/src/tournament-review-aggregate.ts`
- Test: `functions/src/tournament-review-aggregate.test.ts`

**Interfaces:**
- Consumes: `MIN_PUBLIC_REVIEWS`, `TOURNAMENT_REVIEW_ASPECTS`, `TournamentReviewAspect` (Task 2).
- Produces:
  - `type StarDistribution = {"1": number; "2": number; "3": number; "4": number; "5": number}`.
  - `interface AspectAggregate {count: number; average: number}`.
  - `interface ReviewAggregate {count: number; average: number | null; distribution: StarDistribution | null; aspects: Partial<Record<TournamentReviewAspect, AspectAggregate>> | null}`.
  - `computeReviewAggregate(reviews: ReadonlyArray<Record<string, unknown>>): ReviewAggregate`.

- [ ] **Step 1: Escrever o teste que falha**

`functions/src/tournament-review-aggregate.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {computeReviewAggregate} from "./tournament-review-aggregate";

describe("computeReviewAggregate", () => {
  it("sem avaliações: contagem zero e o resto null", () => {
    assert.deepEqual(computeReviewAggregate([]), {count: 0, average: null, distribution: null, aspects: null});
  });

  it("abaixo de 3 só a contagem sai (o doc é público)", () => {
    assert.deepEqual(computeReviewAggregate([{overall: 1}, {overall: 5}]), {
      count: 2,
      average: null,
      distribution: null,
      aspects: null,
    });
  });

  it("a partir de 3: média, distribuição e só os aspectos que tiveram nota", () => {
    const aggregate = computeReviewAggregate([
      {overall: 5, aspects: {schedule: 2, venue: 4}},
      {overall: 4, aspects: {schedule: 3}},
      {overall: 3, aspects: {}},
    ]);
    assert.deepEqual(aggregate, {
      count: 3,
      average: 4,
      distribution: {"1": 0, "2": 0, "3": 1, "4": 1, "5": 1},
      aspects: {schedule: {count: 2, average: 2.5}, venue: {count: 1, average: 4}},
    });
  });

  it("arredonda a média em duas casas", () => {
    assert.equal(computeReviewAggregate([{overall: 5}, {overall: 5}, {overall: 4}]).average, 4.67);
  });

  it("ignora doc com nota geral inválida e aspecto inválido ou desconhecido", () => {
    const aggregate = computeReviewAggregate([
      {overall: 5, aspects: {schedule: 9, food: 5, venue: 4}},
      {overall: 4},
      {overall: 4},
      {overall: 0},
      {overall: "5"},
    ]);
    assert.equal(aggregate.count, 3);
    assert.deepEqual(aggregate.aspects, {venue: {count: 1, average: 4}});
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build`

Expected: `TS2307: Cannot find module './tournament-review-aggregate'`.

- [ ] **Step 3: Implementar**

`functions/src/tournament-review-aggregate.ts`:

```ts
import {
  MIN_PUBLIC_REVIEWS,
  TOURNAMENT_REVIEW_ASPECTS,
  type TournamentReviewAspect,
} from "./tournament-review-constants";

export type StarDistribution = {"1": number; "2": number; "3": number; "4": number; "5": number};

export interface AspectAggregate {
  count: number;
  average: number;
}

export interface ReviewAggregate {
  count: number;
  average: number | null;
  distribution: StarDistribution | null;
  aspects: Partial<Record<TournamentReviewAspect, AspectAggregate>> | null;
}

function star(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5 ?
    value :
    null;
}

/** Duas casas: a tela mostra uma; o resto é ruído no doc. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Agrega docs de `tournamentReviews`. Doc com `overall` inválido fica de fora de tudo.
 * Abaixo de MIN_PUBLIC_REVIEWS só a contagem sai: média, distribuição e aspectos ficam null,
 * senão o doc público entregaria a nota de uma avaliação única.
 */
export function computeReviewAggregate(
  reviews: ReadonlyArray<Record<string, unknown>>,
): ReviewAggregate {
  const distribution: StarDistribution = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0};
  const aspectSums = new Map<TournamentReviewAspect, {sum: number; count: number}>();
  let sum = 0;
  let count = 0;

  for (const review of reviews) {
    const overall = star(review.overall);
    if (overall == null) continue;
    count += 1;
    sum += overall;
    distribution[String(overall) as keyof StarDistribution] += 1;

    const aspects = (review.aspects ?? {}) as Record<string, unknown>;
    for (const key of TOURNAMENT_REVIEW_ASPECTS) {
      const value = star(aspects[key]);
      if (value == null) continue;
      const acc = aspectSums.get(key) ?? {sum: 0, count: 0};
      acc.sum += value;
      acc.count += 1;
      aspectSums.set(key, acc);
    }
  }

  if (count < MIN_PUBLIC_REVIEWS) {
    return {count, average: null, distribution: null, aspects: null};
  }

  const aspects: Partial<Record<TournamentReviewAspect, AspectAggregate>> = {};
  for (const key of TOURNAMENT_REVIEW_ASPECTS) {
    const acc = aspectSums.get(key);
    if (acc) aspects[key] = {count: acc.count, average: round2(acc.sum / acc.count)};
  }
  return {count, average: round2(sum / count), distribution, aspects};
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build && node --test lib/tournament-review-aggregate.test.js`

Expected: 5 testes `pass`.

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add functions/src/tournament-review-aggregate.ts functions/src/tournament-review-aggregate.test.ts
git commit -m "feat(functions): agregação das avaliações de torneio com limite de 3

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Candidatura, elegibilidade e ação da janela

**Files:**
- Create: `functions/src/tournament-review-window.ts`
- Test: `functions/src/tournament-review-window.test.ts`

**Interfaces:**
- Consumes:
  - `DAY_MS`, `HOUR_MS`, `REVIEW_END_GRACE_HOURS`, `REVIEW_LOOKBACK_DAYS`, `REVIEW_REMINDER_AFTER_DAYS` (Task 2).
  - `registrationAthleteUids(registration, team)` de `./tournament-registration-pix-helpers` (já existe).
- Produces:
  - `type ReviewCandidateReason = "completed" | "ended"`.
  - `reviewCandidateReason(tournament: Record<string, unknown>, nowMs: number): ReviewCandidateReason | null`.
  - `isConfirmedInscription(inscription: Record<string, unknown>): boolean`.
  - `reviewEligibleUids(inscriptions, teamsById: ReadonlyMap<string, Record<string, unknown>>, excludeUids: Iterable<string>): string[]`. A lista sai ordenada e sem repetição.
  - `type ReviewWindowAction = "close" | "remind" | "none"`.
  - `reviewWindowAction(summary: Record<string, unknown>, nowMs: number): ReviewWindowAction`.

- [ ] **Step 1: Escrever o teste que falha**

`functions/src/tournament-review-window.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {DAY_MS, HOUR_MS} from "./tournament-review-constants";
import {
  reviewCandidateReason,
  reviewEligibleUids,
  reviewWindowAction,
} from "./tournament-review-window";

const NOW = Date.UTC(2026, 9, 5, 13, 0, 0); // 05/10/2026 10:00 em São Paulo
const ts = (ms: number) => Timestamp.fromMillis(ms);

describe("reviewCandidateReason", () => {
  it("completed nos últimos 3 dias", () => {
    assert.equal(reviewCandidateReason({listingStatus: "completed", completedAt: ts(NOW - DAY_MS)}, NOW), "completed");
  });

  it("aceita o status legado com maiúscula", () => {
    assert.equal(reviewCandidateReason({status: "Completed", completedAt: ts(NOW - HOUR_MS)}, NOW), "completed");
  });

  it("completed antigo ainda entra pelo endAt se ele estiver na faixa", () => {
    const tournament = {listingStatus: "completed", completedAt: ts(NOW - 5 * DAY_MS), endAt: ts(NOW - DAY_MS)};
    assert.equal(reviewCandidateReason(tournament, NOW), "ended");
  });

  it("endAt + 12h: entra com exatamente 12h, não com 11h", () => {
    assert.equal(reviewCandidateReason({listingStatus: "closed", endAt: ts(NOW - 12 * HOUR_MS)}, NOW), "ended");
    assert.equal(reviewCandidateReason({listingStatus: "closed", endAt: ts(NOW - 11 * HOUR_MS)}, NOW), null);
  });

  it("fora do corte de 3 dias não entra", () => {
    assert.equal(reviewCandidateReason({listingStatus: "closed", endAt: ts(NOW - 3 * DAY_MS - 1)}, NOW), null);
    assert.equal(
      reviewCandidateReason({listingStatus: "completed", completedAt: ts(NOW - 3 * DAY_MS - 1)}, NOW),
      null,
    );
  });

  it("cancelado e rascunho nunca entram", () => {
    for (const listingStatus of ["cancelled", "cancelado", "draft"]) {
      const tournament = {listingStatus, completedAt: ts(NOW - HOUR_MS), endAt: ts(NOW - DAY_MS)};
      assert.equal(reviewCandidateReason(tournament, NOW), null);
    }
  });

  it("data gravada como texto ou número (legado) não quebra e não entra", () => {
    assert.equal(reviewCandidateReason({listingStatus: "closed", endAt: "2026-10-04"}, NOW), null);
    assert.equal(reviewCandidateReason({listingStatus: "completed", completedAt: NOW - HOUR_MS}, NOW), null);
  });
});

describe("reviewEligibleUids", () => {
  const confirmed = (teamId: string, extra: Record<string, unknown> = {}) =>
    ({tournamentId: "t1", teamId, isPaid: true, ...extra});

  it("só inscrição confirmada, sem repetir atleta entre categorias", () => {
    const teams = new Map<string, Record<string, unknown>>([
      ["team-ab", {player1Id: "a", player2Id: "b"}],
      ["team-ac", {player1Id: "a", player2Id: "c"}],
      ["team-de", {player1Id: "d", player2Id: "e"}],
      ["team-fg", {player1Id: "f", player2Id: "g"}],
    ]);
    const uids = reviewEligibleUids([
      confirmed("team-ab", {categoryId: "c1"}),
      confirmed("team-ac", {categoryId: "c2"}),
      confirmed("team-de", {waitlist: true}),
      confirmed("team-fg", {isPaid: false}),
      {tournamentId: "t1", teamId: "", isPaid: true, player1Id: "h"},
      confirmed("team-x", {partnerPending: true, player1Id: "i"}),
    ], teams, []);
    assert.deepEqual(uids, ["a", "b", "c"]);
  });

  it("trio: usa os memberUids da equipe", () => {
    const teams = new Map<string, Record<string, unknown>>([["team-3", {memberUids: ["x", "y", "z"]}]]);
    assert.deepEqual(reviewEligibleUids([confirmed("team-3")], teams, []), ["x", "y", "z"]);
  });

  it("equipe sumida: cai nos atletas da própria inscrição", () => {
    const inscription = confirmed("team-gone", {player1Id: "p", participantUids: ["p", "q"]});
    assert.deepEqual(reviewEligibleUids([inscription], new Map(), []), ["p", "q"]);
  });

  it("quem gerencia o torneio não avalia, mesmo tendo jogado", () => {
    const teams = new Map<string, Record<string, unknown>>([["team-org", {player1Id: "org", player2Id: "m"}]]);
    assert.deepEqual(reviewEligibleUids([confirmed("team-org")], teams, ["org"]), ["m"]);
  });
});

describe("reviewWindowAction", () => {
  const open = (extra: Record<string, unknown>) => ({
    status: "open",
    opensAt: ts(NOW - DAY_MS),
    closesAt: ts(NOW + 13 * DAY_MS),
    reminderSentAt: null,
    ...extra,
  });

  it("resumo que não está aberto: nada", () => {
    assert.equal(reviewWindowAction(open({status: "closed"}), NOW), "none");
  });

  it("lembra no 3º dia, uma vez só", () => {
    assert.equal(reviewWindowAction(open({opensAt: ts(NOW - 3 * DAY_MS)}), NOW), "remind");
    assert.equal(reviewWindowAction(open({opensAt: ts(NOW - 2 * DAY_MS)}), NOW), "none");
    assert.equal(
      reviewWindowAction(open({opensAt: ts(NOW - 3 * DAY_MS), reminderSentAt: ts(NOW - DAY_MS)}), NOW),
      "none",
    );
  });

  it("fecha quando closesAt chega, e fechar ganha de lembrar", () => {
    assert.equal(reviewWindowAction(open({opensAt: ts(NOW - 14 * DAY_MS), closesAt: ts(NOW)}), NOW), "close");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build`

Expected: `TS2307: Cannot find module './tournament-review-window'`.

- [ ] **Step 3: Implementar**

`functions/src/tournament-review-window.ts`:

```ts
import {Timestamp} from "firebase-admin/firestore";
import {registrationAthleteUids} from "./tournament-registration-pix-helpers";
import {
  DAY_MS,
  HOUR_MS,
  REVIEW_END_GRACE_HOURS,
  REVIEW_LOOKBACK_DAYS,
  REVIEW_REMINDER_AFTER_DAYS,
} from "./tournament-review-constants";

function millis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

const NEVER_REVIEWED = new Set(["draft", "cancelled", "canceled", "cancelado"]);
const COMPLETED = new Set(["completed", "concluido", "concluído"]);

export type ReviewCandidateReason = "completed" | "ended";

/**
 * Por que o torneio entra na abertura de janela de hoje. Revalida as duas consultas do job
 * (o mesmo torneio pode vir pelas duas) e protege contra data legada fora de Timestamp.
 */
export function reviewCandidateReason(
  tournament: Record<string, unknown>,
  nowMs: number,
): ReviewCandidateReason | null {
  const status = String(tournament.listingStatus ?? tournament.status ?? "").trim().toLowerCase();
  if (NEVER_REVIEWED.has(status)) return null;
  const lookbackStart = nowMs - REVIEW_LOOKBACK_DAYS * DAY_MS;

  const completedAt = millis(tournament.completedAt);
  if (COMPLETED.has(status) && completedAt != null && completedAt >= lookbackStart && completedAt <= nowMs) {
    return "completed";
  }
  const endAt = millis(tournament.endAt);
  if (endAt != null && endAt >= lookbackStart && endAt <= nowMs - REVIEW_END_GRACE_HOURS * HOUR_MS) {
    return "ended";
  }
  return null;
}

/** "Confirmada" = entrou na chave: o mesmo filtro de `paidTeamIds` em organizer-category-ops.ts. */
export function isConfirmedInscription(inscription: Record<string, unknown>): boolean {
  const teamId = typeof inscription.teamId === "string" ? inscription.teamId.trim() : "";
  return teamId.length > 0 &&
    inscription.isPaid === true &&
    inscription.waitlist !== true &&
    inscription.partnerPending !== true;
}

/**
 * Quem recebe convite: atletas das inscrições confirmadas, um por pessoa mesmo jogando em duas
 * categorias, sem quem gerencia o torneio. Equipe sumida cai nos uids da própria inscrição
 * (`registrationAthleteUids`).
 */
export function reviewEligibleUids(
  inscriptions: ReadonlyArray<Record<string, unknown>>,
  teamsById: ReadonlyMap<string, Record<string, unknown>>,
  excludeUids: Iterable<string>,
): string[] {
  const excluded = new Set(excludeUids);
  const out = new Set<string>();
  for (const inscription of inscriptions) {
    if (!isConfirmedInscription(inscription)) continue;
    const teamId = (inscription.teamId as string).trim();
    for (const uid of registrationAthleteUids(inscription, teamsById.get(teamId) ?? null)) {
      if (!excluded.has(uid)) out.add(uid);
    }
  }
  return [...out].sort();
}

export type ReviewWindowAction = "close" | "remind" | "none";

/** O que o job de hoje faz com um resumo. Fechar ganha de lembrar: no 14º dia ninguém recebe
 *  "ainda dá tempo". */
export function reviewWindowAction(summary: Record<string, unknown>, nowMs: number): ReviewWindowAction {
  if (summary.status !== "open") return "none";
  const closesAt = millis(summary.closesAt);
  if (closesAt != null && closesAt <= nowMs) return "close";
  const opensAt = millis(summary.opensAt);
  if (summary.reminderSentAt == null && opensAt != null &&
    opensAt + REVIEW_REMINDER_AFTER_DAYS * DAY_MS <= nowMs) {
    return "remind";
  }
  return "none";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build && node --test lib/tournament-review-window.test.js`

Expected: 14 testes `pass`.

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add functions/src/tournament-review-window.ts functions/src/tournament-review-window.test.ts
git commit -m "feat(functions): regras da janela e da elegibilidade da avaliação de torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Payloads dos pushes

**Files:**
- Create: `functions/src/tournament-review-notifications.ts`
- Test: `functions/src/tournament-review-notifications.test.ts`

**Interfaces:**
- Consumes:
  - `DeliverNotificationInput` de `./notification-delivery` (`{userId, title, body, type, data: Record<string,string>, requireInteraction?}`).
  - `EVENT_TIME_ZONE` de `./event-timezone`.
  - `MIN_PUBLIC_REVIEWS`, `TOURNAMENT_REVIEW_NOTIFICATION_TYPES`, `XP_TOURNAMENT_REVIEW` (Task 2).
- Produces:
  - `reviewRequestNotification({uid, tournamentId, tournamentName}): DeliverNotificationInput`.
  - `reviewReminderNotification({uid, tournamentId, tournamentName, closesAtMs}): DeliverNotificationInput`.
  - `reviewClosedNotification({uid, tournamentId, tournamentName, count, average}): DeliverNotificationInput`, com `average: number | null`.

- [ ] **Step 1: Escrever o teste que falha**

`functions/src/tournament-review-notifications.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  reviewClosedNotification,
  reviewReminderNotification,
  reviewRequestNotification,
} from "./tournament-review-notifications";

const CLOSES = Date.UTC(2026, 9, 15, 13, 0, 0); // 15/10/2026 10:00 em São Paulo

describe("pushes da avaliação de torneio", () => {
  it("pedido: nome no título, url que o app antigo conhece, sem requireInteraction", () => {
    assert.deepEqual(reviewRequestNotification({uid: "u1", tournamentId: "t1", tournamentName: "Desafio Anápolis"}), {
      userId: "u1",
      title: "Como foi o Desafio Anápolis?",
      body: "Avalie em 10 segundos e ganhe 10 XP.",
      type: "tournament_review_request",
      data: {tournamentId: "t1", url: "/torneios/t1"},
      requireInteraction: false,
    });
  });

  it("nome vazio vira 'torneio'", () => {
    assert.equal(
      reviewRequestNotification({uid: "u1", tournamentId: "t1", tournamentName: "  "}).title,
      "Como foi o torneio?",
    );
  });

  it("lembrete: data de fechamento no fuso de São Paulo", () => {
    const n = reviewReminderNotification({uid: "u1", tournamentId: "t1", tournamentName: "Copa", closesAtMs: CLOSES});
    assert.equal(n.title, "Ainda dá tempo de avaliar o Copa");
    assert.equal(n.body, "A avaliação fecha em 15/10.");
    assert.equal(n.type, "tournament_review_reminder");
    assert.deepEqual(n.data, {tournamentId: "t1", url: "/torneios/t1"});
    assert.equal(n.requireInteraction, false);
  });

  it("fechamento com nota: média com vírgula, rota do app e do portal", () => {
    const n = reviewClosedNotification({uid: "org", tournamentId: "t1", tournamentName: "Copa", count: 23, average: 4.567});
    assert.equal(n.userId, "org");
    assert.equal(n.title, "Avaliações do Copa encerradas");
    assert.equal(n.body, "4,6 ★ com 23 avaliações.");
    assert.equal(n.type, "tournament_review_closed");
    assert.deepEqual(n.data, {
      tournamentId: "t1",
      url: "/organizer/tournaments/t1",
      webUrl: "/painel/eventos/t1/avaliacoes",
    });
  });

  it("fechamento abaixo de 3: sem média, com singular certo", () => {
    const base = {uid: "org", tournamentId: "t1", tournamentName: "Copa", average: null};
    assert.equal(reviewClosedNotification({...base, count: 1}).body, "Recebeu 1 avaliação, poucas para exibir.");
    assert.equal(reviewClosedNotification({...base, count: 0}).body, "Recebeu 0 avaliações, poucas para exibir.");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build`

Expected: `TS2307: Cannot find module './tournament-review-notifications'`.

- [ ] **Step 3: Implementar**

`functions/src/tournament-review-notifications.ts`:

```ts
import {EVENT_TIME_ZONE} from "./event-timezone";
import type {DeliverNotificationInput} from "./notification-delivery";
import {
  MIN_PUBLIC_REVIEWS,
  TOURNAMENT_REVIEW_NOTIFICATION_TYPES as TYPES,
  XP_TOURNAMENT_REVIEW,
} from "./tournament-review-constants";

/**
 * Payloads dos 3 pushes da avaliação de torneio.
 *
 * `url` é SEMPRE uma rota que o app antigo conhece: `resolveNotificationRoute`
 * (nexago_app/lib/core/notifications/notification_navigation.dart) usa a url antes do tipo e o
 * router não tem errorBuilder. O build novo checa o tipo primeiro e abre o formulário. O portal
 * do organizador lê `webUrl` (push-sw.js e inbox).
 */

function label(tournamentName: string): string {
  return tournamentName.trim() || "torneio";
}

function formatDayMonth(ms: number): string {
  return new Intl.DateTimeFormat("pt-BR", {day: "2-digit", month: "2-digit", timeZone: EVENT_TIME_ZONE})
    .format(new Date(ms));
}

function formatAverage(average: number): string {
  return average.toFixed(1).replace(".", ",");
}

export function reviewRequestNotification(p: {
  uid: string;
  tournamentId: string;
  tournamentName: string;
}): DeliverNotificationInput {
  return {
    userId: p.uid,
    title: `Como foi o ${label(p.tournamentName)}?`,
    body: `Avalie em 10 segundos e ganhe ${XP_TOURNAMENT_REVIEW} XP.`,
    type: TYPES.request,
    data: {tournamentId: p.tournamentId, url: `/torneios/${p.tournamentId}`},
    requireInteraction: false,
  };
}

export function reviewReminderNotification(p: {
  uid: string;
  tournamentId: string;
  tournamentName: string;
  closesAtMs: number;
}): DeliverNotificationInput {
  return {
    userId: p.uid,
    title: `Ainda dá tempo de avaliar o ${label(p.tournamentName)}`,
    body: `A avaliação fecha em ${formatDayMonth(p.closesAtMs)}.`,
    type: TYPES.reminder,
    data: {tournamentId: p.tournamentId, url: `/torneios/${p.tournamentId}`},
    requireInteraction: false,
  };
}

export function reviewClosedNotification(p: {
  uid: string;
  tournamentId: string;
  tournamentName: string;
  count: number;
  average: number | null;
}): DeliverNotificationInput {
  const body = p.count >= MIN_PUBLIC_REVIEWS && p.average != null ?
    `${formatAverage(p.average)} ★ com ${p.count} avaliações.` :
    `Recebeu ${p.count} ${p.count === 1 ? "avaliação" : "avaliações"}, poucas para exibir.`;
  return {
    userId: p.uid,
    title: `Avaliações do ${label(p.tournamentName)} encerradas`,
    body,
    type: TYPES.closed,
    data: {
      tournamentId: p.tournamentId,
      url: `/organizer/tournaments/${p.tournamentId}`,
      webUrl: `/painel/eventos/${p.tournamentId}/avaliacoes`,
    },
    requireInteraction: false,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build && node --test lib/tournament-review-notifications.test.js`

Expected: 5 testes `pass`.

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add functions/src/tournament-review-notifications.ts functions/src/tournament-review-notifications.test.ts
git commit -m "feat(functions): pushes de pedido, lembrete e fechamento da avaliação de torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Callable `submitTournamentReview`

**Files:**
- Create: `functions/src/tournament-review-submit.ts`
- Test: `functions/src/tournament-review-submit.test.ts`

**Interfaces:**
- Consumes: `parseTournamentReviewInput` (Task 3); `TOURNAMENT_REVIEWS_COLLECTION`, `reviewInvitePath`, `tournamentReviewDocId` (Task 2); `CLIENT_FACING_REGIONS` de `./function-regions`.
- Produces:
  - `submitTournamentReviewCore(db: Firestore, uid: string, raw: unknown, nowMs?: number, newAnonId?: () => string): Promise<{ok: true; created: boolean}>`.
  - `submitTournamentReview` (onCall).
  - O doc gravado é `tournamentReviews/{tid}_{uid}`: `{tournamentId, organizerId, uid, overall, aspects, comment, anonId, createdAt, updatedAt}`. Os Tasks 8 e 9 leem esse formato.

- [ ] **Step 1: Escrever o teste que falha**

`functions/src/tournament-review-submit.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {DAY_MS, HOUR_MS} from "./tournament-review-constants";
import {submitTournamentReviewCore} from "./tournament-review-submit";

const NOW = Date.UTC(2026, 9, 6, 15, 0, 0);
const INVITE = "users/u1/tournamentReviewInvites/t1";
const REVIEW = "tournamentReviews/t1_u1";

function setup(inviteExtra: Record<string, unknown> = {}) {
  const fake = new FakeFirestore();
  fake.seedDoc(INVITE, {
    tournamentId: "t1",
    organizerId: "org",
    status: "pending",
    closesAt: Timestamp.fromMillis(NOW + DAY_MS),
    submittedAt: null,
    ...inviteExtra,
  });
  return {fake, db: fake as unknown as Firestore};
}

function anonIds(): () => string {
  let n = 0;
  return () => `anon-${++n}`;
}

function isCode(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof HttpsError);
    assert.equal(error.code, code);
    return true;
  };
}

const millis = (value: unknown) => (value as Timestamp).toMillis();

describe("submitTournamentReviewCore", () => {
  it("primeira avaliação: grava o doc privado e marca o convite", async () => {
    const {fake, db} = setup();
    const result = await submitTournamentReviewCore(
      db, "u1", {tournamentId: "t1", overall: 4, aspects: {schedule: 2}, comment: "Atrasou"}, NOW, anonIds(),
    );
    assert.deepEqual(result, {ok: true, created: true});

    const review = fake.store.get(REVIEW)!;
    assert.equal(review.tournamentId, "t1");
    assert.equal(review.organizerId, "org");
    assert.equal(review.uid, "u1");
    assert.equal(review.overall, 4);
    assert.deepEqual(review.aspects, {schedule: 2});
    assert.equal(review.comment, "Atrasou");
    assert.equal(review.anonId, "anon-1");
    assert.equal(millis(review.createdAt), NOW);
    assert.equal(millis(review.updatedAt), NOW);

    const invite = fake.store.get(INVITE)!;
    assert.equal(invite.status, "submitted");
    assert.equal(millis(invite.submittedAt), NOW);
  });

  it("edição preserva anonId, createdAt e submittedAt, e substitui o resto", async () => {
    const {fake, db} = setup();
    const next = anonIds();
    await submitTournamentReviewCore(db, "u1", {tournamentId: "t1", overall: 4, aspects: {schedule: 2}}, NOW, next);
    const later = NOW + HOUR_MS;
    const result = await submitTournamentReviewCore(db, "u1", {tournamentId: "t1", overall: 2}, later, next);
    assert.deepEqual(result, {ok: true, created: false});

    const review = fake.store.get(REVIEW)!;
    assert.equal(review.anonId, "anon-1");
    assert.equal(millis(review.createdAt), NOW);
    assert.equal(millis(review.updatedAt), later);
    assert.equal(review.overall, 2);
    assert.deepEqual(review.aspects, {});
    assert.equal(review.comment, null);
    assert.equal(millis(fake.store.get(INVITE)!.submittedAt), NOW);
  });

  it("sem convite: permission-denied e nada gravado", async () => {
    const fake = new FakeFirestore();
    await assert.rejects(
      submitTournamentReviewCore(fake as unknown as Firestore, "u1", {tournamentId: "t1", overall: 5}, NOW),
      isCode("permission-denied"),
    );
    assert.equal(fake.store.has(REVIEW), false);
  });

  it("prazo vencido, inclusive no instante exato do fechamento com o convite ainda pending", async () => {
    const {fake, db} = setup({closesAt: Timestamp.fromMillis(NOW)});
    await assert.rejects(
      submitTournamentReviewCore(db, "u1", {tournamentId: "t1", overall: 5}, NOW),
      isCode("failed-precondition"),
    );
    assert.equal(fake.store.has(REVIEW), false);
  });

  it("convite expirado: failed-precondition", async () => {
    const {db} = setup({status: "expired"});
    await assert.rejects(
      submitTournamentReviewCore(db, "u1", {tournamentId: "t1", overall: 5}, NOW),
      isCode("failed-precondition"),
    );
  });

  it("entrada inválida é recusada sem gravar nada", async () => {
    const {fake, db} = setup();
    await assert.rejects(
      submitTournamentReviewCore(db, "u1", {tournamentId: "t1", overall: 9}, NOW),
      isCode("invalid-argument"),
    );
    assert.equal(fake.store.has(REVIEW), false);
    assert.equal(fake.store.get(INVITE)!.status, "pending");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build`

Expected: `TS2307: Cannot find module './tournament-review-submit'`.

- [ ] **Step 3: Implementar**

`functions/src/tournament-review-submit.ts`:

```ts
import {randomUUID} from "node:crypto";
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  reviewInvitePath,
  TOURNAMENT_REVIEWS_COLLECTION,
  tournamentReviewDocId,
} from "./tournament-review-constants";
import {parseTournamentReviewInput} from "./tournament-review-input";

export interface SubmitTournamentReviewResult {
  ok: true;
  created: boolean;
}

/**
 * Grava (ou edita) a avaliação do atleta. O convite é a única prova de "pode avaliar e até
 * quando": sem ele, permission-denied; vencido, failed-precondition — mesmo que o job do dia
 * ainda não tenha marcado o convite como `expired`.
 *
 * `set` sem merge de propósito: na edição, aspecto que saiu do formulário sai do doc. O
 * `anonId` nasce na 1ª gravação e é preservado — é o id da cópia anônima.
 */
export async function submitTournamentReviewCore(
  db: Firestore,
  uid: string,
  raw: unknown,
  nowMs: number = Date.now(),
  newAnonId: () => string = randomUUID,
): Promise<SubmitTournamentReviewResult> {
  const input = parseTournamentReviewInput(raw);
  const inviteRef = db.doc(reviewInvitePath(uid, input.tournamentId));
  const reviewRef = db
    .collection(TOURNAMENT_REVIEWS_COLLECTION)
    .doc(tournamentReviewDocId(input.tournamentId, uid));
  const now = Timestamp.fromMillis(nowMs);

  return db.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(inviteRef);
    const reviewSnap = await tx.get(reviewRef);
    if (!inviteSnap.exists) {
      throw new HttpsError("permission-denied", "Você não participou deste torneio.");
    }
    const invite = inviteSnap.data() as Record<string, unknown>;
    const closesAt = invite.closesAt instanceof Timestamp ? invite.closesAt.toMillis() : 0;
    if (invite.status === "expired" || closesAt <= nowMs) {
      throw new HttpsError("failed-precondition", "A avaliação deste torneio foi encerrada.");
    }

    const previous = reviewSnap.exists ? reviewSnap.data() as Record<string, unknown> : null;
    const previousAnonId = typeof previous?.anonId === "string" ? previous.anonId : "";
    tx.set(reviewRef, {
      tournamentId: input.tournamentId,
      organizerId: typeof invite.organizerId === "string" ? invite.organizerId : "",
      uid,
      overall: input.overall,
      aspects: input.aspects,
      comment: input.comment,
      anonId: previousAnonId || newAnonId(),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    });
    tx.update(inviteRef, {
      status: "submitted",
      submittedAt: invite.submittedAt ?? now,
    });
    return {ok: true as const, created: previous == null};
  });
}

export const submitTournamentReview = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return submitTournamentReviewCore(getFirestore(), uid, request.data);
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build && node --test lib/tournament-review-submit.test.js`

Expected: 6 testes `pass`.

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add functions/src/tournament-review-submit.ts functions/src/tournament-review-submit.test.ts
git commit -m "feat(functions): callable submitTournamentReview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Trigger de cópia anônima, resumo e reputação

**Files:**
- Create: `functions/src/tournament-review-derived.ts`
- Test: `functions/src/tournament-review-derived.test.ts`

**Interfaces:**
- Consumes:
  - `computeReviewAggregate` (Task 4).
  - `ORGANIZER_REPUTATION_COLLECTION`, `TOURNAMENT_REVIEWS_COLLECTION`, `TOURNAMENT_REVIEW_SUMMARIES_COLLECTION`, `anonymousReviewPath` (Task 2).
  - O formato do doc gravado no Task 7.
- Produces:
  - `syncTournamentReviewDerivedDocs(db, before: Record<string, unknown> | null, after: Record<string, unknown> | null, nowMs?: number, randomKey?: () => number): Promise<void>`.
  - `recomputeTournamentReviewSummary(db, tournamentId, nowMs): Promise<void>`.
  - `recomputeOrganizerReputation(db, organizerId, nowMs): Promise<void>`.
  - `onTournamentReviewWritten` (trigger).
- Os docs gravados:
  - `tournaments/{tid}/anonymousReviews/{anonId}` = `{overall, aspects, comment, shuffleKey}`.
  - `tournamentReviewSummaries/{tid}` = o doc inteiro, com `count`/`average`/`distribution`/`aspects`/`updatedAt` regravados e os demais campos preservados.
  - `organizerReputation/{organizerId}` = `{organizerId, reviewsCount, tournamentsRated, average, distribution, aspects, updatedAt}`.

- [ ] **Step 1: Escrever o teste que falha**

`functions/src/tournament-review-derived.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {DAY_MS} from "./tournament-review-constants";
import {syncTournamentReviewDerivedDocs} from "./tournament-review-derived";

const NOW = Date.UTC(2026, 9, 6, 15, 0, 0);

function review(uid: string, tournamentId: string, overall: number, extra: Record<string, unknown> = {}) {
  return {
    tournamentId,
    organizerId: "org",
    uid,
    overall,
    aspects: {},
    comment: null,
    anonId: `anon-${uid}-${tournamentId}`,
    ...extra,
  };
}

function setup(withSummaryFor: string[] = ["t1"]) {
  const fake = new FakeFirestore();
  for (const tid of withSummaryFor) {
    fake.seedDoc(`tournamentReviewSummaries/${tid}`, {
      tournamentId: tid,
      organizerId: "org",
      tournamentName: "Copa",
      status: "open",
      eligibleCount: 10,
      count: 0,
      average: null,
      distribution: null,
      aspects: null,
      opensAt: Timestamp.fromMillis(NOW - DAY_MS),
      invitesComplete: true,
    });
  }
  const db = fake as unknown as Firestore;
  /** Simula a gravação da callable e roda o trigger com o mesmo before/after. */
  async function write(
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    key = 0.5,
  ) {
    const data = (after ?? before)!;
    const path = `tournamentReviews/${data.tournamentId}_${data.uid}`;
    if (after) fake.seedDoc(path, after);
    else fake.store.delete(path);
    await syncTournamentReviewDerivedDocs(db, before, after, NOW, () => key);
  }
  return {fake, write};
}

describe("syncTournamentReviewDerivedDocs", () => {
  it("1ª avaliação: cópia anônima sem identidade, resumo e reputação só com contagem", async () => {
    const {fake, write} = setup();
    await write(null, review("u1", "t1", 2, {comment: "Atrasou", aspects: {schedule: 1}}));

    assert.deepEqual(fake.store.get("tournaments/t1/anonymousReviews/anon-u1-t1"), {
      overall: 2,
      aspects: {schedule: 1},
      comment: "Atrasou",
      shuffleKey: 0.5,
    });
    const summary = fake.store.get("tournamentReviewSummaries/t1")!;
    assert.equal(summary.count, 1);
    assert.equal(summary.average, null);
    assert.equal(summary.distribution, null);
    assert.equal(summary.status, "open");
    assert.equal(summary.eligibleCount, 10);
    assert.equal(summary.invitesComplete, true);
    assert.equal(summary.tournamentName, "Copa");
    const reputation = fake.store.get("organizerReputation/org")!;
    assert.equal(reputation.organizerId, "org");
    assert.equal(reputation.reviewsCount, 1);
    assert.equal(reputation.tournamentsRated, 1);
    assert.equal(reputation.average, null);
  });

  it("3 avaliações liberam média, distribuição e aspectos no resumo", async () => {
    const {fake, write} = setup();
    await write(null, review("u1", "t1", 5, {aspects: {venue: 4}}));
    await write(null, review("u2", "t1", 4));
    await write(null, review("u3", "t1", 3));
    const summary = fake.store.get("tournamentReviewSummaries/t1")!;
    assert.equal(summary.count, 3);
    assert.equal(summary.average, 4);
    assert.deepEqual(summary.distribution, {"1": 0, "2": 0, "3": 1, "4": 1, "5": 1});
    assert.deepEqual(summary.aspects, {venue: {count: 1, average: 4}});
  });

  it("edição mantém o shuffleKey, e aspecto que perdeu a nota sai do resumo", async () => {
    const {fake, write} = setup();
    const first = review("u1", "t1", 5, {aspects: {venue: 4}});
    await write(null, first, 0.42);
    await write(null, review("u2", "t1", 4));
    await write(null, review("u3", "t1", 3));
    await write(first, review("u1", "t1", 5, {aspects: {}}), 0.99);

    assert.equal(fake.store.get("tournaments/t1/anonymousReviews/anon-u1-t1")!.shuffleKey, 0.42);
    assert.deepEqual(fake.store.get("tournamentReviewSummaries/t1")!.aspects, {});
  });

  it("avaliação apagada some da cópia anônima e da contagem", async () => {
    const {fake, write} = setup();
    const first = review("u1", "t1", 5);
    await write(null, first);
    await write(null, review("u2", "t1", 4));
    await write(null, review("u3", "t1", 3));
    await write(first, null);

    assert.equal(fake.store.has("tournaments/t1/anonymousReviews/anon-u1-t1"), false);
    const summary = fake.store.get("tournamentReviewSummaries/t1")!;
    assert.equal(summary.count, 2);
    assert.equal(summary.average, null);
  });

  it("reputação soma torneios diferentes do mesmo organizador", async () => {
    const {fake, write} = setup(["t1", "t2"]);
    await write(null, review("u1", "t1", 5));
    await write(null, review("u2", "t1", 3));
    await write(null, review("u1", "t2", 4));
    const reputation = fake.store.get("organizerReputation/org")!;
    assert.equal(reputation.reviewsCount, 3);
    assert.equal(reputation.tournamentsRated, 2);
    assert.equal(reputation.average, 4);
  });

  it("sem resumo do torneio: não inventa um, mas a cópia e a reputação saem", async () => {
    const {fake, write} = setup([]);
    await write(null, review("u1", "t9", 4));
    assert.equal(fake.store.has("tournamentReviewSummaries/t9"), false);
    assert.equal(fake.store.has("tournaments/t9/anonymousReviews/anon-u1-t9"), true);
    assert.equal(fake.store.get("organizerReputation/org")!.reviewsCount, 1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build`

Expected: `TS2307: Cannot find module './tournament-review-derived'`.

- [ ] **Step 3: Implementar**

`functions/src/tournament-review-derived.ts`:

```ts
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {computeReviewAggregate} from "./tournament-review-aggregate";
import {
  anonymousReviewPath,
  ORGANIZER_REPUTATION_COLLECTION,
  TOURNAMENT_REVIEW_SUMMARIES_COLLECTION,
  TOURNAMENT_REVIEWS_COLLECTION,
} from "./tournament-review-constants";

type DocData = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Cópia que o organizador lê: sem uid, sem data, sem categoria. `shuffleKey` nasce uma vez e a
 * tela ordena por ele, então a ordem de chegada não fica guardada.
 */
async function syncAnonymousCopy(
  db: Firestore,
  before: DocData | null,
  after: DocData | null,
  randomKey: () => number,
): Promise<void> {
  const tournamentId = str((after ?? before)?.tournamentId);
  if (!tournamentId) return;
  if (!after) {
    const anonId = str(before?.anonId);
    if (anonId) await db.doc(anonymousReviewPath(tournamentId, anonId)).delete();
    return;
  }
  const anonId = str(after.anonId);
  if (!anonId) return;
  const ref = db.doc(anonymousReviewPath(tournamentId, anonId));
  const existing = await ref.get();
  const previousKey = existing.exists ? existing.data()?.shuffleKey : undefined;
  await ref.set({
    overall: after.overall,
    aspects: after.aspects ?? {},
    comment: after.comment ?? null,
    shuffleKey: typeof previousKey === "number" ? previousKey : randomKey(),
  });
}

/**
 * Resumo do torneio, recalculado do zero (idempotente com o at-least-once do trigger) e
 * regravado inteiro numa transação, preservando os campos da janela. `set` sem merge de
 * propósito: com merge, um aspecto que deixou de ter nota ficaria velho dentro do mapa.
 * Resumo ausente não é criado aqui: quem cria é o job, ao abrir a janela.
 */
export async function recomputeTournamentReviewSummary(
  db: Firestore,
  tournamentId: string,
  nowMs: number,
): Promise<void> {
  const summaryRef = db.collection(TOURNAMENT_REVIEW_SUMMARIES_COLLECTION).doc(tournamentId);
  const reviewsQuery = db.collection(TOURNAMENT_REVIEWS_COLLECTION).where("tournamentId", "==", tournamentId);
  await db.runTransaction(async (tx) => {
    const summarySnap = await tx.get(summaryRef);
    const reviewsSnap = await tx.get(reviewsQuery);
    if (!summarySnap.exists) {
      logger.warn("recomputeTournamentReviewSummary: resumo ausente", {tournamentId});
      return;
    }
    const aggregate = computeReviewAggregate(reviewsSnap.docs.map((d) => d.data()));
    tx.set(summaryRef, {
      ...summarySnap.data(),
      count: aggregate.count,
      average: aggregate.average,
      distribution: aggregate.distribution,
      aspects: aggregate.aspects,
      updatedAt: Timestamp.fromMillis(nowMs),
    });
  });
}

/** Reputação do organizador: todas as avaliações de todos os torneios dele, inclusive dos que
 *  fecharam com menos de 3. Recalcula do zero; troque por acumulador se algum organizador
 *  passar de ~10 mil avaliações. */
export async function recomputeOrganizerReputation(
  db: Firestore,
  organizerId: string,
  nowMs: number,
): Promise<void> {
  const snap = await db.collection(TOURNAMENT_REVIEWS_COLLECTION).where("organizerId", "==", organizerId).get();
  const reviews = snap.docs.map((d) => d.data());
  const aggregate = computeReviewAggregate(reviews);
  const tournaments = new Set(reviews.map((r) => str(r.tournamentId)).filter((id) => id.length > 0));
  await db.collection(ORGANIZER_REPUTATION_COLLECTION).doc(organizerId).set({
    organizerId,
    reviewsCount: aggregate.count,
    tournamentsRated: tournaments.size,
    average: aggregate.average,
    distribution: aggregate.distribution,
    aspects: aggregate.aspects,
    updatedAt: Timestamp.fromMillis(nowMs),
  });
}

export async function syncTournamentReviewDerivedDocs(
  db: Firestore,
  before: DocData | null,
  after: DocData | null,
  nowMs: number = Date.now(),
  randomKey: () => number = Math.random,
): Promise<void> {
  await syncAnonymousCopy(db, before, after, randomKey);
  const tournamentIds = new Set([str(before?.tournamentId), str(after?.tournamentId)].filter((id) => id));
  const organizerIds = new Set([str(before?.organizerId), str(after?.organizerId)].filter((id) => id));
  for (const tournamentId of tournamentIds) {
    await recomputeTournamentReviewSummary(db, tournamentId, nowMs);
  }
  for (const organizerId of organizerIds) {
    await recomputeOrganizerReputation(db, organizerId, nowMs);
  }
}

export const onTournamentReviewWritten = onDocumentWritten(
  `${TOURNAMENT_REVIEWS_COLLECTION}/{reviewId}`,
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() ?? null : null;
    const after = event.data?.after.exists ? event.data.after.data() ?? null : null;
    await syncTournamentReviewDerivedDocs(getFirestore(), before, after);
  },
);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build && node --test lib/tournament-review-derived.test.js`

Expected: 6 testes `pass`.

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add functions/src/tournament-review-derived.ts functions/src/tournament-review-derived.test.ts
git commit -m "feat(functions): cópia anônima, resumo e reputação da avaliação de torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: XP por avaliar

**Files:**
- Create: `functions/src/tournament-review-gamification.ts`
- Test: `functions/src/tournament-review-gamification.test.ts`

**Interfaces:**
- Consumes: `TOURNAMENT_REVIEWS_COLLECTION`, `XP_TOURNAMENT_REVIEW` (Task 2); `syncAchievementsForUser(db, uid)` de `./achievement-engine`.
- Produces:
  - `tournamentReviewEventId(tournamentId): string`.
  - `awardTournamentReviewXp(db, userId, tournamentId, syncAchievements?): Promise<boolean>`.
  - `onTournamentReviewCreatedAwardXp` (trigger).

- [ ] **Step 1: Escrever o teste que falha**

`functions/src/tournament-review-gamification.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {awardTournamentReviewXp, tournamentReviewEventId} from "./tournament-review-gamification";

describe("XP da avaliação de torneio", () => {
  it("o id do evento é por torneio: editar a avaliação não paga de novo", () => {
    assert.equal(tournamentReviewEventId(" t1 "), "tournament_review_t1");
  });

  it("paga 10 XP uma vez só por torneio", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("users/u1/gamification/summary", {xp: 95});
    const db = fake as unknown as Firestore;
    let syncs = 0;
    const sync = async () => {
      syncs += 1;
    };

    assert.equal(await awardTournamentReviewXp(db, "u1", "t1", sync), true);
    assert.equal(await awardTournamentReviewXp(db, "u1", "t1", sync), false);

    const summary = fake.store.get("users/u1/gamification/summary")!;
    assert.equal(summary.xp, 105);
    assert.equal(summary.level, 1);
    assert.equal(summary.lastXpReason, "TOURNAMENT_REVIEW");
    const event = fake.store.get("users/u1/gamification_events/tournament_review_t1")!;
    assert.equal(event.type, "TOURNAMENT_REVIEW");
    assert.equal(event.tournamentId, "t1");
    assert.equal(event.xp, 10);
    assert.equal(syncs, 1);
  });

  it("uid ou torneio vazio não paga", async () => {
    const db = new FakeFirestore() as unknown as Firestore;
    const sync = async () => undefined;
    assert.equal(await awardTournamentReviewXp(db, " ", "t1", sync), false);
    assert.equal(await awardTournamentReviewXp(db, "u1", "", sync), false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build`

Expected: `TS2307: Cannot find module './tournament-review-gamification'`.

- [ ] **Step 3: Implementar**

`functions/src/tournament-review-gamification.ts`:

```ts
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {FieldValue, type Firestore, getFirestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {syncAchievementsForUser} from "./achievement-engine";
import {TOURNAMENT_REVIEWS_COLLECTION, XP_TOURNAMENT_REVIEW} from "./tournament-review-constants";

/** Um evento por torneio, não por avaliação: editar a avaliação não paga de novo. */
export function tournamentReviewEventId(tournamentId: string): string {
  return `tournament_review_${tournamentId.trim()}`;
}

function numberField(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Mesmo molde de `awardArenaReviewXp` (arena-review-gamification.ts), idempotente pelo doc
 *  de evento. */
export async function awardTournamentReviewXp(
  db: Firestore,
  userId: string,
  tournamentId: string,
  syncAchievements: (db: Firestore, uid: string) => Promise<unknown> = syncAchievementsForUser,
): Promise<boolean> {
  const uid = userId.trim();
  const tid = tournamentId.trim();
  if (!uid || !tid) return false;

  const eventRef = db.collection("users").doc(uid).collection("gamification_events").doc(tournamentReviewEventId(tid));
  const summaryRef = db.collection("users").doc(uid).collection("gamification").doc("summary");

  const awarded = await db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (eventSnap.exists) return false;
    const summarySnap = await tx.get(summaryRef);
    const nextXp = numberField(summarySnap.data() ?? {}, "xp") + XP_TOURNAMENT_REVIEW;
    tx.set(
      summaryRef,
      {
        xp: nextXp,
        level: Math.floor(nextXp / 100),
        updatedAt: FieldValue.serverTimestamp(),
        lastXpReason: "TOURNAMENT_REVIEW",
      },
      {merge: true},
    );
    tx.set(eventRef, {
      type: "TOURNAMENT_REVIEW",
      tournamentId: tid,
      xp: XP_TOURNAMENT_REVIEW,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!awarded) return false;
  await syncAchievements(db, uid);
  return true;
}

export const onTournamentReviewCreatedAwardXp = onDocumentCreated(
  `${TOURNAMENT_REVIEWS_COLLECTION}/{reviewId}`,
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const uid = typeof data.uid === "string" ? data.uid.trim() : "";
    const tournamentId = typeof data.tournamentId === "string" ? data.tournamentId.trim() : "";
    if (!uid || !tournamentId) return;
    try {
      if (await awardTournamentReviewXp(getFirestore(), uid, tournamentId)) {
        logger.info(`tournamentReviewXp: +${XP_TOURNAMENT_REVIEW} XP para ${uid} (torneio ${tournamentId})`);
      }
    } catch (error) {
      logger.error(`tournamentReviewXp: falha na avaliação ${event.params.reviewId}`, error);
    }
  },
);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build && node --test lib/tournament-review-gamification.test.js`

Expected: 3 testes `pass`.

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add functions/src/tournament-review-gamification.ts functions/src/tournament-review-gamification.test.ts
git commit -m "feat(functions): +10 XP por avaliar o torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Job diário `tournamentReviewDailySweep`

**Files:**
- Create: `functions/src/tournament-review-sweep.ts`
- Test: `functions/src/tournament-review-sweep.test.ts`

**Interfaces:**
- Consumes:
  - `loadTournamentReviewsConfig` (Task 2).
  - `reviewCandidateReason`, `reviewEligibleUids`, `isConfirmedInscription`, `reviewWindowAction` (Task 5).
  - `reviewRequestNotification`, `reviewReminderNotification`, `reviewClosedNotification` (Task 6).
  - Constantes do Task 2.
  - Helpers que já existem:
    - `tournamentManagerUids(db, tid, data?)` de `./tournament-acl`;
    - `artifactsInscriptionsPath`, `artifactsTeamsPath`, `getFirebaseProjectId` de `./firebase-paths`;
    - `deliverNotificationToUser`, `DeliverNotificationInput`, `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` de `./notification-delivery`;
    - `EVENT_TIME_ZONE` de `./event-timezone`.
  - `FakeFirestore.collectionGroup` e os filtros de intervalo (Task 1).
- Produces:
  - `type Notify = (input: DeliverNotificationInput) => Promise<unknown>`.
  - `openTournamentReviewWindow(db, tournamentId, tournament, nowMs, notify, projectId?): Promise<boolean>`.
  - `remindTournamentReviews(db, summaryDoc, nowMs, notify): Promise<void>`.
  - `closeTournamentReviewWindow(db, summaryDoc, nowMs, notify): Promise<void>`.
  - `runTournamentReviewSweep(db, nowMs, notify?, projectId?): Promise<{opened: number; reminded: number; closed: number}>`.
  - `tournamentReviewDailySweep` (onSchedule).
- Convite gravado: `{tournamentId, tournamentName, coverUrl, organizerId, opensAt, closesAt, status: "pending", submittedAt: null, createdAt}`.
- Resumo criado: `{tournamentId, organizerId, tournamentName, tournamentStartAt, status, eligibleCount, count: 0, average: null, distribution: null, aspects: null, opensAt, closesAt, reminderSentAt: null, closedAt, invitesComplete, updatedAt}`.

- [ ] **Step 1: Escrever o teste que falha**

`functions/src/tournament-review-sweep.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import type {DeliverNotificationInput} from "./notification-delivery";
import {DAY_MS, HOUR_MS} from "./tournament-review-constants";
import {runTournamentReviewSweep} from "./tournament-review-sweep";

const PROJECT = "test-project";
const INSCRIPTIONS = `artifacts/${PROJECT}/public/data/inscriptions`;
const TEAMS = `artifacts/${PROJECT}/public/data/teams`;
const NOW = Date.UTC(2026, 9, 5, 13, 0, 0); // 05/10/2026 10:00 em São Paulo
const ts = (ms: number) => Timestamp.fromMillis(ms);
const millis = (value: unknown) => (value as Timestamp).toMillis();

function setup(enabled = true) {
  const fake = new FakeFirestore();
  if (enabled) fake.seedDoc("appConfig/tournamentReviews", {enabled: true});
  const sent: DeliverNotificationInput[] = [];
  const notify = async (input: DeliverNotificationInput) => {
    sent.push(input);
  };
  const run = () => runTournamentReviewSweep(fake as unknown as Firestore, NOW, notify, PROJECT);
  return {fake, sent, run};
}

/** Torneio encerrado ontem: dupla a/b confirmada, dupla org/e confirmada (org é o dono),
 *  dupla c/d na fila de espera. Elegíveis esperados: a, b, e. */
function seedFinishedTournament(fake: FakeFirestore, id = "t1", extra: Record<string, unknown> = {}) {
  fake.seedDoc(`tournaments/${id}`, {
    name: "Copa Areia",
    managerId: "org",
    listingStatus: "completed",
    completedAt: ts(NOW - DAY_MS),
    endAt: ts(NOW - DAY_MS),
    startAt: ts(NOW - 2 * DAY_MS),
    coverUrl: "https://img/capa.jpg",
    ...extra,
  });
  fake.seedDoc(`${TEAMS}/${id}-ab`, {player1Id: "a", player2Id: "b"});
  fake.seedDoc(`${TEAMS}/${id}-org`, {player1Id: "org", player2Id: "e"});
  fake.seedDoc(`${TEAMS}/${id}-cd`, {player1Id: "c", player2Id: "d"});
  fake.seedDoc(`${INSCRIPTIONS}/${id}-i1`, {tournamentId: id, categoryId: "c1", teamId: `${id}-ab`, isPaid: true});
  fake.seedDoc(`${INSCRIPTIONS}/${id}-i2`, {tournamentId: id, categoryId: "c1", teamId: `${id}-org`, isPaid: true});
  fake.seedDoc(`${INSCRIPTIONS}/${id}-i3`, {
    tournamentId: id, categoryId: "c2", teamId: `${id}-cd`, isPaid: true, waitlist: true,
  });
}

function seedOpenSummary(fake: FakeFirestore, id: string, extra: Record<string, unknown>) {
  fake.seedDoc(`tournamentReviewSummaries/${id}`, {
    tournamentId: id,
    organizerId: "org",
    tournamentName: "Copa",
    status: "open",
    eligibleCount: 2,
    count: 0,
    average: null,
    opensAt: ts(NOW - DAY_MS),
    closesAt: ts(NOW + 13 * DAY_MS),
    reminderSentAt: null,
    invitesComplete: true,
    ...extra,
  });
}

const userIds = (sent: DeliverNotificationInput[]) => sent.map((n) => n.userId).sort();

describe("runTournamentReviewSweep — abrir", () => {
  it("flag desligada: não faz nada", async () => {
    const {fake, sent, run} = setup(false);
    seedFinishedTournament(fake);
    assert.deepEqual(await run(), {opened: 0, reminded: 0, closed: 0});
    assert.equal(fake.store.has("tournamentReviewSummaries/t1"), false);
    assert.equal(sent.length, 0);
  });

  it("abre a janela: resumo, convites só dos confirmados e push de pedido", async () => {
    const {fake, sent, run} = setup();
    seedFinishedTournament(fake);
    assert.equal((await run()).opened, 1);

    const summary = fake.store.get("tournamentReviewSummaries/t1")!;
    assert.equal(summary.status, "open");
    assert.equal(summary.eligibleCount, 3);
    assert.equal(summary.count, 0);
    assert.equal(summary.organizerId, "org");
    assert.equal(summary.tournamentName, "Copa Areia");
    assert.equal(millis(summary.tournamentStartAt), NOW - 2 * DAY_MS);
    assert.equal(millis(summary.opensAt), NOW);
    assert.equal(millis(summary.closesAt), NOW + 14 * DAY_MS);
    assert.equal(summary.invitesComplete, true);

    for (const uid of ["a", "b", "e"]) {
      const invite = fake.store.get(`users/${uid}/tournamentReviewInvites/t1`)!;
      assert.equal(invite.status, "pending");
      assert.equal(invite.tournamentName, "Copa Areia");
      assert.equal(invite.coverUrl, "https://img/capa.jpg");
      assert.equal(invite.organizerId, "org");
      assert.equal(millis(invite.closesAt), NOW + 14 * DAY_MS);
    }
    for (const uid of ["org", "c", "d"]) {
      assert.equal(fake.store.has(`users/${uid}/tournamentReviewInvites/t1`), false);
    }
    assert.deepEqual(userIds(sent), ["a", "b", "e"]);
    assert.ok(sent.every((n) => n.type === "tournament_review_request"));
  });

  it("rodar de novo não duplica convite nem push", async () => {
    const {fake, sent, run} = setup();
    seedFinishedTournament(fake);
    await run();
    await run();
    assert.equal(sent.length, 3);
  });

  it("retoma janela que caiu no meio, sem repetir convite nem push", async () => {
    const {fake, sent, run} = setup();
    seedFinishedTournament(fake);
    seedOpenSummary(fake, "t1", {eligibleCount: 3, opensAt: ts(NOW - DAY_MS), invitesComplete: false});
    fake.seedDoc("users/a/tournamentReviewInvites/t1", {tournamentId: "t1", status: "submitted"});

    await run();

    assert.equal(fake.store.get("users/a/tournamentReviewInvites/t1")!.status, "submitted");
    const invite = fake.store.get("users/b/tournamentReviewInvites/t1")!;
    assert.equal(millis(invite.opensAt), NOW - DAY_MS);
    assert.deepEqual(userIds(sent), ["b", "e"]);
    assert.equal(fake.store.get("tournamentReviewSummaries/t1")!.invitesComplete, true);
  });

  it("abre por endAt + 12h quando ninguém lançou a final; com 11h ainda não", async () => {
    const {fake, run} = setup();
    seedFinishedTournament(fake, "t1", {listingStatus: "closed", completedAt: null, endAt: ts(NOW - 13 * HOUR_MS)});
    seedFinishedTournament(fake, "t2", {listingStatus: "closed", completedAt: null, endAt: ts(NOW - 11 * HOUR_MS)});
    await run();
    assert.equal(fake.store.has("tournamentReviewSummaries/t1"), true);
    assert.equal(fake.store.has("tournamentReviewSummaries/t2"), false);
  });

  it("sem confirmados: resumo nasce fechado e ninguém recebe push, nem depois", async () => {
    const {fake, sent, run} = setup();
    fake.seedDoc("tournaments/t1", {
      name: "Vazio", managerId: "org", listingStatus: "completed", completedAt: ts(NOW - DAY_MS),
    });
    fake.seedDoc(`${INSCRIPTIONS}/x`, {tournamentId: "t1", teamId: "tx", isPaid: true, waitlist: true});
    await run();
    const summary = fake.store.get("tournamentReviewSummaries/t1")!;
    assert.equal(summary.status, "closed");
    assert.equal(summary.eligibleCount, 0);
    assert.equal(sent.length, 0);
  });

  it("torneio cancelado não abre", async () => {
    const {fake, run} = setup();
    seedFinishedTournament(fake, "t1", {listingStatus: "cancelled"});
    await run();
    assert.equal(fake.store.has("tournamentReviewSummaries/t1"), false);
  });

  it("staff gestor ativo que jogou não recebe convite", async () => {
    const {fake, run} = setup();
    seedFinishedTournament(fake);
    fake.seedDoc("tournaments/t1/staff/a", {status: "active", role: "manager"});
    await run();
    assert.equal(fake.store.has("users/a/tournamentReviewInvites/t1"), false);
    assert.equal(fake.store.get("tournamentReviewSummaries/t1")!.eligibleCount, 2);
  });

  it("mais de 400 confirmados: todo mundo recebe convite (batch tem teto)", async () => {
    const {fake, sent, run} = setup();
    fake.seedDoc("tournaments/big", {
      name: "Grande", managerId: "org", listingStatus: "completed", completedAt: ts(NOW - DAY_MS),
    });
    for (let i = 0; i < 401; i += 1) {
      fake.seedDoc(`${TEAMS}/big-${i}`, {memberUids: [`p${i}`]});
      fake.seedDoc(`${INSCRIPTIONS}/big-${i}`, {tournamentId: "big", teamId: `big-${i}`, isPaid: true});
    }
    await run();
    assert.equal(fake.store.get("tournamentReviewSummaries/big")!.eligibleCount, 401);
    assert.equal(fake.store.has("users/p400/tournamentReviewInvites/big"), true);
    assert.equal(sent.length, 401);
  });
});

describe("runTournamentReviewSweep — lembrar e fechar", () => {
  it("lembra no 3º dia só quem não avaliou, uma vez", async () => {
    const {fake, sent, run} = setup();
    seedOpenSummary(fake, "t1", {opensAt: ts(NOW - 3 * DAY_MS), closesAt: ts(NOW + 11 * DAY_MS)});
    fake.seedDoc("users/a/tournamentReviewInvites/t1", {tournamentId: "t1", status: "pending"});
    fake.seedDoc("users/b/tournamentReviewInvites/t1", {tournamentId: "t1", status: "submitted"});

    assert.equal((await run()).reminded, 1);
    assert.deepEqual(userIds(sent), ["a"]);
    assert.equal(sent[0].type, "tournament_review_reminder");
    assert.equal(sent[0].body, "A avaliação fecha em 16/10.");
    assert.equal(millis(fake.store.get("tournamentReviewSummaries/t1")!.reminderSentAt), NOW);

    await run();
    assert.equal(sent.length, 1);
  });

  it("fecha no 14º dia: expira pendentes e avisa quem gerencia", async () => {
    const {fake, sent, run} = setup();
    fake.seedDoc("tournaments/t1", {name: "Copa", managerId: "org"});
    fake.seedDoc("tournaments/t1/staff/s1", {status: "active", role: "manager"});
    seedOpenSummary(fake, "t1", {
      opensAt: ts(NOW - 14 * DAY_MS),
      closesAt: ts(NOW),
      reminderSentAt: ts(NOW - 11 * DAY_MS),
      count: 4,
      average: 4.5,
    });
    fake.seedDoc("users/a/tournamentReviewInvites/t1", {tournamentId: "t1", status: "pending"});
    fake.seedDoc("users/b/tournamentReviewInvites/t1", {tournamentId: "t1", status: "submitted"});

    assert.equal((await run()).closed, 1);

    const summary = fake.store.get("tournamentReviewSummaries/t1")!;
    assert.equal(summary.status, "closed");
    assert.equal(millis(summary.closedAt), NOW);
    assert.equal(fake.store.get("users/a/tournamentReviewInvites/t1")!.status, "expired");
    assert.equal(fake.store.get("users/b/tournamentReviewInvites/t1")!.status, "submitted");
    assert.deepEqual(userIds(sent), ["org", "s1"]);
    assert.ok(sent.every((n) => n.type === "tournament_review_closed"));
    assert.equal(sent[0].body, "4,5 ★ com 4 avaliações.");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build`

Expected: `TS2307: Cannot find module './tournament-review-sweep'`.

- [ ] **Step 3: Implementar**

`functions/src/tournament-review-sweep.ts`:

```ts
import {
  getFirestore,
  Timestamp,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {EVENT_TIME_ZONE} from "./event-timezone";
import {artifactsInscriptionsPath, artifactsTeamsPath, getFirebaseProjectId} from "./firebase-paths";
import {
  deliverNotificationToUser,
  type DeliverNotificationInput,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
} from "./notification-delivery";
import {tournamentManagerUids} from "./tournament-acl";
import {loadTournamentReviewsConfig} from "./tournament-review-config";
import {
  DAY_MS,
  HOUR_MS,
  REVIEW_END_GRACE_HOURS,
  REVIEW_LOOKBACK_DAYS,
  REVIEW_WINDOW_DAYS,
  reviewInvitePath,
  TOURNAMENT_REVIEW_INVITES_SUBCOLLECTION,
  TOURNAMENT_REVIEW_SUMMARIES_COLLECTION,
} from "./tournament-review-constants";
import {
  reviewClosedNotification,
  reviewReminderNotification,
  reviewRequestNotification,
} from "./tournament-review-notifications";
import {
  isConfirmedInscription,
  reviewCandidateReason,
  reviewEligibleUids,
  reviewWindowAction,
} from "./tournament-review-window";

export type Notify = (input: DeliverNotificationInput) => Promise<unknown>;

/** Teto do batch é 500 escritas; folga para não encostar. */
const BATCH_LIMIT = 400;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Um push que falha não derruba os outros nem o job. */
async function notifyAll(notify: Notify, inputs: DeliverNotificationInput[]): Promise<void> {
  await Promise.all(inputs.map((input) =>
    notify(input).catch((error) => {
      logger.warn("tournamentReviewSweep: push falhou", {userId: input.userId, type: input.type, error});
    }),
  ));
}

/**
 * Abre a janela de um torneio. Ordem: resumo (com `invitesComplete: false`), convites que ainda
 * não existem, `invitesComplete: true`, push dos convites novos. Se o job cair no meio, a
 * execução de amanhã retoma (o torneio segue candidato por 3 dias) sem duplicar convite nem
 * push. O resumo nasce antes dos convites porque o trigger de avaliação precisa achá-lo.
 */
export async function openTournamentReviewWindow(
  db: Firestore,
  tournamentId: string,
  tournament: Record<string, unknown>,
  nowMs: number,
  notify: Notify,
  projectId: string = getFirebaseProjectId(),
): Promise<boolean> {
  const summaryRef = db.collection(TOURNAMENT_REVIEW_SUMMARIES_COLLECTION).doc(tournamentId);
  const summarySnap = await summaryRef.get();
  const existing = summarySnap.exists ? summarySnap.data() as Record<string, unknown> : null;
  if (existing?.invitesComplete === true) return false;

  const inscriptionsSnap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();
  const inscriptions = inscriptionsSnap.docs.map((d) => d.data() as Record<string, unknown>);
  const teamIds = [...new Set(inscriptions.filter(isConfirmedInscription).map((i) => str(i.teamId)))];
  const teamsById = new Map<string, Record<string, unknown>>();
  if (teamIds.length > 0) {
    const teamSnaps = await db.getAll(...teamIds.map((id) => db.doc(`${artifactsTeamsPath(projectId)}/${id}`)));
    for (const snap of teamSnaps) {
      if (snap.exists) teamsById.set(snap.id, snap.data() as Record<string, unknown>);
    }
  }
  const managers = await tournamentManagerUids(db, tournamentId, tournament);
  const uids = reviewEligibleUids(inscriptions, teamsById, managers);

  const previousOpensAt = existing?.opensAt;
  const previousClosesAt = existing?.closesAt;
  const opensAt = previousOpensAt instanceof Timestamp ? previousOpensAt : Timestamp.fromMillis(nowMs);
  const closesAt = previousClosesAt instanceof Timestamp ?
    previousClosesAt :
    Timestamp.fromMillis(opensAt.toMillis() + REVIEW_WINDOW_DAYS * DAY_MS);
  const organizerId = str(tournament.managerId);
  const tournamentName = str(tournament.name);

  if (!existing) {
    const hasInvites = uids.length > 0;
    await summaryRef.set({
      tournamentId,
      organizerId,
      tournamentName,
      tournamentStartAt: tournament.startAt instanceof Timestamp ? tournament.startAt : null,
      // Sem elegíveis nasce fechado: ninguém para avaliar, e o organizador não recebe
      // "0 avaliações" no 14º dia.
      status: hasInvites ? "open" : "closed",
      eligibleCount: uids.length,
      count: 0,
      average: null,
      distribution: null,
      aspects: null,
      opensAt,
      closesAt,
      reminderSentAt: null,
      closedAt: hasInvites ? null : opensAt,
      invitesComplete: false,
      updatedAt: opensAt,
    });
  }

  let created: string[] = [];
  if (uids.length > 0) {
    const inviteSnaps = await db.getAll(...uids.map((uid) => db.doc(reviewInvitePath(uid, tournamentId))));
    created = uids.filter((_, i) => !inviteSnaps[i]?.exists);
    const invite = {
      tournamentId,
      tournamentName,
      coverUrl: str(tournament.coverUrl) || str(tournament.imageUrl) || null,
      organizerId,
      opensAt,
      closesAt,
      status: "pending",
      submittedAt: null,
      createdAt: Timestamp.fromMillis(nowMs),
    };
    for (let i = 0; i < created.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      for (const uid of created.slice(i, i + BATCH_LIMIT)) {
        batch.set(db.doc(reviewInvitePath(uid, tournamentId)), invite);
      }
      await batch.commit();
    }
  }
  await summaryRef.update({invitesComplete: true});
  await notifyAll(notify, created.map((uid) => reviewRequestNotification({uid, tournamentId, tournamentName})));
  return true;
}

async function pendingInvites(db: Firestore, tournamentId: string) {
  return db
    .collectionGroup(TOURNAMENT_REVIEW_INVITES_SUBCOLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "pending")
    .get();
}

/** Lembrete do 3º dia. Marca antes de mandar: se cair no meio, melhor um lembrete a menos que
 *  dois. */
export async function remindTournamentReviews(
  db: Firestore,
  summaryDoc: QueryDocumentSnapshot,
  nowMs: number,
  notify: Notify,
): Promise<void> {
  const summary = summaryDoc.data();
  await summaryDoc.ref.update({reminderSentAt: Timestamp.fromMillis(nowMs)});
  const pending = await pendingInvites(db, summaryDoc.id);
  const closesAtMs = summary.closesAt instanceof Timestamp ? summary.closesAt.toMillis() : nowMs;
  await notifyAll(notify, pending.docs.map((doc) => reviewReminderNotification({
    uid: doc.ref.parent.parent?.id ?? "",
    tournamentId: summaryDoc.id,
    tournamentName: str(summary.tournamentName),
    closesAtMs,
  })).filter((n) => n.userId));
}

/** Fecha a janela: a nota congela (a callable já recusa desde `closesAt`), os convites pendentes
 *  expiram e quem gerencia recebe o resultado. */
export async function closeTournamentReviewWindow(
  db: Firestore,
  summaryDoc: QueryDocumentSnapshot,
  nowMs: number,
  notify: Notify,
): Promise<void> {
  const summary = summaryDoc.data();
  const tournamentId = summaryDoc.id;
  const now = Timestamp.fromMillis(nowMs);
  await summaryDoc.ref.update({status: "closed", closedAt: now, updatedAt: now});

  const pending = await pendingInvites(db, tournamentId);
  for (let i = 0; i < pending.docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const doc of pending.docs.slice(i, i + BATCH_LIMIT)) batch.update(doc.ref, {status: "expired"});
    await batch.commit();
  }

  const managers = await tournamentManagerUids(db, tournamentId);
  const count = typeof summary.count === "number" ? summary.count : 0;
  const average = typeof summary.average === "number" ? summary.average : null;
  await notifyAll(notify, managers.map((uid) => reviewClosedNotification({
    uid,
    tournamentId,
    tournamentName: str(summary.tournamentName),
    count,
    average,
  })));
}

/**
 * Uma execução do job: abre janelas novas e depois lembra/fecha as abertas. Cada torneio tem o
 * próprio try/catch: um torneio quebrado não segura os outros.
 */
export async function runTournamentReviewSweep(
  db: Firestore,
  nowMs: number,
  notify: Notify = deliverNotificationToUser,
  projectId: string = getFirebaseProjectId(),
): Promise<{opened: number; reminded: number; closed: number}> {
  const stats = {opened: 0, reminded: 0, closed: 0};
  if (!(await loadTournamentReviewsConfig(db)).enabled) return stats;

  const lookback = Timestamp.fromMillis(nowMs - REVIEW_LOOKBACK_DAYS * DAY_MS);
  const [completedSnap, endedSnap] = await Promise.all([
    db.collection("tournaments")
      .where("listingStatus", "==", "completed")
      .where("completedAt", ">=", lookback)
      .get(),
    db.collection("tournaments")
      .where("endAt", ">=", lookback)
      .where("endAt", "<=", Timestamp.fromMillis(nowMs - REVIEW_END_GRACE_HOURS * HOUR_MS))
      .get(),
  ]);
  const candidates = new Map<string, Record<string, unknown>>();
  for (const doc of [...completedSnap.docs, ...endedSnap.docs]) {
    const data = doc.data() as Record<string, unknown>;
    if (reviewCandidateReason(data, nowMs) != null) candidates.set(doc.id, data);
  }
  for (const [tournamentId, tournament] of candidates) {
    try {
      if (await openTournamentReviewWindow(db, tournamentId, tournament, nowMs, notify, projectId)) {
        stats.opened += 1;
      }
    } catch (error) {
      logger.error("tournamentReviewSweep: falha ao abrir janela", {tournamentId, error});
    }
  }

  const openSnap = await db.collection(TOURNAMENT_REVIEW_SUMMARIES_COLLECTION).where("status", "==", "open").get();
  for (const doc of openSnap.docs) {
    try {
      const action = reviewWindowAction(doc.data(), nowMs);
      if (action === "close") {
        await closeTournamentReviewWindow(db, doc, nowMs, notify);
        stats.closed += 1;
      } else if (action === "remind") {
        await remindTournamentReviews(db, doc, nowMs, notify);
        stats.reminded += 1;
      }
    } catch (error) {
      logger.error("tournamentReviewSweep: falha ao lembrar/fechar", {tournamentId: doc.id, error});
    }
  }
  return stats;
}

/**
 * 10:00 de São Paulo, todo dia. `now` é o horário AGENDADO (`scheduleTime`), não o relógio:
 * assim `opensAt` cai em 10:00 em ponto e o lembrete e o fechamento batem exatamente no 3º e no
 * 14º dia. Os secrets de Web Push são o que faz o push de fechamento chegar no portal do
 * organizador.
 */
export const tournamentReviewDailySweep = onSchedule(
  {
    schedule: "0 10 * * *",
    timeZone: EVENT_TIME_ZONE,
    timeoutSeconds: 540,
    secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
  },
  async (event) => {
    const scheduled = Date.parse(event.scheduleTime);
    const nowMs = Number.isFinite(scheduled) ? scheduled : Date.now();
    const stats = await runTournamentReviewSweep(getFirestore(), nowMs);
    logger.info("tournamentReviewDailySweep", stats);
  },
);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build && node --test lib/tournament-review-sweep.test.js`

Expected: 11 testes `pass`.

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add functions/src/tournament-review-sweep.ts functions/src/tournament-review-sweep.test.ts
git commit -m "feat(functions): job diário que abre, lembra e fecha a avaliação de torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Exportar as funções

**Files:**
- Modify: `functions/src/index.ts`, logo depois do bloco `export {submitFriendlyMatchReview, revealFriendlyMatchReviews} from "./friendly-match-review";` (~linha 407-410).

**Interfaces:**
- Consumes: `submitTournamentReview` (Task 7), `onTournamentReviewWritten` (Task 8), `onTournamentReviewCreatedAwardXp` (Task 9), `tournamentReviewDailySweep` (Task 10).

- [ ] **Step 1: Acrescentar os exports**

Depois do bloco de `./friendly-match-review`:

```ts
// Avaliação do torneio pelos atletas (spec 2026-10-01). O job sobe com a flag
// `appConfig/tournamentReviews.enabled` desligada — ver scripts/set-tournament-reviews-flag.js.
export {submitTournamentReview} from "./tournament-review-submit";
export {onTournamentReviewWritten} from "./tournament-review-derived";
export {onTournamentReviewCreatedAwardXp} from "./tournament-review-gamification";
export {tournamentReviewDailySweep} from "./tournament-review-sweep";
```

- [ ] **Step 2: Compilar e conferir que os 4 nomes saem no `lib/index.js`**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm run build && grep -c "submitTournamentReview\|onTournamentReviewWritten\|onTournamentReviewCreatedAwardXp\|tournamentReviewDailySweep" lib/index.js`

Expected: build sem erro; o `grep -c` imprime um número ≥ 4.

- [ ] **Step 3: Suíte inteira**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm test`

Expected: nenhum `fail`.

- [ ] **Step 4: Commit**

```bash
pwd && git branch --show-current
git add functions/src/index.ts
git commit -m "feat(functions): exporta as funções da avaliação de torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Rules (e saída de `category_feedbacks`)

**Files:**
- Modify: `firestore.rules`
- Create: `functions/test/tournament-reviews.rules.test.mjs`

**Interfaces:**
- Consumes: os caminhos e formatos dos Tasks 7, 8 e 10; as funções de rules `isAdmin()`, `isSuperAdmin()` e `canManageTournament(tournamentId)` (essa inclui dono, staff `manager` e `eventAdmin`).

- [ ] **Step 1: Escrever o teste que falha**

`functions/test/tournament-reviews.rules.test.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-tournament-reviews-test';
const OWNER = 'owner-uid';
const OTHER_ORG = 'other-org-uid';
const EVENT_ADMIN = 'event-admin-uid';
const ATHLETE = 'athlete-uid';
const OTHER_ATHLETE = 'other-athlete-uid';
const ADMIN = 'admin-uid';

const testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules } });

const as = (uid, claims) => testEnv.authenticatedContext(uid, claims).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

/** Toda escrita nestas coleções é da Cloud Function. A leitura de comentários anônimos pelo
 *  organizador só abre com 3+ avaliações (t-few tem 2, t-many tem 3). */
async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', 't-few'), { managerId: OWNER, name: 'Poucas' });
    await setDoc(doc(db, 'tournaments', 't-many'), { managerId: OWNER, name: 'Muitas' });
    await setDoc(doc(db, 'tournaments', 't-many', 'staff', EVENT_ADMIN), { role: 'eventAdmin', status: 'active' });
    await setDoc(doc(db, 'tournamentReviewSummaries', 't-few'), { tournamentId: 't-few', organizerId: OWNER, status: 'open', count: 2 });
    await setDoc(doc(db, 'tournamentReviewSummaries', 't-many'), { tournamentId: 't-many', organizerId: OWNER, status: 'open', count: 3 });
    await setDoc(doc(db, 'tournaments', 't-few', 'anonymousReviews', 'a1'), { overall: 2, aspects: {}, comment: 'Atrasou', shuffleKey: 0.1 });
    await setDoc(doc(db, 'tournaments', 't-many', 'anonymousReviews', 'a2'), { overall: 5, aspects: {}, comment: 'Ótimo', shuffleKey: 0.2 });
    await setDoc(doc(db, 'tournamentReviews', `t-many_${ATHLETE}`), { tournamentId: 't-many', organizerId: OWNER, uid: ATHLETE, overall: 5, anonId: 'a2' });
    await setDoc(doc(db, 'tournamentReviews', `t-many_${OTHER_ATHLETE}`), { tournamentId: 't-many', organizerId: OWNER, uid: OTHER_ATHLETE, overall: 4, anonId: 'a3' });
    await setDoc(doc(db, 'users', ATHLETE, 'tournamentReviewInvites', 't-many'), { tournamentId: 't-many', status: 'submitted' });
    await setDoc(doc(db, 'organizerReputation', OWNER), { organizerId: OWNER, reviewsCount: 5 });
  });
}

before(async () => {
  await testEnv.clearFirestore();
  await seed();
});

after(async () => {
  await testEnv.cleanup();
});

test('atleta lê o próprio convite (e lista os pendentes), mas não o de outra pessoa', async () => {
  const db = as(ATHLETE);
  await assertSucceeds(getDoc(doc(db, 'users', ATHLETE, 'tournamentReviewInvites', 't-many')));
  await assertSucceeds(getDocs(query(
    collection(db, 'users', ATHLETE, 'tournamentReviewInvites'),
    where('status', '==', 'pending'),
  )));
  await assertFails(getDoc(doc(as(OTHER_ATHLETE), 'users', ATHLETE, 'tournamentReviewInvites', 't-many')));
});

test('o cliente não grava em nenhuma das coleções da avaliação', async () => {
  const db = as(ATHLETE);
  await assertFails(setDoc(doc(db, 'users', ATHLETE, 'tournamentReviewInvites', 't-forjado'), { tournamentId: 't-forjado', status: 'pending' }));
  await assertFails(setDoc(doc(db, 'tournamentReviews', `t-many_${ATHLETE}`), { tournamentId: 't-many', uid: ATHLETE, overall: 1 }));
  await assertFails(setDoc(doc(db, 'tournamentReviewSummaries', 't-many'), { count: 99 }));
  await assertFails(setDoc(doc(db, 'organizerReputation', OWNER), { reviewsCount: 0 }));
  await assertFails(setDoc(doc(as(OWNER), 'tournaments', 't-many', 'anonymousReviews', 'fake'), { overall: 5 }));
  await assertFails(setDoc(doc(as(OWNER), 'tournamentReviewSummaries', 't-many'), { average: 5 }));
});

test('avaliação privada: o autor e o admin leem; o organizador e outro atleta não', async () => {
  await assertSucceeds(getDoc(doc(as(ATHLETE), 'tournamentReviews', `t-many_${ATHLETE}`)));
  await assertFails(getDoc(doc(as(ATHLETE), 'tournamentReviews', `t-many_${OTHER_ATHLETE}`)));
  await assertFails(getDoc(doc(as(OWNER), 'tournamentReviews', `t-many_${ATHLETE}`)));
  const admin = as(ADMIN, { roles: ['admin'] });
  await assertSucceeds(getDoc(doc(admin, 'tournamentReviews', `t-many_${ATHLETE}`)));
  await assertSucceeds(getDocs(query(collection(admin, 'tournamentReviews'), where('tournamentId', '==', 't-many'))));
});

test('comentários anônimos: quem gerencia lê só com 3+ avaliações', async () => {
  await assertSucceeds(getDocs(collection(as(OWNER), 'tournaments', 't-many', 'anonymousReviews')));
  await assertFails(getDocs(collection(as(OWNER), 'tournaments', 't-few', 'anonymousReviews')));
  await assertSucceeds(getDocs(collection(as(EVENT_ADMIN), 'tournaments', 't-many', 'anonymousReviews')));
});

test('comentários anônimos: organizador de outro torneio, atleta e anônimo não leem', async () => {
  await assertSucceeds(getDocs(collection(as(OWNER), 'tournaments', 't-many', 'anonymousReviews')));
  await assertFails(getDocs(collection(as(OTHER_ORG), 'tournaments', 't-many', 'anonymousReviews')));
  await assertFails(getDocs(collection(as(ATHLETE), 'tournaments', 't-many', 'anonymousReviews')));
  await assertFails(getDocs(collection(anon(), 'tournaments', 't-many', 'anonymousReviews')));
});

test('admin lê comentários anônimos mesmo abaixo de 3', async () => {
  await assertSucceeds(getDocs(collection(as(ADMIN, { roles: ['admin'] }), 'tournaments', 't-few', 'anonymousReviews')));
});

test('resumo e reputação são públicos, até sem login', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'tournamentReviewSummaries', 't-many')));
  await assertSucceeds(getDoc(doc(anon(), 'organizerReputation', OWNER)));
});

test('category_feedbacks (esqueleto órfão) não é mais acessível', async () => {
  const db = as(ATHLETE);
  await assertSucceeds(getDoc(doc(db, 'tournamentReviewSummaries', 't-many')));
  await assertFails(setDoc(
    doc(db, 'artifacts', 'app', 'public', 'data', 'category_feedbacks', 'f1'),
    { userId: ATHLETE, tournamentId: 't-many', categoryId: 'c1', isPrivate: false },
  ));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && firebase emulators:exec --only firestore --project nexago-rules-test "node --test test/tournament-reviews.rules.test.mjs"`

Expected:
- `fail` nos testes que esperam leitura liberada (convite, privado, anônimo, resumo, reputação), porque o catch-all nega tudo.
- `fail` no `category_feedbacks`, porque a criação pelo autor ainda é permitida.

- [ ] **Step 3: Implementar as rules**

Em `firestore.rules`:

**(a)** Apague o bloco inteiro que começa em `// Avaliações de categoria (feedback dos atletas)` e termina no `}` do `match /artifacts/{appId}/public/data/category_feedbacks/{feedbackId}` (~linhas 2436-2450). Ele vai do comentário até o `allow delete: if false;` seguido de `}`.

**(b)** Dentro de `match /tournaments/{tournamentId} { ... }`, logo depois do bloco `match /categoryCommunications/{commId} { ... }` (~linha 2167), acrescente:

```
      // Avaliação do torneio — cópia ANÔNIMA (sem uid, data, categoria), gravada pela
      // CF `onTournamentReviewWritten`. Quem gerencia só lê com 3+ avaliações: com
      // menos, o organizador adivinha quem escreveu. Quem garante o limite é esta
      // regra, não a tela. Admin lê sempre (suporte).
      match /anonymousReviews/{anonId} {
        allow read: if request.auth != null && (
          isAdmin() ||
          isSuperAdmin() ||
          (canManageTournament(tournamentId) &&
            exists(/databases/$(database)/documents/tournamentReviewSummaries/$(tournamentId)) &&
            get(/databases/$(database)/documents/tournamentReviewSummaries/$(tournamentId)).data.count >= 3)
        );
        allow write: if false;
      }
```

**(c)** Logo depois do `match /users/{userId}/tournamentStaff/{tournamentId} { ... }` (~linha 1905), acrescente:

```
    // Convite para avaliar o torneio — criado pelo job diário. É a única prova de
    // "posso avaliar e até quando"; o cliente nunca grava (senão forjaria o convite).
    match /users/{userId}/tournamentReviewInvites/{tournamentId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false;
    }
```

**(d)** Logo depois do `match /arena_reputation/{arenaId} { ... }` (~linha 2057), acrescente:

```
    // Avaliação do torneio pelos atletas (spec 2026-10-01). Toda escrita é da CF.
    // Privada: o autor e o admin leem. Doc inexistente nega a leitura — o cliente só
    // lê depois que o convite diz `submitted`.
    match /tournamentReviews/{reviewId} {
      allow read: if request.auth != null && (
        resource.data.uid == request.auth.uid ||
        isAdmin() ||
        isSuperAdmin()
      );
      allow write: if false;
    }

    // Resumo por torneio e reputação do organizador: públicos (o site lê sem login).
    // Fora do doc do torneio de propósito: o organizador grava em `tournaments/{id}`.
    match /tournamentReviewSummaries/{tournamentId} {
      allow read: if true;
      allow write: if false;
    }

    match /organizerReputation/{organizerId} {
      allow read: if true;
      allow write: if false;
    }
```

- [ ] **Step 4: Rodar e ver passar; rodar a suíte de rules inteira**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && firebase emulators:exec --only firestore --project nexago-rules-test "node --test test/tournament-reviews.rules.test.mjs" && npm run test:rules`

Expected: os 8 testes novos com `pass`; a suíte `test:rules` inteira sem `fail`.

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add firestore.rules functions/test/tournament-reviews.rules.test.mjs
git commit -m "feat(rules): coleções da avaliação de torneio; remove category_feedbacks órfão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Índices

**Files:**
- Modify: `firestore.indexes.json`

**Interfaces:**
- Consumes: as consultas do Task 10.
  - `tournaments where listingStatus == ... && completedAt >= ...`
  - `collectionGroup(tournamentReviewInvites) where tournamentId == ... && status == ...`

- [ ] **Step 1: Aplicar a mudança com script, para não errar vírgula à mão**

Run, a partir do worktree:

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && python3 - <<'EOF'
import json
path = "firestore.indexes.json"
with open(path, encoding="utf-8") as f:
    data = json.load(f)
before = len(data["indexes"])
data["indexes"] = [i for i in data["indexes"] if i.get("collectionGroup") != "category_feedbacks"]
new = [
    {"collectionGroup": "tournaments", "queryScope": "COLLECTION", "fields": [
        {"fieldPath": "listingStatus", "order": "ASCENDING"},
        {"fieldPath": "completedAt", "order": "ASCENDING"}]},
    {"collectionGroup": "tournamentReviewInvites", "queryScope": "COLLECTION_GROUP", "fields": [
        {"fieldPath": "tournamentId", "order": "ASCENDING"},
        {"fieldPath": "status", "order": "ASCENDING"}]},
]
def key(i):
    return (i["collectionGroup"], i["queryScope"], tuple((f["fieldPath"], f.get("order")) for f in i["fields"]))
existing = {key(i) for i in data["indexes"]}
for idx in new:
    if key(idx) not in existing:
        data["indexes"].append(idx)
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")
print(before, "->", len(data["indexes"]))
EOF
```

Expected: imprime `89 -> 88` (−3 de `category_feedbacks`, +2 novos). Se um dos novos já existisse, o segundo número sobe 1 a menos.

- [ ] **Step 2: Conferir que o diff só tem o que deveria**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && git diff --stat firestore.indexes.json && git diff firestore.indexes.json | grep '^[-+] *"collectionGroup"'`

Expected:
- 3 linhas `-      "collectionGroup": "category_feedbacks",`.
- `+` para `tournaments` e `tournamentReviewInvites`.
- Nenhum outro `collectionGroup` alterado.
- Se o `json.dump` reformatou o arquivo inteiro (diff com centenas de linhas trocadas só de formatação), desfaça com `git checkout firestore.indexes.json` e faça a mesma mudança à mão.

- [ ] **Step 3: Commit**

```bash
pwd && git branch --show-current
git add firestore.indexes.json
git commit -m "feat(firestore): índices do job de avaliação; remove os de category_feedbacks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Portal do organizador abre `webUrl`

O push de fechamento leva `url` para o app (rota que o build antigo conhece) e `webUrl` para o portal. O portal navega por `data.url` em dois lugares: o clique no push (`push-sw.js`) e o inbox (`notifications-repository.ts`).

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/notifications-repository.ts:28-61`
- Create: `frontend/projects/organizer/src/app/painel/data/notifications-repository.spec.ts`
- Modify: `frontend/projects/organizer/public/push-sw.js:27-29`

**Interfaces:**
- Produces: `notificationTargetUrl(data: Record<string, unknown> | undefined): string | null`.

- [ ] **Step 1: Escrever o teste que falha**

`frontend/projects/organizer/src/app/painel/data/notifications-repository.spec.ts`:

```ts
import { notificationTargetUrl } from './notifications-repository';

/** O mesmo push vai pro app e pro portal: `url` é rota do app (o build antigo usa a url antes
 *  do tipo), `webUrl` é rota do portal. Notificações antigas só têm `url`. */
describe('notificationTargetUrl', () => {
  it('prefere webUrl, que é a rota do portal', () => {
    expect(notificationTargetUrl({ url: '/organizer/tournaments/t1', webUrl: '/painel/eventos/t1/avaliacoes' }))
      .toBe('/painel/eventos/t1/avaliacoes');
  });

  it('cai na url quando não há webUrl (todas as notificações antigas)', () => {
    expect(notificationTargetUrl({ url: '/painel/eventos/t1/inscricoes' })).toBe('/painel/eventos/t1/inscricoes');
  });

  it('webUrl vazio não conta; sem destino nenhum devolve null', () => {
    expect(notificationTargetUrl({ webUrl: '  ', url: '/painel' })).toBe('/painel');
    expect(notificationTargetUrl(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='projects/organizer/src/app/painel/data/notifications-repository.spec.ts'`

Expected: erro de compilação `has no exported member 'notificationTargetUrl'`.

- [ ] **Step 3: Implementar**

Em `notifications-repository.ts`, troque o comentário do campo `url` da interface por:

```ts
  /** Deep link opcional: `data.webUrl` (rota do portal) ou, sem ele, `data.url`. Ex.:
   *  `/painel/eventos/{id}/inscricoes?registrationId=...`. */
  url: string | null;
```

Logo depois da função `str`, acrescente:

```ts
/** Destino do toque na notificação. `webUrl` existe quando o mesmo push também vai pro app, que
 *  usa `url` com uma rota dele (ex.: `tournament_review_closed`). */
export function notificationTargetUrl(data: Record<string, unknown> | undefined): string | null {
  return str(data?.['webUrl']) ?? str(data?.['url']);
}
```

E em `fromDoc` troque `url: str(notifData?.['url']),` por:

```ts
    url: notificationTargetUrl(notifData),
```

Em `frontend/projects/organizer/public/push-sw.js`, no `notificationclick`, troque:

```js
  const url = event.notification.data?.url;
```

por:

```js
  // `webUrl` é a rota do portal quando o mesmo push também vai pro app (que usa `url`).
  const data = event.notification.data ?? {};
  const url = data.webUrl || data.url;
```

- [ ] **Step 4: Rodar o spec e o build de produção do organizador**

O `ng test` fica verde mesmo com o build de produção quebrado, porque o karma não aplica budgets.

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='projects/organizer/src/app/painel/data/notifications-repository.spec.ts' && npx ng build organizer --configuration production`

Expected: 3 specs `SUCCESS`; build de produção sem erro.

- [ ] **Step 5: Commit**

```bash
pwd && git branch --show-current
git add frontend/projects/organizer/src/app/painel/data/notifications-repository.ts frontend/projects/organizer/src/app/painel/data/notifications-repository.spec.ts frontend/projects/organizer/public/push-sw.js
git commit -m "feat(organizer): push e inbox abrem webUrl quando a notificação traz rota do app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Script da flag

**Files:**
- Create: `functions/scripts/set-tournament-reviews-flag.js`

- [ ] **Step 1: Criar o script (molde: `functions/scripts/set-min-app-version.js`)**

```js
/* eslint-disable */
/**
 * Liga/desliga a avaliação de torneio pelos atletas — `appConfig/tournamentReviews.enabled`,
 * lido pelo job `tournamentReviewDailySweep` (functions/src/tournament-review-config.ts).
 * Doc ausente = desligado.
 *
 * LIGUE SÓ quando o build do app com o formulário de avaliação estiver live na loja (de
 * preferência junto com subir o minBuildNumber — scripts/set-min-app-version.js). Senão o
 * atleta recebe "avalie o torneio" num app sem botão de avaliar.
 *
 * Ao ligar, o job do dia seguinte abre janela só para torneios encerrados nos últimos 3 dias.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *
 * Uso (na pasta functions/):
 *   node scripts/set-tournament-reviews-flag.js --project <projectId> --show
 *   node scripts/set-tournament-reviews-flag.js --project <projectId> --enable          # dry-run
 *   node scripts/set-tournament-reviews-flag.js --project <projectId> --enable --yes
 *   node scripts/set-tournament-reviews-flag.js --project <projectId> --disable --yes
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const SHOW_ONLY = process.argv.includes("--show");
const ENABLE = process.argv.includes("--enable");
const DISABLE = process.argv.includes("--disable");
const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;

if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}
if (!SHOW_ONLY && ENABLE === DISABLE) {
  console.error("Informe exatamente um: --enable ou --disable (ou use --show).");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const DOC_PATH = "appConfig/tournamentReviews";

async function run() {
  const snap = await db.doc(DOC_PATH).get();
  const current = snap.exists && snap.data().enabled === true;
  console.log(`\n${DOC_PATH} (${projectId}): ${current ? "LIGADO" : "desligado"}` +
    (snap.exists ? "" : " (doc não existe)"));
  if (SHOW_ONLY) return;

  const next = ENABLE;
  if (next === current) {
    console.log("Nada a fazer.");
    return;
  }
  console.log(`Vai gravar: enabled = ${next}`);
  if (!APPLY) {
    console.log("\nDRY-RUN — rode de novo com --yes para gravar.");
    return;
  }
  await db.doc(DOC_PATH).set(
    {enabled: next, updatedAt: admin.firestore.FieldValue.serverTimestamp()},
    {merge: true},
  );
  console.log("Gravado.");
}

run().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Conferir sintaxe e a validação de argumentos (sem tocar em projeto nenhum)**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && node --check scripts/set-tournament-reviews-flag.js && node scripts/set-tournament-reviews-flag.js --project x; echo "exit=$?"`

Expected: o `--check` não imprime nada; a segunda chamada imprime "Informe exatamente um: --enable ou --disable (ou use --show)." e `exit=1`. Ela sai antes de inicializar o Admin SDK.

- [ ] **Step 3: Commit**

```bash
pwd && git branch --show-current
git add functions/scripts/set-tournament-reviews-flag.js
git commit -m "chore(functions): script para ligar a avaliação de torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Verificação final e PR

- [ ] **Step 1: Suítes**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/functions && npm test && npm run test:rules`

Expected: nenhum `fail` nas duas.

- [ ] **Step 2: Nada fora do worktree e nada sobrando**

Run:

```bash
git -C /Users/silviodionizio/Documents/projects/volley/nexago status --short | head
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && git status --short && git log --oneline main..HEAD
```

Expected:
- O checkout principal não ganhou nenhum arquivo deste trabalho. Mudanças de outras sessões podem aparecer: confira que nenhuma é daqui.
- O worktree está limpo.
- O log mostra os commits dos Tasks 1–15 mais os da spec e do plano.

- [ ] **Step 3: Atualizar com a main e abrir o PR**

Atualize a branch com a ferramenta `sync_with_base_branch` (se o worktree for do app) ou com `git merge origin/main`. Rode o Step 1 de novo se entrou algo. Depois:

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422
git push -u origin claude/tournament-athlete-rating-361422
gh pr create --title "Avaliação do torneio pelos atletas — fase 1 (backend, flag desligada)" --body "$(cat <<'EOF'
## O que entra
- Coleções, rules e índices da avaliação de torneio (spec `docs/superpowers/specs/2026-10-01-tournament-athlete-reviews-design.md`).
- `tournamentReviewDailySweep`: abre, lembra (3º dia) e fecha (14º dia) as janelas, sempre às 10h de SP.
- `submitTournamentReview`: callable de envio/edição.
- `onTournamentReviewWritten`: cópia anônima, resumo do torneio e reputação do organizador.
- `onTournamentReviewCreatedAwardXp`: +10 XP, uma vez por torneio.
- Portal do organizador: push e inbox abrem `webUrl` quando a notificação também vai pro app.
- Sai o esqueleto órfão `category_feedbacks` (rules e 3 índices).

## Flag desligada
O job lê `appConfig/tournamentReviews.enabled`, e o doc não existe: nada é enviado. Ligar só quando o app com o formulário (fase 2) estiver live na loja: `node scripts/set-tournament-reviews-flag.js --project volley-track-dev-4596c --enable --yes`.

## Deploy (depois do merge, a partir da main atualizada)
1. `firebase deploy --only firestore:indexes` — vai perguntar se apaga os 3 índices de `category_feedbacks`; pode apagar.
2. `firebase deploy --only firestore:rules`
3. `firebase deploy --only functions:submitTournamentReview,functions:onTournamentReviewWritten,functions:onTournamentReviewCreatedAwardXp,functions:tournamentReviewDailySweep`
4. Hosting do portal do organizador (push-sw.js + inbox).

## Testes
- `npm test` (functions) e `npm run test:rules` verdes.
- Spec do organizador + build de produção do organizador.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Deploy — só com aprovação explícita do dono**

Não faça deploy por conta própria. Mostre ao dono a lista do PR (índices → rules → 4 functions → hosting do organizador) e espere o "pode". Faça o deploy a partir da `main` atualizada depois do merge, nunca desta branch: deploy de branch atrasada reverte o que já está na main. Não ligue a flag nesta fase.

---

## Próximos planos (cada um escrito quando a fase anterior for mergeada)

- **Fase 2: atleta (app + portal).**
  - Card na Home, botão no detalhe e na campanha.
  - Formulário em `/torneios/:id/avaliar`.
  - Tipos novos no inbox.
  - `resolveNotificationRoute` checa o tipo antes da url.
  - Paridade da lista de aspectos.
- **Fase 3: organizador.** Aba "Avaliações", KPI na visão geral, "Reputação" no nível global, página no app do organizador.
- **Fase 4: exibição pública** no app, portal e site.
- **Fase 5: backoffice.**
- **Fase 6: ligar a flag** (script do Task 15) depois do build da fase 2 na loja.
