import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  parseAgeRestriction,
  computeAge,
  isAgeEligible,
  assertTeamAgeEligibility,
} from "./category-age-eligibility";

function mockDb(usersByUid: Record<string, Record<string, unknown> | null>) {
  return {
    doc: (path: string) => ({
      get: async () => {
        const uid = path.startsWith("users/") ? path.slice("users/".length) : "";
        const data = usersByUid[uid] ?? null;
        return {exists: data != null, data: () => data};
      },
    }),
  };
}

describe("category-age-eligibility · parse", () => {
  it("usa ageRestriction explícita", () => {
    const r = parseAgeRestriction({
      ageRestriction: {mode: "range", minAge: 18, maxAge: 35, reference: "registration"},
    });
    assert.deepEqual(r, {mode: "range", minAge: 18, maxAge: 35, reference: "registration"});
  });

  it("deriva de ageBand (sub→max, plus→min, open→none)", () => {
    assert.deepEqual(parseAgeRestriction({ageBand: "sub21"}), {
      mode: "max", minAge: null, maxAge: 21, reference: "tournamentStart",
    });
    assert.deepEqual(parseAgeRestriction({ageBand: "plus40"}), {
      mode: "min", minAge: 40, maxAge: null, reference: "tournamentStart",
    });
    assert.equal(parseAgeRestriction({ageBand: "open"}).mode, "none");
    assert.equal(parseAgeRestriction({}).mode, "none");
  });
});

describe("category-age-eligibility · computeAge", () => {
  const birth = new Date(2005, 5, 15); // 15/jun/2005

  it("idade no início do torneio", () => {
    assert.equal(
      computeAge({birthDate: birth, reference: "tournamentStart", tournamentStart: new Date(2026, 5, 14), now: new Date()}),
      20,
    );
    assert.equal(
      computeAge({birthDate: birth, reference: "tournamentStart", tournamentStart: new Date(2026, 5, 15), now: new Date()}),
      21,
    );
  });

  it("idade completada no ano (yearEnd)", () => {
    assert.equal(
      computeAge({birthDate: birth, reference: "yearEnd", tournamentStart: new Date(2026, 0, 10), now: new Date()}),
      21,
    );
  });
});

describe("category-age-eligibility · isAgeEligible", () => {
  it("Sub-21 (max 21): premissa abaixo/acima", () => {
    const sub21 = parseAgeRestriction({ageBand: "sub21"});
    const sub19 = parseAgeRestriction({ageBand: "sub19"});
    const sub23 = parseAgeRestriction({ageBand: "sub23"});
    assert.equal(isAgeEligible(sub21, 20), true); // própria
    assert.equal(isAgeEligible(sub19, 20), false); // abaixo → bloqueia
    assert.equal(isAgeEligible(sub23, 20), true); // acima → ok
  });

  it("+40 (min) e faixa", () => {
    assert.equal(isAgeEligible(parseAgeRestriction({ageBand: "plus40"}), 45), true);
    assert.equal(isAgeEligible(parseAgeRestriction({ageBand: "plus50"}), 45), false);
    const range = parseAgeRestriction({ageRestriction: {mode: "range", minAge: 18, maxAge: 35}});
    assert.equal(isAgeEligible(range, 30), true);
    assert.equal(isAgeEligible(range, 36), false);
    assert.equal(isAgeEligible(range, 17), false);
  });
});

describe("category-age-eligibility · assertTeamAgeEligibility", () => {
  const tournament = {startAt: new Date(2026, 5, 1), sport: "beachVolleyball"};
  const sub21 = {categoryName: "Sub-21", ageBand: "sub21"};

  it("categoria sem restrição sempre passa", async () => {
    const db = mockDb({a: {name: "Ana"}});
    await assert.doesNotReject(
      assertTeamAgeEligibility({db: db as never, tournament, category: {categoryName: "Livre", ageBand: "open"}, uids: ["a"]}),
    );
  });

  it("bloqueia sem data de nascimento, nomeando", async () => {
    const db = mockDb({a: {name: "Ana"}});
    await assert.rejects(
      assertTeamAgeEligibility({db: db as never, tournament, category: sub21, uids: ["a"]}),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        assert.match(err.message, /Ana/);
        assert.match(err.message, /nascimento/);
        return true;
      },
    );
  });

  it("bloqueia atleta fora da faixa, nomeando idade", async () => {
    const db = mockDb({a: {name: "João", birthDate: "1990-01-01"}}); // ~36 em 2026
    await assert.rejects(
      assertTeamAgeEligibility({db: db as never, tournament, category: sub21, uids: ["a"]}),
      (err: Error & {message: string}) => {
        assert.match(err.message, /João/);
        assert.match(err.message, /Sub-21/);
        return true;
      },
    );
  });

  it("dupla: passa quando ambos elegíveis", async () => {
    const db = mockDb({
      a: {name: "Ana", birthDate: "2006-03-10"}, // 20 em jun/2026
      b: {name: "Bia", birthDate: "2007-08-20"}, // 18
    });
    await assert.doesNotReject(
      assertTeamAgeEligibility({db: db as never, tournament, category: sub21, uids: ["a", "b"]}),
    );
  });

  it("dupla: bloqueia o integrante fora", async () => {
    const db = mockDb({
      a: {name: "Ana", birthDate: "2006-03-10"}, // 20 ok
      b: {name: "Bia", birthDate: "1985-08-20"}, // ~40 fora
    });
    await assert.rejects(
      assertTeamAgeEligibility({db: db as never, tournament, category: sub21, uids: ["a", "b"]}),
      (err: Error & {message: string}) => {
        assert.match(err.message, /Bia/);
        assert.doesNotMatch(err.message, /Ana/);
        return true;
      },
    );
  });
});
