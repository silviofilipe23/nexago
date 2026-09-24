import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {validateManualBookingInput} from "./arena-manual-booking";

describe("validateManualBookingInput", () => {
  const todayKey = "2026-09-24";
  const validBase = {
    arenaId: "arena1",
    courtId: "court1",
    date: "2026-09-24",
    startTime: "19:00",
    endTime: "20:00",
    customerName: "João Silva",
    amountReais: 120,
  };

  it("normaliza um payload válido de cliente sem conta", () => {
    assert.deepEqual(validateManualBookingInput(validBase, todayKey), {
      arenaId: "arena1",
      courtId: "court1",
      dateKey: "2026-09-24",
      startTime: "19:00",
      endTime: "20:00",
      athleteId: null,
      customerName: "João Silva",
      amountReais: 120,
      note: null,
    });
  });

  it("aceita atleta vinculado sem nome digitado", () => {
    const result = validateManualBookingInput(
      {...validBase, customerName: "  ", athleteId: "uid123"},
      todayKey,
    );
    assert.equal(result.athleteId, "uid123");
    assert.equal(result.customerName, null);
  });

  it("recusa quando não há atleta nem nome do cliente", () => {
    assert.throws(
      () => validateManualBookingInput({...validBase, customerName: ""}, todayKey),
      /Informe o atleta ou o nome do cliente/,
    );
  });

  it("aceita valor zero (cortesia)", () => {
    assert.equal(validateManualBookingInput({...validBase, amountReais: 0}, todayKey).amountReais, 0);
  });

  it("recusa valor negativo e valor não numérico", () => {
    assert.throws(
      () => validateManualBookingInput({...validBase, amountReais: -1}, todayKey),
      /Valor inválido/,
    );
    assert.throws(
      () => validateManualBookingInput({...validBase, amountReais: Number.NaN}, todayKey),
      /Valor inválido/,
    );
  });

  it("recusa fim menor ou igual ao início", () => {
    assert.throws(
      () => validateManualBookingInput({...validBase, endTime: "19:00"}, todayKey),
      /Intervalo de horário inválido/,
    );
    assert.throws(
      () => validateManualBookingInput({...validBase, endTime: "18:00"}, todayKey),
      /Intervalo de horário inválido/,
    );
  });

  it("aceita virada de meia-noite (23:00 → 00:00)", () => {
    const result = validateManualBookingInput(
      {...validBase, startTime: "23:00", endTime: "00:00"},
      todayKey,
    );
    assert.equal(result.endTime, "00:00");
  });

  it("recusa dia anterior a hoje, aceita hoje", () => {
    assert.throws(
      () => validateManualBookingInput({...validBase, date: "2026-09-23"}, todayKey),
      /data passada/,
    );
    assert.equal(validateManualBookingInput(validBase, todayKey).dateKey, todayKey);
  });

  it("aceita hora já passada no dia de hoje (cliente que chega atrasado)", () => {
    const result = validateManualBookingInput(
      {...validBase, startTime: "07:00", endTime: "08:00"},
      todayKey,
    );
    assert.equal(result.startTime, "07:00");
  });

  it("normaliza hora sem zero à esquerda e corta segundos", () => {
    const result = validateManualBookingInput(
      {...validBase, startTime: "9:00", endTime: "10:00:00"},
      todayKey,
    );
    assert.equal(result.startTime, "09:00");
    assert.equal(result.endTime, "10:00");
  });

  it("guarda a observação aparada e vira null quando vazia", () => {
    assert.equal(
      validateManualBookingInput({...validBase, note: "  pagou em dinheiro "}, todayKey).note,
      "pagou em dinheiro",
    );
    assert.equal(validateManualBookingInput({...validBase, note: "   "}, todayKey).note, null);
  });

  it("recusa arena ou quadra ausente", () => {
    assert.throws(
      () => validateManualBookingInput({...validBase, courtId: " "}, todayKey),
      /Dados da reserva inválidos/,
    );
  });
});
