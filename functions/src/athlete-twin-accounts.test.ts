import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {
  birthDayKey,
  findTwinConflict,
  findTwinRegistrationPairs,
  isSameAthlete,
  maskEmail,
  phoneIdentityKey,
  twinConflictMessage,
  type AthleteFingerprint,
} from "./athlete-twin-accounts";

describe("phoneIdentityKey", () => {
  it("absorve máscara, +55 e o celular antigo sem o 9", () => {
    assert.equal(phoneIdentityKey("(62) 99876-5432"), "62998765432");
    assert.equal(phoneIdentityKey("+55 62 99876-5432"), "62998765432");
    assert.equal(phoneIdentityKey("5562998765432"), "62998765432");
    assert.equal(phoneIdentityKey("(62) 9876-5432"), "62998765432");
    assert.equal(phoneIdentityKey("556298765432"), "62998765432");
  });

  it("mantém fixo de 10 dígitos como está", () => {
    assert.equal(phoneIdentityKey("(62) 3212-3456"), "6232123456");
  });

  it("devolve vazio para o que não identifica ninguém", () => {
    assert.equal(phoneIdentityKey(""), "");
    assert.equal(phoneIdentityKey(null), "");
    assert.equal(phoneIdentityKey("12345"), "");
    assert.equal(phoneIdentityKey("(11) 99999-9999"), "");
    assert.equal(phoneIdentityKey("(11) 00000-0000"), "");
    assert.equal(phoneIdentityKey("01198765432"), "");
  });
});

describe("birthDayKey", () => {
  it("lê ISO, dd/mm/aaaa e Timestamp", () => {
    assert.equal(birthDayKey("1990-05-17"), "1990-05-17");
    assert.equal(birthDayKey("1990-05-17T00:00:00.000Z"), "1990-05-17");
    assert.equal(birthDayKey("17/05/1990"), "1990-05-17");
    // Meia-noite em Brasília (03:00Z) continua sendo o dia 17.
    const ts = Timestamp.fromDate(new Date("1990-05-17T03:00:00Z"));
    assert.equal(birthDayKey(ts), "1990-05-17");
  });

  it("devolve vazio quando não há data legível", () => {
    assert.equal(birthDayKey(undefined), "");
    assert.equal(birthDayKey("maio de 1990"), "");
  });
});

describe("isSameAthlete", () => {
  const p = (phoneKey: string, birthDay = ""): AthleteFingerprint => ({phoneKey, birthDay});

  it("mesmo WhatsApp e mesmo nascimento é a mesma pessoa", () => {
    assert.equal(isSameAthlete(p("62998765432", "1990-05-17"), p("62998765432", "1990-05-17")), true);
  });

  it("nascimento ausente em um dos lados não livra a conta antiga", () => {
    assert.equal(isSameAthlete(p("62998765432", "1990-05-17"), p("62998765432")), true);
  });

  it("família que divide o número (nascimentos diferentes) não é gêmea", () => {
    assert.equal(isSameAthlete(p("62998765432", "1975-01-02"), p("62998765432", "2008-03-04")), false);
  });

  it("sem telefone não há como ligar as contas", () => {
    assert.equal(isSameAthlete(p(""), p("")), false);
    assert.equal(isSameAthlete(p("62998765432"), p("62911112222")), false);
  });
});

describe("findTwinConflict", () => {
  const same = {phoneKey: "62998765432", birthDay: "1990-05-17"};
  const other = {phoneKey: "62911112222", birthDay: "1988-01-01"};

  it("barra quem entra quando a outra conta já está na categoria", () => {
    const conflict = findTwinConflict({
      teamUids: ["novo"],
      registeredUids: new Set(["antigo", "parceiro"]),
      fingerprints: new Map([["novo", same], ["antigo", same], ["parceiro", other]]),
    });
    assert.deepEqual(conflict, {kind: "registered", uid: "novo", twinUid: "antigo"});
  });

  it("acusa a dupla formada pelas duas contas da mesma pessoa", () => {
    const conflict = findTwinConflict({
      teamUids: ["dono", "convidado"],
      registeredUids: new Set(["dono"]),
      fingerprints: new Map([["dono", same], ["convidado", same]]),
    });
    assert.deepEqual(conflict, {kind: "pair", uid: "convidado", twinUid: "dono"});
  });

  it("não barra quem já está inscrito (a duplicação antiga não tranca ninguém)", () => {
    const conflict = findTwinConflict({
      teamUids: ["antigo", "parceiro"],
      registeredUids: new Set(["antigo", "novo", "parceiro"]),
      fingerprints: new Map([["antigo", same], ["novo", same], ["parceiro", other]]),
    });
    assert.equal(conflict, null);
  });

  it("ignora quem está saindo na substituição", () => {
    const conflict = findTwinConflict({
      teamUids: ["parceiro", "certa"],
      registeredUids: new Set(["parceiro", "errada"]),
      fingerprints: new Map([["parceiro", other], ["errada", same], ["certa", same]]),
      ignoreUids: new Set(["errada"]),
    });
    assert.equal(conflict, null);
  });

  it("deixa passar quem não tem telefone legível", () => {
    const conflict = findTwinConflict({
      teamUids: ["novo"],
      registeredUids: new Set(["antigo"]),
      fingerprints: new Map([
        ["novo", {phoneKey: "", birthDay: "1990-05-17"}],
        ["antigo", {phoneKey: "", birthDay: "1990-05-17"}],
      ]),
    });
    assert.equal(conflict, null);
  });
});

describe("findTwinRegistrationPairs", () => {
  const joana = {phoneKey: "62998765432", birthDay: "1990-05-17"};
  const joanaSemData = {phoneKey: "62998765432", birthDay: ""};
  const outra = {phoneKey: "62911112222", birthDay: "1988-01-01"};

  it("acha a mesma pessoa em duas inscrições da mesma categoria", () => {
    const pairs = findTwinRegistrationPairs({
      registrations: [
        {id: "r1", categoryId: "fem-b", uids: ["google", "parceira1"]},
        {id: "r2", categoryId: "fem-b", uids: ["email", "parceira2"]},
      ],
      fingerprints: new Map([
        ["google", joana], ["email", joanaSemData], ["parceira1", outra],
        ["parceira2", {phoneKey: "62933334444", birthDay: ""}],
      ]),
    });
    assert.deepEqual(pairs, [
      {categoryId: "fem-b", registrationIds: ["r1", "r2"], uids: ["google", "email"]},
    ]);
  });

  it("acusa o elenco formado pelas duas contas da mesma pessoa", () => {
    const pairs = findTwinRegistrationPairs({
      registrations: [{id: "r1", categoryId: "fem-b", uids: ["google", "email"]}],
      fingerprints: new Map([["google", joana], ["email", joana]]),
    });
    assert.deepEqual(pairs, [
      {categoryId: "fem-b", registrationIds: ["r1", "r1"], uids: ["google", "email"]},
    ]);
  });

  it("categorias diferentes do mesmo torneio seguem liberadas", () => {
    const pairs = findTwinRegistrationPairs({
      registrations: [
        {id: "r1", categoryId: "fem-b", uids: ["google"]},
        {id: "r2", categoryId: "mista", uids: ["email"]},
      ],
      fingerprints: new Map([["google", joana], ["email", joana]]),
    });
    assert.deepEqual(pairs, []);
  });

  it("não acusa a família que divide o número nem quem não tem telefone", () => {
    const pairs = findTwinRegistrationPairs({
      registrations: [
        {id: "r1", categoryId: "mista", uids: ["pai", "semFone1"]},
        {id: "r2", categoryId: "mista", uids: ["filho", "semFone2"]},
      ],
      fingerprints: new Map([
        ["pai", {phoneKey: "62998765432", birthDay: "1975-01-02"}],
        ["filho", {phoneKey: "62998765432", birthDay: "2008-03-04"}],
        ["semFone1", {phoneKey: "", birthDay: "1990-05-17"}],
        ["semFone2", {phoneKey: "", birthDay: "1990-05-17"}],
      ]),
    });
    assert.deepEqual(pairs, []);
  });

  it("a mesma conta em duas inscrições não é conta gêmea", () => {
    const pairs = findTwinRegistrationPairs({
      registrations: [
        {id: "r1", categoryId: "fem-b", uids: ["google"]},
        {id: "r2", categoryId: "fem-b", uids: ["google", "google"]},
      ],
      fingerprints: new Map([["google", joana]]),
    });
    assert.deepEqual(pairs, []);
  });

  it("três contas com o mesmo WhatsApp viram três pares", () => {
    const pairs = findTwinRegistrationPairs({
      registrations: [
        {id: "r1", categoryId: "fem-b", uids: ["a"]},
        {id: "r2", categoryId: "fem-b", uids: ["b"]},
        {id: "r3", categoryId: "fem-b", uids: ["c"]},
      ],
      fingerprints: new Map([["a", joana], ["b", joana], ["c", joanaSemData]]),
    });
    assert.deepEqual(
      pairs.map((p) => p.registrationIds.join("+")),
      ["r1+r2", "r1+r3", "r2+r3"],
    );
  });
});

describe("maskEmail", () => {
  it("mostra o começo e o domínio", () => {
    assert.equal(maskEmail("joana.silva@gmail.com"), "jo•••@gmail.com");
    assert.equal(maskEmail("ab@x.com"), "a•••@x.com");
  });

  it("devolve vazio para e-mail ilegível", () => {
    assert.equal(maskEmail(""), "");
    assert.equal(maskEmail("semarroba"), "");
    assert.equal(maskEmail(undefined), "");
  });
});

describe("twinConflictMessage", () => {
  const users = new Map<string, Record<string, unknown>>([
    ["novo", {fullName: "Joana Silva"}],
    ["antigo", {email: "joana.silva@gmail.com"}],
  ]);

  it("fala com o próprio atleta e mostra qual é a outra conta", () => {
    const msg = twinConflictMessage({
      conflict: {kind: "registered", uid: "novo", twinUid: "antigo"},
      callerUid: "novo",
      users,
    });
    assert.match(msg, /Outra conta com o seu WhatsApp \(jo•••@gmail\.com\)/);
    assert.match(msg, /organizador/);
  });

  it("nomeia o parceiro sem expor o e-mail da outra conta", () => {
    const msg = twinConflictMessage({
      conflict: {kind: "registered", uid: "novo", twinUid: "antigo"},
      callerUid: "quemConvida",
      users,
    });
    assert.match(msg, /^Joana Silva já está nesta categoria/);
    assert.doesNotMatch(msg, /gmail/);
  });

  it("explica a dupla da mesma pessoa", () => {
    const msg = twinConflictMessage({
      conflict: {kind: "pair", uid: "convidado", twinUid: "dono"},
      callerUid: "dono",
      users,
    });
    assert.match(msg, /mesma pessoa/);
  });
});
