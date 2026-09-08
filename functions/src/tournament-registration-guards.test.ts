import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {
  assertTournamentAcceptsRegistration,
  requiresFormedPair,
  resolveCategoryEntryFee,
} from "./tournament-registration-guards";

/**
 * [inscriptions] são os docs que a categoria já ocupa (id + campos); [spotPasses] são os passes
 * de vaga vivos. As duas coleções precisam ser distinguidas pelo nome porque a lotação consulta
 * as duas: conta a ocupação e, se lotou, procura um passe.
 *
 * Dois cuidados que o mock ingênuo não tinha e que escondiam bugs de teste:
 *
 * - O stub dos PASSES aplica os `where` de verdade. Sem isso um passe de outro atleta era
 *   devolvido para qualquer consulta, e o teste "sem passe" passava por acidente. O stub das
 *   inscrições segue permissivo de propósito: os docs dos testes antigos não declaram
 *   `tournamentId`, e a contagem de ocupação é justamente o que eles querem exercitar.
 * - `data()` devolve uma CÓPIA do torneio. O guard anota `__shouldWaitlist`/`__spotPass` no
 *   objeto que recebe, e um objeto compartilhado entre casos fazia a anotação de um teste
 *   aparecer no seguinte.
 */
type MockDoc = {id: string; data: Record<string, unknown>};
type MockFilter = {field: string; op: string; value: unknown};

function docMatches(data: Record<string, unknown>, f: MockFilter): boolean {
  const actual = data[f.field];
  if (f.op === "in") {
    return Array.isArray(f.value) && (f.value as unknown[]).includes(actual);
  }
  if (f.op === "array-contains") {
    return Array.isArray(actual) && (actual as unknown[]).includes(f.value);
  }
  return actual === f.value;
}

function mockDb(
  tournament: Record<string, unknown> | null,
  inscriptions: MockDoc[] = [],
  spotPasses: MockDoc[] = [],
) {
  const stubFor = (docs: MockDoc[], applyFilters: boolean) => {
    const make = (filters: MockFilter[]): Record<string, unknown> => ({
      where: (field: string, op: string, value: unknown) =>
        make([...filters, {field, op, value}]),
      get: async () => ({
        docs: docs
          .filter(
            (doc) =>
              !applyFilters || filters.every((f) => docMatches(doc.data, f)),
          )
          .map((doc) => ({
            id: doc.id,
            data: () => doc.data,
            ref: {path: `tournamentSpotPasses/${doc.id}`},
          })),
      }),
    });
    return make([]);
  };
  return {
    doc: (path: string) => ({
      get: async () => ({
        exists: tournament != null && path.startsWith("tournaments/"),
        data: () => (tournament == null ? null : {...tournament}),
      }),
    }),
    collection: (path: string) =>
      path === "tournamentSpotPasses" ?
        stubFor(spotPasses, true) :
        stubFor(inscriptions, false),
  };
}

describe("tournament-registration-guards", () => {
  it("rejects closed listing status", async () => {
    const db = mockDb({listingStatus: "closed", categories: []});
    await assert.rejects(
      () =>
        assertTournamentAcceptsRegistration(
          db as never,
          "proj",
          "t1",
          "cat-a",
        ),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });

  it("rejects cancelada listing status", async () => {
    const db = mockDb({listingStatus: "cancelada", categories: []});
    await assert.rejects(
      () =>
        assertTournamentAcceptsRegistration(
          db as never,
          "proj",
          "t1",
          "cat-a",
        ),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });

  it("rejects category with registrationClosed", async () => {
    const db = mockDb({
      listingStatus: "open",
      categories: [
        {categoryName: "cat-a", registrationClosed: true},
      ],
    });
    await assert.rejects(
      () =>
        assertTournamentAcceptsRegistration(
          db as never,
          "proj",
          "t1",
          "cat-a",
        ),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });

  it("rejects after registrationClosesAt", async () => {
    const db = mockDb({
      listingStatus: "open",
      categories: [{categoryName: "cat-a"}],
      registrationClosesAt: Timestamp.fromMillis(Date.now() - 60_000),
    });
    await assert.rejects(
      () =>
        assertTournamentAcceptsRegistration(
          db as never,
          "proj",
          "t1",
          "cat-a",
        ),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });

  it("rejects before registrationOpensAt", async () => {
    const db = mockDb({
      listingStatus: "open",
      categories: [{categoryName: "cat-a"}],
      registrationOpensAt: Timestamp.fromMillis(Date.now() + 60_000),
    });
    await assert.rejects(
      () =>
        assertTournamentAcceptsRegistration(
          db as never,
          "proj",
          "t1",
          "cat-a",
        ),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });

  // `allowClosedRegistration` é o atalho do organizador (organizerCreateTeamRegistration):
  // só as travas de calendário/vitrine saem do caminho.
  it("allowClosedRegistration passa por prazo, vitrine e categoria fechados", async () => {
    const db = mockDb({
      listingStatus: "closed",
      registrationClosesAt: Timestamp.fromMillis(Date.now() - 60_000),
      registrationOpensAt: Timestamp.fromMillis(Date.now() + 60_000),
      categories: [{categoryName: "cat-a", registrationClosed: true, spotsLeft: 4}],
    });
    const data = await assertTournamentAcceptsRegistration(
      db as never,
      "proj",
      "t1",
      "cat-a",
      {allowClosedRegistration: true},
    );
    assert.equal(data.listingStatus, "closed");
  });

  it("allowClosedRegistration NÃO passa por torneio cancelado", async () => {
    const db = mockDb({listingStatus: "cancelado", categories: [{categoryName: "cat-a"}]});
    await assert.rejects(
      () =>
        assertTournamentAcceptsRegistration(
          db as never,
          "proj",
          "t1",
          "cat-a",
          {allowClosedRegistration: true},
        ),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });

  it("allowClosedRegistration NÃO passa por categoria concluída", async () => {
    const db = mockDb({
      listingStatus: "open",
      categories: [{categoryName: "cat-a", isCompleted: true}],
    });
    await assert.rejects(
      () =>
        assertTournamentAcceptsRegistration(
          db as never,
          "proj",
          "t1",
          "cat-a",
          {allowClosedRegistration: true},
        ),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });

  it("allowClosedRegistration NÃO passa por categoria lotada sem fila", async () => {
    const db = mockDb(
      {
        listingStatus: "open",
        waitlistEnabled: false,
        categories: [{categoryName: "cat-a", maxTeams: 1}],
      },
      [{id: "r1", data: {categoryId: "cat-a"}}],
    );
    await assert.rejects(
      () =>
        assertTournamentAcceptsRegistration(
          db as never,
          "proj",
          "t1",
          "cat-a",
          {allowClosedRegistration: true},
        ),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });

  it("allows category lotada when waitlist is enabled", async () => {
    const db = mockDb(
      {
        listingStatus: "open",
        waitlistEnabled: true,
        categories: [{categoryName: "cat-a", maxTeams: 2}],
      },
      [
        {id: "r1", data: {categoryId: "cat-a"}},
        {id: "r2", data: {categoryId: "cat-a"}},
      ],
    );
    const data = await assertTournamentAcceptsRegistration(
      db as never,
      "proj",
      "t1",
      "cat-a",
    );
    assert.equal(
      (data as Record<string, unknown>).__shouldWaitlist,
      true,
    );
  });

  it("allows open tournament and category", async () => {
    const db = mockDb({
      listingStatus: "open",
      categories: [{categoryName: "cat-a", spotsLeft: 4}],
    });
    const data = await assertTournamentAcceptsRegistration(
      db as never,
      "proj",
      "t1",
      "cat-a",
    );
    assert.equal(data.listingStatus, "open");
  });

  it("matches category by id field", async () => {
    const db = mockDb({
      listingStatus: "open",
      categories: [
        {
          id: "uuid-cat-1",
          categoryName: "Sub 19 Masculino",
          spotsLeft: 4,
        },
      ],
    });
    const data = await assertTournamentAcceptsRegistration(
      db as never,
      "proj",
      "t1",
      "uuid-cat-1",
    );
    assert.equal(data.listingStatus, "open");
  });

  it("resolveCategoryEntryFee matches by category id", () => {
    const tournament = {
      categories: [
        {
          id: "uuid-cat-1",
          categoryName: "Sub 19 Masculino",
          entryFee: 120,
        },
      ],
    };
    assert.equal(resolveCategoryEntryFee(tournament, "uuid-cat-1"), 120);
    assert.equal(resolveCategoryEntryFee(tournament, "Sub 19 Masculino"), 120);
    assert.equal(resolveCategoryEntryFee(tournament, "inexistente"), 0);
  });
});

describe("requiresFormedPair", () => {
  it("is off when the tournament omits the flag", () => {
    assert.equal(requiresFormedPair({categories: []}), false);
  });

  it("is on when the tournament requires a formed pair", () => {
    assert.equal(requiresFormedPair({requireFormedPair: true}), true);
  });

  it("is off for a legacy truthy value that is not a boolean", () => {
    assert.equal(requiresFormedPair({requireFormedPair: "true"}), false);
  });
});

describe("lotação com passe de vaga", () => {
  const FULL_TOURNAMENT = {
    listingStatus: "open",
    waitlistEnabled: true,
    categories: [{id: "cat-a", categoryName: "Masculina A", maxTeams: 1}],
  };
  const OCCUPIED = [{id: "r1", data: {categoryId: "cat-a"}}];
  const PASS = {
    id: "pass-1",
    data: {
      tournamentId: "t1",
      categoryId: "cat-a",
      athleteUid: "convidado",
      status: "active",
    },
  };

  it("sem passe, categoria lotada segue indo para a fila", async () => {
    const db = mockDb(FULL_TOURNAMENT, OCCUPIED, [PASS]);
    const data = await assertTournamentAcceptsRegistration(
      db as never,
      "proj",
      "t1",
      "cat-a",
      {claimantUids: ["outro-atleta"]},
    );
    assert.equal(data.__shouldWaitlist, true);
    assert.equal(data.__spotPass, undefined);
  });

  it("com passe do convidado, não vai para a fila e anota o passe", async () => {
    const db = mockDb(FULL_TOURNAMENT, OCCUPIED, [PASS]);
    const data = await assertTournamentAcceptsRegistration(
      db as never,
      "proj",
      "t1",
      "cat-a",
      {claimantUids: ["convidado"]},
    );
    assert.equal(data.__shouldWaitlist, undefined);
    assert.deepEqual(data.__spotPass, {
      id: "pass-1",
      path: "tournamentSpotPasses/pass-1",
      athleteUid: "convidado",
      categoryId: "cat-a",
    });
    // Quem persiste precisa da ocupação medida para subir o teto.
    assert.deepEqual(data.__capacityFull, {capacity: 1, occupied: 1});
  });

  it("passe do CONVIDANTE vale no aceite, em que quem chama é o parceiro", async () => {
    const db = mockDb(FULL_TOURNAMENT, OCCUPIED, [PASS]);
    const data = await assertTournamentAcceptsRegistration(
      db as never,
      "proj",
      "t1",
      "cat-a",
      {claimantUids: ["parceiro-que-aceitou", "convidado"]},
    );
    assert.equal((data.__spotPass as {id: string}).id, "pass-1");
  });

  it("passe de OUTRA categoria não abre esta", async () => {
    const db = mockDb(FULL_TOURNAMENT, OCCUPIED, [
      {...PASS, data: {...PASS.data, categoryId: "cat-b"}},
    ]);
    const data = await assertTournamentAcceptsRegistration(
      db as never,
      "proj",
      "t1",
      "cat-a",
      {claimantUids: ["convidado"]},
    );
    assert.equal(data.__spotPass, undefined);
    assert.equal(data.__shouldWaitlist, true);
  });

  it("chave publicada mata o passe mesmo com status active gravado", async () => {
    const db = mockDb(
      {
        ...FULL_TOURNAMENT,
        categoryOps: {"cat-a": {bracketStatus: "published"}},
      },
      OCCUPIED,
      [PASS],
    );
    const data = await assertTournamentAcceptsRegistration(
      db as never,
      "proj",
      "t1",
      "cat-a",
      {claimantUids: ["convidado"]},
    );
    assert.equal(data.__spotPass, undefined);
    assert.equal(data.__shouldWaitlist, true);
  });

  it("sem fila e sem passe, lotação continua recusando", async () => {
    const db = mockDb(
      {...FULL_TOURNAMENT, waitlistEnabled: false},
      OCCUPIED,
      [],
    );
    await assert.rejects(
      () =>
        assertTournamentAcceptsRegistration(
          db as never,
          "proj",
          "t1",
          "cat-a",
          {claimantUids: ["convidado"]},
        ),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        assert.match(err.message, /lotada/i);
        return true;
      },
    );
  });

  it("o organizador (allowCapacityExpansion) não consome passe de ninguém", async () => {
    const db = mockDb(FULL_TOURNAMENT, OCCUPIED, [PASS]);
    const data = await assertTournamentAcceptsRegistration(
      db as never,
      "proj",
      "t1",
      "cat-a",
      {allowCapacityExpansion: true, claimantUids: ["convidado"]},
    );
    assert.equal(data.__spotPass, undefined);
    assert.deepEqual(data.__capacityFull, {capacity: 1, occupied: 1});
  });
});
