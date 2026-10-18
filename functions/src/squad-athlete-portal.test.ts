import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {publicApplicationStatus, squadPortalInfoCore} from "./squad-athlete-portal";

process.env.GCLOUD_PROJECT = "p";

const NOW = new Date("2026-10-17T15:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

describe("getSquadPortalInfo", () => {
  it("status público da candidatura nunca expõe o motivo interno", () => {
    assert.equal(publicApplicationStatus("new", ""), "review");
    assert.equal(publicApplicationStatus("review", ""), "review");
    assert.equal(publicApplicationStatus("invited", ""), "invited");
    assert.equal(publicApplicationStatus("archived", "waitlist"), "waitlist");
    assert.equal(publicApplicationStatus("archived", "rejected"), "rejected");
    assert.equal(publicApplicationStatus("archived", "expired"), null);
    assert.equal(publicApplicationStatus("archived", "accepted"), null);
  });

  it("sem contrato: perfil, candidatura em análise, convite, vagas e próximo ciclo", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("users/caio", {fullName: "Caio Teixeira", city: "Goiânia", state: "GO", mainArenaName: "Arena Errejota"});
    fake.seedDoc("squadApplications/a1", {
      athleteId: "caio", stage: "review", submittedAt: daysAgo(2), notes: [{text: "nota interna"}],
      internalReason: "motivo interno", suggestedTier: "cap",
    });
    fake.seedDoc("squadInvites/i1", {athleteId: "caio", status: "sent", tier: "amb", sentAt: daysAgo(1), expiresAt: daysAgo(-5)});
    for (let i = 0; i < 20; i++) fake.seedDoc(`squadAmbassadors/x${i}`, {status: "active", tier: "ath", code: `X${i}AAA`});
    const info = await squadPortalInfoCore(fake as unknown as Firestore, "caio", NOW);
    assert.equal(info.member, null);
    const join = info.join!;
    assert.equal(join.profile?.name, "Caio Teixeira");
    assert.equal(join.profile?.arenaName, "Arena Errejota");
    assert.deepEqual(join.application, {status: "review", submittedAt: daysAgo(2).toISOString()});
    assert.equal(join.invite?.tier, "amb");
    assert.equal(join.pastContract, null);
    // 20 contratos + 1 convite enviado: piloto cheio, próximo ciclo em 07/12.
    assert.equal(join.seatsLeft, 0);
    assert.equal(join.nextCycleStart, "2026-12-07");
    assert.equal(join.followerDiscountPct, 10);
    const json = JSON.stringify(info);
    for (const secret of ["nota interna", "motivo interno", "\"cap\""]) assert.ok(!json.includes(secret), `vazou ${secret}`);
  });

  it("contrato encerrado volta para o 'Entrar', com o aviso do contrato que terminou", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("users/jv", {fullName: "João Victor"});
    fake.seedDoc("squadAmbassadors/jv", {status: "ended", tier: "amb", code: "JOAO10", endedAt: daysAgo(3), endNote: "nota interna"});
    const info = await squadPortalInfoCore(fake as unknown as Firestore, "jv", NOW);
    assert.equal(info.member, null);
    assert.deepEqual(info.join?.pastContract, {tier: "amb", endedAt: daysAgo(3).toISOString()});
    assert.ok(!JSON.stringify(info).includes("nota interna"));
  });

  it("embaixador: cadastros, inscrições do contrato e o checklist da próxima promoção (sem ROI)", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("squadAttributions/f1", {ambassadorId: "jv", code: "JOAO10", origin: "link"});
    fake.seedDoc("squadAttributions/f2", {ambassadorId: "jv", code: "JOAO10", origin: "qr"});
    fake.seedDoc("squadAttributions/f3", {ambassadorId: "mr", code: "MARCOS10", origin: "qr"});
    fake.seedDoc("squadAmbassadors/jv", {status: "active", tier: "amb", code: "JOAO10", start: daysAgo(30)});
    const c = (id: string, status: string, at: Date, extra: Record<string, unknown> = {}) =>
      fake.seedDoc(`squadCommissions/${id}`, {ambassadorId: "jv", status, registeredAt: at, ...extra});
    c("c1", "pending", daysAgo(1));
    c("c2", "released", daysAgo(2));
    c("c3", "paid", daysAgo(10));
    c("c4", "canceled", daysAgo(3), {cancelReason: "payment_failed"});
    c("c5", "canceled", daysAgo(4), {cancelReason: "refund"});
    c("old", "paid", daysAgo(60));
    fake.seedDoc("squadCommissions/other", {ambassadorId: "mr", status: "pending", registeredAt: daysAgo(1)});
    const info = await squadPortalInfoCore(fake as unknown as Firestore, "jv", NOW);
    assert.equal(info.join, null);
    // Inscrições: do contrato atual (sem a de 60 dias), sem o PIX vencido; o reembolso conta.
    assert.deepEqual(info.member, {
      signups: 2,
      registrations: 4,
      pending: 1,
      promotionChecklist: ["Influência relevante", "Participação consistente"],
    });
    assert.ok(!JSON.stringify(info).toLowerCase().includes("roi"));
  });
});
