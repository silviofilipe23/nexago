import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  arenasWithProfessorPermission,
  assertTeacherLinkAllowsNewClass,
  professorCourtDiscountForQuote,
  professorPermissionDenial,
  requireArenaProfessorPermission,
  resolveProfessorBooking,
  resolveProfessorBookingStamp,
} from "./arena-professor-permissions";
import {
  arenaProfessorLinkId,
  decideArenaProfessorRequestCore,
  defaultArenaProfessorPermissions,
  endArenaProfessorLinkCore,
  reactivateArenaProfessorLinkCore,
  requestArenaProfessorLinkCore,
  suspendArenaProfessorLinkCore,
  updateArenaProfessorCourtDiscountCore,
  updateArenaProfessorPermissionsCore,
  type ArenaProfessorPermissions,
  type ArenaProfessorStatus,
  type CallerContext,
} from "./arena-professor-links";

const NOW = Date.UTC(2026, 9, 20, 13, 0, 0);
const OWNER: CallerContext = {uid: "uOwner", isSuperAdmin: false};
const PROF: CallerContext = {uid: "uProf", isSuperAdmin: false};

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc("arenas/a1", {name: "Arena CFC", managerUserId: "uOwner"});
  fake.seedDoc("arenas/a2", {name: "Arena Norte", managerUserId: "uOther"});
  fake.seedDoc("users/uOwner", {fullName: "Ana Souza"});
  fake.seedDoc("users/uProf", {fullName: "Thiago Mendes"});
  return {fake, db: fake as unknown as Firestore};
}

function seedLink(
  fake: FakeFirestore,
  status: ArenaProfessorStatus,
  permissions: Partial<ArenaProfessorPermissions> = {},
  arenaId = "a1",
  uid = "uProf",
): void {
  fake.seedDoc(`arenaProfessors/${arenaProfessorLinkId(arenaId, uid)}`, {
    arenaId,
    professorUserId: uid,
    relationshipType: "INDEPENDENT",
    status,
    initiatedBy: "PROFESSOR",
    permissions: {...defaultArenaProfessorPermissions("INDEPENDENT"), ...permissions},
    arenaName: arenaId === "a1" ? "Arena CFC" : "Arena Norte",
    professorName: "Thiago Mendes",
  });
}

async function rejectsWith(promise: Promise<unknown>, code: string): Promise<HttpsError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof HttpsError, `esperava HttpsError, veio ${String(error)}`);
    assert.equal(error.code, code, error.message);
    return error;
  }
  assert.fail(`esperava ${code}`);
}

function detailsOf(error: HttpsError): {reason?: string; status?: string | null; linkId?: string} {
  return (error.details ?? {}) as {reason?: string; status?: string | null; linkId?: string};
}

describe("permissão efetiva do vínculo", () => {
  it("motivo da recusa: sem vínculo, não ativo, chave desligada", () => {
    assert.equal(professorPermissionDenial(null, "canBookCourts"), "no_link");
    const on = defaultArenaProfessorPermissions("INDEPENDENT");
    for (const status of ["INVITED", "PENDING", "SUSPENDED", "ENDED", "REJECTED", "CANCELED", "EXPIRED"] as const) {
      assert.equal(professorPermissionDenial({status, permissions: on}, "canBookCourts"), "not_active", status);
    }
    assert.equal(
      professorPermissionDenial({status: "ACTIVE", permissions: {...on, canBookCourts: false}}, "canBookCourts"),
      "permission_off",
    );
    assert.equal(professorPermissionDenial({status: "ACTIVE", permissions: on}, "canBookCourts"), null);
  });

  it("recusa já vem com a mensagem da tela e o motivo em details", async () => {
    const {fake, db} = makeDb();
    seedLink(fake, "SUSPENDED");
    const error = await rejectsWith(
      requireArenaProfessorPermission(db, "a1", "uProf", "canManageOwnLessons"),
      "permission-denied",
    );
    assert.match(error.message, /Arena CFC está suspenso/);
    assert.deepEqual(detailsOf(error), {reason: "not_active", linkId: "a1_uProf", status: "SUSPENDED"});
  });

  it("vínculo de outra arena não vale aqui", async () => {
    const {fake, db} = makeDb();
    seedLink(fake, "ACTIVE", {}, "a2");
    const error = await rejectsWith(requireArenaProfessorPermission(db, "a1", "uProf", "canBookCourts"), "permission-denied");
    assert.equal(detailsOf(error).reason, "no_link");
    assert.deepEqual(
      [...await arenasWithProfessorPermission(db, ["a1", "a2", "a2", ""], "uProf", "canManageOwnLessons")],
      ["a2"],
    );
  });
});

describe("reserva como professor (canBookCourts)", () => {
  it("sem a flag é reserva de atleta: não lê vínculo nem carimba", async () => {
    const {db} = makeDb();
    // Sem vínculo nenhum: o atleta comum reserva como sempre.
    for (const flag of [undefined, false, "true", 1, null]) {
      assert.equal(await resolveProfessorBookingStamp(db, "a1", "uStranger", flag), null);
    }
  });

  it("com a flag e a permissão valendo: carimba a reserva", async () => {
    const {fake, db} = makeDb();
    seedLink(fake, "ACTIVE");
    assert.deepEqual(await resolveProfessorBookingStamp(db, "a1", "uProf", true), {
      bookedAs: "professor",
      professorLinkId: "a1_uProf",
      professorRelationshipType: "INDEPENDENT",
    });
  });

  it("com a flag e sem permissão: recusa e lembra que dá para reservar como atleta", async () => {
    const cases: Array<[string, (fake: FakeFirestore) => void, string]> = [
      ["sem vínculo", () => undefined, "no_link"],
      ["pedido em análise", (fake) => seedLink(fake, "PENDING"), "not_active"],
      ["suspenso", (fake) => seedLink(fake, "SUSPENDED"), "not_active"],
      ["encerrado", (fake) => seedLink(fake, "ENDED"), "not_active"],
      ["chave desligada", (fake) => seedLink(fake, "ACTIVE", {canBookCourts: false}), "permission_off"],
    ];
    for (const [label, seed, reason] of cases) {
      const {fake, db} = makeDb();
      seed(fake);
      const error = await rejectsWith(resolveProfessorBookingStamp(db, "a1", "uProf", true), "permission-denied");
      assert.equal(detailsOf(error).reason, reason, label);
      assert.match(error.message, /reservar como atleta/, label);
    }
  });

  it("segue as transições reais: aprovar libera, suspender corta, reativar devolve, desligar corta", async () => {
    const {db} = makeDb();
    await requestArenaProfessorLinkCore(db, {arenaId: "a1", relationshipType: "INDEPENDENT"}, PROF, NOW);
    await rejectsWith(resolveProfessorBookingStamp(db, "a1", "uProf", true), "permission-denied");

    await decideArenaProfessorRequestCore(db, {linkId: "a1_uProf", approve: true}, OWNER, NOW + 1);
    assert.equal((await resolveProfessorBookingStamp(db, "a1", "uProf", true))?.bookedAs, "professor");

    await suspendArenaProfessorLinkCore(db, {linkId: "a1_uProf", reason: "Inadimplência"}, OWNER, NOW + 2);
    await rejectsWith(resolveProfessorBookingStamp(db, "a1", "uProf", true), "permission-denied");

    await reactivateArenaProfessorLinkCore(db, {linkId: "a1_uProf"}, OWNER, NOW + 3);
    assert.equal((await resolveProfessorBookingStamp(db, "a1", "uProf", true))?.professorLinkId, "a1_uProf");

    await updateArenaProfessorPermissionsCore(db, {linkId: "a1_uProf", permissions: {canBookCourts: false}}, OWNER, NOW + 4);
    const error = await rejectsWith(resolveProfessorBookingStamp(db, "a1", "uProf", true), "permission-denied");
    assert.equal(detailsOf(error).reason, "permission_off");
    // Atleta continua reservando.
    assert.equal(await resolveProfessorBookingStamp(db, "a1", "uProf", undefined), null);
  });
});

describe("desconto do professor no aluguel de quadra", () => {
  it("vínculo antigo (sem o campo) não tem desconto", async () => {
    const {fake, db} = makeDb();
    seedLink(fake, "ACTIVE");
    assert.equal((await resolveProfessorBooking(db, "a1", "uProf", true))?.courtDiscountPercent, 0);
    assert.equal(await professorCourtDiscountForQuote(db, "a1", "uProf", true), 0);
  });

  it("a arena define o %; vale na reserva e na cotação só como professor", async () => {
    const {fake, db} = makeDb();
    seedLink(fake, "ACTIVE");
    const out = await updateArenaProfessorCourtDiscountCore(db, {linkId: "a1_uProf", courtDiscountPercent: 25}, OWNER, NOW);
    assert.equal(out.changed, true);
    assert.deepEqual(out.notices.map((n) => n.type), ["professor_link_court_discount_changed"]);
    assert.match(out.notices[0]!.body, /25% de desconto/);
    assert.equal((await resolveProfessorBooking(db, "a1", "uProf", true))?.courtDiscountPercent, 25);
    assert.equal(await professorCourtDiscountForQuote(db, "a1", "uProf", true), 25);
    assert.equal(await professorCourtDiscountForQuote(db, "a1", "uProf", undefined), 0);
    assert.equal(await resolveProfessorBooking(db, "a1", "uProf", false), null);
  });

  it("cotação não lança: sem vínculo válido é preço de atleta", async () => {
    const {fake, db} = makeDb();
    assert.equal(await professorCourtDiscountForQuote(db, "a1", "uProf", true), 0);
    fake.seedDoc("arenaProfessors/a1_uProf", {
      arenaId: "a1", professorUserId: "uProf", relationshipType: "INDEPENDENT", status: "SUSPENDED",
      permissions: defaultArenaProfessorPermissions("INDEPENDENT"), courtDiscountPercent: 30,
    });
    assert.equal(await professorCourtDiscountForQuote(db, "a1", "uProf", true), 0);
  });

  it("valida a faixa, o papel e o status; sem mudança não grava evento", async () => {
    const {fake, db} = makeDb();
    seedLink(fake, "ACTIVE");
    for (const bad of [-1, 91, 12.5, "20", null]) {
      await rejectsWith(
        updateArenaProfessorCourtDiscountCore(db, {linkId: "a1_uProf", courtDiscountPercent: bad}, OWNER, NOW),
        "invalid-argument",
      );
    }
    await rejectsWith(
      updateArenaProfessorCourtDiscountCore(db, {linkId: "a1_uProf", courtDiscountPercent: 20}, PROF, NOW),
      "permission-denied",
    );
    const noop = await updateArenaProfessorCourtDiscountCore(db, {linkId: "a1_uProf", courtDiscountPercent: 0}, OWNER, NOW);
    assert.equal(noop.changed, false);
    assert.deepEqual(noop.notices, []);

    seedLink(fake, "PENDING");
    await rejectsWith(
      updateArenaProfessorCourtDiscountCore(db, {linkId: "a1_uProf", courtDiscountPercent: 20}, OWNER, NOW),
      "failed-precondition",
    );
  });
});

describe("Aulas: escalar professor em turma nova", () => {
  it("sem conta, sem vínculo ou vínculo não estabelecido: não trava (professor de hoje)", async () => {
    const {fake, db} = makeDb();
    await assertTeacherLinkAllowsNewClass(db, "a1", {name: "Ju", userId: null});
    await assertTeacherLinkAllowsNewClass(db, "a1", {name: "Thiago", userId: "uProf"});
    for (const status of ["INVITED", "PENDING", "REJECTED", "CANCELED", "EXPIRED"] as const) {
      seedLink(fake, status);
      await assertTeacherLinkAllowsNewClass(db, "a1", {name: "Thiago", userId: "uProf"});
    }
    // A chave fala do professor agir; a arena escala quem quiser com vínculo ativo.
    seedLink(fake, "ACTIVE", {canManageOwnLessons: false});
    await assertTeacherLinkAllowsNewClass(db, "a1", {name: "Thiago", userId: "uProf"});
  });

  it("suspenso ou encerrado: recusa com o caminho para resolver", async () => {
    const {fake, db} = makeDb();
    seedLink(fake, "SUSPENDED");
    const suspended = await rejectsWith(
      assertTeacherLinkAllowsNewClass(db, "a1", {name: "Thiago", userId: "uProf"}),
      "failed-precondition",
    );
    assert.match(suspended.message, /Thiago com a arena está suspenso. Reative em Profissionais/);
    assert.equal(detailsOf(suspended).reason, "link_suspended");

    seedLink(fake, "ENDED");
    const ended = await rejectsWith(
      assertTeacherLinkAllowsNewClass(db, "a1", {name: "Thiago", userId: "uProf"}),
      "failed-precondition",
    );
    assert.match(ended.message, /encerrado. Convide de novo/);
    // Vínculo encerrado em outra arena não atrapalha esta.
    await assertTeacherLinkAllowsNewClass(db, "a2", {name: "Thiago", userId: "uProf"});
  });

  it("encerramento pelo próprio professor também trava turma nova", async () => {
    const {db} = makeDb();
    await requestArenaProfessorLinkCore(db, {arenaId: "a1", relationshipType: "ARENA_STAFF"}, PROF, NOW);
    await decideArenaProfessorRequestCore(db, {linkId: "a1_uProf", approve: true}, OWNER, NOW + 1);
    await assertTeacherLinkAllowsNewClass(db, "a1", {name: "Thiago", userId: "uProf"});
    await endArenaProfessorLinkCore(db, {linkId: "a1_uProf", side: "PROFESSOR"}, PROF, NOW + 2);
    await rejectsWith(assertTeacherLinkAllowsNewClass(db, "a1", {name: "Thiago", userId: "uProf"}), "failed-precondition");
  });
});
