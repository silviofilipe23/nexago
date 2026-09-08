import assert from "node:assert/strict";
import {test} from "node:test";

import {MatchStatus} from "./match-status";
import {
  FOLLOW_RETENTION_MS,
  LiveMatchSnapshot,
  MatchEndState,
  MatchLiveContext,
  NotifySidecar,
  SCORE_THROTTLE_MS,
  buildMatchLiveContext,
  buildMatchLiveMessages,
  fnv1a32,
  liveScoreSignature,
  matchLiveTopics,
  pairLabelFrom,
  resolveLiveUpdate,
  snapshotFromMatchData,
  staleFollowPaths,
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

// --- Tópicos, contexto e payloads -------------------------------------------

function ctx(over: Partial<MatchLiveContext> = {}): MatchLiveContext {
  return {
    matchId: "m1",
    tournamentId: "t1",
    teamALabel: "Ana / Bia",
    teamBLabel: "Carla / Dani",
    courtName: "Quadra 3",
    scoreLine: "20 x 15",
    setsLine: "1 x 0",
    statusLabel: "Set 2",
    updatedAtMs: NOW,
    pointAlert: null,
    ...over,
  };
}

test("matchLiveTopics nomeia um tópico por plataforma", () => {
  assert.deepEqual(matchLiveTopics("abc123"), {
    android: "match-abc123-android",
    ios: "match-abc123-ios",
  });
});

test("matchLiveTopics sanitiza caractere fora do alfabeto do FCM", () => {
  const topics = matchLiveTopics("a/b");

  assert.match(topics.android, /^[a-zA-Z0-9\-_.~%]+$/);
  assert.match(topics.ios, /^[a-zA-Z0-9\-_.~%]+$/);
});

test("ids que só diferem no caractere inválido NÃO colidem", () => {
  // Substituição cega mandaria "a/b" e "a b" para o mesmo tópico, e um
  // seguidor receberia o placar da partida errada.
  assert.notEqual(matchLiveTopics("a/b").android, matchLiveTopics("a b").android);
});

test("matchLiveTopics recusa matchId vazio", () => {
  assert.throws(() => matchLiveTopics("   "));
});

test("mensagem Android é data-only: bloco notification quebraria o isolate", () => {
  const [android] = buildMatchLiveMessages("score", ctx());

  assert.equal("notification" in android, false);
  assert.equal(android.android?.priority, "high");
});

test("data do Android leva tipo, ação, ids e rota, tudo em string", () => {
  const [android] = buildMatchLiveMessages("set", ctx());
  const data = android.data ?? {};

  assert.equal(data.type, "match_live_score");
  assert.equal(data.action, "set");
  assert.equal(data.matchId, "m1");
  assert.equal(data.url, "/torneios/t1/ao-vivo/m1");
  assert.equal(data.updatedAt, String(NOW));
  for (const [key, value] of Object.entries(data)) {
    assert.equal(typeof value, "string", `${key} deveria ser string`);
  }
});

test("iOS colapsa sempre no mesmo id: uma linha por partida", () => {
  for (const kind of ["start", "set", "matchPoint", "score", "end"] as const) {
    const [, ios] = buildMatchLiveMessages(kind, ctx());
    assert.equal(ios.apns?.headers?.["apns-collapse-id"], "match-m1");
  }
});

test("ponto comum no iOS é mudo e de baixa prioridade", () => {
  const [, ios] = buildMatchLiveMessages("score", ctx());
  const aps = ios.apns?.payload?.aps as Record<string, unknown>;

  assert.equal(ios.apns?.headers?.["apns-priority"], "5");
  assert.equal(aps["interruption-level"], "passive");
  assert.equal("sound" in aps, false);
});

test("momento-chave no iOS toca e é de alta prioridade", () => {
  for (const kind of ["start", "set", "matchPoint", "end"] as const) {
    const [, ios] = buildMatchLiveMessages(kind, ctx());
    const aps = ios.apns?.payload?.aps as Record<string, unknown>;

    assert.equal(ios.apns?.headers?.["apns-priority"], "10", kind);
    assert.equal(aps["interruption-level"], "active", kind);
    assert.equal(aps.sound, "default", kind);
  }
});

test("dismiss leva a ação de derrubar a notificação", () => {
  const [android] = buildMatchLiveMessages("dismiss", ctx());

  assert.equal(android.data?.action, "dismiss");
});

test("iOS traz alerta com as duas duplas no título", () => {
  const [, ios] = buildMatchLiveMessages("score", ctx());

  assert.equal(ios.notification?.title, "Ana / Bia x Carla / Dani");
  assert.match(ios.notification?.body ?? "", /20 x 15/);
});

test("match point nomeia a dupla e distingue de set point", () => {
  const [, matchPoint] = buildMatchLiveMessages(
    "matchPoint",
    ctx({pointAlert: {side: "A", closesMatch: true}}),
  );
  const [, setPoint] = buildMatchLiveMessages(
    "matchPoint",
    ctx({pointAlert: {side: "B", closesMatch: false}}),
  );

  assert.match(matchPoint.notification?.body ?? "", /Match point.*Ana \/ Bia/);
  assert.match(setPoint.notification?.body ?? "", /Set point.*Carla \/ Dani/);
});

test("buildMatchLiveContext formata placar, sets e set em jogo", () => {
  const snapshot = snap({liveScore: live(1, 0, 20, 15), currentSetIndex: 1});
  const decision = resolveLiveUpdate(
    snap({liveScore: live(1, 0, 19, 15), currentSetIndex: 1}),
    snapshot,
    sidecar(),
    NOW,
  );

  const built = buildMatchLiveContext({
    matchId: "m1",
    tournamentId: "t1",
    teamALabel: "Ana / Bia",
    teamBLabel: "Carla / Dani",
    courtName: "Quadra 3",
    snapshot,
    decision,
    updatedAtMs: NOW,
  });

  assert.equal(built.scoreLine, "20 x 15");
  assert.equal(built.setsLine, "1 x 0");
  assert.equal(built.statusLabel, "Set 2");
  assert.deepEqual(built.pointAlert, {side: "A", closesMatch: true});
});

test("contexto de partida encerrada não anuncia set em jogo", () => {
  const snapshot = snap({status: MatchStatus.completed, liveScore: live(2, 0, 0, 0)});
  const decision = resolveLiveUpdate(
    snap({liveScore: live(1, 0, 20, 15)}),
    snapshot,
    sidecar(),
    NOW,
  );

  const built = buildMatchLiveContext({
    matchId: "m1",
    tournamentId: "t1",
    teamALabel: "Ana / Bia",
    teamBLabel: "Carla / Dani",
    courtName: "",
    snapshot,
    decision,
    updatedAtMs: NOW,
  });

  assert.equal(built.statusLabel, "Encerrada");
  assert.equal(built.setsLine, "2 x 0");
});

// --- Leitura do doc e rótulo das duplas -------------------------------------

test("snapshotFromMatchData lê o liveScore da mesa web", () => {
  const s = snapshotFromMatchData({
    status: "In Progress",
    liveScore: {setsA: 1, setsB: 0, currentGamesA: 20, currentGamesB: 15},
    currentSetIndex: 1,
    bestOf: 3,
  });

  assert.equal(s.status, "In Progress");
  assert.deepEqual(s.liveScore, {
    setsA: 1,
    setsB: 0,
    currentGamesA: 20,
    currentGamesB: 15,
  });
  assert.equal(s.currentSetIndex, 1);
});

test("snapshotFromMatchData lê os sets da mesa do app e ignora entrada corrompida", () => {
  const s = snapshotFromMatchData({
    status: "In Progress",
    sets: [{a: 21, b: 15}, "lixo", {a: 3, b: 1}, null],
  });

  assert.deepEqual(s.sets, [{a: 21, b: 15}, {a: 3, b: 1}]);
});

test("snapshotFromMatchData aguenta doc vazio sem explodir", () => {
  const s = snapshotFromMatchData({});

  assert.equal(s.status, "");
  assert.deepEqual(s.sets, []);
  assert.equal(s.liveScore, null);
  assert.equal(s.currentSetIndex, null);
});

test("pairLabelFrom prefere o nome da equipe quando existe", () => {
  const label = pairLabelFrom(
    {teamName: "As Feras", player1Id: "u1", player2Id: "u2"},
    new Map([["u1", {fullName: "Ana"}]]),
    "Dupla A",
  );

  assert.equal(label, "As Feras");
});

test("pairLabelFrom junta os dois atletas e prefere apelido a nome completo", () => {
  const label = pairLabelFrom(
    {player1Id: "u1", player2Id: "u2"},
    new Map([
      ["u1", {nickname: "Aninha", fullName: "Ana Souza"}],
      ["u2", {fullName: "Bia Lima"}],
    ]),
    "Dupla A",
  );

  assert.equal(label, "Aninha / Bia Lima");
});

test("pairLabelFrom cai no atleta que existe quando só há um", () => {
  const label = pairLabelFrom(
    {player1Id: "u1", player2Id: ""},
    new Map([["u1", {fullName: "Ana Souza"}]]),
    "Dupla A",
  );

  assert.equal(label, "Ana Souza");
});

test("pairLabelFrom usa o fallback quando não há nada exibível", () => {
  assert.equal(pairLabelFrom(null, new Map(), "Dupla A"), "Dupla A");
  assert.equal(
    pairLabelFrom({player1Id: "u1", player2Id: "u2"}, new Map(), "Dupla B"),
    "Dupla B",
  );
});

// --- Varredura de follows órfãos --------------------------------------------

function endState(over: Partial<MatchEndState> = {}): MatchEndState {
  return {exists: true, status: MatchStatus.completed, endedAtMs: null, ...over};
}

const candidate = {path: "users/u1/followedMatches/m1", matchId: "m1"};

test("partida ainda em andamento continua sendo seguida", () => {
  const stale = staleFollowPaths(
    [candidate],
    new Map([["m1", endState({status: MatchStatus.inProgress})]]),
    NOW,
  );

  assert.deepEqual(stale, []);
});

test("partida encerrada há pouco continua na lista", () => {
  // Dá tempo de o atleta ver o resultado em "Acompanhando" antes de sumir.
  const stale = staleFollowPaths(
    [candidate],
    new Map([["m1", endState({endedAtMs: NOW - 60 * 60 * 1000})]]),
    NOW,
  );

  assert.deepEqual(stale, []);
});

test("partida encerrada há mais de 48h sai da lista", () => {
  const stale = staleFollowPaths(
    [candidate],
    new Map([["m1", endState({endedAtMs: NOW - FOLLOW_RETENTION_MS - 1_000})]]),
    NOW,
  );

  assert.deepEqual(stale, [candidate.path]);
});

test("partida cancelada há mais de 48h sai da lista", () => {
  const stale = staleFollowPaths(
    [candidate],
    new Map([
      ["m1", endState({status: MatchStatus.canceled, endedAtMs: NOW - FOLLOW_RETENTION_MS - 1})],
    ]),
    NOW,
  );

  assert.deepEqual(stale, [candidate.path]);
});

test("partida encerrada sem matchEndedAt é dado velho e sai", () => {
  const stale = staleFollowPaths([candidate], new Map([["m1", endState()]]), NOW);

  assert.deepEqual(stale, [candidate.path]);
});

test("partida que não existe mais sai da lista", () => {
  const stale = staleFollowPaths(
    [candidate],
    new Map([["m1", endState({exists: false})]]),
    NOW,
  );

  assert.deepEqual(stale, [candidate.path]);
});

test("partida que nem foi lida não é apagada por engano", () => {
  // Leitura falhou ou o lote não a trouxe: na dúvida, mantém.
  assert.deepEqual(staleFollowPaths([candidate], new Map(), NOW), []);
});

test("data leva o pointAlert para o Android compor o próprio texto", () => {
  const [android] = buildMatchLiveMessages(
    "matchPoint",
    ctx({pointAlert: {side: "B", closesMatch: true}}),
  );

  assert.equal(android.data?.pointAlertSide, "B");
  assert.equal(android.data?.pointAlertClosesMatch, "true");
});

test("sem pointAlert os campos vão vazios, nunca undefined", () => {
  const [android] = buildMatchLiveMessages("score", ctx());

  assert.equal(android.data?.pointAlertSide, "");
  assert.equal(android.data?.pointAlertClosesMatch, "false");
});

test("fnv1a32 trava os vetores que o app tem que reproduzir", () => {
  // Estes MESMOS pares estão em followed_matches_test.dart. Se um lado mudar,
  // o outro quebra — sem isso a divergência só apareceria em quadra, com o
  // push indo para um tópico que ninguém assina.
  assert.equal(fnv1a32("a/b"), "g8wk3l");
  assert.equal(fnv1a32("a b"), "4m7u2a");
  assert.equal(fnv1a32("partida com espaço"), "lfqgei");
  assert.equal(fnv1a32("m1"), "15454vf");
});

test("tópico de id sujo é o id saneado mais o hash do original", () => {
  assert.equal(matchLiveTopics("a/b").android, "match-a_b.g8wk3l-android");
  assert.equal(matchLiveTopics("a b").ios, "match-a_b.4m7u2a-ios");
});
