import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildGroupPots,
  compositeTeamRating,
  rankTeamsByStrength,
  teamStrength,
  type DrawTeamStrength,
} from "./draw-pots";

/**
 * PARIDADE COM O PORTAL. Os casos de `teamStrength` abaixo espelham
 * `frontend/projects/organizer/src/app/painel/data/team-level-score.spec.ts`.
 * As duas implementações existem porque o servidor precisa montar os potes e o
 * portal precisa sugerir cabeças de chave, e não há pacote compartilhado entre
 * `functions/` e `frontend/`. Mudou uma, muda a outra — e é esta tabela que
 * acusa a divergência.
 */

const perfil = (levelsBySport: Record<string, string>, legacyLevel: string | null = null) => ({
  levelsBySport,
  legacyLevel,
});

describe("teamStrength — paridade com teamLevelScore do portal", () => {
  it("soma os degraus da escada dos dois atletas (Open = 7, Intermediário 1 = 3)", () => {
    const score = teamStrength(
      [perfil({BEACH_TENNIS: "open"}), perfil({BEACH_TENNIS: "intermediario_1"})],
      "BEACH_TENNIS",
    );
    assert.equal(score.points, 10);
  });

  it("usa o nível do esporte do torneio, não o de outro esporte do perfil", () => {
    const score = teamStrength(
      [
        perfil({BEACH_TENNIS: "iniciante_1", VOLEI_PRAIA: "open"}),
        perfil({BEACH_TENNIS: "iniciante_1"}),
      ],
      "BEACH_TENNIS",
    );
    assert.equal(score.points, 2);
  });

  it("cai no nível global legado quando falta o do esporte", () => {
    const score = teamStrength(
      [perfil({}, "intermediario"), perfil({}, "intermediario")],
      "BEACH_TENNIS",
    );
    assert.equal(score.points, 6);
  });

  it("não pontua a dupla quando algum atleta não tem nível", () => {
    const score = teamStrength([perfil({BEACH_TENNIS: "open"}), perfil({})], "BEACH_TENNIS");
    assert.equal(score.points, null);
  });

  it("pontua inscrição solo com o único atleta", () => {
    assert.equal(teamStrength([perfil({BEACH_TENNIS: "avancado_1"})], "BEACH_TENNIS").points, 5);
  });

  it("não pontua dupla sem atletas resolvidos", () => {
    assert.equal(teamStrength([], "BEACH_TENNIS").points, null);
  });
});

describe("compositeTeamRating", () => {
  it("compõe pela média quando os dois atletas saíram do provisional", () => {
    assert.equal(
      compositeTeamRating([
        {rating: 1800, ratedMatches: 12},
        {rating: 1900, ratedMatches: 30},
      ]),
      1850,
    );
  });

  it("não compõe quando algum atleta ainda é provisional (menos de 10 partidas)", () => {
    assert.equal(
      compositeTeamRating([
        {rating: 1800, ratedMatches: 12},
        {rating: 1900, ratedMatches: 9},
      ]),
      null,
    );
  });

  it("não compõe quando falta o doc de rating de algum atleta", () => {
    assert.equal(compositeTeamRating([{rating: 1800, ratedMatches: 12}, null]), null);
  });
});

describe("rankTeamsByStrength", () => {
  const t = (teamId: string, points: number | null, rating: number | null = null): DrawTeamStrength => ({
    teamId,
    points,
    rating,
  });

  it("ordena da maior para a menor pontuação", () => {
    assert.deepEqual(rankTeamsByStrength([t("fraca", 4), t("forte", 12), t("media", 8)]), [
      "forte",
      "media",
      "fraca",
    ]);
  });

  it("desempata pelo rating composto", () => {
    assert.deepEqual(rankTeamsByStrength([t("b", 10, 1700), t("a", 10, 1900)]), ["a", "b"]);
  });

  it("joga duplas sem nível para o fim", () => {
    assert.deepEqual(rankTeamsByStrength([t("sem", null), t("com", 2)]), ["com", "sem"]);
  });

  it("empate total desempata pelo teamId — a ordem tem que ser reproduzível", () => {
    // Sem isso o sorteio não é auditável: recriar a sessão com os mesmos dados
    // tem que produzir os mesmos potes, e a ordem de leitura do Firestore não
    // é estável.
    assert.deepEqual(rankTeamsByStrength([t("zz", 8, 1800), t("aa", 8, 1800)]), ["aa", "zz"]);
  });
});

describe("buildGroupPots", () => {
  it("16 duplas em 4 grupos viram 4 potes de 4, o pote 1 com as cabeças", () => {
    const ranked = Array.from({length: 16}, (_, i) => `t${i + 1}`);
    const pots = buildGroupPots(ranked, 4);

    assert.equal(pots.length, 4);
    assert.deepEqual(pots[0], {index: 1, teamIds: ["t1", "t2", "t3", "t4"]});
    assert.deepEqual(pots[3], {index: 4, teamIds: ["t13", "t14", "t15", "t16"]});
  });

  it("14 duplas em 4 grupos deixam o último pote curto, não redistribuído", () => {
    const ranked = Array.from({length: 14}, (_, i) => `t${i + 1}`);
    const pots = buildGroupPots(ranked, 4);

    assert.equal(pots.length, 4);
    assert.deepEqual(pots[3], {index: 4, teamIds: ["t13", "t14"]});
  });

  it("grupo nenhum é o mesmo que um pote só", () => {
    assert.deepEqual(buildGroupPots(["a", "b"], 0), [{index: 1, teamIds: ["a", "b"]}]);
  });

  it("lista vazia não gera pote", () => {
    assert.deepEqual(buildGroupPots([], 4), []);
  });
});
