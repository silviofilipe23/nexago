import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  PHRASE_BANK,
  fillPhrase,
  phraseContextsFor,
  pickPhrase,
  shortenTeamLabel,
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
    const ctx = phraseContextsFor(situacao({format: "double_elimination", isSeed: true}));
    assert.deepEqual(ctx.filter((c) => c.startsWith("de_") || c === "seed" || c === "generic"), [
      "de_seed",
      "de_position",
      "de_generic",
    ]);
    assert.ok(!ctx.includes("pot_first"));
    assert.ok(!ctx.includes("pot_last"));
    assert.ok(!ctx.includes("pot_middle"));
    assert.ok(!ctx.includes("death_group"));
    assert.ok(!ctx.includes("same_city"));
    assert.ok(!ctx.includes("seed"));
    assert.ok(!ctx.includes("generic"));
  });

  it("estrear contra cabeça na dupla eliminatória tem bucket próprio e vem primeiro", () => {
    const ctx = phraseContextsFor(
      situacao({format: "double_elimination", meetsSeedOnDebut: true}),
    );
    assert.equal(ctx[0], "de_vs_seed");
  });

  it("grupos nunca puxam buckets de dupla eliminatória", () => {
    const ctx = phraseContextsFor(situacao({isSeed: true, potIndex: 1}));
    assert.ok(!ctx.some((c) => c.startsWith("de_")));
  });

  it("sempre termina no fallback do formato — nunca fica sem lugar de onde tirar frase", () => {
    assert.equal(lastOf(phraseContextsFor(situacao())), "generic");
    assert.equal(lastOf(phraseContextsFor(situacao({isSeed: true}))), "generic");
    assert.equal(
      lastOf(phraseContextsFor(situacao({format: "double_elimination"}))),
      "de_generic",
    );
    assert.equal(lastOf(phraseContextsFor(situacao({potIndex: 9, totalPots: 4}))), "generic");
  });
});

function lastOf<T>(items: readonly T[]): T | undefined {
  return items[items.length - 1];
}

describe("fillPhrase / shortenTeamLabel", () => {
  it("troca {team} pelo rótulo da dupla", () => {
    const filled = fillPhrase(
      {id: "x", text: "Chegou {team}. Respira."},
      "Ana / Bia",
    );
    assert.equal(filled.text, "Chegou Ana / Bia. Respira.");
    assert.equal(filled.id, "x");
  });

  it("frase sem placeholder passa intacta", () => {
    const raw = {id: "y", text: "Grupo da morte confirmado."};
    assert.deepEqual(fillPhrase(raw, "Ana / Bia"), raw);
  });

  it("sem label usa fallback — o telão nunca mostra {team} literal", () => {
    assert.equal(
      fillPhrase({id: "z", text: "{team} caiu aqui."}, "").text,
      "Essa dupla caiu aqui.",
    );
  });

  it("corta rótulo longo com reticências", () => {
    const long = "Maria Clara Fernandes / Ana Beatriz Souza Lima";
    const short = shortenTeamLabel(long, 20);
    assert.ok(short.endsWith("…"));
    assert.ok(short.length <= 20);
  });
});

describe("pickPhrase", () => {
  /** Sorteio falso e previsível: sempre o primeiro candidato. */
  const primeiro = (n: number) => (n > 0 ? 0 : 0);

  it("tira do bucket mais específico disponível", () => {
    const pick = pickPhrase(["seed", "generic"], new Set(), primeiro, "Ana / Bia");
    assert.ok(pick);
    assert.ok(PHRASE_BANK.seed.some((p) => p.id === pick!.id));
  });

  it("preenche {team} antes de devolver — telão recebe texto pronto", () => {
    const pick = pickPhrase(["seed"], new Set(), primeiro, "Ana / Bia");
    assert.ok(pick);
    assert.ok(!pick!.text.includes("{team}"));
    assert.ok(pick!.text.includes("Ana / Bia") || !PHRASE_BANK.seed[0]!.text.includes("{team}"));
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
    const a = pickPhrase(["generic"], new Set(), segundo, "Ana / Bia");
    const b = pickPhrase(["generic"], new Set(), segundo, "Ana / Bia");
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

  it("único placeholder permitido é {team}", () => {
    const outros = /\{(?!team\})[a-z_]+\}/i;
    for (const [bucket, phrases] of Object.entries(PHRASE_BANK)) {
      for (const p of phrases) {
        assert.ok(!outros.test(p.text), `"${p.text}" (bucket ${bucket}) usa placeholder estranho`);
      }
    }
  });

  it("cada bucket tem pelo menos uma frase com {team} e uma sem — mistura no telão", () => {
    for (const [bucket, phrases] of Object.entries(PHRASE_BANK)) {
      const withTeam = phrases.some((p) => p.text.includes("{team}"));
      const without = phrases.some((p) => !p.text.includes("{team}"));
      assert.ok(withTeam, `bucket "${bucket}" não tem frase com {team}`);
      assert.ok(without, `bucket "${bucket}" só tem {team} — falta frase de grupo/situação`);
    }
  });

  it("buckets de DE não falam em grupo de fase — senão a chave vira 'grupo' no telão", () => {
    for (const bucket of ["de_vs_seed", "de_seed", "de_position", "de_generic"] as const) {
      for (const p of PHRASE_BANK[bucket]) {
        const semWhats = p.text.replace(/grupo do WhatsApp/gi, "");
        assert.ok(
          !/\bgrupo\b/i.test(semWhats),
          `"${p.text}" (bucket ${bucket}) fala em grupo de fase`,
        );
      }
    }
  });
});
