import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  NEXT_MATCH_DAY_OVER_DISMISS_MS,
  NEXT_MATCH_SCORE_STALE_MS,
  NEXT_MATCH_MAX_DAY_ITEMS,
  NextMatchContentState,
  NextMatchLite,
  buildNextMatchMessage,
  buildNextMatchState,
  courtShortOf,
  matchOnEventDay,
  nextMatchBracketMoved,
  nextMatchChangeTeamIds,
  nextMatchScoreChanged,
  nextMatchSetMoved,
  nextMatchStateKey,
  scoreOnlyState,
  nextMatchLiteFromData,
  phaseLabelOf,
  pickNextMatch,
} from "./next-match-live-activity-state";

const DAY = "2026-11-21";
const OTHER_DAY = "2026-11-22";
/** 21/11/2026 15:40 em São Paulo. */
const AT_1540 = new Date("2026-11-21T15:40:00-03:00");
const AT_1310 = new Date("2026-11-21T13:10:00-03:00");
const AT_1700 = new Date("2026-11-21T17:00:00-03:00");
const NOW = new Date("2026-11-21T15:16:00-03:00").getTime();

const ME = "team-me";
const MINE = new Set([ME]);

function match(over: Partial<NextMatchLite> = {}): NextMatchLite {
  return {
    id: "m1",
    tournamentId: "t1",
    categoryId: "c1",
    teamAId: ME,
    teamBId: "team-rafa",
    teamADescription: null,
    teamBDescription: null,
    status: "Scheduled",
    winnerId: null,
    scheduleTime: AT_1540,
    matchStartedAt: null,
    matchEndedAt: null,
    dayKey: DAY,
    queueStatus: "",
    queueOrder: 0,
    courtName: "Quadra 3",
    matchType: "group",
    isGroupMatch: true,
    poolId: "A",
    round: 2,
    matchNumber: 7,
    setsWonA: 0,
    setsWonB: 0,
    winnerAdvanceMatchNumber: null,
    loserAdvanceMatchNumber: null,
    liveSetsA: 0,
    liveSetsB: 0,
    livePointsA: 0,
    livePointsB: 0,
    setIndex: 0,
    liveUnit: "points",
    liveGameA: null,
    liveGameB: null,
    liveTiebreak: null,
    servingTeamId: "",
    ...over,
  };
}

const NAMES = new Map([
  ["team-rafa", "Rafa / Bruno"],
  ["team-joao", "João / Pedro"],
]);

describe("nextMatchLiteFromData", () => {
  it("lê o doc cru e conta os sets vencidos de cada lado", () => {
    const lite = nextMatchLiteFromData("m9", {
      tournamentId: "t1",
      categoryId: "c1",
      teamAId: "a",
      teamBId: "b",
      status: "Completed",
      winnerId: "a",
      scheduleTime: {toDate: () => AT_1310},
      dayKey: DAY,
      courtName: " Quadra 2 ",
      matchType: "group",
      poolId: "A",
      round: 1,
      matchNumber: 3,
      sets: [{a: 21, b: 15}, {a: 21, b: 18}],
    });
    assert.equal(lite.id, "m9");
    assert.equal(lite.courtName, "Quadra 2");
    assert.equal(lite.scheduleTime?.getTime(), AT_1310.getTime());
    assert.equal(lite.setsWonA, 2);
    assert.equal(lite.setsWonB, 0);
  });
});

describe("matchOnEventDay", () => {
  it("vale pelo horário no fuso do evento", () => {
    assert.equal(matchOnEventDay(match({dayKey: ""}), DAY), true);
    assert.equal(matchOnEventDay(match({dayKey: ""}), OTHER_DAY), false);
  });

  it("partida sem horário nem dia conta no dia, se ainda aberta (fila)", () => {
    const queued = match({scheduleTime: null, dayKey: ""});
    assert.equal(matchOnEventDay(queued, DAY), true);
    assert.equal(matchOnEventDay({...queued, status: "Completed"}, DAY), false);
    assert.equal(matchOnEventDay({...queued, status: "Canceled"}, DAY), false);
  });

  it("dayKey de outro dia é resposta definitiva", () => {
    assert.equal(matchOnEventDay(match({scheduleTime: null, dayKey: OTHER_DAY}), DAY), false);
  });
});

describe("pickNextMatch", () => {
  it("chamada de quadra vence ao vivo, que vence agendada", () => {
    const scheduled = match({id: "s", scheduleTime: AT_1310});
    const live = match({id: "l", status: "In Progress", scheduleTime: AT_1700});
    const called = match({id: "c", queueStatus: "on_court", scheduleTime: AT_1700});
    assert.equal(pickNextMatch([scheduled, live, called], MINE, DAY)?.id, "c");
    assert.equal(pickNextMatch([scheduled, live], MINE, DAY)?.id, "l");
  });

  it("entre agendadas, a mais cedo; sem horário vai para o fim", () => {
    const later = match({id: "later", scheduleTime: AT_1700});
    const early = match({id: "early", scheduleTime: AT_1540});
    const queued = match({id: "q", scheduleTime: null, dayKey: "", queueStatus: "waiting"});
    assert.equal(pickNextMatch([queued, later, early], MINE, DAY)?.id, "early");
  });

  it("ignora encerradas, canceladas, de outro dia e de outras duplas", () => {
    const done = match({id: "d", status: "Completed"});
    const canceled = match({id: "x", status: "Canceled"});
    const tomorrow = match({id: "t", dayKey: OTHER_DAY, scheduleTime: null});
    const notMine = match({id: "n", teamAId: "team-joao"});
    assert.equal(pickNextMatch([done, canceled, tomorrow, notMine], MINE, DAY), null);
  });

  it("considera todas as duplas do atleta (duas categorias no mesmo dia)", () => {
    const other = match({id: "o", teamAId: "team-me-2", scheduleTime: AT_1310});
    const mine = match({id: "m", scheduleTime: AT_1540});
    assert.equal(pickNextMatch([mine, other], new Set([ME, "team-me-2"]), DAY)?.id, "o");
  });
});

describe("rótulos", () => {
  it("quadra numerada vira Q3 na ilha; quadra com nome sai como foi escrita", () => {
    assert.equal(courtShortOf(match({courtName: "Quadra 3"})), "Q3");
    assert.equal(courtShortOf(match({courtName: "Central"})), "Central");
    assert.equal(courtShortOf(match({courtName: ""})), null);
  });

  it("grupo: nome do grupo e a posição da rodada dentro dele", () => {
    const r5 = match({id: "a", round: 5});
    const r6 = match({id: "b", round: 6});
    assert.equal(phaseLabelOf(r6, [r5, r6]), "Grupo A · Rodada 2");
    assert.equal(phaseLabelOf(match({poolId: "Grupo B", round: 1}), []), "Grupo B · Rodada 1");
  });

  it("mata-mata: fase pelo número de jogos da rodada", () => {
    const ko = (id: string, round: number) =>
      match({id, matchType: "knockout", isGroupMatch: false, poolId: "", round});
    const quartas = [ko("q1", 1), ko("q2", 1), ko("q3", 1), ko("q4", 1)];
    assert.equal(phaseLabelOf(quartas[0], quartas), "Quartas de final");
    assert.equal(phaseLabelOf(ko("s1", 2), [ko("s1", 2), ko("s2", 2)]), "Semifinais");
    assert.equal(
      phaseLabelOf(match({matchType: "Final", isGroupMatch: false, poolId: ""}), []),
      "Final",
    );
    assert.equal(
      phaseLabelOf(match({matchType: "Third Place", isGroupMatch: false, poolId: ""}), []),
      "3º lugar",
    );
  });
});

describe("buildNextMatchState", () => {
  const input = (matches: NextMatchLite[]) => ({
    matches,
    categoryMatches: matches,
    teamIds: MINE,
    dayKey: DAY,
    teamNames: NAMES,
  });

  it("CONTRATO: o JSON é exatamente este (o Swift decodifica campo a campo)", () => {
    const won = match({
      id: "m0",
      scheduleTime: AT_1310,
      status: "Completed",
      winnerId: ME,
      setsWonA: 2,
      setsWonB: 0,
      round: 1,
    });
    const next = match({id: "m1"});
    const later = match({id: "m2", scheduleTime: AT_1700, teamBId: "team-joao", round: 3});
    const state = buildNextMatchState(input([later, next, won]));
    assert.equal(
      JSON.stringify(state),
      JSON.stringify({
        phase: "scheduled",
        matchId: "m1",
        courtLabel: "Quadra 3",
        courtShort: "Q3",
        opponent: "Rafa / Bruno",
        phaseLabel: "Grupo A · Rodada 2",
        scheduleTimeMs: AT_1540.getTime(),
        day: [
          {kind: "win", label: "V 2–0"},
          {kind: "next", label: "15:40"},
          {kind: "upcoming", label: "17:00"},
        ],
        summary: null,
        score: null,
      }),
    );
  });

  it("CONTRATO: em jogo, o placar vai sob a ótica do atleta (ele pode ser o time B)", () => {
    const live = match({
      teamAId: "team-rafa",
      teamBId: ME,
      status: "In Progress",
      liveSetsA: 0,
      liveSetsB: 1,
      livePointsA: 15,
      livePointsB: 18,
      setIndex: 1,
      servingTeamId: ME,
    });
    const state = buildNextMatchState(input([live]));
    assert.equal(state?.phase, "playing");
    assert.equal(
      JSON.stringify(state?.score),
      JSON.stringify({
        mySets: 1, theirSets: 0, myPoints: 18, theirPoints: 15, set: 2, serving: "me",
        unit: "points", game: null, tiebreak: null,
      }),
    );
  });

  it("fora de jogo não há placar; saque desconhecido vira null", () => {
    assert.equal(buildNextMatchState(input([match()]))?.score, null);
    const live = match({status: "In Progress", servingTeamId: ""});
    assert.equal(buildNextMatchState(input([live]))?.score?.serving, null);
  });

  it("chamada de quadra e partida em andamento mudam a fase", () => {
    assert.equal(
      buildNextMatchState(input([match({queueStatus: "on_court"})]))?.phase,
      "called",
    );
    assert.equal(
      buildNextMatchState(input([match({status: "In Progress"})]))?.phase,
      "playing",
    );
  });

  it("adversário a definir sai como a chave declara", () => {
    const state = buildNextMatchState(
      input([match({teamBId: "", teamBDescription: "Vencedor do Jogo 14", scheduleTime: null})]),
    );
    assert.equal(state?.opponent, "Vencedor do Jogo 14");
    assert.equal(state?.scheduleTimeMs, null);
    assert.deepEqual(state?.day, [{kind: "next", label: "Fila"}]);
  });

  it("o adversário é o outro lado, mesmo quando o atleta é o time B", () => {
    const state = buildNextMatchState(input([match({teamAId: "team-joao", teamBId: ME})]));
    assert.equal(state?.opponent, "João / Pedro");
  });

  it("sem partida aberta no dia: fim do dia com o saldo", () => {
    const won = match({id: "a", status: "Completed", winnerId: ME, setsWonA: 2});
    const lost = match({
      id: "b",
      status: "Completed",
      winnerId: "team-rafa",
      setsWonB: 2,
      setsWonA: 1,
      scheduleTime: AT_1700,
    });
    const state = buildNextMatchState(input([won, lost]));
    assert.equal(state?.phase, "dayOver");
    assert.equal(state?.matchId, null);
    assert.equal(state?.summary, "1 vitória · 1 derrota");
    assert.deepEqual(state?.day.map((d) => d.kind), ["win", "loss"]);
  });

  describe("aguardando a próxima fase", () => {
    const quartas = (over: Partial<NextMatchLite> = {}) =>
      match({
        id: "q",
        matchNumber: 20,
        teamAId: "",
        teamBId: "",
        matchType: "knockout",
        isGroupMatch: false,
        poolId: "",
        scheduleTime: AT_1700,
        ...over,
      });
    const groupWin = match({id: "g", status: "Completed", winnerId: ME, setsWonA: 2});

    it("vaga do 1º do meu grupo ainda aberta: aguardando, não encerra", () => {
      const slot = quartas({teamADescription: "1º do grupo A", teamBDescription: "2º do grupo B"});
      const state = buildNextMatchState({...input([groupWin]), categoryMatches: [groupWin, slot]});
      assert.equal(state?.phase, "waiting");
      assert.equal(state?.summary, "1 vitória");
    });

    it("vaga de outro grupo não segura o card de quem já acabou", () => {
      const slot = quartas({teamADescription: "1º do grupo C", teamBDescription: "2º do grupo D"});
      const state = buildNextMatchState({...input([groupWin]), categoryMatches: [groupWin, slot]});
      assert.equal(state?.phase, "dayOver");
    });

    it("venceu o jogo cujo vencedor vai para a vaga: aguardando", () => {
      const won = match({
        id: "k",
        matchType: "knockout",
        isGroupMatch: false,
        poolId: "",
        matchNumber: 14,
        status: "Completed",
        winnerId: ME,
        winnerAdvanceMatchNumber: 20,
      });
      const slot = quartas({teamBId: "team-joao"});
      assert.equal(
        buildNextMatchState({...input([won]), categoryMatches: [won, slot]})?.phase,
        "waiting",
      );
      // Mesmo sem o vínculo gravado, a descrição da vaga resolve.
      const legacy = {...won, winnerAdvanceMatchNumber: null};
      const described = quartas({teamBId: "team-joao", teamADescription: "Vencedor Jogo #14"});
      assert.equal(
        buildNextMatchState({...input([legacy]), categoryMatches: [legacy, described]})?.phase,
        "waiting",
      );
    });

    it("perdeu no mata-mata sem repescagem: fim do dia, mesmo com vaga aberta na chave", () => {
      const lost = match({
        id: "k",
        matchType: "knockout",
        isGroupMatch: false,
        poolId: "",
        matchNumber: 14,
        status: "Completed",
        winnerId: "team-rafa",
        winnerAdvanceMatchNumber: 20,
      });
      const slot = quartas({teamBId: "team-joao", teamADescription: "Vencedor Jogo #14"});
      assert.equal(
        buildNextMatchState({...input([lost]), categoryMatches: [lost, slot]})?.phase,
        "dayOver",
      );
    });

    it("perdeu, mas o perdedor vai para a disputa de 3º: aguardando", () => {
      const lost = match({
        id: "k",
        matchType: "knockout",
        isGroupMatch: false,
        poolId: "",
        matchNumber: 14,
        status: "Completed",
        winnerId: "team-rafa",
        loserAdvanceMatchNumber: 21,
      });
      const third = quartas({id: "t", matchNumber: 21, matchType: "Third Place"});
      assert.equal(
        buildNextMatchState({...input([lost]), categoryMatches: [lost, third]})?.phase,
        "waiting",
      );
    });
  });

  it("grupos de categorias diferentes com o mesmo nome não se misturam na rodada", () => {
    const mine = match({id: "a", round: 2, categoryId: "c1"});
    const otherCategory = match({id: "b", round: 1, categoryId: "c2", teamAId: "x", teamBId: "y"});
    assert.equal(phaseLabelOf(mine, [mine, otherCategory]), "Grupo A · Rodada 1");
  });

  it("nada no dia: null (não há o que mostrar)", () => {
    assert.equal(buildNextMatchState(input([match({dayKey: OTHER_DAY, scheduleTime: null})])), null);
  });

  it(`a linha do dia mostra no máximo ${NEXT_MATCH_MAX_DAY_ITEMS} itens, sempre com o próximo`, () => {
    const done = Array.from({length: 6}, (_, i) =>
      match({
        id: `d${i}`,
        status: "Completed",
        winnerId: ME,
        setsWonA: 2,
        scheduleTime: new Date(AT_1310.getTime() - (6 - i) * 3600_000),
      }),
    );
    const state = buildNextMatchState(input([...done, match({id: "n"})]));
    assert.equal(state?.day.length, NEXT_MATCH_MAX_DAY_ITEMS);
    assert.equal(state?.day[NEXT_MATCH_MAX_DAY_ITEMS - 1].kind, "next");
  });
});

interface Aps {
  "event"?: string;
  "timestamp"?: number;
  "stale-date"?: number;
  "dismissal-date"?: number;
  "alert"?: {title?: string; body?: string; sound?: string};
  "content-state"?: unknown;
}

function apsOf(state: NextMatchContentState, previousPhase: string | null = "scheduled"): Aps {
  const message = buildNextMatchMessage({
    fcmToken: "fcm-1",
    liveActivityToken: "la-1",
    state,
    previousPhase,
    nowMs: NOW,
  });
  return message.apns?.payload?.aps as Aps;
}

describe("buildNextMatchMessage", () => {
  const scheduled = buildNextMatchState({
    matches: [match()],
    categoryMatches: [match()],
    teamIds: MINE,
    dayKey: DAY,
    teamNames: NAMES,
  }) as NextMatchContentState;

  it("vai pelo token da activity, com o estado inteiro", () => {
    const message = buildNextMatchMessage({
      fcmToken: "fcm-1",
      liveActivityToken: "la-1",
      state: scheduled,
      previousPhase: null,
      nowMs: NOW,
    });
    assert.equal(message.token, "fcm-1");
    assert.equal(message.apns?.liveActivityToken, "la-1");
    const aps = message.apns?.payload?.aps as Aps;
    assert.equal(aps.event, "update");
    assert.equal(aps.timestamp, Math.floor(NOW / 1000));
    assert.deepEqual(aps["content-state"], scheduled);
  });

  it("agendada: o prazo de atraso vai como stale-date (o push não pode apagá-lo)", () => {
    assert.equal(apsOf(scheduled)["stale-date"], AT_1540.getTime() / 1000);
    assert.equal(apsOf(scheduled).alert, undefined);
  });

  it("agendada já atrasada: sem stale-date no passado (o iOS some com o card)", () => {
    const late = {...scheduled, scheduleTimeMs: NOW - 5 * 60_000};
    assert.equal(apsOf(late)["stale-date"], undefined);
    assert.equal(apsOf(late).event, "update");
  });

  it("chamada: alerta só na virada para chamada, nunca de novo", () => {
    const called = {...scheduled, phase: "called" as const};
    assert.equal(apsOf(called, "scheduled").alert?.title, "Sua partida foi chamada");
    assert.equal(apsOf(called, "scheduled").alert?.body, "Vá para a Quadra 3 · vs Rafa / Bruno");
    // Em Live Activity o som mora DENTRO do alert.
    assert.equal(apsOf(called, "scheduled").alert?.sound, "default");
    assert.equal(apsOf(called, "called").alert, undefined);
    assert.equal(apsOf(called, "scheduled")["stale-date"], undefined);
  });

  it("em jogo: placar desatualiza sozinho se o próximo push não vier", () => {
    const playing = {...scheduled, phase: "playing" as const};
    assert.equal(
      apsOf(playing)["stale-date"],
      Math.floor((NOW + NEXT_MATCH_SCORE_STALE_MS) / 1000),
    );
  });

  it("ponto comum vai com prioridade baixa; mudança de fase, alta", () => {
    const playing = {...scheduled, phase: "playing" as const};
    const low = buildNextMatchMessage({
      fcmToken: "f", liveActivityToken: "l", state: playing, previousPhase: "playing",
      nowMs: NOW, lowPriority: true,
    });
    assert.equal(low.apns?.headers?.["apns-priority"], "5");
    const high = buildNextMatchMessage({
      fcmToken: "f", liveActivityToken: "l", state: playing, previousPhase: "called", nowMs: NOW,
    });
    assert.equal(high.apns?.headers?.["apns-priority"], "10");
  });

  it("fim do dia encerra a activity e sai da tela em 30 min", () => {
    const over = {...scheduled, phase: "dayOver" as const, matchId: null, summary: "1 vitória"};
    const aps = apsOf(over);
    assert.equal(aps.event, "end");
    assert.equal(aps["dismissal-date"], Math.floor((NOW + NEXT_MATCH_DAY_OVER_DISMISS_MS) / 1000));
  });
});

describe("nextMatchChangeTeamIds", () => {
  const before = {teamAId: "a", teamBId: "b", status: "Scheduled", courtName: "Quadra 1"};

  it("placar mudando sozinho não acorda ninguém", () => {
    assert.deepEqual(
      nextMatchChangeTeamIds(
        {...before, status: "In Progress", sets: [{teamAScore: 1}]},
        {...before, status: "In Progress", sets: [{teamAScore: 2}]},
      ),
      [],
    );
  });

  it("horário, quadra, chamada, início e fim acordam as duas duplas", () => {
    for (const change of [
      {courtName: "Quadra 2"},
      {queueStatus: "on_court"},
      {status: "In Progress"},
      {scheduleTime: {toMillis: () => 1}},
    ]) {
      assert.deepEqual(nextMatchChangeTeamIds(before, {...before, ...change}).sort(), ["a", "b"]);
    }
  });

  it("vaga de mata-mata preenchida acorda a dupla que entrou", () => {
    assert.deepEqual(
      nextMatchChangeTeamIds({...before, teamBId: ""}, {...before, teamBId: "c"}).sort(),
      ["a", "c"],
    );
  });
});

describe("nextMatchBracketMoved", () => {
  it("vaga preenchida ou partida encerrada movem a chave; placar não", () => {
    const base = {teamAId: "a", teamBId: "", status: "Scheduled"};
    assert.equal(nextMatchBracketMoved(base, {...base, teamBId: "c"}), true);
    assert.equal(nextMatchBracketMoved(base, {...base, status: "Completed"}), true);
    assert.equal(nextMatchBracketMoved(base, {...base, sets: [{a: 1, b: 0}]}), false);
  });
});

const BT = {
  kind: "sets_games", bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6,
  tiebreakTo: 7, noAd: true, decidingSet: "super_tiebreak", superTiebreakTo: 10,
};

describe("placar em games (beach tennis)", () => {
  const doc = (over: Record<string, unknown>) => ({
    tournamentId: "t1", teamAId: "team-rafa", teamBId: ME, status: "In Progress",
    scoringProfile: BT, bestOf: 3, ...over,
  });
  const scoreOf = (over: Record<string, unknown>) =>
    buildNextMatchState({
      matches: [nextMatchLiteFromData("m1", {...doc(over), dayKey: DAY})],
      categoryMatches: [],
      teamIds: MINE,
      dayKey: DAY,
      teamNames: NAMES,
    })?.score;

  it("games do set e o ponto do game, do meu lado (sou o time B)", () => {
    const score = scoreOf({sets: [{a: 4, b: 5}], currentSetIndex: 0, currentGame: {a: 3, b: 1}});
    assert.equal(score?.unit, "games");
    assert.equal(score?.myPoints, 5);
    assert.equal(score?.theirPoints, 4);
    assert.equal(score?.game, "15–40");
    assert.equal(score?.tiebreak, null);
  });

  it("tie-break no 6-6: o game vira a contagem do tie-break", () => {
    const score = scoreOf({sets: [{a: 6, b: 6}], currentSetIndex: 0, currentGame: {a: 4, b: 5}});
    assert.equal(score?.tiebreak, "tb");
    assert.equal(score?.game, "5–4");
  });

  it("super tie-break: os pontos dele no lugar dos games", () => {
    const score = scoreOf({
      sets: [{a: 6, b: 3}, {a: 2, b: 6}, {a: 0, b: 0}],
      currentSetIndex: 2,
      currentGame: {a: 7, b: 8},
    });
    assert.equal(score?.tiebreak, "super");
    assert.equal(score?.unit, "points");
    assert.equal(score?.myPoints, 8);
    assert.equal(score?.theirPoints, 7);
  });

  it("placar agregado (só liveScore): o set em jogo vem dos sets já vencidos", () => {
    const lite = nextMatchLiteFromData("m1", {
      status: "In Progress", teamAId: "a", teamBId: "b",
      liveScore: {setsA: 1, setsB: 0, currentGamesA: 2, currentGamesB: 3},
    });
    assert.equal(lite.setIndex, 1);
  });
});

describe("placar ao vivo: o que acorda o card", () => {
  const base = {
    teamAId: "a",
    teamBId: "b",
    status: "In Progress",
    sets: [{a: 10, b: 8}],
    currentSetIndex: 0,
  };

  it("ponto marcado em partida em andamento acorda as duas duplas", () => {
    assert.deepEqual(
      nextMatchScoreChanged(base, {...base, sets: [{a: 11, b: 8}]}).sort(),
      ["a", "b"],
    );
  });

  it("partida parada, placar igual ou só o carimbo do liveScore não acordam ninguém", () => {
    assert.deepEqual(nextMatchScoreChanged(base, {...base}), []);
    const scheduled = {...base, status: "Scheduled"};
    assert.deepEqual(nextMatchScoreChanged(scheduled, {...scheduled, sets: [{a: 1, b: 0}]}), []);
    const live = {...base, sets: [], liveScore: {setsA: 0, setsB: 0, currentGamesA: 2, currentGamesB: 1, updatedAt: 1}};
    assert.deepEqual(
      nextMatchScoreChanged(live, {...live, liveScore: {...live.liveScore, updatedAt: 2}}),
      [],
    );
  });

  it("virada de set vale para as duas mesas", () => {
    assert.equal(
      nextMatchSetMoved(base, {...base, sets: [{a: 21, b: 18}, {a: 0, b: 0}], currentSetIndex: 1}),
      true,
    );
    assert.equal(nextMatchSetMoved(base, {...base, sets: [{a: 11, b: 8}]}), false);
    const agg = (setsA: number, gamesA: number) => ({
      ...base, sets: [], currentSetIndex: undefined,
      liveScore: {setsA, setsB: 0, currentGamesA: gamesA, currentGamesB: 0},
    });
    assert.equal(nextMatchSetMoved(agg(0, 5), agg(1, 0)), true);
    assert.equal(nextMatchSetMoved(agg(0, 4), agg(0, 5)), false);
  });
});

describe("atalho por ponto", () => {
  const live = match({status: "In Progress", livePointsA: 12, livePointsB: 9});
  const playing = buildNextMatchState({
    matches: [live], categoryMatches: [live], teamIds: MINE, dayKey: DAY, teamNames: NAMES,
  }) as NextMatchContentState;

  it("troca só o placar do estado anterior quando o card já está nesta partida", () => {
    const next = scoreOnlyState(
      nextMatchStateKey(playing),
      {...live, livePointsA: 13},
      MINE,
    );
    assert.equal(next?.score?.myPoints, 13);
    assert.deepEqual(next?.day, playing.day);
    assert.equal(next?.opponent, playing.opponent);
  });

  it("outra partida, outra fase ou estado ilegível: remonta tudo (null)", () => {
    const key = nextMatchStateKey(playing);
    assert.equal(scoreOnlyState(key, {...live, id: "outra"}, MINE), null);
    assert.equal(scoreOnlyState(key, {...live, status: "Completed"}, MINE), null);
    assert.equal(scoreOnlyState("{", live, MINE), null);
    assert.equal(scoreOnlyState(null, live, MINE), null);
  });
});
