import assert from "node:assert/strict";
import {test} from "node:test";

import {MatchStatus} from "./match-status";
import {
  LiveMatchSnapshot,
  resolveLiveUpdate,
  snapshotFromMatchData,
} from "./match-live-follow-notify";
import {
  APNS_PAYLOAD_LIMIT_BYTES,
  STALE_WINDOW_MS,
  contentStateBytes,
  contentStateFrom,
} from "./live-activity-content-state";

const NOW = 1_700_000_000_000;

function snap(over: Partial<LiveMatchSnapshot> = {}): LiveMatchSnapshot {
  return {
    status: MatchStatus.inProgress,
    sets: [],
    liveScore: null,
    currentSetIndex: 0,
    bestOf: 3,
    ...over,
  };
}

function live(setsA: number, setsB: number, gamesA: number, gamesB: number) {
  return {setsA, setsB, currentGamesA: gamesA, currentGamesB: gamesB};
}

const noSidecar = {lastPushAt: null, lastSignature: null};

/** Estado a partir de uma transição real, como o gatilho faria. */
function stateFor(
  before: LiveMatchSnapshot,
  after: LiveMatchSnapshot,
  servingSide: "A" | "B" | null = null,
) {
  const decision = resolveLiveUpdate(before, after, noSidecar, NOW);
  return contentStateFrom(after, decision, NOW, servingSide);
}

test("le o liveScore da mesa web", () => {
  const state = stateFor(
    snap({liveScore: live(1, 0, 19, 15), currentSetIndex: 1}),
    snap({liveScore: live(1, 0, 20, 15), currentSetIndex: 1}),
  );

  assert.equal(state.setsA, 1);
  assert.equal(state.setsB, 0);
  assert.equal(state.pointsA, 20);
  assert.equal(state.pointsB, 15);
  assert.equal(state.setIndex, 1);
});

test("le os sets da mesa do app e chega no MESMO estado", () => {
  // As duas mesas gravam formatos diferentes; a Live Activity não pode
  // depender de qual delas marcou o ponto.
  const web = stateFor(
    snap({liveScore: live(1, 0, 2, 1), currentSetIndex: 1}),
    snap({liveScore: live(1, 0, 3, 1), currentSetIndex: 1}),
  );
  const app = stateFor(
    snap({sets: [{a: 21, b: 15}, {a: 2, b: 1}], currentSetIndex: 1}),
    snap({sets: [{a: 21, b: 15}, {a: 3, b: 1}], currentSetIndex: 1}),
  );

  assert.deepEqual(
    {setsA: app.setsA, setsB: app.setsB, pointsA: app.pointsA, pointsB: app.pointsB},
    {setsA: web.setsA, setsB: web.setsB, pointsA: web.pointsA, pointsB: web.pointsB},
  );
});

test("fim de jogo vira status finished", () => {
  const state = stateFor(
    snap({liveScore: live(1, 0, 20, 15)}),
    snap({status: MatchStatus.completed, liveScore: live(2, 0, 0, 0)}),
  );

  assert.equal(state.status, "finished");
});

test("cancelamento vira status canceled", () => {
  const state = stateFor(
    snap({liveScore: live(1, 0, 10, 8)}),
    snap({status: MatchStatus.canceled, liveScore: null}),
  );

  assert.equal(state.status, "canceled");
});

test("ponto comum continua live", () => {
  const state = stateFor(
    snap({liveScore: live(0, 0, 5, 3)}),
    snap({liveScore: live(0, 0, 6, 3)}),
  );

  assert.equal(state.status, "live");
});

test("staleAfterMs e o que impede o card de mentir", () => {
  // Sem ele, um push perdido deixaria o placar velho na tela parecendo atual.
  const state = stateFor(
    snap({liveScore: live(0, 0, 5, 3)}),
    snap({liveScore: live(0, 0, 6, 3)}),
  );

  assert.equal(state.updatedAtMs, NOW);
  assert.equal(state.staleAfterMs, NOW + STALE_WINDOW_MS);
});

test("a janela de frescor cobre folgadamente o throttle de 20s", () => {
  // Se fosse menor que o throttle, o card entraria em "desatualizado" entre
  // dois pontos normais e pareceria quebrado.
  assert.ok(STALE_WINDOW_MS > 20_000 * 2, `${STALE_WINDOW_MS}`);
});

test("servingSide entra como veio e aceita ausencia", () => {
  const withServe = stateFor(
    snap({liveScore: live(0, 0, 5, 3)}),
    snap({liveScore: live(0, 0, 6, 3)}),
    "B",
  );
  const without = stateFor(
    snap({liveScore: live(0, 0, 5, 3)}),
    snap({liveScore: live(0, 0, 6, 3)}),
  );

  assert.equal(withServe.servingSide, "B");
  assert.equal(without.servingSide, null);
});

test("CONTRATO: o JSON e exatamente este — o Swift espelha campo a campo", () => {
  // Este é o acoplamento silencioso desta fase: renomear um campo aqui e o
  // card simplesmente para de atualizar, sem erro em lugar nenhum. Mudou este
  // teste? Mudou o `struct ContentState` no Swift junto, ou está quebrado.
  const state = stateFor(
    snap({liveScore: live(1, 0, 19, 15), currentSetIndex: 1}),
    snap({liveScore: live(1, 0, 20, 15), currentSetIndex: 1}),
    "A",
  );

  assert.equal(
    JSON.stringify(state),
    '{"setsA":1,"setsB":0,"pointsA":20,"pointsB":15,"setIndex":1,' +
      '"servingSide":"A","status":"live","updatedAtMs":1700000000000,' +
      '"staleAfterMs":1700000090000}',
  );
});

test("a ordem das chaves e estavel entre estados diferentes", () => {
  const a = stateFor(snap({liveScore: live(0, 0, 1, 0)}), snap({liveScore: live(0, 0, 2, 0)}));
  const b = stateFor(
    snap({liveScore: live(2, 1, 5, 5)}),
    snap({status: MatchStatus.completed, liveScore: live(2, 1, 5, 5)}),
  );

  assert.deepEqual(Object.keys(a), Object.keys(b));
});

test("cabe MUITO abaixo do limite de 4 KB do APNs", () => {
  const state = stateFor(
    snap({liveScore: live(2, 1, 20, 19), currentSetIndex: 2}),
    snap({liveScore: live(2, 1, 21, 19), currentSetIndex: 2}),
    "A",
  );

  assert.ok(contentStateBytes(state) < APNS_PAYLOAD_LIMIT_BYTES / 4,
    `${contentStateBytes(state)} bytes`);
});

test("aceita o doc cru do Firestore pelo mesmo caminho do gatilho", () => {
  const after = snapshotFromMatchData({
    status: "In Progress",
    liveScore: {setsA: 1, setsB: 1, currentGamesA: 14, currentGamesB: 10},
    currentSetIndex: 2,
    bestOf: 3,
  });
  const state = stateFor(snap({liveScore: live(1, 1, 13, 10), currentSetIndex: 2}), after);

  assert.equal(state.setIndex, 2);
  assert.equal(state.pointsA, 14);
});
