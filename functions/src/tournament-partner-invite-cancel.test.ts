import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {Timestamp, type Firestore} from "firebase-admin/firestore";

import {FakeFirestore} from "./fake-firestore.test-helper";
import {INVITES_COLLECTION} from "./tournament-invite-constants";
import {cancelPendingPartnerInvitesForRegistrations} from
  "./tournament-partner-invite";

const NOW = 1_800_000_000_000;
const REASON = "registration_merged_by_organizer";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function seedInvite(
  fake: FakeFirestore,
  id: string,
  invite: Record<string, unknown>,
): void {
  fake.seedDoc(`${INVITES_COLLECTION}/${id}`, {
    tournamentId: "t1",
    categoryId: "cat-1",
    status: "pending",
    expiresAt: Timestamp.fromMillis(NOW + 48 * 3600_000),
    ...invite,
  });
}

function statusOf(fake: FakeFirestore, id: string): unknown {
  return fake.store.get(`${INVITES_COLLECTION}/${id}`)?.status;
}

function run(db: Firestore, targets: Array<{
  registrationId: string;
  ownerUid: string;
}>): Promise<number> {
  return cancelPendingPartnerInvitesForRegistrations({
    db,
    tournamentId: "t1",
    categoryId: "cat-1",
    targets,
    cancelReason: REASON,
  });
}

describe("cancelPendingPartnerInvitesForRegistrations", () => {
  it("mata o convite anexado à inscrição que recebeu a dupla", async () => {
    const {fake, db} = makeDb();
    seedInvite(fake, "inv-1", {
      attachRegistrationId: "reg-1",
      inviterUid: "uid-1",
    });

    const count = await run(db, [
      {registrationId: "reg-1", ownerUid: "uid-1"},
    ]);

    assert.equal(count, 1);
    assert.equal(statusOf(fake, "inv-1"), "cancelled");
    assert.equal(
      fake.store.get(`${INVITES_COLLECTION}/inv-1`)?.cancelReason,
      REASON,
    );
  });

  it("mata o convite avulso do dono na mesma categoria", async () => {
    // Pré-reserva: o convite não aponta para inscrição nenhuma ainda.
    const {fake, db} = makeDb();
    seedInvite(fake, "inv-1", {inviterUid: "uid-1"});

    const count = await run(db, [
      {registrationId: "reg-1", ownerUid: "uid-1"},
    ]);

    assert.equal(count, 1);
    assert.equal(statusOf(fake, "inv-1"), "cancelled");
  });

  it("mata também os da reserva solo apagada na fusão", async () => {
    // O caso que deixava convite órfão: a inscrição do outro atleta some, e
    // os convites dela apontavam para um documento que não existe mais.
    const {fake, db} = makeDb();
    seedInvite(fake, "inv-base", {
      attachRegistrationId: "reg-1",
      inviterUid: "uid-1",
    });
    seedInvite(fake, "inv-liberada", {
      attachRegistrationId: "reg-2",
      inviterUid: "uid-2",
    });

    const count = await run(db, [
      {registrationId: "reg-1", ownerUid: "uid-1"},
      {registrationId: "reg-2", ownerUid: "uid-2"},
    ]);

    assert.equal(count, 2);
    assert.equal(statusOf(fake, "inv-base"), "cancelled");
    assert.equal(statusOf(fake, "inv-liberada"), "cancelled");
  });

  it("não encosta em convite de terceiro nem de outra categoria", async () => {
    const {fake, db} = makeDb();
    seedInvite(fake, "outro-dono", {inviterUid: "uid-9"});
    seedInvite(fake, "outra-categoria", {
      inviterUid: "uid-1",
      categoryId: "cat-2",
    });
    seedInvite(fake, "outra-inscricao", {
      attachRegistrationId: "reg-9",
      inviterUid: "uid-1",
    });

    const count = await run(db, [
      {registrationId: "reg-1", ownerUid: "uid-1"},
    ]);

    assert.equal(count, 0);
    assert.equal(statusOf(fake, "outro-dono"), "pending");
    assert.equal(statusOf(fake, "outra-categoria"), "pending");
    assert.equal(statusOf(fake, "outra-inscricao"), "pending");
  });

  it("convite de substituição não forma elenco e sobrevive", async () => {
    const {fake, db} = makeDb();
    seedInvite(fake, "sub", {
      attachRegistrationId: "reg-1",
      inviterUid: "uid-1",
      isSubstitutionInvite: true,
    });

    const count = await run(db, [
      {registrationId: "reg-1", ownerUid: "uid-1"},
    ]);

    assert.equal(count, 0);
    assert.equal(statusOf(fake, "sub"), "pending");
  });

  it("convite já respondido não volta atrás", async () => {
    const {fake, db} = makeDb();
    seedInvite(fake, "aceito", {
      attachRegistrationId: "reg-1",
      inviterUid: "uid-1",
      status: "accepted",
    });

    const count = await run(db, [
      {registrationId: "reg-1", ownerUid: "uid-1"},
    ]);

    assert.equal(count, 0);
    assert.equal(statusOf(fake, "aceito"), "accepted");
  });

  it("sem dono conhecido ainda mata o anexado, mas não o avulso", async () => {
    // Dono vazio não pode casar por `inviterUid` — bateria com convite
    // malformado. O anexado casa por id e não depende do dono.
    const {fake, db} = makeDb();
    seedInvite(fake, "anexado", {attachRegistrationId: "reg-2"});
    seedInvite(fake, "avulso-malformado", {inviterUid: ""});

    const count = await run(db, [{registrationId: "reg-2", ownerUid: ""}]);

    assert.equal(count, 1);
    assert.equal(statusOf(fake, "anexado"), "cancelled");
    assert.equal(statusOf(fake, "avulso-malformado"), "pending");
  });

  it("alvo sem dono é ignorado, não vira casamento vazio", async () => {
    // Dono vazio casaria com convite malformado (`inviterUid` ausente).
    const {fake, db} = makeDb();
    seedInvite(fake, "malformado", {inviterUid: ""});

    const count = await run(db, [{registrationId: "", ownerUid: ""}]);

    assert.equal(count, 0);
    assert.equal(statusOf(fake, "malformado"), "pending");
  });
});
