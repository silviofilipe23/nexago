import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  levelHistoryAuditFields,
  planLevelChange,
  planLevelChangeAuthorization,
} from "./athlete-level-admin";
import {parseLadderConfig} from "./rating-config";
import type {AthleteRatingState} from "./rating-ladder";

const NOW = new Date("2026-08-11T12:00:00Z");
const DAY_MS = 86_400_000;

const CONFIG = parseLadderConfig("VOLEI_PRAIA", {});

/** Atleta consolidado em intermediario_1 (rating 1600, banda 1500–1720). */
function rating(overrides: Partial<AthleteRatingState> = {}): AthleteRatingState {
  return {
    athleteId: "a1",
    sportCode: "VOLEI_PRAIA",
    rating: 1600,
    rd: 90,
    volatility: 0.06,
    ratedMatches: 12,
    wins: 7,
    losses: 5,
    lastMatchAt: NOW,
    levelCode: "intermediario_1",
    levelRank: 2,
    zone: "stable",
    ladderState: "stable",
    observationStartedAt: null,
    observationMatches: 0,
    notifiedAt: null,
    protectedUntil: null,
    seededFromLevel: "intermediario_1",
    ...overrides,
  };
}

function plan(targetCode: string, overrides: Partial<Parameters<typeof planLevelChange>[0]> = {}) {
  return planLevelChange({
    currentLevel: "intermediario_1",
    targetCode,
    config: CONFIG,
    currentRating: rating(),
    now: NOW,
    ...overrides,
  });
}

describe("planLevelChange — direção", () => {
  it("classifica descida, subida e no-op", () => {
    assert.equal(plan("iniciante_2").direction, "down");
    assert.equal(plan("open").direction, "up");
    assert.equal(plan("intermediario_1").direction, "same");
  });

  it("perfil sem nível no esporte é seed", () => {
    const result = plan("iniciante_1", {currentLevel: null});
    assert.equal(result.direction, "seed");
    assert.equal(result.fromLevel, null);
  });

  it("nível legado é comparado pelo rank, não pela string", () => {
    // `intermediario` (escada de 3) tem o mesmo rank de `intermediario_1`.
    const result = plan("intermediario_1", {currentLevel: "intermediario"});
    assert.equal(result.direction, "same");
    assert.equal(result.fromLevel, "intermediario");
  });
});

describe("planLevelChange — realinhamento do rating", () => {
  it("descendo, puxa o rating para o teto do nível novo e some com a proteção", () => {
    const {ratingNext} = plan("iniciante_2");
    assert.ok(ratingNext);
    // 1600 > initialRating de iniciante_2 (1450) → desce para 1450.
    assert.equal(ratingNext.rating, 1450);
    assert.equal(ratingNext.levelCode, "iniciante_2");
    assert.equal(ratingNext.levelRank, 1);
    assert.equal(ratingNext.rd, CONFIG.glicko.initialRd);
    assert.equal(ratingNext.protectedUntil, null);
    assert.equal(ratingNext.ladderState, "stable");
  });

  it("descendo, não sobe o rating de quem já está abaixo do inicial", () => {
    const {ratingNext} = plan("iniciante_2", {currentRating: rating({rating: 1300})});
    assert.equal(ratingNext?.rating, 1300);
    // 1300 <= demoteAt (1350) do iniciante_2 → já entra na zona de rebaixamento.
    assert.equal(ratingNext?.zone, "relegation");
  });

  it("subindo, garante o piso do nível novo e protege contra rebaixamento", () => {
    const {ratingNext} = plan("open");
    assert.equal(ratingNext?.rating, 2200);
    assert.deepEqual(
      ratingNext?.protectedUntil,
      new Date(NOW.getTime() + CONFIG.ladder.promotionProtectionDays * DAY_MS),
    );
  });

  it("preserva partidas, vitórias, derrotas e volatilidade", () => {
    const {ratingNext} = plan("iniciante_1");
    assert.equal(ratingNext?.ratedMatches, 12);
    assert.equal(ratingNext?.wins, 7);
    assert.equal(ratingNext?.losses, 5);
    assert.equal(ratingNext?.volatility, 0.06);
  });

  it("limpa a janela de observação de quem estava em risco", () => {
    const {ratingNext} = plan("iniciante_2", {
      currentRating: rating({
        ladderState: "relegation_observation",
        observationStartedAt: NOW,
        observationMatches: 3,
        notifiedAt: NOW,
      }),
    });
    assert.equal(ratingNext?.ladderState, "stable");
    assert.equal(ratingNext?.observationStartedAt, null);
    assert.equal(ratingNext?.observationMatches, 0);
    assert.equal(ratingNext?.notifiedAt, null);
  });
});

describe("planLevelChange — quando NÃO realinha", () => {
  it("esporte fora da escada não tem rating a realinhar", () => {
    const result = plan("iniciante_2", {config: null, currentRating: null});
    assert.equal(result.direction, "down");
    assert.equal(result.ratingNext, null);
  });

  it("sem doc de rating não semeia (a engine semeia na 1ª partida rateada)", () => {
    assert.equal(plan("iniciante_2", {currentRating: null}).ratingNext, null);
  });

  it("doc já no nível alvo é deixado em paz", () => {
    // Reescrever zeraria RD, observação e proteção sem motivo.
    const result = plan("iniciante_2", {
      currentRating: rating({levelCode: "iniciante_2", levelRank: 1}),
    });
    assert.equal(result.ratingNext, null);
  });
});

/**
 * Base "tudo certo" para o caminho do organizador: dono do torneio, atleta
 * inscrito, subindo de nível (`iniciante_1` → `intermediario_1`).
 */
function authParams(
  overrides: Partial<Parameters<typeof planLevelChangeAuthorization>[0]> = {},
) {
  return {
    isAdmin: false,
    tournamentId: "t1",
    tournamentManagerId: "org-1",
    callerUid: "org-1",
    athleteHasActiveRegistration: true,
    currentLevel: "iniciante_1",
    targetLevel: "intermediario_1",
    ...overrides,
  };
}

describe("planLevelChangeAuthorization", () => {
  it("admin sempre autorizado — mesmo sem tournamentId e mesmo descendo", () => {
    const result = planLevelChangeAuthorization(
      authParams({
        isAdmin: true,
        tournamentId: "",
        tournamentManagerId: null,
        athleteHasActiveRegistration: false,
        currentLevel: "open",
        targetLevel: "iniciante_1",
      }),
    );
    assert.deepEqual(result, {mode: "admin"});
  });

  it("organizador promovendo atleta inscrito no próprio torneio: autorizado", () => {
    const result = planLevelChangeAuthorization(authParams());
    assert.deepEqual(result, {mode: "organizer"});
  });

  it("organizador sem nível atual (seed): autorizado (não há degrau pra violar)", () => {
    const result = planLevelChangeAuthorization(authParams({currentLevel: null}));
    assert.deepEqual(result, {mode: "organizer"});
  });

  it("sem tournamentId e sem admin: permission-denied", () => {
    const result = planLevelChangeAuthorization(authParams({tournamentId: ""}));
    assert.equal(result.mode, "denied");
    assert.equal((result as {code: string}).code, "permission-denied");
    assert.match(
      (result as {message: string}).message,
      /Apenas administradores/,
    );
  });

  it("caller não é dono do torneio: permission-denied", () => {
    const result = planLevelChangeAuthorization(
      authParams({tournamentManagerId: "outro-uid"}),
    );
    assert.equal(result.mode, "denied");
    assert.equal((result as {code: string}).code, "permission-denied");
    assert.match(
      (result as {message: string}).message,
      /não é o organizador responsável/,
    );
  });

  it("torneio sem dono identificável (managerId ausente): permission-denied", () => {
    const result = planLevelChangeAuthorization(
      authParams({tournamentManagerId: null}),
    );
    assert.equal(result.mode, "denied");
    assert.equal((result as {code: string}).code, "permission-denied");
  });

  it("atleta sem inscrição ativa no torneio: permission-denied", () => {
    const result = planLevelChangeAuthorization(
      authParams({athleteHasActiveRegistration: false}),
    );
    assert.equal(result.mode, "denied");
    assert.equal((result as {code: string}).code, "permission-denied");
    assert.match(
      (result as {message: string}).message,
      /não tem inscrição ativa/,
    );
  });

  it("tenta manter o mesmo nível: failed-precondition com a mensagem exata", () => {
    const result = planLevelChangeAuthorization(
      authParams({currentLevel: "intermediario_1", targetLevel: "intermediario_1"}),
    );
    assert.equal(result.mode, "denied");
    assert.equal((result as {code: string}).code, "failed-precondition");
    assert.equal(
      (result as {message: string}).message,
      "Organizador só pode promover — o nível de um atleta nunca desce.",
    );
  });

  it("tenta rebaixar: failed-precondition com a mesma mensagem exata", () => {
    const result = planLevelChangeAuthorization(
      authParams({currentLevel: "avancado_1", targetLevel: "iniciante_2"}),
    );
    assert.equal(result.mode, "denied");
    assert.equal((result as {code: string}).code, "failed-precondition");
    assert.equal(
      (result as {message: string}).message,
      "Organizador só pode promover — o nível de um atleta nunca desce.",
    );
  });

  it("direção errada é checada DEPOIS de dono/inscrição (mensagem certa por prioridade)", () => {
    // Nem dono nem inscrito, e também tentando rebaixar — o motivo relatado é
    // o de propriedade, não o de direção (checagens em cascata, a mais básica
    // primeiro).
    const result = planLevelChangeAuthorization(
      authParams({
        tournamentManagerId: "outro-uid",
        athleteHasActiveRegistration: false,
        currentLevel: "avancado_1",
        targetLevel: "iniciante_2",
      }),
    );
    assert.equal(result.mode, "denied");
    assert.equal((result as {code: string}).code, "permission-denied");
  });
});

describe("levelHistoryAuditFields", () => {
  it("admin: reason admin_manual, note = motivo digitado, actor backoffice:{uid}, sem tournamentId", () => {
    const fields = levelHistoryAuditFields({
      mode: "admin",
      callerUid: "admin-1",
      note: "Nível declarado não condizia com o nível real observado em quadra.",
      tournamentId: "",
    });
    assert.deepEqual(fields, {
      reason: "admin_manual",
      note: "Nível declarado não condizia com o nível real observado em quadra.",
      actor: "backoffice:admin-1",
    });
  });

  it("organizador: reason organizer_promotion, actor organizer:{uid}, tournamentId presente", () => {
    const fields = levelHistoryAuditFields({
      mode: "organizer",
      callerUid: "org-1",
      note: "",
      tournamentId: "t1",
    });
    assert.deepEqual(fields, {
      reason: "organizer_promotion",
      note: null,
      actor: "organizer:org-1",
      tournamentId: "t1",
    });
  });
});
