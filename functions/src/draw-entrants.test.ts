import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {buildEntrants, teamHistoryStats, type EntrantSource} from "./draw-entrants";

const perfil = (over: Partial<EntrantSource["profiles"][number]> = {}) => ({
  displayName: "Ana Souza",
  photoUrl: null,
  city: "Goiânia",
  levelsBySport: {BEACH_TENNIS: "open"},
  legacyLevel: null,
  ...over,
});

const fonte = (over: Partial<EntrantSource> = {}): EntrantSource => ({
  teamId: "tm1",
  teamName: null,
  profiles: [perfil(), perfil({displayName: "Bia Lima"})],
  ratings: [],
  history: [],
  ...over,
});

describe("teamHistoryStats", () => {
  const partida = (won: boolean, isFinal = false, tournamentId = "t1") => ({
    won,
    isFinal,
    tournamentId,
  });

  it("conta vitórias e derrotas das partidas concluídas", () => {
    const stats = teamHistoryStats([partida(true), partida(false), partida(true)]);
    assert.equal(stats.wins, 2);
    assert.equal(stats.losses, 1);
  });

  it("título é final vencida, contada uma vez por torneio", () => {
    const stats = teamHistoryStats([
      partida(true, true, "copa-a"),
      partida(true, true, "copa-a"),
      partida(true, true, "copa-b"),
      partida(false, true, "copa-c"),
    ]);
    assert.equal(stats.titles, 2);
  });

  it("últimos 5 vêm do mais recente pro mais antigo", () => {
    const stats = teamHistoryStats([
      partida(true),
      partida(false),
      partida(true),
      partida(true),
      partida(false),
      partida(true),
    ]);
    assert.deepEqual(stats.last5, ["V", "D", "V", "V", "D"]);
  });

  it("dupla estreante tem cartel zerado, não indefinido", () => {
    assert.deepEqual(teamHistoryStats([]), {wins: 0, losses: 0, titles: 0, last5: []});
  });
});

describe("buildEntrants", () => {
  it("monta o rótulo com o primeiro nome de cada atleta", () => {
    const [entrant] = buildEntrants([fonte()], "BEACH_TENNIS", []);
    assert.equal(entrant!.label, "Ana / Bia");
    assert.deepEqual(entrant!.playerNames, ["Ana Souza", "Bia Lima"]);
  });

  it("nome próprio da equipe ganha do rótulo derivado", () => {
    const [entrant] = buildEntrants([fonte({teamName: "As Feras"})], "BEACH_TENNIS", []);
    assert.equal(entrant!.label, "As Feras");
  });

  it("cidade da dupla é a do primeiro atleta que tiver uma", () => {
    const [entrant] = buildEntrants(
      [fonte({profiles: [perfil({city: null}), perfil({city: "Anápolis"})]})],
      "BEACH_TENNIS",
      [],
    );
    assert.equal(entrant!.city, "Anápolis");
  });

  it("pontuação e rótulo de nível saem do esporte do torneio", () => {
    const [entrant] = buildEntrants(
      [
        fonte({
          profiles: [
            perfil({levelsBySport: {BEACH_TENNIS: "open"}}),
            perfil({levelsBySport: {BEACH_TENNIS: "intermediario_1"}}),
          ],
        }),
      ],
      "BEACH_TENNIS",
      [],
    );
    assert.equal(entrant!.points, 10);
    assert.equal(entrant!.levelLabel, "Open + Interm. 1");
  });

  it("marca o pote de cada dupla a partir dos potes recebidos", () => {
    const entrants = buildEntrants(
      [fonte({teamId: "a"}), fonte({teamId: "b"}), fonte({teamId: "c"})],
      "BEACH_TENNIS",
      [
        {index: 1, teamIds: ["b"]},
        {index: 2, teamIds: ["a", "c"]},
      ],
    );
    assert.equal(entrants.find((e) => e.teamId === "b")!.potIndex, 1);
    assert.equal(entrants.find((e) => e.teamId === "a")!.potIndex, 2);
  });

  it("dupla fora de qualquer pote cai no último — nunca fica sem pote", () => {
    const entrants = buildEntrants([fonte({teamId: "orfa"})], "BEACH_TENNIS", [
      {index: 1, teamIds: ["outra"]},
    ]);
    assert.equal(entrants[0]!.potIndex, 1);
  });

  it("cabeça travada recebe o seed; as demais ficam sem", () => {
    const entrants = buildEntrants(
      [fonte({teamId: "a"}), fonte({teamId: "b"})],
      "BEACH_TENNIS",
      [{index: 1, teamIds: ["a", "b"]}],
      ["a"],
    );
    assert.equal(entrants.find((e) => e.teamId === "a")!.lockedSeed, 1);
    assert.equal(entrants.find((e) => e.teamId === "b")!.lockedSeed, null);
  });

  it("atleta sem perfil resolvido não derruba a montagem", () => {
    const [entrant] = buildEntrants([fonte({profiles: []})], "BEACH_TENNIS", []);
    assert.equal(entrant!.label, "Dupla");
    assert.equal(entrant!.points, null);
    assert.equal(entrant!.city, null);
  });
});
