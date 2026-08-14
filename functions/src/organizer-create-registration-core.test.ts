import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildOrganizerPaymentFields,
  buildOrganizerRegistrationDoc,
  effectiveUniformCategory,
  organizerRegistrationNotification,
  organizerRegistrationStamp,
  parseCreateTeamRegistrationInput,
  resolveJoiningUid,
} from "./organizer-create-registration-core";

const TS = "__serverTimestamp__";

function rejectsInvalidArgument(data: unknown): void {
  assert.throws(
    () => parseCreateTeamRegistrationInput(data),
    (err: Error & {code?: string}) => {
      assert.equal(err.code, "invalid-argument");
      return true;
    },
  );
}

describe("parseCreateTeamRegistrationInput", () => {
  it("aceita entrada completa e normaliza espaços", () => {
    const input = parseCreateTeamRegistrationInput({
      tournamentId: " t1 ",
      categoryId: " Masculino B ",
      athleteUids: [" uid-a ", "uid-b"],
      markAsPaid: true,
    });
    assert.deepEqual(input, {
      tournamentId: "t1",
      categoryId: "Masculino B",
      athleteUids: ["uid-a", "uid-b"],
      markAsPaid: true,
      uniforms: {},
    });
  });

  it("recolhe o uniforme de cada atleta e descarta o resto", () => {
    const input = parseCreateTeamRegistrationInput({
      tournamentId: "t1",
      categoryId: "c",
      athleteUids: ["uid-a", "uid-b"],
      uniforms: {
        "uid-a": {sizeTop: " M ", jerseyNumber: "7", jerseyName: " Ana "},
        "uid-b": {sizeTop: "G", sizeShorts: "GG"},
        // Uid que não é da dupla não entra na inscrição.
        "uid-intruso": {sizeTop: "P"},
      },
    });
    assert.deepEqual(input.uniforms, {
      "uid-a": {sizeTop: "M", jerseyNumber: 7, jerseyName: "Ana"},
      "uid-b": {sizeTop: "G", sizeShorts: "GG"},
    });
  });

  it("uniforme ausente ou vazio some do payload (a CF é quem exige)", () => {
    const base = {tournamentId: "t1", categoryId: "c", athleteUids: ["uid-a", "uid-b"]};
    assert.deepEqual(parseCreateTeamRegistrationInput(base).uniforms, {});
    assert.deepEqual(
      parseCreateTeamRegistrationInput({
        ...base,
        uniforms: {"uid-a": {sizeTop: "  "}, "uid-b": null},
      }).uniforms,
      {},
    );
  });

  it("markAsPaid só é verdadeiro no booleano true", () => {
    const base = {tournamentId: "t1", categoryId: "c", athleteUids: ["a", "b"]};
    assert.equal(parseCreateTeamRegistrationInput(base).markAsPaid, false);
    assert.equal(
      parseCreateTeamRegistrationInput({...base, markAsPaid: "true"}).markAsPaid,
      false,
    );
  });

  it("exige torneio e categoria", () => {
    rejectsInvalidArgument({categoryId: "c", athleteUids: ["a", "b"]});
    rejectsInvalidArgument({tournamentId: "t1", athleteUids: ["a", "b"]});
    rejectsInvalidArgument({tournamentId: "  ", categoryId: "c", athleteUids: ["a", "b"]});
  });

  it("exige exatamente dois atletas distintos", () => {
    const base = {tournamentId: "t1", categoryId: "c"};
    rejectsInvalidArgument({...base, athleteUids: ["a"]});
    rejectsInvalidArgument({...base, athleteUids: ["a", "b", "c"]});
    rejectsInvalidArgument({...base, athleteUids: ["a", "a"]});
    // Um uid vazio some na limpeza e cai no mesmo erro de "informe os dois".
    rejectsInvalidArgument({...base, athleteUids: ["a", "   "]});
    rejectsInvalidArgument({...base, athleteUids: "a,b"});
    rejectsInvalidArgument({...base});
  });
});

describe("effectiveUniformCategory", () => {
  const category = {categoryName: "Masculino B"};

  it("categoria sem exigência herda a do torneio, com as flags da RAIZ", () => {
    const effective = effectiveUniformCategory(
      {uniformRequired: true, uniformNumberOnShirt: true, uniformNameOnShirt: true},
      category,
    );
    assert.equal(effective.uniformType, "top_only");
    assert.equal(effective.uniformNumberOnShirt, true);
    assert.equal(effective.uniformNameOnShirt, true);
  });

  it("exigência própria da categoria manda — a raiz não sobrescreve", () => {
    const own = {...category, uniformType: "full" as const, uniformNumberOnShirt: false};
    const effective = effectiveUniformCategory(
      {uniformRequired: true, uniformNumberOnShirt: true},
      own,
    );
    assert.equal(effective.uniformType, "full");
    assert.equal(effective.uniformNumberOnShirt, false);
  });

  it("torneio sem uniforme deixa a categoria como está", () => {
    assert.equal(effectiveUniformCategory({}, category), category);
    assert.equal(effectiveUniformCategory({uniformRequired: false}, category), category);
  });
});

describe("resolveJoiningUid", () => {
  it("quem entra é o outro atleta da dupla", () => {
    assert.equal(resolveJoiningUid("uid-a", "uid-a", "uid-b"), "uid-b");
    assert.equal(resolveJoiningUid("uid-b", "uid-a", "uid-b"), "uid-a");
    assert.equal(resolveJoiningUid(" uid-b ", "uid-a", "uid-b"), "uid-a");
  });

  it("dono desconhecido nunca devolve o mesmo uid dos dois lados", () => {
    assert.equal(resolveJoiningUid("uid-x", "uid-a", "uid-b"), "uid-b");
    assert.equal(resolveJoiningUid("", "uid-a", "uid-b"), "uid-b");
  });
});

describe("buildOrganizerPaymentFields", () => {
  const base = {
    entryFee: 120,
    markAsPaid: false,
    alreadyPaid: false,
    organizerUid: "org-1",
    timestamp: TS,
  };

  it("marcando como pago grava o mesmo conjunto da confirmação manual", () => {
    const fields = buildOrganizerPaymentFields({...base, markAsPaid: true});
    assert.deepEqual(fields, {
      isPaid: true,
      waitlist: false,
      paidAmount: 120,
      paymentMethod: "organizer_direct",
      paidAt: TS,
      paymentVerifiedByOrganizer: true,
      paymentVerifiedAt: TS,
      paymentVerifiedByUid: "org-1",
    });
  });

  it("sem marcar pagamento não mexe em nada", () => {
    assert.equal(buildOrganizerPaymentFields(base), null);
  });

  it("categoria gratuita nasce paga, sem canal de pagamento", () => {
    assert.deepEqual(buildOrganizerPaymentFields({...base, entryFee: 0}), {
      isPaid: true,
      paidAmount: 0,
    });
    assert.deepEqual(
      buildOrganizerPaymentFields({...base, entryFee: Number.NaN}),
      {isPaid: true, paidAmount: 0},
    );
  });

  it("nunca regrava pagamento que já existe (fusão com reserva paga)", () => {
    assert.equal(
      buildOrganizerPaymentFields({...base, alreadyPaid: true, markAsPaid: true}),
      null,
    );
    // Nem para desligar: o toggle do organizador só liga.
    assert.equal(
      buildOrganizerPaymentFields({...base, alreadyPaid: true, markAsPaid: false}),
      null,
    );
  });
});

describe("buildOrganizerRegistrationDoc", () => {
  const params = {
    teamId: "team-1",
    tournamentId: "t1",
    categoryId: "Masculino B",
    athleteUids: ["uid-a", "uid-b"] as const,
    organizerUid: "org-1",
    waitlist: false,
    timestamp: TS,
  };

  it("nasce pendente, com procedência e sem aceite de LGPD", () => {
    const doc = buildOrganizerRegistrationDoc(params);
    assert.deepEqual(doc, {
      teamId: "team-1",
      tournamentId: "t1",
      categoryId: "Masculino B",
      participantUids: ["uid-a", "uid-b"],
      isPaid: false,
      paidAmount: 0,
      createdAt: TS,
      createdVia: "organizer",
      organizerRegisteredByUid: "org-1",
      organizerRegisteredAt: TS,
    });
    // O organizador não consente pelo atleta: a inscrição nasce sem aceite.
    assert.equal("lgpdAcceptedUids" in doc, false);
    assert.equal("lgpdTermVersion" in doc, false);
  });

  it("categoria lotada com fila nasce em espera", () => {
    const doc = buildOrganizerRegistrationDoc({...params, waitlist: true});
    assert.equal(doc.waitlist, true);
  });

  it("fora da fila não grava o campo (não vira 'espera: false' na lista)", () => {
    assert.equal("waitlist" in buildOrganizerRegistrationDoc(params), false);
  });
});

describe("organizerRegistrationStamp", () => {
  it("não sobrescreve createdVia — numa fusão quem criou foi o atleta", () => {
    const stamp = organizerRegistrationStamp("org-1", TS);
    assert.deepEqual(stamp, {
      organizerRegisteredByUid: "org-1",
      organizerRegisteredAt: TS,
    });
    assert.equal("createdVia" in stamp, false);
  });
});

describe("organizerRegistrationNotification", () => {
  it("diz se a vaga está confirmada ou se falta pagar", () => {
    const paid = organizerRegistrationNotification({
      tournamentName: "Copa VH",
      categoryName: "Masculino B",
      isPaid: true,
    });
    assert.match(paid.body, /Copa VH · Masculino B/);
    assert.match(paid.body, /confirmada/);

    const pending = organizerRegistrationNotification({
      tournamentName: "Copa VH",
      categoryName: "Masculino B",
      isPaid: false,
    });
    assert.match(pending.body, /pendente/);
  });

  it("sem nome de torneio o corpo ainda faz sentido", () => {
    const {body} = organizerRegistrationNotification({
      tournamentName: "",
      categoryName: "Masculino B",
      isPaid: true,
    });
    assert.match(body, /Masculino B/);
    assert.doesNotMatch(body, /·/);
  });
});
