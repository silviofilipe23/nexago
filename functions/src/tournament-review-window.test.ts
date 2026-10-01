import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {DAY_MS, HOUR_MS} from "./tournament-review-constants";
import {
  reviewCandidateReason,
  reviewEligibleUids,
  reviewWindowAction,
} from "./tournament-review-window";

const NOW = Date.UTC(2026, 9, 5, 13, 0, 0); // 05/10/2026 10:00 em São Paulo
const ts = (ms: number) => Timestamp.fromMillis(ms);

describe("reviewCandidateReason", () => {
  it("completed nos últimos 3 dias", () => {
    assert.equal(reviewCandidateReason({listingStatus: "completed", completedAt: ts(NOW - DAY_MS)}, NOW), "completed");
  });

  it("aceita o status legado com maiúscula", () => {
    assert.equal(reviewCandidateReason({status: "Completed", completedAt: ts(NOW - HOUR_MS)}, NOW), "completed");
  });

  it("completed antigo ainda entra pelo endAt se ele estiver na faixa", () => {
    const tournament = {listingStatus: "completed", completedAt: ts(NOW - 5 * DAY_MS), endAt: ts(NOW - DAY_MS)};
    assert.equal(reviewCandidateReason(tournament, NOW), "ended");
  });

  it("endAt + 12h: entra com exatamente 12h, não com 11h", () => {
    assert.equal(reviewCandidateReason({listingStatus: "closed", endAt: ts(NOW - 12 * HOUR_MS)}, NOW), "ended");
    assert.equal(reviewCandidateReason({listingStatus: "closed", endAt: ts(NOW - 11 * HOUR_MS)}, NOW), null);
  });

  it("fora do corte de 3 dias não entra", () => {
    assert.equal(reviewCandidateReason({listingStatus: "closed", endAt: ts(NOW - 3 * DAY_MS - 1)}, NOW), null);
    assert.equal(
      reviewCandidateReason({listingStatus: "completed", completedAt: ts(NOW - 3 * DAY_MS - 1)}, NOW),
      null,
    );
  });

  it("cancelado e rascunho nunca entram", () => {
    for (const listingStatus of ["cancelled", "cancelado", "draft"]) {
      const tournament = {listingStatus, completedAt: ts(NOW - HOUR_MS), endAt: ts(NOW - DAY_MS)};
      assert.equal(reviewCandidateReason(tournament, NOW), null);
    }
  });

  it("data gravada como texto ou número (legado) não quebra e não entra", () => {
    assert.equal(reviewCandidateReason({listingStatus: "closed", endAt: "2026-10-04"}, NOW), null);
    assert.equal(reviewCandidateReason({listingStatus: "completed", completedAt: NOW - HOUR_MS}, NOW), null);
  });
});

describe("reviewEligibleUids", () => {
  const confirmed = (teamId: string, extra: Record<string, unknown> = {}) =>
    ({tournamentId: "t1", teamId, isPaid: true, ...extra});

  it("só inscrição confirmada, sem repetir atleta entre categorias", () => {
    const teams = new Map<string, Record<string, unknown>>([
      ["team-ab", {player1Id: "a", player2Id: "b"}],
      ["team-ac", {player1Id: "a", player2Id: "c"}],
      ["team-de", {player1Id: "d", player2Id: "e"}],
      ["team-fg", {player1Id: "f", player2Id: "g"}],
    ]);
    const uids = reviewEligibleUids([
      confirmed("team-ab", {categoryId: "c1"}),
      confirmed("team-ac", {categoryId: "c2"}),
      confirmed("team-de", {waitlist: true}),
      confirmed("team-fg", {isPaid: false}),
      {tournamentId: "t1", teamId: "", isPaid: true, player1Id: "h"},
      confirmed("team-x", {partnerPending: true, player1Id: "i"}),
    ], teams, []);
    assert.deepEqual(uids, ["a", "b", "c"]);
  });

  it("trio: usa os memberUids da equipe", () => {
    const teams = new Map<string, Record<string, unknown>>([["team-3", {memberUids: ["x", "y", "z"]}]]);
    assert.deepEqual(reviewEligibleUids([confirmed("team-3")], teams, []), ["x", "y", "z"]);
  });

  it("equipe sumida: cai nos atletas da própria inscrição", () => {
    const inscription = confirmed("team-gone", {player1Id: "p", participantUids: ["p", "q"]});
    assert.deepEqual(reviewEligibleUids([inscription], new Map(), []), ["p", "q"]);
  });

  it("quem gerencia o torneio não avalia, mesmo tendo jogado", () => {
    const teams = new Map<string, Record<string, unknown>>([["team-org", {player1Id: "org", player2Id: "m"}]]);
    assert.deepEqual(reviewEligibleUids([confirmed("team-org")], teams, ["org"]), ["m"]);
  });
});

describe("reviewWindowAction", () => {
  const open = (extra: Record<string, unknown>) => ({
    status: "open",
    opensAt: ts(NOW - DAY_MS),
    closesAt: ts(NOW + 13 * DAY_MS),
    reminderSentAt: null,
    ...extra,
  });

  it("resumo que não está aberto: nada", () => {
    assert.equal(reviewWindowAction(open({status: "closed"}), NOW), "none");
  });

  it("lembra no 3º dia, uma vez só", () => {
    assert.equal(reviewWindowAction(open({opensAt: ts(NOW - 3 * DAY_MS)}), NOW), "remind");
    assert.equal(reviewWindowAction(open({opensAt: ts(NOW - 2 * DAY_MS)}), NOW), "none");
    assert.equal(
      reviewWindowAction(open({opensAt: ts(NOW - 3 * DAY_MS), reminderSentAt: ts(NOW - DAY_MS)}), NOW),
      "none",
    );
  });

  it("fecha quando closesAt chega, e fechar ganha de lembrar", () => {
    assert.equal(reviewWindowAction(open({opensAt: ts(NOW - 14 * DAY_MS), closesAt: ts(NOW)}), NOW), "close");
  });
});
