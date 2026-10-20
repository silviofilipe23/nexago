import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {parseNoticeDraft} from "./professor-notices";

const NOW = new Date("2026-10-20T15:00:00Z");
const base = {kind: "aviso", title: "Feriado", body: "Sem aulas dia 02/11", audience: {classIds: ["c1"], wallet: false}};

describe("parseNoticeDraft", () => {
  it("aceita aviso simples e limpa turmas repetidas/inválidas", () => {
    const d = parseNoticeDraft({...base, audience: {classIds: ["c1", "c1", "a/b", ""], wallet: true}}, NOW);
    assert.deepEqual(d.audience, {classIds: ["c1"], wallet: true});
    assert.deepEqual(d.pollOptions, []);
    assert.equal(d.scheduledAt, null);
  });
  it("enquete precisa de 2+ opções distintas", () => {
    assert.throws(() => parseNoticeDraft({...base, kind: "enquete", pollOptions: ["Vou", "Vou"]}, NOW), /2 opções/);
    assert.deepEqual(parseNoticeDraft({...base, kind: "enquete", pollOptions: ["Vou", "Não vou"]}, NOW).pollOptions, ["Vou", "Não vou"]);
  });
  it("recusa tipo, título, agendamento no passado ou longe e lembrete antes do envio", () => {
    assert.throws(() => parseNoticeDraft({...base, kind: "spam"}, NOW), /Tipo/);
    assert.throws(() => parseNoticeDraft({...base, title: ""}, NOW), /título/);
    assert.throws(() => parseNoticeDraft({...base, scheduledAt: "2026-10-19T10:00:00Z"}, NOW), /passado/);
    assert.throws(() => parseNoticeDraft({...base, scheduledAt: "2027-02-01T10:00:00Z"}, NOW), /60 dias/);
    assert.throws(() => parseNoticeDraft({...base, scheduledAt: "2026-10-21T10:00:00Z", remindAt: "2026-10-21T09:00:00Z"}, NOW), /lembrete/);
  });
});
