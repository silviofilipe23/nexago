import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  cashTwinWarnings,
  manualRevenueRows,
  parseRecordRevenueInput,
  parseVoidRevenueInput,
  planRecordRevenue,
  planVoidRevenue,
  saoPauloToday,
} from "./company-revenues";

const TODAY = "2026-11-18";
const INPUT = {source: "planosArena", arenaId: "arena-1", amountCents: 24900, receivedOn: "2026-11-12", note: " PIX direto "};

describe("company-revenues: entrada do registro", () => {
  it("aceita mensalidade de arena e limpa a observação", () => {
    assert.deepEqual(parseRecordRevenueInput(INPUT, TODAY), {
      source: "planosArena", arenaId: "arena-1", amountCents: 24900, receivedOn: "2026-11-12", note: "PIX direto",
    });
  });

  it("sem observação grava vazio", () => {
    assert.equal(parseRecordRevenueInput({...INPUT, note: undefined}, TODAY).note, "");
  });

  it("recusa fonte que não aceita lançamento à mão", () => {
    assert.throws(() => parseRecordRevenueInput({...INPUT, source: "torneios"}, TODAY), /tipo de receita/i);
  });

  it("recusa arena sem id ou com id inválido", () => {
    assert.throws(() => parseRecordRevenueInput({...INPUT, arenaId: ""}, TODAY), /arena/i);
    assert.throws(() => parseRecordRevenueInput({...INPUT, arenaId: "a/b"}, TODAY), /arena/i);
  });

  it("recusa valor zerado, negativo, quebrado ou acima do teto", () => {
    for (const amountCents of [0, -100, 10.5, Number.NaN, "2490", 2_000_001]) {
      assert.throws(() => parseRecordRevenueInput({...INPUT, amountCents}, TODAY), /valor/i, String(amountCents));
    }
  });

  it("recusa data inválida, futura ou antiga demais", () => {
    for (const receivedOn of ["12/11/2026", "2026-02-30", "2026-11-19", "2024-12-31", undefined]) {
      assert.throws(() => parseRecordRevenueInput({...INPUT, receivedOn}, TODAY), /data/i, String(receivedOn));
    }
  });

  it("aceita hoje como data", () => {
    assert.equal(parseRecordRevenueInput({...INPUT, receivedOn: TODAY}, TODAY).receivedOn, TODAY);
  });

  it("recusa observação longa", () => {
    assert.throws(() => parseRecordRevenueInput({...INPUT, note: "x".repeat(201)}, TODAY), /observação/i);
  });

  it("hoje é a data civil de São Paulo", () => {
    assert.equal(saoPauloToday(new Date("2026-11-19T02:30:00Z")), "2026-11-18");
    assert.equal(saoPauloToday(new Date("2026-11-19T03:30:00Z")), "2026-11-19");
  });
});

describe("company-revenues: plano do registro", () => {
  const input = parseRecordRevenueInput(INPUT, TODAY);

  it("grava com o nome da arena e quem registrou", () => {
    const plan = planRecordRevenue({input, arena: {name: "Vegeton Beach Club"}, arenaRevenues: [], uid: "admin-1"});
    assert.deepEqual(plan, {
      status: "create",
      record: {
        source: "planosArena", arenaId: "arena-1", arenaName: "Vegeton Beach Club", amountCents: 24900,
        receivedOn: "2026-11-12", note: "PIX direto", createdBy: "admin-1",
      },
    });
  });

  it("recusa arena que não existe", () => {
    const plan = planRecordRevenue({input, arena: null, arenaRevenues: [], uid: "admin-1"});
    assert.equal(plan.status, "error");
  });

  it("recusa a mesma receita duas vezes (arena, dia e valor)", () => {
    const same = {source: "planosArena", arenaId: "arena-1", amountCents: 24900, receivedOn: "2026-11-12"};
    const plan = planRecordRevenue({input, arena: {name: "V"}, arenaRevenues: [same], uid: "admin-1"});
    assert.equal(plan.status, "error");
    assert.match(plan.status === "error" ? plan.message : "", /já foi registrada/);
  });

  it("a anulada não conta como repetida; outro dia ou valor também não", () => {
    const arenaRevenues = [
      {source: "planosArena", amountCents: 24900, receivedOn: "2026-11-12", voidedAt: new Date()},
      {source: "planosArena", amountCents: 24900, receivedOn: "2026-10-12"},
      {source: "planosArena", amountCents: 14900, receivedOn: "2026-11-12"},
    ];
    assert.equal(planRecordRevenue({input, arena: {name: "V"}, arenaRevenues, uid: "admin-1"}).status, "create");
  });
});

describe("company-revenues: anular", () => {
  it("entrada: id obrigatório e motivo opcional", () => {
    assert.deepEqual(parseVoidRevenueInput({id: "r1", reason: " lançada em dobro "}), {id: "r1", reason: "lançada em dobro"});
    assert.throws(() => parseVoidRevenueInput({id: ""}), /receita/i);
    assert.throws(() => parseVoidRevenueInput({id: "r1", reason: "x".repeat(201)}), /motivo/i);
  });

  it("anula só a que existe e ainda vale", () => {
    assert.equal(planVoidRevenue(null).status, "error");
    assert.equal(planVoidRevenue({voidedAt: new Date()}).status, "unchanged");
    assert.equal(planVoidRevenue({amountCents: 100}).status, "void");
  });
});

describe("company-revenues: contada em dobro", () => {
  const row = {id: "r1", source: "planosArena" as const, arenaId: "a1", arenaName: "Vegeton", amountCents: 24900, receivedOn: "2026-11-12", note: ""};
  const customers = new Map([["cus_1", "a1"]]);

  it("avisa quando a cobrança foi marcada em dinheiro no mesmo mês, com o mesmo valor", () => {
    const w = cashTwinWarnings([row], [{customer: "cus_1", status: "RECEIVED_IN_CASH", value: 249, paymentDate: "2026-11-20"}], customers);
    assert.equal(w.length, 1);
    assert.match(w[0], /Vegeton: a mensalidade de 11\/2026 conta em dobro/);
  });

  it("não avisa em outro mês, outro valor, outra arena ou cobrança paga pelo Asaas", () => {
    const w = cashTwinWarnings([row], [
      {customer: "cus_1", status: "RECEIVED_IN_CASH", value: 249, paymentDate: "2026-10-20"},
      {customer: "cus_1", status: "RECEIVED_IN_CASH", value: 149, paymentDate: "2026-11-20"},
      {customer: "cus_2", status: "RECEIVED_IN_CASH", value: 249, paymentDate: "2026-11-20"},
      {customer: "cus_1", status: "RECEIVED", value: 249, paymentDate: "2026-11-20"},
    ], customers);
    assert.deepEqual(w, []);
  });
});

describe("company-revenues: linhas da tela", () => {
  const doc = (id: string, data: Record<string, unknown>) => ({id, data});

  it("lista as da janela, mais recente primeiro, sem as anuladas", () => {
    const rows = manualRevenueRows([
      doc("a", {source: "planosArena", arenaId: "x", arenaName: "Vegeton", amountCents: 24900, receivedOn: "2026-10-05", note: ""}),
      doc("b", {source: "planosArena", arenaId: "x", arenaName: "Vegeton", amountCents: 24900, receivedOn: "2026-11-05", note: "PIX"}),
      doc("c", {source: "planosArena", arenaId: "x", amountCents: 100, receivedOn: "2026-11-06", voidedAt: new Date()}),
      doc("d", {source: "planosArena", arenaId: "x", amountCents: 100, receivedOn: "2025-01-06"}),
    ], ["2026-10", "2026-11"]);
    assert.deepEqual(rows.map((r) => r.id), ["b", "a"]);
    assert.deepEqual(rows[0], {
      id: "b", source: "planosArena", arenaId: "x", arenaName: "Vegeton", amountCents: 24900, receivedOn: "2026-11-05", note: "PIX",
    });
  });
});
