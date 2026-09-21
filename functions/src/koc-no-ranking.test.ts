import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {shouldPropagateMatchAdvance} from "./organizer-match-ops";
import {shouldProcessRatingUpdate} from "./rating-engine";
import {shouldProcessTournamentMatchXp} from "./tournament-match-gamification";
import {shouldAdvanceKocPhase} from "./koc-phase-advance";
import {isFinalMatchType} from "./tournament-completion";

/**
 * DECISÃO DE PRODUTO (20/09): a categoria King of the Court **não pontua** —
 * nem no ranking global, nem no ranking da liga, nem em XP.
 *
 * Isto não é um efeito colateral da blindagem da fase 0: é a decisão, e este
 * arquivo existe para que ela não seja desfeita por engano quando alguém
 * implementar a fase 5. Uma decisão que vive só no documento é revertida pelo
 * próximo commit; uma que vive num teste, não.
 *
 * O que a rodada KOTC **deve** continuar fazendo: montar a fase seguinte e
 * fechar o torneio. Os dois últimos testes travam esse lado.
 */

/** Final KOTC concluída com o 1º da tabela em `winnerId`. */
const KOC_FINAL_COMPLETED = {
  matchType: "koc_final",
  status: "Completed",
  winnerId: "dupla-campea",
  tournamentId: "t1",
  categoryId: "kotc",
  kocStandings: [{teamId: "dupla-campea", place: 1}],
};

const BEFORE_IN_PROGRESS = {matchType: "koc_final", status: "In Progress"};

describe("King of the Court não pontua", () => {
  it("não entra no rating (Glicko)", () => {
    assert.equal(
      shouldProcessRatingUpdate(BEFORE_IN_PROGRESS, KOC_FINAL_COMPLETED),
      false,
    );
  });

  it("não entra no ranking global", () => {
    // O ranking global importa este MESMO predicado como `shouldAwardForMatch`,
    // então a garantia acima já cobre — o teste existe para o dia em que
    // deixarem de compartilhar.
    assert.equal(
      shouldProcessRatingUpdate(BEFORE_IN_PROGRESS, KOC_FINAL_COMPLETED),
      false,
    );
  });

  it("não gera XP nem pontua palpites", () => {
    assert.equal(
      shouldProcessTournamentMatchXp(BEFORE_IN_PROGRESS, KOC_FINAL_COMPLETED),
      false,
    );
  });

  it("não entra no ranking da liga", () => {
    // `tryAwardLeagueStagePointsForMatch` só é chamado depois deste gate no
    // trigger; falso aqui significa que a etapa KOTC não soma na liga.
    assert.equal(
      shouldPropagateMatchAdvance(BEFORE_IN_PROGRESS, KOC_FINAL_COMPLETED),
      false,
    );
  });

  it("uma categoria de duelo NO MESMO torneio segue pontuando", () => {
    // A decisão é sobre o formato, não sobre o torneio: quem joga a categoria
    // de duplas da mesma etapa continua somando.
    const duelo = {
      matchType: "final",
      status: "Completed",
      winnerId: "dupla-campea",
      tournamentId: "t1",
      categoryId: "duplas",
    };
    assert.equal(shouldProcessRatingUpdate({status: "In Progress"}, duelo), true);
    assert.equal(shouldProcessTournamentMatchXp({status: "In Progress"}, duelo), true);
    assert.equal(shouldPropagateMatchAdvance({status: "In Progress"}, duelo), true);
  });
});

describe("mas a rodada KOTC continua fazendo o resto", () => {
  it("monta a fase seguinte", () => {
    assert.equal(
      shouldAdvanceKocPhase(BEFORE_IN_PROGRESS, KOC_FINAL_COMPLETED),
      true,
    );
  });

  it("fecha o torneio", () => {
    assert.equal(isFinalMatchType(KOC_FINAL_COMPLETED.matchType), true);
  });
});
