import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  SELF_REFERRAL_MESSAGE,
  UNKNOWN_CODE_MESSAGE,
  checkSquadCodeCore,
  normalizeSquadCode,
  recordAttributionCore,
  resolveRegistrationAttribution,
  squadReferralCore,
} from "./squad-attribution";

const NOW = new Date("2026-10-17T15:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc("squadAmbassadors/jv", {displayName: "João Victor", tier: "amb", code: "JOAO10", commissionPct: 10, rulesVersion: 2, status: "active"});
  fake.seedDoc("squadAmbassadors/rb", {displayName: "Rayssa Brito", tier: "pro", code: "RAYSSA", commissionPct: 15, rulesVersion: 2, status: "active"});
  fake.seedDoc("squadAmbassadors/old", {displayName: "Antigo", tier: "amb", code: "ANTIGO", commissionPct: 10, status: "ended"});
  return {fake, db: fake as unknown as Firestore};
}

function setModel(fake: FakeFirestore, model: "lastTouch" | "firstTouch", windowDays = 30) {
  fake.seedDoc("squadConfig/rules", {version: 2, rules: {attribution: {model, windowDays, blockSelfReferral: true}}});
}

describe("normalizeSquadCode", () => {
  it("maiúsculas, sem espaço, 3 a 20 letras/números", () => {
    assert.equal(normalizeSquadCode(" joao10 "), "JOAO10");
    assert.equal(normalizeSquadCode("jo"), null);
    assert.equal(normalizeSquadCode("JOÃO-10"), null);
    assert.equal(normalizeSquadCode(undefined), null);
  });
});

describe("recordAttributionCore", () => {
  it("grava o link do embaixador ativo; último toque sobrescreve", async () => {
    const {fake, db} = makeDb();
    assert.deepEqual(await recordAttributionCore(db, {uid: "atl", code: "joao10", origin: "link"}, NOW), {
      recorded: true,
      ambassadorName: "João Victor",
    });
    await recordAttributionCore(db, {uid: "atl", code: "RAYSSA", origin: "qr"}, new Date(NOW.getTime() + DAY));
    assert.equal(fake.store.get("squadAttributions/atl")!["ambassadorId"], "rb");
    assert.equal(fake.store.get("squadAttributions/atl")!["origin"], "qr");
  });

  it("primeiro toque mantém o anterior enquanto a janela vale", async () => {
    const {fake, db} = makeDb();
    setModel(fake, "firstTouch", 30);
    await recordAttributionCore(db, {uid: "atl", code: "JOAO10", origin: "link"}, NOW);
    const second = await recordAttributionCore(db, {uid: "atl", code: "RAYSSA", origin: "link"}, new Date(NOW.getTime() + 5 * DAY));
    assert.equal(second.recorded, false);
    assert.equal(fake.store.get("squadAttributions/atl")!["ambassadorId"], "jv");
    await recordAttributionCore(db, {uid: "atl", code: "RAYSSA", origin: "link"}, new Date(NOW.getTime() + 31 * DAY));
    assert.equal(fake.store.get("squadAttributions/atl")!["ambassadorId"], "rb");
  });

  it("código inexistente, encerrado ou do próprio atleta não grava", async () => {
    const {fake, db} = makeDb();
    assert.equal((await recordAttributionCore(db, {uid: "atl", code: "NADA99", origin: "link"}, NOW)).recorded, false);
    assert.equal((await recordAttributionCore(db, {uid: "atl", code: "ANTIGO", origin: "link"}, NOW)).recorded, false);
    assert.equal((await recordAttributionCore(db, {uid: "jv", code: "JOAO10", origin: "link"}, NOW)).recorded, false);
    assert.equal(fake.store.get("squadAttributions/atl"), undefined);
    await assert.rejects(
      recordAttributionCore(db, {uid: "atl", code: "JOAO10", origin: "email"}, NOW),
      (err: {code?: string}) => err.code === "invalid-argument",
    );
  });
});

describe("resolveRegistrationAttribution", () => {
  it("código digitado vence o link", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadAttributions/atl", {ambassadorId: "jv", code: "JOAO10", origin: "link", at: NOW});
    const r = await resolveRegistrationAttribution(db, {payerUid: "atl", athleteUids: ["atl"], typedCode: "rayssa", purpose: "registration"}, NOW);
    assert.equal(r!.ambassador.uid, "rb");
    assert.equal(r!.origin, "code");
    assert.equal(r!.ambassador.rulesVersion, 2);
  });

  it("sem código, usa o link dentro da janela e ignora o vencido", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadAttributions/atl", {ambassadorId: "jv", code: "JOAO10", origin: "qr", at: new Date(NOW.getTime() - 10 * DAY)});
    const r = await resolveRegistrationAttribution(db, {payerUid: "atl", athleteUids: [], typedCode: "", purpose: "registration"}, NOW);
    assert.equal(r!.origin, "qr");
    const late = await resolveRegistrationAttribution(db, {payerUid: "atl", athleteUids: [], typedCode: null, purpose: "registration"}, new Date(NOW.getTime() + 25 * DAY));
    assert.equal(late, null);
  });

  it("código errado ou autoindicação digitada: erro claro; por link, ignora", async () => {
    const {fake, db} = makeDb();
    await assert.rejects(
      resolveRegistrationAttribution(db, {payerUid: "atl", athleteUids: [], typedCode: "NADA99", purpose: "registration"}, NOW),
      (err: {message?: string}) => err.message === UNKNOWN_CODE_MESSAGE,
    );
    // O embaixador é o parceiro de dupla do pagador.
    await assert.rejects(
      resolveRegistrationAttribution(db, {payerUid: "atl", athleteUids: ["atl", "jv"], typedCode: "JOAO10", purpose: "registration"}, NOW),
      (err: {message?: string}) => err.message === SELF_REFERRAL_MESSAGE,
    );
    fake.seedDoc("squadAttributions/jv", {ambassadorId: "jv", code: "JOAO10", origin: "link", at: NOW});
    assert.equal(await resolveRegistrationAttribution(db, {payerUid: "jv", athleteUids: ["jv"], typedCode: "", purpose: "registration"}, NOW), null);
  });

  it("com autoindicação liberada nas regras, o próprio código vale", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadConfig/rules", {version: 2, rules: {attribution: {blockSelfReferral: false}}});
    const r = await resolveRegistrationAttribution(db, {payerUid: "jv", athleteUids: ["jv"], typedCode: "JOAO10", purpose: "registration"}, NOW);
    assert.equal(r!.ambassador.uid, "jv");
  });
});

describe("checkSquadCodeCore", () => {
  it("devolve quem indicou, a origem e o % de desconto que vale para o atleta", async () => {
    const {fake, db} = makeDb();
    assert.deepEqual(
      await checkSquadCodeCore(db, {payerUid: "atl", athleteUids: ["atl"], code: "joao10", registrationId: "reg1", feePercent: 8}, NOW),
      {ambassadorName: "João Victor", code: "JOAO10", origin: "code", discountPct: 10, feePercent: 8, feeFloorReais: 1.5, ownPerk: null},
    );
    // Sem código: o link guardado, com o mesmo desconto.
    fake.seedDoc("squadAttributions/atl", {ambassadorId: "rb", code: "RAYSSA", origin: "link", at: NOW});
    const viaLink = await checkSquadCodeCore(db, {payerUid: "atl", athleteUids: [], code: "", registrationId: "reg1"}, NOW);
    assert.equal(viaLink.origin, "link");
    assert.equal(viaLink.ambassadorName, "Rayssa Brito");
    // Pro sem % no contrato: vem das regras (padrão 15%).
    assert.equal(viaLink.discountPct, 15);
  });

  it("sem atribuição: nada", async () => {
    const {db} = makeDb();
    assert.deepEqual(
      await checkSquadCodeCore(db, {payerUid: "atl", athleteUids: [], code: "", registrationId: "reg1"}, NOW),
      {ambassadorName: null, code: null, origin: null, discountPct: 0, feePercent: null, feeFloorReais: 1.5, ownPerk: null},
    );
  });

  it("embaixador pagando a própria inscrição vê o benefício dele, sem o teto oculto do ilimitado", async () => {
    const {db} = makeDb();
    const check = (payerUid: string, purpose: "registration" | "booking" = "registration") =>
      checkSquadCodeCore(db, {payerUid, athleteUids: [payerUid], code: "", registrationId: "reg1", purpose}, NOW);
    assert.deepEqual((await check("jv")).ownPerk, {type: "free", available: true, remaining: 1});
    assert.deepEqual((await check("rb")).ownPerk, {type: "free", available: true, remaining: null});
    // Reserva não tem o benefício.
    assert.equal((await check("jv", "booking")).ownPerk, null);
  });

  it("reserva e clubinho: % do contrato, teto da cobrança e o piso de cada uma", async () => {
    const {db} = makeDb();
    const club = await checkSquadCodeCore(
      db,
      {payerUid: "atl", athleteUids: [], code: "JOAO10", registrationId: "", purpose: "club", feePercent: 5, feeFloorReais: 0},
      NOW,
    );
    assert.equal(club.discountPct, 10);
    assert.equal(club.feePercent, 5);
    assert.equal(club.feeFloorReais, 0);
    const booking = await checkSquadCodeCore(
      db,
      {payerUid: "atl", athleteUids: [], code: "JOAO10", registrationId: "", purpose: "booking", feePercent: 8},
      NOW,
    );
    assert.equal(booking.discountPct, 10);
    assert.equal(booking.feeFloorReais, 1.5);
  });

  it("só na primeira: reserva já usada zera a reserva, mas não o clubinho nem a inscrição", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadChargeDiscounts/pay-old", {
      payerUid: "atl", ambassadorId: "jv", cents: 960, pct: 10, kind: "booking", confirmedAt: NOW,
    });
    const check = (purpose: "booking" | "club" | "registration") =>
      checkSquadCodeCore(db, {payerUid: "atl", athleteUids: [], code: "JOAO10", registrationId: "reg1", purpose}, NOW);
    assert.equal((await check("booking")).discountPct, 0);
    assert.equal((await check("club")).discountPct, 10);
    assert.equal((await check("registration")).discountPct, 10);
  });

  it("escopo do desconto: tipo desligado nas regras não ganha desconto, mas a indicação continua", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadConfig/rules", {
      version: 2,
      rules: {attribution: {followerDiscountScope: {registration: true, booking: false, club: false}}},
    });
    const check = (purpose: "booking" | "club" | "registration") =>
      checkSquadCodeCore(db, {payerUid: "atl", athleteUids: [], code: "JOAO10", registrationId: "reg1", purpose}, NOW);
    const booking = await check("booking");
    assert.equal(booking.discountPct, 0);
    assert.equal(booking.code, "JOAO10");
    assert.equal((await check("club")).discountPct, 0);
    assert.equal((await check("registration")).discountPct, 10);
  });
});


describe("squadReferralCore", () => {
  it("embaixador do espelho público e a oferta das regras (padrão: só na primeira, em tudo)", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadPublic/jv", {
      name: "João Victor", photoUrl: "https://cdn.test/jv.jpg", tier: "amb", code: "JOAO10",
      city: "Goiânia", state: "GO", arenaName: "Arena Sol",
    });
    assert.deepEqual(await squadReferralCore(db, " joao10 "), {
      ambassador: {
        uid: "jv", name: "João Victor", photoUrl: "https://cdn.test/jv.jpg", tier: "amb",
        city: "Goiânia", state: "GO", arenaName: "Arena Sol",
      },
      discountPct: 10,
      firstOnly: true,
      scope: {registration: true, booking: true, club: true, store: false},
    });
  });

  it("sem espelho: nome do contrato, sem foto nem cidade; % do nível pelas regras", async () => {
    const {db} = makeDb();
    const view = await squadReferralCore(db, "RAYSSA");
    assert.deepEqual(view?.ambassador, {
      uid: "rb", name: "Rayssa Brito", photoUrl: null, tier: "pro", city: null, state: null, arenaName: null,
    });
    assert.equal(view?.discountPct, 15);
  });

  it("segue o escopo e o \"só na primeira\" salvos no backoffice", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadConfig/rules", {version: 3, rules: {attribution: {
      followerDiscountFirstOnly: false,
      followerDiscountScope: {registration: true, booking: false, club: false},
    }}});
    const view = await squadReferralCore(db, "JOAO10");
    assert.equal(view?.firstOnly, false);
    assert.deepEqual(view?.scope, {registration: true, booking: false, club: false, store: false});
  });

  it("código encerrado, desconhecido ou fora do formato: nada", async () => {
    const {db} = makeDb();
    assert.equal(await squadReferralCore(db, "ANTIGO"), null);
    assert.equal(await squadReferralCore(db, "NAOEXISTE"), null);
    assert.equal(await squadReferralCore(db, "jo"), null);
    assert.equal(await squadReferralCore(db, undefined), null);
  });
});

describe("escopo do código no contrato (codeScope)", () => {
  const ONLY_REGISTRATION = {registration: true, booking: false, club: false, store: false};

  function withScopedAmbassador(): {fake: FakeFirestore; db: Firestore} {
    const env = makeDb();
    env.fake.seedDoc("squadAmbassadors/lm", {
      displayName: "Luana Melo", tier: "ath", code: "LUANA10", commissionPct: 4, followerDiscountPct: 8,
      rulesVersion: 2, status: "active", codeScope: ONLY_REGISTRATION,
    });
    return env;
  }

  const resolve = (db: Firestore, purpose: "registration" | "booking" | "club", typedCode: unknown = "") =>
    resolveRegistrationAttribution(db, {payerUid: "atl", athleteUids: ["atl"], typedCode, purpose}, NOW);

  it("contrato sem codeScope vale em inscrição, reserva e clubinho (contratos antigos não mudam)", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadAttributions/atl", {ambassadorId: "jv", code: "JOAO10", origin: "link", at: NOW});
    for (const purpose of ["registration", "booking", "club"] as const) {
      assert.equal((await resolve(db, purpose))?.ambassador.uid, "jv", purpose);
    }
  });

  it("link de contrato só de inscrição: resolve na inscrição e some na reserva e no clubinho", async () => {
    const {fake, db} = withScopedAmbassador();
    fake.seedDoc("squadAttributions/atl", {ambassadorId: "lm", code: "LUANA10", origin: "link", at: NOW});
    assert.equal((await resolve(db, "registration"))?.ambassador.uid, "lm");
    assert.equal(await resolve(db, "booking"), null);
    assert.equal(await resolve(db, "club"), null);
    // A indicação continua guardada: só não vale nesta compra.
    assert.equal(fake.store.get("squadAttributions/atl")!["ambassadorId"], "lm");
  });

  it("código digitado fora do escopo: erro no campo dizendo onde ele vale", async () => {
    const {db} = withScopedAmbassador();
    assert.equal((await resolve(db, "registration", "luana10"))?.origin, "code");
    for (const purpose of ["booking", "club"] as const) {
      await assert.rejects(
        resolve(db, purpose, "luana10"),
        (err: {code?: string; message?: string; details?: {field?: string}}) =>
          err.code === "failed-precondition" &&
          err.details?.field === "squadCode" &&
          err.message === "O código LUANA10 vale só para inscrições em torneios.",
      );
    }
  });

  it("campo inválido no contrato conta como liberado; tipo ausente também", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadAmbassadors/jv", {
      displayName: "João Victor", tier: "amb", code: "JOAO10", commissionPct: 10, rulesVersion: 2, status: "active",
      codeScope: {registration: true, booking: "não"},
    });
    fake.seedDoc("squadAttributions/atl", {ambassadorId: "jv", code: "JOAO10", origin: "link", at: NOW});
    assert.equal((await resolve(db, "booking"))?.ambassador.uid, "jv");
    assert.equal((await resolve(db, "club"))?.ambassador.uid, "jv");
  });

  it("prévia do checkout: fora do escopo não mostra a indicação por link", async () => {
    const {fake, db} = withScopedAmbassador();
    fake.seedDoc("squadAttributions/atl", {ambassadorId: "lm", code: "LUANA10", origin: "link", at: NOW});
    const check = (purpose: "registration" | "booking" | "club") =>
      checkSquadCodeCore(db, {payerUid: "atl", athleteUids: ["atl"], code: "", registrationId: "reg1", purpose}, NOW);
    const booking = await check("booking");
    assert.deepEqual(
      {origin: booking.origin, name: booking.ambassadorName, code: booking.code, pct: booking.discountPct},
      {origin: null, name: null, code: null, pct: 0},
    );
    assert.equal((await check("club")).origin, null);
    const registration = await check("registration");
    assert.equal(registration.origin, "link");
    assert.equal(registration.discountPct, 8);
  });

  it("página do link mostra onde o código vale: contrato e regras juntos", async () => {
    const {fake, db} = withScopedAmbassador();
    assert.deepEqual((await squadReferralCore(db, "LUANA10"))?.scope, ONLY_REGISTRATION);
    fake.seedDoc("squadConfig/rules", {version: 3, rules: {attribution: {
      followerDiscountScope: {registration: false, booking: true, club: true},
    }}});
    assert.deepEqual(
      (await squadReferralCore(db, "LUANA10"))?.scope,
      {registration: false, booking: false, club: false, store: false},
    );
  });
});

describe("escopo do código por nível (pacote da versão do contrato)", () => {
  const ONLY_REGISTRATION = {registration: true, booking: false, club: false, store: false};
  const resolve = (db: Firestore, purpose: "registration" | "booking" | "club", typedCode: unknown = "") =>
    resolveRegistrationAttribution(db, {payerUid: "atl", athleteUids: ["atl"], typedCode, purpose}, NOW);

  function withTierScope(): {fake: FakeFirestore; db: Firestore} {
    const env = makeDb();
    // João (amb) assinou a versão 2, em que o Ambassador só vale em inscrição.
    env.fake.seedDoc("squadConfig/rules/versions/2", {rules: {tiers: {amb: {codeScope: ONLY_REGISTRATION}}}});
    env.fake.seedDoc("squadAttributions/atl", {ambassadorId: "jv", code: "JOAO10", origin: "link", at: NOW});
    return env;
  }

  it("nível só de inscrição: o link some na reserva e no clubinho", async () => {
    const {db} = withTierScope();
    assert.equal((await resolve(db, "registration"))?.ambassador.uid, "jv");
    assert.equal(await resolve(db, "booking"), null);
    assert.equal(await resolve(db, "club"), null);
  });

  it("código digitado fora do escopo do nível: erro dizendo onde vale", async () => {
    const {db} = withTierScope();
    await assert.rejects(
      resolve(db, "club", "joao10"),
      (err: {message?: string; details?: {field?: string}}) =>
        err.details?.field === "squadCode" && err.message === "O código JOAO10 vale só para inscrições em torneios.",
    );
  });

  it("contrato e nível se somam: vale só onde os dois deixam", async () => {
    const {fake, db} = withTierScope();
    fake.seedDoc("squadConfig/rules/versions/2", {rules: {tiers: {amb: {codeScope: {registration: true, booking: true, club: false}}}}});
    fake.seedDoc("squadAmbassadors/jv", {
      ...fake.store.get("squadAmbassadors/jv")!, codeScope: {registration: false, booking: true, club: true},
    });
    assert.equal(await resolve(db, "registration"), null);
    assert.equal((await resolve(db, "booking"))?.ambassador.uid, "jv");
    assert.equal(await resolve(db, "club"), null);
  });

  it("outro nível e versão sem o campo seguem valendo em tudo", async () => {
    const {fake, db} = withTierScope();
    fake.seedDoc("squadAttributions/atl", {ambassadorId: "rb", code: "RAYSSA", origin: "link", at: NOW});
    assert.equal((await resolve(db, "booking"))?.ambassador.uid, "rb", "Pro não tem restrição");
  });

  it("página do link: contrato ∧ nível ∧ regras", async () => {
    const {fake, db} = withTierScope();
    fake.seedDoc("squadConfig/rules", {version: 3, rules: {attribution: {
      followerDiscountScope: {registration: true, booking: true, club: true},
    }}});
    assert.deepEqual((await squadReferralCore(db, "JOAO10"))?.scope, ONLY_REGISTRATION);
  });
});

describe("Loja (purpose store)", () => {
  const STORE_ON = {registration: true, booking: true, club: true, store: true};
  const resolve = (db: Firestore, typedCode: unknown = "") =>
    resolveRegistrationAttribution(db, {payerUid: "atl", athleteUids: ["atl"], typedCode, purpose: "store"}, NOW);

  function linked(globalStore: boolean): {fake: FakeFirestore; db: Firestore} {
    const env = makeDb();
    env.fake.seedDoc("squadConfig/rules", {version: 2, rules: {attribution: {
      followerDiscountScope: {...STORE_ON, store: globalStore},
    }}});
    env.fake.seedDoc("squadAttributions/atl", {ambassadorId: "jv", code: "JOAO10", origin: "link", at: NOW});
    return env;
  }

  it("Loja desligada na regra global (o padrão): o link não vale e o código digitado é recusado", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadAttributions/atl", {ambassadorId: "jv", code: "JOAO10", origin: "link", at: NOW});
    assert.equal(await resolve(db), null);
    await assert.rejects(
      resolve(db, "joao10"),
      (err: {message?: string; details?: {field?: string}}) =>
        err.details?.field === "squadCode" &&
        err.message === "O código JOAO10 vale só para inscrições em torneios, reservas de quadra e clubinho.",
    );
  });

  it("ligada na global: vale; nível ou contrato sem a Loja tiram o código da Loja", async () => {
    const {fake, db} = linked(true);
    assert.equal((await resolve(db))?.ambassador.uid, "jv");
    fake.seedDoc("squadConfig/rules/versions/2", {rules: {tiers: {amb: {codeScope: {...STORE_ON, store: false}}}}});
    assert.equal(await resolve(db), null);
    fake.store.delete("squadConfig/rules/versions/2");
    fake.seedDoc("squadAmbassadors/jv", {...fake.store.get("squadAmbassadors/jv")!, codeScope: {store: false}});
    assert.equal(await resolve(db), null);
  });

  it("prévia da Loja: % do contrato, sem teto de taxa; só na primeira compra da Loja", async () => {
    const {fake, db} = linked(true);
    const check = () =>
      checkSquadCodeCore(db, {payerUid: "atl", athleteUids: ["atl"], code: "", registrationId: "", purpose: "store"}, NOW);
    const first = await check();
    assert.deepEqual({origin: first.origin, pct: first.discountPct, fee: first.feePercent, own: first.ownPerk},
      {origin: "link", pct: 10, fee: null, own: null});
    fake.seedDoc("squadChargeDiscounts/p1", {payerUid: "atl", kind: "store", cents: 500, confirmedAt: NOW});
    assert.equal((await check()).discountPct, 0);
  });

  it("página do link só mostra a Loja quando a global e o contrato deixam", async () => {
    const {db} = linked(false);
    assert.equal((await squadReferralCore(db, "JOAO10"))?.scope.store, false);
    const on = linked(true);
    assert.equal((await squadReferralCore(on.db, "JOAO10"))?.scope.store, true);
  });
});
