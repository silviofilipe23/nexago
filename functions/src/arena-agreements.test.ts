import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  DEFAULT_TEMPLATES,
  namesLabel,
  payoutLabel,
  planRuleLabel,
  resolveTemplate,
  slotsLabel,
  unknownAgreementVariables,
} from "./arena-agreements-model";
import {
  cancelAgreementCore,
  enrollMeCore,
  listArenaAgreementsCore,
  myAgreementCore,
  myAgreementsCore,
  previewSelfEnrollmentCore,
  saveTemplateCore,
  sendProfessorAgreementCore,
  signMyAgreementCore,
  signupOptionsCore,
} from "./arena-agreements";
import {setEnrollmentStatusCore, syncClassSignupFlag, validatePlanAppFields} from "./arena-class-billing";
import {DEFAULT_CLASS_RULES} from "./arena-class-constants";

type Data = Record<string, unknown>;

const NOW = new Date("2026-10-19T15:00:00Z"); // segunda, 12h em SP
const TODAY = "2026-10-19";
const EV = {ip: "189.40.12.21", userAgent: "NexaGO/1.0 iPhone", platform: "ios", appVersion: "1.0.24+122"};
const ME = {uid: "u1", email: "marina@example.com"};

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}
const doc = (f: FakeFirestore, path: string) => f.store.get(path) as Data;

/**
 * Arena Pro com 2 professores (t1 Thiago, t2 Larissa) e um terceiro fora do plano (t3).
 * Plano m2 (2x, no app, professores t1 e t2), plano m1 (1x, no app, qualquer professor) e
 * plano x1 (fora do app).
 */
function seed(fake: FakeFirestore, rules: Data = {}) {
  fake.seedDoc("arenas/arena1", {name: "Arena Verano", managerUserId: "uOwner", planTier: "pro", planStatus: "active", city: "Goiânia", state: "GO"});
  fake.seedDoc("arenas/arena1/registration/data", {cpfCnpj: "12345678000190", legalName: "Arena Verano Ltda"});
  fake.seedDoc("users/u1", {fullName: "Marina Lopes", phoneNumber: "+5562999990000"});
  fake.seedDoc("users/uT", {fullName: "Thiago Mendes"});
  fake.seedDoc("arenas/arena1/classSettings/rules", {...DEFAULT_CLASS_RULES, ...rules});
  fake.seedDoc("arenas/arena1/classTeachers/t1", {arenaId: "arena1", userId: "uT", name: "Thiago Mendes", status: "active", specialty: "vôlei de praia", payout: {model: "revenue_share", percent: 50}});
  fake.seedDoc("arenas/arena1/classTeachers/t2", {arenaId: "arena1", userId: "uL", name: "Larissa Souza", status: "active"});
  fake.seedDoc("arenas/arena1/classTeachers/t3", {arenaId: "arena1", userId: "uR", name: "Rafael Alves", status: "active"});
  fake.seedDoc("arenas/arena1/classPlans/m2", {name: "Vôlei 2x", kind: "monthly", priceReais: 260, classesPerWeek: 2, status: "active", availableInApp: true, teacherIds: ["t1", "t2"]});
  fake.seedDoc("arenas/arena1/classPlans/m1", {name: "Vôlei 1x", kind: "monthly", priceReais: 160, classesPerWeek: 1, status: "active", availableInApp: true});
  fake.seedDoc("arenas/arena1/classPlans/x1", {name: "Interno", kind: "monthly", priceReais: 100, classesPerWeek: 1, status: "active"});
  const cls = (id: string, teacherId: string, teacherName: string, weekdays: number[], startTime: string, capacity = 2) =>
    fake.seedDoc(`arenaClasses/${id}`, {
      arenaId: "arena1", name: `Turma ${id}`, type: "turma", sport: "volei", level: "iniciante",
      teacherId, teacherUserId: null, teacherName, weekdays, startTime, endTime: "20:00",
      courtId: "q1", courtName: "Quadra 1", capacity, studentCount: 0, startDate: "2026-10-01", endDate: null, status: "active",
    });
  cls("cT", "t1", "Thiago Mendes", [2, 4], "18:00");
  cls("cL", "t2", "Larissa Souza", [2, 4], "07:00", 1);
  cls("cR", "t3", "Rafael Alves", [6], "10:00");
  // Larissa: a terça já lotou.
  fake.seedDoc("arenaClasses/cL/classStudents/u9", {arenaId: "arena1", classId: "cL", status: "active", weekdays: [2]});
}

const thiago2x = {arenaId: "arena1", planId: "m2", slots: [{classId: "cT", weekday: 2}, {classId: "cT", weekday: 4}]};

async function signed(db: Firestore, input: Data = thiago2x) {
  const preview = await previewSelfEnrollmentCore(db, ME, input, TODAY);
  return enrollMeCore(db, ME, {...input, agreed: true, sha256: preview.agreement.sha256, readSeconds: 95}, EV, NOW);
}

describe("contratos de aulas — modelo", () => {
  it("rótulos do contrato", () => {
    assert.equal(slotsLabel([{weekday: 4, startTime: "18:00"}, {weekday: 2, startTime: "18:00"}]), "terças às 18:00 e quintas às 18:00");
    assert.equal(namesLabel(["Thiago", "Larissa", "Thiago"]), "Thiago e Larissa");
    assert.equal(planRuleLabel({name: "P", kind: "package", priceReais: 1, classesPerWeek: null, credits: 10, validityDays: 60}), "pacote de 10 aulas, válido por 60 dias");
    assert.equal(payoutLabel({model: "per_class", amountReais: 60}), "R$ 60,00 por aula dada");
    assert.equal(payoutLabel(null), "o valor combinado com a ARENA");
  });

  it("modelos padrão só usam variáveis conhecidas; sem modelo publicado vale o padrão", () => {
    assert.deepEqual(unknownAgreementVariables("student", DEFAULT_TEMPLATES.student.body), []);
    assert.deepEqual(unknownAgreementVariables("professor", DEFAULT_TEMPLATES.professor.body), []);
    assert.deepEqual(unknownAgreementVariables("professor", "{{aluno.nome}}"), ["aluno.nome"]);
    assert.equal(resolveTemplate("student", undefined).version, 0);
    assert.equal(resolveTemplate("student", {title: "T", body: "B", version: 3}).version, 3);
  });
});

describe("contratos de aulas — atleta contrata pelo app", () => {
  it("opções: só planos do app, professores do plano e vagas por dia", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const out = await signupOptionsCore(db, "u1", "arena1");
    assert.deepEqual(out.plans.map((p) => p.planId).sort(), ["m1", "m2"]);
    const m2 = out.plans.find((p) => p.planId === "m2")!;
    assert.deepEqual(m2.teacherIds.sort(), ["t1", "t2"]);
    assert.equal(m2.anyTeacher, false);
    // Plano sem professor marcado = todos com turma ativa.
    assert.deepEqual(out.plans.find((p) => p.planId === "m1")!.teacherIds.sort(), ["t1", "t2", "t3"]);
    const cL = out.classes.find((c) => c.classId === "cL")!;
    assert.deepEqual(cL.days, [{weekday: 2, vacancies: 0}, {weekday: 4, vacancies: 1}]);
  });

  it("prévia preenche o contrato com plano, professor, dias e valor", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const p = await previewSelfEnrollmentCore(db, ME, thiago2x, TODAY);
    assert.match(p.agreement.body, /Marina Lopes/);
    assert.match(p.agreement.body, /Vôlei 2x \(2 aulas por semana\)/);
    assert.match(p.agreement.body, /terças às 18:00 e quintas às 18:00, com Thiago Mendes/);
    assert.match(p.agreement.body, /R\$ 260,00 por mês/);
    assert.match(p.agreement.body, /12\.345\.678\/0001-90/);
    assert.match(p.agreement.body, /19\/10\/2026 a 18\/10\/2027/);
    assert.equal(p.agreement.sha256.length, 64);
    assert.equal(p.online, false);
  });

  it("assinar vira matrícula + contrato assinado na mesma operação", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const out = await signed(db);
    const e = doc(fake, `arenaClassEnrollments/${out.enrollmentId}`);
    assert.equal(e["createdByRole"], "athlete");
    assert.equal(e["billingMode"], "manual");
    const a = doc(fake, `arenaAgreements/${out.agreementId}`);
    assert.equal(a["status"], "signed");
    assert.equal(a["partyUid"], "u1");
    assert.equal((a["evidence"] as Data)["readSeconds"], 95);
    assert.equal((a["evidence"] as Data)["platform"], "ios");
    assert.deepEqual(a["teacherIds"], ["t1"]);
    const mine = await myAgreementsCore(db, "u1");
    assert.equal(mine.agreements.length, 1);
    const detail = await myAgreementCore(db, "u1", out.agreementId);
    assert.equal(detail.evidence?.ip, "189.40.•••.21");
    await assert.rejects(myAgreementCore(db, "uOutro", out.agreementId), HttpsError);
  });

  it("vários planos ao mesmo tempo, mas não a mesma turma duas vezes", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    await signed(db);
    await assert.rejects(signed(db, {arenaId: "arena1", planId: "m1", slots: [{classId: "cT", weekday: 2}]}), /já tem matrícula/);
    const second = await signed(db, {arenaId: "arena1", planId: "m1", slots: [{classId: "cR", weekday: 6}]});
    assert.ok(second.agreementId);
    assert.equal((await myAgreementsCore(db, "u1")).agreements.length, 2);
    assert.equal((await signupOptionsCore(db, "u1", "arena1")).activePlanCount, 2);
  });

  it("recusa: sem aceite, texto diferente, professor fora do plano, plano fora do app, dia lotado", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    await assert.rejects(enrollMeCore(db, ME, {...thiago2x, agreed: false, sha256: "x"}, EV, NOW), /Marque/);
    await assert.rejects(enrollMeCore(db, ME, {...thiago2x, agreed: true, sha256: "0".repeat(64)}, EV, NOW), /contrato mudou/);
    await assert.rejects(signed(db, {arenaId: "arena1", planId: "m2", slots: [{classId: "cR", weekday: 6}, {classId: "cT", weekday: 2}]}), /professor deste plano/);
    await assert.rejects(signed(db, {arenaId: "arena1", planId: "x1", slots: [{classId: "cT", weekday: 2}]}), /não está disponível/);
    await assert.rejects(signed(db, {arenaId: "arena1", planId: "m2", slots: [{classId: "cL", weekday: 2}, {classId: "cL", weekday: 4}]}), /lotada/);
  });

  it("arena cobra online: sem CPF a prévia pede e a assinatura recusa", async () => {
    const {fake, db} = makeDb();
    seed(fake, {onlineBillingEnabled: true});
    const p = await previewSelfEnrollmentCore(db, ME, thiago2x, TODAY);
    assert.equal(p.online, true);
    assert.equal(p.needsCpf, true);
    await assert.rejects(enrollMeCore(db, ME, {...thiago2x, agreed: true, sha256: p.agreement.sha256}, EV, NOW), /CPF/);
  });

  it("cancelar a matrícula encerra o contrato", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const out = await signed(db);
    await setEnrollmentStatusCore(db, out.enrollmentId, "canceled", TODAY);
    assert.equal(doc(fake, `arenaAgreements/${out.agreementId}`)["status"], "ended");
  });
});

describe("contratos de aulas — professor e arena", () => {
  it("arena envia, professor assina; reenviar troca o pendente; o novo assinado encerra o anterior", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const first = await sendProfessorAgreementCore(db, "uOwner", {arenaId: "arena1", teacherId: "t1"}, NOW);
    const a = doc(fake, `arenaAgreements/${first.agreementId}`);
    assert.equal(a["status"], "pending");
    assert.equal(a["partyUid"], "uT");
    assert.match(String(a["body"]), /Vôlei 2x/);
    assert.match(String(a["body"]), /50% da receita/);
    await assert.rejects(signMyAgreementCore(db, {uid: "uX", email: ""}, {agreementId: first.agreementId, agreed: true, sha256: a["sha256"]}, EV, NOW), HttpsError);
    await signMyAgreementCore(db, {uid: "uT", email: ""}, {agreementId: first.agreementId, agreed: true, sha256: a["sha256"]}, EV, NOW);
    assert.equal(doc(fake, `arenaAgreements/${first.agreementId}`)["status"], "signed");

    const second = await sendProfessorAgreementCore(db, "uOwner", {arenaId: "arena1", teacherId: "t1"}, NOW);
    const third = await sendProfessorAgreementCore(db, "uOwner", {arenaId: "arena1", teacherId: "t1"}, NOW);
    assert.equal(doc(fake, `arenaAgreements/${second.agreementId}`)["status"], "canceled");
    const t = doc(fake, `arenaAgreements/${third.agreementId}`);
    assert.equal(t["replaces"], first.agreementId);
    await signMyAgreementCore(db, {uid: "uT", email: ""}, {agreementId: third.agreementId, agreed: true, sha256: t["sha256"]}, EV, NOW);
    assert.equal(doc(fake, `arenaAgreements/${first.agreementId}`)["status"], "ended");

    const list = await listArenaAgreementsCore(db, "uOwner", "arena1");
    assert.equal(list.teachers.find((x) => x.teacherId === "t1")!.agreementStatus, "signed");
    assert.equal(list.teachers.find((x) => x.teacherId === "t2")!.agreementStatus, null);
  });

  it("professor sem conta não recebe; só a arena envia e cancela", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    fake.seedDoc("arenas/arena1/classTeachers/t4", {arenaId: "arena1", name: "Sem conta", status: "active"});
    await assert.rejects(sendProfessorAgreementCore(db, "uOwner", {arenaId: "arena1", teacherId: "t4"}, NOW), /Vincule/);
    await assert.rejects(sendProfessorAgreementCore(db, "u1", {arenaId: "arena1", teacherId: "t1"}, NOW), HttpsError);
    const sent = await sendProfessorAgreementCore(db, "uOwner", {arenaId: "arena1", teacherId: "t2"}, NOW);
    assert.deepEqual(await cancelAgreementCore(db, "uOwner", sent.agreementId, NOW), {status: "canceled"});
  });

  it("modelo publicado vira versão nova e vale para a próxima assinatura", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    await assert.rejects(saveTemplateCore(db, "uOwner", {arenaId: "arena1", audience: "student", title: "T", body: "Olá {{aluno.apelido}} ".repeat(5)}), /Variável desconhecida/);
    const out = await saveTemplateCore(db, "uOwner", {arenaId: "arena1", audience: "student", title: "Contrato Verano", body: "Eu, {{aluno.nome}}, contrato o plano {{plano.nome}} da {{arena.nome}}."});
    assert.equal(out.version, 1);
    const p = await previewSelfEnrollmentCore(db, ME, thiago2x, TODAY);
    assert.equal(p.agreement.title, "Contrato Verano");
    assert.equal(p.agreement.body, "Eu, Marina Lopes, contrato o plano Vôlei 2x da Arena Verano.");
    assert.equal(p.agreement.templateVersion, 1);
  });

  it("plano: professores precisam ser da arena; ausente no pedido não mexe", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    assert.deepEqual(await validatePlanAppFields(db, "arena1", {}), {});
    assert.deepEqual(await validatePlanAppFields(db, "arena1", {teacherIds: ["t1", "t1", "t2"], availableInApp: true}), {teacherIds: ["t1", "t2"], availableInApp: true});
    await assert.rejects(validatePlanAppFields(db, "arena1", {teacherIds: ["tX"]}), /não encontrado/);
  });
});

describe("contratos de aulas — perfil público", () => {
  it("classSignupOpen acompanha os planos do app", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    assert.equal(await syncClassSignupFlag(db, "arena1"), true);
    assert.equal(doc(fake, "arenas/arena1")["classSignupOpen"], true);
    fake.seedDoc("arenas/arena1/classPlans/m2", {...doc(fake, "arenas/arena1/classPlans/m2"), status: "archived"});
    fake.seedDoc("arenas/arena1/classPlans/m1", {...doc(fake, "arenas/arena1/classPlans/m1"), availableInApp: false});
    assert.equal(await syncClassSignupFlag(db, "arena1"), false);
  });
});

describe("contratos de aulas — modelo dos Planos de horário", () => {
  it("anual com desconto, vencimento escolhido e Pix: opções, contrato e matrícula", async () => {
    const {fake, db} = makeDb();
    seed(fake, {onlineBillingEnabled: true});
    fake.seedDoc("users/u1", {fullName: "Marina Lopes", phoneNumber: "+5562999990000", cpf: "52998224725"});
    fake.seedDoc("arenas/arena1/classPlans/m2", {
      ...doc(fake, "arenas/arena1/classPlans/m2"),
      cycles: {monthly: {enabled: true}, annual: {enabled: true, discountPercent: 15}},
      billing: {methods: ["pix", "onsite"], dueDayOptions: [5, 15, 25]},
    });
    const options = await signupOptionsCore(db, "u1", "arena1");
    const m2 = options.plans.find((p) => p.planId === "m2")!;
    assert.deepEqual(m2.cycles.map((c) => [c.cycle, c.monthlyPriceReais]), [["monthly", 260], ["annual", 221]]);
    assert.deepEqual(m2.billing, {methods: ["pix", "onsite"], dueDayOptions: [5, 15, 25], dueDay: 5});
    const input = {...thiago2x, cycle: "annual", dueDay: 15, paymentForm: "pix"};
    const p = await previewSelfEnrollmentCore(db, ME, input, TODAY);
    assert.equal(p.cycle, "annual");
    assert.equal(p.dueDay, 15);
    assert.equal(p.paymentForm, "pix");
    assert.match(p.agreement.body, /plano anual, pago à vista, com fidelidade de 12 meses/);
    assert.match(p.agreement.body, /R\$ 221,00 por mês, pagos à vista \(R\$ 2\.652,00 por 12 meses\) \(15% de desconto do plano anual\)/);
    assert.match(p.agreement.body, /dia 15, por Pix pelo app nexaGO/);
    assert.match(p.agreement.body, /até 19\/10\/2027/);
    const out = await enrollMeCore(db, ME, {...input, agreed: true, sha256: p.agreement.sha256}, EV, NOW);
    const e = doc(fake, `arenaClassEnrollments/${out.enrollmentId}`);
    assert.equal(e["cycle"], "annual");
    assert.equal(e["dueDay"], 15);
    assert.equal(e["paymentForm"], "pix");
    assert.equal(e["billingMode"], "asaas");
    assert.equal(e["commitmentEndsOn"], "2027-10-19");
  });

  it("recusa forma fora do plano e vencimento fora das opções; na arena vira cobrança manual", async () => {
    const {fake, db} = makeDb();
    seed(fake, {onlineBillingEnabled: true});
    fake.seedDoc("arenas/arena1/classPlans/m2", {
      ...doc(fake, "arenas/arena1/classPlans/m2"),
      billing: {methods: ["pix", "onsite"], dueDayOptions: [5, 15, 25]},
    });
    await assert.rejects(previewSelfEnrollmentCore(db, ME, {...thiago2x, paymentForm: "card"}, TODAY), /forma de pagamento/);
    await assert.rejects(previewSelfEnrollmentCore(db, ME, {...thiago2x, dueDay: 10}, TODAY), /Vencimento/);
    const p = await previewSelfEnrollmentCore(db, ME, {...thiago2x, paymentForm: "onsite"}, TODAY);
    assert.equal(p.online, false);
    assert.match(p.agreement.body, /pagamento direto na arena/);
  });

  it("arena sem cobrança online: só na arena aparece", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const options = await signupOptionsCore(db, "u1", "arena1");
    assert.deepEqual(options.plans.find((p) => p.planId === "m2")!.billing.methods, ["onsite"]);
  });
});
