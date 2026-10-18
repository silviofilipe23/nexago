import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  athletePackage,
  inviteViewCore,
  levelFor,
  mySquadCore,
  squadPoints,
  squadRankingCore,
  weekStartKey,
} from "./squad-athlete";
import {DEFAULT_SQUAD_RULES} from "./squad-rules";

// Sexta, 17/10/2026 12:00 em São Paulo.
const NOW = new Date("2026-10-17T15:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

function setup() {
  const fake = new FakeFirestore();
  const db = fake as unknown as Firestore;
  return {fake, db};
}

function seedContract(fake: FakeFirestore, uid: string, extra: Record<string, unknown> = {}) {
  fake.seedDoc(`squadAmbassadors/${uid}`, {
    displayName: uid === "jv" ? "João Victor" : `Embaixador ${uid}`,
    tier: "ath", code: uid.toUpperCase() + "10", commissionPct: 5, followerDiscountPct: 10,
    rulesVersion: 1, status: "active", start: new Date("2026-09-08T03:00:00Z"),
    end: new Date("2026-12-07T02:59:59Z"), cycleId: "piloto", amendments: [],
    pauseReason: "motivo interno", endNote: "nota interna", ...extra,
  });
}

let seq = 0;
function seedCommission(fake: FakeFirestore, ambassadorId: string, status: string, extra: Record<string, unknown> = {}) {
  seq += 1;
  fake.seedDoc(`squadCommissions/c${seq}`, {
    ambassadorId, status, amountCents: 1200, grossCents: 12000, netCents: 11500, convertedAthleteIds: ["a"],
    convertedLabel: `Atleta ${seq}.`, tournamentName: "Open Errejota", categoryName: "Masc. C", origin: "code",
    registeredAt: day(2), releasedAt: status === "released" || status === "paid" ? day(1) : null,
    payoutId: status === "paid" ? "2026-10-06" : null, cancelReason: null, cancelNote: null, ...extra,
  });
}

describe("pontos e nível", () => {
  it("soma conversões, eventos e conteúdo pelos pesos das regras", () => {
    assert.equal(squadPoints({conversions: 27}, DEFAULT_SQUAD_RULES.points), 1080);
    assert.equal(squadPoints({conversions: 2, events: 1, content: 3}, DEFAULT_SQUAD_RULES.points), 130);
  });

  it("nível é o maior mínimo alcançado", () => {
    const levels = DEFAULT_SQUAD_RULES.points.levels;
    assert.equal(levelFor(0, levels), "Bronze");
    assert.equal(levelFor(999, levels), "Silver");
    assert.equal(levelFor(1000, levels), "Gold");
    assert.equal(levelFor(5000, levels), "Elite");
  });

  it("semana começa na segunda", () => {
    assert.equal(weekStartKey("2026-10-17"), "2026-10-12");
    assert.equal(weekStartKey("2026-10-12"), "2026-10-12");
    assert.equal(weekStartKey("2026-10-11"), "2026-10-05");
  });
});

describe("pacote do atleta", () => {
  it("não leva custo do kit, SKU, teto de cachê nem o teto oculto das inscrições grátis", () => {
    const pro = athletePackage("pro", DEFAULT_SQUAD_RULES.tiers.pro);
    assert.deepEqual(pro.commissionPct, [10, 15]);
    assert.deepEqual(pro.registrations, {type: "freeUnlimited", value: null});
    assert.equal(pro.campaignFee, true);
    assert.equal(pro.partnerHalfOff, true);
    const keys = Object.keys(pro);
    for (const internal of ["kitCostCents", "kitSku", "campaignFeeCapCents"]) {
      assert.ok(!keys.includes(internal), `${internal} vazou`);
    }
    assert.equal(athletePackage("pro", DEFAULT_SQUAD_RULES.tiers.pro, 12).commissionPct, 12);
    assert.equal(athletePackage("cap", DEFAULT_SQUAD_RULES.tiers.cap).tournamentOriginBonusCents, 50_00);
    assert.deepEqual(athletePackage("amb", DEFAULT_SQUAD_RULES.tiers.amb).registrations, {type: "freePerMonth", value: 1});
  });
});

describe("getMySquad", () => {
  it("sem contrato: devolve o convite enviado/aberto e dentro do prazo", async () => {
    const {fake, db} = setup();
    fake.seedDoc("squadInvites/old", {athleteId: "caio", tier: "ath", status: "expired", sentAt: day(20)});
    fake.seedDoc("squadInvites/late", {athleteId: "caio", tier: "amb", status: "sent", sentAt: day(9), expiresAt: day(2)});
    fake.seedDoc("squadInvites/sched", {athleteId: "caio", tier: "pro", status: "scheduled", sentAt: null});
    let view = await mySquadCore(db, "caio", NOW);
    assert.equal(view.member, null);
    assert.equal(view.invite, null, "vencido e agendado não aparecem");

    fake.seedDoc("squadInvites/open", {athleteId: "caio", tier: "amb", status: "opened", sentAt: day(1), expiresAt: day(-6)});
    fake.seedDoc("squadInvites/other", {athleteId: "outro", tier: "cap", status: "sent", sentAt: day(1), expiresAt: day(-6)});
    view = await mySquadCore(db, "caio", NOW);
    assert.equal(view.invite?.id, "open");
    assert.equal(view.invite?.tierLabel, "Ambassador");
  });

  it("contrato encerrado não é membro", async () => {
    const {fake, db} = setup();
    seedContract(fake, "jv", {status: "ended"});
    assert.equal((await mySquadCore(db, "jv", NOW)).member, null);
  });

  it("ganhos, conversões e extrato do ciclo atual", async () => {
    const {fake, db} = setup();
    seedContract(fake, "jv");
    seedCommission(fake, "jv", "pending");
    seedCommission(fake, "jv", "released", {amountCents: 1400, grossCents: 14000, convertedAthleteIds: ["a", "b"]});
    seedCommission(fake, "jv", "released", {amountCents: 1400, grossCents: 14000, payoutId: "2026-10-20"});
    seedCommission(fake, "jv", "paid", {amountCents: 1200});
    seedCommission(fake, "jv", "canceled", {cancelReason: "refund", cancelNote: "nota do time"});
    seedCommission(fake, "jv", "canceled", {cancelReason: "payment_failed"});
    // Ciclo anterior (antes do início do contrato) e de outro embaixador: fora.
    seedCommission(fake, "jv", "paid", {registeredAt: new Date("2026-08-01T12:00:00Z"), amountCents: 9999});
    seedCommission(fake, "pedro", "released", {amountCents: 7777});
    fake.seedDoc("squadCommissionAdjustments/a1", {ambassadorId: "jv", amountCents: -200, payoutId: null});
    fake.seedDoc("squadCommissionAdjustments/a2", {ambassadorId: "jv", amountCents: -500, payoutId: "2026-10-06"});
    fake.seedDoc("squadWallets/jv/transactions/2026-10-06", {amountCents: 1200, createdAt: day(11)});
    fake.seedDoc("squadWallets/jv/transactions/2026-08-20", {amountCents: 9999, createdAt: new Date("2026-08-20T12:00:00Z")});

    const m = (await mySquadCore(db, "jv", NOW)).member!;
    assert.equal(m.code, "JV10");
    assert.equal(m.tierLabel, "Athlete");
    assert.equal(m.earnings.pendingCents, 1200);
    assert.equal(m.earnings.availableCents, 1400 - 200, "liberada sem repasse, menos o ajuste em aberto");
    assert.equal(m.earnings.receivedCents, 1200, "carteira só do ciclo");
    assert.equal(m.earnings.totalCents, 1200 + 1400 + 1400 + 1200);
    assert.equal(m.earnings.revenueCents, 14000 + 14000 + 12000);
    assert.equal(m.earnings.nextPayoutDate, "2026-10-20");
    assert.equal(m.earnings.minPayoutCents, 20_00);
    assert.equal(m.conversions, 3);
    assert.equal(m.athletes, 4);
    assert.equal(m.commissions.length, 5, "PIX vencido não entra");
    const canceled = m.commissions.find((c) => c.status === "canceled")!;
    assert.equal(canceled.cancelReason, "refund");
    assert.ok(!JSON.stringify(m).includes("nota do time"), "nota interna não sai");
    assert.ok(!JSON.stringify(m).includes("motivo interno"), "motivo de pausa não sai");
    assert.deepEqual(m.payouts.map((p) => p.id), ["2026-10-06"]);
    assert.equal(m.weekly.length, 6);
    assert.equal(m.weekly[5]!.weekStart, "2026-10-12");
    assert.equal(m.weekly[5]!.cents, 1400 + 1400 + 1200);
    assert.equal(m.points.total, 3 * 40);
    assert.equal(m.points.level, "Bronze");
    assert.deepEqual(
      {to: m.progress?.toTier, conv: m.progress?.conversions, min: m.progress?.minConversions},
      {to: "amb", conv: 3, min: 10},
    );
    assert.equal(m.nextPackage?.tier, "amb");
    assert.equal(m.package.commissionPct, 5);
    assert.equal(m.followerDiscountFirstOnly, true);
  });

  it("Pro e Captain não têm próxima promoção; aditivo pendente vem com o pacote novo", async () => {
    const {fake, db} = setup();
    seedContract(fake, "jv", {tier: "pro", commissionPct: 12});
    assert.equal((await mySquadCore(db, "jv", NOW)).member!.progress, null);

    seedContract(fake, "cap1", {
      tier: "cap",
      amendments: [
        {toTier: "amb", commissionPct: 10, followerDiscountPct: 10, rulesVersion: 1, at: day(3), acceptedAt: day(2), canceledAt: null},
        {toTier: "pro", commissionPct: 13, followerDiscountPct: 15, rulesVersion: 1, at: day(1), acceptedAt: null, canceledAt: null,
          reason: "texto interno do aditivo"},
      ],
    });
    const m = (await mySquadCore(db, "cap1", NOW)).member!;
    assert.equal(m.progress, null);
    assert.equal(m.pendingAmendment?.package.tier, "pro");
    assert.equal(m.pendingAmendment?.package.commissionPct, 13);
    assert.ok(!JSON.stringify(m).includes("texto interno"), "motivo do aditivo é interno");
  });

  it("pausado continua membro, com a data de retorno", async () => {
    const {fake, db} = setup();
    seedContract(fake, "jv", {status: "paused", pausedUntil: "2026-11-01"});
    const m = (await mySquadCore(db, "jv", NOW)).member!;
    assert.equal(m.status, "paused");
    assert.equal(m.pausedUntil, "2026-11-01");
  });
});

describe("getSquadRanking", () => {
  it("ordena por pontos, mostra quem subiu na semana e marca o próprio atleta", async () => {
    const {fake, db} = setup();
    seedContract(fake, "jv");
    seedContract(fake, "ana");
    seedContract(fake, "bruno", {status: "paused"});
    seedContract(fake, "novo", {start: day(2)});
    seedContract(fake, "fim", {status: "ended"});
    fake.seedDoc("users/ana", {profilePhotoUrl: "https://foto/ana.jpg"});
    // Há 7 dias: Ana 2, Bruno 1, JV 0. Agora: JV 4 (3 na semana), Ana 2, Bruno 1, Novo 1.
    for (let i = 0; i < 2; i++) seedCommission(fake, "ana", "paid", {releasedAt: day(10), registeredAt: day(11)});
    seedCommission(fake, "bruno", "released", {releasedAt: day(9), registeredAt: day(9)});
    seedCommission(fake, "jv", "paid", {releasedAt: day(20), registeredAt: day(21)});
    for (let i = 0; i < 3; i++) seedCommission(fake, "jv", "released", {releasedAt: day(1), registeredAt: day(2)});
    seedCommission(fake, "novo", "released", {releasedAt: day(1), registeredAt: day(1)});
    seedCommission(fake, "fim", "paid", {releasedAt: day(1)});
    seedCommission(fake, "jv", "pending");

    const view = await squadRankingCore(db, "jv", NOW);
    assert.deepEqual(view.entries.map((e) => [e.position, e.name, e.points]), [
      [1, "João Victor", 160],
      [2, "Embaixador ana", 80],
      [3, "Embaixador bruno", 40],
      [4, "Embaixador novo", 40],
    ]);
    assert.equal(view.me?.position, 1);
    assert.equal(view.me?.delta, 2, "era 3º há uma semana");
    assert.equal(view.entries[1]!.delta, -1);
    assert.equal(view.entries[3]!.delta, null, "assinou na semana");
    assert.equal(view.entries[1]!.photoUrl, "https://foto/ana.jpg");
    assert.equal(view.level, "Bronze");
  });

  it("só embaixador com contrato vivo vê o ranking", async () => {
    const {fake, db} = setup();
    await assert.rejects(squadRankingCore(db, "caio", NOW), /só para embaixadores/);
    seedContract(fake, "jv", {status: "ended"});
    await assert.rejects(squadRankingCore(db, "jv", NOW), /só para embaixadores/);
  });
});

describe("convite (app 06)", () => {
  it("traz o pacote vigente do nível, o código sugerido e o primeiro nome", async () => {
    const {fake, db} = setup();
    fake.seedDoc("users/caio", {fullName: "Caio Mendes Rocha"});
    fake.seedDoc("artifacts/volley-track-2dd3b/public/data/athleteRankings/caio", {tournamentsCount: 11});
    fake.seedDoc("squadInvites/i1", {
      athleteId: "caio", tier: "ath", commissionPct: null, suggestedCode: "CAIO10", status: "sent",
      periodStart: null, periodEnd: "2026-12-06", message: "A turma de quinta chamou atenção.", expiresAt: day(-5),
    });
    const v = await inviteViewCore(db, "caio", "i1", NOW);
    assert.equal(v.status, "sent");
    assert.equal(v.firstName, "Caio");
    assert.equal(v.tournaments, 11);
    assert.equal(v.suggestedCode, "CAIO10");
    assert.equal(v.package.commissionPct, 5);
    assert.deepEqual(v.package.registrations, {type: "discount", value: 20});
    assert.equal(v.periodEnd, "2026-12-06");
    assert.equal(v.followerDiscountFirstOnly, true);
  });

  it("vencido aparece como expirado; convite de outro atleta não existe", async () => {
    const {fake, db} = setup();
    fake.seedDoc("squadInvites/i1", {athleteId: "caio", tier: "pro", commissionPct: 12, status: "opened", expiresAt: day(1)});
    const v = await inviteViewCore(db, "caio", "i1", NOW);
    assert.equal(v.status, "expired");
    assert.equal(v.package.commissionPct, 12);
    await assert.rejects(inviteViewCore(db, "outro", "i1", NOW), /não encontrado/);
  });
});
