import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  EVENT_DEBOUNCE_SECONDS,
  athleteBenefitCode,
  benefitUseUpdate,
  callerFromAuth,
  partnerInWindow,
  defaultConsentText,
  eventDocId,
  isTester,
  normalizeCep,
  normalizeWhatsapp,
  parseLead,
  parseTrackEvent,
  partnerVisibleTo,
  submitPartnerLeadCore,
  trackBenefitEventCore,
  type Caller,
  type LeadInput,
} from "./benefits-club";

const ATHLETE: Caller = {uid: "athlete1", isAdmin: false};
const TESTER: Caller = {uid: "tester1", isAdmin: false};
const ADMIN: Caller = {uid: "admin1", isAdmin: true};
const NOW = new Date("2026-11-16T15:00:00Z");

const FAST = {
  name: "Fast Açaí",
  active: true,
  audience: "all",
  ctaType: "link",
  link: "https://fast.example/cardapio",
};
const LINQ = {
  name: "LinQ Telecom",
  active: true,
  audience: "testers",
  ctaType: "lead_form",
  leadSuccessMessage: "Pronto! A LinQ vai falar com você pelo WhatsApp",
};

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc("partners/fast-acai", FAST);
  fake.seedDoc("partners/linq", LINQ);
  fake.seedDoc("partners/off", {...FAST, active: false});
  fake.seedDoc("appConfig/benefitsClub", {enabled: false, testerUids: [TESTER.uid]});
  fake.seedDoc(`users/${TESTER.uid}`, {city: "Goiânia", state: "go"});
  return {fake, db: fake as unknown as Firestore};
}

function lead(over: Partial<LeadInput> = {}): LeadInput {
  return {
    partnerId: "linq",
    name: "  Silvio   Dionizio ",
    whatsapp: "(62) 98240-6456",
    neighborhood: "Setor Bueno",
    cep: "74230-010",
    consent: true,
    source: "hub_card",
    surface: "app",
    platform: "ios",
    ...over,
  };
}

function docsIn(fake: FakeFirestore, collection: string): Array<[string, Record<string, unknown>]> {
  return [...fake.store.entries()].filter(([path]) => path.startsWith(`${collection}/`)) as Array<
    [string, Record<string, unknown>]
  >;
}

describe("normalizeWhatsapp", () => {
  it("aceita celular e fixo com DDD, com ou sem 55, e devolve com DDI", () => {
    assert.equal(normalizeWhatsapp("(62) 98240-6456"), "5562982406456");
    assert.equal(normalizeWhatsapp("+55 62 98240-6456"), "5562982406456");
    assert.equal(normalizeWhatsapp("6232412345"), "556232412345");
  });

  it("recusa número sem DDD ou grande demais", () => {
    assert.equal(normalizeWhatsapp("98240-6456"), null);
    assert.equal(normalizeWhatsapp("55629824064561"), null);
    assert.equal(normalizeWhatsapp(undefined), null);
  });
});

describe("normalizeCep", () => {
  it("fica só com os 8 dígitos", () => {
    assert.equal(normalizeCep("74230-010"), "74230010");
    assert.equal(normalizeCep("7423001"), null);
  });
});

describe("callerFromAuth / isTester / partnerVisibleTo", () => {
  it("lê admin do claim roles e superAdmin", () => {
    assert.deepEqual(callerFromAuth({uid: "a", token: {roles: ["athlete", "admin"]}}), {uid: "a", isAdmin: true});
    assert.deepEqual(callerFromAuth({uid: "b", token: {superAdmin: true}}), {uid: "b", isAdmin: true});
    assert.deepEqual(callerFromAuth({uid: "c", token: {roles: ["athlete"]}}), {uid: "c", isAdmin: false});
    assert.equal(callerFromAuth(undefined), null);
  });

  it("quem testa é admin ou está na lista", () => {
    const config = {testerUids: [TESTER.uid]};
    assert.equal(isTester(ADMIN, config), true);
    assert.equal(isTester(TESTER, config), true);
    assert.equal(isTester(ATHLETE, config), false);
    assert.equal(isTester(ATHLETE, undefined), false);
  });

  it("parceiro de teste só aparece para quem testa; desligado não aparece para ninguém", () => {
    const config = {testerUids: [TESTER.uid]};
    assert.equal(partnerVisibleTo(LINQ, ATHLETE, config), false);
    assert.equal(partnerVisibleTo(LINQ, TESTER, config), true);
    assert.equal(partnerVisibleTo(FAST, ATHLETE, config), true);
    assert.equal(partnerVisibleTo({...FAST, active: false}, ADMIN, config), false);
  });
});

describe("parseTrackEvent", () => {
  it("exige parceiro nos eventos de parceiro e ignora nos do clube", () => {
    assert.deepEqual(parseTrackEvent({type: "partner_view"}), {error: "Parceiro inválido."});
    const club = parseTrackEvent({type: "club_view", partnerId: "fast-acai", source: "hub_card"});
    assert.ok(!("error" in club));
    assert.equal(club.partnerId, null);
    assert.equal(club.source, "hub_card");
  });

  it("recusa tipo desconhecido, inclusive lead_submit vindo do cliente", () => {
    assert.ok("error" in parseTrackEvent({type: "lead_submit", partnerId: "linq"}));
    assert.ok("error" in parseTrackEvent({type: "nope"}));
  });

  it("origem, superfície e plataforma desconhecidas viram o padrão", () => {
    const parsed = parseTrackEvent({type: "hub_card_view", source: "<script>", surface: "tv", platform: "x"});
    assert.ok(!("error" in parsed));
    assert.equal(parsed.source, "unknown");
    assert.equal(parsed.surface, "app");
    assert.equal(parsed.platform, "unknown");
  });

  it("recusa id de parceiro com caminho", () => {
    assert.ok("error" in parseTrackEvent({type: "cta_click", partnerId: "../users/x"}));
  });
});

describe("trackBenefitEventCore", () => {
  it("grava o evento com uid, origem e data do servidor", async () => {
    const {fake, db} = makeDb();
    const result = await trackBenefitEventCore(
      db,
      ATHLETE,
      {type: "cta_click", partnerId: "fast-acai", source: "hub_card", surface: "app", platform: "android"},
      NOW,
    );
    assert.deepEqual(result, {ok: true, counted: true});
    const events = docsIn(fake, "benefitEvents");
    assert.equal(events.length, 1);
    const [, data] = events[0]!;
    assert.equal(data["type"], "cta_click");
    assert.equal(data["partnerId"], "fast-acai");
    assert.equal(data["uid"], ATHLETE.uid);
    assert.equal(data["source"], "hub_card");
    assert.equal(data["platform"], "android");
  });

  it("toque repetido na mesma janela não conta duas vezes", async () => {
    const {fake, db} = makeDb();
    const input = {type: "code_copy", partnerId: "fast-acai", source: "club_list"};
    await trackBenefitEventCore(db, ATHLETE, input, NOW);
    const again = await trackBenefitEventCore(db, ATHLETE, input, new Date(NOW.getTime() + 2000));
    assert.deepEqual(again, {ok: true, counted: false});
    assert.equal(docsIn(fake, "benefitEvents").length, 1);
    const later = new Date(NOW.getTime() + EVENT_DEBOUNCE_SECONDS * 1000);
    assert.deepEqual(await trackBenefitEventCore(db, ATHLETE, input, later), {ok: true, counted: true});
  });

  it("recusa evento de parceiro inexistente, desligado ou de teste para quem não testa", async () => {
    const {db} = makeDb();
    for (const partnerId of ["nope", "off", "linq"]) {
      await assert.rejects(
        trackBenefitEventCore(db, ATHLETE, {type: "partner_view", partnerId}, NOW),
        /Parceiro não encontrado/,
      );
    }
    assert.deepEqual(
      await trackBenefitEventCore(db, TESTER, {type: "partner_view", partnerId: "linq"}, NOW),
      {ok: true, counted: true},
    );
  });

  it("evento do clube não lê parceiro", async () => {
    const {fake, db} = makeDb();
    await trackBenefitEventCore(db, ATHLETE, {type: "hub_card_view", source: "hub_card"}, NOW);
    const [[id]] = docsIn(fake, "benefitEvents");
    assert.equal(id, `benefitEvents/${eventDocId("hub_card_view", null, ATHLETE.uid, NOW)}`);
  });
});

describe("parseLead", () => {
  it("sem consentimento não passa", () => {
    assert.deepEqual(parseLead(lead({consent: false})), {
      error: "Marque a autorização para enviarmos seus dados ao parceiro.",
    });
    assert.ok("error" in parseLead(lead({consent: "true"})));
  });

  it("valida nome, WhatsApp, bairro e CEP", () => {
    assert.deepEqual(parseLead(lead({name: " "})), {error: "Informe seu nome."});
    assert.deepEqual(parseLead(lead({whatsapp: "123"})), {error: "Informe um WhatsApp com DDD."});
    assert.deepEqual(parseLead(lead({neighborhood: ""})), {error: "Informe seu bairro."});
    assert.deepEqual(parseLead(lead({cep: "123"})), {error: "Informe um CEP com 8 números."});
  });

  it("normaliza os campos", () => {
    const parsed = parseLead(lead());
    assert.ok(!("error" in parsed));
    assert.equal(parsed.name, "Silvio Dionizio");
    assert.equal(parsed.whatsapp, "5562982406456");
    assert.equal(parsed.cep, "74230010");
  });
});

describe("submitPartnerLeadCore", () => {
  it("grava o lead com o consentimento aceito, a cidade do perfil e um evento lead_submit", async () => {
    const {fake, db} = makeDb();
    const result = await submitPartnerLeadCore(db, TESTER, lead(), NOW);
    assert.equal(result.leadId, `linq_${TESTER.uid}`);
    assert.equal(result.successMessage, "Pronto! A LinQ vai falar com você pelo WhatsApp");

    const saved = fake.store.get(`partnerLeads/linq_${TESTER.uid}`) as Record<string, unknown>;
    assert.equal(saved["consent"], true);
    assert.equal(saved["consentText"], defaultConsentText("LinQ Telecom"));
    assert.equal(saved["city"], "Goiânia");
    assert.equal(saved["state"], "GO");
    assert.equal(saved["status"], "new");
    assert.equal(saved["submitCount"], 1);
    assert.equal(saved["whatsapp"], "5562982406456");

    const events = docsIn(fake, "benefitEvents").map(([, d]) => d["type"]);
    assert.deepEqual(events, ["lead_submit"]);
  });

  it("reenviar atualiza o mesmo lead e mantém status e criação", async () => {
    const {fake, db} = makeDb();
    await submitPartnerLeadCore(db, TESTER, lead(), NOW);
    const first = fake.store.get(`partnerLeads/linq_${TESTER.uid}`) as Record<string, unknown>;
    await submitPartnerLeadCore(db, TESTER, lead({neighborhood: "Setor Oeste"}), new Date(NOW.getTime() + 60_000));
    const saved = fake.store.get(`partnerLeads/linq_${TESTER.uid}`) as Record<string, unknown>;
    assert.equal(saved["neighborhood"], "Setor Oeste");
    assert.equal(saved["submitCount"], 2);
    assert.equal(saved["status"], "new");
    assert.deepEqual(saved["createdAt"], first["createdAt"]);
    assert.equal(docsIn(fake, "partnerLeads").length, 1);
  });

  it("parceiro de teste recusa quem não testa", async () => {
    const {fake, db} = makeDb();
    await assert.rejects(submitPartnerLeadCore(db, ATHLETE, lead(), NOW), /Parceiro não encontrado/);
    assert.equal(docsIn(fake, "partnerLeads").length, 0);
  });

  it("parceiro de link não recebe lead", async () => {
    const {db} = makeDb();
    await assert.rejects(
      submitPartnerLeadCore(db, ATHLETE, lead({partnerId: "fast-acai"}), NOW),
      /não recebe cadastro/,
    );
  });

  it("usa o texto de consentimento do parceiro quando existe", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("partners/linq", {...LINQ, leadConsentText: "Texto da LinQ.", leadSuccessMessage: ""});
    const result = await submitPartnerLeadCore(db, ADMIN, lead(), NOW);
    assert.equal(result.successMessage, "Pronto! A LinQ Telecom vai falar com você pelo WhatsApp");
    const saved = fake.store.get(`partnerLeads/linq_${ADMIN.uid}`) as Record<string, unknown>;
    assert.equal(saved["consentText"], "Texto da LinQ.");
    assert.equal(saved["city"], null);
  });
});

// ── v2: validade, uso e requisito ─────────────────────────────────────────

describe("partnerInWindow / athleteBenefitCode", () => {
  it("antes de startsAt e a partir de validUntil o parceiro some", () => {
    const at = (ms: number) => Timestamp.fromMillis(NOW.getTime() + ms);
    assert.equal(partnerInWindow({}, NOW), true);
    assert.equal(partnerInWindow({startsAt: at(1), validUntil: null}, NOW), false);
    assert.equal(partnerInWindow({startsAt: at(0)}, NOW), true);
    assert.equal(partnerInWindow({validUntil: at(0)}, NOW), false);
    assert.equal(partnerInWindow({validUntil: at(1)}, NOW), true);
    assert.equal(partnerVisibleTo({...FAST, validUntil: at(-1)}, ADMIN, {}, NOW), false);
  });

  it("código do atleta: NEXA- + 4 alfanuméricos do uid em maiúsculas", () => {
    assert.equal(athleteBenefitCode("a-b_c9xyz"), "NEXA-ABC9");
    assert.equal(athleteBenefitCode("ab"), "NEXA-AB");
  });
});

describe("parseTrackEvent (origens v2)", () => {
  it("aceita as origens novas", () => {
    for (const source of ["post_game", "tournament_day", "featured", "search", "map", "my_benefits", "app_news"]) {
      const parsed = parseTrackEvent({type: "club_view", source});
      assert.ok(!("error" in parsed));
      assert.equal(parsed.source, source);
    }
  });
});

describe("benefitUseUpdate", () => {
  it("primeiro uso cria o doc; toque repetido na janela não soma de novo", () => {
    const first = benefitUseUpdate(undefined, NOW);
    assert.equal(first["useCount"], 1);
    assert.equal(first["saved"], false);
    assert.deepEqual(first["firstUsedAt"], Timestamp.fromDate(NOW));
    const quick = benefitUseUpdate({...first, lastAnswer: "used"}, new Date(NOW.getTime() + 1000));
    assert.equal(quick["useCount"], 1);
    assert.equal(quick["lastAnswer"], null);
    assert.equal("saved" in quick, false);
    const later = benefitUseUpdate(first, new Date(NOW.getTime() + EVENT_DEBOUNCE_SECONDS * 1000));
    assert.equal(later["useCount"], 2);
    assert.deepEqual(later["firstUsedAt"], Timestamp.fromDate(NOW));
  });
});

describe("trackBenefitEventCore (uso)", () => {
  function makeV2Db() {
    const ctx = makeDb();
    ctx.fake.seedDoc("partners/codes", {...FAST, couponMode: "athlete"});
    ctx.fake.seedDoc("partners/squad", {...FAST, requirement: {type: "squad"}, requirementLabel: "Só Squad"});
    ctx.fake.seedDoc("partners/linqSquad", {...LINQ, audience: "all", requirement: {type: "squad"}});
    return ctx;
  }

  it("cta_click e code_copy contam uso e ligam o código do atleta, na mesma transação", async () => {
    const {fake, db} = makeV2Db();
    await trackBenefitEventCore(db, ATHLETE, {type: "code_copy", partnerId: "codes", source: "post_game"}, NOW);
    await trackBenefitEventCore(db, ATHLETE, {type: "cta_click", partnerId: "codes", source: "post_game"}, NOW);
    const use = fake.store.get(`users/${ATHLETE.uid}/benefits/codes`) as Record<string, unknown>;
    assert.equal(use["useCount"], 1);
    assert.equal(use["saved"], false);
    assert.equal(use["lastAnswer"], null);
    assert.deepEqual(use["lastUsedAt"], Timestamp.fromDate(NOW));
    const code = fake.store.get(`benefitCodes/${athleteBenefitCode(ATHLETE.uid)}`) as Record<string, unknown>;
    assert.deepEqual(code["uids"], [ATHLETE.uid]);
    assert.equal(docsIn(fake, "benefitEvents").length, 2);

    // Mesmo evento na mesma janela: não conta evento nem uso.
    const again = await trackBenefitEventCore(db, ATHLETE, {type: "cta_click", partnerId: "codes"}, new Date(NOW.getTime() + 2000));
    assert.deepEqual(again, {ok: true, counted: false});
    assert.equal(docsIn(fake, "benefitEvents").length, 2);

    const later = new Date(NOW.getTime() + 60_000);
    await trackBenefitEventCore(db, ATHLETE, {type: "cta_click", partnerId: "codes"}, later);
    assert.equal((fake.store.get(`users/${ATHLETE.uid}/benefits/codes`) as Record<string, unknown>)["useCount"], 2);
  });

  it("cupom fixo conta uso mas não grava benefitCodes; vista não conta uso", async () => {
    const {fake, db} = makeV2Db();
    await trackBenefitEventCore(db, ATHLETE, {type: "partner_view", partnerId: "fast-acai"}, NOW);
    assert.equal(fake.store.has(`users/${ATHLETE.uid}/benefits/fast-acai`), false);
    await trackBenefitEventCore(db, ATHLETE, {type: "cta_click", partnerId: "fast-acai"}, NOW);
    assert.equal((fake.store.get(`users/${ATHLETE.uid}/benefits/fast-acai`) as Record<string, unknown>)["useCount"], 1);
    assert.equal(docsIn(fake, "benefitCodes").length, 0);
  });

  it("parceiro com requisito: vê bloqueado, mas não usa nem manda lead sem cumprir", async () => {
    const {fake, db} = makeV2Db();
    assert.deepEqual(await trackBenefitEventCore(db, ATHLETE, {type: "partner_view", partnerId: "squad"}, NOW), {
      ok: true,
      counted: true,
    });
    await assert.rejects(trackBenefitEventCore(db, ATHLETE, {type: "cta_click", partnerId: "squad"}, NOW), /Só Squad/);
    await assert.rejects(submitPartnerLeadCore(db, ATHLETE, lead({partnerId: "linqSquad"}), NOW), (error: {code?: string}) => {
      assert.equal(error.code, "permission-denied");
      return true;
    });
    assert.equal(docsIn(fake, "partnerLeads").length, 0);

    fake.seedDoc(`squadAmbassadors/${ATHLETE.uid}`, {status: "active"});
    await trackBenefitEventCore(db, ATHLETE, {type: "cta_click", partnerId: "squad"}, NOW);
    await submitPartnerLeadCore(db, ATHLETE, lead({partnerId: "linqSquad"}), NOW);
    assert.equal(docsIn(fake, "partnerLeads").length, 1);
  });
});
