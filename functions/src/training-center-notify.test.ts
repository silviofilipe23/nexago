import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  alertStaffPendingPayments,
  deliverCenterNotice,
  handlePaymentConfirmed,
  runCenterNotifications,
  sendTestNoticeCore,
  type NotifyDeps,
  type PushInput,
} from "./training-center-notify";
import {billingEventForStage, decide, inQuietHours, readNotificationSettings, wallTime} from "./training-center-notification-settings-model";

const C = "trainingCenters/c1";

function seed(center: Record<string, unknown> = {}) {
  const fake = new FakeFirestore();
  fake.seedDoc(C, {name: "CT Praia", status: "active", timezone: "America/Sao_Paulo", ...center});
  fake.seedDoc(`${C}/centerMembers/owner`, {uid: "owner", role: "center_owner", status: "active"});
  fake.seedDoc(`${C}/centerMembers/coach`, {uid: "coach", role: "coach", status: "active"});
  fake.seedDoc(`${C}/students/s1`, {name: "Bia", uid: "uBia"});
  fake.seedDoc(`${C}/students/s2`, {name: "Caio", uid: "uCaio", notifyClasses: false});
  fake.seedDoc(`${C}/classes/k1`, {name: "BT A", rosterStudentIds: ["s1", "s2"]});
  return fake;
}

/** Hora de parede em São Paulo (UTC−3). */
const sp = (day: string, time: string) => new Date(`${day}T${time}:00-03:00`);

function deps(now: Date) {
  const pushed: PushInput[] = [];
  const d: NotifyDeps = {now: () => now, notify: async (i) => {
    pushed.push(i);
  }};
  return {d, pushed};
}
const db = (f: FakeFirestore) => f as unknown as Firestore;
const keys = (f: FakeFirestore, prefix: string) => [...f.store.keys()].filter((k) => k.startsWith(prefix));

describe("preferências (modelo)", () => {
  it("padrões, obrigatórios sempre ligados e silêncio que vira a meia-noite", () => {
    const s = readNotificationSettings({events: {session_cancelled: {push: false}, payment_confirmed: {push: true}}});
    assert.equal(s.push.session_cancelled, true);
    assert.equal(s.push.payment_confirmed, true);
    assert.equal(s.push.attendance_pending, true);
    assert.deepEqual(s.quietHours, {enabled: true, start: "22:00", end: "07:00"});
    assert.equal(inQuietHours(s.quietHours, "23:30"), true);
    assert.equal(inQuietHours(s.quietHours, "06:59"), true);
    assert.equal(inQuietHours(s.quietHours, "07:00"), false);
    assert.equal(wallTime(new Date("2026-10-22T09:00:00Z"), "America/Sao_Paulo"), "06:00");
  });

  it("decisão por evento", () => {
    const s = readNotificationSettings({events: {seat_offered: {push: false}}});
    assert.deepEqual(decide("seat_offered", s, "12:00"), {action: "skip", reason: "disabled"});
    assert.deepEqual(decide("session_cancelled", s, "23:00"), {action: "send"});
    assert.deepEqual(decide("billing_reminder", s, "06:00"), {action: "defer", minutes: 60});
    assert.deepEqual(decide("class_reminder", s, "05:00"), {action: "skip", reason: "quiet"});
    assert.deepEqual(decide("daily_summary", s, "12:00"), {action: "skip", reason: "unavailable"});
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(billingEventForStage),
      ["billing_reminder", "billing_overdue", "billing_overdue", "billing_block_warning", "billing_overdue", "billing_overdue"]);
  });
});

describe("portão", () => {
  it("no silêncio adia para o fim; o agendador manda quando vence", async () => {
    const fake = seed();
    const night = deps(sp("2026-10-22", "23:00"));
    const r = await deliverCenterNotice(db(fake), night.d, {centerId: "c1", event: "seat_offered", uids: ["uBia", "uBia"], title: "t", body: "b", type: "x", data: {}});
    assert.deepEqual(r, {sent: 0, deferred: 1, skipped: null});
    assert.equal(night.pushed.length, 0);

    const before = deps(sp("2026-10-23", "06:50"));
    await runCenterNotifications(db(fake), "c1", fake.store.get(C) as Record<string, unknown>, before.d);
    assert.equal(before.pushed.length, 0);
    const morning = deps(sp("2026-10-23", "07:05"));
    const run = await runCenterNotifications(db(fake), "c1", fake.store.get(C) as Record<string, unknown>, morning.d);
    assert.equal(run.flushed, 1);
    assert.equal(morning.pushed[0]!.userId, "uBia");
    assert.equal(keys(fake, `${C}/notificationOutbox/`).length, 0);
  });
});

describe("agendador", () => {
  const session = (over: Record<string, unknown> = {}) => ({
    classId: "k1", className: "BT A", date: "2026-10-22", startTime: "19:00", durationMin: 60, status: "scheduled",
    coachUid: "coach", locationName: "Sede", locationAddress: "Av. da Praia", attendance: {}, makeupStudentIds: [], ...over,
  });

  it("lembrete de aula na antecedência, uma vez, respeitando 'avisos de aula' do aluno", async () => {
    const fake = seed({notifications: {reminderLeadMin: 120}});
    fake.seedDoc(`${C}/sessions/k1_2026-10-22`, session());
    const center = fake.store.get(C) as Record<string, unknown>;
    const early = deps(sp("2026-10-22", "16:30"));
    await runCenterNotifications(db(fake), "c1", center, early.d);
    assert.equal(early.pushed.length, 0);
    const onTime = deps(sp("2026-10-22", "17:10"));
    await runCenterNotifications(db(fake), "c1", center, onTime.d);
    await runCenterNotifications(db(fake), "c1", center, onTime.d);
    assert.deepEqual(onTime.pushed.map((p) => p.userId), ["uBia"]);
    assert.match(onTime.pushed[0]!.title, /Aula hoje às 19:00/);
  });

  it("chamada não finalizada 30 min depois do fim → professor; finalizada ou cancelada não", async () => {
    const fake = seed({notifications: {quietHours: {enabled: false}}});
    fake.seedDoc(`${C}/sessions/a`, session({startTime: "20:00"}));
    fake.seedDoc(`${C}/sessions/b`, session({startTime: "18:00", finalizedAt: new Date()}));
    fake.seedDoc(`${C}/sessions/c`, session({startTime: "18:00", status: "cancelled"}));
    fake.seedDoc(`${C}/sessions/d`, session({date: "2026-10-21", startTime: "23:00"}));
    const center = fake.store.get(C) as Record<string, unknown>;
    const at = deps(sp("2026-10-22", "21:20"));
    const r = await runCenterNotifications(db(fake), "c1", center, at.d);
    assert.equal(r.attendance, 1);
    const later = deps(sp("2026-10-22", "21:31"));
    await runCenterNotifications(db(fake), "c1", center, later.d);
    assert.deepEqual([...at.pushed, ...later.pushed].filter((p) => p.title === "Chamada não finalizada").map((p) => p.data["sessionId"]), ["d", "a"]);
  });
});

describe("recibo e equipe", () => {
  it("recibo só se o centro ligar e só na aprovação", async () => {
    const off = seed();
    const inv = {studentId: "s1", amountCents: 32000, reference: "Mensal · nov", status: "approved"};
    assert.equal(await handlePaymentConfirmed(db(off), deps(sp("2026-10-22", "12:00")).d, "c1", "i1", "ev1", {status: "pending"}, inv), 0);
    const on = seed({notifications: {events: {payment_confirmed: {push: true}}}});
    const x = deps(sp("2026-10-22", "12:00"));
    assert.equal(await handlePaymentConfirmed(db(on), x.d, "c1", "i1", "ev1", {status: "pending"}, inv), 1);
    assert.equal(await handlePaymentConfirmed(db(on), x.d, "c1", "i1", "ev1", {status: "pending"}, inv), 0);
    assert.equal(await handlePaymentConfirmed(db(on), x.d, "c1", "i1", "ev2", {status: "approved"}, inv), 0);
    assert.match(x.pushed[0]!.title, /Pagamento confirmado · R\$/);
  });

  it("alerta da equipe vai para owner/admin, não para professor", async () => {
    const fake = seed();
    const x = deps(sp("2026-10-22", "12:00"));
    await alertStaffPendingPayments(db(fake), x.d, "c1", [{payerName: "Bia", amountCents: 32000}, {payerName: "Caio", amountCents: 18000}]);
    assert.deepEqual(x.pushed.map((p) => p.userId), ["owner"]);
    assert.match(x.pushed[0]!.title, /2 pagamentos/);
  });

  it("teste para mim: só gestor", async () => {
    const fake = seed();
    const x = deps(sp("2026-10-22", "23:00"));
    assert.deepEqual(await sendTestNoticeCore(db(fake), x.d, "owner", {centerId: "c1", event: "billing_overdue"}), {sent: true});
    assert.match(x.pushed[0]!.title, /^\[Teste\]/);
    await assert.rejects(sendTestNoticeCore(db(fake), x.d, "coach", {centerId: "c1", event: "billing_overdue"}), /owner ou admin/);
    await assert.rejects(sendTestNoticeCore(db(fake), x.d, "owner", {centerId: "c1", event: "nada"}), /inválido/);
  });
});
