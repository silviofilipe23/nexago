import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  REJECTION_MESSAGE,
  acceptInviteCore,
  openInviteCore,
  sendInviteCore,
  submitApplicationCore,
  sweepInvitesCore,
  updateApplicationCore,
  updateInviteCore,
  type Notify,
} from "./squad-applications";
import {DAY_MS} from "./squad-program";

process.env.GCLOUD_PROJECT = "p";

const ACTOR = {uid: "admin1", name: "Lia Martins"};
const NOW = new Date("2026-10-17T15:00:00Z");

function setup() {
  const fake = new FakeFirestore();
  const db = fake as unknown as Firestore;
  const sent: Array<{uid: string; title: string; body: string}> = [];
  const notify: Notify = async (uid, title, body) => {
    sent.push({uid, title, body});
  };
  fake.seedDoc("users/felipe", {fullName: "Felipe Cardoso", city: "Goiânia", state: "GO", createdAt: new Date("2025-03-01")});
  fake.seedDoc("artifacts/p/public/data/athleteRankings/felipe", {totalPoints: 900, tournamentsCount: 18});
  for (let i = 0; i < 16; i++) {
    fake.seedDoc(`tournamentRegistrationInvites/i${i}`, {inviterUid: "felipe", inviteeUid: `a${i % 15}`, status: "accepted"});
  }
  return {fake, db, sent, notify};
}

function docs(fake: FakeFirestore, prefix: string): Array<[string, Record<string, unknown>]> {
  return [...fake.store.entries()].filter(([path]) => path.startsWith(prefix));
}

describe("candidatura", () => {
  it("cria em Novas com snapshot do NexaGO e sugestão automática", async () => {
    const {fake, db} = setup();
    const out = await submitApplicationCore(db, {
      uid: "felipe", source: "app",
      answers: {instagram: "@felipe", city: "Goiânia", leadsGroup: "lt10", why: "Treino 3 turmas na arena."},
    }, NOW);
    const app = fake.store.get(`squadApplications/${out.applicationId}`)!;
    assert.equal(app["stage"], "new");
    // 15 indicados distintos → Captain.
    assert.equal(app["suggestedTier"], "cap");
    assert.equal(app["suggestedBy"], "auto");
    const snap = app["snapshot"] as Record<string, unknown>;
    assert.equal(snap["tournaments"], 18);
    assert.equal(snap["referredCount"], 15);
    assert.equal((app["answers"] as Record<string, unknown>)["instagram"], "felipe");
  });

  it("recusa segunda candidatura em aberto e quem já é embaixador", async () => {
    const {fake, db} = setup();
    const answers = {city: "Goiânia", leadsGroup: "no", why: "Quero representar a arena."};
    await submitApplicationCore(db, {uid: "felipe", source: "portal", answers}, NOW);
    await assert.rejects(submitApplicationCore(db, {uid: "felipe", source: "portal", answers}, NOW), /em andamento/);
    fake.seedDoc("users/jv", {fullName: "João Victor"});
    fake.seedDoc("squadAmbassadors/jv", {status: "active", tier: "amb", code: "JOAO10"});
    await assert.rejects(submitApplicationCore(db, {uid: "jv", source: "portal", answers}, NOW), /já faz parte/);
  });

  it("analisar, nota, redes e recusa com mensagem genérica", async () => {
    const {fake, db, sent, notify} = setup();
    fake.seedDoc("squadApplications/a1", {
      athleteId: "felipe", stage: "new", suggestedBy: "auto", suggestedTier: "ath", notes: [],
      answers: {leadsGroup: "no"}, snapshot: {tournaments: 9, referredCount: 0},
    });
    await updateApplicationCore(db, {applicationId: "a1", action: "review"}, ACTOR, NOW, notify);
    await updateApplicationCore(db, {applicationId: "a1", action: "note", text: "Checar conduta com a arena."}, ACTOR, NOW, notify);
    await updateApplicationCore(db, {applicationId: "a1", action: "social", followers: 12_000, engagementPct: 2}, ACTOR, NOW, notify);
    let app = fake.store.get("squadApplications/a1")!;
    assert.equal(app["stage"], "review");
    assert.equal((app["notes"] as unknown[]).length, 1);
    // 9 torneios + 12 mil seguidores → Ambassador (sugestão automática recalcula).
    assert.equal(app["suggestedTier"], "amb");

    await updateApplicationCore(db, {applicationId: "a1", action: "suggest", tier: "pro"}, ACTOR, NOW, notify);
    await updateApplicationCore(db, {applicationId: "a1", action: "social", followers: 1, engagementPct: null}, ACTOR, NOW, notify);
    assert.equal(fake.store.get("squadApplications/a1")!["suggestedTier"], "pro", "sugestão manual não é sobrescrita");

    await assert.rejects(
      updateApplicationCore(db, {applicationId: "a1", action: "reject", reason: ""}, ACTOR, NOW, notify), /motivo/,
    );
    await updateApplicationCore(db, {applicationId: "a1", action: "reject", reason: "Histórico de W.O."}, ACTOR, NOW, notify);
    app = fake.store.get("squadApplications/a1")!;
    assert.equal(app["stage"], "archived");
    assert.equal(app["archivedReason"], "rejected");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body, REJECTION_MESSAGE);
    assert.ok(!sent[0].body.includes("W.O."), "motivo interno nunca vai ao atleta");
  });

  it("transição fora de ordem é recusada", async () => {
    const {fake, db, notify} = setup();
    fake.seedDoc("squadApplications/a1", {athleteId: "felipe", stage: "new", notes: []});
    await assert.rejects(
      updateApplicationCore(db, {applicationId: "a1", action: "waitlist"}, ACTOR, NOW, notify), /mudou de etapa/,
    );
  });
});

describe("convite", () => {
  const base = {athleteId: "felipe", tier: "amb" as const, suggestedCode: "felipe10"};

  it("convite direto cria o card em Convidados e manda push", async () => {
    const {fake, db, sent, notify} = setup();
    const out = await sendInviteCore(db, base, ACTOR, NOW, notify);
    assert.equal(out.status, "sent");
    const invite = fake.store.get(`squadInvites/${out.inviteId}`)!;
    assert.equal(invite["suggestedCode"], "FELIPE10");
    assert.equal(invite["periodEnd"], "2026-12-06", "fim padrão = fim do ciclo");
    assert.equal((invite["expiresAt"] as Date).getTime(), NOW.getTime() + 7 * DAY_MS);
    const app = fake.store.get(`squadApplications/${out.applicationId}`)!;
    assert.equal(app["stage"], "invited");
    assert.equal(app["source"], "manual");
    assert.equal(sent.length, 1);
  });

  it("piloto cheio agenda para o próximo ciclo, sem push", async () => {
    const {fake, db, sent, notify} = setup();
    fake.seedDoc("squadConfig/cycle", {id: "piloto", start: "2026-09-08", end: "2026-12-06", seats: 2});
    fake.seedDoc("squadAmbassadors/x1", {status: "active", code: "XX10"});
    fake.seedDoc("squadInvites/old", {status: "opened", athleteId: "x2"});
    const out = await sendInviteCore(db, base, ACTOR, NOW, notify);
    assert.equal(out.status, "scheduled");
    assert.equal(out.scheduledFor, "2026-12-07");
    assert.equal(sent.length, 0);
    assert.equal(fake.store.get(`squadInvites/${out.inviteId}`)!["sentAt"], null);
  });

  it("bloqueia quem já tem contrato, convite em aberto ou código em uso", async () => {
    const {fake, db, notify} = setup();
    fake.seedDoc("squadAmbassadors/felipe", {status: "active", tier: "pro", code: "FC10", end: new Date("2026-12-07T02:59:59Z")});
    await assert.rejects(sendInviteCore(db, base, ACTOR, NOW, notify), /Felipe Cardoso já é Pro Ambassador até 06\/12\/2026/);

    fake.store.delete("squadAmbassadors/felipe");
    fake.seedDoc("squadAmbassadors/jv", {status: "active", code: "FELIPE10"});
    await assert.rejects(sendInviteCore(db, base, ACTOR, NOW, notify), /já está em uso/);

    await sendInviteCore(db, {...base, suggestedCode: "FELIPE11"}, ACTOR, NOW, notify);
    await assert.rejects(sendInviteCore(db, {...base, suggestedCode: "FELIPE12"}, ACTOR, NOW, notify), /convite em aberto/);
  });

  it("comissão do Pro precisa estar na faixa", async () => {
    const {db, notify} = setup();
    await assert.rejects(sendInviteCore(db, {...base, tier: "pro", commissionPct: 20}, ACTOR, NOW, notify), /entre 10% e 15%/);
    const ok = await sendInviteCore(db, {...base, tier: "pro", commissionPct: 12}, ACTOR, NOW, notify);
    assert.equal(ok.status, "sent");
  });

  it("de uma candidatura em análise: move o card e liga o convite", async () => {
    const {fake, db, notify} = setup();
    fake.seedDoc("squadApplications/a1", {athleteId: "felipe", stage: "review", notes: []});
    const out = await sendInviteCore(db, {...base, applicationId: "a1"}, ACTOR, NOW, notify);
    assert.equal(out.applicationId, "a1");
    assert.equal(fake.store.get("squadApplications/a1")!["stage"], "invited");
    assert.equal(fake.store.get("squadApplications/a1")!["inviteId"], out.inviteId);
  });

  it("abrir → Contrato enviado; aceitar → contrato com a versão vigente e card fora do kanban", async () => {
    const {fake, db, notify} = setup();
    fake.seedDoc("squadConfig/rules", {version: 3, rules: {tiers: {
      ath: {commissionPct: 5, followerDiscountPct: 10}, amb: {commissionPct: 11, followerDiscountPct: 12},
      pro: {commissionPct: [10, 15], followerDiscountPct: 15}, cap: {commissionPct: 10, followerDiscountPct: 10},
    }}});
    const {inviteId, applicationId} = await sendInviteCore(db, base, ACTOR, NOW, notify);
    const later = new Date(NOW.getTime() + DAY_MS);
    await openInviteCore(db, {uid: "felipe", inviteId}, later);
    assert.equal(fake.store.get(`squadApplications/${applicationId}`)!["stage"], "contract");
    assert.equal((fake.store.get(`squadInvites/${inviteId}`)!["expiresAt"] as Date).getTime(), later.getTime() + 7 * DAY_MS);

    await assert.rejects(acceptInviteCore(db, {uid: "outro", inviteId, code: "FELIPE10"}, later), /não encontrado/);
    fake.seedDoc("squadAmbassadors/jv", {status: "active", code: "TOMADO"});
    await assert.rejects(acceptInviteCore(db, {uid: "felipe", inviteId, code: "tomado"}, later), /já está em uso/);

    const out = await acceptInviteCore(db, {uid: "felipe", inviteId, code: "fel10"}, later);
    assert.deepEqual(out, {code: "FEL10", tier: "amb", rulesVersion: 3});
    const contract = fake.store.get("squadAmbassadors/felipe")!;
    assert.equal(contract["status"], "active");
    assert.equal(contract["commissionPct"], 11);
    assert.equal(contract["followerDiscountPct"], 12);
    assert.equal(contract["slug"], "fel10");
    assert.equal(contract["displayName"], "Felipe Cardoso");
    assert.equal(fake.store.get(`squadInvites/${inviteId}`)!["status"], "accepted");
    const app = fake.store.get(`squadApplications/${applicationId}`)!;
    assert.equal(app["stage"], "archived");
    assert.equal(app["archivedReason"], "accepted");
  });

  it("cancelar arquiva; reenviar expirado recomeça o prazo e volta para Convidados", async () => {
    const {fake, db, notify} = setup();
    const {inviteId, applicationId} = await sendInviteCore(db, base, ACTOR, NOW, notify);
    fake.seedDoc(`squadInvites/${inviteId}`, {...fake.store.get(`squadInvites/${inviteId}`)!, status: "expired"});
    fake.seedDoc(`squadApplications/${applicationId}`, {
      ...fake.store.get(`squadApplications/${applicationId}`)!, stage: "archived", archivedReason: "expired",
    });
    const later = new Date(NOW.getTime() + 10 * DAY_MS);
    await updateInviteCore(db, {inviteId, action: "resend"}, ACTOR, later, notify);
    const invite = fake.store.get(`squadInvites/${inviteId}`)!;
    assert.equal(invite["status"], "sent");
    assert.equal((invite["expiresAt"] as Date).getTime(), later.getTime() + 7 * DAY_MS);
    assert.equal(fake.store.get(`squadApplications/${applicationId}`)!["stage"], "invited");

    await updateInviteCore(db, {inviteId, action: "cancel"}, ACTOR, later, notify);
    assert.equal(fake.store.get(`squadInvites/${inviteId}`)!["status"], "canceled");
    assert.equal(fake.store.get(`squadApplications/${applicationId}`)!["archivedReason"], "canceled");
  });
});

describe("varredura dos convites", () => {
  it("lembra no D+3, expira no D+7 e envia o agendado no início do ciclo", async () => {
    const {fake, db, sent, notify} = setup();
    fake.seedDoc("squadApplications/a1", {stage: "invited"});
    fake.seedDoc("squadInvites/remind", {
      status: "sent", athleteId: "u1", tier: "amb", sentAt: new Date(NOW.getTime() - 3 * DAY_MS),
      expiresAt: new Date(NOW.getTime() + 4 * DAY_MS), reminders: [],
    });
    fake.seedDoc("squadInvites/expire", {
      status: "sent", athleteId: "u2", tier: "amb", applicationId: "a1",
      sentAt: new Date(NOW.getTime() - 7 * DAY_MS), expiresAt: NOW, reminders: ["sent_d3"],
    });
    fake.seedDoc("squadInvites/scheduled", {status: "scheduled", athleteId: "u3", tier: "ath", scheduledFor: "2026-10-17", reminders: []});
    const out = await sweepInvitesCore(db, NOW, notify);
    assert.deepEqual(out, {sent: 1, reminded: 1, expired: 1});
    assert.deepEqual(fake.store.get("squadInvites/remind")!["reminders"], ["sent_d3"]);
    assert.equal(fake.store.get("squadInvites/expire")!["status"], "expired");
    assert.equal(fake.store.get("squadApplications/a1")!["archivedReason"], "expired");
    assert.equal(fake.store.get("squadInvites/scheduled")!["status"], "sent");
    assert.equal(sent.length, 2);

    const again = await sweepInvitesCore(db, NOW, notify);
    assert.deepEqual(again, {sent: 0, reminded: 0, expired: 0}, "idempotente");
    assert.equal(docs(fake, "squadInvites/").length, 3);
  });
});
