import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  PROFESSOR_INVITE_TTL_MS,
  arenaProfessorLinkId,
  arenaProfessorNotices,
  cancelArenaProfessorLinkCore,
  createArenaProfessorInviteCore,
  decideArenaProfessorRequestCore,
  defaultArenaProfessorPermissions,
  effectiveArenaProfessorPermissions,
  endArenaProfessorLinkCore,
  isArenaProfessorInviteExpired,
  parseArenaProfessorPermissions,
  professorModalitiesFromUser,
  reactivateArenaProfessorLinkCore,
  requestArenaProfessorLinkCore,
  respondToArenaProfessorInviteCore,
  suspendArenaProfessorLinkCore,
  updateArenaProfessorPermissionsCore,
  type CallerContext,
} from "./arena-professor-links";

const NOW = Date.UTC(2026, 9, 20, 13, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

const OWNER: CallerContext = {uid: "uOwner", isSuperAdmin: false};
const GESTOR: CallerContext = {uid: "uGestor", isSuperAdmin: false};
const RECEPCAO: CallerContext = {uid: "uRecepcao", isSuperAdmin: false};
const OTHER_OWNER: CallerContext = {uid: "uOtherOwner", isSuperAdmin: false};
const PROF: CallerContext = {uid: "uProf", isSuperAdmin: false};
const STRANGER: CallerContext = {uid: "uStranger", isSuperAdmin: false};
const ADMIN: CallerContext = {uid: "uAdmin", isSuperAdmin: true};

const LINK_A1 = arenaProfessorLinkId("a1", "uProf");
const LINK_A2 = arenaProfessorLinkId("a2", "uProf");

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc("arenas/a1", {
    name: "Arena CFC",
    city: "Aparecida de Goiânia",
    state: "GO",
    logoUrl: "https://img/cfc.png",
    managerUserId: "uOwner",
    planTier: "pro",
    planStatus: "active",
  });
  fake.seedDoc("arenas/a2", {name: "Arena Norte", managerUserId: "uOtherOwner"});
  fake.seedDoc("arenas/unclaimed", {name: "Arena Sem Dono"});
  fake.seedDoc("arenas/a1/staff/uGestor", {role: "gestor", status: "active"});
  fake.seedDoc("arenas/a1/staff/uRecepcao", {role: "recepcao", status: "active"});
  fake.seedDoc("users/uOwner", {fullName: "Ana Souza"});
  fake.seedDoc("users/uGestor", {fullName: "Ricardo Prado"});
  fake.seedDoc("users/uOtherOwner", {fullName: "Carla Nogueira"});
  fake.seedDoc("users/uStranger", {fullName: "Fulano"});
  fake.seedDoc("users/uProf", {
    fullName: "Thiago Mendes",
    profilePhotoUrl: "https://img/thiago.png",
    sportOnboarding: {primarySportId: "BEACH_TENNIS", levelsBySport: {BEACH_TENNIS: "x", VOLEI_PRAIA: "y"}},
  });
  return {fake, db: fake as unknown as Firestore};
}

function link(fake: FakeFirestore, linkId = LINK_A1): DocData {
  const data = fake.store.get(`arenaProfessors/${linkId}`);
  assert.ok(data, `vínculo ${linkId} deveria existir`);
  return data;
}

function events(fake: FakeFirestore, linkId = LINK_A1): DocData[] {
  return [...fake.store.entries()]
    .filter(([path]) => path.startsWith(`arenaProfessors/${linkId}/events/`))
    .map(([, data]) => data);
}

function publicDoc(fake: FakeFirestore, arenaId = "a1", uid = "uProf"): DocData | undefined {
  return fake.store.get(`arenas/${arenaId}/publicProfessors/${uid}`);
}

async function rejectsWith(promise: Promise<unknown>, code: string, detailsStatus?: string): Promise<HttpsError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof HttpsError, `esperava HttpsError, veio ${String(error)}`);
    assert.equal(error.code, code, error.message);
    if (detailsStatus) {
      assert.equal((error.details as {status?: string} | undefined)?.status, detailsStatus);
    }
    return error;
  }
  assert.fail(`esperava ${code}`);
}

async function invite(db: Firestore, overrides: Record<string, unknown> = {}, caller = OWNER, nowMs = NOW) {
  return createArenaProfessorInviteCore(db, {
    arenaId: "a1",
    professorUserId: "uProf",
    relationshipType: "ARENA_STAFF",
    ...overrides,
  }, caller, nowMs);
}

async function request(db: Firestore, overrides: Record<string, unknown> = {}, nowMs = NOW) {
  return requestArenaProfessorLinkCore(db, {
    arenaId: "a1",
    relationshipType: "INDEPENDENT",
    message: "Tenho 8 alunos particulares.",
    ...overrides,
  }, PROF, nowMs);
}

describe("regras puras do vínculo", () => {
  it("permissões padrão por tipo: independente fica fora do perfil público", () => {
    assert.deepEqual(defaultArenaProfessorPermissions("ARENA_STAFF"), {
      canManageOwnLessons: true,
      canBookCourts: true,
      canAppearInArenaProfile: true,
      canEnrollStudents: false,
      canScheduleLessons: false,
      canCancelLessons: false,
    });
    assert.equal(defaultArenaProfessorPermissions("INDEPENDENT").canAppearInArenaProfile, false);
  });

  it("parse aceita só booleanos das chaves conhecidas e ignora o resto", () => {
    const parsed = parseArenaProfessorPermissions(
      {canBookCourts: false, isArenaAdmin: true, canSeeFinance: true},
      "ARENA_STAFF",
    );
    assert.deepEqual(parsed, {canManageOwnLessons: true, canBookCourts: false, canAppearInArenaProfile: true, canEnrollStudents: false, canScheduleLessons: false, canCancelLessons: false});
    assert.equal("isArenaAdmin" in parsed, false);
    assert.throws(() => parseArenaProfessorPermissions({canBookCourts: "sim"}, "INDEPENDENT"), HttpsError);
    assert.throws(() => parseArenaProfessorPermissions([true], "INDEPENDENT"), HttpsError);
  });

  it("permissão só vale com ACTIVE", () => {
    const permissions = defaultArenaProfessorPermissions("ARENA_STAFF");
    for (const status of ["INVITED", "PENDING", "SUSPENDED", "ENDED", "REJECTED", "CANCELED", "EXPIRED"]) {
      assert.deepEqual(
        effectiveArenaProfessorPermissions({status, permissions}),
        {canManageOwnLessons: false, canBookCourts: false, canAppearInArenaProfile: false, canEnrollStudents: false, canScheduleLessons: false, canCancelLessons: false},
        status,
      );
    }
    assert.deepEqual(effectiveArenaProfessorPermissions({status: "ACTIVE", relationshipType: "ARENA_STAFF", permissions}), permissions);
  });

  it("convite vence no prazo, e só convite vence", () => {
    const expiresAt = {toMillis: () => NOW};
    assert.equal(isArenaProfessorInviteExpired({status: "INVITED", expiresAt}, NOW - 1), false);
    assert.equal(isArenaProfessorInviteExpired({status: "INVITED", expiresAt}, NOW), true);
    assert.equal(isArenaProfessorInviteExpired({status: "PENDING", expiresAt}, NOW + DAY), false);
  });

  it("modalidades vêm do perfil esportivo, sem repetir", () => {
    assert.deepEqual(
      professorModalitiesFromUser({sportOnboarding: {primarySportId: "BEACH_TENNIS", levelsBySport: {BEACH_TENNIS: "a", VOLEI_PRAIA: "b"}}}),
      ["Beach tennis", "Vôlei de praia"],
    );
    assert.deepEqual(professorModalitiesFromUser({}), []);
  });

  it("aviso ao professor nunca leva tipo com 'arena' (o app antigo abriria a agenda do gestor)", () => {
    const sample = {arenaName: "Arena CFC", professorName: "Thiago", relationshipType: "INDEPENDENT" as const};
    const events = ["INVITED", "APPROVED", "REJECTED", "SUSPENDED", "REACTIVATED", "ENDED", "PERMISSIONS_CHANGED"] as const;
    for (const event of events) {
      for (const notice of arenaProfessorNotices(event, sample, "ARENA", null)) {
        if (notice.to !== "professor") continue;
        assert.ok(notice.type.startsWith("professor_link_"), notice.type);
        assert.equal(notice.type.includes("arena"), false, notice.type);
      }
    }
  });
});

describe("convite pela arena", () => {
  it("cria INVITED com prazo de 7 dias, sem permissão efetiva, e registra o evento", async () => {
    const {fake, db} = makeDb();
    const result = await invite(db, {permissions: {canAppearInArenaProfile: false}, message: "Queremos você no time"});
    assert.equal(result.status, "INVITED");
    assert.equal(result.linkId, LINK_A1);
    const doc = link(fake);
    assert.equal(doc["initiatedBy"], "ARENA");
    assert.equal(doc["cycle"], 1);
    assert.equal(doc["professorName"], "Thiago Mendes");
    assert.equal(doc["arenaName"], "Arena CFC");
    assert.equal(doc["arenaCity"], "Aparecida de Goiânia · GO");
    assert.equal(doc["invitedByName"], "Ana Souza");
    assert.deepEqual(doc["professorModalities"], ["Beach tennis", "Vôlei de praia"]);
    assert.equal((doc["expiresAt"] as {toMillis(): number}).toMillis(), NOW + PROFESSOR_INVITE_TTL_MS);
    assert.deepEqual(doc["permissions"], {canManageOwnLessons: true, canBookCourts: true, canAppearInArenaProfile: false, canEnrollStudents: false, canScheduleLessons: false, canCancelLessons: false});
    assert.deepEqual(events(fake).map((e) => e["eventType"]), ["INVITED"]);
    assert.equal(publicDoc(fake), undefined);
    assert.deepEqual(result.notices.map((n) => [n.to, n.type]), [["professor", "professor_link_invite"]]);
  });

  it("gestor convida; recepção, dono de outra arena e qualquer um não", async () => {
    const {db} = makeDb();
    await rejectsWith(invite(db, {}, RECEPCAO), "permission-denied");
    await rejectsWith(invite(db, {}, OTHER_OWNER), "permission-denied");
    await rejectsWith(invite(db, {}, STRANGER), "permission-denied");
    const result = await invite(db, {}, GESTOR);
    assert.equal(result.status, "INVITED");
  });

  it("superadmin atua como suporte e fica marcado no histórico", async () => {
    const {fake, db} = makeDb();
    await invite(db, {}, ADMIN);
    assert.equal(events(fake)[0]?.["actorRole"], "ADMIN");
    assert.equal(events(fake)[0]?.["actorName"], "Suporte NexaGO");
  });

  it("convite duplicado não cria outro: devolve o vínculo aberto", async () => {
    const {fake, db} = makeDb();
    await invite(db);
    const error = await rejectsWith(invite(db), "already-exists", "INVITED");
    assert.equal((error.details as {linkId?: string}).linkId, LINK_A1);
    assert.equal(events(fake).length, 1);
  });

  it("convidar quem já pediu manda analisar a solicitação", async () => {
    const {db} = makeDb();
    await request(db);
    await rejectsWith(invite(db), "failed-precondition", "PENDING");
  });

  it("valida tipo e conta", async () => {
    const {db} = makeDb();
    await rejectsWith(invite(db, {relationshipType: "ADMIN"}), "invalid-argument");
    await rejectsWith(invite(db, {professorUserId: ""}), "invalid-argument");
    await rejectsWith(invite(db, {professorUserId: "uNaoExiste"}), "not-found");
  });

  it("convite vencido é marcado EXPIRED e o convite novo reabre o mesmo vínculo", async () => {
    const {fake, db} = makeDb();
    await invite(db);
    const later = NOW + PROFESSOR_INVITE_TTL_MS + DAY;
    const again = await invite(db, {relationshipType: "INDEPENDENT"}, OWNER, later);
    assert.equal(again.status, "INVITED");
    const doc = link(fake);
    assert.equal(doc["cycle"], 2);
    assert.equal(doc["relationshipType"], "INDEPENDENT");
    assert.equal((doc["expiresAt"] as {toMillis(): number}).toMillis(), later + PROFESSOR_INVITE_TTL_MS);
    assert.deepEqual(events(fake).map((e) => e["eventType"]).sort(), ["EXPIRED", "INVITED", "INVITED"]);
  });
});

describe("solicitação pelo professor", () => {
  it("cria PENDING com a proposta padrão do tipo, ignorando permissão mandada pelo cliente", async () => {
    const {fake, db} = makeDb();
    const result = await requestArenaProfessorLinkCore(db, {
      arenaId: "a1",
      relationshipType: "INDEPENDENT",
      // O cliente não escolhe permissão — o campo nem é lido.
      ...({permissions: {canAppearInArenaProfile: true}} as object),
    } as {arenaId: string; relationshipType: unknown}, PROF, NOW);
    assert.equal(result.status, "PENDING");
    const doc = link(fake);
    assert.equal(doc["initiatedBy"], "PROFESSOR");
    assert.equal(doc["expiresAt"], null);
    assert.deepEqual(doc["permissions"], defaultArenaProfessorPermissions("INDEPENDENT"));
    assert.deepEqual(effectiveArenaProfessorPermissions(doc), {
      canManageOwnLessons: false,
      canBookCourts: false,
      canAppearInArenaProfile: false,
      canEnrollStudents: false,
      canScheduleLessons: false,
      canCancelLessons: false,
    });
    assert.deepEqual(result.notices.map((n) => [n.to, n.type]), [["arena", "arena_professor_request"]]);
  });

  it("pedido duplicado devolve already-exists com o status atual (tela M5)", async () => {
    const {fake, db} = makeDb();
    await request(db);
    await rejectsWith(request(db), "already-exists", "PENDING");
    assert.equal(events(fake).length, 1);
  });

  it("com convite em aberto, manda responder o convite", async () => {
    const {db} = makeDb();
    await invite(db);
    await rejectsWith(request(db), "failed-precondition", "INVITED");
  });

  it("arena sem gestor na NexaGO não recebe pedido", async () => {
    const {db} = makeDb();
    await rejectsWith(request(db, {arenaId: "unclaimed"}), "failed-precondition");
    await rejectsWith(request(db, {arenaId: "naoexiste"}), "not-found");
  });
});

describe("resposta ao convite", () => {
  it("aceitar ativa o vínculo e publica na página da arena (equipe)", async () => {
    const {fake, db} = makeDb();
    await invite(db);
    const result = await respondToArenaProfessorInviteCore(db, {linkId: LINK_A1, accept: true}, PROF, NOW + DAY);
    assert.equal(result.status, "ACTIVE");
    const doc = link(fake);
    assert.equal(doc["approvedByName"], "Ana Souza");
    assert.deepEqual(publicDoc(fake)?.["name"], "Thiago Mendes");
    assert.deepEqual(publicDoc(fake)?.["relationshipType"], "ARENA_STAFF");
    assert.deepEqual(result.notices.map((n) => [n.to, n.type]), [["arena", "arena_professor_invite_accepted"]]);
  });

  it("independente sem 'aparecer no perfil' não vai para a página pública", async () => {
    const {fake, db} = makeDb();
    await invite(db, {relationshipType: "INDEPENDENT"});
    await respondToArenaProfessorInviteCore(db, {linkId: LINK_A1, accept: true}, PROF, NOW);
    assert.equal(publicDoc(fake), undefined);
  });

  it("recusar grava REJECTED com o motivo", async () => {
    const {fake, db} = makeDb();
    await invite(db);
    const result = await respondToArenaProfessorInviteCore(
      db, {linkId: LINK_A1, accept: false, reason: "Sem horário"}, PROF, NOW,
    );
    assert.equal(result.status, "REJECTED");
    assert.equal(link(fake)["rejectionReason"], "Sem horário");
    assert.deepEqual(result.notices.map((n) => n.type), ["arena_professor_invite_declined"]);
  });

  it("só o professor convidado responde", async () => {
    const {db} = makeDb();
    await invite(db);
    await rejectsWith(respondToArenaProfessorInviteCore(db, {linkId: LINK_A1, accept: true}, STRANGER, NOW), "permission-denied");
    await rejectsWith(respondToArenaProfessorInviteCore(db, {linkId: LINK_A1, accept: true}, OWNER, NOW), "permission-denied");
  });

  it("convite vencido não ativa: vira EXPIRED e explica", async () => {
    const {fake, db} = makeDb();
    await invite(db);
    await rejectsWith(
      respondToArenaProfessorInviteCore(db, {linkId: LINK_A1, accept: true}, PROF, NOW + PROFESSOR_INVITE_TTL_MS),
      "failed-precondition",
      "EXPIRED",
    );
    assert.equal(link(fake)["status"], "EXPIRED");
    assert.equal(events(fake).filter((e) => e["eventType"] === "EXPIRED").length, 1);
    assert.equal(publicDoc(fake), undefined);
  });

  it("não responde pedido (PENDING) como se fosse convite", async () => {
    const {db} = makeDb();
    await request(db);
    await rejectsWith(respondToArenaProfessorInviteCore(db, {linkId: LINK_A1, accept: true}, PROF, NOW), "failed-precondition", "PENDING");
  });
});

describe("decisão da arena sobre o pedido", () => {
  it("aprovar com as permissões escolhidas", async () => {
    const {fake, db} = makeDb();
    await request(db);
    const result = await decideArenaProfessorRequestCore(db, {
      linkId: LINK_A1,
      approve: true,
      permissions: {canManageOwnLessons: true, canBookCourts: true, canAppearInArenaProfile: true},
    }, GESTOR, NOW);
    assert.equal(result.status, "ACTIVE");
    assert.equal(link(fake)["approvedByName"], "Ricardo Prado");
    assert.equal(publicDoc(fake)?.["relationshipType"], "INDEPENDENT");
    const approved = events(fake).find((e) => e["eventType"] === "APPROVED");
    assert.equal(approved?.["actorRole"], "ARENA");
    assert.deepEqual(result.notices.map((n) => n.type), ["professor_link_approved"]);
  });

  it("rejeitar e não decidir duas vezes", async () => {
    const {fake, db} = makeDb();
    await request(db);
    await decideArenaProfessorRequestCore(db, {linkId: LINK_A1, approve: false, reason: "Grade cheia"}, OWNER, NOW);
    assert.equal(link(fake)["status"], "REJECTED");
    assert.equal(link(fake)["rejectionReason"], "Grade cheia");
    await rejectsWith(
      decideArenaProfessorRequestCore(db, {linkId: LINK_A1, approve: true}, OWNER, NOW),
      "failed-precondition",
      "REJECTED",
    );
  });

  it("gestor de outra arena não decide", async () => {
    const {db} = makeDb();
    await request(db);
    await rejectsWith(decideArenaProfessorRequestCore(db, {linkId: LINK_A1, approve: true}, OTHER_OWNER, NOW), "permission-denied");
    await rejectsWith(decideArenaProfessorRequestCore(db, {linkId: LINK_A1, approve: true}, PROF, NOW), "permission-denied");
  });
});

async function activeStaffLink(db: Firestore): Promise<void> {
  await invite(db);
  await respondToArenaProfessorInviteCore(db, {linkId: LINK_A1, accept: true}, PROF, NOW);
}

describe("vínculo ativo: suspender, reativar, encerrar, permissões", () => {
  it("suspender exige motivo, revoga e tira da página pública; reativar devolve", async () => {
    const {fake, db} = makeDb();
    await activeStaffLink(db);
    await rejectsWith(suspendArenaProfessorLinkCore(db, {linkId: LINK_A1}, OWNER, NOW), "invalid-argument");
    const suspended = await suspendArenaProfessorLinkCore(
      db, {linkId: LINK_A1, reason: "Pendência de pagamento", details: "3 reservas em aberto"}, OWNER, NOW,
    );
    assert.equal(suspended.status, "SUSPENDED");
    assert.equal(link(fake)["suspensionDetails"], "3 reservas em aberto");
    assert.equal(publicDoc(fake), undefined);
    assert.match(suspended.notices[0]?.body ?? "", /Pendência de pagamento — 3 reservas em aberto/);
    // As permissões configuradas ficam; só deixam de valer.
    assert.equal((link(fake)["permissions"] as DocData)["canBookCourts"], true);

    const reactivated = await reactivateArenaProfessorLinkCore(db, {linkId: LINK_A1}, OWNER, NOW);
    assert.equal(reactivated.status, "ACTIVE");
    assert.equal(link(fake)["suspensionReason"], null);
    assert.ok(publicDoc(fake));
    await rejectsWith(reactivateArenaProfessorLinkCore(db, {linkId: LINK_A1}, OWNER, NOW), "failed-precondition", "ACTIVE");
  });

  it("professor encerra o próprio vínculo na hora e a arena é avisada", async () => {
    const {fake, db} = makeDb();
    await activeStaffLink(db);
    const ended = await endArenaProfessorLinkCore(db, {linkId: LINK_A1, side: "PROFESSOR", reason: "Mudei de cidade"}, PROF, NOW);
    assert.equal(ended.status, "ENDED");
    assert.equal(link(fake)["endedBySide"], "PROFESSOR");
    assert.equal(publicDoc(fake), undefined);
    assert.deepEqual(ended.notices.map((n) => [n.to, n.type]), [["arena", "arena_professor_ended"]]);
    await rejectsWith(endArenaProfessorLinkCore(db, {linkId: LINK_A1, side: "ARENA"}, OWNER, NOW), "failed-precondition", "ENDED");
  });

  it("encerrar como professor exige ser o professor; como arena, ser gestor", async () => {
    const {db} = makeDb();
    await activeStaffLink(db);
    await rejectsWith(endArenaProfessorLinkCore(db, {linkId: LINK_A1, side: "PROFESSOR"}, OWNER, NOW), "permission-denied");
    await rejectsWith(endArenaProfessorLinkCore(db, {linkId: LINK_A1, side: "ARENA"}, PROF, NOW), "permission-denied");
    await rejectsWith(endArenaProfessorLinkCore(db, {linkId: LINK_A1, side: "X"}, PROF, NOW), "invalid-argument");
  });

  it("arena encerra vínculo suspenso", async () => {
    const {fake, db} = makeDb();
    await activeStaffLink(db);
    await suspendArenaProfessorLinkCore(db, {linkId: LINK_A1, reason: "Descumprimento de regras"}, OWNER, NOW);
    const ended = await endArenaProfessorLinkCore(db, {linkId: LINK_A1, side: "ARENA"}, GESTOR, NOW);
    assert.equal(ended.status, "ENDED");
    assert.equal(link(fake)["endedBySide"], "ARENA");
    assert.deepEqual(ended.notices.map((n) => n.type), ["professor_link_ended"]);
  });

  it("permissões: patch parcial vira evento com o que mudou; sem mudança não grava nada", async () => {
    const {fake, db} = makeDb();
    await activeStaffLink(db);
    const changed = await updateArenaProfessorPermissionsCore(
      db, {linkId: LINK_A1, permissions: {canAppearInArenaProfile: false}}, OWNER, NOW,
    );
    assert.deepEqual(changed.changed, ["canAppearInArenaProfile"]);
    assert.deepEqual(link(fake)["permissions"], {canManageOwnLessons: true, canBookCourts: true, canAppearInArenaProfile: false, canEnrollStudents: false, canScheduleLessons: false, canCancelLessons: false});
    assert.equal(publicDoc(fake), undefined);
    const event = events(fake).find((e) => e["eventType"] === "PERMISSIONS_CHANGED");
    assert.deepEqual((event?.["metadata"] as DocData)["changed"], ["canAppearInArenaProfile"]);
    assert.deepEqual(changed.notices.map((n) => n.type), ["professor_link_permissions_changed"]);

    const before = events(fake).length;
    const noop = await updateArenaProfessorPermissionsCore(
      db, {linkId: LINK_A1, permissions: {canAppearInArenaProfile: false}}, OWNER, NOW,
    );
    assert.deepEqual(noop.changed, []);
    assert.deepEqual(noop.notices, []);
    assert.equal(events(fake).length, before);

    await rejectsWith(updateArenaProfessorPermissionsCore(db, {linkId: LINK_A1, permissions: "tudo"}, OWNER, NOW), "invalid-argument");
    await rejectsWith(updateArenaProfessorPermissionsCore(db, {linkId: LINK_A1, permissions: {}}, PROF, NOW), "permission-denied");
  });

  it("não mexe em permissão de convite ainda aberto", async () => {
    const {db} = makeDb();
    await invite(db);
    await rejectsWith(
      updateArenaProfessorPermissionsCore(db, {linkId: LINK_A1, permissions: {canBookCourts: false}}, OWNER, NOW),
      "failed-precondition",
      "INVITED",
    );
  });
});

describe("cancelamento e nova tentativa", () => {
  it("arena cancela o próprio convite; professor cancela o próprio pedido; cruzado não", async () => {
    const {fake, db} = makeDb();
    await invite(db);
    await rejectsWith(cancelArenaProfessorLinkCore(db, {linkId: LINK_A1, side: "PROFESSOR"}, PROF, NOW), "failed-precondition", "INVITED");
    const canceled = await cancelArenaProfessorLinkCore(db, {linkId: LINK_A1, side: "ARENA"}, OWNER, NOW);
    assert.equal(canceled.status, "CANCELED");

    await request(db);
    assert.equal(link(fake)["status"], "PENDING");
    await rejectsWith(cancelArenaProfessorLinkCore(db, {linkId: LINK_A1, side: "ARENA"}, OWNER, NOW), "failed-precondition", "PENDING");
    const mine = await cancelArenaProfessorLinkCore(db, {linkId: LINK_A1, side: "PROFESSOR"}, PROF, NOW);
    assert.equal(mine.status, "CANCELED");
  });

  it("depois de encerrado, novo pedido reabre o mesmo doc (cycle 2) sem herdar datas e motivos", async () => {
    const {fake, db} = makeDb();
    await activeStaffLink(db);
    await endArenaProfessorLinkCore(db, {linkId: LINK_A1, side: "ARENA", reason: "Fim da parceria"}, OWNER, NOW);
    const createdAt = link(fake)["createdAt"];
    await request(db, {}, NOW + DAY);
    const doc = link(fake);
    assert.equal(doc["status"], "PENDING");
    assert.equal(doc["cycle"], 2);
    assert.equal(doc["endedReason"], null);
    assert.equal(doc["approvedAt"], null);
    assert.equal(doc["invitedAt"], null);
    assert.equal(doc["createdAt"], createdAt);
    // Histórico das duas rodadas preservado.
    assert.deepEqual(
      events(fake).map((e) => `${e["cycle"]}:${e["eventType"]}`).sort(),
      ["1:ACCEPTED", "1:ENDED", "1:INVITED", "2:REQUESTED"],
    );
  });
});

describe("isolamento entre arenas", () => {
  it("suspender numa arena não toca no vínculo do mesmo professor em outra", async () => {
    const {fake, db} = makeDb();
    await activeStaffLink(db);
    await requestArenaProfessorLinkCore(db, {arenaId: "a2", relationshipType: "INDEPENDENT"}, PROF, NOW);
    await decideArenaProfessorRequestCore(db, {linkId: LINK_A2, approve: true}, OTHER_OWNER, NOW);
    await suspendArenaProfessorLinkCore(db, {linkId: LINK_A1, reason: "Outro"}, OWNER, NOW);
    assert.equal(link(fake, LINK_A1)["status"], "SUSPENDED");
    assert.equal(link(fake, LINK_A2)["status"], "ACTIVE");
    assert.equal(link(fake, LINK_A2)["relationshipType"], "INDEPENDENT");
    assert.equal(link(fake, LINK_A1)["relationshipType"], "ARENA_STAFF");
    // E o dono da arena 1 não administra o vínculo da arena 2.
    await rejectsWith(suspendArenaProfessorLinkCore(db, {linkId: LINK_A2, reason: "x"}, OWNER, NOW), "permission-denied");
  });
});

describe("papel professor (claim) ao ativar o vínculo", () => {
  function spyGranter(): {granted: string[]; grant: (db: Firestore, uid: string) => Promise<void>} {
    const granted: string[] = [];
    return {granted, grant: async (_db, uid) => {
      granted.push(uid);
    }};
  }

  it("aceite do convite concede; recusa não", async () => {
    const {db} = makeDb();
    await invite(db);
    const spy = spyGranter();
    await respondToArenaProfessorInviteCore(db, {linkId: LINK_A1, accept: true}, PROF, NOW, spy.grant);
    assert.deepEqual(spy.granted, ["uProf"]);

    const other = makeDb();
    await invite(other.db);
    const declined = spyGranter();
    await respondToArenaProfessorInviteCore(other.db, {linkId: LINK_A1, accept: false}, PROF, NOW, declined.grant);
    assert.deepEqual(declined.granted, []);
  });

  it("convite vencido não concede", async () => {
    const {db} = makeDb();
    await invite(db);
    const spy = spyGranter();
    await rejectsWith(
      respondToArenaProfessorInviteCore(db, {linkId: LINK_A1, accept: true}, PROF, NOW + PROFESSOR_INVITE_TTL_MS, spy.grant),
      "failed-precondition",
    );
    assert.deepEqual(spy.granted, []);
  });

  it("aprovação do pedido concede ao professor (não a quem aprovou); rejeição não", async () => {
    const {db} = makeDb();
    await request(db);
    const spy = spyGranter();
    await decideArenaProfessorRequestCore(db, {linkId: LINK_A1, approve: true}, GESTOR, NOW, spy.grant);
    assert.deepEqual(spy.granted, ["uProf"]);

    const other = makeDb();
    await request(other.db);
    const rejected = spyGranter();
    await decideArenaProfessorRequestCore(other.db, {linkId: LINK_A1, approve: false}, OWNER, NOW, rejected.grant);
    assert.deepEqual(rejected.granted, []);
  });

  it("reativação concede de novo (autocura se a concessão da ativação falhou)", async () => {
    const {db} = makeDb();
    await activeStaffLink(db);
    await suspendArenaProfessorLinkCore(db, {linkId: LINK_A1, reason: "Pendência"}, OWNER, NOW);
    const spy = spyGranter();
    await reactivateArenaProfessorLinkCore(db, {linkId: LINK_A1}, OWNER, NOW, spy.grant);
    assert.deepEqual(spy.granted, ["uProf"]);
  });
});
