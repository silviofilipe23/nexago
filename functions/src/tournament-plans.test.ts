import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  DEFAULT_PLANS,
  DEFAULT_RULES,
  DEFAULT_SPONSORS,
  effectivePlan,
  planErrors,
  saveSponsorsCore,
  savePlanRulesCore,
  saveTournamentPlanCore,
  sponsorsErrors,
  type TournamentPlan,
} from "./tournament-plans";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

const ACTOR = {uid: "admin1", name: "Lia Martins"};
// 18/10/2026 09:00 em São Paulo.
const NOW = new Date("2026-10-18T12:00:00Z");

function plan2(edit: (p: TournamentPlan) => void = () => undefined): TournamentPlan {
  const p = structuredClone(DEFAULT_PLANS[1].plan);
  edit(p);
  return p;
}

function fieldsOf(err: unknown): string[] {
  return ((err as {details?: {fields?: string[]}}).details?.fields) ?? [];
}

describe("planErrors", () => {
  it("os 4 planos padrão são válidos", () => {
    for (const d of DEFAULT_PLANS) assert.deepEqual(planErrors(d.plan), []);
  });

  it("acusa quadra fora de 1–8, preço fracionado e descrição longa", () => {
    const errors = planErrors(plan2((p) => {
      p.courts = 0;
      p.priceCents = 10.5;
      p.description = "x".repeat(101);
    }));
    assert.deepEqual(errors, ["courts", "description", "priceCents"]);
  });
});

describe("sponsorsErrors", () => {
  it("o padrão é válido e id repetido não passa", () => {
    assert.deepEqual(sponsorsErrors(DEFAULT_SPONSORS), []);
    const s = structuredClone(DEFAULT_SPONSORS);
    s.tiers[1].id = "bronze";
    assert.deepEqual(sponsorsErrors(s), ["tiers.1.id"]);
  });
});

describe("saveTournamentPlanCore", () => {
  it("publicar o padrão grava v1 (retrato) e v2, e loga a mudança", async () => {
    const {fake, db} = makeDb();
    const out = await saveTournamentPlanCore(db, {planId: "plano-2", action: "publish", version: 1,
      plan: plan2((p) => (p.priceCents = 2600_00))}, ACTOR, NOW);
    assert.equal(out.version, 2);
    assert.deepEqual(out.changes, ["Preço por evento"]);
    assert.equal(fake.store.get("tournamentPlans/plano-2/versions/1")?.["note"], "Padrão da tabela");
    assert.equal((fake.store.get("tournamentPlans/plano-2")?.["current"] as TournamentPlan).priceCents, 2600_00);
    const log = [...fake.store.entries()].filter(([k]) => k.startsWith("tournamentPlansLog/"));
    assert.equal(log.length, 1);
  });

  it("versão lida desatualizada é recusada", async () => {
    const {db} = makeDb();
    await saveTournamentPlanCore(db, {planId: "plano-2", action: "publish", version: 1,
      plan: plan2((p) => (p.hours = 12))}, ACTOR, NOW);
    await assert.rejects(
      saveTournamentPlanCore(db, {planId: "plano-2", action: "publish", version: 1,
        plan: plan2((p) => (p.hours = 11))}, ACTOR, NOW),
      (e: {code?: string}) => e.code === "failed-precondition",
    );
  });

  it("sem diferença não publica", async () => {
    const {db} = makeDb();
    await assert.rejects(
      saveTournamentPlanCore(db, {planId: "plano-2", action: "publish", version: 1, plan: plan2()}, ACTOR, NOW),
      /Nenhuma alteração/,
    );
  });

  it("agendado fica em next e vira o vigente no dia", async () => {
    const {fake, db} = makeDb();
    const out = await saveTournamentPlanCore(db, {planId: "plano-2", action: "publish", version: 1,
      plan: plan2((p) => (p.priceCents = 2600_00)), effectiveFrom: "2026-11-01"}, ACTOR, NOW);
    assert.equal(out.current?.priceCents, 2500_00);
    assert.equal(out.next?.effectiveFrom, "2026-11-01");
    assert.equal(effectivePlan(out.current, out.next, "2026-10-31")?.priceCents, 2500_00);
    assert.equal(effectivePlan(out.current, out.next, "2026-11-01")?.priceCents, 2600_00);

    // Depois do dia, a próxima gravação dobra o agendado no vigente.
    const later = new Date("2026-11-02T12:00:00Z");
    const draft = await saveTournamentPlanCore(db, {planId: "plano-2", action: "draft", version: 2,
      plan: plan2((p) => (p.priceCents = 2700_00))}, ACTOR, later);
    assert.equal(draft.current?.priceCents, 2600_00);
    assert.equal(draft.next, null);
    assert.equal(fake.store.get("tournamentPlans/plano-2")?.["version"], 2);
  });

  it("agendar para hoje ou antes é inválido", async () => {
    const {db} = makeDb();
    await assert.rejects(
      saveTournamentPlanCore(db, {planId: "plano-2", action: "publish", version: 1,
        plan: plan2((p) => (p.priceCents = 1)), effectiveFrom: "2026-10-18"}, ACTOR, NOW),
      (e) => fieldsOf(e).includes("effectiveFrom"),
    );
  });

  it("rascunho não muda a versão; descartar limpa", async () => {
    const {fake, db} = makeDb();
    const d = await saveTournamentPlanCore(db, {planId: "plano-1", action: "draft", version: 1,
      plan: structuredClone({...DEFAULT_PLANS[0].plan, hours: 8})}, ACTOR, NOW);
    assert.equal(d.version, 1);
    assert.equal(d.draft?.hours, 8);
    const x = await saveTournamentPlanCore(db, {planId: "plano-1", action: "discardDraft", version: 1}, ACTOR, NOW);
    assert.equal(x.draft, null);
    assert.equal(fake.store.get("tournamentPlans/plano-1")?.["draft"], null);
  });

  it("plano novo nasce na v1 depois dos padrões; descartar o rascunho apaga", async () => {
    const {fake, db} = makeDb();
    const p = plan2((x) => {
      x.name = "Plano 5";
      x.courts = 5;
    });
    const draft = await saveTournamentPlanCore(db, {planId: null, action: "draft", version: 0, plan: p}, ACTOR, NOW);
    assert.equal(draft.version, 0);
    assert.equal(fake.store.get(`tournamentPlans/${draft.planId}`)?.["order"], 5);
    await saveTournamentPlanCore(db, {planId: draft.planId, action: "discardDraft", version: 0}, ACTOR, NOW);
    assert.equal(fake.store.has(`tournamentPlans/${draft.planId}`), false);

    const pub = await saveTournamentPlanCore(db, {planId: null, action: "publish", version: 0, plan: p}, ACTOR, NOW);
    assert.equal(pub.version, 1);
    assert.deepEqual(pub.changes, ["Plano criado"]);
  });

  it("narrador sem transmissão é desligado", async () => {
    const {db} = makeDb();
    const out = await saveTournamentPlanCore(db, {planId: "plano-3", action: "publish", version: 1,
      plan: {...structuredClone(DEFAULT_PLANS[2].plan), live: false}}, ACTOR, NOW);
    assert.equal(out.current?.narrator, false);
  });
});

describe("configs", () => {
  it("estrutura financeira: v1 padrão + v2", async () => {
    const {fake, db} = makeDb();
    const out = await savePlanRulesCore(db, {rules: {...DEFAULT_RULES, courtCostCents: 600_00}, version: 1},
      ACTOR, NOW);
    assert.equal(out.version, 2);
    assert.deepEqual(out.changes, ["Custo por quadra"]);
    assert.ok(fake.store.has("tournamentPlansConfig/rules/versions/1"));
  });

  it("sponsors: mudança de cota e de repasse aparecem nas mudanças", async () => {
    const {db} = makeDb();
    const s = structuredClone(DEFAULT_SPONSORS);
    s.tiers[2].priceCents = 250_00;
    s.organizerSharePct = 25;
    const out = await saveSponsorsCore(db, {sponsors: s, version: 1}, ACTOR, NOW);
    assert.deepEqual(out.changes, ["Cota Ouro", "Repasse ao organizador"]);
    await assert.rejects(saveSponsorsCore(db, {sponsors: s, version: 1}, ACTOR, NOW),
      (e: {code?: string}) => e.code === "failed-precondition");
  });
});
