import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {reopenTournamentRegistrationsCore} from "./organizer-category-ops";

/**
 * O Goiânia Open (out/2026) ficou travado: o organizador encerrou as inscrições, depois estendeu
 * o prazo na edição — e o app seguiu mostrando "Inscrições encerradas", porque o guard barra
 * `closed` antes de olhar a data. Reabrir é o caminho de volta.
 */

const NOW = new Date("2026-10-26T12:00:00Z");
const FUTURE = Timestamp.fromDate(new Date("2026-10-29T02:59:00Z"));
const PAST = Timestamp.fromDate(new Date("2026-10-25T02:59:00Z"));

function seed(fake: FakeFirestore, data: Record<string, unknown>): void {
  fake.seedDoc("tournaments/t1", {
    managerId: "owner-1",
    listingStatus: "closed",
    status: "closed",
    registrationClosesAt: FUTURE,
    categories: [
      {id: "c1", registrationClosed: true},
      {id: "c2", registrationClosed: true, isCompleted: false},
    ],
    ...data,
  });
}

async function read(fake: FakeFirestore): Promise<Record<string, unknown>> {
  return (await fake.doc("tournaments/t1").get()).data() as Record<string, unknown>;
}

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

describe("reopenTournamentRegistrationsCore", () => {
  it("volta o torneio para open e destrava as categorias", async () => {
    const fake = new FakeFirestore();
    seed(fake, {});

    await reopenTournamentRegistrationsCore(db(fake), "owner-1", "t1", NOW);

    const t = await read(fake);
    assert.equal(t.listingStatus, "open");
    assert.equal(t.status, "open");
    const cats = t.categories as Array<Record<string, unknown>>;
    assert.deepEqual(cats.map((c) => c.registrationClosed), [false, false]);
  });

  it("não mexe em `status` quando ele não espelha o closed", async () => {
    const fake = new FakeFirestore();
    seed(fake, {status: "in_progress"});

    await reopenTournamentRegistrationsCore(db(fake), "owner-1", "t1", NOW);

    const t = await read(fake);
    assert.equal(t.listingStatus, "open");
    assert.equal(t.status, "in_progress");
  });

  it("recusa quando o prazo de inscrição já passou", async () => {
    const fake = new FakeFirestore();
    seed(fake, {registrationClosesAt: PAST});

    await assert.rejects(
      reopenTournamentRegistrationsCore(db(fake), "owner-1", "t1", NOW),
      /estenda o prazo/,
    );
    assert.equal((await read(fake)).listingStatus, "closed");
  });

  it("recusa torneio que não está encerrado (cancelado, aberto, concluído)", async () => {
    for (const listingStatus of ["cancelled", "open", "completed", "draft"]) {
      const fake = new FakeFirestore();
      seed(fake, {listingStatus});
      await assert.rejects(
        reopenTournamentRegistrationsCore(db(fake), "owner-1", "t1", NOW),
        /inscrições encerradas/,
        listingStatus,
      );
    }
  });

  it("sem prazo gravado, reabre", async () => {
    const fake = new FakeFirestore();
    seed(fake, {registrationClosesAt: null});

    await reopenTournamentRegistrationsCore(db(fake), "owner-1", "t1", NOW);

    assert.equal((await read(fake)).listingStatus, "open");
  });
});
