import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  PHRASE_BANK,
  phraseContextsFor,
  pickPhrase,
  type PhraseSituation,
} from "./draw-phrases";

const situacao = (over: Partial<PhraseSituation> = {}): PhraseSituation => ({
  format: "groups_knockout",
  potIndex: 2,
  totalPots: 4,
  isSeed: false,
  sameCityInGroup: false,
  isStrongestGroup: false,
  meetsSeedOnDebut: false,
  ...over,
});

describe("phraseContextsFor — do mais específico ao mais genérico", () => {
  it("cabeça de chave vem antes do pote", () => {
    assert.deepEqual(phraseContextsFor(situacao({isSeed: true, potIndex: 1})), [
      "seed",
      "pot_first",
      "generic",
    ]);
  });

  it("grupo da morte ganha prioridade sobre o pote", () => {
    const ctx = phraseContextsFor(situacao({isStrongestGroup: true}));
    assert.equal(ctx[0], "death_group");
    assert.ok(ctx.includes("generic"));
  });

  it("mesma cidade no grupo entra na fila", () => {
    assert.ok(phraseContextsFor(situacao({sameCityInGroup: true})).includes("same_city"));
  });

  it("último pote tem bucket próprio", () => {
    assert.ok(phraseContextsFor(situacao({potIndex: 4, totalPots: 4})).includes("pot_last"));
  });

  it("dupla eliminatória usa buckets próprios, nunca os de grupo", () => {
    const ctx = phraseContextsFor(situacao({format: "double_elimination"}));
    assert.ok(ctx.includes("de_position"));
    assert.ok(!ctx.includes("pot_first"));
    assert.ok(!ctx.includes("pot_last"));
  });

  it("estrear contra cabeça na dupla eliminatória tem bucket próprio e vem primeiro", () => {
    const ctx = phraseContextsFor(
      situacao({format: "double_elimination", meetsSeedOnDebut: true}),
    );
    assert.equal(ctx[0], "de_vs_seed");
  });

  it("sempre termina em 'generic' — nunca fica sem lugar de onde tirar frase", () => {
    for (const s of [
      situacao(),
      situacao({isSeed: true}),
      situacao({format: "double_elimination"}),
      situacao({potIndex: 9, totalPots: 4}),
    ]) {
      const ctx = phraseContextsFor(s);
      assert.equal(ctx[ctx.length - 1], "generic");
    }
  });
});

describe("pickPhrase", () => {
  /** Sorteio falso e previsível: sempre o primeiro candidato. */
  const primeiro = (n: number) => (n > 0 ? 0 : 0);

  it("tira do bucket mais específico disponível", () => {
    const pick = pickPhrase(["seed", "generic"], new Set(), primeiro);
    assert.ok(pick);
    assert.ok(PHRASE_BANK.seed.some((p) => p.id === pick!.id));
  });

  it("não repete frase já usada na sessão", () => {
    const usadas = new Set(PHRASE_BANK.seed.map((p) => p.id));
    const pick = pickPhrase(["seed", "generic"], usadas, primeiro);
    assert.ok(pick);
    assert.ok(PHRASE_BANK.generic.some((p) => p.id === pick!.id));
  });

  it("com o banco inteiro esgotado devolve null — o telão vai sem frase", () => {
    const todas = new Set(Object.values(PHRASE_BANK).flatMap((b) => b.map((p) => p.id)));
    assert.equal(pickPhrase(["seed", "generic"], todas, primeiro), null);
  });

  it("respeita o sorteador injetado — mesma semente, mesma frase", () => {
    const segundo = () => 1;
    const a = pickPhrase(["generic"], new Set(), segundo);
    const b = pickPhrase(["generic"], new Set(), segundo);
    assert.deepEqual(a, b);
    assert.equal(a!.id, PHRASE_BANK.generic[1]!.id);
  });

  it("contexto desconhecido é ignorado em vez de estourar", () => {
    const pick = pickPhrase(["nao_existe" as never, "generic"], new Set(), primeiro);
    assert.ok(pick);
    assert.equal(pick!.id, PHRASE_BANK.generic[0]!.id);
  });
});

describe("PHRASE_BANK — governança do tom", () => {
  it("todo bucket tem pelo menos 3 frases, senão repete demais numa sessão", () => {
    for (const [bucket, phrases] of Object.entries(PHRASE_BANK)) {
      assert.ok(phrases.length >= 3, `bucket "${bucket}" tem só ${phrases.length}`);
    }
  });

  it("ids são únicos no banco inteiro — é o id que impede repetição", () => {
    const ids = Object.values(PHRASE_BANK).flatMap((b) => b.map((p) => p.id));
    assert.equal(new Set(ids).size, ids.length);
  });

  it("nenhuma frase fala de corpo, idade ou aparência", () => {
    // Barreira grosseira de propósito: a regra de verdade é editorial, mas uma
    // palavra dessas entrando por descuido é exatamente o acidente que o plano
    // manda evitar.
    const proibidas = /\b(gorda|magra|velha|nova demais|feia|bonita|corpo|idade)\b/i;
    for (const [bucket, phrases] of Object.entries(PHRASE_BANK)) {
      for (const p of phrases) {
        assert.ok(!proibidas.test(p.text), `"${p.text}" (bucket ${bucket}) fala da pessoa`);
      }
    }
  });
});
