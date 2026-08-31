import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {Timestamp, type Firestore} from "firebase-admin/firestore";

import {FakeFirestore} from "./fake-firestore.test-helper";
import {artifactsInscriptionsPath} from "./firebase-paths";
import {INVITES_COLLECTION} from "./tournament-invite-constants";
import {refreshRegistrationHold} from "./tournament-registration-hold-ops";

const PROJECT = "proj";
const NOW = 1_800_000_000_000;
const MIN = 60 * 1000;
const REG_ID = "reg-1";
const REG_PATH = `${artifactsInscriptionsPath(PROJECT)}/${REG_ID}`;

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

/** Torneio sem os campos de prazo: vale o padrão de 30 minutos ligado. */
function seedTournament(fake: FakeFirestore): void {
  fake.seedDoc("tournaments/t1", {name: "Etapa 1"});
}

function seedRegistration(
  fake: FakeFirestore,
  registration: Record<string, unknown>,
): void {
  fake.seedDoc(REG_PATH, {
    tournamentId: "t1",
    categoryId: "cat-1",
    player1Id: "uid-1",
    ...registration,
  });
}

function holdMsOf(fake: FakeFirestore): number | null {
  const raw = fake.store.get(REG_PATH)?.holdExpiresAt;
  if (!(raw instanceof Timestamp)) return null;
  return raw.toMillis();
}

describe("refreshRegistrationHold", () => {
  it("carimba o prazo em inscrição SEM o campo — é o que recupera as que " +
    "perderam o prazo por uma confirmação parcial", async () => {
    const {fake, db} = makeDb();
    seedTournament(fake);
    // Retrato de quem foi mordido pelo buraco: um atleta marcado em categoria
    // gratuita, o campo apagado, a dupla ainda incompleta.
    seedRegistration(fake, {isPaid: false, sharePaidUids: ["uid-1"]});
    assert.equal(holdMsOf(fake), null);

    await refreshRegistrationHold(db, PROJECT, REG_ID, NOW);

    assert.equal(holdMsOf(fake), NOW + 30 * MIN);
  });

  it("parcela do pagamento direto volta a ter prazo", async () => {
    const {fake, db} = makeDb();
    seedTournament(fake);
    seedRegistration(fake, {
      isPaid: false,
      paidAmount: 0,
      paymentChannel: "directOrganizer",
      sharePaidUids: ["uid-1"],
    });

    await refreshRegistrationHold(db, PROJECT, REG_ID, NOW);

    assert.equal(holdMsOf(fake), NOW + 30 * MIN);
  });

  it("dinheiro de verdade NÃO ganha prazo nenhum", async () => {
    const {fake, db} = makeDb();
    seedTournament(fake);
    seedRegistration(fake, {isPaid: false, paidAmount: 5000});

    await refreshRegistrationHold(db, PROJECT, REG_ID, NOW);

    assert.equal(holdMsOf(fake), null);
  });

  it("baixa do organizador por atleta NÃO ganha prazo nenhum", async () => {
    const {fake, db} = makeDb();
    seedTournament(fake);
    seedRegistration(fake, {
      isPaid: false,
      paidAmount: 0,
      sharePaidUids: ["uid-1"],
      organizerConfirmedShareUids: ["uid-1"],
    });

    await refreshRegistrationHold(db, PROJECT, REG_ID, NOW);

    assert.equal(holdMsOf(fake), null);
  });

  it("inscrição fechada NÃO ganha prazo nenhum", async () => {
    const {fake, db} = makeDb();
    seedTournament(fake);
    seedRegistration(fake, {isPaid: true, sharePaidUids: ["uid-1", "uid-2"]});

    await refreshRegistrationHold(db, PROJECT, REG_ID, NOW);

    assert.equal(holdMsOf(fake), null);
  });

  it("convite vivo empurra o prazo pra depois da resposta", async () => {
    const {fake, db} = makeDb();
    seedTournament(fake);
    seedRegistration(fake, {isPaid: false, sharePaidUids: ["uid-1"]});
    const inviteExpiry = NOW + 48 * 60 * MIN;
    fake.seedDoc(`${INVITES_COLLECTION}/inv-1`, {
      tournamentId: "t1",
      categoryId: "cat-1",
      inviterUid: "uid-1",
      status: "pending",
      expiresAt: Timestamp.fromMillis(inviteExpiry),
    });

    await refreshRegistrationHold(db, PROJECT, REG_ID, NOW);

    assert.equal(holdMsOf(fake), inviteExpiry + 30 * MIN);
  });

  it("torneio com o prazo desligado não carimba nada", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("tournaments/t1", {registrationHoldEnabled: false});
    seedRegistration(fake, {isPaid: false, sharePaidUids: ["uid-1"]});

    await refreshRegistrationHold(db, PROJECT, REG_ID, NOW);

    assert.equal(holdMsOf(fake), null);
  });

  it("fila de espera não ocupa vaga, então não ganha prazo", async () => {
    const {fake, db} = makeDb();
    seedTournament(fake);
    seedRegistration(fake, {isPaid: false, waitlist: true});

    await refreshRegistrationHold(db, PROJECT, REG_ID, NOW);

    assert.equal(holdMsOf(fake), null);
  });
});
