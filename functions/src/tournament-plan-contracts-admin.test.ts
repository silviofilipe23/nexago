import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {requestContractCore, saveSponsorCore} from "./tournament-plan-contracts";
import {
  reviewSponsorLogoCore,
  saveNexagoSponsorCore,
  setContractStatusCore,
} from "./tournament-plan-contracts-admin";

const ORG = {uid: "org1", name: "Ana Organiza"};
const ADMIN = {uid: "adm1", name: "Bia NexaGO"};
// 19/10/2026 09:00 em São Paulo.
const NOW = new Date("2026-10-19T12:00:00Z");
// Evento de 28 a 30/11/2026.
const AFTER_EVENT = new Date("2026-11-30T15:00:00Z");

function logoUrl(tournamentId: string, sponsorId: string, token = "abc"): string {
  const path = encodeURIComponent(`tournaments/${tournamentId}/plan-sponsors/${sponsorId}`);
  return `https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/${path}?alt=media&token=${token}`;
}

async function contracted(): Promise<{fake: FakeFirestore; db: Firestore}> {
  const fake = new FakeFirestore();
  const db = fake as unknown as Firestore;
  fake.seedDoc("tournaments/t1", {
    name: "Open Goiânia Beach",
    managerId: ORG.uid,
    status: "open",
    city: "Goiania",
    startAt: new Date("2026-11-28T12:00:00Z"),
    endAt: new Date("2026-11-30T12:00:00Z"),
  });
  await requestContractCore(db, {tournamentId: "t1", planId: "plano-4", expectedPriceCents: 3500_00}, ORG, NOW);
  return {fake, db};
}

function contract(fake: FakeFirestore): Record<string, unknown> {
  return fake.store.get("tournamentPlanContracts/t1") ?? {};
}

describe("setContractStatusCore", () => {
  it("anda na ordem e registra cada passo no histórico, com quem marcou", async () => {
    const {fake, db} = await contracted();
    await setContractStatusCore(db, {tournamentId: "t1", from: "requested", to: "deposit_paid", note: "Pix 18/10"},
      ADMIN, NOW);
    await setContractStatusCore(db, {tournamentId: "t1", from: "deposit_paid", to: "paid"}, ADMIN, NOW);
    await setContractStatusCore(db, {tournamentId: "t1", from: "paid", to: "completed"}, ADMIN, AFTER_EVENT);
    const c = contract(fake);
    assert.equal(c["status"], "completed");
    assert.deepEqual(c["updatedBy"], ADMIN);
    assert.ok(c["depositPaidAt"] instanceof Date);
    assert.ok(c["paidAt"] instanceof Date);
    assert.ok(c["completedAt"] instanceof Date);
    const history = c["history"] as Array<Record<string, unknown>>;
    assert.deepEqual(history.map((h) => h["status"]), ["requested", "deposit_paid", "paid", "completed"]);
    assert.equal(history[1]["note"], "Pix 18/10");
    assert.equal("note" in history[2], false);
    assert.deepEqual(history[3]["by"], ADMIN);
  });

  it("não pula etapa nem volta atrás", async () => {
    const {db} = await contracted();
    await assert.rejects(setContractStatusCore(db, {tournamentId: "t1", from: "requested", to: "paid"}, ADMIN, NOW),
      /não passa para "Pago"/);
    await assert.rejects(setContractStatusCore(db, {tournamentId: "t1", from: "requested", to: "requested"}, ADMIN, NOW),
      (e: {code?: string}) => e.code === "invalid-argument");
  });

  it("status diferente do que a tela mostrava não passa (dois atendentes no mesmo contrato)", async () => {
    const {fake, db} = await contracted();
    await setContractStatusCore(db, {tournamentId: "t1", from: "requested", to: "deposit_paid"}, ADMIN, NOW);
    await assert.rejects(
      setContractStatusCore(db, {tournamentId: "t1", from: "requested", to: "deposit_paid"}, ADMIN, NOW),
      /já está como "Sinal pago"/,
    );
    assert.equal((contract(fake)["history"] as unknown[]).length, 2);
  });

  it("concluir só depois do último dia do evento", async () => {
    const {db} = await contracted();
    await setContractStatusCore(db, {tournamentId: "t1", from: "requested", to: "deposit_paid"}, ADMIN, NOW);
    await setContractStatusCore(db, {tournamentId: "t1", from: "deposit_paid", to: "paid"}, ADMIN, NOW);
    await assert.rejects(setContractStatusCore(db, {tournamentId: "t1", from: "paid", to: "completed"}, ADMIN, NOW),
      /vai até 30\/11\/2026/);
  });

  it("cancela com motivo em qualquer status em aberto; libera o evento para um novo pedido", async () => {
    const {fake, db} = await contracted();
    await setContractStatusCore(db, {tournamentId: "t1", from: "requested", to: "deposit_paid"}, ADMIN, NOW);
    await assert.rejects(setContractStatusCore(db, {tournamentId: "t1", from: "deposit_paid", to: "cancelled"},
      ADMIN, NOW), /motivo do cancelamento/);
    await setContractStatusCore(db, {tournamentId: "t1", from: "deposit_paid", to: "cancelled",
      note: " Organizador desistiu; sinal devolvido "}, ADMIN, NOW);
    const c = contract(fake);
    assert.equal(c["status"], "cancelled");
    assert.equal(c["cancelReason"], "Organizador desistiu; sinal devolvido");
    assert.ok(c["cancelledAt"] instanceof Date);
    await requestContractCore(db, {tournamentId: "t1", planId: "plano-3", expectedPriceCents: 3000_00}, ORG, NOW);
    assert.equal(contract(fake)["status"], "requested");
  });

  it("concluído e cancelado são finais", async () => {
    const {db} = await contracted();
    await setContractStatusCore(db, {tournamentId: "t1", from: "requested", to: "cancelled", note: "Duplicado"},
      ADMIN, NOW);
    await assert.rejects(setContractStatusCore(db, {tournamentId: "t1", from: "cancelled", to: "cancelled",
      note: "De novo"}, ADMIN, NOW), /não passa para "Cancelado"/);
    await assert.rejects(setContractStatusCore(db, {tournamentId: "t1", from: "cancelled", to: "deposit_paid"},
      ADMIN, NOW), /não passa para "Sinal pago"/);
  });

  it("contrato inexistente e observação longa demais", async () => {
    const {db} = await contracted();
    await assert.rejects(setContractStatusCore(db, {tournamentId: "zz", from: "requested", to: "deposit_paid"},
      ADMIN, NOW), (e: {code?: string}) => e.code === "not-found");
    await assert.rejects(setContractStatusCore(db, {tournamentId: "t1", from: "requested", to: "deposit_paid",
      note: "x".repeat(281)}, ADMIN, NOW), (e: {code?: string}) => e.code === "invalid-argument");
  });
});

describe("reviewSponsorLogoCore", () => {
  async function withLogo() {
    const made = await contracted();
    await saveSponsorCore(made.db, {tournamentId: "t1", action: "add", sponsorId: "s1", name: "Açaí da Praia",
      tierId: "ouro", logoUrl: logoUrl("t1", "s1")}, ORG, NOW);
    return made;
  }

  function sponsor(fake: FakeFirestore, id = "s1"): Record<string, unknown> {
    return fake.store.get(`tournamentPlanContracts/t1/sponsors/${id}`) ?? {};
  }

  it("aprova a logo em análise e guarda quem aprovou", async () => {
    const {fake, db} = await withLogo();
    assert.equal(sponsor(fake)["logoStatus"], "review");
    const out = await reviewSponsorLogoCore(db, {tournamentId: "t1", sponsorId: "s1", decision: "approve",
      logoUrl: logoUrl("t1", "s1")}, ADMIN, NOW);
    assert.deepEqual(out, {sponsorId: "s1", logoStatus: "approved"});
    assert.deepEqual(sponsor(fake)["logoReviewedBy"], ADMIN);
    assert.equal(sponsor(fake)["logoRejectReason"], null);
  });

  it("recusa com motivo; o organizador reenvia e volta para análise", async () => {
    const {fake, db} = await withLogo();
    await reviewSponsorLogoCore(db, {tournamentId: "t1", sponsorId: "s1", decision: "reject",
      logoUrl: logoUrl("t1", "s1"), reason: "Fundo branco some na transmissão"}, ADMIN, NOW);
    assert.equal(sponsor(fake)["logoStatus"], "rejected");
    assert.equal(sponsor(fake)["logoRejectReason"], "Fundo branco some na transmissão");
    await saveSponsorCore(db, {tournamentId: "t1", action: "logo", sponsorId: "s1",
      logoUrl: logoUrl("t1", "s1", "v2")}, ORG, NOW);
    assert.equal(sponsor(fake)["logoStatus"], "review");
  });

  it("logo trocada no meio da análise não recebe a decisão da antiga", async () => {
    const {fake, db} = await withLogo();
    await saveSponsorCore(db, {tournamentId: "t1", action: "logo", sponsorId: "s1",
      logoUrl: logoUrl("t1", "s1", "v2")}, ORG, NOW);
    await assert.rejects(reviewSponsorLogoCore(db, {tournamentId: "t1", sponsorId: "s1", decision: "approve",
      logoUrl: logoUrl("t1", "s1")}, ADMIN, NOW), /foi trocada/);
    assert.equal(sponsor(fake)["logoStatus"], "review");
  });

  it("sem logo enviada não há o que aprovar; contrato fechado não aceita decisão", async () => {
    const {db} = await contracted();
    await saveSponsorCore(db, {tournamentId: "t1", action: "add", sponsorId: "s2", name: "Ótica", tierId: "prata"},
      ORG, NOW);
    await assert.rejects(reviewSponsorLogoCore(db, {tournamentId: "t1", sponsorId: "s2", decision: "approve",
      logoUrl: logoUrl("t1", "s2")}, ADMIN, NOW), /ainda não enviou/);
    await setContractStatusCore(db, {tournamentId: "t1", from: "requested", to: "cancelled", note: "Desistiu"},
      ADMIN, NOW);
    await assert.rejects(reviewSponsorLogoCore(db, {tournamentId: "t1", sponsorId: "s2", decision: "approve",
      logoUrl: logoUrl("t1", "s2")}, ADMIN, NOW), /não aceita mais/);
  });
});

describe("saveNexagoSponsorCore", () => {
  it("adiciona patrocinador da NexaGO com a logo já aprovada; o organizador não mexe nele", async () => {
    const {fake, db} = await contracted();
    const out = await saveNexagoSponsorCore(db, {tournamentId: "t1", action: "add", sponsorId: "nx1",
      name: " Pousada Sol ", tierId: "bronze", logoUrl: logoUrl("t1", "nx1")}, ADMIN, NOW);
    assert.deepEqual(out, {sponsorId: "nx1", logoStatus: "approved"});
    const s = fake.store.get("tournamentPlanContracts/t1/sponsors/nx1");
    assert.equal(s?.["name"], "Pousada Sol");
    assert.equal(s?.["source"], "nexago");
    assert.equal((s?.["tier"] as {priceCents: number}).priceCents, 50_00);
    await assert.rejects(saveSponsorCore(db, {tournamentId: "t1", action: "remove", sponsorId: "nx1"}, ORG, NOW),
      (e: {code?: string}) => e.code === "permission-denied");
  });

  it("divide o teto do nível com as cotas do organizador", async () => {
    const {db} = await contracted();
    await saveSponsorCore(db, {tournamentId: "t1", action: "add", sponsorId: "o1", name: "Um", tierId: "ouro"}, ORG, NOW);
    await saveNexagoSponsorCore(db, {tournamentId: "t1", action: "add", sponsorId: "nx1", name: "Dois", tierId: "ouro"},
      ADMIN, NOW);
    await assert.rejects(saveNexagoSponsorCore(db, {tournamentId: "t1", action: "add", sponsorId: "nx2", name: "Três",
      tierId: "ouro"}, ADMIN, NOW), /As 2 cotas Ouro/);
  });

  it("troca a logo e remove só o que é da NexaGO", async () => {
    const {fake, db} = await contracted();
    await saveNexagoSponsorCore(db, {tournamentId: "t1", action: "add", sponsorId: "nx1", name: "Pousada",
      tierId: "bronze"}, ADMIN, NOW);
    assert.equal(fake.store.get("tournamentPlanContracts/t1/sponsors/nx1")?.["logoStatus"], "missing");
    await saveNexagoSponsorCore(db, {tournamentId: "t1", action: "logo", sponsorId: "nx1",
      logoUrl: logoUrl("t1", "nx1")}, ADMIN, NOW);
    assert.equal(fake.store.get("tournamentPlanContracts/t1/sponsors/nx1")?.["logoStatus"], "approved");
    await assert.rejects(saveNexagoSponsorCore(db, {tournamentId: "t1", action: "logo", sponsorId: "nx1",
      logoUrl: logoUrl("t1", "outro")}, ADMIN, NOW), (e: {code?: string}) => e.code === "invalid-argument");

    await saveSponsorCore(db, {tournamentId: "t1", action: "add", sponsorId: "o1", name: "Ótica", tierId: "prata"},
      ORG, NOW);
    await assert.rejects(saveNexagoSponsorCore(db, {tournamentId: "t1", action: "remove", sponsorId: "o1"}, ADMIN, NOW),
      /indicado pelo organizador/);
    await saveNexagoSponsorCore(db, {tournamentId: "t1", action: "remove", sponsorId: "nx1"}, ADMIN, NOW);
    assert.equal(fake.store.has("tournamentPlanContracts/t1/sponsors/nx1"), false);
  });

  it("plano sem cotas não recebe patrocinador", async () => {
    const {fake, db} = await contracted();
    fake.seedDoc("tournamentPlanContracts/t1", {...contract(fake),
      sponsors: {enabled: false, organizerSharePct: 20, logoApproval: true, tiers: []}});
    await assert.rejects(saveNexagoSponsorCore(db, {tournamentId: "t1", action: "add", sponsorId: "nx1",
      name: "Pousada", tierId: "bronze"}, ADMIN, NOW), /não tem cotas/);
  });
});
