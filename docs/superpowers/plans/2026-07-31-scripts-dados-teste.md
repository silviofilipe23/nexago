# Scripts de dados de teste (criar + apagar) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dois comandos simétricos em `functions/scripts/` — um que cria todo o cenário de teste (organizador + 320 atletas + torneio + 160 duplas + inscrições pagas) e outro que apaga tudo em cascata, sem deixar documentos órfãos.

**Architecture:** A lógica pura e arriscada (decidir o que apagar, detectar contaminação com dados reais) vai para `functions/src/test-data-cleanup.ts` com testes unitários, seguindo o padrão já usado por `tournament-collected-stats.ts`. Os scripts em `functions/scripts/` ficam só com I/O e orquestração, consumindo a saída compilada em `functions/lib/`. Os seeds existentes são refatorados minimamente (extração de lib + args injetáveis) sem mudar comportamento.

**Tech Stack:** Node 22, `firebase-admin` 13.x (Firestore + Auth), TypeScript 5.7 para a lógica pura, `node:test` + `node:assert/strict` para os testes.

**Spec:** [`docs/superpowers/specs/2026-07-31-scripts-dados-teste-design.md`](../specs/2026-07-31-scripts-dados-teste-design.md)

## Global Constraints

- **Português nas mensagens de terminal, inglês no código** (convenção do `CLAUDE.md` do projeto).
- **Nenhum comando existente pode mudar de comportamento.** `seed-athletes.js`, `seed-tournament-with-enrollments.js`, `seed-tournament-today-with-enrollments.js` e `delete-seed-athletes.js` continuam funcionando exatamente como hoje.
- **Todos os scripts são dry-run por padrão.** Só escrevem/apagam com `--yes`.
- **Projeto de produção:** `volley-track-2dd3b`. Projeto de dev: `volley-track-dev-4596c`. O script de delete aborta em produção.
- **Scripts em `functions/scripts/` usam CommonJS** (`require`/`module.exports`) e começam com `/* eslint-disable */`, como todos os existentes.
- **`functions/src/` é TypeScript**, compilado para `functions/lib/` por `npm run build`. Scripts importam de `../lib/`, nunca de `../src/`.
- **Marcadores de dado de teste:** `seedTestAthlete: true` (atletas), `seedTestOrganizer: true` (organizador), `seedTestTournament: true` (torneio).
- Rodar `npm run build` dentro de `functions/` antes de qualquer execução de script.
- Todos os comandos deste plano rodam a partir de `functions/`.

---

### Task 1: Lógica pura de limpeza (`test-data-cleanup`)

O coração do risco do projeto: decidir o que apagar. Um bug aqui apaga dado real. Por isso essa lógica é pura, fica em `src/` e nasce com testes.

**Files:**
- Create: `functions/src/test-data-cleanup.ts`
- Test: `functions/src/test-data-cleanup.test.ts`

**Interfaces:**
- Consumes: nada (módulo folha, sem dependências).
- Produces:
  - `chunkList<T>(items: T[], size: number): T[][]`
  - `interface CleanupInscription { id: string; tournamentId: string; teamId?: string; participantUids?: unknown; player1Id?: unknown }`
  - `inscriptionParticipantUids(inscription: CleanupInscription): string[]`
  - `interface CleanupPlan { seedInscriptionIds: string[]; teamIds: string[]; realAthleteUids: string[]; preservedAthleteUids: string[]; deletableAthleteUids: string[] }`
  - `partitionCleanupTargets(input: { inscriptions: CleanupInscription[]; seedAthleteUids: string[]; seedTournamentIds: string[] }): CleanupPlan`

- [ ] **Step 1: Escrever os testes que falham**

Criar `functions/src/test-data-cleanup.test.ts`:

```ts
import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
  chunkList,
  inscriptionParticipantUids,
  partitionCleanupTargets,
} from "./test-data-cleanup";

describe("test-data-cleanup", () => {
  it("chunkList divide em blocos do tamanho pedido", () => {
    assert.deepEqual(chunkList([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(chunkList([], 3), []);
    assert.deepEqual(chunkList([1, 2], 10), [[1, 2]]);
  });

  it("inscriptionParticipantUids junta participantUids e player1Id legado", () => {
    assert.deepEqual(
      inscriptionParticipantUids({
        id: "i1",
        tournamentId: "t1",
        participantUids: ["a", "b"],
      }),
      ["a", "b"],
    );

    // Doc legado: só player1Id.
    assert.deepEqual(
      inscriptionParticipantUids({id: "i2", tournamentId: "t1", player1Id: "c"}),
      ["c"],
    );

    // Sem duplicar quando player1Id já está em participantUids.
    assert.deepEqual(
      inscriptionParticipantUids({
        id: "i3",
        tournamentId: "t1",
        participantUids: ["a", "b"],
        player1Id: "a",
      }),
      ["a", "b"],
    );

    // Lixo é ignorado, não quebra.
    assert.deepEqual(
      inscriptionParticipantUids({
        id: "i4",
        tournamentId: "t1",
        participantUids: ["a", "", null, 42],
        player1Id: "  ",
      }),
      ["a"],
    );
  });

  it("partitionCleanupTargets separa inscrições e teams do torneio seed", () => {
    const plan = partitionCleanupTargets({
      inscriptions: [
        {id: "i1", tournamentId: "seed1", teamId: "tm1", participantUids: ["s1", "s2"]},
        {id: "i2", tournamentId: "seed1", teamId: "tm2", participantUids: ["s3", "s4"]},
        {id: "i3", tournamentId: "real1", teamId: "tm9", participantUids: ["r1", "r2"]},
      ],
      seedAthleteUids: ["s1", "s2", "s3", "s4"],
      seedTournamentIds: ["seed1"],
    });

    assert.deepEqual(plan.seedInscriptionIds, ["i1", "i2"]);
    assert.deepEqual(plan.teamIds, ["tm1", "tm2"]);
    assert.deepEqual(plan.realAthleteUids, []);
    assert.deepEqual(plan.preservedAthleteUids, []);
    assert.deepEqual(plan.deletableAthleteUids, ["s1", "s2", "s3", "s4"]);
  });

  it("partitionCleanupTargets acusa atleta real inscrito em torneio seed", () => {
    const plan = partitionCleanupTargets({
      inscriptions: [
        {id: "i1", tournamentId: "seed1", teamId: "tm1", participantUids: ["s1", "REAL"]},
      ],
      seedAthleteUids: ["s1"],
      seedTournamentIds: ["seed1"],
    });

    assert.deepEqual(plan.realAthleteUids, ["REAL"]);
    // O atleta real nunca entra na lista de apagáveis.
    assert.deepEqual(plan.deletableAthleteUids, ["s1"]);
  });

  it("partitionCleanupTargets preserva atleta seed inscrito em torneio real", () => {
    const plan = partitionCleanupTargets({
      inscriptions: [
        {id: "i1", tournamentId: "seed1", teamId: "tm1", participantUids: ["s1", "s2"]},
        {id: "i2", tournamentId: "real1", teamId: "tm9", participantUids: ["s2", "r1"]},
      ],
      seedAthleteUids: ["s1", "s2"],
      seedTournamentIds: ["seed1"],
    });

    // s2 joga um torneio de verdade → não pode ser apagado.
    assert.deepEqual(plan.preservedAthleteUids, ["s2"]);
    assert.deepEqual(plan.deletableAthleteUids, ["s1"]);
    // A inscrição do torneio seed continua sendo apagada.
    assert.deepEqual(plan.seedInscriptionIds, ["i1"]);
    // r1 é real mas está só em torneio real → não é contaminação.
    assert.deepEqual(plan.realAthleteUids, []);
  });

  it("partitionCleanupTargets ignora teamId ausente e não duplica uids", () => {
    const plan = partitionCleanupTargets({
      inscriptions: [
        {id: "i1", tournamentId: "seed1", participantUids: ["s1"]},
        {id: "i2", tournamentId: "seed1", teamId: "tm1", participantUids: ["s1"]},
        {id: "i3", tournamentId: "seed1", teamId: "tm1", participantUids: ["s1"]},
      ],
      seedAthleteUids: ["s1"],
      seedTournamentIds: ["seed1"],
    });

    assert.deepEqual(plan.teamIds, ["tm1"]);
    assert.deepEqual(plan.deletableAthleteUids, ["s1"]);
  });

  it("partitionCleanupTargets devolve tudo vazio quando não há torneio seed", () => {
    const plan = partitionCleanupTargets({
      inscriptions: [
        {id: "i1", tournamentId: "real1", teamId: "tm9", participantUids: ["r1"]},
      ],
      seedAthleteUids: [],
      seedTournamentIds: [],
    });

    assert.deepEqual(plan.seedInscriptionIds, []);
    assert.deepEqual(plan.teamIds, []);
    assert.deepEqual(plan.realAthleteUids, []);
    assert.deepEqual(plan.preservedAthleteUids, []);
    assert.deepEqual(plan.deletableAthleteUids, []);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```bash
cd functions && npm run build && node --test lib/test-data-cleanup.test.js
```

Esperado: falha na compilação (`npm run build`) com `Cannot find module './test-data-cleanup'` — o arquivo de implementação ainda não existe.

- [ ] **Step 3: Implementar**

Criar `functions/src/test-data-cleanup.ts`:

```ts
/**
 * Lógica pura da limpeza de dados de teste (`scripts/delete-test-data.js`).
 *
 * Fica aqui, e não no script, porque um erro nessas decisões apaga dado real:
 * a separação entre "é seed, pode apagar" e "é de verdade, preserve" precisa
 * de teste. O script cuida só de I/O.
 */

/** Divide uma lista em blocos de no máximo `size` itens. */
export function chunkList<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Campos de `inscriptions` usados pelas decisões de limpeza. */
export interface CleanupInscription {
  id: string;
  tournamentId: string;
  teamId?: string;
  participantUids?: unknown;
  player1Id?: unknown;
}

function cleanUid(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Uids de participantes de uma inscrição. Docs antigos têm só `player1Id`;
 * os atuais têm `participantUids` — considerar os dois evita deixar atleta
 * de fora das checagens de contaminação.
 */
export function inscriptionParticipantUids(
  inscription: CleanupInscription,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const raw = Array.isArray(inscription.participantUids) ?
    inscription.participantUids :
    [];
  for (const item of raw) {
    const uid = cleanUid(item);
    if (uid && !seen.has(uid)) {
      seen.add(uid);
      out.push(uid);
    }
  }

  const legacy = cleanUid(inscription.player1Id);
  if (legacy && !seen.has(legacy)) {
    seen.add(legacy);
    out.push(legacy);
  }

  return out;
}

/** O que a limpeza deve apagar e o que precisa preservar. */
export interface CleanupPlan {
  /** Inscrições dos torneios seed — apagar. */
  seedInscriptionIds: string[];
  /** Duplas referenciadas por essas inscrições — apagar. */
  teamIds: string[];
  /** Atletas NÃO-seed inscritos em torneio seed — motivo de abortar. */
  realAthleteUids: string[];
  /** Atletas seed inscritos em torneio real — preservar (doc, espelho e Auth). */
  preservedAthleteUids: string[];
  /** Atletas seed seguros para apagar. */
  deletableAthleteUids: string[];
}

/**
 * Cruza inscrições, atletas seed e torneios seed para decidir a limpeza.
 *
 * `inscriptions` deve conter TODAS as inscrições do projeto, não só as dos
 * torneios seed: é justamente a presença de um atleta seed numa inscrição de
 * torneio real que o torna impossível de apagar.
 */
export function partitionCleanupTargets(input: {
  inscriptions: CleanupInscription[];
  seedAthleteUids: string[];
  seedTournamentIds: string[];
}): CleanupPlan {
  const seedAthletes = new Set(input.seedAthleteUids.map(cleanUid).filter(Boolean));
  const seedTournaments = new Set(
    input.seedTournamentIds.map(cleanUid).filter(Boolean),
  );

  const seedInscriptionIds: string[] = [];
  const teamIds: string[] = [];
  const seenTeamIds = new Set<string>();
  const realAthleteUids: string[] = [];
  const seenRealUids = new Set<string>();
  const preservedAthleteUids: string[] = [];
  const seenPreservedUids = new Set<string>();

  for (const inscription of input.inscriptions) {
    const tournamentId = cleanUid(inscription.tournamentId);
    const isSeedTournament = seedTournaments.has(tournamentId);
    const participants = inscriptionParticipantUids(inscription);

    if (isSeedTournament) {
      seedInscriptionIds.push(inscription.id);

      const teamId = cleanUid(inscription.teamId);
      if (teamId && !seenTeamIds.has(teamId)) {
        seenTeamIds.add(teamId);
        teamIds.push(teamId);
      }

      for (const uid of participants) {
        if (!seedAthletes.has(uid) && !seenRealUids.has(uid)) {
          seenRealUids.add(uid);
          realAthleteUids.push(uid);
        }
      }
      continue;
    }

    // Torneio real: qualquer atleta seed aqui precisa sobreviver à limpeza.
    for (const uid of participants) {
      if (seedAthletes.has(uid) && !seenPreservedUids.has(uid)) {
        seenPreservedUids.add(uid);
        preservedAthleteUids.push(uid);
      }
    }
  }

  const deletableAthleteUids = [...seedAthletes].filter(
    (uid) => !seenPreservedUids.has(uid),
  );

  return {
    seedInscriptionIds,
    teamIds,
    realAthleteUids,
    preservedAthleteUids,
    deletableAthleteUids,
  };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
cd functions && npm run build && node --test lib/test-data-cleanup.test.js
```

Esperado: `# pass 7`, `# fail 0`.

- [ ] **Step 5: Confirmar que a suíte inteira continua verde**

```bash
cd functions && npm test
```

Esperado: nenhum teste novo quebrado. (Se a suíte já estiver vermelha antes desta task, anotar quais testes e seguir — não é regressão deste plano.)

- [ ] **Step 6: Commit**

```bash
git add functions/src/test-data-cleanup.ts functions/src/test-data-cleanup.test.ts
git commit -m "feat(scripts): logica pura de limpeza de dados de teste"
```

---

### Task 2: Extrair `seed-athletes-lib.js`

`seed-athletes.js` mistura parsing de args, `initializeApp`, lógica e `process.exit` — impossível de chamar de outro script. A lógica sai para uma lib; o script vira wrapper.

**Files:**
- Create: `functions/scripts/seed-athletes-lib.js`
- Modify: `functions/scripts/seed-athletes.js` (vira wrapper fino)

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces:
  - `LEVELS: Array<{code: string, label: string}>` — as 5 do vôlei
  - `GENDERS: Array<{label: string, short: string}>`
  - `generateKeywords(sources: string[]): string[]`
  - `async seedAthletes({db, auth, count, password, city, state, log}): Promise<{total: number}>`
    - `db`: `admin.firestore()` já inicializado
    - `auth`: `admin.auth()` já inicializado
    - `count`: atletas por nível×gênero (default `32`)
    - `password`/`city`/`state`: defaults `"Senha123!"` / `"Goiânia"` / `"GO"`
    - `log`: `(msg: string) => void`, default `console.log`

- [ ] **Step 1: Criar a lib**

Criar `functions/scripts/seed-athletes-lib.js` movendo a lógica de `seed-athletes.js` sem alteração de comportamento. A lib **não** chama `initializeApp` nem `process.exit`.

> **Cuidado com o regex de acentos em `generateKeywords`.** Ele precisa conter a sequência de escape ASCII de 12 caracteres `\u0300-\u036f`, e **não** os caracteres combinantes correspondentes. Os dois renderizam praticamente igual no editor, mas a versão com caracteres literais é destruída por qualquer normalização Unicode do arquivo. Copie a linha direto do `seed-athletes.js` original em vez de digitá-la, e confirme no Step 4.

```js
/* eslint-disable */
/**
 * Lógica compartilhada do seed de atletas de teste.
 *
 * Separada de `seed-athletes.js` para que o orquestrador
 * (`seed-test-data.js`) possa rodar o seed de atletas e o de torneio no
 * mesmo processo. A lib recebe `db`/`auth` prontos e nunca encerra o processo.
 */

const admin = require("firebase-admin");

const LEVELS = [
  {code: "iniciante_1", label: "Iniciante 1"},
  {code: "iniciante_2", label: "Iniciante 2"},
  {code: "intermediario_1", label: "Intermediário 1"},
  {code: "intermediario_2", label: "Intermediário 2"},
  {code: "open", label: "Open"},
];
const GENDERS = [
  {label: "Masculino", short: "m"},
  {label: "Feminino", short: "f"},
];

const SPORT_LABEL = "Vôlei de praia";
const PRIMARY_SPORT = "VOLEI_PRAIA";

/** Prefixos de busca (espelha o comportamento de keywords do app). */
function generateKeywords(sources) {
  const set = new Set();
  for (const raw of sources) {
    const norm = String(raw || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    if (!norm) continue;
    for (const word of norm.split(/\s+/)) {
      for (let i = 1; i <= word.length && i <= 20; i++) {
        set.add(word.slice(0, i));
      }
    }
  }
  return [...set].sort().slice(0, 200);
}

function birthDateForLevel(idx) {
  // Adultos por padrão (varia o dia/ano só para ter dados distintos).
  const year = 1990 + (idx % 12); // 1990..2001
  const month = String((idx % 12) + 1).padStart(2, "0");
  const day = String((idx % 27) + 1).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function phoneFor(seq) {
  // 62 + 9 + 8 dígitos = 11 dígitos (WhatsApp válido).
  return `629${String(seq).padStart(8, "0")}`;
}

async function ensureAuthUser(auth, email, displayName, password) {
  let uid;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
  } catch (e) {
    const created = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: true,
    });
    uid = created.uid;
  }
  await auth.setCustomUserClaims(uid, {role: "athlete", roles: ["athlete"]});
  return uid;
}

/**
 * Cria/atualiza `count` atletas por (nível × gênero). Idempotente: se o
 * e-mail já existe no Auth, reaproveita o uid e só atualiza o perfil.
 */
async function seedAthletes({
  db,
  auth,
  count = 32,
  password = "Senha123!",
  city = "Goiânia",
  state = "GO",
  log = console.log,
}) {
  let total = 0;
  let seq = 1;
  for (const level of LEVELS) {
    for (const gender of GENDERS) {
      for (let n = 1; n <= count; n++) {
        const nn = String(n).padStart(2, "0");
        const fullName = `Atleta ${level.label} ${gender.label} ${nn}`;
        const email = `seed-${level.code}-${gender.short}-${nn}@nexago.test`;
        const phone = phoneFor(seq);
        const birthDate = birthDateForLevel(n);

        const uid = await ensureAuthUser(auth, email, fullName, password);

        const profile = {
          fullName,
          email,
          gender: gender.label,
          role: "athlete",
          roles: ["athlete"],
          hasAthleteRole: true,
          phoneNumber: phone,
          birthDate,
          city,
          state,
          isProfileComplete: true,
          onboardingCompleted: true,
          sport: SPORT_LABEL,
          level: level.label,
          sportProfile: {level: level.code},
          sports: [],
          primarySportFirestoreId: PRIMARY_SPORT,
          secondarySportFirestoreIds: [],
          levelsBySportFirestore: {[PRIMARY_SPORT]: level.code},
          sportOnboarding: {
            version: 1,
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            primarySportId: PRIMARY_SPORT,
            secondarySportIds: [],
            levelsBySport: {[PRIMARY_SPORT]: level.code},
            goals: ["COMPETIR"],
          },
          keywords: generateKeywords([fullName, city]),
          seedTestAthlete: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await db.doc(`users/${uid}`).set(profile, {merge: true});
        total += 1;
        seq += 1;
        if (total % 20 === 0) log(`  ... ${total} atletas`);
      }
    }
  }
  return {total};
}

module.exports = {
  LEVELS,
  GENDERS,
  generateKeywords,
  seedAthletes,
};
```

- [ ] **Step 2: Reescrever `seed-athletes.js` como wrapper**

Substituir o conteúdo inteiro de `functions/scripts/seed-athletes.js`:

```js
/* eslint-disable */
/**
 * Seed de atletas de teste: cria contas no Auth + perfil completo em users/{uid}.
 *
 * Gera COUNT atletas por (nível × gênero). Níveis: escada de 5 do vôlei
 * (Iniciante 1/2, Intermediário 1/2, Open). Gêneros: Masculino, Feminino.
 * Padrão: 32 por combinação (= 320).
 *
 * A lógica vive em `seed-athletes-lib.js`, compartilhada com
 * `seed-test-data.js`. Este arquivo é só o wrapper de linha de comando.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login      # ADC
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-athletes.js --project volley-track-dev-4596c
 *   COUNT=10 node scripts/seed-athletes.js --project <projectId>
 *
 * Idempotente: se o e-mail já existe no Auth, reaproveita o uid e só atualiza o perfil.
 */

const admin = require("firebase-admin");
const {seedAthletes} = require("./seed-athletes-lib");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

const COUNT = parseInt(process.env.COUNT || "32", 10);
const PASSWORD = process.env.SEED_PASSWORD || "Senha123!";
const CITY = process.env.SEED_CITY || "Goiânia";
const STATE = process.env.SEED_STATE || "GO";

admin.initializeApp({projectId});

seedAthletes({
  db: admin.firestore(),
  auth: admin.auth(),
  count: COUNT,
  password: PASSWORD,
  city: CITY,
  state: STATE,
})
  .then(({total}) => {
    console.log(`OK: ${total} atletas criados/atualizados em ${projectId}.`);
    console.log(
      `Login: e-mails seed-<nivel>-<m|f>-NN@nexago.test / senha ${PASSWORD}`,
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error("Falha no seed:", err);
    process.exit(1);
  });
```

- [ ] **Step 3: Verificar que o wrapper carrega e valida args como antes**

```bash
cd functions && node scripts/seed-athletes.js
```

Esperado: sai com código 1 e imprime `Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).` — exatamente como antes da refatoração. Nenhuma chamada ao Firebase acontece.

- [ ] **Step 4: Verificar que a lib exporta o esperado**

```bash
cd functions && node -e "const l=require('./scripts/seed-athletes-lib');console.log(Object.keys(l).join(','), l.LEVELS.length, l.GENDERS.length, l.generateKeywords(['João Silva']).slice(0,3).join('|'))"
```

Esperado: `LEVELS,GENDERS,generateKeywords,seedAthletes 5 2 j|jo|joa`

- [ ] **Step 5: Commit**

```bash
git add functions/scripts/seed-athletes-lib.js functions/scripts/seed-athletes.js
git commit -m "refactor(scripts): extrai seed-athletes-lib para reuso"
```

---

### Task 3: Args injetáveis no seed de torneio

`runTournamentEnrollmentSeed` chama `parseSeedArgs` internamente, que lê `process.argv`, chama `initializeApp` e faz `process.exit(1)`. O orquestrador precisa passar seus próprios valores (o uid do organizador que ele acabou de criar).

**Files:**
- Modify: `functions/scripts/seed-tournament-enrollments-lib.js:521-536` (assinatura de `runTournamentEnrollmentSeed`)

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces: `runTournamentEnrollmentSeed({defaultTournamentName, buildTournamentDoc, extraLogLines?, args?})` — `args`, quando presente, é `{APPLY: boolean, projectId: string, MANAGER_UID: string, TOURNAMENT_NAME: string}` e substitui a chamada a `parseSeedArgs`. Ausente = comportamento atual, inalterado.

- [ ] **Step 1: Adicionar o parâmetro opcional**

Em `functions/scripts/seed-tournament-enrollments-lib.js`, trocar o início de `runTournamentEnrollmentSeed`:

```js
async function runTournamentEnrollmentSeed({
  defaultTournamentName,
  buildTournamentDoc,
  extraLogLines = () => [],
}) {
  const {APPLY, projectId, MANAGER_UID, TOURNAMENT_NAME} =
    parseSeedArgs(defaultTournamentName);
  const db = admin.firestore();
```

por:

```js
/**
 * @param {object} options
 * @param {object} [options.args] Args já resolvidos pelo chamador
 *   (`{APPLY, projectId, MANAGER_UID, TOURNAMENT_NAME}`). Quando ausente,
 *   lê de `process.argv` via `parseSeedArgs` — comportamento dos wrappers
 *   de linha de comando. Injetar permite ao `seed-test-data.js` reusar o
 *   admin já inicializado e o uid do organizador que ele mesmo criou.
 */
async function runTournamentEnrollmentSeed({
  defaultTournamentName,
  buildTournamentDoc,
  extraLogLines = () => [],
  args,
}) {
  const {APPLY, projectId, MANAGER_UID, TOURNAMENT_NAME} =
    args || parseSeedArgs(defaultTournamentName);
  const db = admin.firestore();
```

- [ ] **Step 2: Verificar que os wrappers existentes não mudaram**

```bash
cd functions && node scripts/seed-tournament-with-enrollments.js
```

Esperado: sai com código 1 e imprime `Informe o projeto: --project <projectId>` — o caminho `parseSeedArgs` continua ativo quando `args` não é passado.

- [ ] **Step 3: Verificar que `args` injetado curto-circuita o parsing**

```bash
cd functions && node -e "
const lib = require('./scripts/seed-tournament-enrollments-lib');
lib.runTournamentEnrollmentSeed({
  defaultTournamentName: 'x',
  buildTournamentDoc: () => ({}),
  args: {APPLY: false, projectId: 'p', MANAGER_UID: 'm', TOURNAMENT_NAME: 'n'},
}).catch((e) => { console.log('ERRO_ESPERADO:', e.code || e.message); process.exit(0); });
"
```

Esperado: **não** imprime `Informe o projeto` nem sai com código 1 no parsing. Ele avança até tentar falar com o Firestore e falha ali (erro de credencial/app não inicializado) — o que prova que os args injetados foram usados. Qualquer saída contendo `Informe o projeto` significa que o Step 1 não pegou.

- [ ] **Step 4: Commit**

```bash
git add functions/scripts/seed-tournament-enrollments-lib.js
git commit -m "refactor(scripts): permite injetar args no seed de torneio"
```

---

### Task 4: `seed-test-data.js` — o orquestrador

**Files:**
- Create: `functions/scripts/seed-test-data.js`

**Interfaces:**
- Consumes: `seedAthletes` de `./seed-athletes-lib` (Task 2); `runTournamentEnrollmentSeed`, `buildTournamentDocFuture`, `buildTournamentDocToday` de `./seed-tournament-enrollments-lib` (Task 3).
- Produces: nada consumido por tasks seguintes. Cria em runtime: `users/{uid}` com `seedTestOrganizer: true`.

- [ ] **Step 1: Escrever o script**

Criar `functions/scripts/seed-test-data.js`:

```js
/* eslint-disable */
/**
 * Cria o cenário de teste completo num comando: organizador + atletas +
 * torneio + duplas + inscrições pagas.
 *
 * Orquestra os seeds existentes (`seed-athletes-lib.js` e
 * `seed-tournament-enrollments-lib.js`) na ordem certa, resolvendo o
 * pré-requisito que antes era manual: sem `--manager-uid`, cria um
 * organizador seed próprio.
 *
 * Volume no padrão (--count 32): 320 atletas → 10 categorias × 16 duplas.
 * O torneio nasce `open`, SEM chave gerada — gerar a chave pelo painel é o
 * fluxo que se quer testar.
 *
 * Pré-requisitos:
 *   npm run build                              # scripts leem de ../lib
 *   gcloud auth application-default login      # ADC
 *   # ou --credentials /caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-test-data.js --project volley-track-dev-4596c        # DRY-RUN
 *   node scripts/seed-test-data.js --project volley-track-dev-4596c --yes  # aplica
 *
 * Limpeza: node scripts/delete-test-data.js --project <id> --yes
 */

const fs = require("fs");
const admin = require("firebase-admin");
const {seedAthletes} = require("./seed-athletes-lib");
const {
  buildTournamentDocFuture,
  buildTournamentDocToday,
  runTournamentEnrollmentSeed,
} = require("./seed-tournament-enrollments-lib");

const DEFAULT_TOURNAMENT_NAME = "Torneio seed nexaGO";
const ORGANIZER_EMAIL = "seed-organizer@nexago.test";
const ORGANIZER_NAME = "Organizador seed nexaGO";
const CITY = "Goiânia";
const STATE = "GO";

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function parseArgs() {
  const APPLY = process.argv.includes("--yes");
  const TODAY = process.argv.includes("--today");
  const projectId =
    argValue("--project") ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
    process.exit(1);
  }

  const managerUid = (argValue("--manager-uid") || "").trim();
  const tournamentName = argValue("--tournament-name") || DEFAULT_TOURNAMENT_NAME;
  const count = parseInt(argValue("--count") || process.env.COUNT || "32", 10);
  if (!Number.isInteger(count) || count < 1) {
    console.error("--count precisa ser um inteiro >= 1.");
    process.exit(1);
  }

  const credentialsPath = (
    argValue("--credentials") ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    ""
  ).trim();

  if (credentialsPath) {
    if (!fs.existsSync(credentialsPath)) {
      console.error(`Arquivo de credenciais não encontrado: ${credentialsPath}`);
      process.exit(1);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
    admin.initializeApp({
      projectId,
      credential: admin.credential.cert(serviceAccount),
    });
  } else if (!admin.apps.length) {
    admin.initializeApp({projectId});
  }

  return {APPLY, TODAY, projectId, managerUid, tournamentName, count};
}

/** Prefixos de busca — mesmo formato de `seed-athletes-lib.generateKeywords`. */
function organizerKeywords() {
  const {generateKeywords} = require("./seed-athletes-lib");
  return generateKeywords([ORGANIZER_NAME, CITY]);
}

/**
 * Garante o organizador seed no Auth + `users/{uid}`. Idempotente.
 * `managerId === uid` é tudo que o ACL de torneio exige
 * (`functions/src/tournament-acl.ts:20`), mas o doc é criado completo para o
 * painel do organizador conseguir renderizar o perfil.
 */
async function ensureSeedOrganizer(db, auth) {
  let uid;
  try {
    const existing = await auth.getUserByEmail(ORGANIZER_EMAIL);
    uid = existing.uid;
  } catch (e) {
    const created = await auth.createUser({
      email: ORGANIZER_EMAIL,
      password: process.env.SEED_PASSWORD || "Senha123!",
      displayName: ORGANIZER_NAME,
      emailVerified: true,
    });
    uid = created.uid;
  }

  await auth.setCustomUserClaims(uid, {roles: ["organizer"]});

  await db.doc(`users/${uid}`).set(
    {
      fullName: ORGANIZER_NAME,
      email: ORGANIZER_EMAIL,
      roles: ["organizer"],
      hasOrganizerRole: true,
      city: CITY,
      state: STATE,
      isProfileComplete: true,
      onboardingCompleted: true,
      keywords: organizerKeywords(),
      seedTestOrganizer: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  return uid;
}

async function run() {
  const {APPLY, TODAY, projectId, managerUid, tournamentName, count} = parseArgs();
  const db = admin.firestore();
  const auth = admin.auth();

  console.log(`Projeto: ${projectId}`);
  console.log(`Modo: ${APPLY ? "APLICAR (--yes)" : "DRY-RUN"}`);
  console.log(`Atletas por nível×gênero: ${count} (total ${count * 10})`);
  console.log(`Torneio: "${tournamentName}" (${TODAY ? "hoje" : "em 14 dias"})`);

  // ── 1. Organizador ────────────────────────────────────────────────────────
  let organizerUid = managerUid;
  if (organizerUid) {
    console.log(`\nOrganizador: ${organizerUid} (informado via --manager-uid)`);
  } else if (!APPLY) {
    console.log(`\nOrganizador: seria criado como ${ORGANIZER_EMAIL}`);
    organizerUid = "<uid-do-organizador-seed>";
  } else {
    organizerUid = await ensureSeedOrganizer(db, auth);
    console.log(`\nOrganizador seed: ${organizerUid} (${ORGANIZER_EMAIL})`);
  }

  // ── 2. Atletas ────────────────────────────────────────────────────────────
  if (!APPLY) {
    console.log(`\nAtletas: seriam criados/atualizados ${count * 10}.`);
  } else {
    console.log("\nCriando atletas...");
    const {total} = await seedAthletes({db, auth, count, city: CITY, state: STATE});
    console.log(`Atletas criados/atualizados: ${total}`);
  }

  // ── 3. Torneio + duplas + inscrições ──────────────────────────────────────
  console.log("\nTorneio e inscrições:");
  await runTournamentEnrollmentSeed({
    defaultTournamentName: tournamentName,
    buildTournamentDoc: (categories, name) =>
      TODAY ?
        buildTournamentDocToday(categories, name) :
        buildTournamentDocFuture(categories, name, 14),
    args: {
      APPLY,
      projectId,
      MANAGER_UID: organizerUid,
      TOURNAMENT_NAME: tournamentName,
    },
  });

  if (!APPLY) {
    console.log("\nDRY-RUN: nada foi gravado. Rode com --yes para aplicar.");
  } else {
    console.log(`\nPronto. Senha dos logins seed: ${process.env.SEED_PASSWORD || "Senha123!"}`);
    console.log("Para limpar: node scripts/delete-test-data.js --project " + projectId + " --yes");
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha no seed de dados de teste:", err);
    process.exit(1);
  });
```

- [ ] **Step 2: Verificar validação de argumentos**

```bash
cd functions && node scripts/seed-test-data.js; echo "exit=$?"
```

Esperado: `Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).` e `exit=1`.

```bash
cd functions && node scripts/seed-test-data.js --project p --count 0; echo "exit=$?"
```

Esperado: `--count precisa ser um inteiro >= 1.` e `exit=1`.

- [ ] **Step 3: Rodar o dry-run contra o dev**

```bash
cd functions && npm run build && node scripts/seed-test-data.js --project volley-track-dev-4596c
```

Esperado: imprime projeto, modo `DRY-RUN`, `total 320`, o nome do torneio, as 10 categorias, e termina com `DRY-RUN: nada foi gravado.` Nenhuma escrita acontece.

- [ ] **Step 4: Aplicar no dev**

```bash
cd functions && node scripts/seed-test-data.js --project volley-track-dev-4596c --yes
```

Esperado: `Atletas criados/atualizados: 320`, `160 duplas inscritas e pagas`, `enrolledCount=160`.

- [ ] **Step 5: Rodar de novo para confirmar idempotência**

```bash
cd functions && node scripts/seed-test-data.js --project volley-track-dev-4596c --yes
```

Esperado: 320 atletas de novo (reaproveitando os uids existentes), torneio **reutilizado** (`Torneio existente reutilizado: <id>`), e `0` novas duplas — porque todos os atletas já estão inscritos. Não pode criar um segundo torneio nem duplicar inscrições.

- [ ] **Step 6: Commit**

```bash
git add functions/scripts/seed-test-data.js
git commit -m "feat(scripts): seed-test-data cria cenario de teste num comando"
```

---

### Task 5: `delete-test-data.js` — guardas, descoberta e dry-run

Metade segura do delete: descobre e relata, sem apagar nada. A metade destrutiva vem na Task 6, para que a descoberta possa ser revisada e testada contra dados reais antes de existir qualquer caminho de escrita.

**Files:**
- Create: `functions/scripts/delete-test-data.js`

**Interfaces:**
- Consumes: `chunkList`, `partitionCleanupTargets` de `../lib/test-data-cleanup` (Task 1).
- Produces: `discover(db, projectId)` e `printReport(discovery)` — consumidos pela Task 6 no mesmo arquivo.

- [ ] **Step 1: Escrever o script (só leitura)**

Criar `functions/scripts/delete-test-data.js`:

```js
/* eslint-disable */
/**
 * Apaga TODOS os dados de teste criados por `seed-test-data.js`, em cascata:
 * matches → inscriptions → teams → tournaments → users → public_profiles → Auth.
 *
 * Filho antes do pai, para nunca deixar documento órfão. Preserva atletas seed
 * que estejam inscritos em torneios reais, e aborta se achar atleta real
 * inscrito num torneio seed.
 *
 * Pré-requisitos:
 *   npm run build                              # lê ../lib/test-data-cleanup
 *   gcloud auth application-default login      # ADC
 *
 * Uso (na pasta functions/):
 *   node scripts/delete-test-data.js --project volley-track-dev-4596c        # DRY-RUN
 *   node scripts/delete-test-data.js --project volley-track-dev-4596c --yes  # apaga
 *
 * `--project` é OBRIGATÓRIO e não tem fallback de env: o alias `default` do
 * .firebaserc aponta para produção, e um fallback silencioso poderia apagar
 * dados reais. Produção é bloqueada de qualquer forma.
 */

const fs = require("fs");
const admin = require("firebase-admin");
const {chunkList, partitionCleanupTargets} = require("../lib/test-data-cleanup");

const PROD_PROJECT_ID = "volley-track-2dd3b";
/** Limite do operador `in` do Firestore. */
const IN_QUERY_LIMIT = 30;
/** Margem sob o teto de 500 operações por batch. */
const BATCH_LIMIT = 450;

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function parseArgs() {
  const APPLY = process.argv.includes("--yes");
  const FORCE = process.argv.includes("--force");

  // Sem fallback de env: ver o comentário do topo.
  const projectId = (argValue("--project") || "").trim();
  if (!projectId) {
    console.error("Informe o projeto explicitamente: --project <projectId>.");
    console.error("Este script não lê GCLOUD_PROJECT — o default do .firebaserc é produção.");
    process.exit(1);
  }
  if (projectId === PROD_PROJECT_ID) {
    console.error(`BLOQUEADO: ${projectId} é o projeto de PRODUÇÃO.`);
    console.error("Este script existe para limpar dados de teste; não rode em produção.");
    process.exit(1);
  }

  const credentialsPath = (
    argValue("--credentials") ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    ""
  ).trim();

  if (credentialsPath) {
    if (!fs.existsSync(credentialsPath)) {
      console.error(`Arquivo de credenciais não encontrado: ${credentialsPath}`);
      process.exit(1);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
    admin.initializeApp({
      projectId,
      credential: admin.credential.cert(serviceAccount),
    });
  } else if (!admin.apps.length) {
    admin.initializeApp({projectId});
  }

  return {APPLY, FORCE, projectId};
}

function inscriptionsPath(pid) {
  return `artifacts/${pid}/public/data/inscriptions`;
}
function teamsPath(pid) {
  return `artifacts/${pid}/public/data/teams`;
}
function matchesPath(pid) {
  return `artifacts/${pid}/public/data/matches`;
}

/** Docs de `matches` dos torneios seed, respeitando o limite do `in`. */
async function findSeedMatches(db, projectId, tournamentIds) {
  const docs = [];
  for (const part of chunkList(tournamentIds, IN_QUERY_LIMIT)) {
    const snap = await db
      .collection(matchesPath(projectId))
      .where("tournamentId", "in", part)
      .get();
    docs.push(...snap.docs);
  }
  return docs;
}

/**
 * Lê tudo que a decisão de limpeza precisa. As inscrições são lidas por
 * completo (não só as dos torneios seed) porque é a presença de um atleta
 * seed numa inscrição de torneio REAL que o torna impossível de apagar.
 */
async function discover(db, projectId) {
  const [tournamentsSnap, athletesSnap, organizersSnap, inscriptionsSnap] =
    await Promise.all([
      db.collection("tournaments").where("seedTestTournament", "==", true).get(),
      db.collection("users").where("seedTestAthlete", "==", true).get(),
      db.collection("users").where("seedTestOrganizer", "==", true).get(),
      db.collection(inscriptionsPath(projectId)).get(),
    ]);

  const seedTournamentIds = tournamentsSnap.docs.map((d) => d.id);
  const seedAthleteUids = athletesSnap.docs.map((d) => d.id);
  const organizerUids = organizersSnap.docs.map((d) => d.id);

  const inscriptions = inscriptionsSnap.docs.map((d) => ({
    id: d.id,
    tournamentId: String(d.data().tournamentId ?? ""),
    teamId: d.data().teamId,
    participantUids: d.data().participantUids,
    player1Id: d.data().player1Id,
  }));

  const plan = partitionCleanupTargets({
    inscriptions,
    seedAthleteUids,
    seedTournamentIds,
  });

  const matchDocs = seedTournamentIds.length ?
    await findSeedMatches(db, projectId, seedTournamentIds) :
    [];

  return {
    projectId,
    seedTournamentIds,
    organizerUids,
    matchIds: matchDocs.map((d) => d.id),
    ...plan,
  };
}

function printReport(d) {
  console.log("\nEncontrado:");
  console.log(`  matches ................. ${d.matchIds.length}`);
  console.log(`  inscriptions ............ ${d.seedInscriptionIds.length}`);
  console.log(`  teams ................... ${d.teamIds.length}`);
  console.log(`  tournaments ............. ${d.seedTournamentIds.length}`);
  console.log(`  atletas seed (apagáveis)  ${d.deletableAthleteUids.length}`);
  console.log(`  organizadores seed ...... ${d.organizerUids.length}`);

  if (d.preservedAthleteUids.length) {
    console.log(
      `\nPRESERVADOS: ${d.preservedAthleteUids.length} atleta(s) seed estão inscritos em`,
    );
    console.log("torneios REAIS. Doc, espelho e conta Auth serão mantidos:");
    for (const uid of d.preservedAthleteUids.slice(0, 20)) console.log(`  - ${uid}`);
    if (d.preservedAthleteUids.length > 20) {
      console.log(`  ... e mais ${d.preservedAthleteUids.length - 20}`);
    }
  }

  if (d.realAthleteUids.length) {
    console.log(
      `\nATENÇÃO: ${d.realAthleteUids.length} atleta(s) REAIS estão inscritos no torneio seed:`,
    );
    for (const uid of d.realAthleteUids.slice(0, 20)) console.log(`  - ${uid}`);
    if (d.realAthleteUids.length > 20) {
      console.log(`  ... e mais ${d.realAthleteUids.length - 20}`);
    }
  }
}

function nothingToDo(d) {
  return (
    d.matchIds.length === 0 &&
    d.seedInscriptionIds.length === 0 &&
    d.teamIds.length === 0 &&
    d.seedTournamentIds.length === 0 &&
    d.deletableAthleteUids.length === 0 &&
    d.organizerUids.length === 0
  );
}

async function run() {
  const {APPLY, FORCE, projectId} = parseArgs();
  const db = admin.firestore();

  console.log(`Projeto: ${projectId}`);
  console.log(`Modo: ${APPLY ? "APLICAR (--yes)" : "DRY-RUN"}`);

  const discovery = await discover(db, projectId);
  printReport(discovery);

  if (nothingToDo(discovery)) {
    console.log("\nNada a apagar.");
    return;
  }

  if (discovery.realAthleteUids.length && !FORCE) {
    console.error(
      "\nABORTADO: há atleta real inscrito no torneio seed (lista acima).",
    );
    console.error(
      "Apagar o torneio destruiria a inscrição dele. Rode com --force para prosseguir:",
    );
    console.error(
      "o torneio e as inscrições saem (inclusive a dele), mas o perfil e a conta dele ficam.",
    );
    process.exit(1);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN: nada foi apagado. Rode com --yes para remover.");
    return;
  }

  console.log("\n(apply ainda não implementado — Task 6)");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha na limpeza:", err);
    process.exit(1);
  });
```

- [ ] **Step 2: Verificar a guarda de `--project` obrigatório**

```bash
cd functions && node scripts/delete-test-data.js; echo "exit=$?"
```

Esperado: `Informe o projeto explicitamente: --project <projectId>.` e `exit=1`.

- [ ] **Step 3: Verificar que env não burla a guarda**

```bash
cd functions && GCLOUD_PROJECT=volley-track-2dd3b node scripts/delete-test-data.js; echo "exit=$?"
```

Esperado: mesma mensagem do Step 2 e `exit=1`. A variável de ambiente **não** pode ser aceita.

- [ ] **Step 4: Verificar o bloqueio de produção**

```bash
cd functions && node scripts/delete-test-data.js --project volley-track-2dd3b --yes; echo "exit=$?"
```

Esperado: `BLOQUEADO: volley-track-2dd3b é o projeto de PRODUÇÃO.` e `exit=1`. Nenhuma leitura do Firestore acontece.

- [ ] **Step 5: Rodar o dry-run contra o dev (com o seed da Task 4 aplicado)**

```bash
cd functions && npm run build && node scripts/delete-test-data.js --project volley-track-dev-4596c
```

Esperado: relatório com `inscriptions 160`, `teams 160`, `tournaments 1`, `atletas seed (apagáveis) 320`, `organizadores seed 1`, e termina em `DRY-RUN: nada foi apagado.` Conferir no console do Firebase que nada sumiu.

- [ ] **Step 6: Commit**

```bash
git add functions/scripts/delete-test-data.js
git commit -m "feat(scripts): delete-test-data com guardas e relatorio (dry-run)"
```

---

### Task 6: `delete-test-data.js` — aplicar a cascata

**Files:**
- Modify: `functions/scripts/delete-test-data.js` (substitui o placeholder do `run()`)

**Interfaces:**
- Consumes: `discover(db, projectId)` e o `CleanupPlan` da Task 5.
- Produces: nada consumido adiante.

- [ ] **Step 1: Adicionar as funções de exclusão**

Em `functions/scripts/delete-test-data.js`, inserir antes de `async function run()`:

```js
/** Apaga refs em lotes, respeitando o teto de operações por batch. */
async function deleteRefs(db, refs) {
  for (const part of chunkList(refs, BATCH_LIMIT)) {
    const batch = db.batch();
    for (const ref of part) batch.delete(ref);
    await batch.commit();
  }
  return refs.length;
}

/**
 * Apaga os docs de usuário com `recursiveDelete`, que também remove as
 * subcoleções (`notifications`, `tokens`, `favorites`). Um `batch.delete`
 * do doc-pai deixaria essas subcoleções órfãs e invisíveis — mesmo motivo
 * pelo qual `deleteOwnAccount` usa recursiveDelete
 * (`functions/src/account-deletion.ts:23`).
 */
async function deleteUsersRecursively(db, uids, log) {
  let done = 0;
  for (const uid of uids) {
    await db.recursiveDelete(db.doc(`users/${uid}`));
    done += 1;
    if (done % 50 === 0) log(`  ... ${done}/${uids.length} usuários`);
  }
  return done;
}

/**
 * Varre o espelho público explicitamente. O trigger
 * `onUserWrittenSyncPublicProfile` já apaga `public_profiles/{uid}` quando
 * `users/{uid}` some, mas só se estiver deployado naquele projeto — e o
 * script não tem como verificar isso. A varredura é barata e torna a
 * limpeza independente do estado de deploy.
 */
async function deletePublicProfiles(db, uids) {
  const refs = uids.map((uid) => db.doc(`public_profiles/${uid}`));
  return deleteRefs(db, refs);
}

async function deleteAuthAccounts(auth, uids, log) {
  let deleted = 0;
  let failed = 0;
  for (const part of chunkList(uids, 1000)) {
    const res = await auth.deleteUsers(part);
    deleted += res.successCount;
    failed += res.failureCount;
    for (const err of res.errors) {
      log(`  Falha Auth: ${part[err.index]} — ${err.error.message}`);
    }
  }
  return {deleted, failed};
}

/** Cascata: filho antes do pai, para nunca deixar órfão. */
async function applyCleanup(db, auth, d) {
  const log = console.log;

  const matchRefs = d.matchIds.map((id) => db.doc(`${matchesPath(d.projectId)}/${id}`));
  log(`\nmatches: ${await deleteRefs(db, matchRefs)} apagados`);

  const inscriptionRefs = d.seedInscriptionIds.map((id) =>
    db.doc(`${inscriptionsPath(d.projectId)}/${id}`),
  );
  log(`inscriptions: ${await deleteRefs(db, inscriptionRefs)} apagadas`);

  const teamRefs = d.teamIds.map((id) => db.doc(`${teamsPath(d.projectId)}/${id}`));
  log(`teams: ${await deleteRefs(db, teamRefs)} apagadas`);

  const tournamentRefs = d.seedTournamentIds.map((id) => db.doc(`tournaments/${id}`));
  log(`tournaments: ${await deleteRefs(db, tournamentRefs)} apagados`);

  const userUids = [...d.deletableAthleteUids, ...d.organizerUids];
  log(`users: apagando ${userUids.length} (recursivo)...`);
  log(`users: ${await deleteUsersRecursively(db, userUids, log)} apagados`);

  log(`public_profiles: ${await deletePublicProfiles(db, userUids)} apagados`);

  const {deleted, failed} = await deleteAuthAccounts(auth, userUids, log);
  log(`Auth: ${deleted} contas removidas, ${failed} falha(s).`);

  if (d.preservedAthleteUids.length) {
    log(`\nPreservados (inscritos em torneio real): ${d.preservedAthleteUids.length}`);
    for (const uid of d.preservedAthleteUids) log(`  - ${uid}`);
  }
}
```

- [ ] **Step 2: Ligar o `applyCleanup` ao `run()`**

Trocar, no fim de `run()`:

```js
  console.log("\n(apply ainda não implementado — Task 6)");
}
```

por:

```js
  await applyCleanup(db, admin.auth(), discovery);
  console.log("\nLimpeza concluída.");
}
```

- [ ] **Step 3: Confirmar que as guardas continuam valendo**

```bash
cd functions && node scripts/delete-test-data.js --project volley-track-2dd3b --yes; echo "exit=$?"
```

Esperado: `BLOQUEADO: volley-track-2dd3b é o projeto de PRODUÇÃO.` e `exit=1`. Continua sem tocar no Firestore, mesmo com `--yes`.

- [ ] **Step 4: Apagar de verdade no dev**

```bash
cd functions && npm run build && node scripts/delete-test-data.js --project volley-track-dev-4596c --yes
```

Esperado: `matches: 0 apagados` (nenhuma chave foi gerada), `inscriptions: 160`, `teams: 160`, `tournaments: 1`, `users: 321` (320 atletas + 1 organizador), `public_profiles: 321`, `Auth: 321 contas removidas, 0 falha(s)`, `Limpeza concluída.`

- [ ] **Step 5: Confirmar idempotência**

```bash
cd functions && node scripts/delete-test-data.js --project volley-track-dev-4596c --yes
```

Esperado: todas as contagens em `0` e `Nada a apagar.` Sem erro, `exit=0`.

- [ ] **Step 6: Conferir no console do Firebase que não sobrou nada**

Verificar manualmente no projeto `volley-track-dev-4596c`:
- `tournaments` — nenhum doc com `seedTestTournament: true`
- `artifacts/volley-track-dev-4596c/public/data/{teams,inscriptions,matches}` — sem docs do seed
- `users` e `public_profiles` — nenhum doc com `seedTestAthlete`/`seedTestOrganizer`
- Authentication — nenhuma conta `@nexago.test`

- [ ] **Step 7: Commit**

```bash
git add functions/scripts/delete-test-data.js
git commit -m "feat(scripts): delete-test-data apaga a cascata completa"
```

---

### Task 7: Atalhos no `package.json` e documentação

**Files:**
- Modify: `functions/package.json:12-14` (bloco `scripts`)
- Create: `docs/scripts-dados-teste.md`

**Interfaces:**
- Consumes: os dois scripts das Tasks 4 e 6.
- Produces: nada.

- [ ] **Step 1: Adicionar os atalhos**

Em `functions/package.json`, no bloco `"scripts"`, adicionar após `"seed-tournament-today"`:

```json
    "seed-test-data": "node scripts/seed-test-data.js",
    "delete-test-data": "node scripts/delete-test-data.js"
```

Os atalhos existentes (`bulk-enroll`, `seed-tournament`, `seed-tournament-today`) permanecem.

- [ ] **Step 2: Verificar que os atalhos funcionam**

```bash
cd functions && npm run delete-test-data --silent -- --project volley-track-dev-4596c
```

Esperado: roda o dry-run e imprime o relatório (tudo zerado, se a Task 6 já limpou).

- [ ] **Step 3: Escrever a documentação**

Criar `docs/scripts-dados-teste.md`:

````markdown
# Scripts de dados de teste

Dois comandos simétricos para montar e desmontar um cenário de teste completo
no projeto de **dev**.

## Pré-requisitos

```bash
cd functions
npm run build                              # os scripts leem de ../lib
gcloud auth application-default login      # credenciais admin (ADC)
```

Alternativa às credenciais: `--credentials /caminho/serviceAccount.json` ou
`GOOGLE_APPLICATION_CREDENTIALS`.

## Criar

```bash
node scripts/seed-test-data.js --project volley-track-dev-4596c --yes
```

Cria, numa execução: organizador seed, **320 atletas** (5 níveis × 2 gêneros ×
32), **1 torneio** com 10 categorias, **160 duplas** e **160 inscrições pagas**.
O torneio nasce `open`, sem chave gerada.

Login dos seeds: `seed-<nivel>-<m|f>-NN@nexago.test` e
`seed-organizer@nexago.test`, senha `Senha123!`.

| Flag | Default | Efeito |
|---|---|---|
| `--project <id>` | — (obrigatório) | projeto Firebase |
| `--yes` | dry-run | aplica de verdade |
| `--manager-uid <uid>` | cria organizador seed | organizador do torneio |
| `--count <n>` | `32` | atletas por nível×gênero |
| `--today` | em 14 dias | torneio no dia de hoje |
| `--tournament-name <s>` | `Torneio seed nexaGO` | nome do torneio |

Idempotente: rodar de novo reaproveita contas e torneio existentes.

## Apagar

```bash
node scripts/delete-test-data.js --project volley-track-dev-4596c --yes
```

Apaga em cascata, filho antes do pai:
`matches` → `inscriptions` → `teams` → `tournaments` → `users` (recursivo,
incluindo subcoleções) → `public_profiles` → contas do Auth.

| Flag | Default | Efeito |
|---|---|---|
| `--project <id>` | — (obrigatório, sem fallback de env) | projeto Firebase |
| `--yes` | dry-run | apaga de verdade |
| `--force` | — | prossegue mesmo com atleta real inscrito no torneio seed |

### Guardas

- **`--project` não tem fallback de env.** O alias `default` do `.firebaserc`
  aponta para produção; um fallback silencioso poderia apagar dados reais.
- **Produção é bloqueada** (`volley-track-2dd3b`), mesmo com `--yes`.
- **Atleta real inscrito em torneio seed** → aborta e lista os uids. Com
  `--force`, o torneio e as inscrições saem (inclusive a dele), mas o perfil e
  a conta Auth dele ficam.
- **Atleta seed inscrito em torneio real** → é preservado (doc, espelho e conta)
  e reportado no fim. Apagá-lo deixaria uma chave real com participante
  inexistente.

## Scripts antigos

`seed-athletes.js`, `seed-tournament-with-enrollments.js`,
`seed-tournament-today-with-enrollments.js` e `delete-seed-athletes.js`
continuam funcionando como antes. Os novos comandos os orquestram; prefira os
novos, principalmente na limpeza — `delete-seed-athletes.js` apaga só os
atletas e deixa o torneio órfão.
````

- [ ] **Step 4: Commit**

```bash
git add functions/package.json docs/scripts-dados-teste.md
git commit -m "docs(scripts): atalhos npm e guia dos dados de teste"
```

---

## Verificação final

Ciclo completo no dev, depois de todas as tasks:

- [ ] `cd functions && npm run build && npm test` — suíte verde, incluindo `test-data-cleanup.test.js`
- [ ] `node scripts/delete-test-data.js --project volley-track-dev-4596c` — dry-run, estado inicial limpo
- [ ] `node scripts/seed-test-data.js --project volley-track-dev-4596c --yes` — 320 atletas, 160 duplas, `enrolledCount=160`
- [ ] Abrir o painel do organizador logado como `seed-organizer@nexago.test` e confirmar que o torneio aparece com as 160 inscrições
- [ ] `node scripts/delete-test-data.js --project volley-track-dev-4596c --yes` — tudo apagado
- [ ] `node scripts/delete-test-data.js --project volley-track-dev-4596c --yes` — idempotente, `Nada a apagar.`
- [ ] `node scripts/seed-athletes.js` sem args — ainda imprime `Informe o projeto` (comando antigo intacto)
- [ ] `node scripts/seed-tournament-with-enrollments.js` sem args — ainda imprime `Informe o projeto` (comando antigo intacto)
