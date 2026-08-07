import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  computeTeamMemberShareReais,
  evaluateTeamJoin,
  extractTeamMemberUids,
  isTeamCategory,
  isTeamRosterComplete,
  normalizeTeamName,
  parseGenderComposition,
  registrationTeamSize,
  resolveCategoryTeamSize,
  teamGenderLabelForBuckets,
  teamNameKey,
  teamNameValidationError,
} from "./tournament-team-category";

describe("resolveCategoryTeamSize", () => {
  it("categoria legada sem nada é dupla", () => {
    assert.equal(resolveCategoryTeamSize(null), 2);
    assert.equal(resolveCategoryTeamSize({}), 2);
    assert.equal(resolveCategoryTeamSize({disputeType: "dupla"}), 2);
  });

  it("teamSize explícito vence", () => {
    assert.equal(resolveCategoryTeamSize({teamSize: 4}), 4);
    assert.equal(resolveCategoryTeamSize({teamSize: "3"}), 3);
    assert.equal(
      resolveCategoryTeamSize({teamSize: 5, disputeType: "trio"}),
      5,
    );
  });

  it("deriva do disputeType quando não há teamSize", () => {
    assert.equal(resolveCategoryTeamSize({disputeType: "trio"}), 3);
    assert.equal(resolveCategoryTeamSize({disputeType: "quarteto"}), 4);
    assert.equal(resolveCategoryTeamSize({disputeType: "quinteto"}), 5);
  });

  it("teamSize inválido cai no disputeType ou na dupla", () => {
    assert.equal(resolveCategoryTeamSize({teamSize: 9}), 2);
    assert.equal(resolveCategoryTeamSize({teamSize: 0, disputeType: "trio"}), 3);
    assert.equal(resolveCategoryTeamSize({teamSize: 2.5}), 2);
    // individual não vira equipe nem dupla quebrada.
    assert.equal(resolveCategoryTeamSize({disputeType: "individual"}), 2);
  });

  it("isTeamCategory só para trio+", () => {
    assert.equal(isTeamCategory({teamSize: 3}), true);
    assert.equal(isTeamCategory({disputeType: "quinteto"}), true);
    assert.equal(isTeamCategory({disputeType: "dupla"}), false);
    assert.equal(isTeamCategory(null), false);
  });
});

describe("registrationTeamSize", () => {
  it("teamSize gravado na inscrição vence a categoria", () => {
    assert.equal(registrationTeamSize({teamSize: 4}, {teamSize: 3}), 4);
  });

  it("sem teamSize na inscrição cai na categoria", () => {
    assert.equal(registrationTeamSize({}, {teamSize: 5}), 5);
    assert.equal(registrationTeamSize(null, {disputeType: "trio"}), 3);
    assert.equal(registrationTeamSize(null, null), 2);
  });
});

describe("parseGenderComposition", () => {
  it("composição válida com soma igual ao teamSize", () => {
    assert.deepEqual(
      parseGenderComposition(
        {genderComposition: {men: 2, women: 1}},
        3,
      ),
      {men: 2, women: 1},
    );
    assert.deepEqual(
      parseGenderComposition(
        {genderComposition: {men: 0, women: 4}},
        4,
      ),
      {men: 0, women: 4},
    );
  });

  it("genderMode free ignora a composição", () => {
    assert.equal(
      parseGenderComposition(
        {genderMode: "free", genderComposition: {men: 2, women: 1}},
        3,
      ),
      null,
    );
  });

  it("composição órfã (soma diferente do tamanho) degrada para livre", () => {
    assert.equal(
      parseGenderComposition({genderComposition: {men: 2, women: 1}}, 4),
      null,
    );
  });

  it("ausente/inválida é livre", () => {
    assert.equal(parseGenderComposition({}, 3), null);
    assert.equal(parseGenderComposition(null, 3), null);
    assert.equal(
      parseGenderComposition({genderComposition: {men: -1, women: 4}}, 3),
      null,
    );
  });
});

describe("nome da equipe", () => {
  it("normaliza espaços", () => {
    assert.equal(normalizeTeamName("  Os   Feras  "), "Os Feras");
  });

  it("valida tamanho mínimo e máximo", () => {
    assert.equal(teamNameValidationError("Os Feras"), null);
    assert.match(teamNameValidationError("ab") ?? "", /pelo menos 3/);
    assert.match(
      teamNameValidationError("a".repeat(31)) ?? "",
      /no máximo 30/,
    );
    assert.match(teamNameValidationError("   ") ?? "", /pelo menos 3/);
    assert.match(teamNameValidationError(undefined) ?? "", /pelo menos 3/);
  });

  it("chave de unicidade ignora caixa, acentos e espaços extras", () => {
    assert.equal(teamNameKey("Os  Feras"), teamNameKey("os feras"));
    assert.equal(teamNameKey("Trëma Café"), teamNameKey("trema cafe"));
    assert.notEqual(teamNameKey("Os Feras"), teamNameKey("As Feras"));
  });
});

describe("extractTeamMemberUids", () => {
  it("memberUids vence e deduplica", () => {
    assert.deepEqual(
      extractTeamMemberUids({
        memberUids: ["a", "b", "b", " ", "c"],
        player1Id: "x",
      }),
      ["a", "b", "c"],
    );
  });

  it("legado cai em player1/player2", () => {
    assert.deepEqual(
      extractTeamMemberUids({player1Id: "a", player2Id: "b"}),
      ["a", "b"],
    );
    assert.deepEqual(extractTeamMemberUids({player1Id: "a"}), ["a"]);
    assert.deepEqual(extractTeamMemberUids(null), []);
  });
});

describe("evaluateTeamJoin", () => {
  it("elenco cheio bloqueia mesmo sem composição", () => {
    assert.deepEqual(
      evaluateTeamJoin({
        teamSize: 3,
        composition: null,
        currentBuckets: ["M", "M", "F"],
        joiningBucket: "M",
      }),
      {ok: false, reason: "roster_full"},
    );
  });

  it("sem composição aceita qualquer gênero (inclusive desconhecido)", () => {
    assert.deepEqual(
      evaluateTeamJoin({
        teamSize: 4,
        composition: null,
        currentBuckets: ["M"],
        joiningBucket: null,
      }),
      {ok: true},
    );
  });

  it("composição exige gênero conhecido de quem entra", () => {
    assert.deepEqual(
      evaluateTeamJoin({
        teamSize: 3,
        composition: {men: 2, women: 1},
        currentBuckets: [],
        joiningBucket: null,
      }),
      {ok: false, reason: "missing_gender"},
    );
  });

  it("bloqueia quando a cota do gênero está tomada", () => {
    assert.deepEqual(
      evaluateTeamJoin({
        teamSize: 3,
        composition: {men: 2, women: 1},
        currentBuckets: ["M", "M"],
        joiningBucket: "M",
      }),
      {ok: false, reason: "men_full"},
    );
    assert.deepEqual(
      evaluateTeamJoin({
        teamSize: 3,
        composition: {men: 2, women: 1},
        currentBuckets: ["F"],
        joiningBucket: "F",
      }),
      {ok: false, reason: "women_full"},
    );
  });

  it("aceita quando ainda há cota", () => {
    assert.deepEqual(
      evaluateTeamJoin({
        teamSize: 4,
        composition: {men: 2, women: 2},
        currentBuckets: ["M", "F"],
        joiningBucket: "F",
      }),
      {ok: true},
    );
  });

  it("membro sem gênero conhecido não consome cota", () => {
    assert.deepEqual(
      evaluateTeamJoin({
        teamSize: 3,
        composition: {men: 2, women: 1},
        currentBuckets: [null, "M"],
        joiningBucket: "M",
      }),
      {ok: true},
    );
  });
});

describe("teamGenderLabelForBuckets", () => {
  it("rotula equipes completas", () => {
    assert.equal(teamGenderLabelForBuckets(["M", "M", "M"]), "Masculino");
    assert.equal(teamGenderLabelForBuckets(["F", "F"]), "Feminino");
    assert.equal(teamGenderLabelForBuckets(["M", "F", "M", "F"]), "Misto");
  });

  it("null quando falta gênero de alguém", () => {
    assert.equal(teamGenderLabelForBuckets(["M", null, "F"]), null);
    assert.equal(teamGenderLabelForBuckets([]), null);
  });
});

describe("isTeamRosterComplete", () => {
  it("completa quando atinge o tamanho", () => {
    assert.equal(isTeamRosterComplete(2, 3), false);
    assert.equal(isTeamRosterComplete(3, 3), true);
    assert.equal(isTeamRosterComplete(4, 3), true);
  });
});

describe("computeTeamMemberShareReais", () => {
  it("divide o restante entre os pagadores que faltam", () => {
    // Trio de R$100: 33,33 + 33,34 + 33,33 = 100,00.
    const p1 = computeTeamMemberShareReais({
      entryFee: 100,
      paidAmount: 0,
      confirmedCount: 0,
      teamSize: 3,
    });
    assert.equal(p1, 33.33);
    const p2 = computeTeamMemberShareReais({
      entryFee: 100,
      paidAmount: p1,
      confirmedCount: 1,
      teamSize: 3,
    });
    assert.equal(p2, 33.34);
    const p3 = computeTeamMemberShareReais({
      entryFee: 100,
      paidAmount: p1 + p2,
      confirmedCount: 2,
      teamSize: 3,
    });
    assert.equal(p3, 33.33);
    assert.equal(p1 + p2 + p3, 100);
  });

  it("divisão exata não deixa resto", () => {
    assert.equal(
      computeTeamMemberShareReais({
        entryFee: 180,
        paidAmount: 0,
        confirmedCount: 0,
        teamSize: 4,
      }),
      45,
    );
  });

  it("absorve pagamento full anterior (nada a cobrar)", () => {
    assert.equal(
      computeTeamMemberShareReais({
        entryFee: 150,
        paidAmount: 150,
        confirmedCount: 1,
        teamSize: 5,
      }),
      0,
    );
  });

  it("taxa zero ou inválida cobra zero", () => {
    assert.equal(
      computeTeamMemberShareReais({
        entryFee: 0,
        paidAmount: 0,
        confirmedCount: 0,
        teamSize: 3,
      }),
      0,
    );
    assert.equal(
      computeTeamMemberShareReais({
        entryFee: Number.NaN,
        paidAmount: 0,
        confirmedCount: 0,
        teamSize: 3,
      }),
      0,
    );
  });

  it("último pagador paga exatamente o que falta", () => {
    assert.equal(
      computeTeamMemberShareReais({
        entryFee: 100,
        paidAmount: 66.67,
        confirmedCount: 2,
        teamSize: 3,
      }),
      33.33,
    );
  });
});
