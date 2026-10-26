import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  DEFAULT_FEE_RULE,
  NO_FEE_RULE,
  athleteFeeReais,
  athleteVisibleFeeRule,
  feeDefaultsFromRaw,
  feeOverrideFromRaw,
  feeRuleFromRaw,
  inferAthleteFeeReais,
  loadAthleteVisibleFeeRule,
  loadTournamentFeeRule,
  organizerFeePercent,
  resolveTournamentFeeRule,
  saveFeeDefaultCore,
  saveTournamentFeeCore,
  splitTournamentFee,
  tournamentFeeChanges,
  tournamentFeeErrors,
  tournamentFeeReais,
} from "./tournament-fees";

process.env.GCLOUD_PROJECT = "p";

const ACTOR = {uid: "adm", name: "Marina Costa"};
const NOW = new Date("2026-10-26T15:00:00Z");
const TODAY = "2026-10-26";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function logs(fake: FakeFirestore): Record<string, unknown>[] {
  return [...fake.store.entries()].filter(([p]) => p.startsWith("tournamentFeesLog/")).map(([, d]) => d);
}

async function rejectsWith(p: Promise<unknown>, code: string): Promise<HttpsError> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof HttpsError, `esperava HttpsError, veio ${String(e)}`);
    assert.equal(e.code, code);
    return e;
  }
  assert.fail(`esperava ${code}`);
}

describe("tournament-fees: leitura", () => {
  it("padrão ausente ou corrompido cai nos 8% com piso de R$ 1,50", () => {
    assert.deepEqual(feeDefaultsFromRaw(undefined), {percent: 8, floorReais: 1.5, payer: "organizador"});
    assert.deepEqual(feeDefaultsFromRaw({percent: 99, floorReais: -1, payer: "ninguém"}), DEFAULT_FEE_RULE);
    assert.deepEqual(feeDefaultsFromRaw({percent: 7.5, floorReais: 2}), {percent: 7.5, floorReais: 2, payer: "organizador"});
    assert.deepEqual(feeDefaultsFromRaw({percent: 7.5, floorReais: 2, payer: "atleta"}),
      {percent: 7.5, floorReais: 2, payer: "atleta"});
  });

  it("exceção: custom precisa de % e piso válidos; isento zera; padrão não é exceção", () => {
    assert.deepEqual(feeOverrideFromRaw({mode: "custom", percent: 6, floorReais: 2, reason: "Parceria comercial"}), {
      mode: "custom", percent: 6, floorReais: 2, payer: "organizador", reason: "Parceria comercial", until: null,
    });
    assert.equal(feeOverrideFromRaw({mode: "custom", percent: 6, floorReais: 2, payer: "dividido"})?.payer, "dividido");
    assert.equal(feeOverrideFromRaw({mode: "custom", percent: 50, floorReais: 2}), null);
    assert.deepEqual(feeOverrideFromRaw({mode: "isento", until: "2026-12-31"}), {
      mode: "isento", percent: 0, floorReais: 0, payer: "organizador", reason: "", until: "2026-12-31",
    });
    assert.equal(feeOverrideFromRaw({mode: "padrao", version: 3}), null);
    assert.equal(feeOverrideFromRaw(undefined), null);
  });

  it("regra congelada no pagamento", () => {
    assert.deepEqual(feeRuleFromRaw({percent: 6, floorReais: 2, source: "tournament"}), {percent: 6, floorReais: 2, payer: "organizador"});
    assert.deepEqual(feeRuleFromRaw({percent: 6, floorReais: 2, payer: "atleta"}), {percent: 6, floorReais: 2, payer: "atleta"});
    assert.equal(feeRuleFromRaw({percent: "6"}), null);
    assert.equal(feeRuleFromRaw(null), null);
  });
});

describe("tournament-fees: cascata", () => {
  const defaults = {percent: 8, floorReais: 1.5, payer: "organizador" as const};
  const custom = {mode: "custom" as const, percent: 5, floorReais: 2, payer: "organizador" as const, reason: "Parceria comercial", until: null};

  it("exceção do torneio > comissão do organizador > padrão", () => {
    const organizer = {commissionPercent: 6};
    assert.deepEqual(resolveTournamentFeeRule({override: custom, organizer, defaults, today: TODAY}),
      {percent: 5, floorReais: 2, payer: "organizador", source: "tournament"});
    assert.deepEqual(resolveTournamentFeeRule({override: null, organizer, defaults, today: TODAY}),
      {percent: 6, floorReais: 1.5, payer: "organizador", source: "organizer"});
    assert.deepEqual(resolveTournamentFeeRule({override: null, organizer: null, defaults, today: TODAY}),
      {percent: 8, floorReais: 1.5, payer: "organizador", source: "default"});
  });

  it("quem paga: exceção e padrão levam o seu; comissão do cadastro é sempre do organizador", () => {
    const organizer = {commissionPercent: 6};
    const atleta = {...defaults, payer: "atleta" as const};
    assert.equal(resolveTournamentFeeRule({override: {...custom, payer: "dividido"}, organizer, defaults, today: TODAY}).payer,
      "dividido");
    assert.equal(resolveTournamentFeeRule({override: null, organizer, defaults: atleta, today: TODAY}).payer, "organizador");
    assert.equal(resolveTournamentFeeRule({override: null, organizer: null, defaults: atleta, today: TODAY}).payer, "atleta");
  });

  it("exceção vale até o dia de `until` (inclusive) e depois volta à cascata, sem varredura", () => {
    const override = {...custom, until: "2026-10-26"};
    assert.equal(resolveTournamentFeeRule({override, organizer: null, defaults, today: "2026-10-26"}).source, "tournament");
    assert.equal(resolveTournamentFeeRule({override, organizer: null, defaults, today: "2026-10-27"}).source, "default");
  });

  it("isento não cobra nem o piso", () => {
    const rule = resolveTournamentFeeRule({
      override: {mode: "isento", percent: 0, floorReais: 0, payer: "organizador", reason: "Evento beneficente", until: null},
      organizer: {commissionPercent: 6}, defaults, today: TODAY,
    });
    assert.equal(tournamentFeeReais(120, rule), 0);
  });

  it("piso da regra: 5% de R$ 20 = R$ 1, sobe para o mínimo de R$ 2", () => {
    assert.equal(tournamentFeeReais(20, {percent: 5, floorReais: 2, payer: "organizador"}), 2);
    assert.equal(tournamentFeeReais(100, {percent: 5, floorReais: 2, payer: "organizador"}), 5);
  });

  it("carrega exceção, cadastro do organizador e padrão do Firestore", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("appConfig/tournamentFees", {percent: 9, floorReais: 1});
    assert.deepEqual(await loadTournamentFeeRule(db, "t1", "org1", NOW), {percent: 9, floorReais: 1, payer: "organizador", source: "default"});
    assert.equal(await organizerFeePercent(db, "org1"), 9);

    fake.seedDoc("organizers/org1", {commissionPercent: 6});
    assert.deepEqual(await loadTournamentFeeRule(db, "t1", "org1", NOW), {percent: 6, floorReais: 1, payer: "organizador", source: "organizer"});
    assert.equal(await organizerFeePercent(db, "org1"), 6);

    fake.seedDoc("tournamentFees/t1", {mode: "isento", reason: "Evento beneficente", until: "2026-10-25"});
    assert.equal((await loadTournamentFeeRule(db, "t1", "org1", NOW)).source, "organizer", "vencida ontem");
    fake.seedDoc("tournamentFees/t1", {mode: "isento", reason: "Evento beneficente", until: null});
    assert.deepEqual(await loadTournamentFeeRule(db, "t1", "org1", NOW), {percent: 0, floorReais: 0, payer: "organizador", source: "tournament"});
  });
});

describe("tournament-fees: validação", () => {
  const base = {tournamentId: "t1", version: 0};

  it("exceção exige motivo da lista; padrão não", () => {
    assert.deepEqual(tournamentFeeErrors({...base, mode: "padrao"}, TODAY), []);
    assert.deepEqual(tournamentFeeErrors({...base, mode: "isento"}, TODAY), ["reason"]);
    assert.deepEqual(tournamentFeeErrors({...base, mode: "isento", reason: "Porque sim"}, TODAY), ["reason"]);
    assert.deepEqual(tournamentFeeErrors({...base, mode: "isento", reason: "Evento beneficente"}, TODAY), []);
  });

  it("custom: % até 20 com duas casas, piso até R$ 20", () => {
    const ok = {...base, mode: "custom", reason: "Parceria comercial", floorReais: 2};
    assert.deepEqual(tournamentFeeErrors({...ok, percent: 5.5}, TODAY), []);
    assert.deepEqual(tournamentFeeErrors({...ok, percent: 21}, TODAY), ["percent"]);
    assert.deepEqual(tournamentFeeErrors({...ok, percent: 5.555}, TODAY), ["percent"]);
    assert.deepEqual(tournamentFeeErrors({...ok, percent: 5, floorReais: 25}, TODAY), ["floorReais"]);
  });

  it("válida até: data real, de hoje em diante", () => {
    const ok = {...base, mode: "isento", reason: "Evento beneficente"};
    assert.deepEqual(tournamentFeeErrors({...ok, until: TODAY}, TODAY), []);
    assert.deepEqual(tournamentFeeErrors({...ok, until: "2026-10-25"}, TODAY), ["until"]);
    assert.deepEqual(tournamentFeeErrors({...ok, until: "2026-02-30"}, TODAY), ["until"]);
    assert.deepEqual(tournamentFeeErrors({...ok, until: ""}, TODAY), []);
  });

  it("descreve a mudança para o histórico", () => {
    const custom = {mode: "custom" as const, percent: 6, floorReais: 2, payer: "organizador" as const, reason: "Parceria comercial",
      until: "2026-12-31"};
    assert.deepEqual(tournamentFeeChanges(null, custom), ["padrão → 6% · mínimo R$ 2,00", "válida até 31/12/2026"]);
    assert.deepEqual(tournamentFeeChanges({mode: "isento", percent: 0, floorReais: 0, payer: "organizador", reason: "Evento beneficente", until: null}, null),
      ["isento → padrão"]);
    assert.deepEqual(tournamentFeeChanges(custom, {...custom, payer: "atleta"}),
      ["6% · mínimo R$ 2,00 → 6% · mínimo R$ 2,00 · quem paga: Atleta"]);
  });
});

describe("tournament-fees: saveFeeDefaultCore", () => {
  it("grava a versão 2, loga a mudança e acusa conflito de versão", async () => {
    const {fake, db} = makeDb();
    const out = await saveFeeDefaultCore(db, {percent: 7, floorReais: 2, version: 1}, ACTOR, NOW);
    assert.deepEqual(out, {version: 2, percent: 7, floorReais: 2, payer: "organizador", changes: ["8% → 7%", "mínimo R$ 1,50 → R$ 2,00"]});
    const doc = fake.store.get("appConfig/tournamentFees")!;
    assert.equal(doc["percent"], 7);
    assert.equal(doc["version"], 2);
    assert.deepEqual(doc["updatedBy"], ACTOR);
    assert.equal(logs(fake).length, 1);
    assert.equal(logs(fake)[0]!["scope"], "default");

    await rejectsWith(saveFeeDefaultCore(db, {percent: 6, floorReais: 2, version: 1}, ACTOR, NOW), "failed-precondition");
    await rejectsWith(saveFeeDefaultCore(db, {percent: 7, floorReais: 2, version: 2}, ACTOR, NOW), "invalid-argument");
    await rejectsWith(saveFeeDefaultCore(db, {percent: 30, floorReais: 2, version: 2}, ACTOR, NOW), "invalid-argument");
  });

  it("quem paga: grava e loga a troca; sem o campo, mantém o gravado", async () => {
    const {fake, db} = makeDb();
    const out = await saveFeeDefaultCore(db, {percent: 8, floorReais: 1.5, payer: "atleta", version: 1}, ACTOR, NOW);
    assert.deepEqual(out.changes, ["quem paga: Organizador → Atleta"]);
    assert.equal(fake.store.get("appConfig/tournamentFees")!["payer"], "atleta");

    const kept = await saveFeeDefaultCore(db, {percent: 7, floorReais: 1.5, version: 2}, ACTOR, NOW);
    assert.equal(kept.payer, "atleta");
    assert.equal(fake.store.get("appConfig/tournamentFees")!["payer"], "atleta");

    const e = await rejectsWith(
      saveFeeDefaultCore(db, {percent: 7, floorReais: 1.5, payer: "plataforma" as never, version: 3}, ACTOR, NOW),
      "invalid-argument",
    );
    assert.deepEqual((e.details as {fields: string[]}).fields, ["payer"]);
  });
});

describe("tournament-fees: saveTournamentFeeCore", () => {
  function seed(fake: FakeFirestore): void {
    fake.seedDoc("tournaments/t1", {name: "Open Goiás", managerId: "org1"});
  }

  it("grava a exceção, loga e avisa o organizador quando pedido", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const sent: Array<{managerId: string; body: string}> = [];
    const out = await saveTournamentFeeCore(db, {
      tournamentId: "t1", mode: "custom", percent: 6, floorReais: 2, reason: "Parceria comercial",
      until: "2026-12-31", notify: true, version: 0,
    }, ACTOR, NOW, async (n) => {
      sent.push(n);
    });

    assert.equal(out.version, 1);
    assert.equal(out.notified, true);
    const doc = fake.store.get("tournamentFees/t1")!;
    assert.equal(doc["mode"], "custom");
    assert.equal(doc["percent"], 6);
    assert.equal(doc["until"], "2026-12-31");
    assert.equal(doc["managerId"], "org1");
    assert.equal(doc["tournamentName"], "Open Goiás");
    assert.equal(logs(fake)[0]!["tournamentId"], "t1");
    assert.equal(sent[0]!.managerId, "org1");
    assert.match(sent[0]!.body, /6% \(mínimo R\$ 2,00\).*até 31\/12\/2026/);
    assert.equal(doc["payer"], "organizador", "sem o campo, o organizador paga");
  });

  it("personalizada com quem paga: grava, descreve e avisa quem paga", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const sent: Array<{body: string}> = [];
    const out = await saveTournamentFeeCore(db, {
      tournamentId: "t1", mode: "custom", percent: 6, floorReais: 2, payer: "dividido", reason: "Parceria comercial",
      notify: true, version: 0,
    }, ACTOR, NOW, async (n) => {
      sent.push(n);
    });
    assert.equal(out.override?.payer, "dividido");
    assert.equal(fake.store.get("tournamentFees/t1")!["payer"], "dividido");
    assert.deepEqual(out.changes, ["padrão → 6% · mínimo R$ 2,00 · quem paga: Dividido"]);
    assert.match(sent[0]!.body, /dividida: metade por cima do valor da inscrição, metade do seu repasse/);

    const e = await rejectsWith(saveTournamentFeeCore(db, {
      tournamentId: "t1", mode: "custom", percent: 6, floorReais: 2, payer: "x" as never, reason: "Parceria comercial",
      version: 1,
    }, ACTOR, NOW), "invalid-argument");
    assert.deepEqual((e.details as {fields: string[]}).fields, ["payer"]);
  });

  it("voltar ao padrão mantém o doc (versão) sem exceção e não avisa sem pedido", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    fake.seedDoc("tournamentFees/t1", {mode: "isento", reason: "Evento beneficente", until: null, version: 1});
    let calls = 0;
    const out = await saveTournamentFeeCore(db, {tournamentId: "t1", mode: "padrao", notify: false, version: 1},
      ACTOR, NOW, async () => {
        calls++;
      });
    assert.equal(out.version, 2);
    assert.equal(out.override, null);
    assert.equal(calls, 0);
    assert.equal(fake.store.get("tournamentFees/t1")!["mode"], "padrao");
    assert.equal(feeOverrideFromRaw(fake.store.get("tournamentFees/t1")), null);
    assert.deepEqual(logs(fake)[0]!["changes"], ["isento → padrão"]);
  });

  it("falha do aviso não desfaz a taxa gravada", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const out = await saveTournamentFeeCore(db, {
      tournamentId: "t1", mode: "isento", reason: "Evento beneficente", notify: true, version: 0,
    }, ACTOR, NOW, async () => {
      throw new Error("sem push");
    });
    assert.equal(out.notified, false);
    assert.equal(fake.store.get("tournamentFees/t1")!["mode"], "isento");
  });

  it("recusa versão velha, torneio inexistente, nada mudou e dados inválidos", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    fake.seedDoc("tournamentFees/t1", {mode: "isento", reason: "Evento beneficente", until: null, version: 2});
    const isento = {tournamentId: "t1", mode: "isento" as const, reason: "Evento beneficente"};
    await rejectsWith(saveTournamentFeeCore(db, {...isento, version: 1}, ACTOR, NOW), "failed-precondition");
    await rejectsWith(saveTournamentFeeCore(db, {...isento, version: 2}, ACTOR, NOW), "invalid-argument");
    await rejectsWith(saveTournamentFeeCore(db, {...isento, tournamentId: "nada", version: 0}, ACTOR, NOW), "not-found");
    const e = await rejectsWith(saveTournamentFeeCore(db, {tournamentId: "t1", mode: "custom", version: 2}, ACTOR, NOW),
      "invalid-argument");
    assert.deepEqual((e.details as {fields: string[]}).fields, ["percent", "floorReais", "reason"]);
  });
});

describe("tournament-fees: quem paga", () => {
  const rule = (payer: "atleta" | "organizador" | "dividido") => ({percent: 8, floorReais: 1.5, payer});

  it("parte do atleta: toda a taxa, metade (centavo ímpar fica com o organizador) ou nada", () => {
    assert.equal(athleteFeeReais(50, rule("atleta")), 4);
    assert.equal(athleteFeeReais(50, rule("dividido")), 2);
    assert.equal(athleteFeeReais(50, rule("organizador")), 0);
    // R$ 19,37 × 8% = R$ 1,55 → metade R$ 0,77 para o atleta, R$ 0,78 do repasse.
    assert.equal(athleteFeeReais(19.37, rule("dividido")), 0.77);
    // Piso: R$ 10 × 8% = R$ 0,80 → R$ 1,50.
    assert.equal(athleteFeeReais(10, rule("atleta")), 1.5);
    assert.equal(athleteFeeReais(100, NO_FEE_RULE), 0);
  });

  it("divisão da taxa: o organizador paga o que o atleta não pagou, nunca negativo", () => {
    assert.deepEqual(splitTournamentFee(50, rule("atleta"), 4), {platformFeeReais: 4, organizerFeeReais: 0});
    assert.deepEqual(splitTournamentFee(19.37, rule("dividido"), 0.77), {platformFeeReais: 1.55, organizerFeeReais: 0.78});
    assert.deepEqual(splitTournamentFee(50, rule("organizador"), 0), {platformFeeReais: 4, organizerFeeReais: 4});
    // Taxa baixou entre a cobrança e a confirmação: a nexaGO fica com o que o atleta pagou.
    assert.deepEqual(splitTournamentFee(50, {...rule("atleta"), percent: 5}, 4), {platformFeeReais: 4, organizerFeeReais: 0});
  });

  it("refaz preço e parte do atleta a partir do bruto cobrado", () => {
    assert.equal(inferAthleteFeeReais(54, rule("atleta")), 4);
    assert.equal(inferAthleteFeeReais(52, rule("dividido")), 2);
    assert.equal(inferAthleteFeeReais(11.5, rule("atleta")), 1.5);
    assert.equal(inferAthleteFeeReais(20.14, rule("dividido")), 0.77);
    assert.equal(inferAthleteFeeReais(50, rule("organizador")), 0);
  });

  it("o atleta só vê a regra quando paga parte dela", () => {
    assert.deepEqual(athleteVisibleFeeRule({...rule("atleta"), percent: 6}), {percent: 6, floorReais: 1.5, payer: "atleta"});
    assert.deepEqual(athleteVisibleFeeRule({...rule("organizador"), percent: 6}), NO_FEE_RULE);
    assert.deepEqual(athleteVisibleFeeRule(null), NO_FEE_RULE);
  });

  it("prévia do checkout: cascata do torneio, sem expor a comissão do cadastro", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("tournaments/t1", {name: "Open Goiás", managerId: "org1"});
    fake.seedDoc("tournaments/semdono", {name: "Sem organizador"});
    fake.seedDoc("appConfig/tournamentFees", {percent: 8, floorReais: 1.5, payer: "atleta"});
    assert.deepEqual(await loadAthleteVisibleFeeRule(db, "t1", NOW), {percent: 8, floorReais: 1.5, payer: "atleta"});
    assert.deepEqual(await loadAthleteVisibleFeeRule(db, "semdono", NOW), NO_FEE_RULE);

    fake.seedDoc("organizers/org1", {commissionPercent: 5});
    assert.deepEqual(await loadAthleteVisibleFeeRule(db, "t1", NOW), NO_FEE_RULE);

    fake.seedDoc("tournamentFees/t1", {mode: "custom", percent: 6, floorReais: 2, payer: "dividido", until: null});
    assert.deepEqual(await loadAthleteVisibleFeeRule(db, "t1", NOW), {percent: 6, floorReais: 2, payer: "dividido"});
    await rejectsWith(loadAthleteVisibleFeeRule(db, "nada", NOW), "not-found");
  });
});
