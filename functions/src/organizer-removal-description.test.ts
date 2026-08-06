import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  MAX_REMOVAL_DESCRIPTION_LENGTH,
  MIN_REMOVAL_DESCRIPTION_LENGTH,
  buildRemovalNotificationBody,
  parseRemovalDescription,
} from "./organizer-removal-description";

const VALID = "Nível incompatível com a categoria";

describe("parseRemovalDescription", () => {
  it("aceita um motivo comum", () => {
    assert.deepEqual(parseRemovalDescription(VALID), {ok: true, value: VALID});
  });

  it("apara as pontas antes de validar e de devolver", () => {
    assert.deepEqual(parseRemovalDescription(`  ${VALID}  `), {
      ok: true,
      value: VALID,
    });
  });

  it("aceita exatamente o mínimo", () => {
    const value = "a".repeat(MIN_REMOVAL_DESCRIPTION_LENGTH);
    assert.deepEqual(parseRemovalDescription(value), {ok: true, value});
  });

  it("aceita exatamente o máximo", () => {
    const value = "a".repeat(MAX_REMOVAL_DESCRIPTION_LENGTH);
    assert.deepEqual(parseRemovalDescription(value), {ok: true, value});
  });

  it("recusa motivo vazio", () => {
    const result = parseRemovalDescription("");
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.message : "", /mínimo 10/);
  });

  it("recusa motivo só de espaços", () => {
    assert.equal(parseRemovalDescription("     ").ok, false);
  });

  it("recusa motivo curto demais", () => {
    assert.equal(
      parseRemovalDescription("a".repeat(MIN_REMOVAL_DESCRIPTION_LENGTH - 1)).ok,
      false,
    );
  });

  it("motivo curto só depois do trim também é recusado", () => {
    assert.equal(parseRemovalDescription("   curto   ").ok, false);
  });

  it("recusa motivo longo demais", () => {
    const result = parseRemovalDescription(
      "a".repeat(MAX_REMOVAL_DESCRIPTION_LENGTH + 1),
    );
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.message : "", /máximo 500/);
  });

  it("app antigo não manda o campo: recusa como se fosse vazio", () => {
    for (const raw of [undefined, null, 42, {}, []]) {
      assert.equal(parseRemovalDescription(raw).ok, false, `raw=${String(raw)}`);
    }
  });
});

describe("buildRemovalNotificationBody", () => {
  it("inscrição não paga recebe só o motivo do organizador", () => {
    assert.equal(
      buildRemovalNotificationBody({
        description: VALID,
        wasPaid: false,
        refundAmount: 0,
      }),
      VALID,
    );
  });

  it("inscrição paga anexa o valor a ser devolvido", () => {
    assert.equal(
      buildRemovalNotificationBody({
        description: VALID,
        wasPaid: true,
        refundAmount: 180,
      }),
      `${VALID} Reembolso de R$ 180,00 será tratado pelo organizador.`,
    );
  });

  it("paga sem valor conhecido manda procurar o organizador", () => {
    assert.equal(
      buildRemovalNotificationBody({
        description: VALID,
        wasPaid: true,
        refundAmount: 0,
      }),
      `${VALID} Procure o organizador para tratar do reembolso.`,
    );
  });

  it("centavos usam vírgula, como no resto do app", () => {
    assert.match(
      buildRemovalNotificationBody({
        description: VALID,
        wasPaid: true,
        refundAmount: 89.9,
      }),
      /R\$ 89,90 /,
    );
  });
});
