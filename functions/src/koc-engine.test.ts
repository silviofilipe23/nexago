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
  type KocRallyOutcome,
} from "./koc-engine";

const ROSTER = ["A", "B", "C", "D"];

function log(outcomes: KocRallyOutcome[]): KocRally[] {
  return outcomes.map((winner, i) => ({seq: i + 1, winner}));
}

/**
 * Erro de saque do desafiante.
 *
 * Terceiro desfecho, e o único em que o placar não se mexe: o desafiante perde
 * a vez e volta para o fim da fila, o rei fica. Tratar como "rei venceu" daria
 * ao rei um ponto que o regulamento não dá.
 */
describe("kocApplyRally · erro de saque", () => {
  it("não pontua para ninguém", () => {
    const state = kocReplay(ROSTER, log(["serve_fault"]));
    assert.deepEqual(state.points, {A: 0, B: 0, C: 0, D: 0});
  });

  it("mantém o rei no trono e manda o desafiante para o fim da fila", () => {
    const state = kocReplay(ROSTER, log(["serve_fault"]));
    assert.equal(state.kingTeamId, "A");
    assert.equal(state.challengerTeamId, "C");
    assert.deepEqual(state.queue, ["D", "B"]);
    assert.equal(state.servingTeamId, "C");
  });

  it("não conta coroação", () => {
    const state = kocReplay(ROSTER, log(["serve_fault", "serve_fault"]));
    assert.deepEqual(state.crowns, {A: 1, B: 0, C: 0, D: 0});
    assert.deepEqual(state.crownOrder, ["A"]);
  });

  it("conta como rally disputado (a rodada acaba por tempo, não por rally)", () => {
    assert.equal(kocReplay(ROSTER, log(["serve_fault"])).rallies, 1);
  });

  it("desfazer devolve a vez ao desafiante que errou", () => {
    // Desfazer é reproduzir sem o último: o log é a verdade.
    const antes = kocReplay(ROSTER, log(["king"]));
    const depois = kocReplay(ROSTER, log(["king", "serve_fault"]));
    const desfeito = kocReplay(ROSTER, log(["king"]));
    assert.equal(depois.challengerTeamId, "D");
    assert.deepEqual(desfeito, antes);
  });

  it("não atrapalha a contagem de quem defende depois", () => {
    // A defende, C erra o saque, A defende de novo: 2 pontos, não 3.
    const state = kocReplay(ROSTER, log(["king", "serve_fault", "king"]));
    assert.equal(state.points.A, 2);
  });
});

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
    const state = kocApplyRally(kocInitialState(ROSTER), {winner: "king"});
    assert.equal(state.kingTeamId, "A");
    assert.equal(state.points.A, 1);
    assert.equal(state.challengerTeamId, "C");
    assert.deepEqual(state.queue, ["D", "B"]);
  });

  it("desafiante que destrona NÃO pontua pela coroação", () => {
    // É a regra que define o formato: ponto vem de defender, não de vencer.
    const state = kocApplyRally(kocInitialState(ROSTER), {winner: "challenger"});
    assert.equal(state.kingTeamId, "B");
    assert.equal(state.points.B, 0);
    assert.equal(state.points.A, 0);
  });

  it("rei destronado vai para o fim da fila", () => {
    const state = kocApplyRally(kocInitialState(ROSTER), {winner: "challenger"});
    assert.deepEqual(state.queue, ["D", "A"]);
    assert.equal(state.challengerTeamId, "C");
  });

  it("quem entra passa a sacar", () => {
    const state = kocApplyRally(kocInitialState(ROSTER), {winner: "king"});
    assert.equal(state.servingTeamId, state.challengerTeamId);
  });

  it("não muta o estado anterior", () => {
    const before = kocInitialState(ROSTER);
    kocApplyRally(before, {winner: "king"});
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
      const winners: KocRallyOutcome[] = [];
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
    const winners: KocRallyOutcome[] = [
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

/**
 * Bola de ouro: o rally único que resolve o empate na vaga.
 *
 * Ela aponta uma DUPLA, não um lado, porque é jogada depois do apito entre as
 * empatadas — que quase nunca são o rei e o desafiante do momento.
 */
describe("kocApplyRally · bola de ouro", () => {
  function golden(teamId: string) {
    return {winner: "golden_point" as const, teamId};
  }

  it("dá o ponto à dupla apontada, não a quem está no trono", () => {
    const antes = kocReplay(ROSTER, log(["king"])); // A no trono com 1
    const state = kocApplyRally(antes, golden("C"));
    assert.equal(state.points.C, 1);
    assert.equal(state.points.A, 1);
  });

  it("não gira a fila — a rodada já acabou no relógio", () => {
    const antes = kocReplay(ROSTER, log(["king"]));
    const state = kocApplyRally(antes, golden("C"));
    assert.equal(state.kingTeamId, antes.kingTeamId);
    assert.equal(state.challengerTeamId, antes.challengerTeamId);
    assert.deepEqual(state.queue, antes.queue);
    assert.deepEqual(state.crownOrder, antes.crownOrder);
  });

  it("recusa dupla fora do elenco", () => {
    assert.throws(
      () => kocApplyRally(kocInitialState(ROSTER), golden("Z")),
      /elenco/,
    );
  });

  it("entra no log e o desfazer a remove", () => {
    const rallies: KocRally[] = [
      {seq: 1, winner: "king"},
      {seq: 2, winner: "golden_point", teamId: "C"},
    ];
    const comGolden = kocReplay(ROSTER, rallies);
    const desfeito = kocReplay(ROSTER, rallies.slice(0, -1));
    assert.equal(comGolden.points.C, 1);
    assert.equal(desfeito.points.C, 0);
  });

  it("desempata de fato: quem vence a bola de ouro passa", () => {
    // Um único rally já produz o caso real: A defende e abre 1; B, C e D ficam
    // em 0, então TRÊS duplas disputam a 2ª vaga. Com poucos rallies — que é o
    // que uma rodada de 15 min produz — o empate no corte é o caso comum, não
    // a exceção.
    const rallies: KocRally[] = [{seq: 1, winner: "king"}];
    const antes = kocStandings(ROSTER, kocReplay(ROSTER, rallies));
    const empate = kocQualifyingTies(antes, 2);
    assert.deepEqual(empate, [["B", "C", "D"]]);

    const depois = kocStandings(
      ROSTER,
      kocReplay(ROSTER, [
        ...rallies,
        {seq: 2, winner: "golden_point", teamId: "C"},
      ]),
    );
    assert.equal(kocQualifyingTies(depois, 2).length, 0);
    assert.deepEqual(
      depois.slice(0, 2).map((st) => st.teamId),
      ["A", "C"],
    );
  });
});
