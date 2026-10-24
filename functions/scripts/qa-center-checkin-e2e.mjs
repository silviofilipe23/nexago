// QA e2e do check-in do Centro de Treinamento contra o dev
// (volley-track-dev-4596c).
//
// Mesmo protocolo do sibling `qa-coach-staff-rbac-e2e.mjs`: usuários reais via
// Auth REST chamam a callable deployada `checkInTrainingCenterStudent`. Setup
// (centro, equipe, alunos, turma, aulas de hoje) e limpeza usam firebase-admin
// com Application Default Credentials. Os alunos não têm `uid` → nenhum push.
//
// PRÉ-REQUISITO: a callable já deployada no dev (este script NÃO deploya nada).
//
// Uso (dentro de functions/):
//   node scripts/qa-center-checkin-e2e.mjs

import admin from "firebase-admin";

// --- Projeto: SEMPRE dev. NUNCA volley-track-2dd3b (produção). --------------
const PID = "volley-track-dev-4596c";
const API_KEY = "AIzaSyAXrftckloRsU_EKOA_oMgI-9BJdV4kIQs"; // web key do dev (pública)
const FN = `https://southamerica-east1-${PID}.cloudfunctions.net`;
const TZ = "America/Sao_Paulo";

if (PID !== "volley-track-dev-4596c") {
  throw new Error("BLOQUEADO: PID não é o projeto de dev.");
}

admin.initializeApp({projectId: PID});
const db = admin.firestore();
const auth = admin.auth();

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
    const e = new Error(`${name}: ${j?.error?.status || r.status} ${j?.error?.message || ""}`);
    e.code = String(j?.error?.status || r.status);
    throw e;
  }
  return j.result;
}

const checkIn = (who, data) => call("checkInTrainingCenterStudent", who.token, data);

async function expectError(fn, codeSub, label) {
  try {
    await fn();
    ok(label, false, "(não lançou erro)");
  } catch (e) {
    ok(label, String(e.code).includes(codeSub), `(veio ${e.code}: ${e.message})`);
  }
}

/** "YYYY-MM-DD" e "HH:MM" no fuso do centro. */
function wall(at) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at).map((x) => [x.type, x.value]));
  return {date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`};
}

// ---------------------------------------------------------------------------

const centerId = `qa-ct-checkin-${ts}`;
const otherCenterId = `qa-ct-checkin-other-${ts}`;
const cleanup = {authUids: [], centers: [centerId, otherCenterId]};

try {
  const now = new Date();
  const live = wall(new Date(now.getTime() - 10 * 60_000)); // aula ao vivo: começou há 10 min
  const later = wall(new Date(now.getTime() + 3 * 3600_000)); // aula mais tarde
  const today = wall(now).date;
  if (live.date !== today || later.date !== today) {
    throw new Error("Rode longe da meia-noite (as duas aulas precisam cair hoje).");
  }

  console.log("Setup");
  const PW = `Qa!${ts}`;
  const mail = (tag) => `ct-checkin-qa-${ts}-${tag}@example.test`;
  const users = {};
  for (const tag of ["owner", "reception", "coach", "otherCoach", "outsider"]) {
    users[tag] = await signUp(mail(tag), PW);
    cleanup.authUids.push(users[tag].uid);
  }

  const center = db.collection("trainingCenters").doc(centerId);
  await center.set({name: "QA CT Check-in", status: "active", timezone: TZ});
  await db.collection("trainingCenters").doc(otherCenterId).set({name: "QA CT Outro", status: "active", timezone: TZ});
  const members = {owner: "center_owner", reception: "receptionist", coach: "coach", otherCoach: "coach"};
  for (const [tag, role] of Object.entries(members)) {
    await center.collection("centerMembers").doc(users[tag].uid).set({
      status: "active", role, displayName: `QA ${tag}`,
    });
  }

  const students = {
    ana: {name: "QA Ana", checkinCode: `QA${ts}A`.slice(-10).toUpperCase(), status: "active"},
    bia: {name: "QA Bia (atrasada)", checkinCode: `QA${ts}B`.slice(-10).toUpperCase(), status: "active", billingHold: true},
    caio: {name: "QA Caio (fora da turma)", checkinCode: `QA${ts}C`.slice(-10).toUpperCase(), status: "active"},
    duda: {name: "QA Duda (bloqueada)", checkinCode: `QA${ts}D`.slice(-10).toUpperCase(), status: "blocked"},
    edu: {name: "QA Edu (reposição)", checkinCode: `QA${ts}E`.slice(-10).toUpperCase(), status: "active"},
  };
  for (const [id, s] of Object.entries(students)) await center.collection("students").doc(id).set(s);
  await center.collection("classes").doc("turma").set({name: "QA Turma", rosterStudentIds: ["ana", "bia", "duda"]});

  const sessionBase = {classId: "turma", className: "QA Turma", status: "scheduled", durationMin: 60, coachName: "QA coach"};
  await center.collection("sessions").doc("aoVivo").set({
    ...sessionBase, date: today, startTime: live.time, coachUid: users.coach.uid, makeupStudentIds: ["edu"],
  });
  await center.collection("sessions").doc("maisTarde").set({
    ...sessionBase, date: today, startTime: later.time, coachUid: users.otherCoach.uid,
  });
  console.log(`  centro ${centerId} · aulas ${live.time} (ao vivo) e ${later.time}`);

  const qr = (code, cid = centerId) => `nexago-ct:${cid}:${code}`;
  const sessionDoc = async (id) => (await center.collection("sessions").doc(id).get()).data() ?? {};

  console.log("\nPermissão");
  await expectError(() => checkIn(users.outsider, {centerId, qr: qr(students.ana.checkinCode)}),
    "PERMISSION_DENIED", "quem não é da equipe é barrado");

  console.log("\nCheck-in pela carteirinha (recepção)");
  const r1 = await checkIn(users.reception, {centerId, qr: qr(students.ana.checkinCode)});
  ok("Ana → checked_in", r1.state === "checked_in", JSON.stringify(r1));
  ok("na aula ao vivo (não na de mais tarde)", r1.sessionId === "aoVivo", r1.sessionId);
  let s = await sessionDoc("aoVivo");
  ok("chamada grava presente", s.attendance?.ana === "present", JSON.stringify(s.attendance));
  ok("checkins guarda quem registrou", s.checkins?.ana?.byUid === users.reception.uid);
  const logs = await center.collection("auditLogs").where("action", "==", "session.checkin").get();
  ok("auditLog session.checkin gravado", logs.size === 1, `size=${logs.size}`);

  const r2 = await checkIn(users.reception, {centerId, qr: qr(students.ana.checkinCode)});
  ok("repetir → already", r2.state === "already", r2.state);

  console.log("\nPendência de mensalidade");
  const r3 = await checkIn(users.reception, {centerId, qr: qr(students.bia.checkinCode)});
  ok("Bia → hold, com billingHold", r3.state === "hold" && r3.billingHold === true, JSON.stringify(r3));
  s = await sessionDoc("aoVivo");
  ok("hold não grava presença", s.attendance?.bia === undefined);
  const r4 = await checkIn(users.reception, {centerId, studentId: "bia", force: true});
  ok("registrar mesmo assim (force) → checked_in", r4.state === "checked_in", r4.state);

  console.log("\nCasos de borda");
  const r5 = await checkIn(users.reception, {centerId, qr: qr(students.caio.checkinCode)});
  ok("aluno sem aula hoje → no_session", r5.state === "no_session", r5.state);
  await expectError(() => checkIn(users.reception, {centerId, qr: qr(students.duda.checkinCode)}),
    "FAILED_PRECONDITION", "aluno bloqueado → failed-precondition");
  const r6 = await checkIn(users.reception, {centerId, qr: qr(students.edu.checkinCode)});
  ok("reposição → checked_in com makeup", r6.state === "checked_in" && r6.makeup === true, JSON.stringify(r6));
  const r7 = await checkIn(users.reception, {centerId, qr: qr(students.ana.checkinCode, otherCenterId)});
  ok("QR de outro centro → wrong_center", r7.state === "wrong_center", r7.state);
  await expectError(() => checkIn(users.reception, {centerId, qr: "https://qualquer.coisa"}),
    "INVALID_ARGUMENT", "QR que não é carteirinha → invalid-argument");
  await expectError(() => checkIn(users.reception, {centerId, qr: qr("NAOEXISTE1")}),
    "NOT_FOUND", "código inexistente → not-found");

  console.log("\nProfessor");
  const r8 = await checkIn(users.otherCoach, {centerId, studentId: "ana", sessionId: "aoVivo"});
  ok("professor de outra aula não marca nesta → no_session", r8.state === "no_session", r8.state);
  const r9 = await checkIn(users.coach, {centerId, studentId: "ana"});
  ok("professor da aula vê already", r9.state === "already" && r9.sessionId === "aoVivo", JSON.stringify(r9));
} catch (e) {
  fail++;
  failures.push(`erro inesperado: ${e.message}`);
  console.error("\nERRO:", e);
} finally {
  console.log("\nLimpeza");
  const cleanupErrors = [];
  for (const cid of cleanup.centers) {
    try {
      await db.recursiveDelete(db.doc(`trainingCenters/${cid}`));
      console.log(`  apagado (recursivo): trainingCenters/${cid}`);
    } catch (e) {
      cleanupErrors.push(`trainingCenters/${cid}: ${e.message}`);
    }
  }
  for (const uid of cleanup.authUids) {
    try {
      await db.recursiveDelete(db.doc(`users/${uid}`));
    } catch (e) {
      cleanupErrors.push(`users/${uid}: ${e.message}`);
    }
  }
  if (cleanup.authUids.length) {
    try {
      const res = await auth.deleteUsers(cleanup.authUids);
      console.log(`  Auth: ${res.successCount} removidas, ${res.failureCount} falha(s).`);
      for (const err of res.errors) cleanupErrors.push(`auth uid ${cleanup.authUids[err.index]}: ${err.error.message}`);
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
