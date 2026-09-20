import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  KocEngineError,
  kocApplyRally,
  kocClockEndsAtMs,
  kocClockIsExpired,
  kocClockPause,
  kocClockRemainingSec,
  kocClockResume,
  kocClockSetDuration,
  kocClockStart,
  kocInitialState,
  kocQualifyingTies,
  kocReplay,
  kocStandings,
  type KocRally,
  type KocRallyWinner,
} from "./koc-engine";

const ROSTER = ["A", "B", "C", "D"];

function log(winners: KocRallyWinner[]): KocRally[] {
  return winners.map((winner, i) => ({seq: i + 1, winner}));
}

describe("kocInitialState", () => {
  it("põe o cabeça de chave no trono e o segundo desafiando", () => {
    const state = kocInitialState(ROSTER);
    assert.equal(state.kingTeamId, "A");
    assert.equal(state.challengerTeamId, "B");
    assert.deepEqual(state.queue, ["C", "D"]);
  });

  it("o desafiante saca", () => {
    assert.equal(kocInitialState(ROSTER).servingTeamId, "B");
  });

  it("todo mundo começa zerado", () => {
    const state = kocInitialState(ROSTER);
    assert.deepEqual(state.points, {A: 0, B: 0, C: 0, D: 0});
    assert.equal(state.rallies, 0);
  });

  it("conta o trono inicial como coroação", () => {
    // Serve ao desempate por "último rei": quem começou no trono já esteve lá.
    const state = kocInitialState(ROSTER);
    assert.equal(state.crowns.A, 1);
    assert.deepEqual(state.crownOrder, ["A"]);
  });

  it("recusa elenco que não faz a fila girar", () => {
    assert.throws(() => kocInitialState(["A", "B"]), KocEngineError);
  });

  it("ignora id vazio no elenco", () => {
    const state = kocInitialState(["A", "", "B", "  ", "C"]);
    assert.deepEqual(state.queue, ["C"]);
    assert.equal(Object.keys(state.points).length, 3);
  });
});

describe("kocApplyRally", () => {
  it("rei que defende pontua e fica; o desafiante vai para o fim da fila", () => {
    const state = kocApplyRally(kocInitialState(ROSTER), "king");
    assert.equal(state.kingTeamId, "A");
    assert.equal(state.points.A, 1);
    assert.equal(state.challengerTeamId, "C");
    assert.deepEqual(state.queue, ["D", "B"]);
  });

  it("desafiante que destrona NÃO pontua pela coroação", () => {
    // É a regra que define o formato: ponto vem de defender, não de vencer.
    const state = kocApplyRally(kocInitialState(ROSTER), "challenger");
    assert.equal(state.kingTeamId, "B");
    assert.equal(state.points.B, 0);
    assert.equal(state.points.A, 0);
  });

  it("rei destronado vai para o fim da fila", () => {
    const state = kocApplyRally(kocInitialState(ROSTER), "challenger");
    assert.deepEqual(state.queue, ["D", "A"]);
    assert.equal(state.challengerTeamId, "C");
  });

  it("quem entra passa a sacar", () => {
    const state = kocApplyRally(kocInitialState(ROSTER), "king");
    assert.equal(state.servingTeamId, state.challengerTeamId);
  });

  it("não muta o estado anterior", () => {
    const before = kocInitialState(ROSTER);
    kocApplyRally(before, "king");
    assert.equal(before.points.A, 0);
    assert.equal(before.rallies, 0);
  });
});

describe("kocReplay — o exemplo de 6 rallies do formato", () => {
  // A defende, C destrona, C defende duas, A destrona, A defende.
  const rallies = log([
    "king", // 1: A defende B          → A=1
    "challenger", // 2: C destrona A   → C rei, sem ponto
    "king", // 3: C defende D          → C=1
    "king", // 4: C defende B          → C=2
    "challenger", // 5: A destrona C    → A rei, sem ponto
    "king", // 6: A defende D          → A=2
  ]);

  it("chega em A=2, C=2, B=0, D=0", () => {
    const state = kocReplay(ROSTER, rallies);
    assert.deepEqual(state.points, {A: 2, C: 2, B: 0, D: 0});
  });

  it("quem caiu do trono mantém o que conquistou defendendo", () => {
    // C não toca mais na bola depois do rally 5 e segue com os 2 pontos.
    const state = kocReplay(ROSTER, rallies);
    assert.equal(state.points.C, 2);
  });

  it("conta os rallies e as coroações", () => {
    const state = kocReplay(ROSTER, rallies);
    assert.equal(state.rallies, 6);
    assert.deepEqual(state.crownOrder, ["A", "C", "A"]);
  });

  it("reproduz na ordem do seq, mesmo com o log fora de ordem", () => {
    const shuffled = [...rallies].reverse();
    assert.deepEqual(
      kocReplay(ROSTER, shuffled).points,
      kocReplay(ROSTER, rallies).points,
    );
  });

  it("desfazer é reproduzir sem o último rally", () => {
    // Antes do rally 6, A tinha 1 ponto. Nenhuma inversa é calculada.
    const undone = kocReplay(ROSTER, rallies.slice(0, -1));
    assert.equal(undone.points.A, 1);
    assert.equal(undone.rallies, 5);
    assert.equal(undone.kingTeamId, "A");
  });

  it("log vazio devolve o estado inicial", () => {
    assert.deepEqual(kocReplay(ROSTER, []), kocInitialState(ROSTER));
  });
});

describe("kocReplay — invariantes", () => {
  it("o elenco nunca muda de tamanho, quaisquer que sejam os resultados", () => {
    // Percorre 2^10 combinações de resultado: ninguém pode sumir da quadra.
    for (let mask = 0; mask < 1024; mask++) {
      const winners: KocRallyWinner[] = [];
      for (let i = 0; i < 10; i++) {
        winners.push((mask >> i) & 1 ? "king" : "challenger");
      }
      const state = kocReplay(ROSTER, log(winners));
      const onCourt = [state.kingTeamId, state.challengerTeamId, ...state.queue];
      assert.equal(onCourt.length, ROSTER.length, `mask ${mask}`);
      assert.equal(new Set(onCourt).size, ROSTER.length, `mask ${mask}`);
    }
  });

  it("o total de pontos é igual ao número de rallies vencidos pelo rei", () => {
    const winners: KocRallyWinner[] = [
      "king", "challenger", "king", "king", "challenger", "king", "king",
    ];
    const state = kocReplay(ROSTER, log(winners));
    const total = Object.values(state.points).reduce((a, b) => a + b, 0);
    assert.equal(total, winners.filter((w) => w === "king").length);
  });

  it("funciona com rodada de 3 e de 5 duplas", () => {
    for (const roster of [["A", "B", "C"], ["A", "B", "C", "D", "E"]]) {
      const state = kocReplay(roster, log(["king", "challenger", "king"]));
      const onCourt = [state.kingTeamId, state.challengerTeamId, ...state.queue];
      assert.equal(new Set(onCourt).size, roster.length);
    }
  });
});

describe("relógio", () => {
  const t0 = 1_700_000_000_000;

  it("termina em começo + duração", () => {
    const clock = kocClockStart(t0, 900);
    assert.equal(kocClockEndsAtMs(clock), t0 + 900_000);
  });

  it("conta o que falta e não passa de zero", () => {
    const clock = kocClockStart(t0, 900);
    assert.equal(kocClockRemainingSec(clock, t0), 900);
    assert.equal(kocClockRemainingSec(clock, t0 + 600_000), 300);
    assert.equal(kocClockRemainingSec(clock, t0 + 999_000), 0);
  });

  it("em pausa o tempo congela", () => {
    const paused = kocClockPause(kocClockStart(t0, 900), t0 + 300_000);
    // Dez minutos de mundo real depois, ainda faltam os mesmos 600s.
    assert.equal(kocClockRemainingSec(paused, t0 + 900_000), 600);
  });

  it("retomar devolve o tempo parado", () => {
    let clock = kocClockStart(t0, 900);
    clock = kocClockPause(clock, t0 + 300_000);
    clock = kocClockResume(clock, t0 + 420_000); // 2 min parados
    assert.equal(clock.pausedAccumSec, 120);
    assert.equal(kocClockRemainingSec(clock, t0 + 420_000), 600);
    assert.equal(kocClockEndsAtMs(clock), t0 + 900_000 + 120_000);
  });

  it("pausa e retomada repetidas são idempotentes", () => {
    const clock = kocClockStart(t0, 900);
    const paused = kocClockPause(clock, t0 + 1000);
    assert.deepEqual(kocClockPause(paused, t0 + 2000), paused);
    assert.deepEqual(kocClockResume(clock, t0 + 2000), clock);
  });

  it("expira quando o tempo acaba", () => {
    const clock = kocClockStart(t0, 900);
    assert.equal(kocClockIsExpired(clock, t0 + 899_000), false);
    assert.equal(kocClockIsExpired(clock, t0 + 900_000), true);
  });

  it("ajuste de duração recalcula o fim e respeita os limites", () => {
    const clock = kocClockStart(t0, 900);
    const bounds = {minSec: 300, maxSec: 2400};
    assert.equal(
      kocClockEndsAtMs(kocClockSetDuration(clock, 600, bounds)),
      t0 + 600_000,
    );
    assert.equal(kocClockSetDuration(clock, 10, bounds).durationSec, 300);
    assert.equal(kocClockSetDuration(clock, 99_999, bounds).durationSec, 2400);
  });

  it("ajuste preserva o tempo já parado", () => {
    let clock = kocClockStart(t0, 900);
    clock = kocClockResume(kocClockPause(clock, t0 + 1000), t0 + 61_000);
    const adjusted = kocClockSetDuration(clock, 600, {minSec: 300, maxSec: 2400});
    assert.equal(adjusted.pausedAccumSec, 60);
  });
});

describe("kocStandings", () => {
  it("ordena por pontos", () => {
    const state = kocReplay(ROSTER, log(["king", "king", "challenger", "king"]));
    const standings = kocStandings(ROSTER, state);
    assert.equal(standings[0]!.teamId, "A");
    assert.equal(standings[0]!.points, 2);
  });

  it("empate no topo vai para o último rei", () => {
    // Exemplo dos 6 rallies: A e C com 2, e A foi rei por último.
    const state = kocReplay(
      ROSTER,
      log(["king", "challenger", "king", "king", "challenger", "king"]),
    );
    const standings = kocStandings(ROSTER, state);
    assert.equal(standings[0]!.teamId, "A");
    assert.equal(standings[1]!.teamId, "C");
  });

  it("marca quem está empatado em pontos", () => {
    // A bola de ouro do regulamento é um rally na areia, não uma conta — a mesa
    // precisa VER o empate para decidir.
    const state = kocReplay(ROSTER, log(["king", "challenger", "king"]));
    const standings = kocStandings(ROSTER, state);
    const byTeam = Object.fromEntries(standings.map((s) => [s.teamId, s]));
    assert.deepEqual(byTeam.A!.tiedOnPointsWith, ["C"]);
    assert.deepEqual(byTeam.B!.tiedOnPointsWith.sort(), ["D"]);
  });

  it("sem rally nenhum, a ordem é a semeadura", () => {
    const standings = kocStandings(ROSTER, kocInitialState(ROSTER));
    assert.deepEqual(standings.map((s) => s.teamId), ROSTER);
  });

  it("numera as colocações de 1 a N, sem furo", () => {
    const state = kocReplay(ROSTER, log(["king", "challenger", "king", "king"]));
    assert.deepEqual(
      kocStandings(ROSTER, state).map((s) => s.place),
      [1, 2, 3, 4],
    );
  });
});

describe("kocQualifyingTies", () => {
  it("aponta o empate que atravessa o corte", () => {
    // A=2, C=1, D=1, B=0 — com 2 classificadas, o empate de C e D decide a
    // segunda vaga. É AQUI que a bola de ouro é devida.
    const state = kocReplay(
      ROSTER,
      log(["king", "king", "challenger", "king", "challenger", "king"]),
    );
    assert.deepEqual(state.points, {A: 2, C: 1, D: 1, B: 0});

    const ties = kocQualifyingTies(kocStandings(ROSTER, state), 2);
    assert.equal(ties.length, 1);
    assert.deepEqual([...ties[0]!].sort(), ["C", "D"]);
  });

  it("empate abaixo do corte não é bola de ouro", () => {
    // B e D empatam em 0, disputando 3º e 4º: não muda quem classifica.
    const state = kocReplay(ROSTER, log(["king", "challenger", "king", "king"]));
    assert.deepEqual(state.points, {A: 1, C: 2, B: 0, D: 0});
    assert.deepEqual(kocQualifyingTies(kocStandings(ROSTER, state), 2), []);
  });

  it("ignora empate que não muda quem classifica", () => {
    // A e C empatam em 2 e os dois passam: nada a decidir na areia.
    const state = kocReplay(
      ROSTER,
      log(["king", "challenger", "king", "king", "challenger", "king"]),
    );
    assert.deepEqual(kocQualifyingTies(kocStandings(ROSTER, state), 2), []);
  });

  it("sem corte a decidir, não há empate a resolver", () => {
    const standings = kocStandings(ROSTER, kocInitialState(ROSTER));
    assert.deepEqual(kocQualifyingTies(standings, 4), []);
  });
});
