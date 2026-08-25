# Agendamento Dinâmico de Partidas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando uma partida termina (W.O., vitória normal ou atraso no início), recalcular automaticamente o `scheduleTime` das partidas seguintes na mesma quadra, e avisar os atletas cujo horário mudou de forma relevante.

**Architecture:** Extrai o núcleo guloso de alocação de `autoScheduleTournamentDay` para um módulo compartilhado (`match-schedule-allocation.ts`); um novo módulo (`match-dynamic-reschedule.ts`) usa esse núcleo para recalcular só a quadra afetada a partir de um horário-âncora real, chamado de dentro do trigger `onTournamentMatchCompletedAdvance` já existente (sem novo trigger Firestore). Um campo `matchOps.dynamicRescheduleEnabled` (opt-in, default `false`) controla tudo; uma callable nova e um switch no app organizador ligam/desligam por torneio.

**Tech Stack:** Firebase Cloud Functions v2 (TypeScript, `onDocumentUpdated`/`onCall`), Firestore, `node:test` + `FakeFirestore` (testes de functions), Flutter/Riverpod (app organizador).

**Spec:** [docs/superpowers/specs/2026-08-25-agendamento-dinamico-partidas-design.md](../specs/2026-08-25-agendamento-dinamico-partidas-design.md)

## Global Constraints

- `matchOps.dynamicRescheduleEnabled` default `false` — nenhum torneio existente muda de comportamento sem ação explícita do organizador (D4 do spec).
- Recálculo só entre partidas da MESMA quadra e do MESMO dia (D1) — nunca move partida para outra quadra.
- Duração de partida usa sempre `matchOps.defaultMatchDurationMin` (sem média adaptativa) — D1.
- Limiar de notificação e de "atraso relevante" no início: **10 minutos** (D5, confirmado com o usuário).
- Nenhuma partida `on_court`/`completed` é tocada pelo recálculo (D1).
- Escrita da própria cascata nunca pode redisparar o trigger (guarda `scheduleRecalcAt`, D3).

---

## Task 1: Extrair núcleo de alocação compartilhado (`match-schedule-allocation.ts`)

Move o algoritmo guloso de `autoScheduleTournamentDay` (hoje inline,
`functions/src/organizer-match-ops.ts:1116-1173`) e o helper
`loadTournamentMatches` (`organizer-match-ops.ts:155-170`) para um módulo novo
sem dependências de volta para `organizer-match-ops.ts`, para que o módulo de
reagendamento dinâmico (Task 3-4) possa reusar o mesmo núcleo sem import
circular. Refatoração pura — mesmo comportamento, comprovado pelos testes já
existentes de `autoScheduleTournamentDay`/`compareByMatchNumber`.

**Files:**
- Create: `functions/src/match-schedule-allocation.ts`
- Create: `functions/src/match-schedule-allocation.test.ts`
- Modify: `functions/src/organizer-match-ops.ts:1-42` (imports), `:155-170` (remove `loadTournamentMatches`), `:1019-1031` (remove `compareByMatchNumber`), `:1116-1173` (usar `allocateCourtSlots`)

**Interfaces:**
- Produces: `compareByMatchNumber(a, b): number`, `allocateCourtSlots(params): CourtAllocationSlot[]`, `loadTournamentMatches(db, projectId, tournamentId, dayKey?): Promise<QueryDocumentSnapshot[]>`, `interface CourtAllocationSlot {matchId: string; courtId: string; start: Date; end: Date}` — todos exportados de `match-schedule-allocation.ts`, usados por `organizer-match-ops.ts` (Task 1) e `match-dynamic-reschedule.ts` (Task 3-4).

- [ ] **Step 1: Criar `match-schedule-allocation.ts` com o núcleo extraído**

```ts
import type {Firestore} from "firebase-admin/firestore";
import {artifactsMatchesPath} from "./firebase-paths";

/**
 * Compara duas partidas pela numeração GLOBAL cronológica (`matchNumber`).
 * NÃO comparar por `round`: em dupla eliminação, WB, LB, 3º lugar e final têm
 * cada um sua própria contagem de round reiniciando em 1, então "round" não é
 * uma sequência global — comparar por ele antes do matchNumber agendava a
 * final e o 3º lugar (round 1 na sua chave) antes da WB/LB R2.
 */
export function compareByMatchNumber(
  a: {matchNumber?: number},
  b: {matchNumber?: number},
): number {
  return (a.matchNumber ?? 0) - (b.matchNumber ?? 0);
}

export interface CourtAllocationSlot {
  matchId: string;
  courtId: string;
  start: Date;
  end: Date;
}

/**
 * Aloca sequencialmente cada partida de `unscheduled` (ordenada por
 * `compareByMatchNumber`) numa das `courts`, escolhendo sempre a quadra que
 * fica livre mais cedo (guloso), respeitando `courtBusyUntil`/`teamBusyUntil`
 * de entrada — que são MUTADOS a cada alocação, então o chamador os vê
 * atualizados ao final. Núcleo compartilhado entre `autoScheduleTournamentDay`
 * (grade do dia inteiro, courts = todas) e `recalculateCourtSchedule`
 * (cascata incremental restrita a uma quadra só).
 */
export function allocateCourtSlots(params: {
  courts: ReadonlyArray<{id: string}>;
  unscheduled: FirebaseFirestore.QueryDocumentSnapshot[];
  courtBusyUntil: Record<string, Date>;
  teamBusyUntil: Record<string, Date>;
  durationMin: number;
  minRestMin: number;
  avoidAthleteConflict: boolean;
  dayStart: Date;
}): CourtAllocationSlot[] {
  const {
    courts,
    unscheduled,
    courtBusyUntil,
    teamBusyUntil,
    durationMin,
    minRestMin,
    avoidAthleteConflict,
    dayStart,
  } = params;

  const slots: CourtAllocationSlot[] = [];
  const sorted = [...unscheduled].sort((a, b) =>
    compareByMatchNumber(a.data(), b.data()),
  );

  for (const doc of sorted) {
    const data = doc.data();
    let chosenCourt = courts[0].id;
    let chosenStart = courtBusyUntil[chosenCourt] ?? dayStart;
    if (chosenStart < dayStart) chosenStart = new Date(dayStart);

    for (const court of courts) {
      let start = courtBusyUntil[court.id] ?? dayStart;
      if (start < dayStart) start = new Date(dayStart);

      if (avoidAthleteConflict) {
        for (const tid of [data.teamAId, data.teamBId]) {
          if (typeof tid !== "string" || !tid.trim()) continue;
          const busy = teamBusyUntil[tid];
          if (busy && busy > start) start = busy;
        }
      }

      if (start < chosenStart) {
        chosenStart = start;
        chosenCourt = court.id;
      }
    }

    const end = new Date(chosenStart.getTime() + durationMin * 60 * 1000);
    slots.push({matchId: doc.id, courtId: chosenCourt, start: chosenStart, end});
    courtBusyUntil[chosenCourt] = end;

    if (avoidAthleteConflict) {
      const teamRestUntil = new Date(end.getTime() + minRestMin * 60 * 1000);
      for (const tid of [data.teamAId, data.teamBId]) {
        if (typeof tid !== "string" || !tid.trim()) continue;
        teamBusyUntil[tid] = teamRestUntil;
      }
    }
  }

  return slots;
}

/** Todas as partidas do torneio (opcionalmente restritas a um `dayKey`). */
export async function loadTournamentMatches(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  dayKey?: string,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  let query: FirebaseFirestore.Query = db
    .collection(artifactsMatchesPath(projectId))
    .where("tournamentId", "==", tournamentId);
  const dk = dayKey?.trim();
  if (dk) {
    query = query.where("dayKey", "==", dk);
  }
  const snap = await query.get();
  return snap.docs;
}
```

- [ ] **Step 2: Escrever teste de `allocateCourtSlots` (novo comportamento coberto por teste antes de tocar no chamador)**

Criar `functions/src/match-schedule-allocation.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Timestamp} from "firebase-admin/firestore";
import {allocateCourtSlots, compareByMatchNumber} from "./match-schedule-allocation";

function fakeDoc(id: string, data: Record<string, unknown>): FirebaseFirestore.QueryDocumentSnapshot {
  return {id, data: () => data} as unknown as FirebaseFirestore.QueryDocumentSnapshot;
}

describe("compareByMatchNumber", () => {
  it("ordena pela numeração global, tratando ausente como 0", () => {
    const sorted = [{matchNumber: 3}, {matchNumber: undefined}, {matchNumber: 1}].sort(
      compareByMatchNumber,
    );
    assert.deepEqual(sorted.map((m) => m.matchNumber), [undefined, 1, 3]);
  });
});

describe("allocateCourtSlots", () => {
  it("aloca em ordem de matchNumber, respeitando courtBusyUntil de entrada", () => {
    const dayStart = new Date("2026-08-25T10:00:00-03:00");
    const docs = [
      fakeDoc("m2", {matchNumber: 2, teamAId: "t3", teamBId: "t4"}),
      fakeDoc("m1", {matchNumber: 1, teamAId: "t1", teamBId: "t2"}),
    ];

    const slots = allocateCourtSlots({
      courts: [{id: "court-1"}],
      unscheduled: docs,
      courtBusyUntil: {"court-1": dayStart},
      teamBusyUntil: {},
      durationMin: 30,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });

    assert.equal(slots.length, 2);
    assert.equal(slots[0].matchId, "m1");
    assert.equal(slots[0].start.toISOString(), dayStart.toISOString());
    assert.equal(slots[1].matchId, "m2");
    assert.equal(slots[1].start.getTime(), dayStart.getTime() + 30 * 60 * 1000);
  });

  it("empurra o início se a dupla ainda está no descanso mínimo em outra quadra", () => {
    const dayStart = new Date("2026-08-25T10:00:00-03:00");
    const busyUntil = new Date(dayStart.getTime() + 45 * 60 * 1000);
    const docs = [fakeDoc("m1", {matchNumber: 1, teamAId: "t1", teamBId: "t2"})];

    const slots = allocateCourtSlots({
      courts: [{id: "court-1"}],
      unscheduled: docs,
      courtBusyUntil: {"court-1": dayStart},
      teamBusyUntil: {t1: busyUntil},
      durationMin: 30,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });

    assert.equal(slots[0].start.getTime(), busyUntil.getTime());
  });

  it("escolhe a quadra que fica livre mais cedo entre várias", () => {
    const dayStart = new Date("2026-08-25T10:00:00-03:00");
    const courtBusyUntil = {
      "court-1": new Date(dayStart.getTime() + 60 * 60 * 1000),
      "court-2": dayStart,
    };
    const docs = [fakeDoc("m1", {matchNumber: 1, teamAId: "t1", teamBId: "t2"})];

    const slots = allocateCourtSlots({
      courts: [{id: "court-1"}, {id: "court-2"}],
      unscheduled: docs,
      courtBusyUntil,
      teamBusyUntil: {},
      durationMin: 30,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });

    assert.equal(slots[0].courtId, "court-2");
  });
});
```

- [ ] **Step 3: Rodar os testes novos e ver falhar (módulo ainda não existe)**

Run: `npm run build && node --test lib/match-schedule-allocation.test.js`
Expected: FAIL (`Cannot find module './match-schedule-allocation'` ou erro de build do TS)

- [ ] **Step 4: Fazer o build passar isoladamente**

Run: `npm run build`
Expected: build limpo (o arquivo criado no Step 1 já é suficiente)

- [ ] **Step 5: Rodar os testes do módulo novo e ver passar**

Run: `node --test lib/match-schedule-allocation.test.js`
Expected: PASS (4 testes)

- [ ] **Step 6: Atualizar `organizer-match-ops.ts` para reusar o módulo novo**

Em `functions/src/organizer-match-ops.ts`:

1. No bloco de imports (linha 1-42), adicionar (só `allocateCourtSlots` e
   `loadTournamentMatches` — depois dos pontos 4 e 5 abaixo, o próprio
   `organizer-match-ops.ts` não chama mais `compareByMatchNumber`
   diretamente, só re-exporta):

```ts
import {
  allocateCourtSlots,
  loadTournamentMatches,
} from "./match-schedule-allocation";
```

2. Logo depois do bloco de imports, adicionar o re-export (mantém `organizer-match-ops.test.ts` importando `compareByMatchNumber` de onde já importava, sem editar o teste):

```ts
export {compareByMatchNumber} from "./match-schedule-allocation";
```

3. Remover a função local `loadTournamentMatches` inteira (linhas 155-170: de `async function loadTournamentMatches(` até o `}` que fecha, antes de `async function getMatchOrThrow`).

4. Remover a função local `compareByMatchNumber` inteira, incluindo o comentário acima dela (linhas ~1019-1031: do comentário `/**\n * Compara duas partidas...` até o `}` de fechamento, logo antes de `export const autoScheduleTournamentDay = onCall(...)`).

5. Dentro de `autoScheduleTournamentDay`, substituir o bloco (linhas ~1116-1173, de `const slots: Array<{...` até o `}` que fecha o `for (const doc of sorted)`) por:

```ts
  const slots: Array<{
    matchId: string;
    courtId: string;
    start: string;
    end: string;
  }> = allocateCourtSlots({
    courts,
    unscheduled,
    courtBusyUntil,
    teamBusyUntil,
    durationMin: duration,
    minRestMin: minRest,
    avoidAthleteConflict,
    dayStart,
  }).map((slot) => ({
    matchId: slot.matchId,
    courtId: slot.courtId,
    start: slot.start.toISOString(),
    end: slot.end.toISOString(),
  }));
  const skipped: Array<{matchId: string; reason: string}> = [];
```

(O comentário original `// Sequência de jogos: matchNumber já é a numeração...` sai junto — a explicação já mora no docstring de `allocateCourtSlots`.)

- [ ] **Step 7: Build + rodar TODA a suíte de `organizer-match-ops` para confirmar que nada quebrou**

Run: `npm run build && node --test lib/organizer-match-ops.test.js lib/organizer-match-ops.live-score.test.js lib/organizer-match-ops.revert-live.test.js lib/match-schedule-allocation.test.js`
Expected: PASS em todos — a extração não muda comportamento, só localização do código.

- [ ] **Step 8: Commit**

```bash
git add functions/src/match-schedule-allocation.ts functions/src/match-schedule-allocation.test.ts functions/src/organizer-match-ops.ts
git commit -m "$(cat <<'EOF'
refactor(functions): extrai núcleo de alocação de agendamento

Move o algoritmo guloso de autoScheduleTournamentDay e loadTournamentMatches
para match-schedule-allocation.ts, sem mudar comportamento — prepara terreno
para o recálculo em cascata reusar o mesmo núcleo sem import circular.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 1b: Corrigir bug de descanso mínimo em `allocateCourtSlots`

**Inserida durante a execução** (não estava no plano original) — achado da
Task 1: o núcleo de alocação extraído tem um bug PRÉ-EXISTENTE (já em
produção antes desta refatoração, só nunca coberto por teste de unidade até
agora) em `allocateCourtSlots`. `chosenStart`/`chosenCourt` são semeados a
partir do horário BRUTO (sem ajuste de conflito) da quadra `courts[0]`; como
o ajuste de descanso mínimo por dupla (`avoidAthleteConflict`/
`teamBusyUntil`) só pode empurrar o horário PARA FRENTE, o candidato ajustado
da própria quadra semente nunca consegue "vencer" esse valor bruto na
comparação `start < chosenStart`. Na prática isso IGNORA
`minRestBetweenMatchesMin` sempre que nenhuma OUTRA quadra oferece um horário
mais cedo que o valor bruto da quadra 0 — o que acontece SEMPRE no caso de
uma quadra só. Isso é fatal para a Task 3-4 (`recalculateCourtSchedule`), que
SEMPRE chama `allocateCourtSlots` com um array de UMA quadra só — sem esta
correção, a garantia do spec D1 ("respeita minRestBetweenMatchesMin") nunca
funcionaria de fato na cascata. Corrigir aqui, numa task própria com seu
próprio teste e revisão, em vez de dentro da Task 1 (refatoração pura, sem
mudança de comportamento) ou da Task 4 (motor da cascata — não é o lugar de
mexer no núcleo compartilhado).

A correção: computar o candidato de CADA quadra (já com o ajuste de conflito
aplicado) e escolher o menor entre todos, em vez de comparar um valor
ajustado contra um valor bruto de uma quadra "semente" fora do loop.

**Files:**
- Modify: `functions/src/match-schedule-allocation.ts` (função `allocateCourtSlots`)
- Modify: `functions/src/match-schedule-allocation.test.ts` (o teste que hoje caracteriza o bug volta a esperar o comportamento correto; adiciona um caso com 2 quadras)

**Interfaces:** nenhuma mudança de assinatura — mesmos parâmetros e retorno de `allocateCourtSlots`; só a lógica interna do loop muda.

- [ ] **Step 1: Atualizar o teste que hoje documenta o bug para exigir o comportamento CORRETO**

Em `functions/src/match-schedule-allocation.test.ts`, substituir o teste
`"[bug conhecido, preservado] com 1 quadra só, o descanso mínimo da dupla NÃO empurra o início quando essa é a única candidata"`
(e o comentário acima dele) por:

```ts
  it("com 1 quadra só, o descanso mínimo da dupla EMPURRA o início (bug corrigido)", () => {
    const dayStart = new Date("2026-08-25T10:00:00-03:00");
    const busyUntil = new Date(dayStart.getTime() + 45 * 60 * 1000);
    const docs = [fakeDoc("m1", {matchNumber: 1, teamAId: "t1", teamBId: "t2"})];

    const slots = allocateCourtSlots({
      courts: [{id: "court-1"}],
      unscheduled: docs,
      courtBusyUntil: {"court-1": dayStart},
      teamBusyUntil: {t1: busyUntil},
      durationMin: 30,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });

    assert.equal(slots[0].start.getTime(), busyUntil.getTime());
  });

  it("com 2 quadras, o descanso mínimo da dupla também EMPURRA o início mesmo quando as duas quadras estão livres desde o dayStart", () => {
    const dayStart = new Date("2026-08-25T10:00:00-03:00");
    const busyUntil = new Date(dayStart.getTime() + 45 * 60 * 1000);
    const docs = [fakeDoc("m1", {matchNumber: 1, teamAId: "t1", teamBId: "t2"})];

    const slots = allocateCourtSlots({
      courts: [{id: "court-1"}, {id: "court-2"}],
      unscheduled: docs,
      courtBusyUntil: {"court-1": dayStart, "court-2": dayStart},
      teamBusyUntil: {t1: busyUntil},
      durationMin: 30,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });

    assert.equal(slots[0].start.getTime(), busyUntil.getTime());
  });
```

- [ ] **Step 2: Rodar e ver falhar contra o código atual (ainda com o bug)**

Run: `npm run build && node --test lib/match-schedule-allocation.test.js`
Expected: FAIL nos 2 testes novos/alterados (código atual ainda ignora o descanso mínimo)

- [ ] **Step 3: Corrigir `allocateCourtSlots`**

Em `functions/src/match-schedule-allocation.ts`, substituir todo o corpo do
`for (const doc of sorted) { ... }` (da linha `const data = doc.data();` até
o fechamento do bloco, ANTES de `const end = new Date(...)`) por:

```ts
  for (const doc of sorted) {
    const data = doc.data();

    const candidates = courts.map((court) => {
      let start = courtBusyUntil[court.id] ?? dayStart;
      if (start < dayStart) start = new Date(dayStart);

      if (avoidAthleteConflict) {
        for (const tid of [data.teamAId, data.teamBId]) {
          if (typeof tid !== "string" || !tid.trim()) continue;
          const busy = teamBusyUntil[tid];
          if (busy && busy > start) start = busy;
        }
      }

      return {courtId: court.id, start};
    });
    // `courts` nunca é vazio (ambos os chamadores garantem isso), então
    // `reduce` sem valor inicial é seguro e tipa como não-opcional.
    const chosen = candidates.reduce((best, c) => (c.start < best.start ? c : best));
    const chosenCourt = chosen.courtId;
    const chosenStart = chosen.start;

    const end = new Date(chosenStart.getTime() + durationMin * 60 * 1000);
    slots.push({matchId: doc.id, courtId: chosenCourt, start: chosenStart, end});
    courtBusyUntil[chosenCourt] = end;

    if (avoidAthleteConflict) {
      const teamRestUntil = new Date(end.getTime() + minRestMin * 60 * 1000);
      for (const tid of [data.teamAId, data.teamBId]) {
        if (typeof tid !== "string" || !tid.trim()) continue;
        teamBusyUntil[tid] = teamRestUntil;
      }
    }
  }
```

(A ideia: antes, `chosenStart`/`chosenCourt` eram semeados FORA do loop a
partir do valor BRUTO de `courts[0]`, e o loop só comparava um valor já
ajustado contra essa semente bruta — por isso a quadra semente nunca perdia
para o próprio ajuste dela mesma. Agora todo candidato, incluindo
`courts[0]`, passa pelo mesmo cálculo de ajuste ANTES de qualquer
comparação, e o menor entre todos vence de forma justa.)

- [ ] **Step 4: Rodar e ver passar — TODOS os testes do arquivo, não só os 2 novos**

Run: `npm run build && node --test lib/match-schedule-allocation.test.js`
Expected: PASS em todos (os 2 testes que já passavam antes — ordenação por
matchNumber e escolha da quadra mais livre entre várias — continuam
passando; os 2 corrigidos/novos do Step 1 agora também passam)

- [ ] **Step 5: Rodar a suíte de `organizer-match-ops` inteira para confirmar que `autoScheduleTournamentDay` não regrediu**

Run: `npm run build && node --test lib/organizer-match-ops.test.js lib/organizer-match-ops.live-score.test.js lib/organizer-match-ops.revert-live.test.js lib/match-schedule-allocation.test.js`
Expected: PASS em todos — a correção deixa `autoScheduleTournamentDay` mais
correto (respeita descanso mínimo em mais casos), e nenhum teste existente
dependia do comportamento buggy.

- [ ] **Step 6: Commit**

```bash
git add functions/src/match-schedule-allocation.ts functions/src/match-schedule-allocation.test.ts
git commit -m "$(cat <<'EOF'
fix(functions): descanso mínimo ignorado com 1 quadra em allocateCourtSlots

chosenStart/chosenCourt eram semeados do valor BRUTO (sem ajuste de
conflito) da quadra courts[0], e o ajuste de descanso mínimo só empurra pra
frente — então o candidato ajustado da própria quadra semente nunca vencia
essa semente bruta. Na prática isso ignorava minRestBetweenMatchesMin
sempre que nenhuma outra quadra oferecia hora mais cedo, o que acontecia
SEMPRE no caso de 1 quadra só. Bug pré-existente em produção (autoScheduleTournamentDay),
achado pelo teste de unidade escrito ao extrair allocateCourtSlots — crítico
de corrigir antes da Task 3-4, que sempre chama a função com 1 quadra só.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Helper de horário na parede de São Paulo (`eventTimeLabel`)

A notificação de mudança de horário (Task 4) precisa formatar um `Date` como
`HH:mm` na hora de São Paulo. Formatar com `.getHours()`/`.toISOString()` cru
dá o horário errado (memória do projeto: `app-instante-utc-formatado-como-parede`)
— por isso um helper dedicado, ao lado de `EVENT_TIME_ZONE`.

**Files:**
- Modify: `functions/src/event-timezone.ts`
- Create: `functions/src/event-timezone.test.ts`

**Interfaces:**
- Produces: `eventTimeLabel(d: Date): string` — usado por `notifyScheduleShifts` (Task 4).

- [ ] **Step 1: Escrever o teste primeiro**

Criar `functions/src/event-timezone.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {eventTimeLabel} from "./event-timezone";

describe("eventTimeLabel", () => {
  it("formata HH:mm na parede de São Paulo, não em UTC", () => {
    // 14:05 em São Paulo (UTC-3) = 17:05 UTC.
    const d = new Date("2026-08-25T17:05:00.000Z");
    assert.equal(eventTimeLabel(d), "14:05");
  });

  it("preenche hora e minuto com zero à esquerda", () => {
    const d = new Date("2026-08-25T12:03:00.000Z"); // 09:03 em SP
    assert.equal(eventTimeLabel(d), "09:03");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run build && node --test lib/event-timezone.test.js`
Expected: FAIL (`eventTimeLabel is not a function` / erro de build)

- [ ] **Step 3: Implementar**

Em `functions/src/event-timezone.ts`, adicionar ao final do arquivo:

```ts
/** `HH:mm` na parede de São Paulo (nunca usar `Date.getHours` cru — vira UTC). */
export function eventTimeLabel(d: Date): string {
  return d.toLocaleTimeString("pt-BR", {
    timeZone: EVENT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run build && node --test lib/event-timezone.test.js`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add functions/src/event-timezone.ts functions/src/event-timezone.test.ts
git commit -m "$(cat <<'EOF'
feat(functions): adiciona eventTimeLabel (HH:mm na parede de SP)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Guarda de gatilho do recálculo (`determineRecalcTrigger`)

Função pura que decide SE e A PARTIR DE QUANDO (âncora) o recálculo deve
rodar, cobrindo os 3 gatilhos do spec (D2) com uma regra: nunca reagir à
própria escrita da cascata (D3, evita loop infinito no trigger do Firestore).
Sem Firestore real — testável só com objetos literais.

**Files:**
- Create: `functions/src/match-dynamic-reschedule.ts`
- Create: `functions/src/match-dynamic-reschedule.test.ts`

**Interfaces:**
- Consumes: `isMatchCompleted`, `isMatchCanceled` de `./match-status` (já existem).
- Produces: `SCHEDULE_DRIFT_THRESHOLD_MIN = 10`, `interface RecalcTrigger {tournamentId: string; dayKey: string; courtId: string; anchor: Date; triggerMatchId: string}`, `determineRecalcTrigger(matchId: string, before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined, defaultDurationMin: number): RecalcTrigger | null` — usado por `handleDynamicRescheduleOnMatchUpdate` (Task 4).

- [ ] **Step 1: Escrever os testes primeiro**

Criar `functions/src/match-dynamic-reschedule.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {determineRecalcTrigger} from "./match-dynamic-reschedule";

const TOURNAMENT_ID = "t1";
const DAY_KEY = "2026-08-25";
const COURT_ID = "court-1";
const MATCH_ID = "match-1";
const DEFAULT_DURATION = 30;

function ts(iso: string): Timestamp {
  return Timestamp.fromDate(new Date(iso));
}

function baseMatch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tournamentId: TOURNAMENT_ID,
    dayKey: DAY_KEY,
    courtId: COURT_ID,
    status: "Scheduled",
    scheduleTime: ts("2026-08-25T14:00:00-03:00"),
    ...overrides,
  };
}

describe("determineRecalcTrigger", () => {
  it("dispara na conclusão normal, ancorado em matchEndedAt", () => {
    const before = baseMatch({status: "In Progress"});
    const after = baseMatch({status: "Completed", matchEndedAt: ts("2026-08-25T14:20:00-03:00")});

    const trigger = determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION);

    assert.ok(trigger);
    assert.equal(trigger?.courtId, COURT_ID);
    assert.equal(trigger?.anchor.toISOString(), new Date("2026-08-25T14:20:00-03:00").toISOString());
  });

  it("dispara no W.O. do mesmo jeito (só olha a transição de status)", () => {
    const before = baseMatch({status: "Scheduled"});
    const after = baseMatch({status: "Completed", matchEndedAt: ts("2026-08-25T14:01:00-03:00")});

    const trigger = determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION);

    assert.ok(trigger);
  });

  it("não redispara numa correção de partida já completed antes e depois", () => {
    const before = baseMatch({status: "Completed", matchEndedAt: ts("2026-08-25T14:20:00-03:00")});
    const after = baseMatch({status: "Completed", matchEndedAt: ts("2026-08-25T14:20:00-03:00")});

    assert.equal(determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION), null);
  });

  it("dispara quando a partida entra ao vivo com atraso >= 10min", () => {
    const before = baseMatch({queueStatus: "waiting"});
    const after = baseMatch({
      queueStatus: "on_court",
      matchStartedAt: ts("2026-08-25T14:15:00-03:00"), // 15min depois do scheduleTime 14:00
    });

    const trigger = determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION);

    assert.ok(trigger);
    // âncora = matchStartedAt + duração padrão (30min)
    assert.equal(trigger?.anchor.toISOString(), new Date("2026-08-25T14:45:00-03:00").toISOString());
  });

  it("NÃO dispara quando o atraso no início é menor que o limiar", () => {
    const before = baseMatch({queueStatus: "waiting"});
    const after = baseMatch({
      queueStatus: "on_court",
      matchStartedAt: ts("2026-08-25T14:05:00-03:00"), // só 5min de atraso
    });

    assert.equal(determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION), null);
  });

  it("dispara no reagendamento manual (scheduleTime mudou numa partida ainda não iniciada)", () => {
    const before = baseMatch({scheduleTime: ts("2026-08-25T14:00:00-03:00")});
    const after = baseMatch({scheduleTime: ts("2026-08-25T15:00:00-03:00")});

    const trigger = determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION);

    assert.ok(trigger);
    assert.equal(trigger?.anchor.toISOString(), new Date("2026-08-25T15:00:00-03:00").toISOString());
  });

  it("dispara quando a quadra muda manualmente, mesmo com o mesmo scheduleTime", () => {
    const before = baseMatch({courtId: "court-1"});
    const after = baseMatch({courtId: "court-2"});

    const trigger = determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION);

    assert.ok(trigger);
    assert.equal(trigger?.courtId, "court-2");
  });

  it("NUNCA dispara para a própria escrita da cascata (scheduleRecalcAt mudou)", () => {
    const before = baseMatch({
      scheduleTime: ts("2026-08-25T14:00:00-03:00"),
      scheduleRecalcAt: ts("2026-08-25T13:00:00-03:00"),
    });
    const after = baseMatch({
      scheduleTime: ts("2026-08-25T15:00:00-03:00"), // a própria cascata mudou isso
      scheduleRecalcAt: ts("2026-08-25T13:30:00-03:00"), // e carimbou de novo
    });

    assert.equal(determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION), null);
  });

  it("ignora partida sem courtId/dayKey (nunca foi agendada)", () => {
    const before = baseMatch({courtId: "", dayKey: "", status: "Scheduled"});
    const after = baseMatch({courtId: "", dayKey: "", status: "Completed", matchEndedAt: ts("2026-08-25T14:20:00-03:00")});

    assert.equal(determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION), null);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run build && node --test lib/match-dynamic-reschedule.test.js`
Expected: FAIL (módulo `./match-dynamic-reschedule` não existe)

- [ ] **Step 3: Implementar `determineRecalcTrigger`**

Criar `functions/src/match-dynamic-reschedule.ts`:

```ts
import type {Timestamp} from "firebase-admin/firestore";
import {isMatchCompleted} from "./match-status";

/** Mudança de horário abaixo disso não dispara push nem conta como "atraso". */
export const SCHEDULE_DRIFT_THRESHOLD_MIN = 10;

export interface RecalcTrigger {
  tournamentId: string;
  dayKey: string;
  courtId: string;
  anchor: Date;
  triggerMatchId: string;
}

/**
 * Decide se a atualização de uma partida deve disparar o recálculo em
 * cascata do restante da fila daquela quadra, e a partir de quando (âncora).
 * Cobre os três gatilhos do design (partida concluída — vitória normal ou
 * W.O., já que ambas só mudam `status` para completed —, início atrasado em
 * quadra, e reagendamento manual) com UMA regra: nunca reagir à própria
 * escrita da cascata (`scheduleRecalcAt` mudou nesta atualização), senão
 * o trigger do Firestore reprocessaria a si mesmo infinitamente.
 */
export function determineRecalcTrigger(
  matchId: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  defaultDurationMin: number,
): RecalcTrigger | null {
  if (!after) return null;

  const beforeRecalcAt = before?.scheduleRecalcAt as Timestamp | undefined;
  const afterRecalcAt = after.scheduleRecalcAt as Timestamp | undefined;
  if (afterRecalcAt && afterRecalcAt.toMillis() !== (beforeRecalcAt?.toMillis() ?? -1)) {
    return null;
  }

  const tournamentId = String(after.tournamentId ?? "").trim();
  const dayKey = String(after.dayKey ?? "").trim();
  const courtId = String(after.courtId ?? "").trim();
  if (!tournamentId || !dayKey || !courtId) return null;

  const wasCompleted = isMatchCompleted(before?.status);
  const isCompletedNow = isMatchCompleted(after.status);
  if (isCompletedNow && !wasCompleted) {
    const endedAt = after.matchEndedAt as Timestamp | undefined;
    if (!endedAt) return null;
    return {tournamentId, dayKey, courtId, anchor: endedAt.toDate(), triggerMatchId: matchId};
  }

  const wasOnCourt = before?.queueStatus === "on_court";
  const isOnCourtNow = after.queueStatus === "on_court";
  if (isOnCourtNow && !wasOnCourt) {
    const startedAt = after.matchStartedAt as Timestamp | undefined;
    const scheduled = after.scheduleTime as Timestamp | undefined;
    if (!startedAt || !scheduled) return null;
    const delayMin = (startedAt.toMillis() - scheduled.toMillis()) / 60000;
    if (delayMin < SCHEDULE_DRIFT_THRESHOLD_MIN) return null;
    const anchor = new Date(startedAt.toDate().getTime() + defaultDurationMin * 60 * 1000);
    return {tournamentId, dayKey, courtId, anchor, triggerMatchId: matchId};
  }

  if (isCompletedNow || isOnCourtNow) return null;

  const beforeTime = before?.scheduleTime as Timestamp | undefined;
  const afterTime = after.scheduleTime as Timestamp | undefined;
  const beforeCourtId = String(before?.courtId ?? "").trim();
  if (!afterTime) return null;
  const timeChanged = afterTime.toMillis() !== (beforeTime?.toMillis() ?? -1);
  const courtChanged = courtId !== beforeCourtId;
  if (timeChanged || courtChanged) {
    return {tournamentId, dayKey, courtId, anchor: afterTime.toDate(), triggerMatchId: matchId};
  }

  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run build && node --test lib/match-dynamic-reschedule.test.js`
Expected: PASS (9 testes)

- [ ] **Step 5: Commit**

```bash
git add functions/src/match-dynamic-reschedule.ts functions/src/match-dynamic-reschedule.test.ts
git commit -m "$(cat <<'EOF'
feat(functions): guarda de gatilho do reagendamento dinâmico

determineRecalcTrigger decide se e a partir de quando recalcular a fila de
uma quadra — conclusão (normal ou W.O.), início atrasado ou reagendamento
manual — sem nunca reagir à própria escrita da cascata (evita loop no trigger).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Motor da cascata + notificação + wiring no trigger

Com o gatilho decidido (Task 3) e o núcleo de alocação disponível (Task 1),
implementa o recálculo de fato (`recalculateCourtSchedule`), a notificação por
push (`notifyScheduleShifts`, reaproveitando `deliverNotificationToUser` como
`callMatchToCourt` já faz) e a orquestração
(`handleDynamicRescheduleOnMatchUpdate`) chamada de dentro do trigger
`onTournamentMatchCompletedAdvance` já existente.

**Files:**
- Modify: `functions/src/match-dynamic-reschedule.ts`
- Create: `functions/src/match-dynamic-reschedule.recalculate.test.ts`
- Modify: `functions/src/organizer-match-ops.ts` (import + wiring do trigger)

**Interfaces:**
- Consumes: `allocateCourtSlots`, `loadTournamentMatches` de `./match-schedule-allocation` (Task 1); `determineRecalcTrigger`, `RecalcTrigger`, `SCHEDULE_DRIFT_THRESHOLD_MIN` (Task 3); `eventTimeLabel` de `./event-timezone` (Task 2); `deliverNotificationToUser` de `./notification-delivery` (já existe); `isMatchCanceled`, `isMatchCompleted` de `./match-status` (já existem); `artifactsTeamsPath` de `./firebase-paths` (já existe).
- Produces: `interface ScheduleShift {matchId: string; teamAId: string; teamBId: string; oldStart: Date | null; newStart: Date; courtLabel: string}`, `recalculateCourtSchedule(db, projectId, trigger: RecalcTrigger, config: {durationMin: number; minRestMin: number}): Promise<ScheduleShift[]>`, `notifyScheduleShifts(db, projectId, tournamentId, shifts: ScheduleShift[]): Promise<void>`, `handleDynamicRescheduleOnMatchUpdate(db, projectId, matchId, before, after): Promise<void>` — o último é chamado por `onTournamentMatchCompletedAdvance` em `organizer-match-ops.ts`.

- [ ] **Step 1: Escrever os testes primeiro (usando `FakeFirestore`, mesmo padrão de `organizer-match-ops.live-score.test.ts`)**

Criar `functions/src/match-dynamic-reschedule.recalculate.test.ts`:

```ts
import {describe, it, afterEach} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import * as notificationDelivery from "./notification-delivery";
import {
  recalculateCourtSchedule,
  notifyScheduleShifts,
  handleDynamicRescheduleOnMatchUpdate,
} from "./match-dynamic-reschedule";
import {artifactsMatchesPath, artifactsTeamsPath, getFirebaseProjectId} from "./firebase-paths";

const PROJECT_ID = getFirebaseProjectId();
const MATCHES_PATH = artifactsMatchesPath(PROJECT_ID);
const TEAMS_PATH = artifactsTeamsPath(PROJECT_ID);
const TOURNAMENT_ID = "t1";
const DAY_KEY = "2026-08-25";
const COURT_ID = "court-1";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function ts(iso: string): Timestamp {
  return Timestamp.fromDate(new Date(iso));
}

type SentNotification = {userId: string; title: string; body: string; type: string};
let sent: SentNotification[] = [];

function mockDeliver(): void {
  sent = [];
  (notificationDelivery as unknown as {
    deliverNotificationToUser: typeof notificationDelivery.deliverNotificationToUser;
  }).deliverNotificationToUser = async (input) => {
    sent.push({userId: input.userId, title: input.title, body: input.body, type: input.type});
    return {sent: 1, failed: 0};
  };
}

function seedMatch(
  fake: FakeFirestore,
  id: string,
  overrides: Record<string, unknown>,
): void {
  fake.seedDoc(`${MATCHES_PATH}/${id}`, {
    tournamentId: TOURNAMENT_ID,
    dayKey: DAY_KEY,
    courtId: COURT_ID,
    courtName: "Quadra 1",
    status: "Scheduled",
    queueStatus: "waiting",
    matchNumber: 1,
    teamAId: "team-a",
    teamBId: "team-b",
    ...overrides,
  });
}

describe("recalculateCourtSchedule", () => {
  it("empurra as próximas partidas da mesma quadra a partir da âncora", async () => {
    const fake = new FakeFirestore();
    seedMatch(fake, "trigger-match", {
      status: "Completed",
      matchNumber: 1,
      scheduleTime: ts("2026-08-25T14:00:00-03:00"),
      scheduleEndTime: ts("2026-08-25T14:30:00-03:00"),
      matchEndedAt: ts("2026-08-25T14:20:00-03:00"),
    });
    seedMatch(fake, "next-match", {
      matchNumber: 2,
      scheduleTime: ts("2026-08-25T14:30:00-03:00"),
      scheduleEndTime: ts("2026-08-25T15:00:00-03:00"),
      teamAId: "team-c",
      teamBId: "team-d",
    });

    const shifts = await recalculateCourtSchedule(
      db(fake),
      PROJECT_ID,
      {
        tournamentId: TOURNAMENT_ID,
        dayKey: DAY_KEY,
        courtId: COURT_ID,
        anchor: new Date("2026-08-25T14:20:00-03:00"),
        triggerMatchId: "trigger-match",
      },
      {durationMin: 30, minRestMin: 30},
    );

    assert.equal(shifts.length, 1);
    assert.equal(shifts[0].matchId, "next-match");
    assert.equal(shifts[0].newStart.toISOString(), new Date("2026-08-25T14:20:00-03:00").toISOString());

    const updated = (await fake.doc(`${MATCHES_PATH}/next-match`).get()).data();
    assert.equal(
      (updated?.scheduleTime as Timestamp).toMillis(),
      ts("2026-08-25T14:20:00-03:00").toMillis(),
    );
    assert.ok(updated?.scheduleRecalcAt);
  });

  it("não toca partidas já on_court/completed nem de outra quadra", async () => {
    const fake = new FakeFirestore();
    seedMatch(fake, "trigger-match", {status: "Completed", matchNumber: 1});
    seedMatch(fake, "already-live", {matchNumber: 2, queueStatus: "on_court", scheduleTime: ts("2026-08-25T14:30:00-03:00")});
    seedMatch(fake, "other-court", {matchNumber: 2, courtId: "court-2", scheduleTime: ts("2026-08-25T14:30:00-03:00")});

    const shifts = await recalculateCourtSchedule(
      db(fake),
      PROJECT_ID,
      {
        tournamentId: TOURNAMENT_ID,
        dayKey: DAY_KEY,
        courtId: COURT_ID,
        anchor: new Date("2026-08-25T14:20:00-03:00"),
        triggerMatchId: "trigger-match",
      },
      {durationMin: 30, minRestMin: 30},
    );

    assert.deepEqual(shifts, []);
  });
});

describe("notifyScheduleShifts", () => {
  afterEach(mockDeliver);

  it("notifica os dois times quando o desvio é >= 10min", async () => {
    mockDeliver();
    const fake = new FakeFirestore();
    fake.seedDoc(`${TEAMS_PATH}/team-a`, {player1Id: "p1", player2Id: "p2"});
    fake.seedDoc(`${TEAMS_PATH}/team-c`, {player1Id: "p3", player2Id: "p4"});

    await notifyScheduleShifts(db(fake), PROJECT_ID, TOURNAMENT_ID, [
      {
        matchId: "next-match",
        teamAId: "team-a",
        teamBId: "team-c",
        oldStart: new Date("2026-08-25T14:30:00-03:00"),
        newStart: new Date("2026-08-25T14:20:00-03:00"),
        courtLabel: "Quadra 1",
      },
    ]);

    assert.equal(sent.length, 4);
    assert.ok(sent.every((n) => n.type === "match_schedule_updated"));
    assert.deepEqual(sent.map((n) => n.userId).sort(), ["p1", "p2", "p3", "p4"]);
  });

  it("NÃO notifica quando o desvio é menor que o limiar", async () => {
    mockDeliver();
    const fake = new FakeFirestore();
    fake.seedDoc(`${TEAMS_PATH}/team-a`, {player1Id: "p1", player2Id: "p2"});

    await notifyScheduleShifts(db(fake), PROJECT_ID, TOURNAMENT_ID, [
      {
        matchId: "next-match",
        teamAId: "team-a",
        teamBId: "",
        oldStart: new Date("2026-08-25T14:30:00-03:00"),
        newStart: new Date("2026-08-25T14:25:00-03:00"), // só 5min
        courtLabel: "Quadra 1",
      },
    ]);

    assert.equal(sent.length, 0);
  });
});

describe("handleDynamicRescheduleOnMatchUpdate", () => {
  afterEach(mockDeliver);

  it("não faz nada quando o torneio não ligou a flag", async () => {
    mockDeliver();
    const fake = new FakeFirestore();
    fake.seedDoc(`tournaments/${TOURNAMENT_ID}`, {
      matchOps: {defaultMatchDurationMin: 30, minRestBetweenMatchesMin: 30},
    });
    seedMatch(fake, "next-match", {matchNumber: 2, scheduleTime: ts("2026-08-25T14:30:00-03:00")});

    const before = {tournamentId: TOURNAMENT_ID, dayKey: DAY_KEY, courtId: COURT_ID, status: "In Progress"};
    const after = {
      tournamentId: TOURNAMENT_ID,
      dayKey: DAY_KEY,
      courtId: COURT_ID,
      status: "Completed",
      matchEndedAt: ts("2026-08-25T14:20:00-03:00"),
    };

    await handleDynamicRescheduleOnMatchUpdate(db(fake), PROJECT_ID, "trigger-match", before, after);

    const untouched = (await fake.doc(`${MATCHES_PATH}/next-match`).get()).data();
    assert.equal(
      (untouched?.scheduleTime as Timestamp).toMillis(),
      ts("2026-08-25T14:30:00-03:00").toMillis(),
    );
    assert.equal(sent.length, 0);
  });

  it("recalcula e notifica de ponta a ponta quando a flag está ligada", async () => {
    mockDeliver();
    const fake = new FakeFirestore();
    fake.seedDoc(`tournaments/${TOURNAMENT_ID}`, {
      matchOps: {dynamicRescheduleEnabled: true, defaultMatchDurationMin: 30, minRestBetweenMatchesMin: 30},
    });
    fake.seedDoc(`${TEAMS_PATH}/team-c`, {player1Id: "p3", player2Id: "p4"});
    fake.seedDoc(`${TEAMS_PATH}/team-d`, {player1Id: "p5", player2Id: "p6"});
    seedMatch(fake, "next-match", {
      matchNumber: 2,
      scheduleTime: ts("2026-08-25T14:30:00-03:00"),
      scheduleEndTime: ts("2026-08-25T15:00:00-03:00"),
      teamAId: "team-c",
      teamBId: "team-d",
    });

    const before = {tournamentId: TOURNAMENT_ID, dayKey: DAY_KEY, courtId: COURT_ID, status: "In Progress"};
    const after = {
      tournamentId: TOURNAMENT_ID,
      dayKey: DAY_KEY,
      courtId: COURT_ID,
      status: "Completed",
      matchEndedAt: ts("2026-08-25T14:15:00-03:00"), // terminou 15min antes do previsto
    };

    await handleDynamicRescheduleOnMatchUpdate(db(fake), PROJECT_ID, "trigger-match", before, after);

    const updated = (await fake.doc(`${MATCHES_PATH}/next-match`).get()).data();
    assert.equal(
      (updated?.scheduleTime as Timestamp).toMillis(),
      ts("2026-08-25T14:15:00-03:00").toMillis(),
    );
    assert.equal(sent.length, 4); // 2 jogadores x 2 times
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run build && node --test lib/match-dynamic-reschedule.recalculate.test.js`
Expected: FAIL (`recalculateCourtSchedule`/`notifyScheduleShifts`/`handleDynamicRescheduleOnMatchUpdate` não existem ainda)

- [ ] **Step 3: Implementar — adicionar ao final de `functions/src/match-dynamic-reschedule.ts`**

Primeiro, atualizar os imports no topo do arquivo: as DUAS linhas da Task 3
(`import type {Timestamp} from "firebase-admin/firestore";` e
`import {isMatchCompleted} from "./match-status";`) saem inteiras, dando lugar
a este bloco (que já inclui `isMatchCompleted` junto de `isMatchCanceled` —
importar as duas de novo em linhas separadas duplicaria o identificador e
quebraria o build):

```ts
import {
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {isMatchCanceled, isMatchCompleted} from "./match-status";
import {deliverNotificationToUser} from "./notification-delivery";
import {eventTimeLabel} from "./event-timezone";
import {artifactsTeamsPath} from "./firebase-paths";
import {allocateCourtSlots, loadTournamentMatches} from "./match-schedule-allocation";
```

Depois, ao final do arquivo (após `determineRecalcTrigger`), adicionar:

```ts
export interface ScheduleShift {
  matchId: string;
  teamAId: string;
  teamBId: string;
  oldStart: Date | null;
  newStart: Date;
  courtLabel: string;
}

/**
 * Recalcula a fila de UMA quadra a partir da âncora, reaproveitando o mesmo
 * núcleo guloso de `autoScheduleTournamentDay` (`allocateCourtSlots`), mas só
 * sobre as partidas daquela quadra/dia que ainda não começaram. O descanso
 * mínimo (`minRestMin`) continua respeitado mesmo contra partidas em OUTRAS
 * quadras: `teamBusyUntil` é semeado com o dia inteiro, não só a quadra.
 */
export async function recalculateCourtSchedule(
  db: Firestore,
  projectId: string,
  trigger: RecalcTrigger,
  config: {durationMin: number; minRestMin: number},
): Promise<ScheduleShift[]> {
  const allMatches = await loadTournamentMatches(
    db,
    projectId,
    trigger.tournamentId,
    trigger.dayKey,
  );

  const reassign = allMatches.filter((doc) => {
    if (doc.id === trigger.triggerMatchId) return false;
    const d = doc.data();
    if (String(d.courtId ?? "").trim() !== trigger.courtId) return false;
    if (isMatchCompleted(d.status) || isMatchCanceled(d.status)) return false;
    if (d.queueStatus === "on_court" || d.queueStatus === "completed") return false;
    return true;
  });
  if (reassign.length === 0) return [];

  const reassignIds = new Set(reassign.map((doc) => doc.id));
  const teamBusyUntil: Record<string, Date> = {};
  for (const doc of allMatches) {
    if (reassignIds.has(doc.id)) continue;
    const d = doc.data();
    if (!d.scheduleTime) continue;
    const start = (d.scheduleTime as Timestamp).toDate();
    const end = d.scheduleEndTime ?
      (d.scheduleEndTime as Timestamp).toDate() :
      new Date(start.getTime() + config.durationMin * 60 * 1000);
    const restUntil = new Date(end.getTime() + config.minRestMin * 60 * 1000);
    for (const tid of [d.teamAId, d.teamBId]) {
      if (typeof tid !== "string" || !tid.trim()) continue;
      const prev = teamBusyUntil[tid];
      if (!prev || restUntil > prev) teamBusyUntil[tid] = restUntil;
    }
  }

  const slots = allocateCourtSlots({
    courts: [{id: trigger.courtId}],
    unscheduled: reassign,
    courtBusyUntil: {[trigger.courtId]: trigger.anchor},
    teamBusyUntil,
    durationMin: config.durationMin,
    minRestMin: config.minRestMin,
    avoidAthleteConflict: true,
    dayStart: trigger.anchor,
  });

  const matchesById = new Map(reassign.map((doc) => [doc.id, doc] as const));
  const shifts: ScheduleShift[] = [];
  for (const slot of slots) {
    const doc = matchesById.get(slot.matchId);
    if (!doc) continue;
    const data = doc.data();
    const oldStart = data.scheduleTime ? (data.scheduleTime as Timestamp).toDate() : null;
    await doc.ref.update({
      scheduleTime: Timestamp.fromDate(slot.start),
      scheduleEndTime: Timestamp.fromDate(slot.end),
      scheduleRecalcAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    shifts.push({
      matchId: slot.matchId,
      teamAId: String(data.teamAId ?? ""),
      teamBId: String(data.teamBId ?? ""),
      oldStart,
      newStart: slot.start,
      courtLabel: String(data.courtName ?? trigger.courtId),
    });
  }
  return shifts;
}

/** Notifica os atletas das partidas cujo horário moveu >= `SCHEDULE_DRIFT_THRESHOLD_MIN`. */
export async function notifyScheduleShifts(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  shifts: ScheduleShift[],
): Promise<void> {
  for (const shift of shifts) {
    if (!shift.oldStart) continue;
    const driftMin = Math.abs(shift.newStart.getTime() - shift.oldStart.getTime()) / 60000;
    if (driftMin < SCHEDULE_DRIFT_THRESHOLD_MIN) continue;

    for (const teamId of [shift.teamAId, shift.teamBId]) {
      if (!teamId) continue;
      const teamSnap = await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get();
      const team = teamSnap.data();
      if (!team) continue;
      const players = [team.player1Id, team.player2Id].filter(
        (v): v is string => typeof v === "string" && v.trim() !== "",
      );
      for (const playerId of players) {
        try {
          await deliverNotificationToUser({
            userId: playerId,
            title: "Horário da sua partida mudou",
            body: `Nova previsão: ${eventTimeLabel(shift.newStart)} na ${shift.courtLabel}.`,
            type: "match_schedule_updated",
            data: {
              type: "match_schedule_updated",
              matchId: shift.matchId,
              tournamentId,
              newScheduleTime: shift.newStart.toISOString(),
            },
          });
        } catch (e) {
          logger.warn("notifyScheduleShifts: falha ao notificar", {matchId: shift.matchId, playerId, e});
        }
      }
    }
  }
}

/**
 * Ponto de entrada chamado pelo trigger de matches em TODA atualização (não
 * só conclusão): reagendamento manual e início atrasado não são "conclusão",
 * então dependeriam de um segundo trigger se ficassem atrás do guard de
 * `shouldPropagateMatchAdvance`.
 */
export async function handleDynamicRescheduleOnMatchUpdate(
  db: Firestore,
  projectId: string,
  matchId: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): Promise<void> {
  if (!after) return;
  const tournamentId = String(after.tournamentId ?? "").trim();
  if (!tournamentId) return;

  const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  const matchOps = tournamentSnap.data()?.matchOps as Record<string, unknown> | undefined;
  if (matchOps?.dynamicRescheduleEnabled !== true) return;

  const durationMin = (matchOps?.defaultMatchDurationMin as number) ?? 30;
  const minRestMin = (matchOps?.minRestBetweenMatchesMin as number) ?? 30;

  const trigger = determineRecalcTrigger(matchId, before, after, durationMin);
  if (!trigger) return;

  const shifts = await recalculateCourtSchedule(db, projectId, trigger, {durationMin, minRestMin});
  await notifyScheduleShifts(db, projectId, tournamentId, shifts);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run build && node --test lib/match-dynamic-reschedule.recalculate.test.js lib/match-dynamic-reschedule.test.js`
Expected: PASS (6 testes novos + 9 da Task 3)

- [ ] **Step 5: Ligar no trigger `onTournamentMatchCompletedAdvance`**

Em `functions/src/organizer-match-ops.ts`:

1. Adicionar ao bloco de imports:

```ts
import {handleDynamicRescheduleOnMatchUpdate} from "./match-dynamic-reschedule";
```

2. Editar `onTournamentMatchCompletedAdvance` (linhas ~1336-1380) — mover a
   leitura de `db`/`projectId`/`matchId` para ANTES do `if` de early-return, e
   chamar o novo handler antes dele, para que ele rode em toda atualização e
   não só quando `shouldPropagateMatchAdvance` for true:

```ts
export const onTournamentMatchCompletedAdvance = onDocumentUpdated(
  "artifacts/{appId}/public/data/matches/{matchId}",
  async (event) => {
    const before = event.data?.before.data() as
      | Record<string, unknown>
      | undefined;
    const after = event.data?.after.data() as
      | Record<string, unknown>
      | undefined;

    const db = getFirestore();
    const projectId = event.params.appId;
    const matchId = event.params.matchId;

    try {
      await handleDynamicRescheduleOnMatchUpdate(db, projectId, matchId, before, after);
    } catch (e) {
      logger.error("onTournamentMatchCompletedAdvance: reagendamento dinâmico falhou", {matchId, e});
    }

    if (!shouldPropagateMatchAdvance(before, after) || !after) return;

    try {
      await advanceBracketWinnerInternal(db, projectId, after);
    } catch (e) {
      logger.error("onTournamentMatchCompletedAdvance: avanço falhou", {matchId, e});
    }
    try {
      await tryCompleteTournamentAfterFinal(db, projectId, after);
    } catch (e) {
      logger.error("onTournamentMatchCompletedAdvance: conclusão falhou", {matchId, e});
    }
    try {
      await tryAwardLeagueStagePointsForMatch(db, projectId, {
        ...after,
        id: matchId,
      });
    } catch (e) {
      logger.error("onTournamentMatchCompletedAdvance: ranking falhou", {matchId, e});
    }
    try {
      await syncTournamentLiveMatchesNow(
        db,
        projectId,
        String(after.tournamentId ?? ""),
      );
    } catch (e) {
      logger.warn("onTournamentMatchCompletedAdvance: sync falhou", {matchId, e});
    }
  },
);
```

- [ ] **Step 6: Build + suíte completa de `organizer-match-ops` e do módulo novo**

Run: `npm run build && node --test lib/organizer-match-ops.test.js lib/organizer-match-ops.live-score.test.js lib/organizer-match-ops.revert-live.test.js lib/match-dynamic-reschedule.test.js lib/match-dynamic-reschedule.recalculate.test.js`
Expected: PASS em todos

- [ ] **Step 7: Commit**

```bash
git add functions/src/match-dynamic-reschedule.ts functions/src/match-dynamic-reschedule.recalculate.test.ts functions/src/organizer-match-ops.ts
git commit -m "$(cat <<'EOF'
feat(functions): recálculo em cascata + notificação de horário

recalculateCourtSchedule desloca as partidas seguintes da mesma quadra a
partir do horário real (conclusão, W.O. ou atraso no início);
notifyScheduleShifts avisa os atletas quando o desvio é >= 10min. Ligado em
onTournamentMatchCompletedAdvance, atrás da flag matchOps.dynamicRescheduleEnabled.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Callable `updateMatchOpsSettings`

Único jeito de ligar a flag `matchOps.dynamicRescheduleEnabled` — não existe
hoje NENHUMA callable nem tela que edite `matchOps` (achado durante o design,
ver spec D4). Segue o padrão `Core` + wrapper `onCall` já usado em
`updateLiveMatchScoreCore`/`sendCategoryCommunicationCore`.

**Files:**
- Modify: `functions/src/organizer-match-ops.ts`
- Create: `functions/src/organizer-match-ops.update-settings.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `assertCanManageTournament` de `./tournament-acl` (já importado em `organizer-match-ops.ts`).
- Produces: `updateMatchOpsSettingsCore(db: Firestore, uid: string, tournamentId: string, dynamicRescheduleEnabled: boolean): Promise<{ok: true; dynamicRescheduleEnabled: boolean}>`, callable `updateMatchOpsSettings` — usado pelo app Flutter (Task 6).

- [ ] **Step 1: Escrever o teste primeiro**

Criar `functions/src/organizer-match-ops.update-settings.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {updateMatchOpsSettingsCore} from "./organizer-match-ops";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

async function assertHttpsError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (err: {code?: string}) => {
    assert.equal(err.code, code, `esperava HttpsError ${code}, veio ${err.code}`);
    return true;
  });
}

describe("updateMatchOpsSettingsCore", () => {
  it("liga a flag e preserva os outros campos de matchOps", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("tournaments/t1", {
      managerId: "owner-1",
      matchOps: {defaultMatchDurationMin: 45, minRestBetweenMatchesMin: 20},
    });

    const result = await updateMatchOpsSettingsCore(db(fake), "owner-1", "t1", true);

    assert.deepEqual(result, {ok: true, dynamicRescheduleEnabled: true});
    const tournament = (await fake.doc("tournaments/t1").get()).data();
    const matchOps = tournament?.matchOps as Record<string, unknown>;
    assert.equal(matchOps.dynamicRescheduleEnabled, true);
    assert.equal(matchOps.defaultMatchDurationMin, 45);
    assert.equal(matchOps.minRestBetweenMatchesMin, 20);
  });

  it("rejeita quem não é dono/staff do torneio", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("tournaments/t1", {managerId: "owner-1", matchOps: {}});

    await assertHttpsError(
      updateMatchOpsSettingsCore(db(fake), "intruso", "t1", true),
      "permission-denied",
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run build && node --test lib/organizer-match-ops.update-settings.test.js`
Expected: FAIL (`updateMatchOpsSettingsCore` não existe)

- [ ] **Step 3: Implementar em `organizer-match-ops.ts`**

Adicionar logo antes de `export const autoScheduleTournamentDay = onCall(...)`:

```ts
export async function updateMatchOpsSettingsCore(
  db: Firestore,
  uid: string,
  tournamentId: string,
  dynamicRescheduleEnabled: boolean,
): Promise<{ok: true; dynamicRescheduleEnabled: boolean}> {
  await assertCanManageTournament(db, uid, tournamentId);
  await db.doc(`tournaments/${tournamentId}`).set(
    {
      matchOps: {dynamicRescheduleEnabled},
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  return {ok: true, dynamicRescheduleEnabled};
}

export const updateMatchOpsSettings = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const tournamentId = (request.data?.tournamentId as string)?.trim();
  if (!tournamentId) {
    throw new HttpsError("invalid-argument", "tournamentId obrigatório");
  }
  const dynamicRescheduleEnabled = request.data?.dynamicRescheduleEnabled === true;

  const db = getFirestore();
  return updateMatchOpsSettingsCore(db, uid, tournamentId, dynamicRescheduleEnabled);
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run build && node --test lib/organizer-match-ops.update-settings.test.js`
Expected: PASS (2 testes)

- [ ] **Step 5: Exportar a callable em `index.ts`**

Em `functions/src/index.ts`:

1. No bloco de import de `organizer-match-ops` (linhas 72-86), adicionar `updateMatchOpsSettings,` à lista.
2. No bloco de `export {...}` (linhas ~209-221), adicionar `updateMatchOpsSettings,` à lista (mesma posição relativa, perto de `autoScheduleTournamentDay`).

- [ ] **Step 6: Build completo do projeto de functions**

Run: `npm run build`
Expected: build limpo, sem erros de tipo

- [ ] **Step 7: Commit**

```bash
git add functions/src/organizer-match-ops.ts functions/src/organizer-match-ops.update-settings.test.ts functions/src/index.ts
git commit -m "$(cat <<'EOF'
feat(functions): callable updateMatchOpsSettings

Único jeito hoje de ligar matchOps.dynamicRescheduleEnabled — não existia
nenhuma callable nem tela que editasse matchOps antes disso.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Toggle no app organizador (Flutter)

Adiciona o campo ao modelo, o método de serviço e um switch avulso na tela de
auto-agendamento (não existe tela de configurações de `matchOps` hoje — ver
spec D4).

**Files:**
- Modify: `nexago_app/lib/features/organizer/domain/match_ops/match_ops_models.dart`
- Modify: `nexago_app/lib/features/organizer/data/organizer_match_schedule_service.dart`
- Modify: `nexago_app/lib/features/organizer/presentation/match_ops/organizer_auto_schedule_page.dart`
- Create: `nexago_app/test/features/organizer/match_ops_models_test.dart`

**Interfaces:**
- Produces: `TournamentMatchOpsConfig.dynamicRescheduleEnabled` (bool, default `false`), `OrganizerMatchScheduleService.updateMatchOpsSettings({required String tournamentId, required bool dynamicRescheduleEnabled}): Future<bool>`.

- [ ] **Step 1: Escrever o teste do modelo primeiro**

Criar `nexago_app/test/features/organizer/match_ops_models_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_models.dart';

void main() {
  group('TournamentMatchOpsConfig.dynamicRescheduleEnabled', () {
    test('default é false quando o campo não existe no map', () {
      final config = TournamentMatchOpsConfig.fromMap({
        'defaultMatchDurationMin': 30,
      });

      expect(config.dynamicRescheduleEnabled, isFalse);
    });

    test('lê true quando gravado no map', () {
      final config = TournamentMatchOpsConfig.fromMap({
        'dynamicRescheduleEnabled': true,
      });

      expect(config.dynamicRescheduleEnabled, isTrue);
    });

    test('toMap/fromMap fazem round-trip preservando o valor', () {
      const config = TournamentMatchOpsConfig(dynamicRescheduleEnabled: true);

      final roundTripped = TournamentMatchOpsConfig.fromMap(config.toMap());

      expect(roundTripped.dynamicRescheduleEnabled, isTrue);
    });
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nexago_app && flutter test test/features/organizer/match_ops_models_test.dart`
Expected: FAIL (`dynamicRescheduleEnabled` não existe em `TournamentMatchOpsConfig`)

- [ ] **Step 3: Adicionar o campo ao modelo**

Em `nexago_app/lib/features/organizer/domain/match_ops/match_ops_models.dart`,
na classe `TournamentMatchOpsConfig` (linhas 122-181):

```dart
class TournamentMatchOpsConfig {
  const TournamentMatchOpsConfig({
    this.activeDayKey = '',
    this.dayStart = kDefaultMatchOpsDayStart,
    this.dayEnd = kDefaultMatchOpsDayEnd,
    this.defaultMatchDurationMin = 30,
    this.minRestBetweenMatchesMin = 30,
    this.checkInToleranceMin = 15,
    this.avoidAthleteConflict = true,
    this.respectBracketDeps = true,
    this.seedOnPrimeCourt = false,
    this.dynamicRescheduleEnabled = false,
  });

  final String activeDayKey;
  final String dayStart;
  final String dayEnd;
  final int defaultMatchDurationMin;
  final int minRestBetweenMatchesMin;
  final int checkInToleranceMin;
  final bool avoidAthleteConflict;
  final bool respectBracketDeps;
  final bool seedOnPrimeCourt;
  final bool dynamicRescheduleEnabled;

  factory TournamentMatchOpsConfig.fromMap(Map<String, dynamic>? map) {
    if (map == null || map.isEmpty) return const TournamentMatchOpsConfig();
    final rules = map['autoScheduleRules'];
    return TournamentMatchOpsConfig(
      activeDayKey: (map['activeDayKey'] as String?)?.trim() ?? '',
      dayStart:
          (map['dayStart'] as String?)?.trim() ?? kDefaultMatchOpsDayStart,
      dayEnd: (map['dayEnd'] as String?)?.trim() ?? kDefaultMatchOpsDayEnd,
      defaultMatchDurationMin:
          (map['defaultMatchDurationMin'] as num?)?.toInt() ?? 30,
      minRestBetweenMatchesMin:
          (map['minRestBetweenMatchesMin'] as num?)?.toInt() ?? 30,
      checkInToleranceMin: (map['checkInToleranceMin'] as num?)?.toInt() ?? 15,
      avoidAthleteConflict: rules is Map
          ? rules['avoidAthleteConflict'] != false
          : true,
      respectBracketDeps:
          rules is Map ? rules['respectBracketDeps'] != false : true,
      seedOnPrimeCourt:
          rules is Map ? rules['seedOnPrimeCourt'] == true : false,
      dynamicRescheduleEnabled: map['dynamicRescheduleEnabled'] == true,
    );
  }

  Map<String, dynamic> toMap() => {
        'activeDayKey': activeDayKey,
        'dayStart': dayStart,
        'dayEnd': dayEnd,
        'defaultMatchDurationMin': defaultMatchDurationMin,
        'minRestBetweenMatchesMin': minRestBetweenMatchesMin,
        'checkInToleranceMin': checkInToleranceMin,
        'autoScheduleRules': {
          'avoidAthleteConflict': avoidAthleteConflict,
          'respectBracketDeps': respectBracketDeps,
          'seedOnPrimeCourt': seedOnPrimeCourt,
        },
        'dynamicRescheduleEnabled': dynamicRescheduleEnabled,
      };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd nexago_app && flutter test test/features/organizer/match_ops_models_test.dart`
Expected: PASS (3 testes)

- [ ] **Step 5: Adicionar o método ao serviço**

Em `nexago_app/lib/features/organizer/data/organizer_match_schedule_service.dart`,
adicionar (por exemplo, logo após `autoScheduleTournamentDay`, antes de
`_normalizeCallableMap`):

```dart
  Future<bool> updateMatchOpsSettings({
    required String tournamentId,
    required bool dynamicRescheduleEnabled,
  }) async {
    final callable = _functions.httpsCallable('updateMatchOpsSettings');
    final result = await callable.call({
      'tournamentId': tournamentId.trim(),
      'dynamicRescheduleEnabled': dynamicRescheduleEnabled,
    });
    final data = Map<String, dynamic>.from(result.data as Map? ?? {});
    return data['dynamicRescheduleEnabled'] == true;
  }
```

- [ ] **Step 6: Adicionar o switch em `organizer_auto_schedule_page.dart`**

1. Adicionar o campo de estado, junto aos outros (linha 41-46):

```dart
  bool _avoidConflict = true;
  bool _respectDeps = true;
  bool _savingDynamicReschedule = false;
  bool _loading = false;
```

2. Adicionar o handler, por exemplo logo após `_run` (depois da linha 228):

```dart
  Future<void> _toggleDynamicReschedule(bool value) async {
    setState(() => _savingDynamicReschedule = true);
    try {
      final service = ref.read(organizerMatchScheduleServiceProvider);
      await service.updateMatchOpsSettings(
        tournamentId: widget.tournamentId,
        dynamicRescheduleEnabled: value,
      );
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, friendlyScheduleError(e), isError: true);
      }
    } finally {
      if (mounted) setState(() => _savingDynamicReschedule = false);
    }
  }
```

3. Adicionar o `SwitchListTile` no `build()`, logo depois do de "Respeitar
   dependências da chave" (depois da linha 419, antes do
   `if (scheduleFromSlots.isNotEmpty)`):

```dart
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Reagendamento dinâmico'),
                  subtitle: const Text(
                    'Recalcula automaticamente o horário das próximas '
                    'partidas da quadra quando uma termina antes/depois ou '
                    'vira W.O.',
                  ),
                  value: config.dynamicRescheduleEnabled,
                  onChanged: _savingDynamicReschedule
                      ? null
                      : _toggleDynamicReschedule,
                ),
```

(`config` já está disponível no escopo do `build()`, lido na linha 335-336.)

- [ ] **Step 7: Rodar análise estática do app**

Run: `cd nexago_app && flutter analyze lib/features/organizer/domain/match_ops/match_ops_models.dart lib/features/organizer/data/organizer_match_schedule_service.dart lib/features/organizer/presentation/match_ops/organizer_auto_schedule_page.dart`
Expected: sem erros novos

- [ ] **Step 8: Rodar a flutter-test-engineer para cobertura de widget do switch novo**

Dispatch o agente `flutter-test-engineer` (convenção do projeto para toda
mudança de funcionalidade Flutter, ver `.claude/CLAUDE.md`) apontando para
`nexago_app/lib/features/organizer/presentation/match_ops/organizer_auto_schedule_page.dart`,
pedindo um widget test que cubra: o switch aparece refletindo
`config.dynamicRescheduleEnabled`; tocar nele chama
`OrganizerMatchScheduleService.updateMatchOpsSettings` com o `tournamentId` e
o novo valor; o switch fica desabilitado durante `_savingDynamicReschedule`.

- [ ] **Step 9: Rodar a suíte completa afetada**

Run: `cd nexago_app && flutter test test/features/organizer/`
Expected: PASS em todos, incluindo o widget test novo do Step 8

- [ ] **Step 10: Commit**

```bash
git add nexago_app/lib/features/organizer/domain/match_ops/match_ops_models.dart nexago_app/lib/features/organizer/data/organizer_match_schedule_service.dart nexago_app/lib/features/organizer/presentation/match_ops/organizer_auto_schedule_page.dart nexago_app/test/features/organizer/match_ops_models_test.dart
git commit -m "$(cat <<'EOF'
feat(app): toggle de reagendamento dinâmico na auto-programação

Único jeito hoje de ligar matchOps.dynamicRescheduleEnabled — não existia
tela de configurações de matchOps, então o switch fica na tela conceitualmente
mais próxima (auto-programação).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review (preenchido durante a escrita do plano)

**Cobertura do spec:** D1 (núcleo de alocação reusado) → Task 1 e 4. D2 (três
gatilhos) → Task 3, consolidados num único trigger existente (simplificação
descoberta durante o plano: `declareMatchWalkover`/`scheduleMatch` não
precisam de mudança própria, pois a escrita deles já dispara o mesmo
`onDocumentUpdated` que `determineRecalcTrigger` já sabe interpretar). D3
(guarda anti-loop) → Task 3. D4 (flag opt-in + achado da tela inexistente) →
Task 5 e 6. D5 (notificação, limiar 10min) → Task 4. D6 (sem mudança na
exibição) → nenhuma task, intencional. Testes do spec → cobertos nas Tasks
1, 3, 4 e 5.

**Consistência de tipos:** `RecalcTrigger`/`ScheduleShift` definidos na Task 3
e 4 e usados sem alteração de forma nas duas; `config: {durationMin,
minRestMin}` é o mesmo shape em `recalculateCourtSchedule` e no chamador
`handleDynamicRescheduleOnMatchUpdate`; `CourtAllocationSlot` (Task 1) usado
sem mudança em `recalculateCourtSchedule` (Task 4) e em
`autoScheduleTournamentDay` (Task 1).
