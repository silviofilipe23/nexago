import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORTED_BRACKET_FORMATS,
  buildBracketMatchDrafts,
  minimumTeamsForFormat,
  resolveBracketGroups,
} from "./organizer-category-ops";

/**
 * "Todos contra todos" já existia como rótulo no wizard e já era um
 * `TournamentBracketSystem` válido nos dois clientes — mas a geração de chave
 * recusava `round_robin` com "formato ainda não é suportado". O builder sozinho
 * não prova nada disso: o furo era a FIAÇÃO (o formato fora do conjunto de
 * suportados, o grupo único nunca montado, o dispatch sem o ramo).
 *
 * Este arquivo percorre as três decisões CHAMANDO a produção — as mesmas
 * funções que `runGenerateCategoryBracket` chama, não uma sequência reescrita.
 */

const SIX = ["t1", "t2", "t3", "t4", "t5", "t6"];

describe("fiação do round robin na geração de chave", () => {
  it("aceita round_robin como formato de chave", () => {
    assert.equal(SUPPORTED_BRACKET_FORMATS.has("round_robin"), true);
  });

  it("põe o elenco inteiro num grupo só", () => {
    const groups = resolveBracketGroups("round_robin", SIX, []);

    assert.deepEqual(groups, [{id: "A", teamIds: SIX}]);
  });

  it("ignora prévia de grupos vinda do cliente — a tabela é uma só", () => {
    const groups = resolveBracketGroups("round_robin", SIX, [
      {id: "A", teamIds: ["t1", "t2", "t3"]},
      {id: "B", teamIds: ["t4", "t5", "t6"]},
    ]);

    assert.deepEqual(groups, [{id: "A", teamIds: SIX}]);
  });

  it("monta tabela, final e disputa de 3º pelo formato", () => {
    const drafts = buildBracketMatchDrafts({
      format: "round_robin",
      teamIds: SIX,
      groups: resolveBracketGroups("round_robin", SIX, []),
      qualifiersPerGroup: 2,
    });

    assert.equal(drafts.filter((m) => m.isGroupMatch).length, 15);
    assert.equal(drafts.filter((m) => m.matchType === "Final").length, 1);
    assert.equal(drafts.filter((m) => m.matchType === "Third Place").length, 1);
  });

  it("exige 3 duplas: com 2 não há tabela, só uma final disfarçada", () => {
    assert.equal(minimumTeamsForFormat("round_robin"), 3);
  });

  it("não mexe no piso dos outros formatos", () => {
    assert.equal(minimumTeamsForFormat("groups_knockout"), 2);
    assert.equal(minimumTeamsForFormat("single_elimination"), 2);
  });

  it("continua montando grupos + mata-mata como antes", () => {
    const preview = [
      {id: "A", teamIds: ["t1", "t2", "t3"]},
      {id: "B", teamIds: ["t4", "t5", "t6"]},
    ];
    const groups = resolveBracketGroups("groups_knockout", SIX, preview);
    assert.deepEqual(groups, preview);

    const drafts = buildBracketMatchDrafts({
      format: "groups_knockout",
      teamIds: SIX,
      groups,
      qualifiersPerGroup: 2,
    });
    // 3 jogos por grupo (C(3,2)) + semis e final do mata-mata de 4.
    assert.equal(drafts.filter((m) => m.isGroupMatch).length, 6);
    assert.equal(drafts.filter((m) => m.matchType === "Final").length, 1);
  });
});
