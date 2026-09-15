# Identidade única da dupla — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fazer a dupla ter um único documento em `teams`, reaproveitado a cada inscrição nova, e fundir os 9 pares hoje duplicados no projeto dev.

**Architecture:** um helper de transação (`resolvePairTeamTx`) passa a resolver a equipe de qualquer dupla nos 4 caminhos de criação do servidor: acha o doc do par pelo campo novo `pairKey`, revalida pelos player ids do próprio doc, e só cria doc novo quando o par ainda não tem equipe ou já tem inscrição naquele mesmo torneio. Um backfill grava `pairKey` no que já existe e um script de fusão colapsa os duplicados repontando 8 coleções.

**Tech Stack:** TypeScript (Cloud Functions v2, firebase-admin 13), `node:test` sobre o `lib/` compilado, scripts Node puros em `functions/scripts/`, Firestore rules.

**Spec:** `docs/superpowers/specs/2026-09-15-identidade-unica-da-dupla-design.md`

## Global Constraints

- Português nas strings/UI e nos comentários; inglês nos identificadores de código.
- Nenhum índice composto novo: só igualdade em campo único (`pairKey`, `teamId`), coberta pelo índice automático do Firestore.
- Equipe nomeada (`teamName` preenchido ou `teamSize >= 3`) **nunca** deduplica e **nunca** recebe `pairKey`.
- Reaproveitar equipe **nunca** reescreve `player1Id`/`player2Id`.
- Projeto dev: `volley-track-dev-4596c`. Projeto prod: `volley-track-2dd3b` (sem duplicados — só backfill e deploy).
- Todo script novo é `--dry-run` por padrão; só escreve com `--apply`.
- Testes rodam de `functions/`: `npm test` (compila e roda `node --test`).

---

### Task 0: Auditor da integridade inscrição ↔ equipe

**Exigência do dono: nenhuma inscrição que já existe pode quebrar.** Este auditor é a régua disso
— roda antes de tudo para tirar a linha de base e de novo depois de cada `--apply`. Vem primeiro
porque sem a linha de base não há como provar que nada quebrou.

Uma inscrição com `teamId` apontando para doc inexistente some das listagens e passa a ser barrada
pela regra `inscriptionParticipantUidsMatchTeam` em qualquer update do cliente.

**Files:**
- Create: `functions/scripts/check-registration-team-integrity.js`

**Interfaces:**
- Consumes: nada.
- Produces: saída de console e código de saída (0 = íntegro, 1 = há quebradas). Consumido pela
  Task 9 como portão de cada etapa.

- [ ] **Step 1: Escrever o auditor**

Criar `functions/scripts/check-registration-team-integrity.js`:

```js
/* eslint-disable */
/**
 * Auditor da integridade inscrição ↔ equipe: toda inscrição com `teamId` tem de
 * resolver para um doc de equipe existente cujos integrantes batam com
 * `participantUids`.
 *
 * POR QUE existe: a entrega da identidade única da dupla reponta o `teamId` de
 * inscrições que JÁ EXISTEM. Uma inscrição apontando para equipe inexistente
 * some das listagens e passa a ser barrada pela regra
 * `inscriptionParticipantUidsMatchTeam` em qualquer update do cliente — quebra
 * silenciosa, que nenhum teste de unidade pega.
 *
 * Uso: rodar ANTES da migração (linha de base) e DEPOIS de cada --apply. O
 * conjunto de quebradas não pode crescer.
 *
 *   node scripts/check-registration-team-integrity.js --project volley-track-dev-4596c
 *
 * Só leitura. Sai com código 1 se achar inscrição quebrada.
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error("Informe --project <projectId>");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const base = `artifacts/${projectId}/public/data`;

/**
 * Cópia de `extractTeamMemberUids` (functions/src/tournament-team-category.ts).
 * `memberUids` VENCE: quando ele traz alguém, `player1Id`/`player2Id` nem são
 * lidos — são espelho legado e podem estar defasados. Unir os dois alargaria o
 * elenco aceito e esconderia justamente a quebra que este script existe para
 * achar.
 */
function teamMemberUids(team) {
  if (!team) return [];
  const out = [];
  const push = (raw) => {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (id && !out.includes(id)) out.push(id);
  };
  if (Array.isArray(team.memberUids)) {
    for (const raw of team.memberUids) push(raw);
    if (out.length > 0) return out;
  }
  push(team.player1Id);
  push(team.player2Id);
  return out;
}

(async () => {
  const [inscriptions, teams] = await Promise.all([
    db.collection(`${base}/inscriptions`).get(),
    db.collection(`${base}/teams`).get(),
  ]);
  const teamById = new Map(teams.docs.map((d) => [d.id, d.data()]));

  const missingTeam = [];
  const memberMismatch = [];
  let semTeamId = 0;

  for (const doc of inscriptions.docs) {
    const data = doc.data();
    const teamId = String(data.teamId ?? "").trim();
    if (!teamId) {
      semTeamId += 1;
      continue;
    }
    const team = teamById.get(teamId);
    if (!team) {
      missingTeam.push(`${doc.id} -> teams/${teamId} (INEXISTENTE)`);
      continue;
    }
    const participants = Array.isArray(data.participantUids) ?
      data.participantUids.map((p) => String(p).trim()).filter(Boolean) :
      [];
    if (participants.length === 0) continue;
    const members = teamMemberUids(team);
    const orphan = participants.filter((uid) => !members.includes(uid));
    if (orphan.length > 0) {
      memberMismatch.push(
        `${doc.id} -> teams/${teamId}: participante(s) fora do elenco: ${orphan.join(", ")}`,
      );
    }
  }

  console.log(`inscricoes=${inscriptions.size} equipes=${teams.size} sem_teamId=${semTeamId}`);
  console.log(`equipe inexistente: ${missingTeam.length}`);
  missingTeam.forEach((line) => console.log(`  ${line}`));
  console.log(`elenco divergente: ${memberMismatch.length}`);
  memberMismatch.forEach((line) => console.log(`  ${line}`));

  const broken = missingTeam.length + memberMismatch.length;
  if (broken > 0) {
    console.error(`\nQUEBRADAS: ${broken}`);
    process.exit(1);
  }
  console.log("\nintegridade OK.");
})().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Rodar no dev e guardar a linha de base**

```bash
node scripts/check-registration-team-integrity.js --project volley-track-dev-4596c
```

Anotar os números da saída (`equipe inexistente` e `elenco divergente`). **Esta é a linha de
base.** Em 15/09 os dois projetos estavam em `0`/`0` (`integridade OK`), então o portão da entrega
é **zero quebradas**, não "não pode crescer". Se uma execução futura encontrar quebrada ANTES da
migração, ela é pré-existente e vira a linha de base daquele dia — mas registre o caso, porque
inscrição órfã é sintoma de outro defeito, não ruído.

- [ ] **Step 3: Rodar no prod**

```bash
node scripts/check-registration-team-integrity.js --project volley-track-2dd3b
```

Anotar do mesmo jeito.

- [ ] **Step 4: Commit**

```bash
git add functions/scripts/check-registration-team-integrity.js
git commit -m "feat: auditor da integridade inscrição x equipe"
```

---

### Task 1: `FakeFirestore` suporta query e update dentro da transação

O helper lê por query dentro da transação e atualiza doc. O fake de teste hoje só sabe `tx.get(ref)` e `tx.set` — sem isso nenhum teste da Task 2 consegue rodar.

**Files:**
- Modify: `functions/src/fake-firestore.test-helper.ts` (método `runTransaction`, no fim do arquivo)

**Interfaces:**
- Consumes: nada.
- Produces: `tx.get(query)` devolve `{docs, empty, size}`; `tx.get(ref)` segue devolvendo snapshot; `tx.update(ref, data)` faz merge; `tx.delete(ref)` remove. Usado por toda a Task 2.

- [ ] **Step 1: Escrever o teste que falha**

Criar `functions/src/fake-firestore-tx.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {FakeFirestore} from "./fake-firestore.test-helper";

describe("FakeFirestore.runTransaction", () => {
  it("tx.get aceita query além de doc ref", async () => {
    const db = new FakeFirestore();
    db.seedDoc("teams/t1", {pairKey: "a:b"});
    db.seedDoc("teams/t2", {pairKey: "c:d"});

    const found = await db.runTransaction(async (tx) => {
      const t = tx as {
        get: (q: unknown) => Promise<{docs: Array<{id: string}>}>;
      };
      const snap = await t.get(db.collection("teams").where("pairKey", "==", "a:b"));
      return snap.docs.map((d) => d.id);
    });

    assert.deepEqual(found, ["t1"]);
  });

  it("tx.update faz merge e tx.delete remove", async () => {
    const db = new FakeFirestore();
    db.seedDoc("teams/t1", {player1Id: "a", player2Id: "b"});
    db.seedDoc("teams/t2", {player1Id: "c"});

    await db.runTransaction(async (tx) => {
      const t = tx as {
        update: (ref: unknown, data: Record<string, unknown>) => void;
        delete: (ref: unknown) => void;
      };
      t.update(db.doc("teams/t1"), {pairKey: "a:b"});
      t.delete(db.doc("teams/t2"));
    });

    assert.deepEqual(db.store.get("teams/t1"), {
      player1Id: "a",
      player2Id: "b",
      pairKey: "a:b",
    });
    assert.equal(db.store.has("teams/t2"), false);
  });

  it("tx.update em doc ausente é erro, não upsert", async () => {
    const db = new FakeFirestore();

    await assert.rejects(
      db.runTransaction(async (tx) => {
        const t = tx as {
          update: (ref: unknown, data: Record<string, unknown>) => void;
        };
        t.update(db.doc("teams/nao-existe"), {pairKey: "a:b"});
      }),
      /update em doc ausente/,
    );
    assert.equal(db.store.has("teams/nao-existe"), false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar de `functions/`:

```bash
npm test 2>&1 | grep -A 5 "fake-firestore-tx"
```

Esperado: FAIL — `t.get is not a function` ou o retorno da query vindo como snapshot de doc inexistente, e `t.update is not a function`.

- [ ] **Step 3: Implementar**

Em `functions/src/fake-firestore.test-helper.ts`, trocar o corpo de `runTransaction` por:

```ts
  async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const self = this;
    // `Transaction.get` do Admin SDK aceita DocumentReference OU Query. O que
    // separa os dois aqui é o `path`: só a ref de documento tem.
    const isDocRef = (target: unknown): target is {path: string} =>
      typeof (target as {path?: unknown})?.path === "string";
    const tx = {
      get: async (target: unknown) => {
        if (isDocRef(target)) return self.snapshotOf(target.path);
        return (target as {get: () => Promise<unknown>}).get();
      },
      set: (ref: {path: string}, data: DocData, opts?: {merge?: boolean}) => {
        self.write(ref.path, data, opts);
      },
      update: (ref: {path: string}, data: DocData) => {
        // Espelha `ref.update` desta mesma classe e o Admin SDK de verdade:
        // update em doc ausente é ERRO, não upsert. Um fake permissivo aqui
        // deixaria passar teste verde sobre código que o Firestore real
        // recusaria — exatamente o que um dublê de transação existe pra pegar.
        if (!self.store.has(ref.path)) {
          throw new Error(`update em doc ausente: ${ref.path}`);
        }
        self.write(ref.path, data, {merge: true});
      },
      delete: (ref: {path: string}) => {
        self.store.delete(ref.path);
      },
    };
    return fn(tx);
  }
```

`snapshotOf` e `write` são privados da classe — como o novo corpo continua dentro dela, seguem acessíveis.

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```

Esperado: os 2 testes novos passam **e nenhum teste existente quebra** (o `tx.get(ref)` antigo continua entrando pelo ramo `isDocRef`).

- [ ] **Step 5: Commit**

```bash
git add functions/src/fake-firestore.test-helper.ts functions/src/fake-firestore-tx.test.ts
git commit -m "test: FakeFirestore aceita query, update e delete na transação"
```

---

### Task 2: O helper `resolvePairTeamTx`

O coração da entrega: dado um par e um torneio, devolve a ref da equipe — reaproveitada ou nova.

**Files:**
- Create: `functions/src/tournament-pair-team.ts`
- Create: `functions/src/tournament-pair-team.test.ts`

**Interfaces:**
- Consumes: `buildPairKey(uidA, uidB)` de `./tournament-pair-uniqueness` (já existe; UIDs ordenados juntados por `:`, string vazia quando o par é inválido). `tx.get(query)` da Task 1.
- Produces:
  - `isPairTeamDoc(team: Record<string, unknown> | null | undefined): boolean`
  - `pickPairTeamId(candidates: PairTeamCandidate[]): string` onde `PairTeamCandidate = {id: string; createdAtMs: number}`
  - `resolvePairTeamTx(tx, params): Promise<PairTeamResolution>` com
    `params = {teamsRef: CollectionReference; inscriptionsRef: CollectionReference; tournamentId: string; player1Id: string; player2Id: string}`
    e `PairTeamResolution = {ref: DocumentReference; teamId: string; reused: boolean}`.
  As Tasks 4 e 5 chamam só `resolvePairTeamTx`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `functions/src/tournament-pair-team.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  isPairTeamDoc,
  pickPairTeamId,
  resolvePairTeamTx,
} from "./tournament-pair-team";

const TEAMS = "teams";
const INSCRIPTIONS = "inscriptions";

function ts(iso: string): Timestamp {
  return Timestamp.fromDate(new Date(iso));
}

async function resolve(
  db: FakeFirestore,
  opts: {tournamentId: string; player1Id: string; player2Id: string},
) {
  return db.runTransaction(async (tx) =>
    resolvePairTeamTx(tx as never, {
      teamsRef: db.collection(TEAMS) as never,
      inscriptionsRef: db.collection(INSCRIPTIONS) as never,
      tournamentId: opts.tournamentId,
      player1Id: opts.player1Id,
      player2Id: opts.player2Id,
    }),
  );
}

describe("isPairTeamDoc", () => {
  it("dupla sem nome é par", () => {
    assert.equal(isPairTeamDoc({player1Id: "a", player2Id: "b"}), true);
  });

  it("equipe nomeada e trio+ não são par", () => {
    assert.equal(isPairTeamDoc({teamName: "Os Tubarões"}), false);
    assert.equal(isPairTeamDoc({teamSize: 3}), false);
    assert.equal(isPairTeamDoc(null), false);
  });
});

describe("pickPairTeamId", () => {
  it("o mais antigo vence", () => {
    assert.equal(
      pickPairTeamId([
        {id: "novo", createdAtMs: 200},
        {id: "velho", createdAtMs: 100},
      ]),
      "velho",
    );
  });

  it("empate de data desempata pelo id, para ser determinístico", () => {
    assert.equal(
      pickPairTeamId([
        {id: "b", createdAtMs: 100},
        {id: "a", createdAtMs: 100},
      ]),
      "a",
    );
  });

  it("sem candidato devolve vazio", () => {
    assert.equal(pickPairTeamId([]), "");
  });
});

describe("resolvePairTeamTx", () => {
  it("par sem equipe nenhuma ganha doc novo com pairKey", async () => {
    const db = new FakeFirestore();

    const out = await resolve(db, {
      tournamentId: "T1",
      player1Id: "uid-a",
      player2Id: "uid-b",
    });

    assert.equal(out.reused, false);
    const team = db.store.get(`${TEAMS}/${out.teamId}`)!;
    assert.equal(team.pairKey, "uid-a:uid-b");
    assert.equal(team.player1Id, "uid-a");
    assert.equal(team.player2Id, "uid-b");
  });

  it("reaproveita o doc do par em OUTRO torneio", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/time-antigo`, {
      player1Id: "uid-a",
      player2Id: "uid-b",
      pairKey: "uid-a:uid-b",
      createdAt: ts("2026-09-01T00:00:00Z"),
    });
    db.seedDoc(`${INSCRIPTIONS}/insc-1`, {teamId: "time-antigo", tournamentId: "T1"});

    const out = await resolve(db, {
      tournamentId: "T2",
      player1Id: "uid-a",
      player2Id: "uid-b",
    });

    assert.equal(out.reused, true);
    assert.equal(out.teamId, "time-antigo");
  });

  it("reaproveita mesmo com os papéis invertidos, sem trocar os player ids", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/time-antigo`, {
      player1Id: "uid-a",
      player2Id: "uid-b",
      pairKey: "uid-a:uid-b",
      createdAt: ts("2026-09-01T00:00:00Z"),
    });

    const out = await resolve(db, {
      tournamentId: "T2",
      player1Id: "uid-b",
      player2Id: "uid-a",
    });

    assert.equal(out.teamId, "time-antigo");
    const team = db.store.get(`${TEAMS}/time-antigo`)!;
    assert.equal(team.player1Id, "uid-a");
    assert.equal(team.player2Id, "uid-b");
  });

  it("segunda categoria do MESMO torneio ganha doc próprio", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/time-antigo`, {
      player1Id: "uid-a",
      player2Id: "uid-b",
      pairKey: "uid-a:uid-b",
      createdAt: ts("2026-09-01T00:00:00Z"),
    });
    db.seedDoc(`${INSCRIPTIONS}/insc-1`, {teamId: "time-antigo", tournamentId: "T1"});

    const out = await resolve(db, {
      tournamentId: "T1",
      player1Id: "uid-a",
      player2Id: "uid-b",
    });

    assert.equal(out.reused, false);
    assert.notEqual(out.teamId, "time-antigo");
    assert.equal(db.store.get(`${TEAMS}/${out.teamId}`)!.pairKey, "uid-a:uid-b");
  });

  it("diante de dois docs do mesmo par, escolhe o mais antigo", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/velho`, {
      player1Id: "uid-a",
      player2Id: "uid-b",
      pairKey: "uid-a:uid-b",
      createdAt: ts("2026-09-01T00:00:00Z"),
    });
    db.seedDoc(`${TEAMS}/novo`, {
      player1Id: "uid-a",
      player2Id: "uid-b",
      pairKey: "uid-a:uid-b",
      createdAt: ts("2026-09-04T00:00:00Z"),
    });

    const out = await resolve(db, {
      tournamentId: "T9",
      player1Id: "uid-a",
      player2Id: "uid-b",
    });

    assert.equal(out.teamId, "velho");
  });

  it("ignora equipe nomeada que carregue pairKey", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/nomeada`, {
      player1Id: "uid-a",
      player2Id: "uid-b",
      teamName: "Os Tubarões",
      teamSize: 4,
      pairKey: "uid-a:uid-b",
      createdAt: ts("2026-09-01T00:00:00Z"),
    });

    const out = await resolve(db, {
      tournamentId: "T2",
      player1Id: "uid-a",
      player2Id: "uid-b",
    });

    assert.equal(out.reused, false);
    assert.notEqual(out.teamId, "nomeada");
  });

  it("pairKey mentiroso não sequestra a equipe: revalida pelos player ids", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/impostor`, {
      player1Id: "uid-x",
      player2Id: "uid-y",
      pairKey: "uid-a:uid-b",
      createdAt: ts("2026-09-01T00:00:00Z"),
    });

    const out = await resolve(db, {
      tournamentId: "T2",
      player1Id: "uid-a",
      player2Id: "uid-b",
    });

    assert.equal(out.reused, false);
    assert.notEqual(out.teamId, "impostor");
  });

  it("par inválido (mesmo uid dos dois lados) não deduplica", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/qualquer`, {
      player1Id: "uid-a",
      player2Id: "uid-a",
      createdAt: ts("2026-09-01T00:00:00Z"),
    });

    const out = await resolve(db, {
      tournamentId: "T2",
      player1Id: "uid-a",
      player2Id: "uid-a",
    });

    assert.equal(out.reused, false);
    assert.equal(db.store.get(`${TEAMS}/${out.teamId}`)!.pairKey, undefined);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test 2>&1 | grep -B 2 -A 5 "tournament-pair-team"
```

Esperado: FAIL na compilação — `Cannot find module './tournament-pair-team'`.

- [ ] **Step 3: Implementar**

Criar `functions/src/tournament-pair-team.ts`:

```ts
/**
 * Identidade da dupla: um doc de equipe por par, reaproveitado a cada torneio.
 *
 * Antes, todo caminho de criação escrevia `{player1Id, player2Id, createdAt}`
 * novo — a mesma dupla em dois torneios virava duas identidades, e como
 * `teamRankings` é chaveado pelo id da equipe, o par aparecia duas vezes no
 * ranking com metade da história em cada entrada.
 *
 * A exceção é deliberada: o bloqueio de inscrição é por CATEGORIA, então o par
 * pode entrar em duas categorias do mesmo torneio. Ali nasce doc próprio, para
 * preservar "um teamId = uma chave" — invariante que os leitores de campanha e
 * jornada assumem ao filtrar partida por equipe sem olhar categoria.
 *
 * Equipe nomeada (trio/quarteto/quinteto) nunca passa por aqui: ela é escopada
 * ao torneio de propósito, com nome escolhido pelo capitão.
 *
 * Ver `docs/superpowers/specs/2026-09-15-identidade-unica-da-dupla-design.md`.
 */

import {
  FieldValue,
  type CollectionReference,
  type DocumentReference,
  type Transaction,
} from "firebase-admin/firestore";
import {buildPairKey} from "./tournament-pair-uniqueness";

export interface PairTeamCandidate {
  id: string;
  createdAtMs: number;
}

export interface PairTeamResolution {
  ref: DocumentReference;
  teamId: string;
  reused: boolean;
}

/**
 * Doc de equipe que representa uma DUPLA. Nome preenchido ou elenco de 3+ é
 * equipe nomeada e nunca deduplica.
 */
export function isPairTeamDoc(
  team: Record<string, unknown> | null | undefined,
): boolean {
  if (!team) return false;
  const name = typeof team.teamName === "string" ? team.teamName.trim() : "";
  if (name) return false;
  const size = Number(team.teamSize ?? 0);
  if (Number.isFinite(size) && size >= 3) return false;
  return true;
}

/**
 * Duplicado legado: o mais antigo vence. Determinístico (desempate pelo id) para
 * que duas resoluções concorrentes escolham o MESMO doc.
 *
 * NÃO é auto-cura: o Firestore não tranca a faixa VAZIA de uma query em
 * transação, então duas primeiras resoluções simultâneas do mesmo par ainda
 * criam dois docs. O que esta regra garante é que toda resolução SEGUINTE
 * concorda; quem repara um racha que já aconteceu é o script de fusão.
 */
export function pickPairTeamId(candidates: PairTeamCandidate[]): string {
  let best: PairTeamCandidate | null = null;
  for (const candidate of candidates) {
    if (!candidate.id) continue;
    if (
      best == null ||
      candidate.createdAtMs < best.createdAtMs ||
      (candidate.createdAtMs === best.createdAtMs && candidate.id < best.id)
    ) {
      best = candidate;
    }
  }
  return best?.id ?? "";
}

function toMillis(value: unknown): number {
  const maybe = value as {toMillis?: () => number} | null | undefined;
  if (maybe && typeof maybe.toMillis === "function") {
    const ms = maybe.toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Resolve a equipe da dupla DENTRO da transação: reaproveita o doc do par ou
 * cria um novo. Faz leitura E escrita — chame depois de todas as outras
 * leituras da transação.
 */
export async function resolvePairTeamTx(
  tx: Transaction,
  params: {
    teamsRef: CollectionReference;
    inscriptionsRef: CollectionReference;
    tournamentId: string;
    player1Id: string;
    player2Id: string;
  },
): Promise<PairTeamResolution> {
  // Precondição antes de qualquer leitura: `tournamentId` em branco desligaria
  // silenciosamente a exceção por categoria (nenhuma inscrição casa com "") e o
  // helper passaria a SEMPRE reaproveitar. A polaridade importa — um doc novo a
  // mais o script de fusão absorve; duas campanhas na mesma chave, não.
  if (!trimmed(params.tournamentId)) {
    throw new Error("resolvePairTeamTx exige tournamentId");
  }

  const player1Id = trimmed(params.player1Id);
  const player2Id = trimmed(params.player2Id);
  const pairKey = buildPairKey(player1Id, player2Id);

  // Par incompleto/inválido: sem chave não há o que deduplicar.
  if (!pairKey) {
    return createPairTeam(tx, params.teamsRef, {player1Id, player2Id, pairKey: ""});
  }

  const existing = await tx.get(params.teamsRef.where("pairKey", "==", pairKey));
  const candidates: PairTeamCandidate[] = [];
  for (const doc of existing.docs) {
    const data = doc.data();
    if (!isPairTeamDoc(data)) continue;
    // `pairKey` é índice, não prova: o cliente consegue gravar o campo, então a
    // identidade vale pelos player ids do próprio doc.
    if (buildPairKey(trimmed(data.player1Id), trimmed(data.player2Id)) !== pairKey) {
      continue;
    }
    candidates.push({id: doc.id, createdAtMs: toMillis(data.createdAt)});
  }

  const chosenId = pickPairTeamId(candidates);
  if (chosenId) {
    const taken = await tx.get(
      params.inscriptionsRef.where("teamId", "==", chosenId),
    );
    const alreadyInTournament = taken.docs.some(
      (doc) => trimmed(doc.data().tournamentId) === trimmed(params.tournamentId),
    );
    if (!alreadyInTournament) {
      const ref = params.teamsRef.doc(chosenId);
      // Só `updatedAt`: regravar o `pairKey` seria no-op provável — o candidato
      // só chegou aqui porque a query por `pairKey` o achou. Quem preenche o
      // campo em doc legado é o backfill da Task 6, não este caminho.
      tx.update(ref, {updatedAt: FieldValue.serverTimestamp()});
      return {ref, teamId: chosenId, reused: true};
    }
  }

  return createPairTeam(tx, params.teamsRef, {player1Id, player2Id, pairKey});
}

function createPairTeam(
  tx: Transaction,
  teamsRef: CollectionReference,
  data: {player1Id: string; player2Id: string; pairKey: string},
): PairTeamResolution {
  const ref = teamsRef.doc();
  tx.set(ref, {
    player1Id: data.player1Id,
    player2Id: data.player2Id,
    ...(data.pairKey ? {pairKey: data.pairKey} : {}),
    createdAt: FieldValue.serverTimestamp(),
  });
  return {ref, teamId: ref.id, reused: false};
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test 2>&1 | grep -A 3 "tournament-pair-team"
```

Esperado: os 13 testes passam. Se `resolvePairTeamTx` reclamar de tipo no teste, é o `as never` do
harness — o fake não implementa a interface inteira do Admin SDK de propósito.

- [ ] **Step 5: Commit**

```bash
git add functions/src/tournament-pair-team.ts functions/src/tournament-pair-team.test.ts
git commit -m "feat: helper que resolve a equipe da dupla por pairKey"
```

---

### Task 3: `pairKey` imutável pelo cliente nas rules

Sem isso, o atleta da equipe pode gravar o `pairKey` de outra dupla. O helper já revalida pelos player ids (Task 2), então esta é a segunda trava, não a única.

**Files:**
- Modify: `firestore.rules` (função `teamPaidGateUnchanged`, linha ~243, e o `allow update` de `teams`, linha ~2019)

- [ ] **Step 1: Renomear a função e incluir `pairKey`**

Trocar o bloco da linha 239-246 de `firestore.rules`:

```
    // `registrationPaid` é o portão das listagens públicas de equipe e `gender`
    // sai dele: quem carimba é só `markTeamRegistrationPaid` (Cloud Function),
    // no instante em que a inscrição fecha. Sem esta trava, o próprio atleta
    // marcaria a equipe dele como paga e entraria no Descobrir sem pagar nada.
    // `pairKey` entrou junto: é a chave que faz a inscrição seguinte reencontrar
    // a equipe da dupla, e um cliente que a forjasse apontaria a próxima
    // inscrição de OUTRO par para o doc dele.
    function teamServerOnlyFieldsUnchanged() {
      return !request.resource.data.diff(resource.data).affectedKeys()
        .hasAny(['registrationPaid', 'gender', 'pairKey']);
    }
```

- [ ] **Step 2: Atualizar a chamada**

No `match /artifacts/{appId}/public/data/teams/{teamId}`, dentro do `allow update`, trocar
`teamPaidGateUnchanged()` por `teamServerOnlyFieldsUnchanged()`.

- [ ] **Step 3: Confirmar que não sobrou chamador antigo**

```bash
grep -n "teamPaidGateUnchanged" firestore.rules
```

Esperado: nenhuma saída.

- [ ] **Step 4: Estender o teste de rules que já existe**

`functions/test/team-registration-paid-gate.rules.test.mjs` é o teste deste exato portão — ele
prova que o jogador da equipe não consegue carimbar `registrationPaid`/`gender`. `pairKey` entra
na mesma família e merece o mesmo teste. Acrescentar, no mesmo arquivo e no mesmo estilo dos casos
existentes:

- jogador da equipe tentando `updateDoc(TEAM, {pairKey: 'outro:par'})` → `assertFails`
- jogador da equipe tentando `updateDoc(TEAM, {jerseyNumber: 7})` → `assertSucceeds`, provando que
  a trava nova não fechou a porta para os campos legítimos

O segundo caso importa tanto quanto o primeiro: sem ele, um `hasAny` escrito errado que bloqueasse
TODO update passaria no teste.

- [ ] **Step 5: Rodar o teste de rules**

A partir da **raiz do repositório** (não de `functions/`):

```bash
npx firebase emulators:exec --only firestore "node --test functions/test/team-registration-paid-gate.rules.test.mjs"
```

Esperado: todos os casos passam, incluindo os que já existiam. Um caso antigo quebrando significa
que a renomeação da função deixou chamador órfão ou mudou o alcance do portão.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules functions/test/team-registration-paid-gate.rules.test.mjs
git commit -m "fix: pairKey é imutável pelo cliente nas rules de teams"
```

---

### Task 4: Ligar o helper no aceite de convite

**Files:**
- Modify: `functions/src/tournament-partner-invite.ts` (ramo `attach` ~1891-1906 e ramo que cria inscrição ~1934-1941, ambos dentro de `acceptTournamentPartnerInvite`)

**Interfaces:**
- Consumes: `resolvePairTeamTx` da Task 2.
- Produces: nada novo — o `teamId` devolvido continua alimentando `attachUpdate.teamId`, `registrationData.teamId` e o retorno da callable.

- [ ] **Step 1: Importar o helper**

Junto dos imports existentes de `./firebase-paths`:

```ts
import {resolvePairTeamTx} from "./tournament-pair-team";
```

- [ ] **Step 2: Trocar o ramo `attach`**

O bloco atual (logo depois de `attachUpdate` estar montado) é:

```ts
      let teamId = baseTeamId;
      if (baseTeamId) {
        // Solo legado: já existe equipe de 1 atleta → preenche o player2.
        tx.update(teamsRef.doc(baseTeamId), {player2Id: joiningUid});
      } else {
        // Solo novo: CRIA a equipe agora (player1 + player2) — "criar equipe".
        const teamRef = teamsRef.doc();
        tx.set(teamRef, {
          player1Id: baseOwnerUid,
          player2Id: joiningUid,
          createdAt: FieldValue.serverTimestamp(),
        });
        teamId = teamRef.id;
        attachUpdate.teamId = teamId;
      }
```

Passa a ser:

```ts
      let teamId = baseTeamId;
      if (baseTeamId) {
        // Solo legado: já existe equipe de 1 atleta → preenche o player2. O par
        // só fica completo aqui, então é aqui que a chave nasce.
        //
        // A chave sai do player1 do PRÓPRIO doc de equipe (já lido em
        // `existingTeamSnap`), não do dono da inscrição: o helper revalida todo
        // candidato recomputando `buildPairKey` a partir dos player ids do doc.
        // Uma chave derivada de outra fonte pode não bater — e aí o carimbo,
        // cujo único propósito é tornar o par reaproveitável, não serve pra nada.
        const teamOwnerUid =
          (existingTeamSnap?.data()?.player1Id as string | undefined)?.trim() ||
          baseOwnerUid;
        tx.update(teamsRef.doc(baseTeamId), {
          player2Id: joiningUid,
          pairKey: buildPairKey(teamOwnerUid, joiningUid),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        // Solo novo: a equipe da dupla é resolvida (reaproveitada ou criada).
        const resolved = await resolvePairTeamTx(tx, {
          teamsRef,
          inscriptionsRef,
          tournamentId,
          player1Id: baseOwnerUid,
          player2Id: joiningUid,
        });
        teamId = resolved.teamId;
        attachUpdate.teamId = teamId;
      }
```

`buildPairKey` já é importável de `./tournament-pair-uniqueness`; conferir se o import existe no
topo do arquivo e adicioná-lo à lista se faltar.

- [ ] **Step 3: Trocar o ramo que cria inscrição**

O bloco atual é:

```ts
    const teamRef = teamsRef.doc();
    const regRef = inscriptionsRef.doc();

    tx.set(teamRef, {
      player1Id: inviterUid,
      player2Id: uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    const registrationData: Record<string, unknown> = {
      teamId: teamRef.id,
```

Passa a ser:

```ts
    const resolvedTeam = await resolvePairTeamTx(tx, {
      teamsRef,
      inscriptionsRef,
      tournamentId,
      player1Id: inviterUid,
      player2Id: uid,
    });
    const regRef = inscriptionsRef.doc();

    const registrationData: Record<string, unknown> = {
      teamId: resolvedTeam.teamId,
```

Depois deste ponto sobram **3** ocorrências de `teamId: teamRef.id` neste ramo (o dado da
inscrição, o retorno da callable e o log). Trocar as três por `teamId: resolvedTeam.teamId`.
Conferir com:

```bash
grep -n "teamRef" functions/src/tournament-partner-invite.ts
```

Esperado ao fim: nenhuma ocorrência de `teamRef` fora do ramo de equipe **nomeada** (o bloco que
monta `teamUpdate`).

- [ ] **Step 4: Compilar e rodar a suíte**

```bash
npm run lint && npm test
```

Esperado: compila limpo e a suíte inteira passa, incluindo os testes existentes de
`tournament-partner-invite`. `resolvePairTeamTx` lê antes de escrever, e nesta transação a última
leitura anterior é a da equipe base — nenhuma leitura acontece depois destes blocos.

- [ ] **Step 5: Commit**

```bash
git add functions/src/tournament-partner-invite.ts
git commit -m "feat: aceite de convite reaproveita a equipe da dupla"
```

---

### Task 5: Ligar o helper na inscrição pelo organizador

**Files:**
- Modify: `functions/src/organizer-create-registration.ts` (ramo de fusão de reservas solo ~624-638 e ramo de dupla direta ~680-686, ambos na transação que começa na linha ~538)

**Interfaces:**
- Consumes: `resolvePairTeamTx` da Task 2.
- Produces: nada novo.

- [ ] **Step 1: Importar o helper**

```ts
import {resolvePairTeamTx} from "./tournament-pair-team";
```

- [ ] **Step 2: Trocar o ramo de fusão de reservas solo**

O bloco atual:

```ts
      let teamId = baseTeamId;
      if (baseTeamId) {
        // Solo legado: a equipe de 1 atleta já existe → preenche o player2.
        tx.update(teamsRef.doc(baseTeamId), {player2Id: joiningUid});
      } else {
        // Solo novo: a equipe nasce agora, como no aceite do convite.
        const teamRef = teamsRef.doc();
        tx.set(teamRef, {
          player1Id: baseOwnerUid,
          player2Id: joiningUid,
          createdAt: FieldValue.serverTimestamp(),
        });
        teamId = teamRef.id;
        update.teamId = teamId;
      }
```

Passa a ser:

```ts
      let teamId = baseTeamId;
      if (baseTeamId) {
        // Solo legado: a equipe de 1 atleta já existe → preenche o player2. O
        // par só fica completo aqui, então é aqui que a chave nasce.
        //
        // Mesma regra da Task 4: a chave sai do player1 do PRÓPRIO doc (já lido
        // em `existingTeamSnap`), porque é assim que o helper revalida o
        // candidato. Derivar do dono da inscrição pode gravar uma chave que os
        // player ids do doc não produzem, e o carimbo vira letra morta.
        const teamOwnerUid =
          (existingTeamSnap?.data()?.player1Id as string | undefined)?.trim() ||
          baseOwnerUid;
        tx.update(teamsRef.doc(baseTeamId), {
          player2Id: joiningUid,
          pairKey: buildPairKey(teamOwnerUid, joiningUid),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        // Solo novo: a equipe da dupla é resolvida (reaproveitada ou criada).
        const resolved = await resolvePairTeamTx(tx, {
          teamsRef,
          inscriptionsRef,
          tournamentId,
          player1Id: baseOwnerUid,
          player2Id: joiningUid,
        });
        teamId = resolved.teamId;
        update.teamId = teamId;
      }
```

Conferir se `buildPairKey` já está importado de `./tournament-pair-uniqueness`; adicionar se faltar.

- [ ] **Step 3: Trocar o ramo de dupla direta**

O bloco atual:

```ts
    const teamRef = teamsRef.doc();
    const regRef = inscriptionsRef.doc();
    tx.set(teamRef, {
      player1Id: uidA,
      player2Id: uidB,
      createdAt: FieldValue.serverTimestamp(),
    });

    const registrationDoc = buildOrganizerRegistrationDoc({
      teamId: teamRef.id,
```

Passa a ser:

```ts
    const resolvedTeam = await resolvePairTeamTx(tx, {
      teamsRef,
      inscriptionsRef,
      tournamentId,
      player1Id: uidA,
      player2Id: uidB,
    });
    const regRef = inscriptionsRef.doc();

    const registrationDoc = buildOrganizerRegistrationDoc({
      teamId: resolvedTeam.teamId,
```

Este ramo tem uma leitura logo antes (`readCapacityExpansionPlan`), e a chamada do helper vem
**depois** dela — ordem obrigatória do Firestore. Sobram **2** ocorrências de `teamId: teamRef.id`
neste ramo (o dado da inscrição e o retorno); trocar as duas por `teamId: resolvedTeam.teamId`.

- [ ] **Step 4: Conferir que só o ramo nomeado ainda cria doc à mão**

```bash
grep -n "teamsRef.doc()" functions/src/organizer-create-registration.ts
```

Esperado: uma única ocorrência, a do ramo `buildOrganizerNamedTeamDoc` (equipe nomeada).

- [ ] **Step 5: Compilar e rodar a suíte**

```bash
npm run lint && npm test
```

Esperado: tudo verde, sem editar teste existente.

- [ ] **Step 6: Commit**

```bash
git add functions/src/organizer-create-registration.ts
git commit -m "feat: inscrição pelo organizador reaproveita a equipe da dupla"
```

---

### Task 5b: Prova ponta a ponta na matriz de inscrições

As Tasks 2 a 5 provam o helper isolado e que nada regrediu. **Nenhuma delas prova que a promessa
da entrega acontece de verdade pelo caminho real.** O repositório já tem o harness certo para
isso: `functions/test/registration-*.test.mjs` chama as callables de verdade contra o emulador do
Firestore.

**Files:**
- Create: `functions/test/registration-identidade-dupla.test.mjs`
- Modify: `functions/test/registration-harness.mjs` (acrescentar `organizerCreateTeamRegistration`
  ao mapa `callables`)

**Interfaces:**
- Consumes: `functions/test/registration-harness.mjs` — `seedTournament`, `duplaCategory`,
  `teamCategory`, `seedMan`, `formDupla`, `formTeam`, `getTeam`, `getRegistration`, `call`,
  `callables`, `clearFirestore`, `db`, `TEAMS`. `seedTournament` devolve o `tournamentId` (string);
  `formDupla` devolve `{inviteId, registrationId, teamId, ...}`.
- Produces: nada — é o teste de aceitação da entrega.

**As DUAS portas precisam de cobertura.** O caminho do atleta (`acceptTournamentPartnerInvite`) já
é exercitado pela matriz; o do organizador (`organizerCreateTeamRegistration`) **não é exercitado
por teste nenhum, em nível nenhum** — a revisão da Task 5 confirmou com grep que a callable não
aparece em `functions/test/` e não existe unit test para o módulo. É a porta por onde o organizador
inscreve dupla no balcão, e hoje ela muda de comportamento sem nenhuma rede.

Por isso esta task começa acrescentando a callable ao harness:

```js
  organizerCreateRegistration: organizerCreateRegistration.organizerCreateTeamRegistration,
```

seguindo o padrão de import dos outros módulos no topo de `registration-harness.mjs`.

- [ ] **Step 1: Escrever o teste**

Criar `functions/test/registration-identidade-dupla.test.mjs`:

```js
/**
 * Identidade única da dupla, provada pelo caminho REAL: callables de verdade
 * contra o emulador.
 *
 * Os testes de unidade provam o helper isolado; a suíte antiga prova que nada
 * regrediu. Só este arquivo prova a promessa da entrega — que a mesma dupla,
 * inscrita em dois torneios, é UMA equipe — e a exceção deliberada, que duas
 * categorias do mesmo torneio continuam sendo duas.
 *
 * Rodar (na pasta functions/): npm run test:registrations
 */

import {beforeEach, describe, test} from 'node:test';
import assert from 'node:assert/strict';

import {
  clearFirestore,
  duplaCategory,
  formDupla,
  formTeam,
  getTeam,
  seedMan,
  seedTournament,
  teamCategory,
} from './registration-harness.mjs';

beforeEach(clearFirestore);

/** Torneio com uma categoria de dupla masculina. */
async function torneioDupla(categoryId = 'masc') {
  return seedTournament({
    categories: [duplaCategory({id: categoryId, categoryName: 'Dupla Masculina'})],
  });
}

describe('identidade única da dupla', () => {
  test('a mesma dupla em DOIS torneios é uma equipe só', async () => {
    const t1 = await torneioDupla();
    const t2 = await torneioDupla();
    const a = await seedMan({uid: 'atleta-a'});
    const b = await seedMan({uid: 'atleta-b'});

    const r1 = await formDupla({
      tournamentId: t1, categoryId: 'masc', inviterUid: a, inviteeUid: b,
    });
    const r2 = await formDupla({
      tournamentId: t2, categoryId: 'masc', inviterUid: a, inviteeUid: b,
    });

    assert.equal(r2.teamId, r1.teamId);
  });

  test('papéis invertidos no 2º torneio: mesma equipe, e os player ids NÃO mudam', async () => {
    const t1 = await torneioDupla();
    const t2 = await torneioDupla();
    const a = await seedMan({uid: 'atleta-a'});
    const b = await seedMan({uid: 'atleta-b'});

    const r1 = await formDupla({
      tournamentId: t1, categoryId: 'masc', inviterUid: a, inviteeUid: b,
    });
    const antes = await getTeam(r1.teamId);

    // Agora quem convida é o outro.
    const r2 = await formDupla({
      tournamentId: t2, categoryId: 'masc', inviterUid: b, inviteeUid: a,
    });

    assert.equal(r2.teamId, r1.teamId);
    const depois = await getTeam(r1.teamId);
    assert.equal(depois.player1Id, antes.player1Id);
    assert.equal(depois.player2Id, antes.player2Id);
  });

  test('duas categorias do MESMO torneio continuam sendo duas equipes', async () => {
    const tournamentId = await seedTournament({
      categories: [
        duplaCategory({id: 'masc', categoryName: 'Dupla Masculina'}),
        duplaCategory({id: 'masc-b', categoryName: 'Dupla Masculina B'}),
      ],
    });
    const a = await seedMan({uid: 'atleta-a'});
    const b = await seedMan({uid: 'atleta-b'});

    const r1 = await formDupla({
      tournamentId, categoryId: 'masc', inviterUid: a, inviteeUid: b,
    });
    const r2 = await formDupla({
      tournamentId, categoryId: 'masc-b', inviterUid: a, inviteeUid: b,
    });

    assert.notEqual(r2.teamId, r1.teamId);
  });

  test('pelo ORGANIZADOR: a mesma dupla em dois torneios é uma equipe só', async () => {
    const t1 = await torneioDupla();
    const t2 = await torneioDupla();
    const a = await seedMan({uid: 'atleta-a'});
    const b = await seedMan({uid: 'atleta-b'});

    const r1 = await call(callables.organizerCreateRegistration, 'organizador-1', {
      tournamentId: t1, categoryId: 'masc', athleteUids: [a, b], markAsPaid: true,
    });
    const r2 = await call(callables.organizerCreateRegistration, 'organizador-1', {
      tournamentId: t2, categoryId: 'masc', athleteUids: [a, b], markAsPaid: true,
    });

    assert.equal(r2.teamId, r1.teamId);
  });

  test('as DUAS portas chegam na mesma equipe: organizador e convite', async () => {
    const t1 = await torneioDupla();
    const t2 = await torneioDupla();
    const a = await seedMan({uid: 'atleta-a'});
    const b = await seedMan({uid: 'atleta-b'});

    const peloOrganizador = await call(
      callables.organizerCreateRegistration, 'organizador-1',
      {tournamentId: t1, categoryId: 'masc', athleteUids: [a, b], markAsPaid: true},
    );
    const peloConvite = await formDupla({
      tournamentId: t2, categoryId: 'masc', inviterUid: a, inviteeUid: b,
    });

    assert.equal(peloConvite.teamId, peloOrganizador.teamId);
  });

  test('pelo ORGANIZADOR: duas categorias do mesmo torneio continuam sendo duas', async () => {
    const tournamentId = await seedTournament({
      categories: [
        duplaCategory({id: 'masc', categoryName: 'Dupla Masculina'}),
        duplaCategory({id: 'masc-b', categoryName: 'Dupla Masculina B'}),
      ],
    });
    const a = await seedMan({uid: 'atleta-a'});
    const b = await seedMan({uid: 'atleta-b'});

    const r1 = await call(callables.organizerCreateRegistration, 'organizador-1', {
      tournamentId, categoryId: 'masc', athleteUids: [a, b], markAsPaid: true,
    });
    const r2 = await call(callables.organizerCreateRegistration, 'organizador-1', {
      tournamentId, categoryId: 'masc-b', athleteUids: [a, b], markAsPaid: true,
    });

    assert.notEqual(r2.teamId, r1.teamId);
  });

  test('equipe NOMEADA nunca deduplica: dois torneios, duas equipes', async () => {
    const t1 = await seedTournament({
      categories: [teamCategory({id: 'trio', teamSize: 3})],
    });
    const t2 = await seedTournament({
      categories: [teamCategory({id: 'trio', teamSize: 3})],
    });
    const a = await seedMan({uid: 'atleta-a'});
    const b = await seedMan({uid: 'atleta-b'});
    const c = await seedMan({uid: 'atleta-c'});

    const e1 = await formTeam({
      tournamentId: t1, categoryId: 'trio', captainUid: a, memberUids: [b, c],
    });
    const e2 = await formTeam({
      tournamentId: t2, categoryId: 'trio', captainUid: a, memberUids: [b, c],
    });

    assert.notEqual(e2.teamId, e1.teamId);
  });
});
```

Se a assinatura de algum helper do harness não bater com o que está escrito aqui (o retorno de
`formTeam`, os parâmetros de `teamCategory`), **ajuste a chamada ao harness, nunca a asserção** —
as quatro asserções são o contrato da entrega.

- [ ] **Step 2: Rodar**

Na pasta `functions/`:

```bash
npm run test:registrations
```

Esperado: os 4 testes novos passam e a matriz inteira continua verde. O harness sobe o emulador
sozinho e roda com `--test-concurrency=1`.

- [ ] **Step 3: Ver o 1º teste falhar sem a fiação (prova de que ele testa algo)**

Reverta temporariamente a chamada do helper em `tournament-partner-invite.ts` para o
`teamsRef.doc()` de antes, rode só este arquivo, e confirme que o teste "a mesma dupla em DOIS
torneios" FALHA. Depois desfaça a reversão. Um teste de aceitação que passa com e sem a mudança
não prova nada — esta é a única forma de saber.

- [ ] **Step 4: Commit**

```bash
git add functions/test/registration-identidade-dupla.test.mjs
git commit -m "test: a promessa da entrega provada pelas callables reais"
```

---

### Task 6: Backfill do `pairKey`

**Files:**
- Create: `functions/scripts/backfill-team-pair-key.js`

**Interfaces:**
- Consumes: nada do código compilado (script standalone, como os outros de `scripts/`).
- Produces: campo `pairKey` nos docs de dupla existentes — sem ele a Task 2 não encontra nada.

- [ ] **Step 1: Escrever o script**

Criar `functions/scripts/backfill-team-pair-key.js`:

```js
/* eslint-disable */
/**
 * Backfill da chave do par: grava `pairKey` nas equipes de DUPLA que já existem.
 *
 * POR QUE existe: `resolvePairTeamTx` (functions/src/tournament-pair-team.ts)
 * encontra a equipe do par consultando `pairKey`. Sem este backfill o campo não
 * existe em doc nenhum, a consulta volta vazia e o sistema segue criando uma
 * equipe nova a cada inscrição — o bug que a entrega conserta.
 *
 * ORDEM DE ROLLOUT (importa): ESTE script -> deploy das Functions e das rules
 * -> merge-duplicate-pair-teams.js.
 *
 * Equipe nomeada (trio/quarteto/quinteto) NUNCA recebe `pairKey`: ela é escopada
 * ao torneio de propósito e não pode ser deduplicada.
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-team-pair-key.js --project volley-track-dev-4596c
 *   node scripts/backfill-team-pair-key.js --project <id> --apply
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error("Informe --project <projectId>");
  process.exit(1);
}
const apply = process.argv.includes("--apply");

admin.initializeApp({projectId});
const db = admin.firestore();
const base = `artifacts/${projectId}/public/data`;

/** Cópia de `buildPairKey` (functions/src/tournament-pair-uniqueness.ts). */
function buildPairKey(uidA, uidB) {
  const a = String(uidA ?? "").trim();
  const b = String(uidB ?? "").trim();
  if (!a || !b || a === b) return "";
  return [a, b].sort().join(":");
}

/** Cópia de `isPairTeamDoc` (functions/src/tournament-pair-team.ts). */
function isPairTeamDoc(team) {
  if (!team) return false;
  const name = typeof team.teamName === "string" ? team.teamName.trim() : "";
  if (name) return false;
  const size = Number(team.teamSize ?? 0);
  if (Number.isFinite(size) && size >= 3) return false;
  return true;
}

(async () => {
  const snap = await db.collection(`${base}/teams`).get();
  const pending = [];
  let named = 0;
  let incomplete = 0;
  let already = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (!isPairTeamDoc(data)) {
      named += 1;
      continue;
    }
    const pairKey = buildPairKey(data.player1Id, data.player2Id);
    if (!pairKey) {
      incomplete += 1;
      continue;
    }
    if (data.pairKey === pairKey) {
      already += 1;
      continue;
    }
    pending.push({ref: doc.ref, id: doc.id, pairKey});
  }

  console.log(`equipes=${snap.size} nomeadas=${named} incompletas=${incomplete} ja_tinham=${already}`);
  console.log(`a gravar: ${pending.length}`);
  for (const item of pending.slice(0, 20)) {
    console.log(`  ${item.id} -> ${item.pairKey}`);
  }
  if (pending.length > 20) console.log(`  ... e mais ${pending.length - 20}`);

  if (!apply) {
    console.log("\n(dry-run) nada foi gravado. Rode de novo com --apply.");
    return;
  }

  let written = 0;
  while (written < pending.length) {
    const chunk = pending.slice(written, written + 400);
    const batch = db.batch();
    for (const item of chunk) batch.update(item.ref, {pairKey: item.pairKey});
    await batch.commit();
    written += chunk.length;
    console.log(`gravadas ${written}/${pending.length}`);
  }
  console.log("pronto.");
})().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Rodar em dry-run no dev**

```bash
node scripts/backfill-team-pair-key.js --project volley-track-dev-4596c
```

O dev é banco **vivo** — o app das lojas aponta para ele, então os totais mudam entre uma execução
e outra. Não confira contra um número decorado; confira a **relação**:

- `nomeadas + incompletas + ja_tinham + a_gravar == equipes`
- `nomeadas` tem de bater com a quantidade real de equipes de 3+ no projeto (no dev era 11 e no
  prod 54 em 15/09). Esse é o número que prova que o guarda de equipe nomeada classifica certo —
  se ele destoar, **pare e investigue** antes de qualquer `--apply`.
- `incompletas` deve ser 0 nos dois projetos (nenhum doc solo vivo).

Na medição de 15/09: dev `equipes=219 nomeadas=11 incompletas=0 ja_tinham=0`, `a gravar: 208`;
prod `equipes=59 nomeadas=54 incompletas=0 ja_tinham=0`, `a gravar: 5`.

- [ ] **Step 3: Commit (ainda sem aplicar)**

```bash
git add functions/scripts/backfill-team-pair-key.js
git commit -m "feat: script de backfill do pairKey nas equipes de dupla"
```

---

### Task 7: Fusão dos duplicados — a matemática pura

O script de fusão escreve em 8 coleções; a decisão de **quem sobrevive** e **o que reponta** fica
numa camada sem I/O, testável.

**Files:**
- Create: `functions/scripts/lib/merge-pair-teams-plan.js`
- Create: `functions/test/merge-pair-teams-plan.test.mjs`
- Modify: `functions/package.json` (script `test`, para incluir o arquivo novo)

**Interfaces:**
- Consumes: nada.
- Produces (via `module.exports`), consumido pela Task 8:
  - `buildPairKey(uidA, uidB)` → string
  - `isPairTeamDoc(team)` → boolean
  - `groupTeamsByPair(teams)` → `Map<pairKey, Array<{id, createdAtMs, player1Id, player2Id}>>`, onde `teams = [{id, data}]`
  - `planGroupMerge({members, tournamentsByTeamId, refCountByTeamId})` → `{survivorId, absorbedIds, skipped, reason}`
  - `mergeTeamRankingDocs(survivorDoc, absorbedDocs)` → `{totalPoints, pointsByYear, tournamentsCount, results}`

- [ ] **Step 1: Escrever o teste que falha**

Criar `functions/test/merge-pair-teams-plan.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createRequire } from 'node:module';

/**
 * Guarda da decisão de fusão das duplas duplicadas
 * (`scripts/merge-duplicate-pair-teams.js`). Eleger o sobrevivente errado
 * reescreve partida encerrada e ranking de graça, e fundir uma convivência
 * legítima (o par em duas categorias do MESMO torneio) colocaria a mesma
 * equipe em duas chaves do mesmo evento.
 */

const require = createRequire(import.meta.url);
const {
  buildPairKey,
  isPairTeamDoc,
  groupTeamsByPair,
  planGroupMerge,
  mergeTeamRankingDocs,
} = require('../scripts/lib/merge-pair-teams-plan.js');

describe('buildPairKey', () => {
  test('ordena e rejeita par inválido', () => {
    assert.equal(buildPairKey('b', 'a'), 'a:b');
    assert.equal(buildPairKey('a', 'a'), '');
    assert.equal(buildPairKey('a', ''), '');
  });
});

describe('groupTeamsByPair', () => {
  test('agrupa duplas e ignora equipe nomeada', () => {
    const groups = groupTeamsByPair([
      { id: 't1', data: { player1Id: 'a', player2Id: 'b', createdAt: 100 } },
      { id: 't2', data: { player1Id: 'b', player2Id: 'a', createdAt: 200 } },
      { id: 't3', data: { player1Id: 'a', player2Id: 'b', teamName: 'Nomeada' } },
    ]);
    assert.equal(groups.size, 1);
    assert.deepEqual(
      groups.get('a:b').map((t) => t.id),
      ['t1', 't2'],
    );
  });
});

describe('planGroupMerge', () => {
  const members = [
    { id: 'velho', createdAtMs: 100 },
    { id: 'novo', createdAtMs: 200 },
  ];

  test('sobrevive quem tem mais referências', () => {
    const plan = planGroupMerge({
      members,
      tournamentsByTeamId: { velho: ['T1'], novo: ['T2'] },
      refCountByTeamId: { velho: 3, novo: 9 },
    });
    assert.equal(plan.skipped, false);
    assert.equal(plan.survivorId, 'novo');
    assert.deepEqual(plan.absorbedIds, ['velho']);
  });

  test('empate de referências desempata pelo mais antigo', () => {
    const plan = planGroupMerge({
      members,
      tournamentsByTeamId: { velho: ['T1'], novo: ['T2'] },
      refCountByTeamId: { velho: 5, novo: 5 },
    });
    assert.equal(plan.survivorId, 'velho');
  });

  test('torneio em comum é convivência legítima, não duplicação', () => {
    const plan = planGroupMerge({
      members,
      tournamentsByTeamId: { velho: ['T1'], novo: ['T1'] },
      refCountByTeamId: { velho: 5, novo: 1 },
    });
    assert.equal(plan.skipped, true);
    assert.equal(plan.reason, 'convivencia-legitima');
    assert.deepEqual(plan.absorbedIds, []);
  });

  test('grupo de um doc só não gera fusão', () => {
    const plan = planGroupMerge({
      members: [{ id: 'unico', createdAtMs: 100 }],
      tournamentsByTeamId: { unico: ['T1'] },
      refCountByTeamId: { unico: 2 },
    });
    assert.equal(plan.skipped, true);
    assert.equal(plan.reason, 'sem-duplicado');
  });
});

describe('mergeTeamRankingDocs', () => {
  test('soma resultados, pontos e contagem de torneios', () => {
    const merged = mergeTeamRankingDocs(
      {
        totalPoints: 83,
        pointsByYear: { 2026: 83 },
        tournamentsCount: 1,
        results: [{ tournamentId: 'T1', categoryId: 'C1', finalPlace: 3, points: 83, year: 2026 }],
      },
      [
        {
          totalPoints: 25,
          pointsByYear: { 2026: 25 },
          tournamentsCount: 1,
          results: [{ tournamentId: 'T2', categoryId: 'C2', finalPlace: 5, points: 25, year: 2026 }],
        },
      ],
    );
    assert.equal(merged.totalPoints, 108);
    assert.deepEqual(merged.pointsByYear, { 2026: 108 });
    assert.equal(merged.tournamentsCount, 2);
    assert.equal(merged.results.length, 2);
  });

  test('resultado repetido do mesmo torneio+categoria conta uma vez só', () => {
    const merged = mergeTeamRankingDocs(
      {
        totalPoints: 83,
        pointsByYear: { 2026: 83 },
        tournamentsCount: 1,
        results: [{ tournamentId: 'T1', categoryId: 'C1', finalPlace: 3, points: 83, year: 2026 }],
      },
      [
        {
          totalPoints: 83,
          pointsByYear: { 2026: 83 },
          tournamentsCount: 1,
          results: [{ tournamentId: 'T1', categoryId: 'C1', finalPlace: 3, points: 83, year: 2026 }],
        },
      ],
    );
    assert.equal(merged.totalPoints, 83);
    assert.equal(merged.results.length, 1);
    assert.equal(merged.tournamentsCount, 1);
  });

  test('sobrevivente sem doc de ranking absorve o do outro', () => {
    const merged = mergeTeamRankingDocs(null, [
      {
        totalPoints: 25,
        pointsByYear: { 2026: 25 },
        tournamentsCount: 1,
        results: [{ tournamentId: 'T2', categoryId: 'C2', finalPlace: 5, points: 25, year: 2026 }],
      },
    ]);
    assert.equal(merged.totalPoints, 25);
    assert.equal(merged.results.length, 1);
  });
});

describe('isPairTeamDoc', () => {
  test('nome ou elenco de 3+ não é dupla', () => {
    assert.equal(isPairTeamDoc({ player1Id: 'a', player2Id: 'b' }), true);
    assert.equal(isPairTeamDoc({ teamName: 'X' }), false);
    assert.equal(isPairTeamDoc({ teamSize: 5 }), false);
  });
});
```

- [ ] **Step 2: Incluir o teste no harness e rodar para ver falhar**

Em `functions/package.json`, no script `test`, acrescentar `test/merge-pair-teams-plan.test.mjs`
ao fim da lista de arquivos `test/*.test.mjs`.

```bash
npm test 2>&1 | grep -A 5 "merge-pair-teams-plan"
```

Esperado: FAIL — `Cannot find module '../scripts/lib/merge-pair-teams-plan.js'`.

- [ ] **Step 3: Implementar**

Criar `functions/scripts/lib/merge-pair-teams-plan.js`:

```js
/* eslint-disable */
/**
 * Decisão da fusão de duplas duplicadas — camada PURA, sem `firebase-admin` e
 * sem I/O, para que `functions/test/merge-pair-teams-plan.test.mjs` possa travar
 * a regra. O script `scripts/merge-duplicate-pair-teams.js` é só a casca de
 * leitura/escrita em cima daqui.
 *
 * Duas regras sustentam o desenho:
 *
 *  1. Sobrevive quem tem MAIS referências apontando para si — é o que minimiza
 *     reescrita de partida encerrada. Empate desempata pelo `createdAt` mais
 *     antigo, para a decisão ser determinística.
 *  2. Nem todo grupo de 2+ docs é duplicação: o par pode estar em duas
 *     categorias do MESMO torneio, e ali os docs separados existem de propósito
 *     (ver a decisão 2 da spec). Torneio em comum = grupo pulado.
 *
 * Ver `docs/superpowers/specs/2026-09-15-identidade-unica-da-dupla-design.md`.
 */

function buildPairKey(uidA, uidB) {
  const a = String(uidA ?? "").trim();
  const b = String(uidB ?? "").trim();
  if (!a || !b || a === b) return "";
  return [a, b].sort().join(":");
}

function isPairTeamDoc(team) {
  if (!team) return false;
  const name = typeof team.teamName === "string" ? team.teamName.trim() : "";
  if (name) return false;
  const size = Number(team.teamSize ?? 0);
  if (Number.isFinite(size) && size >= 3) return false;
  // `memberUids` é o elenco canônico no resto do código. Um doc histórico com 3+
  // membros, sem nome e sem `teamSize` passaria pelos dois testes acima e seria
  // agrupado pelos 2 primeiros players — e fundido com uma dupla de verdade.
  if (Array.isArray(team.memberUids) && team.memberUids.length >= 3) return false;
  return true;
}

function toMillis(value) {
  if (value && typeof value.toMillis === "function") {
    const ms = value.toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

/** `teams` = [{id, data}] -> Map<pairKey, [{id, createdAtMs, player1Id, player2Id}]>. */
function groupTeamsByPair(teams) {
  const groups = new Map();
  for (const team of teams) {
    const data = team.data || {};
    if (!isPairTeamDoc(data)) continue;
    const pairKey = buildPairKey(data.player1Id, data.player2Id);
    if (!pairKey) continue;
    if (!groups.has(pairKey)) groups.set(pairKey, []);
    groups.get(pairKey).push({
      id: team.id,
      createdAtMs: toMillis(data.createdAt),
      player1Id: String(data.player1Id ?? "").trim(),
      player2Id: String(data.player2Id ?? "").trim(),
    });
  }
  return groups;
}

/**
 * @param members [{id, createdAtMs}] do mesmo par
 * @param tournamentsByTeamId {teamId: [tournamentId]}
 * @param refCountByTeamId {teamId: quantos docs apontam para ele}
 */
function planGroupMerge({members, tournamentsByTeamId, refCountByTeamId}) {
  if (!Array.isArray(members) || members.length < 2) {
    return {survivorId: "", absorbedIds: [], skipped: true, reason: "sem-duplicado"};
  }

  const seen = new Set();
  for (const member of members) {
    // "Sem dado" NÃO é "sem sobreposição". Um lookup que falhou e um doc que
    // realmente não está em torneio nenhum chegariam aqui idênticos — e fundir
    // por engano é irreversível, enquanto pular só adia. Quem chama declara o
    // vazio passando `[]`; a AUSÊNCIA da chave é tratada como falha de dados.
    if (!Object.prototype.hasOwnProperty.call(tournamentsByTeamId, member.id)) {
      return {
        survivorId: "",
        absorbedIds: [],
        skipped: true,
        reason: "dados-incompletos",
      };
    }
    // Set por membro: um doc cujo próprio array repete um torneio (duas
    // categorias) colidiria consigo mesmo e o grupo sairia como convivência
    // legítima sem que nada se sobrepusesse entre docs.
    for (const tournamentId of new Set(tournamentsByTeamId[member.id])) {
      if (seen.has(tournamentId)) {
        return {
          survivorId: "",
          absorbedIds: [],
          skipped: true,
          reason: "convivencia-legitima",
        };
      }
      seen.add(tournamentId);
    }
  }

  let survivor = null;
  for (const member of members) {
    const refs = refCountByTeamId[member.id] || 0;
    if (survivor == null) {
      survivor = {member, refs};
      continue;
    }
    const better =
      refs > survivor.refs ||
      (refs === survivor.refs && member.createdAtMs < survivor.member.createdAtMs) ||
      (refs === survivor.refs &&
        member.createdAtMs === survivor.member.createdAtMs &&
        member.id < survivor.member.id);
    if (better) survivor = {member, refs};
  }

  return {
    survivorId: survivor.member.id,
    absorbedIds: members.filter((m) => m.id !== survivor.member.id).map((m) => m.id),
    skipped: false,
    reason: "",
  };
}

/**
 * Funde docs de `teamRankings`; resultado do mesmo torneio+categoria conta uma vez.
 *
 * Os agregados espelham `aggregateRankingResults`
 * (functions/src/tournament-ranking.ts) DE PROPÓSITO, porque o doc fundido
 * convive com o que o servidor reescreve no próximo recálculo:
 *  - `tournamentsCount` é `results.length`, não a contagem de torneios distintos
 *    (o servidor conta RESULTADOS; um par em duas categorias do mesmo torneio
 *    vale 2 lá e valeria 1 aqui — divergência que sumiria no primeiro recálculo);
 *  - `totalPoints` sai DOS baldes de ano, então `sum(pointsByYear) ===
 *    totalPoints` sempre vale (somar por fora deixa resultado sem ano fora dos
 *    baldes e dentro do total);
 *  - cada entrada é clampada e arredondada, como lá.
 */
function mergeTeamRankingDocs(survivorDoc, absorbedDocs) {
  const byKey = new Map();
  const docs = [survivorDoc, ...(absorbedDocs || [])].filter(Boolean);
  for (const doc of docs) {
    for (const result of doc.results || []) {
      const tournamentId = String(result.tournamentId ?? "").trim();
      const categoryId = String(result.categoryId ?? "").trim();
      // O servidor descarta resultado sem os dois ids (`parseResults`); aqui
      // também, senão dois legados incompletos colidiriam numa chave só.
      if (!tournamentId || !categoryId) continue;
      // JSON.stringify em vez de concatenar com "_": ("A_B","C") e ("A","B_C")
      // dariam a mesma chave, e a segunda entrada sumiria em silêncio.
      const key = JSON.stringify([tournamentId, categoryId]);
      if (!byKey.has(key)) byKey.set(key, result);
    }
  }

  const results = [...byKey.values()];
  const byYear = new Map();
  for (const result of results) {
    const year = String(result.year);
    const list = byYear.get(year) ?? [];
    list.push(Math.max(0, Math.round(Number(result.points) || 0)));
    byYear.set(year, list);
  }
  const pointsByYear = {};
  let totalPoints = 0;
  for (const [year, points] of byYear) {
    const yearPoints = points.reduce((sum, value) => sum + value, 0);
    pointsByYear[year] = yearPoints;
    totalPoints += yearPoints;
  }

  return {
    totalPoints,
    pointsByYear,
    tournamentsCount: results.length,
    results,
  };
}

module.exports = {
  buildPairKey,
  isPairTeamDoc,
  groupTeamsByPair,
  planGroupMerge,
  mergeTeamRankingDocs,
};
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test 2>&1 | grep -A 3 "merge-pair-teams-plan"
```

Esperado: os 10 testes passam.

- [ ] **Step 5: Commit**

```bash
git add functions/scripts/lib/merge-pair-teams-plan.js functions/test/merge-pair-teams-plan.test.mjs functions/package.json
git commit -m "feat: matemática da fusão de duplas duplicadas, com teste"
```

---

### Task 8: Fusão dos duplicados — o script

**Files:**
- Create: `functions/scripts/merge-duplicate-pair-teams.js`

**Interfaces:**
- Consumes: tudo que a Task 7 exporta de `scripts/lib/merge-pair-teams-plan.js`.
- Produces: nada consumido por código — a saída é o de-para em JSON e as escritas no Firestore.

- [ ] **Step 1: Escrever o script**

Criar `functions/scripts/merge-duplicate-pair-teams.js`:

```js
/* eslint-disable */
/**
 * Funde as equipes duplicadas da MESMA dupla: um doc sobrevive, os outros são
 * absorvidos e apagados, e tudo que apontava para eles passa a apontar para o
 * sobrevivente.
 *
 * POR QUE existe: até `resolvePairTeamTx` entrar no ar, cada inscrição criava
 * uma equipe nova. Como `teamRankings` é chaveado pelo id da equipe, a mesma
 * dupla aparece duas vezes no ranking com metade da história em cada entrada.
 *
 * ORDEM DE ROLLOUT: backfill-team-pair-key.js -> deploy (functions + rules) ->
 * ESTE script. Rodar antes do deploy funciona, mas o sangramento continua.
 *
 * O inventário abaixo veio de varredura real do dev. `matches/{id}/pointEvents`
 * (usa `side: "A"/"B"`) e `matches/{id}/auditLog` (usa `byUid`) NÃO guardam
 * teamId e por isso não são tocados.
 *
 * Uso (na pasta functions/):
 *   node scripts/merge-duplicate-pair-teams.js --project volley-track-dev-4596c
 *   node scripts/merge-duplicate-pair-teams.js --project <id> --apply
 */
const fs = require("fs");
const admin = require("firebase-admin");
const {
  groupTeamsByPair,
  planGroupMerge,
  mergeTeamRankingDocs,
} = require("./lib/merge-pair-teams-plan.js");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error("Informe --project <projectId>");
  process.exit(1);
}
const apply = process.argv.includes("--apply");

admin.initializeApp({projectId});
const db = admin.firestore();
const base = `artifacts/${projectId}/public/data`;

/** Troca `from` por `to` em qualquer string aninhada; devolve null se nada mudou. */
function remap(value, from, to) {
  if (typeof value === "string") return value === from ? to : null;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const next = remap(item, from, to);
      if (next === null) return item;
      changed = true;
      return next;
    });
    return changed ? out : null;
  }
  if (value && typeof value === "object" && typeof value.toDate !== "function") {
    let changed = false;
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      const next = remap(inner, from, to);
      if (next === null) {
        out[key] = inner;
      } else {
        out[key] = next;
        changed = true;
      }
    }
    return changed ? out : null;
  }
  return null;
}

const SIMPLE_COLLECTIONS = [
  `${base}/matches`,
  `${base}/inscriptions`,
  `${base}/drawSessions`,
  "tournaments",
  "tournamentRegistrationInvites",
  "tournamentRegistrationCancellations",
];

(async () => {
  const teamsSnap = await db.collection(`${base}/teams`).get();
  const groups = groupTeamsByPair(
    teamsSnap.docs.map((doc) => ({id: doc.id, data: doc.data()})),
  );
  const duplicated = [...groups.entries()].filter(([, members]) => members.length > 1);
  console.log(`equipes=${teamsSnap.size} pares=${groups.size} pares com 2+ docs=${duplicated.length}`);
  if (duplicated.length === 0) {
    console.log("nada a fundir.");
    return;
  }

  // Carrega uma vez tudo que pode apontar para uma equipe.
  const loaded = new Map();
  for (const path of SIMPLE_COLLECTIONS) {
    loaded.set(path, await db.collection(path).get());
  }
  const resultsSnap = await db.collection(`${base}/tournamentCategoryResults`).get();
  const rankingsSnap = await db.collection(`${base}/teamRankings`).get();

  // Em que torneios cada equipe está — é o que separa duplicação de convivência
  // legítima (o par em duas categorias do MESMO torneio).
  const tournamentsByTeamId = {};
  // `planGroupMerge` distingue "está em zero torneios" de "não sei em quais":
  // o vazio tem de ser DECLARADO. Toda equipe de grupo duplicado entra no mapa
  // antes da varredura, nem que seja com `[]` — sem isso, a equipe órfã (sem
  // inscrição nenhuma) sairia como `dados-incompletos` e nunca fundiria.
  for (const [, members] of duplicated) {
    for (const member of members) tournamentsByTeamId[member.id] = [];
  }
  for (const doc of loaded.get(`${base}/inscriptions`).docs) {
    const data = doc.data();
    const teamId = String(data.teamId ?? "").trim();
    const tournamentId = String(data.tournamentId ?? "").trim();
    if (!teamId || !tournamentId) continue;
    if (!tournamentsByTeamId[teamId]) tournamentsByTeamId[teamId] = [];
    if (!tournamentsByTeamId[teamId].includes(tournamentId)) {
      tournamentsByTeamId[teamId].push(tournamentId);
    }
  }

  const refCountByTeamId = {};
  const countRef = (teamId) => {
    refCountByTeamId[teamId] = (refCountByTeamId[teamId] || 0) + 1;
  };
  for (const [, snap] of loaded) {
    for (const doc of snap.docs) {
      const text = JSON.stringify(doc.data());
      for (const [, members] of duplicated) {
        for (const member of members) {
          if (text.includes(`"${member.id}"`)) countRef(member.id);
        }
      }
    }
  }
  for (const doc of resultsSnap.docs) {
    const teamId = String(doc.data().teamId ?? "").trim();
    if (teamId) countRef(teamId);
  }

  // DUAS listas, nunca uma. Apagar é sempre a ÚLTIMA fase: se a fase de
  // repontamento falhar no meio, o doc antigo continua vivo e as inscrições
  // seguem resolvendo. O contrário (apagar antes) deixaria inscrição órfã —
  // some da listagem e trava no `inscriptionParticipantUidsMatchTeam`.
  const mapping = [];
  const remaps = [];
  const removals = [];
  for (const [pairKey, members] of duplicated) {
    const plan = planGroupMerge({members, tournamentsByTeamId, refCountByTeamId});
    if (plan.skipped) {
      console.log(`PULADO ${pairKey}: ${plan.reason} (${members.map((m) => m.id).join(", ")})`);
      continue;
    }
    mapping.push({pairKey, survivorId: plan.survivorId, absorbedIds: plan.absorbedIds});
    console.log(`${pairKey}: ${plan.absorbedIds.join(", ")} -> ${plan.survivorId}`);

    for (const absorbedId of plan.absorbedIds) {
      for (const [, snap] of loaded) {
        for (const doc of snap.docs) {
          const next = remap(doc.data(), absorbedId, plan.survivorId);
          if (next) remaps.push({ref: doc.ref, data: next});
        }
      }

      for (const doc of resultsSnap.docs) {
        const data = doc.data();
        if (String(data.teamId ?? "").trim() !== absorbedId) continue;
        const newId = `${data.tournamentId}_${data.categoryId}_${plan.survivorId}`;
        remaps.push({
          ref: db.doc(`${base}/tournamentCategoryResults/${newId}`),
          data: {...data, teamId: plan.survivorId},
        });
        removals.push(doc.ref);
      }

      removals.push(db.doc(`${base}/teams/${absorbedId}`));
    }

    const survivorRanking =
      rankingsSnap.docs.find((d) => d.id === plan.survivorId)?.data() ?? null;
    const absorbedRankings = plan.absorbedIds
      .map((id) => rankingsSnap.docs.find((d) => d.id === id)?.data())
      .filter(Boolean);
    if (survivorRanking || absorbedRankings.length > 0) {
      const merged = mergeTeamRankingDocs(survivorRanking, absorbedRankings);
      remaps.push({
        ref: db.doc(`${base}/teamRankings/${plan.survivorId}`),
        data: {
          ...(survivorRanking || {}),
          teamId: plan.survivorId,
          ...merged,
          lastUpdated: admin.firestore.Timestamp.now(),
        },
      });
      for (const id of plan.absorbedIds) {
        removals.push(db.doc(`${base}/teamRankings/${id}`));
      }
    }
  }

  console.log(`\nfase 1 (repontar): ${remaps.length} escritas`);
  console.log(`fase 3 (apagar):   ${removals.length} remoções`);
  if (!apply) {
    console.log("(dry-run) nada foi gravado. Rode de novo com --apply.");
    return;
  }

  const absorbedAll = new Set(mapping.flatMap((m) => m.absorbedIds));
  const VERIFY_PATHS = [
    ...SIMPLE_COLLECTIONS,
    `${base}/tournamentCategoryResults`,
    `${base}/teamRankings`,
  ];

  // ── Fase 1: repontar. Nenhuma remoção acontece aqui. ──────────────────────
  let done = 0;
  while (done < remaps.length) {
    const chunk = remaps.slice(done, done + 400);
    const batch = db.batch();
    for (const write of chunk) batch.set(write.ref, write.data);
    await batch.commit();
    done += chunk.length;
    console.log(`fase 1: ${done}/${remaps.length}`);
  }

  // ── Fase 2: provar que nada mais cita um id absorvido. ────────────────────
  let leftovers = 0;
  for (const path of VERIFY_PATHS) {
    const snap = await db.collection(path).get();
    for (const doc of snap.docs) {
      const text = `${doc.id} ${JSON.stringify(doc.data())}`;
      for (const id of absorbedAll) {
        if (text.includes(id)) {
          console.error(`SOBRA: ${path}/${doc.id} ainda cita ${id}`);
          leftovers += 1;
        }
      }
    }
  }
  if (leftovers > 0) {
    console.error(`\nFALHOU na fase 2: ${leftovers} sobra(s). NADA foi apagado —`);
    console.error("os docs absorvidos continuam vivos e as inscrições seguem íntegras.");
    process.exit(1);
  }
  console.log("fase 2: nenhuma sobra.");

  // ── Fase 3: guarda-costas por inscrição, e só então apagar. ───────────────
  for (const id of absorbedAll) {
    const stillUsed = await db
      .collection(`${base}/inscriptions`)
      .where("teamId", "==", id)
      .get();
    if (!stillUsed.empty) {
      console.error(
        `ABORTADO: ${stillUsed.size} inscrição(ões) ainda apontam para teams/${id}.`,
      );
      console.error("Nada foi apagado. Rode o script de novo.");
      process.exit(1);
    }
  }

  let removed = 0;
  while (removed < removals.length) {
    const chunk = removals.slice(removed, removed + 400);
    const batch = db.batch();
    for (const ref of chunk) batch.delete(ref);
    await batch.commit();
    removed += chunk.length;
    console.log(`fase 3: ${removed}/${removals.length}`);
  }

  const file = `merge-pair-teams-${projectId}-${Date.now()}.json`;
  fs.writeFileSync(file, JSON.stringify(mapping, null, 2));
  console.log(`de-para salvo em ${file}`);
  console.log("fusão concluída.");
})().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Rodar em dry-run no dev e conferir o plano**

```bash
node scripts/merge-duplicate-pair-teams.js --project volley-track-dev-4596c
```

Esperado: `pares com 2+ docs=9`, nove linhas de `absorvido -> sobrevivente`, nenhum `PULADO`, e
entre elas a linha do par `36uIDqSP8rr1xjYaUk30` / `TF9W6z6rjbwIgvFpD4kV` (o único com história
dos dois lados). Conferir que `Vet7ZG0MD59sGlN7SODy` sobrevive no seu par — é o que tem 400 pts e
4 partidas, contra 0 e 0 do `B3w4BPoRw0aszmy4QNtp`.

- [ ] **Step 3: Rodar em dry-run no prod**

```bash
node scripts/merge-duplicate-pair-teams.js --project volley-track-2dd3b
```

Esperado: `pares com 2+ docs=0` e `nada a fundir.` — é a prova de que prod não precisa deste script.

- [ ] **Step 4: Commit**

```bash
git add functions/scripts/merge-duplicate-pair-teams.js
git commit -m "feat: script de fusão das duplas duplicadas"
```

---

### Task 9: Execução do rollout no dev

Só depois das Tasks 1-8 estarem commitadas e com a suíte verde. Cada passo aqui escreve em banco
de verdade.

**Files:** nenhum — é execução.

- [ ] **Step 1: Linha de base da integridade e suíte verde**

```bash
node scripts/check-registration-team-integrity.js --project volley-track-dev-4596c
```

Anotar os números — nenhuma etapa seguinte pode fazê-los crescer.

- [ ] **Step 1b: Suíte inteira verde**

```bash
npm run lint && npm test
```

Esperado: compila e todos os testes passam. Não seguir se algo falhar.

- [ ] **Step 2: Backfill do `pairKey` no dev**

```bash
node scripts/backfill-team-pair-key.js --project volley-track-dev-4596c --apply
```

Esperado: `a gravar: 207` e `pronto.`

- [ ] **Step 3: Deploy das Functions e das rules no dev**

```bash
npx firebase deploy --only functions,firestore:rules --project volley-track-dev-4596c
```

Esperado: `Successful update` (ou `Successful create`) para cada função tocada. Atenção: "No
changes detected" depois de uma falha parcial mente — se alguma função falhar, redeployar por nome
com `--force` e exigir a linha de sucesso.

- [ ] **Step 4: Reconferir a integridade depois do deploy**

```bash
node scripts/check-registration-team-integrity.js --project volley-track-dev-4596c
```

Esperado: `integridade OK` (zero quebradas), igual à linha de base. Qualquer quebrada aqui
significa que o deploy mexeu em inscrição existente, o que não devia — parar.

- [ ] **Step 5: Fusão dos duplicados no dev**

```bash
node scripts/merge-duplicate-pair-teams.js --project volley-track-dev-4596c
```

Conferir o plano impresso e só então:

```bash
node scripts/merge-duplicate-pair-teams.js --project volley-track-dev-4596c --apply
```

Esperado: `fase 2: nenhuma sobra.`, `fase 3: N/N` e `fusão concluída.`

Se parar na fase 2 (`SOBRA:`) ou na fase 3 (`ABORTADO:`), **nada foi apagado** e as inscrições
seguem íntegras — investigar e rodar de novo. Nunca apagar doc de equipe à mão para "destravar".

- [ ] **Step 6: Provar que nenhuma inscrição quebrou**

```bash
node scripts/check-registration-team-integrity.js --project volley-track-dev-4596c
```

Esperado: `integridade OK` — zero em `equipe inexistente` e zero em `elenco divergente`. Este é o
portão da exigência do dono: uma única quebrada aqui é regressão, e o de-para salvo pelo script diz
exatamente qual equipe absorveu qual para desfazer.

- [ ] **Step 7: Conferir que não sobrou duplicado**

```bash
node scripts/merge-duplicate-pair-teams.js --project volley-track-dev-4596c
```

Esperado agora: `pares com 2+ docs=0`.

- [ ] **Step 8: Backfill e deploy no prod**

```bash
node scripts/backfill-team-pair-key.js --project volley-track-2dd3b --apply
npx firebase deploy --only functions,firestore:rules --project volley-track-2dd3b
```

Esperado: `a gravar: 5` e deploy com sucesso. **Não** rodar o script de fusão no prod — o dry-run
da Task 8 já provou que não há o que fundir.

---

## Notas para quem executa

- As Tasks 1-8 são código e podem ser feitas em qualquer sessão. A Task 9 escreve em banco de
  produção de atletas reais (o dev É a base real: o app das lojas aponta para lá) — confirmar com
  o dono antes de cada `--apply`.
- O prazo real é **26/09**: quando o Goiânia Open encerrar, os 8 pares hoje com 0 ponto no segundo
  doc passam a ter ranking rachado de verdade, e a fusão fica mais cara.
- Se algum teste existente quebrar nas Tasks 4 ou 5, o helper mudou comportamento além da
  identidade — é bug do helper, não do teste. Não editar o teste antigo para passar.
