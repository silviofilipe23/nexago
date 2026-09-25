import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {parseKocPhases} from "./organizer-category-ops";

/**
 * Contrato de `parseKocPhases`: SUJEIRA DERRUBA O PLANO INTEIRO.
 *
 * Nunca um plano parcial. Sem plano o gerador cai nas regras antigas, que
 * funcionam; com um plano meio lido ele geraria uma chave que ninguém pediu —
 * e o organizador só descobriria na areia, com as duplas já na quadra.
 *
 * A função tem sete pontos de recusa e só um deles era exercitado, de raspão,
 * por `resolveKocConfig` ("plano malformado é descartado"). Cada `it` abaixo
 * cobre um ponto: apagar a linha correspondente da produção faz exatamente o
 * teste daquela linha ficar vermelho, porque o valor sujo passaria a virar
 * fase em vez de `undefined`.
 *
 * O espelho do portal (`koc-phase-plan.ts`, `parseKocPhases` → `null`) tem o
 * MESMO contrato e um bloco equivalente no seu `.spec.ts`. Divergir aqui faz a
 * tela aceitar um plano que o servidor recusa.
 */
describe("parseKocPhases · toda sujeira derruba o plano inteiro", () => {
  const validRaw = [
    {bracketSizes: [5, 5], roundsPerBracket: 3, qualifiersPerRound: 1, durationSec: 900},
    {bracketSizes: [6], roundsPerBracket: 4, qualifiersPerRound: 1, durationSec: 900},
    {bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 1200},
  ];

  it("plano bem formado atravessa inteiro", () => {
    assert.deepEqual(parseKocPhases(validRaw), [
      {bracketSizes: [5, 5], roundsPerBracket: 3, qualifiersPerRound: 1, durationSec: 900},
      {bracketSizes: [6], roundsPerBracket: 4, qualifiersPerRound: 1, durationSec: 900},
      {bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 1200},
    ]);
  });

  it("o que não é array vira undefined", () => {
    for (const raw of [undefined, null, {}, "não é plano", 7, true]) {
      assert.equal(parseKocPhases(raw), undefined, JSON.stringify(raw) ?? "undefined");
    }
  });

  it("array vazio vira undefined — plano sem fase não é plano", () => {
    assert.equal(parseKocPhases([]), undefined);
  });

  it("fase que não é objeto derruba tudo", () => {
    for (const item of [null, undefined, "fase", 3, [4, 4]]) {
      // Array É `typeof "object"`: quem barra o `[4, 4]` é `bracketSizes`
      // ausente, um ponto adiante. O importante é o desfecho — nada de plano.
      assert.equal(parseKocPhases([item]), undefined, JSON.stringify(item) ?? "undefined");
    }
  });

  it("bracketSizes que não é array derruba tudo", () => {
    assert.equal(parseKocPhases([{...validRaw[0], bracketSizes: 5}]), undefined);
    assert.equal(parseKocPhases([{...validRaw[0], bracketSizes: "5,5"}]), undefined);
    assert.equal(
      parseKocPhases([{roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900}]),
      undefined,
    );
  });

  it("bracketSizes vazio derruba tudo — fase sem chave não é fase", () => {
    assert.equal(parseKocPhases([{...validRaw[0], bracketSizes: []}]), undefined);
  });

  it("chave não positiva derruba tudo", () => {
    for (const sizes of [[5, 0], [5, -1], [0], [0.5]]) {
      assert.equal(parseKocPhases([{...validRaw[0], bracketSizes: sizes}]), undefined,
        JSON.stringify(sizes));
    }
  });

  it("chave não finita derruba tudo — NaN e Infinity chegam do Firestore como número", () => {
    // `Math.floor(Number(NaN))` é `NaN` e `Math.floor(Infinity)` é `Infinity`:
    // os dois passariam por qualquer comparação `< 1` (que é falsa para NaN).
    // Quem os barra é o `!Number.isFinite`, e só este caso o prova.
    for (const sizes of [[5, NaN], [5, Infinity], [-Infinity], ["x"], [null], [{}]]) {
      assert.equal(parseKocPhases([{...validRaw[0], bracketSizes: sizes}]), undefined,
        JSON.stringify(sizes));
    }
  });

  it("roundsPerBracket abaixo de 1 ou não finito derruba tudo", () => {
    for (const rounds of [0, -1, NaN, Infinity, -Infinity, "x", null, undefined, {}]) {
      assert.equal(parseKocPhases([{...validRaw[0], roundsPerBracket: rounds}]), undefined,
        String(rounds));
    }
  });

  it("qualifiersPerRound negativo ou não finito derruba tudo — mas 0 é a final legítima", () => {
    for (const q of [-1, NaN, Infinity, -Infinity, "x", undefined, {}]) {
      assert.equal(parseKocPhases([{...validRaw[0], qualifiersPerRound: q}]), undefined, String(q));
    }
    // `qualifiersPerRound: 0` é a final: ninguém classifica, a tabela é o
    // pódio. Recusar aqui apagaria todo plano que termina — ou seja, todos.
    assert.deepEqual(parseKocPhases([validRaw[2]]), [validRaw[2]]);
  });

  it("durationSec zero, negativo ou não finito derruba tudo", () => {
    for (const d of [0, -900, NaN, Infinity, -Infinity, "x", null, undefined, {}]) {
      assert.equal(parseKocPhases([{...validRaw[0], durationSec: d}]), undefined, String(d));
    }
  });

  it("uma fase suja derruba as boas junto — nunca um plano parcial", () => {
    const dirty = [validRaw[0], {...validRaw[1], roundsPerBracket: 0}, validRaw[2]];
    assert.equal(parseKocPhases(dirty), undefined);
    // O contraste que prova o ponto: as mesmas fases, sem a suja do meio,
    // atravessam — ou seja, foi a sujeira que derrubou, não o formato.
    assert.equal(parseKocPhases([validRaw[0], validRaw[2]])?.length, 2);
  });
});
