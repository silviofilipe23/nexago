import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  athleteStatusOf,
  mySquadViewCore,
  publicApplicationStatus,
  publicPackage,
  squadPoints,
  squadPromotion,
  squadRanking,
  squadTotals,
  type AmbassadorView,
  type CandidateView,
  type CommissionInput,
} from "./squad-athlete";
import {DEFAULT_SQUAD_RULES} from "./squad-rules";

process.env.GCLOUD_PROJECT = "p";

const NOW = new Date("2026-10-17T15:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

function commission(over: Partial<CommissionInput>): CommissionInput {
  return {
    id: "c",
    status: "released",
    registeredAt: daysAgo(3),
    releasedAt: daysAgo(2),
    payoutId: null,
    holdPayoutDate: null,
    amountCents: 12_00,
    grossCents: 120_00,
    convertedAthleteIds: ["a1"],
    ...over,
  };
}

describe("pontos, pacote e candidatura", () => {
  it("pontos = conversões × perConversion (+ presença e conteúdo)", () => {
    const p = DEFAULT_SQUAD_RULES.points;
    assert.equal(squadPoints(p, {conversions: 27, events: 0, content: 0}), 1080);
    assert.equal(squadPoints(p, {conversions: 27, events: 5, content: 10}), 1080 + 100 + 100);
  });

  it("pacote público esconde custo, SKU e o teto do ilimitado", () => {
    const pro = publicPackage(DEFAULT_SQUAD_RULES.tiers.pro);
    assert.deepEqual(pro.commissionPct, [10, 15]);
    assert.deepEqual(pro.registrations, {type: "freeUnlimited", value: null});
    assert.equal(pro.campaignFee, true);
    assert.equal(pro.tournamentOriginBonusCents, null);
    assert.ok(!("kitCostCents" in pro) && !("kitSku" in pro) && !("campaignFeeCapCents" in pro));
    const cap = publicPackage(DEFAULT_SQUAD_RULES.tiers.cap);
    assert.equal(cap.tournamentOriginBonusCents, 50_00);
    assert.deepEqual(cap.registrations, {type: "freePerMonth", value: 1});
  });

  it("status da candidatura nunca expõe o motivo interno", () => {
    assert.equal(publicApplicationStatus("new", ""), "review");
    assert.equal(publicApplicationStatus("review", ""), "review");
    assert.equal(publicApplicationStatus("invited", ""), "invited");
    assert.equal(publicApplicationStatus("archived", "waitlist"), "waitlist");
    assert.equal(publicApplicationStatus("archived", "rejected"), "rejected");
    assert.equal(publicApplicationStatus("archived", "expired"), null);
    assert.equal(publicApplicationStatus("archived", "accepted"), null);
  });
});

describe("ranking por pontos", () => {
  const list = [
    {uid: "jv", name: "João V.", points: 1280, pointsWeekAgo: 1000},
    {uid: "mr", name: "Marcos R.", points: 1240, pointsWeekAgo: 1200},
    {uid: "rb", name: "Rayssa B.", points: 1180, pointsWeekAgo: 1180},
    {uid: "pl", name: "Pedro L.", points: 1100, pointsWeekAgo: 900},
    {uid: "vs", name: "Varoni S.", points: 1060, pointsWeekAgo: 1060},
    {uid: "cm", name: "Carla M.", points: 200, pointsWeekAgo: 1300},
  ];

  it("ordena por pontos e a seta compara com 7 dias atrás", () => {
    const rows = squadRanking(list, "jv");
    assert.deepEqual(rows.map((r) => r.name), ["João V.", "Marcos R.", "Rayssa B.", "Pedro L.", "Varoni S."]);
    // Uma semana atrás: Carla 1º, Marcos 2º, Rayssa 3º, Varoni 4º, João 5º, Pedro 6º.
    assert.deepEqual(rows.map((r) => r.delta), [4, 0, 0, 2, -1]);
    assert.equal(rows[0]!.me, true);
  });

  it("quem está fora do top entra no fim, com a posição real", () => {
    const rows = squadRanking(list, "cm");
    assert.equal(rows.length, 6);
    assert.deepEqual(rows[5], {position: 6, name: "Carla M.", points: 200, delta: -5, me: true});
  });
});

describe("totais do embaixador", () => {
  it("separa liberada, retida, pendente, paga e cancelada", () => {
    const totals = squadTotals({
      commissions: [
        commission({id: "pend", status: "pending", releasedAt: null, amountCents: 12_00}),
        commission({id: "lib", amountCents: 14_00, grossCents: 140_00, convertedAthleteIds: ["a2", "a3"]}),
        commission({id: "held", amountCents: 10_00, grossCents: 100_00, holdPayoutDate: "2026-10-20"}),
        commission({id: "paid", status: "paid", payoutId: "2026-10-06", releasedAt: new Date("2026-09-30T15:00:00Z"), amountCents: 18_00}),
        commission({id: "canc", status: "canceled", amountCents: 99_00}),
      ],
      openAdjustmentsCents: -5_00,
      wallet: [{amountCents: 180_00, at: new Date("2026-10-06T12:00:00Z")}],
      openPayout: "2026-10-20",
      now: NOW,
    });
    assert.equal(totals.earnedCents, 14_00 + 10_00 + 18_00);
    assert.equal(totals.availableCents, 14_00 - 5_00);
    assert.equal(totals.heldCents, 10_00);
    assert.equal(totals.pendingCents, 12_00);
    assert.equal(totals.pendingCount, 1);
    assert.equal(totals.receivedCents, 180_00);
    assert.equal(totals.lastPayoutAt, "2026-10-06T12:00:00.000Z");
    assert.equal(totals.conversions, 3);
    assert.equal(totals.athletes, 3);
    // A paga confirmou em setembro.
    assert.equal(totals.monthConversions, 2);
    assert.equal(totals.grossCents, 140_00 + 100_00 + 120_00);
  });

  it("retenção de outro repasse não vale para o aberto", () => {
    assert.equal(athleteStatusOf({status: "released", payoutId: null, holdPayoutDate: "2026-10-06"}, "2026-10-20"), "released");
    assert.equal(athleteStatusOf({status: "released", payoutId: null, holdPayoutDate: "2026-10-20"}, "2026-10-20"), "held");
  });
});

describe("promoção", () => {
  it("Ambassador → Pro: conversões e checklist, nunca o ROI", () => {
    const p = squadPromotion({tier: "amb", conversions: 27, rules: DEFAULT_SQUAD_RULES, evaluation: "2026-12-06"});
    assert.equal(p.kind, "promotion");
    if (p.kind !== "promotion") return;
    assert.equal(p.to, "pro");
    assert.equal(p.min, 30);
    assert.deepEqual(p.checklist, ["Influência relevante", "Participação consistente"]);
    assert.ok(!JSON.stringify(p).toLowerCase().includes("roi"));
  });

  it("Pro está no topo e Captain é paralelo", () => {
    assert.deepEqual(squadPromotion({tier: "pro", conversions: 50, rules: DEFAULT_SQUAD_RULES, evaluation: null}), {kind: "top"});
    assert.deepEqual(squadPromotion({tier: "cap", conversions: 50, rules: DEFAULT_SQUAD_RULES, evaluation: null}), {kind: "captain"});
  });
});

function seedAmbassador(fake: FakeFirestore) {
  fake.seedDoc("users/jv", {fullName: "João Victor"});
  fake.seedDoc("squadAmbassadors/jv", {
    athleteId: "jv", displayName: "João Victor", tier: "amb", code: "JOAO10", commissionPct: 10,
    followerDiscountPct: 10, rulesVersion: 1, status: "active",
    start: new Date("2026-09-08T03:00:00Z"), end: new Date("2026-12-07T02:59:59Z"),
    pauseReason: "segredo do time", endNote: "nota interna",
    amendments: [{fromTier: "amb", toTier: "pro", reason: "motivo interno", by: {uid: "adm", name: "Lia"}, at: daysAgo(1)}],
  });
  fake.seedDoc("squadAmbassadors/mr", {displayName: "Marcos Reis", tier: "cap", code: "MARCOS10", status: "active"});
  fake.seedDoc("squadAmbassadors/old", {displayName: "Ex Embaixador", tier: "amb", code: "OLD10", status: "ended"});
  const base = {
    ambassadorId: "jv", tournamentName: "Open Errejota", categoryName: "Masc. C", origin: "code",
    payerUid: "payer", feeCents: 300, timeline: [{event: "hold", by: {name: "Lia"}, note: "suspeita"}],
  };
  fake.seedDoc("squadCommissions/c1", {
    ...base, status: "pending", convertedLabel: "Lucas M.", grossCents: 120_00, amountCents: 12_00,
    registeredAt: daysAgo(0), releasedAt: null,
  });
  fake.seedDoc("squadCommissions/c2", {
    ...base, status: "released", convertedLabel: "Tatiane R.", origin: "link", grossCents: 140_00, amountCents: 14_00,
    registeredAt: daysAgo(1), releasedAt: daysAgo(1), hold: {payoutDate: "2026-10-20", reason: "checar"},
  });
  fake.seedDoc("squadCommissions/c3", {
    ...base, status: "paid", convertedLabel: "Paula N.", origin: "qr", grossCents: 140_00, amountCents: 14_00,
    registeredAt: daysAgo(12), releasedAt: daysAgo(12), payoutId: "2026-10-06",
  });
  fake.seedDoc("squadCommissions/c4", {
    ...base, status: "canceled", cancelReason: "refund", convertedLabel: "Henrique A.", grossCents: 100_00,
    amountCents: 10_00, registeredAt: daysAgo(4), releasedAt: daysAgo(4), cancelNote: "nota interna",
  });
  fake.seedDoc("squadCommissions/m1", {ambassadorId: "mr", status: "released", releasedAt: daysAgo(10), amountCents: 10_00});
  fake.seedDoc("squadCommissions/m2", {ambassadorId: "mr", status: "paid", releasedAt: daysAgo(20), amountCents: 10_00});
  fake.seedDoc("squadCommissionAdjustments/c4_refund", {
    commissionId: "c4", ambassadorId: "jv", amountCents: -10_00, reason: "refund", note: "nota interna",
    payoutId: null, createdAt: daysAgo(4),
  });
  fake.seedDoc("squadWallets/jv", {balanceCents: 14_00});
  fake.seedDoc("squadWallets/jv/transactions/2026-10-06", {
    type: "squad_commission", amountCents: 14_00, label: "Repasse de 06/10 · indicações", createdAt: new Date("2026-10-06T12:00:00Z"),
  });
  fake.seedDoc("squadPayouts/2026-10-06", {status: "done"});
  fake.seedDoc("squadAttributions/f1", {ambassadorId: "jv", code: "JOAO10", origin: "link"});
  fake.seedDoc("squadAttributions/f2", {ambassadorId: "jv", code: "JOAO10", origin: "qr"});
  fake.seedDoc("squadAttributions/f3", {ambassadorId: "mr", code: "MARCOS10", origin: "qr"});
}

describe("getMySquadView", () => {
  it("embaixador: números, extrato saneado, ranking e promoção", async () => {
    const fake = new FakeFirestore();
    seedAmbassador(fake);
    const view = (await mySquadViewCore(fake as unknown as Firestore, "jv", NOW)) as AmbassadorView;
    assert.equal(view.kind, "ambassador");
    assert.equal(view.contract.code, "JOAO10");
    assert.equal(view.contract.pendingTier, "pro");
    assert.equal(view.payout.nextDate, "2026-10-20");
    assert.equal(view.totals.conversions, 2);
    assert.equal(view.totals.heldCents, 14_00);
    assert.equal(view.totals.availableCents, -10_00);
    assert.equal(view.totals.pendingCount, 1);
    assert.equal(view.totals.receivedCents, 14_00);
    assert.deepEqual(view.funnel, {clicks: null, signups: 2, registrations: 4, paid: 2});
    assert.deepEqual(view.commissions.map((c) => [c.id, c.status]), [["c1", "pending"], ["c2", "held"], ["c4", "canceled"], ["c3", "paid"]]);
    assert.equal(view.commissions[2]!.cancelReason, "refund");
    assert.deepEqual(view.adjustments, [{id: "c4_refund", at: daysAgo(4).toISOString(), amountCents: -10_00, athlete: "Henrique A."}]);
    assert.equal(view.points.total, 80);
    assert.equal(view.points.events, null);
    // Os dois têm 2 conversões; empate desempata pelo nome. O encerrado não entra.
    assert.equal(view.ranking.of, 2);
    assert.deepEqual(view.ranking.rows.map((r) => [r.name, r.points, r.me]), [["João V.", 80, true], ["Marcos R.", 80, false]]);
    assert.equal(view.promotion.kind, "promotion");

    // Nada do que é interno sai na resposta.
    const json = JSON.stringify(view);
    for (const secret of ["segredo do time", "nota interna", "motivo interno", "checar", "suspeita", "payer", "Lia", "feeCents", "score", "roi"]) {
      assert.ok(!json.toLowerCase().includes(secret.toLowerCase()), `vazou ${secret}`);
    }
  });

  it("candidato: perfil, candidatura em análise, convite em aberto e vagas", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("users/caio", {fullName: "Caio Teixeira", city: "Goiânia", state: "GO", mainArenaName: "Arena Errejota"});
    fake.seedDoc("squadApplications/a1", {
      athleteId: "caio", stage: "review", submittedAt: daysAgo(2), notes: [{text: "nota interna"}],
      internalReason: "motivo interno", suggestedTier: "cap",
    });
    fake.seedDoc("squadInvites/i1", {athleteId: "caio", status: "sent", tier: "amb", expiresAt: daysAgo(-5)});
    for (let i = 0; i < 20; i++) fake.seedDoc(`squadAmbassadors/x${i}`, {status: "active", tier: "ath", code: `X${i}AAA`});
    const view = (await mySquadViewCore(fake as unknown as Firestore, "caio", NOW)) as CandidateView;
    assert.equal(view.kind, "candidate");
    assert.equal(view.profile?.name, "Caio Teixeira");
    assert.equal(view.profile?.arenaName, "Arena Errejota");
    assert.deepEqual(view.application, {status: "review", submittedAt: daysAgo(2).toISOString()});
    assert.deepEqual(view.invite, {tier: "amb", expiresAt: daysAgo(-5).toISOString()});
    // 20 contratos + 1 convite enviado: piloto cheio, próximo ciclo em 07/12.
    assert.equal(view.seatsLeft, 0);
    assert.equal(view.nextCycleStart, "2026-12-07");
    assert.equal(view.followerDiscountPct, 10);
    const json = JSON.stringify(view);
    assert.ok(!json.includes("nota interna") && !json.includes("motivo interno") && !json.includes("cap"));
  });
});
