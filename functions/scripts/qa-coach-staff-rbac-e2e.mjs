// QA e2e da comissão técnica do treinador (RBAC por cargo) contra o dev
// (volley-track-dev-4596c).
//
// Mesmo protocolo do sibling `qa-arena-staff-rbac-e2e.mjs`: Auth REST +
// callables deployados + Firestore REST com o idToken de usuários reais — as
// firestore.rules são exercitadas de verdade, junto com as Cloud Functions.
// Setup e limpeza usam firebase-admin com Application Default Credentials.
//
// PRÉ-REQUISITO: rules + functions da comissão já deployadas no dev (este
// script NÃO deploya nada).
//
// Uso (dentro de functions/):
//   node scripts/qa-coach-staff-rbac-e2e.mjs
//
// Pré-requisito: gcloud auth application-default login (ADC com acesso ao dev).

import admin from "firebase-admin";

// --- Projeto: SEMPRE dev. NUNCA volley-track-2dd3b (produção). --------------
const PID = "volley-track-dev-4596c";
const API_KEY = "AIzaSyAXrftckloRsU_EKOA_oMgI-9BJdV4kIQs"; // web key do dev (pública)
const FN = `https://us-central1-${PID}.cloudfunctions.net`;
const FS = `https://firestore.googleapis.com/v1/projects/${PID}/databases/(default)/documents`;

if (PID !== "volley-track-dev-4596c") {
  throw new Error("BLOQUEADO: PID não é o projeto de dev.");
}

admin.initializeApp({projectId: PID});
const db = admin.firestore();
const auth = admin.auth();
const FieldValue = admin.firestore.FieldValue;

const ts = Date.now();
let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✔ ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  ✖ ${name} ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Auth REST + callable REST (mesmo padrão do sibling qa-friendly-match-e2e)
// ---------------------------------------------------------------------------

async function signUp(email, password) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email, password, returnSecureToken: true}),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`signUp ${email}: ${JSON.stringify(j.error)}`);
  return {uid: j.localId, token: j.idToken, email};
}

async function call(name, token, data) {
  const r = await fetch(`${FN}/${name}`, {
    method: "POST",
    headers: {"Content-Type": "application/json", Authorization: `Bearer ${token}`},
    body: JSON.stringify({data}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const code = j?.error?.status || r.status;
    const msg = j?.error?.message || "";
    const e = new Error(`${name}: ${code} ${msg}`);
    e.code = String(code);
    e.message2 = msg;
    throw e;
  }
  return j.result;
}

async function expectError(promiseFn, codeSub, label) {
  try {
    await promiseFn();
    ok(label, false, "(não lançou erro)");
  } catch (e) {
    ok(label, String(e.code).includes(codeSub), `(veio ${e.code}: ${e.message})`);
  }
}

// ---------------------------------------------------------------------------
// Firestore REST (com token de usuário real, para exercitar as rules)
// ---------------------------------------------------------------------------

const S = (v) => ({stringValue: v});
const B = (v) => ({booleanValue: v});
const I = (v) => ({integerValue: String(v)});
const T = (iso) => ({timestampValue: iso});

function fieldStr(fields, name) { return fields?.[name]?.stringValue; }
function stringArrayOf(doc, name) {
  return (doc?.[name]?.arrayValue?.values ?? []).map((v) => v.stringValue);
}

async function fsGet(path, token) {
  const r = await fetch(`${FS}/${path}`, {headers: {Authorization: `Bearer ${token}`}});
  if (r.status === 403) return {denied: true};
  if (r.status === 404) return null;
  if (!r.ok) {
    // 401/429/5xx não podem virar "leitura bem-sucedida" ({}), nem "negado".
    throw new Error(`fsGet ${path}: HTTP ${r.status} ${await r.text()}`);
  }
  const j = await r.json();
  return j.fields ?? {};
}

/** PATCH via Firestore REST (cria se não existir) com o token de um usuário
 *  real — nunca lança: quem chama decide o que fazer com o status. */
async function fsWrite(path, fields, mask, token) {
  const url = new URL(`${FS}/${path}`);
  for (const m of mask) url.searchParams.append("updateMask.fieldPaths", m);
  const r = await fetch(url, {
    method: "PATCH",
    headers: {"Content-Type": "application/json", Authorization: `Bearer ${token}`},
    body: JSON.stringify({fields}),
  });
  const body = await r.text();
  return {status: r.status, ok: r.ok, body};
}

async function waitFor(label, fn, tries = 20, delayMs = 2000) {
  const start = Date.now();
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v !== null && v !== undefined && v !== false) {
      return {value: v, elapsedMs: Date.now() - start};
    }
    await new Promise((res) => setTimeout(res, delayMs));
  }
  throw new Error(`timeout esperando: ${label}`);
}

// ---------------------------------------------------------------------------
// Rastreamento de tudo que criamos, para limpar no final
// ---------------------------------------------------------------------------

const cleanup = {authUids: [], coachIds: []};
const cleanupErrors = [];

/** Espera uma condição; devolve null (em vez de lançar) no timeout. */
async function poll(label, fn, tries = 12, delayMs = 500) {
  try {
    return await waitFor(label, fn, tries, delayMs);
  } catch {
    return null;
  }
}

const isDenied = (r) => r?.denied === true;
const isReadable = (r) => r !== null && r !== undefined && !r.denied;
const writeOk = (w) => w.status >= 200 && w.status < 300;

async function run() {
  console.log(`== QA coach-staff RBAC e2e — projeto ${PID} — ts=${ts} ==`);

  // ===========================================================================
  console.log("\n== Setup: contas descartáveis + fixture (Admin SDK) ==");
  // ===========================================================================
  const PW = `QaCoach!${ts}`;
  const mail = (tag) => `coach-qa-${ts}-${tag}@example.test`;
  // Cada uid entra em cleanup.authUids logo após o próprio signUp: falha no meio do setup não vaza contas.
  const newUser = async (tag) => {
    const u = await signUp(mail(tag), PW);
    cleanup.authUids.push(u.uid);
    return u;
  };
  const coach = await newUser("dono");
  cleanup.coachIds.push(coach.uid);
  const coachB = await newUser("donob");
  cleanup.coachIds.push(coachB.uid);
  const aux = await newUser("aux");
  const prep = await newUser("prep");
  const fisio = await newUser("fisio");
  const psico = await newUser("psico");
  const estranho = await newUser("estranho");
  const atleta = await newUser("atleta");
  const A = coach.uid;
  const Bc = coachB.uid;
  console.log(`  coach A=${A}  coach B=${Bc}`);

  // Claim `coach` + perfil do treinador (mesmo formato que o autocadastro grava).
  for (const u of [coach, coachB]) {
    await auth.setCustomUserClaims(u.uid, {roles: ["coach"]});
    await db.doc(`users/${u.uid}`).set({roles: ["coach"]}, {merge: true});
  }
  await db.doc(`coaches/${A}`).set({displayName: "QA Treinador A", createdAt: FieldValue.serverTimestamp()});
  await db.doc(`coaches/${Bc}`).set({displayName: "QA Treinador B", createdAt: FieldValue.serverTimestamp()});

  const squadId = "qa-squad";
  const trainingId = "qa-training";
  const evalId = "qa-eval";
  await db.doc(`coaches/${A}/squads/${squadId}`).set({name: "Equipe QA"});
  await db.doc(`coaches/${A}/athletes/${atleta.uid}`).set({
    athleteUid: atleta.uid, squadId, status: "ativo", linkStatus: "accepted",
    linkedAt: FieldValue.serverTimestamp(),
  });
  await db.doc(`coaches/${A}/trainings/${trainingId}`).set({title: "Treino QA", squadId, status: "agendado"});
  await db.doc(`coaches/${A}/evaluations/${evalId}`).set({athleteUid: atleta.uid, notes: "QA"});
  await db.doc(`coaches/${Bc}/athletes/${atleta.uid}`).set({
    athleteUid: atleta.uid, status: "ativo", linkStatus: "accepted",
  });

  // ===========================================================================
  console.log("\n== [1] Convite ==");
  // ===========================================================================
  const inv = await call("createCoachStaffInvite", coach.token, {email: aux.email, role: "auxiliar"});
  ok("[1] treinador cria convite e recebe inviteId",
    typeof inv?.inviteId === "string" && inv.inviteId.length > 0, JSON.stringify(inv));

  await expectError(
    () => call("createCoachStaffInvite", coach.token, {email: aux.email, role: "auxiliar"}),
    "ALREADY_EXISTS", "[1] segundo convite igual (pendente) -> already-exists");
  await expectError(
    () => call("createCoachStaffInvite", coach.token, {email: prep.email, role: "principal"}),
    "INVALID_ARGUMENT", "[1] cargo 'principal' -> invalid-argument");
  await expectError(
    () => call("createCoachStaffInvite", coach.token, {email: coach.email, role: "auxiliar"}),
    "INVALID_ARGUMENT", "[1] treinador convidando o próprio e-mail -> invalid-argument");
  await expectError(
    () => call("createCoachStaffInvite", estranho.token, {email: prep.email, role: "auxiliar"}),
    "FAILED_PRECONDITION", "[1] sem coaches/{uid} (estranho) -> failed-precondition");

  // ===========================================================================
  console.log("\n== [2] Aceite ==");
  // ===========================================================================
  await expectError(
    () => call("acceptCoachStaffInvite", estranho.token, {inviteId: inv.inviteId}),
    "PERMISSION_DENIED", "[2] aceite com e-mail errado -> permission-denied");

  const acc = await call("acceptCoachStaffInvite", aux.token, {inviteId: inv.inviteId});
  ok("[2] aceite com o e-mail certo devolve {coachUid, role}",
    acc?.coachUid === A && acc?.role === "auxiliar", JSON.stringify(acc));

  await expectError(
    () => call("acceptCoachStaffInvite", aux.token, {inviteId: inv.inviteId}),
    "FAILED_PRECONDITION", "[2] segundo aceite -> failed-precondition");

  const staffDoc = await fsGet(`coaches/${A}/staff/${aux.uid}`, coach.token);
  ok("[2] coaches/{A}/staff/{aux} existe com o cargo certo",
    isReadable(staffDoc) && fieldStr(staffDoc, "role") === "auxiliar", JSON.stringify(staffDoc));

  const mirror = await poll("espelho users/{aux}/coachStaff/{A}", async () => {
    const f = await fsGet(`users/${aux.uid}/coachStaff/${A}`, aux.token);
    return isReadable(f) ? f : null;
  }, 40, 500);
  ok("[2] espelho users/{aux}/coachStaff/{A} aparece em <= 20s (trigger)",
    !!mirror && fieldStr(mirror.value, "role") === "auxiliar",
    mirror ? JSON.stringify(mirror.value) : "(timeout)");
  if (mirror) console.log(`  ⏱ latência do espelho: ${mirror.elapsedMs}ms`);

  const auxUser = await auth.getUser(aux.uid);
  ok("[2] aux ganhou a claim 'coach'",
    Array.isArray(auxUser.customClaims?.roles) && auxUser.customClaims.roles.includes("coach"),
    JSON.stringify(auxUser.customClaims));

  // Demais cargos: convite + aceite (setup para as seções seguintes).
  const members = {prep: [prep, "preparador_fisico"], fisio: [fisio, "fisioterapeuta"], psico: [psico, "psicologo"]};
  for (const [tag, [u, role]] of Object.entries(members)) {
    const i = await call("createCoachStaffInvite", coach.token, {email: u.email, role});
    const a = await call("acceptCoachStaffInvite", u.token, {inviteId: i.inviteId});
    ok(`[2-setup] ${tag} entra como ${role}`, a?.coachUid === A && a?.role === role, JSON.stringify(a));
  }

  // ===========================================================================
  console.log("\n== [3] Rules via REST (token de cada cargo, célula a célula) ==");
  // ===========================================================================
  const pathOf = {
    squads: `coaches/${A}/squads/${squadId}`,
    athletes: `coaches/${A}/athletes/${atleta.uid}`,
    trainings: `coaches/${A}/trainings/${trainingId}`,
    evaluations: `coaches/${A}/evaluations/${evalId}`,
  };
  // [squads, athletes, trainings, evaluations]: 1 = permitido, 0 = negado.
  const expectMatrix = {
    aux: {user: aux, read: [1, 1, 1, 1], write: [0, 0, 1, 0]},
    prep: {user: prep, read: [1, 1, 1, 1], write: [0, 0, 0, 0]},
    fisio: {user: fisio, read: [1, 1, 1, 0], write: [0, 0, 0, 0]},
    psico: {user: psico, read: [1, 1, 0, 0], write: [0, 0, 0, 0]},
    estranho: {user: estranho, read: [0, 0, 0, 0], write: [0, 0, 0, 0]},
  };
  const cols = ["squads", "athletes", "trainings", "evaluations"];
  for (const [tag, m] of Object.entries(expectMatrix)) {
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const r = await fsGet(pathOf[col], m.user.token);
      ok(`[3] ${tag} ${m.read[i] ? "LÊ" : "NÃO lê"} ${col}`,
        m.read[i] ? isReadable(r) : isDenied(r), JSON.stringify(r));
      const w = await fsWrite(pathOf[col], {qaTouch: S(`${tag}-${ts}`)}, ["qaTouch"], m.user.token);
      ok(`[3] ${tag} ${m.write[i] ? "ESCREVE" : "NÃO escreve"} ${col}`,
        m.write[i] ? writeOk(w) : w.status === 403, `status=${w.status} ${w.body}`);
    }
  }
  const ownerTouch = await fsWrite(pathOf.trainings, {qaTouch: S("dono")}, ["qaTouch"], coach.token);
  ok("[3] dono escreve trainings (controle)", writeOk(ownerTouch), `status=${ownerTouch.status}`);

  for (const [tag, u] of [["aux", aux], ["prep", prep], ["fisio", fisio], ["psico", psico], ["estranho", estranho]]) {
    const root = await fsGet(`coaches/${A}`, u.token);
    ok(`[3] ${tag} NÃO lê coaches/{coachUid} raiz`, isDenied(root), JSON.stringify(root));
  }
  const ownerRoot = await fsGet(`coaches/${A}`, coach.token);
  ok("[3] dono lê coaches/{coachUid} raiz (controle)", isReadable(ownerRoot), JSON.stringify(ownerRoot));

  const staffWrite = await fsWrite(`coaches/${A}/staff/${aux.uid}`, {role: S("psicologo")}, ["role"], aux.token);
  ok("[3] membro NÃO escreve o próprio doc de staff (só Cloud Function)",
    staffWrite.status === 403, `status=${staffWrite.status}`);

  // ===========================================================================
  console.log("\n== [4] Callables autorizam por área (o Critical da arena) ==");
  // ===========================================================================
  const cu = (extra = {}) => ({
    squadId, title: `Convocação QA ${ts}`, recipients: [atleta.uid], ...extra,
  });

  try {
    const r = await call("sendCallUp", aux.token, cu({coachUid: A}));
    ok("[4] sendCallUp com coachUid: auxiliar OK", typeof r?.callUpId === "string", JSON.stringify(r));
  } catch (e) {
    ok("[4] sendCallUp com coachUid: auxiliar OK", false, `(${e.code}: ${e.message})`);
  }
  await expectError(() => call("sendCallUp", psico.token, cu({coachUid: A})),
    "PERMISSION_DENIED", "[4] sendCallUp: psicólogo -> permission-denied");
  await expectError(() => call("sendCallUp", estranho.token, cu({coachUid: A})),
    "PERMISSION_DENIED", "[4] sendCallUp: estranho com coachUid forjado -> permission-denied");
  await expectError(() => call("sendCallUp", aux.token, cu({coachUid: Bc})),
    "PERMISSION_DENIED", "[4] sendCallUp: membro de A passando coachUid de B -> permission-denied");
  try {
    const r = await call("sendCallUp", coach.token, cu());
    ok("[4] sendCallUp pelo dono sem coachUid OK (retrocompat)", typeof r?.callUpId === "string", JSON.stringify(r));
  } catch (e) {
    ok("[4] sendCallUp pelo dono sem coachUid OK (retrocompat)", false, `(${e.code}: ${e.message})`);
  }

  try {
    const r = await call("getCoachTournamentOverview", psico.token, {coachUid: A});
    ok("[4] getCoachTournamentOverview: psicólogo OK (atletas read)",
      Array.isArray(r?.tournaments), JSON.stringify(r));
  } catch (e) {
    ok("[4] getCoachTournamentOverview: psicólogo OK (atletas read)", false, `(${e.code}: ${e.message})`);
  }
  await expectError(() => call("getCoachTournamentOverview", estranho.token, {coachUid: A}),
    "PERMISSION_DENIED", "[4] getCoachTournamentOverview: estranho -> permission-denied");

  await expectError(
    () => call("sendCoachAthleteInvite", aux.token, {coachUid: A, athleteUid: estranho.uid}),
    "PERMISSION_DENIED", "[4] sendCoachAthleteInvite: auxiliar (sem atletas write) -> permission-denied");
  try {
    const r = await call("sendCoachAthleteInvite", coach.token, {coachUid: A, athleteUid: estranho.uid});
    ok("[4] sendCoachAthleteInvite: dono OK", typeof r?.inviteId === "string", JSON.stringify(r));
  } catch (e) {
    ok("[4] sendCoachAthleteInvite: dono OK", false, `(${e.code}: ${e.message})`);
  }

  // ===========================================================================
  console.log("\n== [5] Corte imediato (rules leem o staff ao vivo) ==");
  // ===========================================================================
  const beforeRm = await fsGet(pathOf.trainings, aux.token);
  ok("[5-setup] aux ainda lê trainings antes da remoção", isReadable(beforeRm), JSON.stringify(beforeRm));

  await call("removeCoachStaff", coach.token, {staffUserId: aux.uid});
  // Mesmo token, sem renovar: o corte é pelo doc de staff, não pela claim.
  const afterRmRead = await fsGet(pathOf.trainings, aux.token);
  ok("[5] token do aux (sem renovar) já é negado ao LER trainings", isDenied(afterRmRead), JSON.stringify(afterRmRead));
  const afterRmWrite = await fsWrite(pathOf.trainings, {qaTouch: S("pos-remocao")}, ["qaTouch"], aux.token);
  ok("[5] token do aux (sem renovar) já recebe 403 ao ESCREVER trainings",
    afterRmWrite.status === 403, `status=${afterRmWrite.status}`);
  await expectError(() => call("sendCallUp", aux.token, cu({coachUid: A})),
    "PERMISSION_DENIED", "[5] sendCallUp: aux removido -> permission-denied");

  const mirrorGone = await poll("espelho do aux sumir", async () => {
    const f = await fsGet(`users/${aux.uid}/coachStaff/${A}`, aux.token);
    return f === null ? true : null;
  }, 40, 500);
  ok("[5] espelho users/{aux}/coachStaff/{A} some em <= 20s (trigger)", !!mirrorGone);
  if (mirrorGone) console.log(`  ⏱ latência da remoção do espelho: ${mirrorGone.elapsedMs}ms`);

  // changeCoachStaffRole: preparador -> psicologo muda o acesso na hora.
  const prepEvalBefore = await fsGet(pathOf.evaluations, prep.token);
  const prepTrainBefore = await fsGet(pathOf.trainings, prep.token);
  ok("[5-setup] preparador lê evaluations e trainings antes da troca",
    isReadable(prepEvalBefore) && isReadable(prepTrainBefore));
  const ch = await call("changeCoachStaffRole", coach.token, {staffUserId: prep.uid, role: "psicologo"});
  ok("[5] changeCoachStaffRole devolve ok", ch?.ok === true, JSON.stringify(ch));
  const prepSquads = await fsGet(pathOf.squads, prep.token);
  const prepEvalAfter = await fsGet(pathOf.evaluations, prep.token);
  const prepTrainAfter = await fsGet(pathOf.trainings, prep.token);
  ok("[5] após virar psicólogo: ainda lê squads", isReadable(prepSquads), JSON.stringify(prepSquads));
  ok("[5] após virar psicólogo: perde evaluations na hora", isDenied(prepEvalAfter), JSON.stringify(prepEvalAfter));
  ok("[5] após virar psicólogo: perde trainings na hora", isDenied(prepTrainAfter), JSON.stringify(prepTrainAfter));

  // ===========================================================================
  console.log("\n== [6] leaveCoachStaff ==");
  // ===========================================================================
  // psico "sai" da comissão de B (onde nunca esteve): não afeta o vínculo dele com A.
  const leaveOther = await call("leaveCoachStaff", psico.token, {coachUid: Bc});
  ok("[6] leaveCoachStaff com coachUid de outro treinador devolve ok", leaveOther?.ok === true, JSON.stringify(leaveOther));
  const psicoStill = await db.doc(`coaches/${A}/staff/${psico.uid}`).get();
  ok("[6] ...e o vínculo do psicólogo com A continua intacto", psicoStill.exists);

  const leave = await call("leaveCoachStaff", fisio.token, {coachUid: A});
  ok("[6] fisio sai da comissão de A", leave?.ok === true, JSON.stringify(leave));
  const fisioGone = await db.doc(`coaches/${A}/staff/${fisio.uid}`).get();
  ok("[6] coaches/{A}/staff/{fisio} foi removido", !fisioGone.exists);
  const fisioRead = await fsGet(pathOf.trainings, fisio.token);
  ok("[6] fisio perde o acesso a trainings na hora", isDenied(fisioRead), JSON.stringify(fisioRead));
  const fisioMirrorGone = await poll("espelho do fisio sumir", async () => {
    const f = await fsGet(`users/${fisio.uid}/coachStaff/${A}`, fisio.token);
    return f === null ? true : null;
  }, 40, 500);
  ok("[6] espelho do fisio some em <= 20s (trigger)", !!fisioMirrorGone);
  if (fisioMirrorGone) console.log(`  ⏱ latência da remoção do espelho (fisio): ${fisioMirrorGone.elapsedMs}ms`);
}

try {
  await run();
} catch (e) {
  fail++;
  failures.push(`ERRO FATAL: ${e.message}`);
  console.log(`  ✖ erro fatal no QA: ${e.stack || e.message}`);
} finally {
  // =========================================================================
  console.log("\n== [7] Limpeza ==");
  // =========================================================================
  for (const coachId of cleanup.coachIds) {
    for (const coll of ["coachStaffInvites", "coachAthleteInvites"]) {
      try {
        const snap = await db.collection(coll).where("coachUid", "==", coachId).get();
        for (const d of snap.docs) await d.ref.delete();
        console.log(`  apagados ${snap.size} de ${coll} (coachUid=${coachId})`);
      } catch (e) {
        cleanupErrors.push(`${coll}/${coachId}: ${e.message}`);
      }
    }
    try {
      // O trigger onCoachDeletedCleanupStaff também limpa staff; recursiveDelete cobre o resto.
      await db.recursiveDelete(db.doc(`coaches/${coachId}`));
      console.log(`  apagado (recursivo): coaches/${coachId}`);
    } catch (e) {
      cleanupErrors.push(`coaches/${coachId}: ${e.message}`);
    }
  }
  for (const uid of cleanup.authUids) {
    try {
      await db.recursiveDelete(db.doc(`users/${uid}`)); // inclui o espelho coachStaff
    } catch (e) {
      cleanupErrors.push(`users/${uid}: ${e.message}`);
    }
  }
  if (cleanup.authUids.length) {
    try {
      const res = await auth.deleteUsers(cleanup.authUids);
      console.log(`  Auth: ${res.successCount} removidas, ${res.failureCount} falha(s).`);
      for (const err of res.errors) {
        cleanupErrors.push(`auth uid ${cleanup.authUids[err.index]}: ${err.error.message}`);
      }
    } catch (e) {
      cleanupErrors.push(`auth.deleteUsers: ${e.message}`);
    }
  }
  if (cleanupErrors.length) {
    console.log("\nFalhas na limpeza:");
    for (const e of cleanupErrors) console.log(`  - ${e}`);
  } else {
    console.log("\nLimpeza concluída sem falhas.");
  }
}

if (failures.length) console.log("Falhas:", failures.join(" | "));
console.log(`${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
