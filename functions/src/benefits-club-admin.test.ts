import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import type {Caller} from "./benefits-club";
import {
  MAX_IMPORT_ROWS,
  benefitPushLinks,
  endingLabel,
  importBenefitRedemptionsCore,
  matchRedemption,
  needsExpiryReminder,
  notifyBenefitPartnerCore,
  parseRedemptionRows,
  partnerPushMessage,
  partnerPushRecipients,
  runBenefitExpiryRemindersCore,
  savedBenefitOf,
  type BenefitNotifyDeps,
  type BenefitPush,
} from "./benefits-club-admin";

const ADMIN: Caller = {uid: "admin1", isAdmin: true};
const ATHLETE: Caller = {uid: "athlete1", isAdmin: false};
// 16/11/2026 10h em Brasília.
const NOW = new Date("2026-11-16T13:00:00Z");
const HOUR = 3600 * 1000;
const ts = (ms: number) => Timestamp.fromMillis(ms);

function recorder(): {deps: BenefitNotifyDeps; pushes: BenefitPush[]} {
  const pushes: BenefitPush[] = [];
  return {
    pushes,
    deps: {
      notify: async (push) => {
        pushes.push(push);
        return push.withPush;
      },
    },
  };
}

function docsIn(fake: FakeFirestore, collection: string): Array<[string, Record<string, unknown>]> {
  return [...fake.store.entries()].filter(([path]) => path.startsWith(`${collection}/`)) as Array<
    [string, Record<string, unknown>]
  >;
}

// ── import ─────────────────────────────────────────────────────────────────

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {code: "nexa-aaaa", externalId: "P-1", redeemedAt: "2026-11-10", discountCents: 500, orderCents: 5000, ...over};
}

describe("parseRedemptionRows", () => {
  it("normaliza o código e lê a data ISO", () => {
    const parsed = parseRedemptionRows([row(), row({externalId: "P-2", redeemedAt: "2026-11-10T21:30:00-03:00", orderCents: undefined})]);
    assert.ok(!("error" in parsed));
    assert.equal(parsed[0]?.code, "NEXA-AAAA");
    assert.equal(parsed[0]?.redeemedAt.toISOString(), "2026-11-10T00:00:00.000Z");
    assert.equal(parsed[1]?.redeemedAt.toISOString(), "2026-11-11T00:30:00.000Z");
    assert.equal(parsed[1]?.orderCents, null);
  });

  it("recusa a planilha pela primeira linha com defeito", () => {
    assert.deepEqual(parseRedemptionRows([row(), row({discountCents: 4.5})]), {error: "Linha 2: desconto em centavos inválido."});
    assert.deepEqual(parseRedemptionRows([row({discountCents: -1})]), {error: "Linha 1: desconto em centavos inválido."});
    assert.deepEqual(parseRedemptionRows([row({redeemedAt: "10/11/2026"})]), {error: "Linha 1: data inválida (use AAAA-MM-DD)."});
    assert.deepEqual(parseRedemptionRows([row({redeemedAt: "2026-13-45"})]), {error: "Linha 1: data inválida (use AAAA-MM-DD)."});
    assert.deepEqual(parseRedemptionRows([row({code: "NEXA/1"})]), {error: "Linha 1: código inválido."});
    assert.deepEqual(parseRedemptionRows([row({externalId: "a/b"})]), {error: "Linha 1: identificador do pedido inválido."});
    assert.deepEqual(parseRedemptionRows([row({externalId: "__x"})]), {error: "Linha 1: identificador do pedido inválido."});
    assert.deepEqual(parseRedemptionRows([row({orderCents: "50"})]), {error: "Linha 1: valor do pedido em centavos inválido."});
    assert.ok("error" in parseRedemptionRows([]));
    assert.ok("error" in parseRedemptionRows(Array.from({length: MAX_IMPORT_ROWS + 1}, (_, i) => row({externalId: `${i}`}))));
    assert.ok("error" in parseRedemptionRows("x"));
  });
});

describe("matchRedemption", () => {
  it("1 uid casa; 2+ é ambíguo; nenhum não casa", () => {
    assert.deepEqual(matchRedemption({uids: ["u1"]}), {status: "matched", uid: "u1"});
    assert.deepEqual(matchRedemption({uids: ["u1", "u1"]}), {status: "matched", uid: "u1"});
    assert.deepEqual(matchRedemption({uids: ["u1", "u2"]}), {status: "ambiguous", uid: null});
    assert.deepEqual(matchRedemption({uids: []}), {status: "unmatched", uid: null});
    assert.deepEqual(matchRedemption(undefined), {status: "unmatched", uid: null});
  });
});

describe("importBenefitRedemptionsCore", () => {
  function makeDb() {
    const fake = new FakeFirestore();
    fake.seedDoc("partners/fast", {name: "Fast Açaí"});
    fake.seedDoc(`users/${ADMIN.uid}`, {fullName: "Ana Admin"});
    fake.seedDoc("benefitCodes/NEXA-AAAA", {uids: ["uA"]});
    fake.seedDoc("benefitCodes/NEXA-BBBB", {uids: ["uB1", "uB2"]});
    return {fake, db: fake as unknown as Firestore};
  }

  it("atribui pelo código, conta duplicados e é idempotente", async () => {
    const {fake, db} = makeDb();
    const rows = [
      row(),
      row({code: "NEXA-BBBB", externalId: "P-2"}),
      row({code: "NEXA-ZZZZ", externalId: "P-3", orderCents: null}),
      row({externalId: "P-1"}),
    ];
    assert.deepEqual(await importBenefitRedemptionsCore(db, ADMIN, {partnerId: "fast", rows}, NOW), {
      matched: 1,
      ambiguous: 1,
      unmatched: 1,
      duplicates: 1,
    });
    const saved = fake.store.get("benefitRedemptions/fast_P-1") as Record<string, unknown>;
    assert.equal(saved["uid"], "uA");
    assert.equal(saved["status"], "matched");
    assert.equal(saved["code"], "NEXA-AAAA");
    assert.equal(saved["discountCents"], 500);
    assert.equal(saved["orderCents"], 5000);
    assert.equal(saved["importedByName"], "Ana Admin");
    assert.deepEqual(saved["redeemedAt"], Timestamp.fromDate(new Date("2026-11-10T00:00:00Z")));
    assert.equal((fake.store.get("benefitRedemptions/fast_P-2") as Record<string, unknown>)["uid"], null);

    const before = JSON.stringify(docsIn(fake, "benefitRedemptions"));
    assert.deepEqual(await importBenefitRedemptionsCore(db, ADMIN, {partnerId: "fast", rows}, new Date(NOW.getTime() + HOUR)), {
      matched: 0,
      ambiguous: 0,
      unmatched: 0,
      duplicates: 4,
    });
    assert.equal(JSON.stringify(docsIn(fake, "benefitRedemptions")), before);
  });

  it("só admin; parceiro precisa existir; linha inválida não grava nada", async () => {
    const {fake, db} = makeDb();
    await assert.rejects(importBenefitRedemptionsCore(db, ATHLETE, {partnerId: "fast", rows: [row()]}, NOW), /equipe da Nexa/);
    await assert.rejects(importBenefitRedemptionsCore(db, ADMIN, {partnerId: "nope", rows: [row()]}, NOW), /não encontrado/);
    await assert.rejects(
      importBenefitRedemptionsCore(db, ADMIN, {partnerId: "fast", rows: [row(), row({discountCents: "5"})]}, NOW),
      /Linha 2/,
    );
    assert.equal(docsIn(fake, "benefitRedemptions").length, 0);
  });
});

// ── textos do push ─────────────────────────────────────────────────────────

describe("endingLabel / mensagens", () => {
  it("conta os dias pelo calendário de Brasília (validUntil é exclusivo)", () => {
    // Termina à meia-noite de 17/11 em Brasília: o último dia é hoje.
    assert.equal(endingLabel(Date.parse("2026-11-17T03:00:00Z"), NOW), "termina hoje");
    assert.equal(endingLabel(Date.parse("2026-11-17T23:00:00Z"), NOW), "termina amanhã");
    assert.equal(endingLabel(Date.parse("2026-11-20T15:00:00Z"), NOW), "termina em 4 dias");
  });

  it("título e texto por tipo; links do app e do portal", () => {
    const partner = {name: "Fast Açaí", benefitTitle: "10% de desconto", validUntil: ts(Date.parse("2026-11-17T23:00:00Z"))};
    assert.deepEqual(partnerPushMessage("new", partner, NOW), {
      title: "Novo no Clube de Vantagens",
      body: "Fast Açaí: 10% de desconto",
    });
    assert.deepEqual(partnerPushMessage("ending", partner, NOW), {
      title: "Fast Açaí: oferta termina amanhã",
      body: "10% de desconto. Aproveite antes que acabe.",
    });
    assert.deepEqual(benefitPushLinks("fast"), {
      url: "/athlete/clube/fast?origem=push",
      webUrl: "/clube/fast?origem=push",
      partnerId: "fast",
    });
  });
});

// ── público e envio do push do parceiro ────────────────────────────────────

function audienceDb(config: Record<string, unknown> = {enabled: true, testerUids: ["tester"]}) {
  const fake = new FakeFirestore();
  const athlete = {roles: ["athlete"], city: "Goiânia"};
  fake.seedDoc("appConfig/benefitsClub", config);
  fake.seedDoc("partners/fast", {
    name: "Fast Açaí",
    benefitTitle: "10% de desconto",
    active: true,
    audience: "all",
    cities: ["goiania "],
    validUntil: ts(NOW.getTime() + 30 * HOUR),
  });
  fake.seedDoc("partners/squad", {name: "Squad Shop", active: true, audience: "all", cities: [], requirement: {type: "squad"}});
  fake.seedDoc("partners/old", {name: "Velho", active: true, audience: "all", cities: [], validUntil: ts(NOW.getTime() - 1)});
  fake.seedDoc("users/gyn", athlete);
  fake.seedDoc("users/gynWeb", athlete);
  fake.seedDoc("users/noDevice", athlete);
  fake.seedDoc("users/pushOff", {...athlete, notificationPreferences: {channels: {push: false}}});
  fake.seedDoc("users/seed", {...athlete, seedTestAthlete: true});
  fake.seedDoc("users/organizer", {roles: ["organizer"], city: "Goiânia"});
  fake.seedDoc("users/spo", {roles: ["athlete"], city: "São Paulo"});
  fake.seedDoc("users/amb", {roles: ["athlete"], city: "São Paulo"});
  fake.seedDoc("users/tester", {roles: ["admin"], city: "Recife"});
  fake.seedDoc("squadAmbassadors/amb", {status: "active"});
  for (const uid of ["gyn", "pushOff", "seed", "organizer", "spo", "amb", "tester"]) {
    fake.seedDoc(`users/${uid}/tokens/t1`, {token: `tok-${uid}`});
  }
  fake.seedDoc("users/gynWeb/webPushSubscriptions/s1", {endpoint: "https://push.example/1"});
  return {fake, db: fake as unknown as Firestore};
}

describe("partnerPushRecipients", () => {
  it("atletas da cidade com aparelho e push ligado, fora seed/QA", async () => {
    const {fake, db} = audienceDb();
    const partner = fake.store.get("partners/fast") as Record<string, unknown>;
    const config = fake.store.get("appConfig/benefitsClub");
    assert.deepEqual(await partnerPushRecipients(db, partner, config), ["gyn", "gynWeb"]);
  });

  it("requisito filtra; sem cidades vale todas", async () => {
    const {fake, db} = audienceDb();
    const partner = fake.store.get("partners/squad") as Record<string, unknown>;
    assert.deepEqual(await partnerPushRecipients(db, partner, fake.store.get("appConfig/benefitsClub")), ["amb"]);
  });

  it("clube desligado ou parceiro de teste: só quem testa", async () => {
    const {fake, db} = audienceDb({enabled: false, testerUids: ["tester", "noDevice", "gyn"]});
    const partner = fake.store.get("partners/fast") as Record<string, unknown>;
    assert.deepEqual(await partnerPushRecipients(db, partner, fake.store.get("appConfig/benefitsClub")), ["gyn", "tester"]);
    const testerPartner = {...partner, audience: "testers"};
    assert.deepEqual(
      await partnerPushRecipients(db, testerPartner, {enabled: true, testerUids: ["tester"]}),
      ["tester"],
    );
  });
});

describe("notifyBenefitPartnerCore", () => {
  it("dryRun só conta (inclusive sem a flag); envio marca e não repete", async () => {
    const {fake, db} = audienceDb();
    const {deps, pushes} = recorder();
    assert.deepEqual(await notifyBenefitPartnerCore(db, ADMIN, {partnerId: "fast", kind: "new", dryRun: true}, NOW, deps), {
      recipients: 2,
      sent: 0,
    });
    assert.deepEqual(await notifyBenefitPartnerCore(db, ADMIN, {partnerId: "fast", kind: "new"}, NOW, deps), {
      recipients: 2,
      sent: 0,
    });
    assert.equal(pushes.length, 0);
    assert.equal(fake.store.has("partnerPrivate/fast"), false);

    assert.deepEqual(await notifyBenefitPartnerCore(db, ADMIN, {partnerId: "fast", kind: "new", dryRun: false}, NOW, deps), {
      recipients: 2,
      sent: 2,
    });
    assert.deepEqual(pushes.map((p) => p.userId), ["gyn", "gynWeb"]);
    assert.equal(pushes[0]?.type, "benefit_partner_new");
    assert.deepEqual(pushes[0]?.data, benefitPushLinks("fast"));
    const marker = fake.store.get("partnerPrivate/fast") as Record<string, unknown>;
    assert.deepEqual(marker["notifiedNewAt"], Timestamp.fromDate(NOW));
    assert.equal(marker["couponCode"], null);
    assert.equal(marker["updatedBy"], ADMIN.uid);

    await assert.rejects(
      notifyBenefitPartnerCore(db, ADMIN, {partnerId: "fast", kind: "new", dryRun: false}, NOW, deps),
      /já foi enviado/,
    );
    // O outro tipo tem marca própria e preserva o cupom privado.
    fake.seedDoc("partnerPrivate/fast", {...marker, couponCode: "PRIV"});
    await notifyBenefitPartnerCore(db, ADMIN, {partnerId: "fast", kind: "ending", dryRun: false}, NOW, deps);
    const after = fake.store.get("partnerPrivate/fast") as Record<string, unknown>;
    assert.equal(after["couponCode"], "PRIV");
    assert.ok(after["notifiedEndingAt"]);
    assert.equal(pushes[pushes.length - 1]?.title, "Fast Açaí: oferta termina amanhã");
  });

  it("só admin; parceiro fora do ar ou sem término recusa", async () => {
    const {db} = audienceDb();
    const {deps} = recorder();
    await assert.rejects(notifyBenefitPartnerCore(db, ATHLETE, {partnerId: "fast", kind: "new"}, NOW, deps), /equipe da Nexa/);
    await assert.rejects(notifyBenefitPartnerCore(db, ADMIN, {partnerId: "fast", kind: "x"}, NOW, deps), /Tipo de aviso/);
    await assert.rejects(notifyBenefitPartnerCore(db, ADMIN, {partnerId: "old", kind: "new"}, NOW, deps), /dentro da validade/);
    await assert.rejects(notifyBenefitPartnerCore(db, ADMIN, {partnerId: "squad", kind: "ending"}, NOW, deps), /data de término/);
    await assert.rejects(notifyBenefitPartnerCore(db, ADMIN, {partnerId: "nope", kind: "new"}, NOW, deps), /não encontrado/);
  });
});

// ── lembrete de validade ───────────────────────────────────────────────────

describe("seleção do lembrete", () => {
  it("só o caminho users/{uid}/benefits/{partnerId}", () => {
    assert.deepEqual(savedBenefitOf("users/u/benefits/p", {}), {uid: "u", partnerId: "p", data: {}});
    assert.equal(savedBenefitOf("stores/x/benefits/p", {}), null);
  });

  it("salvou e não usou depois de salvar; uma vez só", () => {
    const savedAt = ts(NOW.getTime() - 10 * HOUR);
    assert.equal(needsExpiryReminder({saved: true, savedAt}), true);
    assert.equal(needsExpiryReminder({saved: true, savedAt, lastUsedAt: ts(NOW.getTime() - 20 * HOUR)}), true);
    assert.equal(needsExpiryReminder({saved: true, savedAt, lastUsedAt: ts(NOW.getTime() - HOUR)}), false);
    assert.equal(needsExpiryReminder({saved: false, savedAt}), false);
    assert.equal(needsExpiryReminder({saved: true, savedAt, expiryNotifiedAt: ts(NOW.getTime())}), false);
  });
});

describe("runBenefitExpiryRemindersCore", () => {
  it("avisa quem salvou parceiro que termina em 48 h, uma vez por pessoa e parceiro", async () => {
    const {fake, db} = audienceDb();
    const savedAt = ts(NOW.getTime() - 10 * HOUR);
    fake.seedDoc("partners/later", {name: "Depois", active: true, audience: "all", validUntil: ts(NOW.getTime() + 72 * HOUR)});
    fake.seedDoc("partners/squadEnding", {
      name: "Squad Shop",
      active: true,
      audience: "all",
      requirement: {type: "squad"},
      validUntil: ts(NOW.getTime() + 10 * HOUR),
    });
    fake.seedDoc("users/gyn/benefits/fast", {saved: true, savedAt});
    fake.seedDoc("users/pushOff/benefits/fast", {saved: true, savedAt});
    fake.seedDoc("users/spo/benefits/fast", {saved: true, savedAt, lastUsedAt: ts(NOW.getTime() - HOUR), useCount: 1});
    fake.seedDoc("users/amb/benefits/fast", {saved: false, savedAt});
    fake.seedDoc("users/amb/benefits/later", {saved: true, savedAt});
    fake.seedDoc("users/amb/benefits/squadEnding", {saved: true, savedAt});
    fake.seedDoc("users/gyn/benefits/squadEnding", {saved: true, savedAt});

    const {deps, pushes} = recorder();
    assert.deepEqual(await runBenefitExpiryRemindersCore(db, NOW, deps), {partners: 2, reminders: 3, sent: 2});
    assert.deepEqual(
      pushes.map((p) => [p.userId, p.data["partnerId"], p.withPush, p.type]),
      [
        ["gyn", "fast", true, "benefit_expiry_reminder"],
        ["pushOff", "fast", false, "benefit_expiry_reminder"],
        ["amb", "squadEnding", true, "benefit_expiry_reminder"],
      ],
    );
    assert.equal(pushes[0]?.title, "Fast Açaí termina amanhã");
    assert.deepEqual(
      (fake.store.get("users/gyn/benefits/fast") as Record<string, unknown>)["expiryNotifiedAt"],
      Timestamp.fromDate(NOW),
    );
    assert.equal((fake.store.get("users/gyn/benefits/squadEnding") as Record<string, unknown>)["expiryNotifiedAt"], undefined);

    const again = recorder();
    assert.deepEqual(await runBenefitExpiryRemindersCore(db, new Date(NOW.getTime() + HOUR), again.deps), {
      partners: 2,
      reminders: 0,
      sent: 0,
    });
  });

  it("sem parceiro terminando não lê os salvos", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("partners/a", {active: true, validUntil: ts(NOW.getTime() + 72 * HOUR)});
    const {deps} = recorder();
    assert.deepEqual(await runBenefitExpiryRemindersCore(fake as unknown as Firestore, NOW, deps), {
      partners: 0,
      reminders: 0,
      sent: 0,
    });
  });
});
