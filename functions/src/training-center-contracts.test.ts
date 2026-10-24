import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  classScheduleLabel,
  clientIp,
  contractSha256,
  contractState,
  fillContractBody,
  maskIp,
  termEnd,
  unknownVariables,
} from "./training-center-contracts-model";
import {
  openMyContractCore,
  remindContractCore,
  sendContractsCore,
  signMyContractCore,
  terminateContractCore,
} from "./training-center-contracts";
import {loadMyTrainingCentersCore} from "./training-center-athlete";
import {myCenterInvoicePixCore} from "./training-center-athlete-actions";
import type {PushInput} from "./training-center-notify";

type Data = Record<string, unknown>;

const C = "trainingCenters/c1";
const NOW = new Date("2026-10-24T17:00:00Z");
const db = (f: FakeFirestore) => f as unknown as Firestore;
const doc = (f: FakeFirestore, path: string) => f.store.get(path) as Data;
const under = (f: FakeFirestore, prefix: string) => [...f.store.keys()].filter((k) => k.startsWith(prefix));
const EVIDENCE = {ip: "189.40.12.21", userAgent: "NexaGO/1.0 iPhone", platform: "ios", appVersion: "1.0.15+113"};

function deps(now = NOW) {
  const pushes: PushInput[] = [];
  return {pushes, deps: {now: () => now, notify: async (p: PushInput) => {
    pushes.push(p);
  }}};
}

const MATRICULA = [
  "# 1. Partes",
  "{{centro.razao_social}}, CNPJ {{centro.cnpj}}, e {{aluno.nome}}.",
  "# 2. Plano",
  "Turma {{turma.nome}} ({{turma.horario}}), plano {{plano.nome}} de {{plano.preco}}, vencimento dia {{cobranca.dia}}.",
  "Vigência de {{contrato.inicio}} a {{contrato.fim}}.",
].join("\n\n");

function seed() {
  const fake = new FakeFirestore();
  fake.seedDoc(C, {
    name: "CT Maré Alta", legalName: "Maré Alta Esportes LTDA", cnpj: "41.208.553/0001-90", status: "active",
    timezone: "America/Sao_Paulo", billing: {billingDayMode: "fixed", billingDay: 5, lateFees: true},
    policies: {monthlyCancellation: "end_of_cycle", excusedAbsenceMakeup: true, makeupValidityDays: 30},
  });
  fake.seedDoc(`${C}/centerMembers/owner`, {uid: "owner", role: "center_owner", status: "active", displayName: "Renata Moreira"});
  fake.seedDoc(`${C}/centerMembers/recep`, {uid: "recep", role: "receptionist", status: "active", displayName: "Camila"});
  fake.seedDoc(`${C}/centerMembers/coach`, {uid: "coach", role: "coach", status: "active"});
  fake.seedDoc(`${C}/students/lara`, {uid: "u-lara", name: "Lara Pinheiro", email: "lara.p@gmail.com", status: "active"});
  fake.seedDoc(`${C}/students/isa`, {uid: "u-patricia", name: "Isabela Moura", status: "active", isMinor: true,
    birthDate: "2016-02-03", guardian: {name: "Patrícia Moura", relation: "Mãe", email: "", phone: ""}});
  fake.seedDoc(`${C}/students/kid`, {uid: "u-kid", name: "Sem Responsável", status: "active", isMinor: true, guardian: null});
  fake.seedDoc(`${C}/programs/bt`, {name: "Beach Tennis"});
  fake.seedDoc(`${C}/classes/k1`, {name: "BT Iniciante A", programId: "bt", level: "Iniciante", weekdays: [4, 2],
    startTime: "18:00", coachName: "Thiago"});
  fake.seedDoc(`${C}/enrollments/e1`, {studentId: "lara", classId: "k1", className: "BT Iniciante A", status: "pending",
    startDate: "2026-10-24", contract: {planName: "Mensal 2x/semana", planType: "monthly", priceCents: 32000,
      classesPerWeek: 2, makeupsPerMonth: 2, policies: {monthlyCancellation: "end_of_cycle", excusedAbsenceMakeup: true}}});
  fake.seedDoc(`${C}/invoices/i1`, {studentId: "lara", enrollmentId: "e1", reference: "Mensal 2x/semana · outubro",
    amountCents: 8000, dueDate: "2026-10-24", status: "pending"});
  fake.seedDoc(`${C}/contractTemplates/t-mat`, {name: "Matrícula · adulto", kind: "enrollment", status: "published",
    version: 3, body: MATRICULA});
  fake.seedDoc(`${C}/contractTemplates/t-img`, {name: "Termo de uso de imagem", kind: "term", optional: true,
    status: "published", version: 1, body: "Autorizo o uso da imagem de {{aluno.nome}} pelo {{centro.nome}}."});
  fake.seedDoc(`${C}/contractTemplates/t-draft`, {name: "Termo de saúde", kind: "term", status: "draft", version: 0, body: ""});
  return fake;
}

const send = (fake: FakeFirestore, d: ReturnType<typeof deps>["deps"], uid: string, extra: Data = {}) =>
  sendContractsCore(db(fake), d, uid, {centerId: "c1", studentId: "lara", enrollmentId: "e1", templateIds: ["t-mat"], requireBeforePayment: true, ...extra});

describe("contratos · modelo", () => {
  it("preenche variáveis, ausente vira travessão, avisa chave desconhecida", () => {
    assert.equal(fillContractBody("Oi {{aluno.nome}} e {{ responsavel.nome }}", {"aluno.nome": "Lara"}), "Oi Lara e —");
    assert.deepEqual(unknownVariables("{{aluno.nome}} {{aluno.cpf}}"), ["aluno.cpf"]);
  });

  it("vigência de 12 meses termina na véspera; dia inexistente cai no último do mês", () => {
    assert.equal(termEnd("2026-10-24"), "2027-10-23");
    assert.equal(termEnd("2026-01-31", 1), "2026-02-27");
  });

  it("horário da turma em ordem de semana", () => {
    assert.equal(classScheduleLabel({weekdays: [4, 2], startTime: "18:00"}), "Ter e Qui · 18:00");
    assert.equal(classScheduleLabel({weekdays: ["sat", "mon", "wed"], startTime: "07:00"}), "Seg, Qua e Sáb · 07:00");
  });

  it("situação: renova em breve nos 30 dias finais, expirado depois do fim", () => {
    assert.equal(contractState({status: "signed", endDate: "2026-11-10"}, "2026-10-24"), "expiring");
    assert.equal(contractState({status: "signed", endDate: "2026-10-23"}, "2026-10-24"), "expired");
    assert.equal(contractState({status: "signed", endDate: "2027-10-23"}, "2026-10-24"), "signed");
    assert.equal(contractState({status: "viewed"}, "2026-10-24"), "viewed");
  });

  it("IP do primeiro salto e mascarado para a tela", () => {
    assert.equal(clientIp("189.40.12.21, 10.0.0.1", "127.0.0.1"), "189.40.12.21");
    assert.equal(clientIp(undefined, "127.0.0.1"), "127.0.0.1");
    assert.equal(maskIp("189.40.12.21"), "189.40.•••.21");
  });
});

describe("contratos · envio pela equipe", () => {
  it("recepção envia: texto congelado com os dados, número sequencial, auditoria e push", async () => {
    const fake = seed();
    const {pushes, deps: d} = deps();
    const r = await send(fake, d, "recep", {templateIds: ["t-mat", "t-img"]});
    assert.equal(r.contracts.length, 2);
    assert.deepEqual(r.contracts.map((c) => c.number), ["CTR-2026-0001", "CTR-2026-0002"]);
    const c = doc(fake, `${C}/contracts/${r.contracts[0]!.contractId}`);
    assert.equal(c["status"], "sent");
    assert.equal(c["templateVersion"], 3);
    assert.match(String(c["body"]), /Maré Alta Esportes LTDA, CNPJ 41\.208\.553\/0001-90, e Lara Pinheiro\./);
    assert.match(String(c["body"]), /Turma BT Iniciante A \(Ter e Qui · 18:00\), plano Mensal 2x\/semana de R\$\s?320,00\/mês, vencimento dia 5\./);
    assert.match(String(c["body"]), /Vigência de 24\/10\/2026 a 23\/10\/2027\./);
    assert.equal(c["sha256"], contractSha256(String(c["body"])));
    assert.equal(c["endDate"], "2027-10-23");
    assert.equal(c["requireBeforePayment"], true);
    const term = doc(fake, `${C}/contracts/${r.contracts[1]!.contractId}`);
    assert.equal(term["requireBeforePayment"], false, "termo avulso nunca segura o pagamento");
    assert.equal(term["enrollmentId"], null);
    assert.equal(term["optional"], true);
    assert.ok((c["essentials"] as Data[]).some((e) => e["label"] === "Valor" && /dia 05/.test(String(e["value"]))));
    assert.equal(under(fake, `${C}/auditLogs/`).length, 2);
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0]!.userId, "u-lara");
    assert.equal(pushes[0]!.data["contractId"], r.contracts[0]!.contractId);
    const again = await send(fake, d, "owner", {templateIds: ["t-draft"]}).catch((e) => e);
    assert.match(String(again.message), /não está publicado/);
  });

  it("professor não envia; contrato aberto do mesmo modelo não duplica", async () => {
    const fake = seed();
    const {deps: d} = deps();
    await assert.rejects(send(fake, d, "coach"), /Sem permissão/);
    await send(fake, d, "owner");
    await assert.rejects(send(fake, d, "owner"), /Reenviar lembrete/);
  });

  it("matrícula exige a matrícula; menor sem responsável não recebe", async () => {
    const fake = seed();
    const {deps: d} = deps();
    await assert.rejects(send(fake, d, "owner", {enrollmentId: ""}), /escolha a matrícula/);
    await assert.rejects(send(fake, d, "owner", {studentId: "kid", enrollmentId: "", templateIds: ["t-img"]}), /responsável legal/);
    const r = await send(fake, d, "owner", {studentId: "isa", enrollmentId: "", templateIds: ["t-img"]});
    const c = doc(fake, `${C}/contracts/${r.contracts[0]!.contractId}`);
    assert.deepEqual(c["signer"], {role: "guardian", name: "Patrícia Moura", relation: "Mãe"});
  });

  it("lembrete conta e respeita 1 por hora; encerrar é só do gestor e pede motivo", async () => {
    const fake = seed();
    const {pushes, deps: d} = deps();
    const {contracts: [c]} = await send(fake, d, "recep");
    const r = await remindContractCore(db(fake), d, "recep", {centerId: "c1", contractId: c!.contractId});
    assert.equal(r.reminderCount, 1);
    assert.equal(pushes.length, 2);
    await assert.rejects(remindContractCore(db(fake), d, "recep", {centerId: "c1", contractId: c!.contractId}), /última hora/);
    await assert.rejects(terminateContractCore(db(fake), d, "recep", {centerId: "c1", contractId: c!.contractId, reason: "Errado"}), /owner e admin/);
    await assert.rejects(terminateContractCore(db(fake), d, "owner", {centerId: "c1", contractId: c!.contractId, reason: ""}), /motivo/);
    const t = await terminateContractCore(db(fake), d, "owner", {centerId: "c1", contractId: c!.contractId, reason: "Enviado errado"});
    assert.equal(t.status, "cancelled", "aberto vira cancelado");
    assert.equal(doc(fake, `${C}/contracts/${c!.contractId}`)["terminateReason"], "Enviado errado");
  });
});

describe("contratos · aluno", () => {
  it("abre, assina com evidências e libera o pagamento", async () => {
    const fake = seed();
    const {deps: d} = deps();
    const {contracts: [c]} = await send(fake, d, "recep");
    const id = c!.contractId;

    let mine = (await loadMyTrainingCentersCore(db(fake), "u-lara", NOW)).centers[0]!;
    assert.equal(mine.contracts.length, 1);
    assert.equal(mine.contracts[0]!.status, "sent");
    const inv = mine.invoices.find((i) => i.invoiceId === "i1")!;
    assert.equal(inv.blockedByContract, true);
    assert.equal(inv.payUrl, null);
    await assert.rejects(myCenterInvoicePixCore(db(fake), "u-lara", {centerId: "c1", invoiceId: "i1"}), /Assine o contrato/);

    await openMyContractCore(db(fake), "u-lara", {centerId: "c1", contractId: id}, NOW);
    await openMyContractCore(db(fake), "u-lara", {centerId: "c1", contractId: id}, NOW);
    const viewed = doc(fake, `${C}/contracts/${id}`);
    assert.equal(viewed["status"], "viewed");
    assert.equal(viewed["viewCount"], 2);
    assert.equal((viewed["events"] as Data[]).length, 2, "só a primeira abertura entra na linha do tempo");

    const sha = mine.contracts[0]!.sha256;
    const auth = {uid: "u-lara", email: "lara.p@gmail.com"};
    await assert.rejects(signMyContractCore(db(fake), auth, {centerId: "c1", contractId: id, agreed: true, sha256: "x".repeat(64)}, EVIDENCE, NOW), /texto mudou/);
    await assert.rejects(signMyContractCore(db(fake), auth, {centerId: "c1", contractId: id, sha256: sha}, EVIDENCE, NOW), /leu e concorda/);
    await assert.rejects(signMyContractCore(db(fake), auth, {centerId: "c1", contractId: id, decision: "decline", sha256: sha}, EVIDENCE, NOW), /obrigatório/);
    const r = await signMyContractCore(db(fake), auth, {centerId: "c1", contractId: id, agreed: true, sha256: sha, readSeconds: 180}, EVIDENCE, NOW);
    assert.equal(r.status, "signed");
    assert.equal(r.number, "CTR-2026-0001");
    const signed = doc(fake, `${C}/contracts/${id}`);
    assert.ok(signed["signedAt"] instanceof Timestamp);
    assert.deepEqual(signed["evidence"], {
      method: "app_session", uid: "u-lara", email: "lara.p@gmail.com", ip: "189.40.12.21",
      userAgent: "NexaGO/1.0 iPhone", platform: "ios", appVersion: "1.0.15+113", readSeconds: 180, sha256: sha,
    });
    assert.equal((signed["centerSignature"] as Data)["name"], "CT Maré Alta");
    await assert.rejects(signMyContractCore(db(fake), auth, {centerId: "c1", contractId: id, agreed: true, sha256: sha}, EVIDENCE, NOW), /não espera mais/);

    mine = (await loadMyTrainingCentersCore(db(fake), "u-lara", NOW)).centers[0]!;
    assert.equal(mine.invoices.find((i) => i.invoiceId === "i1")!.blockedByContract, false);
  });

  it("termo opcional pode ser recusado; contrato de outro aluno não aparece", async () => {
    const fake = seed();
    const {deps: d} = deps();
    const {contracts: [c]} = await send(fake, d, "owner", {studentId: "isa", enrollmentId: "", templateIds: ["t-img"]});
    const id = c!.contractId;
    await assert.rejects(openMyContractCore(db(fake), "u-lara", {centerId: "c1", contractId: id}, NOW), /não encontrado/);
    const sha = doc(fake, `${C}/contracts/${id}`)["sha256"];
    const r = await signMyContractCore(db(fake), {uid: "u-patricia", email: ""}, {centerId: "c1", contractId: id, decision: "decline", sha256: sha}, EVIDENCE, NOW);
    assert.equal(r.status, "declined");
    assert.equal(doc(fake, `${C}/contracts/${id}`)["decision"], "declined");
  });
});
