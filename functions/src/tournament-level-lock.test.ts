import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
  inscriptionAthleteUids,
  inscriptionBecameActive,
  inscriptionNewlyActiveAthleteUids,
  isLevelLocked,
  lockLevelForUid,
  lockLevelsForTournamentRegistration,
} from "./tournament-level-lock";

/** Merge raso recursivo (simula `SetOptions.merge: true` do Firestore, que
 *  mescla objetos aninhados — um merge raso de um nível apagaria
 *  `sportOnboarding` inteiro em vez de só acrescentar `levelLocked`). */
function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {...base};
  for (const [key, value] of Object.entries(patch)) {
    const existing = result[key];
    if (
      value != null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing != null &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      result[key] = deepMerge(
        existing as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Mock de Firestore com `tournaments/{id}` e `users/{uid}` — mesmo padrão de
 *  `mockDb` em category-level-eligibility.test.ts, com `.set()` gravando em
 *  `writes` E refletindo (merge profundo) de volta no mapa, pra provar
 *  idempotência entre chamadas sequenciais no mesmo teste. */
function mockDb(seed: {
  tournaments?: Record<string, Record<string, unknown> | null>;
  users?: Record<string, Record<string, unknown> | null>;
} = {}) {
  const tournaments = {...(seed.tournaments ?? {})};
  const users = {...(seed.users ?? {})};
  const writes: Array<{path: string; data: Record<string, unknown>; options: unknown}> = [];

  function collectionAndId(
    path: string,
  ): [Record<string, Record<string, unknown> | null>, string] | null {
    if (path.startsWith("tournaments/")) return [tournaments, path.slice("tournaments/".length)];
    if (path.startsWith("users/")) return [users, path.slice("users/".length)];
    return null;
  }

  return {
    writes,
    users,
    doc: (path: string) => ({
      get: async () => {
        const hit = collectionAndId(path);
        const data = hit ? hit[0][hit[1]] ?? null : null;
        return {exists: data != null, data: () => data};
      },
      set: async (data: Record<string, unknown>, options?: unknown) => {
        writes.push({path, data, options});
        const hit = collectionAndId(path);
        if (hit) hit[0][hit[1]] = deepMerge((hit[0][hit[1]] ?? {}) as Record<string, unknown>, data);
      },
    }),
  };
}

describe("inscriptionBecameActive", () => {
  it("criada (before ausente, after presente) -> true", () => {
    assert.equal(
      inscriptionBecameActive(undefined, {tournamentId: "t1", participantUids: ["u1"]}),
      true,
    );
  });

  it("update numa inscrição que já existia (ex.: pendente -> pago) -> false", () => {
    assert.equal(
      inscriptionBecameActive(
        {tournamentId: "t1", isPaid: false},
        {tournamentId: "t1", isPaid: true},
      ),
      false,
    );
  });

  it("delete (after ausente) -> false", () => {
    assert.equal(
      inscriptionBecameActive({tournamentId: "t1", participantUids: ["u1"]}, undefined),
      false,
    );
  });

  it("nova inscrição depois de outra cancelada (doc novo -> before sempre ausente) -> true", () => {
    // Cancelamento nesta coleção é hard delete (cancelTournamentRegistration /
    // organizerRemoveFromCategory / respondRegistrationCancellationRequest
    // aprovado): não existe status "cancelled" persistido no doc. Uma NOVA
    // inscrição da mesma dupla recebe um registrationId novo, então do ponto
    // de vista deste trigger ela é sempre "before ausente".
    assert.equal(
      inscriptionBecameActive(undefined, {tournamentId: "t1", participantUids: ["u1", "u2"]}),
      true,
    );
  });

  it("before e after ambos ausentes -> false", () => {
    assert.equal(inscriptionBecameActive(undefined, undefined), false);
  });
});

describe("inscriptionAthleteUids", () => {
  it("solo: player1Id", () => {
    assert.deepEqual(
      inscriptionAthleteUids({player1Id: "u1", participantUids: ["u1"]}),
      ["u1"],
    );
  });

  it("dupla: participantUids com os dois atletas", () => {
    assert.deepEqual(
      inscriptionAthleteUids({teamId: "team1", participantUids: ["u1", "u2"]}).sort(),
      ["u1", "u2"],
    );
  });

  it("equipe (trio+): participantUids com todo o elenco", () => {
    assert.deepEqual(
      inscriptionAthleteUids({
        teamId: "team1",
        participantUids: ["u1", "u2", "u3", "u4"],
      }).sort(),
      ["u1", "u2", "u3", "u4"],
    );
  });

  it("filtra ids vazios/whitespace e remove duplicados", () => {
    assert.deepEqual(
      inscriptionAthleteUids({
        player1Id: " u1 ",
        participantUids: ["u1", "", "   ", "u2"],
      }).sort(),
      ["u1", "u2"],
    );
  });

  it("doc sem nenhum uid -> []", () => {
    assert.deepEqual(inscriptionAthleteUids({tournamentId: "t1"}), []);
  });

  it("data ausente -> []", () => {
    assert.deepEqual(inscriptionAthleteUids(undefined), []);
  });
});

describe("inscriptionNewlyActiveAthleteUids", () => {
  it("inscrição nova (before ausente): todos os uids do after", () => {
    assert.deepEqual(
      inscriptionNewlyActiveAthleteUids(undefined, {
        tournamentId: "t1",
        participantUids: ["u1", "u2"],
      }).sort(),
      ["u1", "u2"],
    );
  });

  it("atleta ENTRA numa reserva solo já existente (attach/aceite de convite): só o uid novo", () => {
    // O doc não é novo (before existe, é a reserva solo), mas
    // assertTeamLevelEligibility valida os dois nesse momento — o atleta que
    // entra precisa travar mesmo sem o doc inteiro ser uma criação.
    const before = {
      tournamentId: "t1",
      player1Id: "u1",
      participantUids: ["u1"],
      partnerPending: true,
    };
    const after = {
      tournamentId: "t1",
      player1Id: "u1",
      participantUids: ["u1", "u2"],
      partnerPending: false,
      teamId: "team1",
    };
    assert.deepEqual(inscriptionNewlyActiveAthleteUids(before, after), ["u2"]);
  });

  it("update que não muda os uids (ex.: confirmação de pagamento) -> []", () => {
    const before = {tournamentId: "t1", participantUids: ["u1", "u2"], isPaid: false};
    const after = {tournamentId: "t1", participantUids: ["u1", "u2"], isPaid: true};
    assert.deepEqual(inscriptionNewlyActiveAthleteUids(before, after), []);
  });

  it("delete (after ausente) -> []", () => {
    assert.deepEqual(
      inscriptionNewlyActiveAthleteUids({tournamentId: "t1", participantUids: ["u1"]}, undefined),
      [],
    );
  });
});

describe("isLevelLocked", () => {
  it("levelLocked.{sport} === true -> true", () => {
    assert.equal(
      isLevelLocked({sportOnboarding: {levelLocked: {VOLEI_PRAIA: true}}}, "VOLEI_PRAIA"),
      true,
    );
  });

  it("levelLocked existe mas não pro esporte pedido -> false", () => {
    assert.equal(
      isLevelLocked({sportOnboarding: {levelLocked: {VOLEI_PRAIA: true}}}, "BEACH_TENNIS"),
      false,
    );
  });

  it("sportOnboarding sem levelLocked -> false", () => {
    assert.equal(isLevelLocked({sportOnboarding: {levelsBySport: {}}}, "VOLEI_PRAIA"), false);
  });

  it("sportOnboarding ausente -> false", () => {
    assert.equal(isLevelLocked({}, "VOLEI_PRAIA"), false);
  });

  it("userData ausente (uid sem doc/doc vazio) -> false", () => {
    assert.equal(isLevelLocked(undefined, "VOLEI_PRAIA"), false);
  });
});

describe("lockLevelForUid", () => {
  it("já travado: nenhuma escrita", async () => {
    const db = mockDb({
      users: {u1: {sportOnboarding: {levelLocked: {VOLEI_PRAIA: true}}}},
    });
    await lockLevelForUid(db as never, "u1", "VOLEI_PRAIA");
    assert.equal(db.writes.length, 0);
  });

  it("ainda não travado: uma escrita com merge:true gravando levelLocked.{sport}", async () => {
    const db = mockDb({users: {u1: {}}});
    await lockLevelForUid(db as never, "u1", "VOLEI_PRAIA");
    assert.equal(db.writes.length, 1);
    assert.equal(db.writes[0].path, "users/u1");
    assert.deepEqual(db.writes[0].data, {
      sportOnboarding: {levelLocked: {VOLEI_PRAIA: true}},
    });
    assert.deepEqual(db.writes[0].options, {merge: true});
  });

  it("uid sem doc de usuário nenhum: trata como não travado, escreve", async () => {
    const db = mockDb({users: {}});
    await lockLevelForUid(db as never, "u-novo", "VOLEI_PRAIA");
    assert.equal(db.writes.length, 1);
    assert.equal(db.writes[0].path, "users/u-novo");
  });

  it("idempotente: chamar duas vezes seguidas só escreve uma vez", async () => {
    const db = mockDb({users: {u1: {}}});
    await lockLevelForUid(db as never, "u1", "VOLEI_PRAIA");
    await lockLevelForUid(db as never, "u1", "VOLEI_PRAIA");
    assert.equal(db.writes.length, 1);
  });

  it("esportes diferentes do mesmo atleta não se pisam", async () => {
    const db = mockDb({
      users: {u1: {sportOnboarding: {levelLocked: {VOLEI_PRAIA: true}}}},
    });
    await lockLevelForUid(db as never, "u1", "BEACH_TENNIS");
    assert.equal(db.writes.length, 1);
    assert.deepEqual(db.writes[0].data, {
      sportOnboarding: {levelLocked: {BEACH_TENNIS: true}},
    });
  });
});

describe("lockLevelsForTournamentRegistration", () => {
  it("torneio inexistente: zero escritas", async () => {
    const db = mockDb({tournaments: {}, users: {u1: {}}});
    await lockLevelsForTournamentRegistration(db as never, {
      tournamentId: "t-inexistente",
      uids: ["u1"],
    });
    assert.equal(db.writes.length, 0);
  });

  it("esporte sem equivalente no perfil (tournamentSportToLevelSportCode -> null): zero escritas", async () => {
    const db = mockDb({
      tournaments: {t1: {sport: "futebol"}},
      users: {u1: {}},
    });
    await lockLevelsForTournamentRegistration(db as never, {
      tournamentId: "t1",
      uids: ["u1"],
    });
    assert.equal(db.writes.length, 0);
  });

  it("sem uids: nem chega a ler o torneio", async () => {
    const db = mockDb({tournaments: {t1: {sport: "beachVolleyball"}}});
    await lockLevelsForTournamentRegistration(db as never, {
      tournamentId: "t1",
      uids: [],
    });
    assert.equal(db.writes.length, 0);
  });

  it("esporte reconhecido: trava só quem ainda não está travado", async () => {
    const db = mockDb({
      tournaments: {t1: {sport: "beachVolleyball"}},
      users: {
        u1: {},
        u2: {sportOnboarding: {levelLocked: {VOLEI_PRAIA: true}}},
      },
    });
    await lockLevelsForTournamentRegistration(db as never, {
      tournamentId: "t1",
      uids: ["u1", "u2"],
    });
    assert.equal(db.writes.length, 1);
    assert.equal(db.writes[0].path, "users/u1");
    assert.deepEqual(db.writes[0].data, {
      sportOnboarding: {levelLocked: {VOLEI_PRAIA: true}},
    });
  });
});
