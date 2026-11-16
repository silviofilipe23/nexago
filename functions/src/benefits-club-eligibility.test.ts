import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {artifactsInscriptionsPath} from "./firebase-paths";
import {
  bestLevelRankOf,
  callerMeetsPartnerRequirement,
  eligibleUidsFor,
  loadEligibilityFacts,
  meetsRequirement,
  parseRequirement,
  requirementDeniedMessage,
  type EligibilityFacts,
} from "./benefits-club-eligibility";

const NO_FACTS: EligibilityFacts = {squadActive: false, paidTournamentIds: new Set(), bestLevelRank: null};

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  const inscriptions = artifactsInscriptionsPath();
  fake.seedDoc("squadAmbassadors/amb", {status: "active", tier: "ath"});
  fake.seedDoc("squadAmbassadors/paused", {status: "paused", tier: "ath"});
  fake.seedDoc(`${inscriptions}/r1`, {tournamentId: "t1", participantUids: ["paid", "partner"], isPaid: true});
  fake.seedDoc(`${inscriptions}/r2`, {tournamentId: "t1", participantUids: ["unpaid"], isPaid: false});
  fake.seedDoc(`${inscriptions}/r3`, {tournamentId: "t1", participantUids: ["wait"], isPaid: true, waitlist: true});
  fake.seedDoc(`${inscriptions}/r4`, {tournamentId: "t9", participantUids: ["other"], isPaid: true});
  fake.seedDoc("users/pro", {sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "iniciante_2", BEACH_TENNIS: "avancado_1"}}});
  fake.seedDoc("users/legacy", {level: "Intermediário"});
  fake.seedDoc("users/none", {});
  return {fake, db: fake as unknown as Firestore};
}

describe("parseRequirement", () => {
  it("ausente vira none; tipos válidos passam", () => {
    assert.deepEqual(parseRequirement(undefined), {type: "none"});
    assert.deepEqual(parseRequirement(null), {type: "none"});
    assert.deepEqual(parseRequirement({type: "squad"}), {type: "squad"});
    assert.deepEqual(parseRequirement({type: "tournament", tournamentIds: ["t1", "t1", "t2"]}), {
      type: "tournament",
      tournamentIds: ["t1", "t2"],
    });
    assert.deepEqual(parseRequirement({type: "min_level", minLevel: "intermediario_1"}), {
      type: "min_level",
      minLevel: "intermediario_1",
    });
  });

  it("malformado vira null (ninguém cumpre)", () => {
    assert.equal(parseRequirement({type: "vip"}), null);
    assert.equal(parseRequirement({type: "tournament", tournamentIds: []}), null);
    assert.equal(parseRequirement({type: "tournament", tournamentIds: Array.from({length: 11}, (_, i) => `t${i}`)}), null);
    assert.equal(parseRequirement({type: "tournament", tournamentIds: ["../x"]}), null);
    assert.equal(parseRequirement({type: "min_level", minLevel: "Intermediário 1"}), null);
    assert.equal(parseRequirement("squad"), null);
    assert.equal(meetsRequirement(null, {...NO_FACTS, squadActive: true}), false);
  });
});

describe("meetsRequirement", () => {
  it("cada tipo olha só o seu fato", () => {
    assert.equal(meetsRequirement({type: "none"}, NO_FACTS), true);
    assert.equal(meetsRequirement({type: "squad"}, NO_FACTS), false);
    assert.equal(meetsRequirement({type: "squad"}, {...NO_FACTS, squadActive: true}), true);
    const t = {type: "tournament" as const, tournamentIds: ["t1", "t2"]};
    assert.equal(meetsRequirement(t, NO_FACTS), false);
    assert.equal(meetsRequirement(t, {...NO_FACTS, paidTournamentIds: new Set(["t2"])}), true);
  });

  it("nível mínimo compara o degrau; sem nível não passa", () => {
    const req = {type: "min_level" as const, minLevel: "intermediario_1"};
    assert.equal(meetsRequirement(req, {...NO_FACTS, bestLevelRank: 1}), false);
    assert.equal(meetsRequirement(req, {...NO_FACTS, bestLevelRank: 2}), true);
    assert.equal(meetsRequirement(req, {...NO_FACTS, bestLevelRank: 6}), true);
    assert.equal(meetsRequirement(req, NO_FACTS), false);
  });
});

describe("bestLevelRankOf", () => {
  it("o melhor esporte vale; sem nenhum, o nível legado", () => {
    assert.equal(bestLevelRankOf({sportOnboarding: {levelsBySport: {A: "iniciante_2", B: "avancado_1"}}}), 4);
    assert.equal(bestLevelRankOf({levelsBySport: {A: "open"}}), 6);
    assert.equal(bestLevelRankOf({level: "Intermediário"}), 2);
    assert.equal(bestLevelRankOf({sportOnboarding: {levelsBySport: {A: "nada"}}}), null);
    assert.equal(bestLevelRankOf(undefined), null);
  });
});

describe("requirementDeniedMessage", () => {
  it("usa o rótulo do parceiro e cai num padrão por tipo", () => {
    assert.equal(requirementDeniedMessage({type: "squad"}, " Só embaixadores "), "Só embaixadores");
    assert.equal(requirementDeniedMessage({type: "squad"}, null), "Exclusivo para embaixadores do Squad.");
    assert.equal(requirementDeniedMessage({type: "tournament", tournamentIds: ["t"]}, ""), "Exclusivo para inscritos do torneio.");
    assert.equal(
      requirementDeniedMessage({type: "min_level", minLevel: "avancado_1"}, undefined),
      "Exclusivo para atletas a partir do nível Avançado 1.",
    );
    assert.equal(requirementDeniedMessage(null, undefined), "Este benefício não está disponível para você.");
  });
});

describe("loadEligibilityFacts / callerMeetsPartnerRequirement", () => {
  it("Squad só com contrato ativo", async () => {
    const {db} = makeDb();
    assert.equal((await loadEligibilityFacts(db, "amb", [{type: "squad"}])).squadActive, true);
    assert.equal((await loadEligibilityFacts(db, "paused", [{type: "squad"}])).squadActive, false);
    assert.equal((await loadEligibilityFacts(db, "ninguem", [{type: "squad"}])).squadActive, false);
  });

  it("torneio só com inscrição paga e fora da fila de espera", async () => {
    const {db} = makeDb();
    const partner = {requirement: {type: "tournament", tournamentIds: ["t1"]}};
    assert.equal(await callerMeetsPartnerRequirement(db, "paid", partner), true);
    assert.equal(await callerMeetsPartnerRequirement(db, "partner", partner), true);
    assert.equal(await callerMeetsPartnerRequirement(db, "unpaid", partner), false);
    assert.equal(await callerMeetsPartnerRequirement(db, "wait", partner), false);
    assert.equal(await callerMeetsPartnerRequirement(db, "other", partner), false);
  });

  it("nível mínimo pelo perfil", async () => {
    const {db} = makeDb();
    const partner = {requirement: {type: "min_level", minLevel: "intermediario_1"}};
    assert.equal(await callerMeetsPartnerRequirement(db, "pro", partner), true);
    assert.equal(await callerMeetsPartnerRequirement(db, "legacy", partner), true);
    assert.equal(await callerMeetsPartnerRequirement(db, "none", partner), false);
  });

  it("sem requisito não lê nada; requisito malformado nega", async () => {
    const {db} = makeDb();
    assert.equal(await callerMeetsPartnerRequirement(db, "x", {}), true);
    assert.equal(await callerMeetsPartnerRequirement(db, "amb", {requirement: {type: "squad", extra: 1, minLevel: 3}}), true);
    assert.equal(await callerMeetsPartnerRequirement(db, "amb", {requirement: {type: "gold"}}), false);
  });
});

describe("eligibleUidsFor", () => {
  it("monta o conjunto em lote para o push", async () => {
    const {db} = makeDb();
    assert.deepEqual(await eligibleUidsFor(db, {type: "none"}), {uids: null, byProfile: null});
    assert.deepEqual([...(await eligibleUidsFor(db, {type: "squad"})).uids ?? []], ["amb"]);
    const t = await eligibleUidsFor(db, {type: "tournament", tournamentIds: ["t1"]});
    assert.deepEqual([...t.uids ?? []].sort(), ["paid", "partner"]);
    const lvl = await eligibleUidsFor(db, {type: "min_level", minLevel: "avancado_1"});
    assert.equal(lvl.uids, null);
    assert.equal(lvl.byProfile?.({levelsBySport: {A: "avancado_1"}}), true);
    assert.equal(lvl.byProfile?.({level: "iniciante"}), false);
    assert.equal((await eligibleUidsFor(db, null)).uids?.size, 0);
  });
});
