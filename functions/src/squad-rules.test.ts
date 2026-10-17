import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  DEFAULT_SQUAD_RULES,
  affectsContracts,
  rulesChanges,
  saveSquadRulesCore,
  squadRulesErrors,
  type SquadRules,
} from "./squad-rules";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

const ACTOR = {uid: "admin1", name: "Lia Martins"};
const NOW = new Date("2026-10-17T12:00:00Z");

function rules(edit: (r: SquadRules) => void = () => undefined): SquadRules {
  const r = structuredClone(DEFAULT_SQUAD_RULES);
  edit(r);
  return r;
}

function fieldsOf(err: unknown): string[] {
  return ((err as {details?: {fields?: string[]}}).details?.fields) ?? [];
}

describe("squadRulesErrors", () => {
  it("o padrão do piloto é válido", () => {
    assert.deepEqual(squadRulesErrors(DEFAULT_SQUAD_RULES), []);
  });

  it("comissão e desconto ficam entre 0 e 30%", () => {
    const errors = squadRulesErrors(rules((r) => {
      r.tiers.ath.commissionPct = 31;
      r.tiers.amb.followerDiscountPct = -1;
    }));
    assert.ok(errors.includes("tiers.ath.commissionPct"));
    assert.ok(errors.includes("tiers.amb.followerDiscountPct"));
  });

  it("faixa de comissão só no Pro, e com início menor que o fim", () => {
    const errors = squadRulesErrors(rules((r) => {
      r.tiers.amb.commissionPct = [10, 12];
      r.tiers.pro.commissionPct = [15, 12];
    }));
    assert.ok(errors.includes("tiers.amb.commissionPct"));
    assert.ok(errors.includes("tiers.pro.commissionPct"));
  });

  it("comissão + desconto não passam da margem máxima (piso da faixa no Pro)", () => {
    assert.deepEqual(
      squadRulesErrors(rules((r) => {
        r.tiers.cap.commissionPct = 16;
      })),
      ["tiers.cap.margin"],
    );
    // 10–15 + 15 = 25 no piso: cabe na margem de 25.
    assert.deepEqual(squadRulesErrors(rules((r) => (r.tiers.pro.followerDiscountPct = 15))), []);
    // Margem de 20: Ambassador e Captain (10 + 10) ainda cabem; o Pro (10 + 15) não.
    assert.deepEqual(squadRulesErrors(rules((r) => (r.marginMaxPct = 20))), ["tiers.pro.margin"]);
  });

  it("escada: Ambassador não ganha menos que Athlete; Captain fica fora", () => {
    assert.deepEqual(
      squadRulesErrors(rules((r) => {
        r.tiers.ath.commissionPct = 12;
        r.tiers.ath.followerDiscountPct = 5;
        r.tiers.cap.commissionPct = 2;
      })),
      ["tiers.amb.ladder"],
    );
  });

  it("inscrições: tipo conhecido e valor no limite de cada tipo", () => {
    const errors = squadRulesErrors(rules((r) => {
      r.tiers.ath.registrations = {type: "discount", value: 0};
      r.tiers.amb.registrations = {type: "freePerMonth", value: 11};
      r.tiers.cap.registrations = {type: "bogus" as never, value: 1};
    }));
    assert.deepEqual(errors, ["tiers.amb.registrations", "tiers.ath.registrations", "tiers.cap.registrations"]);
  });

  it("teto de cachê é só do Pro e bônus de torneio só do Captain", () => {
    const errors = squadRulesErrors(rules((r) => {
      delete r.tiers.pro.campaignFeeCapCents;
      r.tiers.cap.tournamentOriginBonusCents = 12.5;
    }));
    assert.deepEqual(errors, ["tiers.cap.tournamentOriginBonusCents", "tiers.pro.campaignFeeCapCents"]);
  });

  it("as duas regras de atribuição do programa não desligam", () => {
    const errors = squadRulesErrors(rules((r) => {
      (r.attribution as {requirePaidConfirmation: boolean}).requirePaidConfirmation = false;
      (r.attribution as {cancelOnRefund: boolean}).cancelOnRefund = false;
      r.attribution.windowDays = 91;
    }));
    assert.deepEqual(errors, [
      "attribution.cancelOnRefund",
      "attribution.requirePaidConfirmation",
      "attribution.windowDays",
    ]);
  });

  it("pesos do Score somam 100", () => {
    assert.deepEqual(squadRulesErrors(rules((r) => (r.scoreWeights.reach = 15))), ["scoreWeights.total"]);
  });

  it("limites de nível do atleta começam em 0 e sobem estritamente", () => {
    const errors = squadRulesErrors(rules((r) => {
      r.points.levels[2]!.min = 500;
    }));
    assert.deepEqual(errors, ["points.levels.2"]);
    assert.deepEqual(squadRulesErrors(rules((r) => (r.points.levels[0]!.min = 10))), ["points.levels.0"]);
  });

  it("promoções têm a ordem fixa e checklist curto", () => {
    const errors = squadRulesErrors(rules((r) => {
      r.promotion[0]!.minConversions = 0;
      r.promotion[1]!.checklist = ["ok", "  "];
      r.termination.maxRoi = 0;
    }));
    assert.deepEqual(errors, ["promotion.0.minConversions", "promotion.1.checklist", "termination.maxRoi"]);
    assert.deepEqual(squadRulesErrors(rules((r) => r.promotion.reverse())), ["promotion.0.step", "promotion.1.step"]);
  });
});

describe("rulesChanges / affectsContracts", () => {
  it("resume por seção e só o pacote afeta contrato", () => {
    const next = rules((r) => {
      r.tiers.amb.kitCostCents = 130_00;
      r.scoreWeights.reach = 5;
      r.scoreWeights.content = 10;
    });
    assert.deepEqual(rulesChanges(DEFAULT_SQUAD_RULES, next), ["Pacote · Ambassador", "Pesos do Score"]);
    assert.equal(affectsContracts(DEFAULT_SQUAD_RULES, next), true);
    assert.equal(affectsContracts(DEFAULT_SQUAD_RULES, rules((r) => (r.attribution.windowDays = 15))), false);
  });
});

describe("saveSquadRulesCore", () => {
  it("o primeiro salvamento grava o piloto como v1 e a nova como v2", async () => {
    const {fake, db} = makeDb();
    const next = rules((r) => (r.attribution.windowDays = 45));
    const out = await saveSquadRulesCore(db, {rules: next, version: 1}, ACTOR, NOW);

    assert.equal(out.version, 2);
    assert.deepEqual(out.changes, ["Regras de atribuição"]);
    const current = fake.store.get("squadConfig/rules")!;
    assert.equal(current["version"], 2);
    assert.equal((current["rules"] as SquadRules).attribution.windowDays, 45);
    assert.deepEqual(current["updatedBy"], ACTOR);

    const v1 = fake.store.get("squadConfig/rules/versions/1")!;
    assert.equal(v1["createdBy"], null);
    assert.deepEqual(v1["rules"], DEFAULT_SQUAD_RULES);
    const v2 = fake.store.get("squadConfig/rules/versions/2")!;
    assert.equal(v2["affectsContracts"], false);
    assert.deepEqual(v2["changes"], ["Regras de atribuição"]);
  });

  it("recusa versão desatualizada", async () => {
    const {db} = makeDb();
    await saveSquadRulesCore(db, {rules: rules((r) => (r.attribution.windowDays = 45)), version: 1}, ACTOR, NOW);
    await assert.rejects(
      saveSquadRulesCore(db, {rules: rules((r) => (r.attribution.windowDays = 20)), version: 1}, ACTOR, NOW),
      (err: {code?: string}) => err.code === "failed-precondition",
    );
  });

  it("recusa salvar sem mudança", async () => {
    const {db} = makeDb();
    await assert.rejects(
      saveSquadRulesCore(db, {rules: rules(), version: 1}, ACTOR, NOW),
      (err: {code?: string; message?: string}) =>
        err.code === "invalid-argument" && err.message === "Nenhuma alteração para salvar.",
    );
  });

  it("recusa regra inválida apontando os campos", async () => {
    const {db} = makeDb();
    await assert.rejects(
      saveSquadRulesCore(db, {rules: rules((r) => (r.scoreWeights.reach = 50)), version: 1}, ACTOR, NOW),
      (err: unknown) => fieldsOf(err).includes("scoreWeights.total"),
    );
  });

  it("restaurar grava o conteúdo antigo como a próxima versão, com a origem", async () => {
    const {fake, db} = makeDb();
    await saveSquadRulesCore(db, {rules: rules((r) => (r.tiers.ath.kitCostCents = 70_00)), version: 1}, ACTOR, NOW);
    const out = await saveSquadRulesCore(
      db,
      {rules: rules(), version: 2, restoredFrom: 1, note: " Volta ao piloto "},
      ACTOR,
      NOW,
    );
    assert.equal(out.version, 3);
    const v3 = fake.store.get("squadConfig/rules/versions/3")!;
    assert.equal(v3["restoredFrom"], 1);
    assert.equal(v3["note"], "Volta ao piloto");
    assert.equal(v3["affectsContracts"], true);
  });

  it("guarda só os campos conhecidos, com textos aparados", async () => {
    const {fake, db} = makeDb();
    const next = rules((r) => {
      r.tiers.ath.kit = "  Kit básico  ";
      (r.tiers.ath as unknown as Record<string, unknown>)["extra"] = "x";
      (r.tiers.ath as {campaignFeeCapCents?: number}).campaignFeeCapCents = 10;
    });
    await saveSquadRulesCore(db, {rules: next, version: 1}, ACTOR, NOW);
    const ath = (fake.store.get("squadConfig/rules")!["rules"] as SquadRules).tiers.ath as unknown as Record<string, unknown>;
    assert.equal(ath["kit"], "Kit básico");
    assert.equal("extra" in ath, false);
    assert.equal("campaignFeeCapCents" in ath, false);
  });
});
