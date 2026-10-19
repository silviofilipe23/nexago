import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {DEFAULT_PLANS, DEFAULT_SPONSORS, type TournamentPlan} from "./tournament-plans";
import {
  balanceDueDateOf,
  cancelContractCore,
  cityKey,
  contractAmounts,
  isSponsorLogoUrl,
  loadCatalogCore,
  requestContractCore,
  saveSponsorCore,
  type PlanContract,
} from "./tournament-plan-contracts";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

const ORG = {uid: "org1", name: "Ana Organiza"};
// 19/10/2026 09:00 em São Paulo.
const NOW = new Date("2026-10-19T12:00:00Z");

function seedTournament(fake: FakeFirestore, id: string, edit: Record<string, unknown> = {}): void {
  fake.seedDoc(`tournaments/${id}`, {
    name: "Open Goiânia Beach",
    managerId: ORG.uid,
    status: "open",
    city: "Goiania",
    startAt: new Date("2026-11-28T12:00:00Z"),
    endAt: new Date("2026-11-30T12:00:00Z"),
    ...edit,
  });
}

function request(db: Firestore, tournamentId = "t1", planId = "plano-4", expectedPriceCents = 3500_00) {
  return requestContractCore(db, {tournamentId, planId, expectedPriceCents}, ORG, NOW);
}

function logoUrl(tournamentId: string, sponsorId: string): string {
  const path = encodeURIComponent(`tournaments/${tournamentId}/plan-sponsors/${sponsorId}`);
  return `https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/${path}?alt=media&token=abc`;
}

describe("loadCatalogCore", () => {
  it("sem nada gravado, devolve os 4 padrões e as cotas à venda, sem custo nem margem", async () => {
    const {db} = makeDb();
    const out = await loadCatalogCore(db, ORG.uid, NOW);
    assert.deepEqual(out.plans.map((p) => p.id), ["plano-1", "plano-2", "plano-3", "plano-4"]);
    assert.equal(out.plans[3].priceCents, 3500_00);
    assert.equal("status" in out.plans[0], false);
    assert.equal("maxPerDay" in out.plans[0], false);
    assert.deepEqual(out.sponsors.tiers.map((t) => t.id), ["bronze", "prata", "ouro"]);
    assert.equal(out.feePercent, 8);
    assert.equal(out.today, "2026-10-19");
  });

  it("esconde plano oculto, aplica o agendado no dia e respeita a comissão negociada", async () => {
    const {fake, db} = makeDb();
    const hidden: TournamentPlan = {...DEFAULT_PLANS[0].plan, status: "oculto"};
    fake.seedDoc("tournamentPlans/plano-1", {current: hidden, next: null, version: 2, order: 1});
    const p2 = DEFAULT_PLANS[1].plan;
    fake.seedDoc("tournamentPlans/plano-2", {current: p2, version: 2, order: 2,
      next: {plan: {...p2, priceCents: 2600_00}, version: 2, effectiveFrom: "2026-10-19"}});
    const sponsors = structuredClone(DEFAULT_SPONSORS);
    sponsors.tiers[0].onSale = false;
    fake.seedDoc("tournamentPlansConfig/sponsors", {sponsors, version: 2});
    fake.seedDoc(`organizers/${ORG.uid}`, {commissionPercent: 6});

    const out = await loadCatalogCore(db, ORG.uid, NOW);
    assert.deepEqual(out.plans.map((p) => p.id), ["plano-2", "plano-3", "plano-4"]);
    assert.equal(out.plans[0].priceCents, 2600_00);
    assert.deepEqual(out.sponsors.tiers.map((t) => t.id), ["prata", "ouro"]);
    assert.equal(out.feePercent, 6);
  });
});

describe("contas do contrato", () => {
  it("sinal arredonda e o saldo fecha o total", () => {
    assert.deepEqual(contractAmounts({priceCents: 3500_01, depositPct: 50}), {depositCents: 1750_01, balanceCents: 1750_00});
  });

  it("saldo vence N dias antes, mas nunca antes de hoje", () => {
    assert.equal(balanceDueDateOf("2026-11-28", 7, "2026-10-19"), "2026-11-21");
    assert.equal(balanceDueDateOf("2026-10-22", 7, "2026-10-19"), "2026-10-19");
  });

  it("cidade compara sem acento nem caixa", () => {
    assert.equal(cityKey(" Goiânia "), cityKey("goiania"));
  });
});

describe("requestContractCore", () => {
  it("congela o plano vigente, as contas e a config de cotas", async () => {
    const {fake, db} = makeDb();
    seedTournament(fake, "t1");
    const out = await request(db);
    assert.deepEqual(out, {tournamentId: "t1", status: "requested"});
    const c = fake.store.get("tournamentPlanContracts/t1") as unknown as PlanContract;
    assert.equal(c.organizerId, ORG.uid);
    assert.equal(c.planVersion, 1);
    assert.equal(c.plan.courts, 4);
    assert.equal(c.startDate, "2026-11-28");
    assert.equal(c.endDate, "2026-11-30");
    assert.equal(c.depositCents, 1750_00);
    assert.equal(c.balanceDueDate, "2026-11-21");
    assert.equal(c.sponsors.enabled, true);
    assert.equal(c.sponsors.organizerSharePct, 20);
  });

  it("só o dono do torneio contrata", async () => {
    const {fake, db} = makeDb();
    seedTournament(fake, "t1", {managerId: "outro"});
    await assert.rejects(request(db), (e: {code?: string}) => e.code === "permission-denied");
  });

  it("preço diferente do que a tela mostrou não passa", async () => {
    const {fake, db} = makeDb();
    seedTournament(fake, "t1");
    await assert.rejects(request(db, "t1", "plano-4", 3400_00), /mudou para R\$ 3\.500/);
  });

  it("antecedência mínima e cidade atendida", async () => {
    const {fake, db} = makeDb();
    seedTournament(fake, "cedo", {startAt: new Date("2026-11-01T12:00:00Z"), endAt: null});
    await assert.rejects(request(db, "cedo"), /21 dias de antecedência/);
    seedTournament(fake, "longe", {city: "Recife"});
    await assert.rejects(request(db, "longe"), /não atende Recife/);
  });

  it("um contrato ativo por evento; depois de cancelado, pode pedir de novo", async () => {
    const {fake, db} = makeDb();
    seedTournament(fake, "t1");
    await request(db);
    await assert.rejects(request(db), (e: {code?: string}) => e.code === "already-exists");
    await cancelContractCore(db, {tournamentId: "t1"}, ORG, NOW);
    assert.equal(fake.store.get("tournamentPlanContracts/t1")?.["status"], "cancelled");
    await request(db, "t1", "plano-3", 3000_00);
    assert.equal(fake.store.get("tournamentPlanContracts/t1")?.["planId"], "plano-3");
  });

  it("agenda cheia: o plano atende no máximo maxPerDay eventos em cada dia", async () => {
    const {fake, db} = makeDb();
    for (const id of ["ta", "tb", "tc", "td"]) seedTournament(fake, id);
    // O 4º evento cai no meio do período dos outros três.
    fake.seedDoc("tournaments/td", {...fake.store.get("tournaments/td"),
      startAt: new Date("2026-11-30T12:00:00Z"), endAt: new Date("2026-12-01T12:00:00Z")});
    await request(db, "ta");
    await request(db, "tb");
    await request(db, "tc");
    await assert.rejects(request(db, "td"), /cheia em 30\/11\/2026/);
    // Outro plano tem agenda própria.
    await request(db, "td", "plano-3", 3000_00);
  });

  it("cancelar só enquanto nada foi pago", async () => {
    const {fake, db} = makeDb();
    seedTournament(fake, "t1");
    await request(db);
    fake.seedDoc("tournamentPlanContracts/t1", {...fake.store.get("tournamentPlanContracts/t1"), status: "deposit_paid"});
    await assert.rejects(cancelContractCore(db, {tournamentId: "t1"}, ORG, NOW), /passa pela NexaGO/);
    await assert.rejects(cancelContractCore(db, {tournamentId: "t1"}, {uid: "x", name: "X"}, NOW),
      (e: {code?: string}) => e.code === "not-found");
  });
});

describe("saveSponsorCore", () => {
  async function contracted() {
    const made = makeDb();
    seedTournament(made.fake, "t1");
    await request(made.db);
    return made;
  }

  it("logo só do caminho do próprio patrocinador", () => {
    assert.equal(isSponsorLogoUrl(logoUrl("t1", "s1"), "t1", "s1"), true);
    assert.equal(isSponsorLogoUrl(logoUrl("t1", "s2"), "t1", "s1"), false);
    assert.equal(isSponsorLogoUrl("https://evil.com/o/x", "t1", "s1"), false);
  });

  it("adiciona sem logo (Enviar logo) e o logo entra em análise", async () => {
    const {fake, db} = await contracted();
    const add = await saveSponsorCore(db, {tournamentId: "t1", action: "add", sponsorId: "s1", name: " Açaí da Praia ",
      tierId: "ouro"}, ORG, NOW);
    assert.equal(add.logoStatus, "missing");
    const s = fake.store.get("tournamentPlanContracts/t1/sponsors/s1");
    assert.equal(s?.["name"], "Açaí da Praia");
    assert.equal((s?.["tier"] as {priceCents: number}).priceCents, 200_00);
    const logo = await saveSponsorCore(db, {tournamentId: "t1", action: "logo", sponsorId: "s1",
      logoUrl: logoUrl("t1", "s1")}, ORG, NOW);
    assert.equal(logo.logoStatus, "review");
  });

  it("respeita o máximo de cotas do nível", async () => {
    const {db} = await contracted();
    await saveSponsorCore(db, {tournamentId: "t1", action: "add", sponsorId: "o1", name: "Um", tierId: "ouro"}, ORG, NOW);
    await saveSponsorCore(db, {tournamentId: "t1", action: "add", sponsorId: "o2", name: "Dois", tierId: "ouro"}, ORG, NOW);
    await assert.rejects(
      saveSponsorCore(db, {tournamentId: "t1", action: "add", sponsorId: "o3", name: "Três", tierId: "ouro"}, ORG, NOW),
      /As 2 cotas Ouro/,
    );
  });

  it("patrocinador da NexaGO não é removido pelo organizador; o dele é", async () => {
    const {fake, db} = await contracted();
    fake.seedDoc("tournamentPlanContracts/t1/sponsors/nx", {name: "Pousada", tierId: "bronze", source: "nexago"});
    await assert.rejects(saveSponsorCore(db, {tournamentId: "t1", action: "remove", sponsorId: "nx"}, ORG, NOW),
      (e: {code?: string}) => e.code === "permission-denied");
    await saveSponsorCore(db, {tournamentId: "t1", action: "add", sponsorId: "s1", name: "Ótica", tierId: "prata"}, ORG, NOW);
    await saveSponsorCore(db, {tournamentId: "t1", action: "remove", sponsorId: "s1"}, ORG, NOW);
    assert.equal(fake.store.has("tournamentPlanContracts/t1/sponsors/s1"), false);
  });

  it("contrato cancelado ou de outro organizador não aceita cota", async () => {
    const {db} = await contracted();
    await assert.rejects(saveSponsorCore(db, {tournamentId: "t1", action: "add", sponsorId: "s1", name: "Ótica",
      tierId: "prata"}, {uid: "x", name: "X"}, NOW), (e: {code?: string}) => e.code === "not-found");
    await cancelContractCore(db, {tournamentId: "t1"}, ORG, NOW);
    await assert.rejects(saveSponsorCore(db, {tournamentId: "t1", action: "add", sponsorId: "s1", name: "Ótica",
      tierId: "prata"}, ORG, NOW), /não aceita mais/);
  });
});
