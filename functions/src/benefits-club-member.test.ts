import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {athleteBenefitCode, type Caller} from "./benefits-club";
import {
  answerBenefitUseCore,
  claimBenefitCore,
  getMyBenefitsCore,
  pendingQuestionOf,
  savingsOf,
  type BenefitUseView,
} from "./benefits-club-member";

const ATHLETE: Caller = {uid: "athlete1", isAdmin: false};
const AMB: Caller = {uid: "amb1", isAdmin: false};
const TESTER: Caller = {uid: "tester1", isAdmin: false};
const NOW = new Date("2026-11-16T15:00:00Z");
const HOUR = 3600 * 1000;
const ts = (ms: number) => Timestamp.fromMillis(ms);

const BASE = {name: "Fast Açaí", active: true, audience: "all", ctaType: "link", couponMode: "fixed", couponCode: "NEXAGO10"};

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc("partners/fast", BASE);
  fake.seedDoc("partners/athletecode", {...BASE, couponMode: "athlete", couponCode: null});
  fake.seedDoc("partners/nocoupon", {...BASE, couponMode: "none", couponCode: null});
  fake.seedDoc("partners/squad", {
    ...BASE,
    couponCode: null,
    requirement: {type: "squad"},
    requirementLabel: "Exclusivo para embaixadores do Squad",
  });
  fake.seedDoc("partnerPrivate/squad", {couponCode: "SQUAD20"});
  fake.seedDoc("partners/level", {...BASE, couponCode: null, requirement: {type: "min_level", minLevel: "open"}});
  fake.seedDoc("partners/future", {...BASE, startsAt: ts(NOW.getTime() + HOUR)});
  fake.seedDoc("partners/expired", {...BASE, validUntil: ts(NOW.getTime() - 1)});
  fake.seedDoc("partners/testers", {...BASE, audience: "testers", requirement: {type: "squad"}, couponCode: null});
  fake.seedDoc("partners/off", {...BASE, active: false, requirement: {type: "squad"}});
  fake.seedDoc("appConfig/benefitsClub", {enabled: true, testerUids: [TESTER.uid]});
  fake.seedDoc(`squadAmbassadors/${AMB.uid}`, {status: "active"});
  return {fake, db: fake as unknown as Firestore};
}

describe("claimBenefitCore", () => {
  it("cupom fixo público sem requisito", async () => {
    const {db} = makeDb();
    assert.deepEqual(await claimBenefitCore(db, ATHLETE, {partnerId: "fast"}, NOW), {coupon: "NEXAGO10"});
    assert.deepEqual(await claimBenefitCore(db, ATHLETE, {partnerId: "nocoupon"}, NOW), {coupon: null});
  });

  it("código do atleta e o vínculo em benefitCodes (sem duplicar o uid)", async () => {
    const {fake, db} = makeDb();
    const code = athleteBenefitCode(ATHLETE.uid);
    assert.equal(code, "NEXA-ATHL");
    assert.deepEqual(await claimBenefitCore(db, ATHLETE, {partnerId: "athletecode"}, NOW), {coupon: code});
    await claimBenefitCore(db, ATHLETE, {partnerId: "athletecode"}, NOW);
    const doc = fake.store.get(`benefitCodes/${code}`) as Record<string, unknown>;
    assert.deepEqual(doc["uids"], [ATHLETE.uid]);
    // Outro uid com o mesmo prefixo cai no mesmo código: fica ambíguo para o import.
    await claimBenefitCore(db, {uid: "athl-99", isAdmin: false}, {partnerId: "athletecode"}, NOW);
    assert.deepEqual((fake.store.get(`benefitCodes/${code}`) as Record<string, unknown>)["uids"], [ATHLETE.uid, "athl-99"]);
  });

  it("parceiro com requisito: quem cumpre recebe o cupom privado; quem não cumpre recebe a frase", async () => {
    const {db} = makeDb();
    assert.deepEqual(await claimBenefitCore(db, AMB, {partnerId: "squad"}, NOW), {coupon: "SQUAD20"});
    await assert.rejects(claimBenefitCore(db, ATHLETE, {partnerId: "squad"}, NOW), (error: {code?: string; message?: string}) => {
      assert.equal(error.code, "permission-denied");
      assert.equal(error.message, "Exclusivo para embaixadores do Squad");
      return true;
    });
    await assert.rejects(claimBenefitCore(db, ATHLETE, {partnerId: "level"}, NOW), /a partir do nível Open/);
  });

  it("desconto por elo: o cupom da faixa que o elo alcança; abaixo dela, o cupom-base", async () => {
    const {fake, db} = makeDb();
    const tiers = [
      {minRank: "COMPETIDOR", benefitHighlight: "15% OFF", benefitTitle: "15% para Competidor"},
      {minRank: "ELITE", benefitHighlight: "20% OFF", benefitTitle: "20% para Elite"},
    ];
    fake.seedDoc("partners/tiered", {...BASE, levelTiers: tiers});
    fake.seedDoc("partnerPrivate/tiered", {tierCoupons: {COMPETIDOR: "NEXA15", ELITE: "NEXA20"}});
    const claim = async (uid: string, sandRank?: Record<string, unknown>) => {
      if (sandRank) fake.seedDoc(`users/${uid}`, {sandRank});
      return claimBenefitCore(db, {uid, isAdmin: false}, {partnerId: "tiered"}, NOW);
    };
    assert.deepEqual(await claim("semElo"), {coupon: "NEXAGO10"});
    assert.deepEqual(await claim("ini", {code: "INICIANTE", trackIndex: 2}), {coupon: "NEXAGO10"});
    assert.deepEqual(await claim("comp", {code: "COMPETIDOR", trackIndex: 3}), {coupon: "NEXA15"});
    assert.deepEqual(await claim("desa", {code: "DESAFIANTE", trackIndex: 6}), {coupon: "NEXA15"});
    assert.deepEqual(await claim("lenda", {code: "LENDA", trackIndex: 15}), {coupon: "NEXA20"});
  });

  it("desconto por elo com requisito: confere o requisito e o base sai do privado", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("partners/squadtier", {
      ...BASE,
      couponCode: null,
      requirement: {type: "squad"},
      levelTiers: [{minRank: "ELITE", benefitHighlight: "30% OFF", benefitTitle: "30% para Elite"}],
    });
    fake.seedDoc("partnerPrivate/squadtier", {couponCode: "SQUAD20", tierCoupons: {ELITE: "SQUAD30"}});
    assert.deepEqual(await claimBenefitCore(db, AMB, {partnerId: "squadtier"}, NOW), {coupon: "SQUAD20"});
    fake.seedDoc(`users/${AMB.uid}`, {sandRank: {code: "ELITE", trackIndex: 9}});
    assert.deepEqual(await claimBenefitCore(db, AMB, {partnerId: "squadtier"}, NOW), {coupon: "SQUAD30"});
    fake.seedDoc(`users/${ATHLETE.uid}`, {sandRank: {code: "ELITE", trackIndex: 9}});
    await assert.rejects(claimBenefitCore(db, ATHLETE, {partnerId: "squadtier"}, NOW), /permission-denied|Exclusivo/);
  });

  it("faixa sem cupom cadastrado cai no cupom-base", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("partners/semcupom", {
      ...BASE,
      levelTiers: [{minRank: "COMPETIDOR", benefitHighlight: "15% OFF", benefitTitle: "15%"}],
    });
    fake.seedDoc(`users/${ATHLETE.uid}`, {sandRank: {code: "MESTRE", trackIndex: 12}});
    assert.deepEqual(await claimBenefitCore(db, ATHLETE, {partnerId: "semcupom"}, NOW), {coupon: "NEXAGO10"});
  });

  it("fora da validade, desligado ou de teste: não encontrado", async () => {
    const {db} = makeDb();
    for (const partnerId of ["future", "expired", "off", "testers", "nope"]) {
      await assert.rejects(claimBenefitCore(db, AMB, {partnerId}, NOW), /Parceiro não encontrado/);
    }
    await assert.rejects(claimBenefitCore(db, AMB, {partnerId: "../x"}, NOW), /Parceiro inválido/);
  });
});

describe("pendingQuestionOf", () => {
  const use = (partnerId: string, agoMs: number, over: Partial<BenefitUseView> = {}): BenefitUseView => ({
    partnerId,
    useCount: 1,
    firstUsedAt: NOW.getTime() - agoMs,
    lastUsedAt: NOW.getTime() - agoMs,
    lastAnswer: null,
    saved: false,
    ...over,
  });

  it("o uso mais recente entre 2 h e 7 dias, sem resposta", () => {
    assert.deepEqual(pendingQuestionOf([use("a", 3 * HOUR), use("b", 5 * HOUR)], NOW), {partnerId: "a"});
    assert.equal(pendingQuestionOf([use("a", HOUR)], NOW), null);
    assert.equal(pendingQuestionOf([use("a", 8 * 24 * HOUR)], NOW), null);
    assert.equal(pendingQuestionOf([use("a", 3 * HOUR, {lastAnswer: "used"})], NOW), null);
    assert.equal(pendingQuestionOf([use("a", 3 * HOUR, {useCount: 0})], NOW), null);
    assert.deepEqual(pendingQuestionOf([use("a", 2 * HOUR), use("b", 7 * 24 * HOUR)], NOW), {partnerId: "a"});
  });
});

describe("savingsOf", () => {
  it("soma só matched do próprio atleta, por parceiro", () => {
    const rows = [
      {partnerId: "fast", uid: "u", status: "matched", discountCents: 500},
      {partnerId: "fast", uid: "u", status: "matched", discountCents: 300},
      {partnerId: "linq", uid: "u", status: "matched", discountCents: 1000},
      {partnerId: "fast", uid: null, status: "ambiguous", discountCents: 9999},
      {partnerId: "fast", uid: "outro", status: "matched", discountCents: 9999},
    ];
    assert.deepEqual(savingsOf(rows, "u"), {
      confirmedCount: 3,
      totalDiscountCents: 1800,
      byPartner: [
        {partnerId: "linq", count: 1, discountCents: 1000},
        {partnerId: "fast", count: 2, discountCents: 800},
      ],
    });
    assert.deepEqual(savingsOf([], "u"), {confirmedCount: 0, totalDiscountCents: 0, byPartner: []});
  });
});

describe("getMyBenefitsCore", () => {
  it("usos em ms, pergunta pendente, economia confirmada e parceiros liberados", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc(`users/${AMB.uid}/benefits/fast`, {
      saved: true,
      savedAt: ts(NOW.getTime() - 10 * HOUR),
      useCount: 2,
      firstUsedAt: ts(NOW.getTime() - 9 * HOUR),
      lastUsedAt: ts(NOW.getTime() - 3 * HOUR),
      lastAnswer: null,
    });
    fake.seedDoc(`users/${AMB.uid}/benefits/level`, {saved: true, savedAt: ts(NOW.getTime() - HOUR)});
    fake.seedDoc("benefitRedemptions/fast_1", {partnerId: "fast", uid: AMB.uid, status: "matched", discountCents: 450});
    fake.seedDoc("benefitRedemptions/fast_2", {partnerId: "fast", uid: null, status: "unmatched", discountCents: 450});
    fake.seedDoc("benefitRedemptions/fast_3", {partnerId: "fast", uid: ATHLETE.uid, status: "matched", discountCents: 450});

    const view = await getMyBenefitsCore(db, AMB, NOW);
    assert.deepEqual(view.uses, [
      {
        partnerId: "fast",
        useCount: 2,
        firstUsedAt: NOW.getTime() - 9 * HOUR,
        lastUsedAt: NOW.getTime() - 3 * HOUR,
        lastAnswer: null,
        saved: true,
      },
      {partnerId: "level", useCount: 0, firstUsedAt: null, lastUsedAt: null, lastAnswer: null, saved: true},
    ]);
    assert.deepEqual(view.pendingQuestion, {partnerId: "fast"});
    assert.deepEqual(view.savings, {
      confirmedCount: 1,
      totalDiscountCents: 450,
      byPartner: [{partnerId: "fast", count: 1, discountCents: 450}],
    });
    // Squad sim; nível Open não; o de teste e o desligado nem entram.
    assert.deepEqual(view.eligiblePartnerIds, ["squad"]);
  });

  it("quem testa vê o parceiro de teste liberado quando cumpre; sem nada, tudo vazio", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc(`squadAmbassadors/${TESTER.uid}`, {status: "active"});
    assert.deepEqual((await getMyBenefitsCore(db, TESTER, NOW)).eligiblePartnerIds, ["squad", "testers"]);
    const empty = await getMyBenefitsCore(db, ATHLETE, NOW);
    assert.deepEqual(empty.uses, []);
    assert.equal(empty.pendingQuestion, null);
    assert.equal(empty.savings.confirmedCount, 0);
    assert.deepEqual(empty.eligiblePartnerIds, []);
  });
});

describe("answerBenefitUseCore", () => {
  it("grava a resposta e o evento use_confirmed / use_denied", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc(`users/${ATHLETE.uid}/benefits/fast`, {saved: false, useCount: 1, lastAnswer: null});
    assert.deepEqual(await answerBenefitUseCore(db, ATHLETE, {partnerId: "fast", used: true, platform: "ios"}, NOW), {ok: true});
    const doc = fake.store.get(`users/${ATHLETE.uid}/benefits/fast`) as Record<string, unknown>;
    assert.equal(doc["lastAnswer"], "used");
    assert.deepEqual(doc["answeredAt"], Timestamp.fromDate(NOW));
    await answerBenefitUseCore(db, ATHLETE, {partnerId: "fast", used: false}, new Date(NOW.getTime() + 1000));
    assert.equal((fake.store.get(`users/${ATHLETE.uid}/benefits/fast`) as Record<string, unknown>)["lastAnswer"], "not_used");
    const events = [...fake.store.entries()].filter(([p]) => p.startsWith("benefitEvents/")).map(([, d]) => d);
    assert.deepEqual(events.map((e) => [e["type"], e["source"], e["platform"]]), [
      ["use_confirmed", "my_benefits", "ios"],
      ["use_denied", "my_benefits", "unknown"],
    ]);
  });

  it("sem uso não há o que responder; resposta precisa ser booleana", async () => {
    const {db} = makeDb();
    await assert.rejects(answerBenefitUseCore(db, ATHLETE, {partnerId: "fast", used: true}, NOW), /ainda não usou/);
    await assert.rejects(answerBenefitUseCore(db, ATHLETE, {partnerId: "fast", used: "sim"}, NOW), /Resposta inválida/);
  });
});
