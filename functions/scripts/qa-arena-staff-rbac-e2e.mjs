// QA e2e da equipe de arena (RBAC) contra o dev (volley-track-dev-4596c).
//
// Mesmo protocolo do sibling `qa-friendly-match-e2e.mjs`: Auth REST + callables
// deployados + Firestore REST com o idToken de usuários reais — então as
// firestore.rules são exercitadas de verdade, não só as Cloud Functions.
//
// Diferença: parte do setup (criar a arena já com planTier pago, e a limpeza
// no final) não pode passar pelo client — as rules bloqueiam de propósito
// (`planTier`/`planStatus` só as Cloud Functions gravam). Para isso usamos
// firebase-admin com Application Default Credentials, no mesmo padrão dos
// outros scripts admin em functions/scripts/ (ex.: delete-users-qa-email.js).
//
// Uso (dentro de functions/):
//   node scripts/qa-arena-staff-rbac-e2e.mjs
//
// Pré-requisito: gcloud auth application-default login (ADC com acesso ao
// projeto de dev).

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

function todayKey() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Rastreamento de tudo que criamos, para limpar no final
// ---------------------------------------------------------------------------

const cleanup = {
  authUids: [],
  arenaIds: [],
  inviteIds: [],
  comandaIds: [],
  clubIds: [],
  walletArenaIds: [],
};
const cleanupErrors = [];

// =============================================================================
console.log(`== QA arena-staff RBAC e2e — projeto ${PID} — ts=${ts} ==`);
// =============================================================================

console.log("\n== Setup: usuários de teste ==");
const PW = `QaRbac!${ts}`;
const owner = await signUp(`qa.arenarbac.${ts}.owner@nexago.test`, PW);
const staffY = await signUp(`qa.arenarbac.${ts}.y@nexago.test`, PW);
const userZ = await signUp(`qa.arenarbac.${ts}.z@nexago.test`, PW);
const staffMan = await signUp(`qa.arenarbac.${ts}.man@nexago.test`, PW);
const staffG = await signUp(`qa.arenarbac.${ts}.gestor@nexago.test`, PW);
// staffX e staffX2 NASCEM SEM CONTA de propósito — as assertions [1] e [7]
// exigem que o convite seja enviado ANTES da conta existir. As contas só são
// criadas depois do respectivo convite pending (seções [1-3] e [7]).
const staffXEmail = `qa.arenarbac.${ts}.x@nexago.test`;
const staffX2Email = `qa.arenarbac.${ts}.x2@nexago.test`;
for (const u of [owner, staffY, userZ, staffMan, staffG]) {
  cleanup.authUids.push(u.uid);
}
console.log(`  owner=${owner.uid}  Y=${staffY.uid}  Z=${userZ.uid}`);
console.log(`  Man=${staffMan.uid}  G=${staffG.uid}`);
console.log(`  X(email)=${staffXEmail}  X2(email)=${staffX2Email}`);

console.log("\n== Setup: arenas (via Admin SDK — planTier pago não pode vir do client) ==");
const arenaMainRef = db.collection("arenas").doc();
const arenaMain = arenaMainRef.id; // elite, ativa — fluxo principal (sem fricção de assento)
await arenaMainRef.set({
  name: "QA RBAC Arena Principal",
  managerUserId: owner.uid,
  planTier: "elite",
  planStatus: "active",
});
cleanup.arenaIds.push(arenaMain);

const arenaNoPlanRef = db.collection("arenas").doc();
const arenaNoPlan = arenaNoPlanRef.id; // sem plano — gate de plano (assertion 14)
await arenaNoPlanRef.set({
  name: "QA RBAC Arena Sem Plano",
  managerUserId: owner.uid,
});
cleanup.arenaIds.push(arenaNoPlan);

const arenaSeatsRef = db.collection("arenas").doc();
const arenaSeats = arenaSeatsRef.id; // Pro (5 assentos) — teto de assentos (assertion 15)
await arenaSeatsRef.set({
  name: "QA RBAC Arena Pro (assentos)",
  managerUserId: owner.uid,
  planTier: "pro",
  planStatus: "active",
});
cleanup.arenaIds.push(arenaSeats);

const courtId = crypto.randomUUID();
await db.doc(`arenas/${arenaMain}/courts/${courtId}`).set({name: "Quadra QA RBAC"});
console.log(`  arenaMain=${arenaMain} (elite)  arenaNoPlan=${arenaNoPlan}  arenaSeats=${arenaSeats} (pro)`);

// =============================================================================
console.log("\n== [1-3] Convite (sem conta) → aceite → espelho ==");
// =============================================================================

const inv1 = await call("inviteArenaStaff", owner.token,
  {arenaId: arenaMain, email: staffXEmail, role: "recepcao"});
ok("[1] convite p/ e-mail sem conta volta pending com inviteId", // assertion 1
  inv1.status === "pending" && typeof inv1.inviteId === "string" && inv1.inviteId.length > 0,
  JSON.stringify(inv1));
if (inv1.inviteId) cleanup.inviteIds.push(inv1.inviteId);

// Só agora a conta de X passa a existir — depois do convite pendente.
const staffX = await signUp(staffXEmail, PW);
cleanup.authUids.push(staffX.uid);
console.log(`  X=${staffX.uid}`);

const acc1 = await call("acceptArenaStaffInvite", staffX.token, {inviteId: inv1.inviteId});
ok("[2] aceite do convite retorna a arena/cargo certos", // assertion 2
  acc1.arenaId === arenaMain && acc1.role === "recepcao", JSON.stringify(acc1));

const staffDocX = await fsGet(`arenas/${arenaMain}/staff/${staffX.uid}`, owner.token);
ok("[2] arenas/{id}/staff/{uid} existe com o cargo certo",
  staffDocX && !staffDocX.denied && fieldStr(staffDocX, "role") === "recepcao" &&
  fieldStr(staffDocX, "status") === "active", JSON.stringify(staffDocX));

const userDocX = await fsGet(`users/${staffX.uid}`, staffX.token);
ok("[2] users/{uid} ganhou a role 'arena' (gate de login do portal)",
  stringArrayOf(userDocX, "roles").includes("arena"), JSON.stringify(userDocX));

const mirror1 = await waitFor("espelho users/{uid}/arenaStaff/{arenaId} de X", async () => {
  const f = await fsGet(`users/${staffX.uid}/arenaStaff/${arenaMain}`, staffX.token);
  return f && !f.denied ? f : null;
});
ok("[3] espelho users/{uid}/arenaStaff/{arenaId} apareceu (trigger)", // assertion 3
  fieldStr(mirror1.value, "role") === "recepcao", JSON.stringify(mirror1.value));
console.log(`  ⏱ latência do espelho (trigger): ${mirror1.elapsedMs}ms`);

// =============================================================================
console.log("\n== [4] Convite para e-mail que já tem conta (caminho direto) ==");
// =============================================================================

const inv4 = await call("inviteArenaStaff", owner.token,
  {arenaId: arenaMain, email: staffY.email, role: "financeiro"});
ok("[4] convite p/ e-mail com conta volta active com inviteId null", // assertion 4
  inv4.status === "active" && inv4.inviteId === null, JSON.stringify(inv4));

const staffDocY = await fsGet(`arenas/${arenaMain}/staff/${staffY.uid}`, owner.token);
ok("[4] arenas/{id}/staff/{uid} de Y já existe imediatamente",
  staffDocY && !staffDocY.denied && fieldStr(staffDocY, "role") === "financeiro",
  JSON.stringify(staffDocY));

// =============================================================================
console.log("\n== [5] Aceitar convite estando já na equipe é rejeitado ==");
// =============================================================================
// Não há caminho público normal que deixe um convite "pending" sobrando para
// quem já é staff (o próprio inviteArenaStaff fecha convites antigos do
// e-mail antes de criar o vínculo direto). Semeamos via Admin SDK exatamente
// esse estado residual para exercitar a defesa em profundidade dentro de
// `acceptArenaStaffInvite` (bloco `alreadyStaffSnap.exists`).
const staleInviteRef = db.collection("arenaStaffInvites").doc();
await staleInviteRef.set({
  arenaId: arenaMain,
  arenaName: "QA RBAC Arena Principal",
  emailLower: staffX.email.toLowerCase(),
  role: "recepcao",
  status: "pending",
  invitedBy: owner.uid,
  acceptedBy: null,
  createdAt: FieldValue.serverTimestamp(),
  expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
});
cleanup.inviteIds.push(staleInviteRef.id);

await expectError(
  () => call("acceptArenaStaffInvite", staffX.token, {inviteId: staleInviteRef.id}),
  "ALREADY_EXISTS", "[5] aceitar convite já sendo membro é rejeitado"); // assertion 5

// =============================================================================
console.log("\n== [6] Aceitar convite endereçado a outro e-mail é rejeitado ==");
// =============================================================================

const inv6 = await call("inviteArenaStaff", owner.token,
  {arenaId: arenaMain, email: `qa.arenarbac.${ts}.w@nexago.test`, role: "recepcao"});
ok("[6-setup] convite para W (sem conta) criado", inv6.status === "pending" && !!inv6.inviteId);
if (inv6.inviteId) cleanup.inviteIds.push(inv6.inviteId);

await expectError(
  () => call("acceptArenaStaffInvite", userZ.token, {inviteId: inv6.inviteId}),
  "FAILED_PRECONDITION", "[6] Z tentando aceitar convite de W é rejeitado"); // assertion 6

// =============================================================================
console.log("\n== [7] Caminho do convite obsoleto (stale invite) ==");
// =============================================================================

const inv7 = await call("inviteArenaStaff", owner.token,
  {arenaId: arenaMain, email: staffX2Email, role: "recepcao"});
ok("[7-setup] convite inicial p/ X2 (sem conta) volta pending", inv7.status === "pending" && !!inv7.inviteId);
const inviteP7 = inv7.inviteId;
cleanup.inviteIds.push(inviteP7);

// Só agora a conta de X2 passa a existir — depois do convite pendente.
const staffX2 = await signUp(staffX2Email, PW);
cleanup.authUids.push(staffX2.uid);
console.log(`  X2=${staffX2.uid}`);

const inv7b = await call("inviteArenaStaff", owner.token,
  {arenaId: arenaMain, email: staffX2.email, role: "recepcao"});
ok("[7] reconvite após a conta existir toma o caminho direto",
  inv7b.status === "active" && inv7b.inviteId === null, JSON.stringify(inv7b));

const p7After = await fsGet(`arenaStaffInvites/${inviteP7}`, owner.token);
ok("[7] o convite antigo (P) não está mais pending",
  p7After && !p7After.denied && fieldStr(p7After, "status") !== "pending", JSON.stringify(p7After));

await expectError(
  () => call("acceptArenaStaffInvite", staffX2.token, {inviteId: inviteP7}),
  "FAILED_PRECONDITION", "[7] o inviteId antigo não pode mais ser aceito");

// =============================================================================
console.log("\n== [8-11] Cargo permissions (rules reais, token real) ==");
// =============================================================================

// Man = manutencao (via caminho direto, conta já existe)
const invMan = await call("inviteArenaStaff", owner.token,
  {arenaId: arenaMain, email: staffMan.email, role: "manutencao"});
ok("[8-setup] Man virou manutencao ativo", invMan.status === "active");

// G = gestor (via caminho direto)
const invG = await call("inviteArenaStaff", owner.token,
  {arenaId: arenaMain, email: staffG.email, role: "gestor"});
ok("[10-setup] G virou gestor ativo", invG.status === "active");

function comandaFields(uid, displayNumber) {
  const nowIso = new Date().toISOString();
  return {
    arenaId: S(arenaMain),
    displayNumber: I(displayNumber),
    type: S("individual"),
    status: S("open"),
    customerName: S("QA RBAC"),
    allowAppOrders: B(false),
    rentalCents: I(0),
    itemsTotalCents: I(0),
    totalCents: I(0),
    itemsCount: I(0),
    openedByUid: S(uid),
    openedAt: T(nowIso),
    createdAt: T(nowIso),
    updatedAt: T(nowIso),
  };
}
const comandaMask = ["arenaId", "displayNumber", "type", "status", "customerName",
  "allowAppOrders", "rentalCents", "itemsTotalCents", "totalCents", "itemsCount",
  "openedByUid", "openedAt", "createdAt", "updatedAt"];

const comandaIdX = crypto.randomUUID();
const wX = await fsWrite(`arenaComandas/${comandaIdX}`, comandaFields(staffX.uid, 1), comandaMask, staffX.token);
ok("[8] recepcao CRIA arenaComandas", wX.status >= 200 && wX.status < 300, `status=${wX.status} ${wX.body}`);
if (wX.ok) cleanup.comandaIds.push(comandaIdX);

const comandaIdMan = crypto.randomUUID();
const wMan = await fsWrite(`arenaComandas/${comandaIdMan}`, comandaFields(staffMan.uid, 2), comandaMask, staffMan.token);
ok("[8] manutencao NÃO consegue criar arenaComandas", wMan.status === 403, `status=${wMan.status} ${wMan.body}`);
if (wMan.ok) cleanup.comandaIds.push(comandaIdMan);

// arenaWallets só é escrito por Cloud Function; semeamos via Admin SDK só
// para existir e testar leitura por cargo.
await db.doc(`arenaWallets/${arenaMain}`).set({arenaId: arenaMain, balanceCents: 12345});
cleanup.walletArenaIds.push(arenaMain);

const walletAsX = await fsGet(`arenaWallets/${arenaMain}`, staffX.token);
ok("[9] recepcao NÃO lê arenaWallets", walletAsX?.denied === true, JSON.stringify(walletAsX));

const walletAsY = await fsGet(`arenaWallets/${arenaMain}`, staffY.token);
ok("[9] financeiro LÊ arenaWallets",
  walletAsY && !walletAsY.denied && walletAsY.balanceCents?.integerValue === "12345",
  JSON.stringify(walletAsY));

// [10] Ninguém além do dono escreve payoutPixKey — testado com o cargo mais
// privilegiado (gestor, único com acesso de escrita a 'perfil'): se nem ele
// consegue, nenhum cargo consegue.
const pixAsG = await fsWrite(`arenas/${arenaMain}`, {payoutPixKey: S("11999999999")}, ["payoutPixKey"], staffG.token);
ok("[10] gestor NÃO escreve payoutPixKey", pixAsG.status === 403, `status=${pixAsG.status} ${pixAsG.body}`);

const pixAsOwner = await fsWrite(`arenas/${arenaMain}`, {payoutPixKey: S("22999999999")}, ["payoutPixKey"], owner.token);
ok("[10] dono ESCREVE payoutPixKey", pixAsOwner.status >= 200 && pixAsOwner.status < 300,
  `status=${pixAsOwner.status} ${pixAsOwner.body}`);

// [11] Ninguém escreve arenas/{id}/staff/{uid} diretamente (write:false sempre).
const staffWriteAsG = await fsWrite(`arenas/${arenaMain}/staff/${staffG.uid}`, {role: S("gestor")}, ["role"], staffG.token);
ok("[11] gestor NÃO escreve o próprio doc de staff diretamente",
  staffWriteAsG.status === 403, `status=${staffWriteAsG.status} ${staffWriteAsG.body}`);

// =============================================================================
console.log("\n== [12-13] Callables convertidos (antes só aceitavam o dono) ==");
// =============================================================================

const coupons = await call("listArenaCoupons", staffY.token, {arenaId: arenaMain});
ok("[12] financeiro chama listArenaCoupons", Array.isArray(coupons.coupons), JSON.stringify(coupons));

const today = todayKey();
const occupancy = await call("getArenaOccupancyReport", staffY.token,
  {arenaId: arenaMain, dateFrom: today, dateTo: today});
ok("[12] financeiro chama getArenaOccupancyReport",
  occupancy != null && typeof occupancy === "object", JSON.stringify(occupancy));

const club = await call("upsertArenaClub", staffX.token, {
  arenaId: arenaMain,
  name: "Clubinho QA RBAC",
  weekday: null,
  startTime: "08:00",
  endTime: "09:00",
  courtIds: [courtId],
  capacity: 4,
  priceReais: 15,
  cancelWindowHours: 2,
});
ok("[13] recepcao chama upsertArenaClub (área 'agenda', escrita)",
  typeof club.clubId === "string", JSON.stringify(club));
if (club.clubId) cleanup.clubIds.push(club.clubId);

// =============================================================================
console.log("\n== [14] Gate de plano: arena sem plano pago ==");
// =============================================================================

await expectError(
  () => call("inviteArenaStaff", owner.token,
    {arenaId: arenaNoPlan, email: `qa.arenarbac.${ts}.noplan@nexago.test`, role: "recepcao"}),
  "FAILED_PRECONDITION", "[14] convite em arena sem plano é rejeitado");
try {
  await call("inviteArenaStaff", owner.token,
    {arenaId: arenaNoPlan, email: `qa.arenarbac.${ts}.noplan2@nexago.test`, role: "recepcao"});
  ok("[14] mensagem de erro fala do plano", false, "(não lançou erro)");
} catch (e) {
  ok("[14] mensagem de erro fala do plano", /plano/i.test(e.message), e.message);
}

// =============================================================================
console.log("\n== [15] Teto de 5 assentos (Pro): membros + convites pendentes ==");
// =============================================================================

let seatFailures = 0;
for (let i = 1; i <= 5; i++) {
  try {
    const r = await call("inviteArenaStaff", owner.token,
      {arenaId: arenaSeats, email: `qa.arenarbac.${ts}.seat${i}@nexago.test`, role: "recepcao"});
    if (r.inviteId) cleanup.inviteIds.push(r.inviteId);
    if (r.status !== "pending") seatFailures++;
  } catch (e) {
    seatFailures++;
    console.log(`    (falha inesperada no convite ${i}: ${e.code} ${e.message})`);
  }
}
ok("[15] 5 convites cabem no teto do plano Pro", seatFailures === 0, `falhas=${seatFailures}`);

await expectError(
  () => call("inviteArenaStaff", owner.token,
    {arenaId: arenaSeats, email: `qa.arenarbac.${ts}.seat6@nexago.test`, role: "recepcao"}),
  "FAILED_PRECONDITION", "[15] 6º convite estoura o teto de 5 assentos");

// =============================================================================
console.log("\n== [16] Revogação: acesso cai na hora, espelho some (trigger) ==");
// =============================================================================

await call("removeArenaStaff", owner.token, {arenaId: arenaMain, staffUserId: staffX.uid});

const comandaIdXAfter = crypto.randomUUID();
const wXAfter = await fsWrite(`arenaComandas/${comandaIdXAfter}`, comandaFields(staffX.uid, 3), comandaMask, staffX.token);
ok("[16] X removido NÃO consegue mais escrever (comandas)", wXAfter.status === 403,
  `status=${wXAfter.status} ${wXAfter.body}`);
if (wXAfter.ok) cleanup.comandaIds.push(comandaIdXAfter);

const mirrorGone = await waitFor("espelho de X sumir após revogação", async () => {
  const f = await fsGet(`users/${staffX.uid}/arenaStaff/${arenaMain}`, staffX.token);
  return f === null ? true : null;
});
ok("[16] espelho users/{uid}/arenaStaff/{arenaId} sumiu (trigger)", mirrorGone.value === true);
console.log(`  ⏱ latência da remoção do espelho (trigger): ${mirrorGone.elapsedMs}ms`);

// =============================================================================
console.log(`\n== RESULTADO: ${pass} ok, ${fail} falha(s) ==`);
if (failures.length) console.log("Falhas:", failures.join(" | "));

// =============================================================================
console.log("\n== Limpeza ==");
// =============================================================================

for (const id of cleanup.comandaIds) {
  try {
    await db.doc(`arenaComandas/${id}`).delete();
    console.log(`  apagado: arenaComandas/${id}`);
  } catch (e) {
    cleanupErrors.push(`arenaComandas/${id}: ${e.message}`);
  }
}
for (const id of cleanup.clubIds) {
  try {
    await db.doc(`arenaClubs/${id}`).delete();
    console.log(`  apagado: arenaClubs/${id}`);
  } catch (e) {
    cleanupErrors.push(`arenaClubs/${id}: ${e.message}`);
  }
}
for (const arenaId of cleanup.walletArenaIds) {
  try {
    await db.doc(`arenaWallets/${arenaId}`).delete();
    console.log(`  apagado: arenaWallets/${arenaId}`);
  } catch (e) {
    cleanupErrors.push(`arenaWallets/${arenaId}: ${e.message}`);
  }
}
for (const id of cleanup.inviteIds) {
  try {
    await db.doc(`arenaStaffInvites/${id}`).delete();
    console.log(`  apagado: arenaStaffInvites/${id}`);
  } catch (e) {
    cleanupErrors.push(`arenaStaffInvites/${id}: ${e.message}`);
  }
}
for (const arenaId of cleanup.arenaIds) {
  try {
    await db.recursiveDelete(db.doc(`arenas/${arenaId}`));
    console.log(`  apagado (recursivo): arenas/${arenaId}`);
  } catch (e) {
    cleanupErrors.push(`arenas/${arenaId}: ${e.message}`);
  }
}
try {
  const res = await auth.deleteUsers(cleanup.authUids);
  console.log(`  Auth: ${res.successCount} removidas, ${res.failureCount} falha(s).`);
  for (const err of res.errors) {
    cleanupErrors.push(`auth uid ${cleanup.authUids[err.index]}: ${err.error.message}`);
  }
} catch (e) {
  cleanupErrors.push(`auth.deleteUsers: ${e.message}`);
}

if (cleanupErrors.length) {
  console.log("\nFalhas na limpeza:");
  for (const e of cleanupErrors) console.log(`  - ${e}`);
} else {
  console.log("\nLimpeza concluída sem falhas.");
}

console.log(`\n== FIM: ${pass} ok, ${fail} falha(s), ${cleanupErrors.length} falha(s) de limpeza ==`);
process.exit(fail === 0 ? 0 : 1);
