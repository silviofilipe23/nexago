import assert from "node:assert/strict";
import {test} from "node:test";

import {MatchStatus} from "./match-status";
import {
  LiveMatchSnapshot,
  NotifySidecar,
  SCORE_THROTTLE_MS,
  liveScoreSignature,
  resolveLiveUpdate,
} from "./match-live-follow-notify";

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

function sidecar(over: Partial<NotifySidecar> = {}): NotifySidecar {
  return {lastPushAt: null, lastSignature: null, ...over};
}

/** Sidecar que já notificou há `agoMs`, com assinatura que não colide. */
function pushedAgo(agoMs: number): NotifySidecar {
  return sidecar({lastPushAt: NOW - agoMs, lastSignature: "outra-assinatura"});
}

test("Scheduled -> In Progress vira start", () => {
  const decision = resolveLiveUpdate(
    snap({status: MatchStatus.scheduled}),
    snap({status: MatchStatus.inProgress, liveScore: live(0, 0, 1, 0)}),
    sidecar(),
    NOW,
  );

  assert.equal(decision.push, true);
  assert.equal(decision.kind, "start");
});

test("set fechado pelo liveScore da mesa web vira set", () => {
  const decision = resolveLiveUpdate(
    snap({liveScore: live(0, 0, 20, 15)}),
    snap({liveScore: live(1, 0, 0, 0), currentSetIndex: 1}),
    sidecar(),
    NOW,
  );

  assert.equal(decision.push, true);
  assert.equal(decision.kind, "set");
});

test("set fechado pela mesa do app conta sets VENCIDOS, não o tamanho do array", () => {
  // A mesa do app só cria o set seguinte no primeiro ponto dele: quando o set
  // fecha, `sets.length` não muda. Quem detecta o fechamento é `setsWon`.
  const decision = resolveLiveUpdate(
    snap({sets: [{a: 20, b: 15}], currentSetIndex: 0}),
    snap({sets: [{a: 21, b: 15}], currentSetIndex: 1}),
    sidecar(),
    NOW,
  );

  assert.equal(decision.push, true);
  assert.equal(decision.kind, "set");
});

test("set point no primeiro set alerta sem fechar a partida", () => {
  const decision = resolveLiveUpdate(
    snap({liveScore: live(0, 0, 19, 15)}),
    snap({liveScore: live(0, 0, 20, 15)}),
    sidecar(),
    NOW,
  );

  assert.equal(decision.push, true);
  assert.equal(decision.kind, "matchPoint");
  assert.deepEqual(decision.pointAlert, {side: "A", closesMatch: false});
});

test("match point quando o set em jogo fecha a partida em bestOf 3", () => {
  const decision = resolveLiveUpdate(
    snap({liveScore: live(1, 0, 19, 15), currentSetIndex: 1}),
    snap({liveScore: live(1, 0, 20, 15), currentSetIndex: 1}),
    sidecar(),
    NOW,
  );

  assert.equal(decision.push, true);
  assert.equal(decision.kind, "matchPoint");
  assert.deepEqual(decision.pointAlert, {side: "A", closesMatch: true});
});

test("em bestOf 1 o set point já é match point", () => {
  const decision = resolveLiveUpdate(
    snap({bestOf: 1, liveScore: live(0, 0, 19, 10)}),
    snap({bestOf: 1, liveScore: live(0, 0, 20, 10)}),
    sidecar(),
    NOW,
  );

  assert.equal(decision.kind, "matchPoint");
  assert.deepEqual(decision.pointAlert, {side: "A", closesMatch: true});
});

test("set decisivo usa alvo 15, não 21", () => {
  const decision = resolveLiveUpdate(
    snap({liveScore: live(1, 1, 13, 10), currentSetIndex: 2}),
    snap({liveScore: live(1, 1, 14, 10), currentSetIndex: 2}),
    sidecar(),
    NOW,
  );

  assert.equal(decision.kind, "matchPoint");
  assert.deepEqual(decision.pointAlert, {side: "A", closesMatch: true});
});

test("20x20 não é set point: falta a vantagem de 2", () => {
  const decision = resolveLiveUpdate(
    snap({liveScore: live(0, 0, 19, 20)}),
    snap({liveScore: live(0, 0, 20, 20)}),
    sidecar(),
    NOW,
  );

  assert.equal(decision.kind, "score");
  assert.equal(decision.pointAlert, null);
});

test("match point alerta só na ENTRADA, não a cada ponto seguinte", () => {
  // 20x15 já era match point; 20x16 continua sendo. Alertar de novo faria a
  // notificação vibrar a cada ponto do adversário até o fim do set.
  const decision = resolveLiveUpdate(
    snap({liveScore: live(1, 0, 20, 15), currentSetIndex: 1}),
    snap({liveScore: live(1, 0, 20, 16), currentSetIndex: 1}),
    pushedAgo(SCORE_THROTTLE_MS + 1_000),
    NOW,
  );

  assert.equal(decision.kind, "score");
});

test("Completed vira end", () => {
  const decision = resolveLiveUpdate(
    snap({liveScore: live(1, 0, 20, 15)}),
    snap({status: MatchStatus.completed, liveScore: live(2, 0, 0, 0)}),
    sidecar(),
    NOW,
  );

  assert.equal(decision.push, true);
  assert.equal(decision.kind, "end");
});

test("Canceled vira dismiss", () => {
  const decision = resolveLiveUpdate(
    snap({liveScore: live(1, 0, 10, 8)}),
    snap({status: MatchStatus.canceled, liveScore: null}),
    sidecar(),
    NOW,
  );

  assert.equal(decision.push, true);
  assert.equal(decision.kind, "dismiss");
});

test("volta para Scheduled vira dismiss", () => {
  const decision = resolveLiveUpdate(
    snap({liveScore: live(1, 0, 10, 8)}),
    snap({status: MatchStatus.scheduled, sets: [], liveScore: null}),
    sidecar(),
    NOW,
  );

  assert.equal(decision.push, true);
  assert.equal(decision.kind, "dismiss");
});

test("ponto comum dentro da janela do throttle não empurra", () => {
  const decision = resolveLiveUpdate(
    snap({liveScore: live(0, 0, 5, 3)}),
    snap({liveScore: live(0, 0, 6, 3)}),
    pushedAgo(5_000),
    NOW,
  );

  assert.equal(decision.push, false);
  assert.equal(decision.kind, "score");
});

test("ponto comum fora da janela do throttle empurra", () => {
  const decision = resolveLiveUpdate(
    snap({liveScore: live(0, 0, 5, 3)}),
    snap({liveScore: live(0, 0, 6, 3)}),
    pushedAgo(SCORE_THROTTLE_MS + 1_000),
    NOW,
  );

  assert.equal(decision.push, true);
  assert.equal(decision.kind, "score");
});

test("primeiro ponto de todos empurra: sem lastPushAt não há janela", () => {
  const decision = resolveLiveUpdate(
    snap({liveScore: live(0, 0, 5, 3)}),
    snap({liveScore: live(0, 0, 6, 3)}),
    sidecar(),
    NOW,
  );

  assert.equal(decision.push, true);
  assert.equal(decision.kind, "score");
});

test("set fechado ignora o throttle", () => {
  const decision = resolveLiveUpdate(
    snap({liveScore: live(0, 0, 20, 15)}),
    snap({liveScore: live(1, 0, 0, 0), currentSetIndex: 1}),
    pushedAgo(1_000),
    NOW,
  );

  assert.equal(decision.push, true);
  assert.equal(decision.kind, "set");
});

test("assinatura já notificada não empurra nem quando é fim de jogo", () => {
  const after = snap({status: MatchStatus.completed, liveScore: live(2, 0, 0, 0)});

  const decision = resolveLiveUpdate(
    snap({liveScore: live(1, 0, 20, 15)}),
    after,
    sidecar({lastPushAt: NOW - 60_000, lastSignature: liveScoreSignature(after)}),
    NOW,
  );

  assert.equal(decision.push, false);
});

test("update que não mexe no placar não empurra", () => {
  // A mesa corrigiu a quadra: o doc mudou, o placar não.
  const same = snap({liveScore: live(1, 0, 10, 8)});

  const decision = resolveLiveUpdate(same, snap({liveScore: live(1, 0, 10, 8)}), sidecar(), NOW);

  assert.equal(decision.push, false);
  assert.equal(decision.kind, null);
});

test("partida sem placar nos dois lados não empurra", () => {
  const decision = resolveLiveUpdate(
    snap({status: MatchStatus.scheduled, liveScore: null}),
    snap({status: MatchStatus.scheduled, liveScore: null}),
    sidecar(),
    NOW,
  );

  assert.equal(decision.push, false);
});

test("liveScoreSignature ignora tudo que não é placar", () => {
  const a = snap({liveScore: live(1, 0, 10, 8)});
  const b = snap({liveScore: live(1, 0, 10, 8)});

  assert.equal(liveScoreSignature(a), liveScoreSignature(b));
  assert.notEqual(
    liveScoreSignature(a),
    liveScoreSignature(snap({liveScore: live(1, 0, 11, 8)})),
  );
});

test("sets fechados no array valem tanto quanto o liveScore para a assinatura", () => {
  assert.notEqual(
    liveScoreSignature(snap({sets: [{a: 21, b: 15}], currentSetIndex: 1})),
    liveScoreSignature(snap({sets: [{a: 21, b: 15}, {a: 3, b: 1}], currentSetIndex: 1})),
  );
});
