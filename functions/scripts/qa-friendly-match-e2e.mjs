// QA e2e do Bora Jogar contra o dev (volley-track-dev-4596c).
// Usa o protocolo real do app: Auth REST + callables + Firestore REST com
// o idToken dos usuários (portanto valida as rules também).

const API_KEY = "AIzaSyAXrftckloRsU_EKOA_oMgI-9BJdV4kIQs"; // web key do dev (pública)
const PID = "volley-track-dev-4596c";
const FN = `https://us-central1-${PID}.cloudfunctions.net`;
const FS = `https://firestore.googleapis.com/v1/projects/${PID}/databases/(default)/documents`;

const MIN = 60_000;
const ts = Date.now();
let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ✖ ${name} ${detail}`); }
}

async function signUp(email, password, displayName) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email, password, returnSecureToken: true, displayName}),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`signUp ${email}: ${JSON.stringify(j.error)}`);
  return {uid: j.localId, token: j.idToken};
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
    throw e;
  }
  return j.result;
}

async function expectError(promiseFn, codeSub, label) {
  try { await promiseFn(); ok(label, false, "(não lançou erro)"); }
  catch (e) { ok(label, String(e.code).includes(codeSub), `(veio ${e.code}: ${e.message})`); }
}

async function fsPatch(path, fields, token, mask) {
  const url = new URL(`${FS}/${path}`);
  for (const m of mask) url.searchParams.append("updateMask.fieldPaths", m);
  const r = await fetch(url, {
    method: "PATCH",
    headers: {"Content-Type": "application/json", Authorization: `Bearer ${token}`},
    body: JSON.stringify({fields}),
  });
  if (!r.ok) throw new Error(`PATCH ${path}: ${r.status} ${await r.text()}`);
}

async function fsGet(path, token) {
  const r = await fetch(`${FS}/${path}`, {headers: {Authorization: `Bearer ${token}`}});
  if (r.status === 403) return {denied: true};
  if (r.status === 404) return null;
  const j = await r.json();
  return j.fields ?? {};
}

const S = (v) => ({stringValue: v});
const B = (v) => ({booleanValue: v});
const M = (f) => ({mapValue: {fields: f}});

function fieldStr(fields, name) { return fields?.[name]?.stringValue; }

async function waitFor(label, fn, tries = 20, delayMs = 3000) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((res) => setTimeout(res, delayMs));
  }
  throw new Error(`timeout esperando: ${label}`);
}

// ---------------------------------------------------------------------------

console.log("== Setup: criando atletas de teste ==");
const A = await signUp(`qa.bora.${ts}.a@nexago.test`, `QaBora!${ts}`, "QA Bora Ana");
const Bu = await signUp(`qa.bora.${ts}.b@nexago.test`, `QaBora!${ts}`, "QA Bora Bia");
console.log(`  A=${A.uid}  B=${Bu.uid}`);

const profileFields = (name, looking) => ({
  fullName: S(name),
  role: S("athlete"),
  city: S("Vitória"),
  state: S("ES"),
  gender: S("feminino"),
  lookingForPartner: B(looking),
  sportOnboarding: M({levelsBySport: M({VOLEI_PRAIA: S("intermediario_1")})}),
});
await fsPatch(`users/${A.uid}`, profileFields("QA Bora Ana", false), A.token,
  ["fullName", "role", "city", "state", "gender", "lookingForPartner", "sportOnboarding"]);
await fsPatch(`users/${Bu.uid}`, profileFields("QA Bora Bia", true), Bu.token,
  ["fullName", "role", "city", "state", "gender", "lookingForPartner", "sportOnboarding"]);

console.log("== Espelho public_profiles (trigger) ==");
await waitFor("public_profiles de B", async () => {
  const f = await fsGet(`public_profiles/${Bu.uid}`, A.token);
  return f && !f.denied && fieldStr(f, "fullName") ? f : null;
});
ok("espelho public_profiles criado pelo trigger", true);

console.log("== Config ==");
const cfg = await fsGet("appConfig/friendlyMatch", A.token);
ok("appConfig/friendlyMatch legível e enabled=true",
  cfg?.enabled?.booleanValue === true, JSON.stringify(cfg));

console.log("== M1: convite → contraproposta → aceite ==");
const m1Main = ts + 31 * MIN;
const m1 = await call("sendFriendlyMatchInvite", A.token, {
  toUid: Bu.uid, sport: "VOLEI_PRAIA", objective: "friendly",
  scheduledAtMs: m1Main, location: {freeText: "Praia de Camburi — QA"},
  message: "QA e2e do Bora Jogar",
});
ok("convite enviado", typeof m1.matchId === "string");

let doc = await fsGet(`friendlyMatches/${m1.matchId}`, Bu.token);
ok("destinatário lê o convite (rules)", fieldStr(doc, "status") === "sent");
ok("score congelado no envio", doc?.scoreAtSend?.integerValue != null);

await expectError(
  () => call("sendFriendlyMatchInvite", A.token, {
    toUid: Bu.uid, sport: "VOLEI_PRAIA", objective: "training",
    scheduledAtMs: ts + 60 * MIN, location: {freeText: "x"},
  }), "FAILED_PRECONDITION", "convite duplicado no par é bloqueado");
await expectError(
  () => call("sendFriendlyMatchInvite", Bu.token, {
    toUid: A.uid, sport: "VOLEI_PRAIA", objective: "training",
    scheduledAtMs: ts + 60 * MIN, location: {freeText: "x"},
  }), "FAILED_PRECONDITION", "direção inversa também bloqueada");
await expectError(
  () => call("acceptFriendlyMatchInvite", A.token, {matchId: m1.matchId}),
  "PERMISSION_DENIED", "remetente não aceita o próprio convite");

const m1Counter = Date.now() + 32 * MIN;
await call("counterFriendlyMatchInvite", Bu.token,
  {matchId: m1.matchId, scheduledAtMs: m1Counter, message: "Mais tarde?"});
doc = await fsGet(`friendlyMatches/${m1.matchId}`, A.token);
ok("contraproposta registrada", fieldStr(doc, "status") === "countered");

await expectError(
  () => call("counterFriendlyMatchInvite", A.token,
    {matchId: m1.matchId, scheduledAtMs: Date.now() + 90 * MIN}),
  "FAILED_PRECONDITION", "só uma rodada de contraproposta");

await call("acceptFriendlyMatchInvite", A.token, {matchId: m1.matchId});
doc = await fsGet(`friendlyMatches/${m1.matchId}`, A.token);
ok("remetente aceitou a contraproposta → confirmed", fieldStr(doc, "status") === "confirmed");

console.log("== M2: recusa ==");
const m2 = await call("sendFriendlyMatchInvite", Bu.token, {
  toUid: A.uid, sport: "VOLEI_PRAIA", objective: "training",
  scheduledAtMs: Date.now() + 45 * MIN, location: {freeText: "Quadra QA 2"},
});
await expectError(
  () => call("declineFriendlyMatchInvite", Bu.token, {matchId: m2.matchId}),
  "PERMISSION_DENIED", "remetente não recusa o próprio convite");
await call("declineFriendlyMatchInvite", A.token, {matchId: m2.matchId, reason: "QA"});
doc = await fsGet(`friendlyMatches/${m2.matchId}`, Bu.token);
ok("recusa aplicada", fieldStr(doc, "status") === "declined");

console.log("== M3: cancelamento tardio penaliza ==");
const m3 = await call("sendFriendlyMatchInvite", A.token, {
  toUid: Bu.uid, sport: "VOLEI_PRAIA", objective: "friendly",
  scheduledAtMs: Date.now() + 40 * MIN, location: {freeText: "Quadra QA 3"},
});
await expectError(
  () => call("acceptFriendlyMatchInvite", Bu.token,
    {matchId: m3.matchId, chosenTimeMs: Date.now() + 999 * MIN}),
  "INVALID_ARGUMENT", "horário fora da proposta é rejeitado");
await call("acceptFriendlyMatchInvite", Bu.token, {matchId: m3.matchId});
await call("cancelFriendlyMatch", A.token, {matchId: m3.matchId});
doc = await fsGet(`friendlyMatches/${m3.matchId}`, A.token);
ok("cancelamento <6h marca cancelPenalized",
  fieldStr(doc, "status") === "cancelled" && doc?.cancelPenalized?.booleanValue === true);
const repA1 = await waitFor("late_cancel na reputação de A", async () => {
  const f = await fsGet(`users/${A.uid}/reputation/summary`, A.token);
  return f && f.lateCancellations?.integerValue === "1" ? f : null;
});
ok("evento late_cancel aplicado (score 95)", repA1?.score?.integerValue === "95");

console.log("== Rules negativas ==");
const priv = await fsGet(
  `friendlyMatches/${m1.matchId}/privateReviews/${A.uid}`, A.token);
ok("privateReviews ilegível até para o autor", priv?.denied === true);

const rq = await fetch(`${FS.replace("/documents", "")}/documents:runQuery`, {
  method: "POST",
  headers: {"Content-Type": "application/json", Authorization: `Bearer ${A.token}`},
  body: JSON.stringify({structuredQuery: {
    from: [{collectionId: "friendlyMatches"}],
    where: {fieldFilter: {field: {fieldPath: "status"}, op: "EQUAL",
      value: {stringValue: "confirmed"}}},
    limit: 5,
  }}),
});
const rqBody = await rq.text();
ok("query sem constraint do próprio uid é negada",
  rq.status === 403 || rqBody.includes("PERMISSION_DENIED"), `status=${rq.status}`);

console.log("== M1: check-in mútuo (aguardando janela abrir) ==");
doc = await fsGet(`friendlyMatches/${m1.matchId}`, A.token);
const openAt = new Date(doc.checkInOpenAt.timestampValue).getTime();
const waitMs = Math.max(0, openAt - Date.now() + 2000);
console.log(`  janela abre em ${(waitMs / 1000).toFixed(0)}s…`);
await expectError(
  () => call("checkInFriendlyMatch", A.token, {matchId: m1.matchId}),
  "FAILED_PRECONDITION", "check-in antes da janela é rejeitado");
await new Promise((r) => setTimeout(r, waitMs));

const c1 = await call("checkInFriendlyMatch", A.token, {matchId: m1.matchId});
ok("1º check-in não completa o jogo", c1.completed === false);
const c2 = await call("checkInFriendlyMatch", Bu.token, {matchId: m1.matchId});
ok("2º check-in completa o jogo", c2.completed === true);
doc = await fsGet(`friendlyMatches/${m1.matchId}`, A.token);
ok("status completed com reviewRevealAt",
  fieldStr(doc, "status") === "completed" && doc.reviewRevealAt != null);

console.log("== M1: avaliação double-blind ==");
const r1 = await call("submitFriendlyMatchReview", A.token,
  {matchId: m1.matchId, stars: 4, tags: ["pontual"], comment: "QA nota de A"});
ok("1ª avaliação não revela", r1.revealed === false);
doc = await fsGet(`friendlyMatches/${m1.matchId}`, Bu.token);
ok("nota de A invisível para B antes do reveal", doc.reviews == null);
await expectError(
  () => call("submitFriendlyMatchReview", A.token, {matchId: m1.matchId, stars: 5}),
  "FAILED_PRECONDITION", "avaliação dupla rejeitada");
const r2 = await call("submitFriendlyMatchReview", Bu.token,
  {matchId: m1.matchId, stars: 5, comment: "QA nota de B"});
ok("2ª avaliação dispara o reveal", r2.revealed === true);
doc = await fsGet(`friendlyMatches/${m1.matchId}`, A.token);
ok("match reviewed com as duas notas",
  fieldStr(doc, "status") === "reviewed" &&
  doc.reviews?.mapValue?.fields?.[A.uid] != null &&
  doc.reviews?.mapValue?.fields?.[Bu.uid] != null);

console.log("== Reputação final ==");
const repA = await waitFor("reputação final de A", async () => {
  const f = await fsGet(`users/${A.uid}/reputation/summary`, A.token);
  return f && f.gamesCompleted?.integerValue === "1" && f.ratingCount?.integerValue === "1" ? f : null;
});
// A: -5 (late_cancel) +10 (média 5) → 100 (teto). B: média 4 → 100.
ok("summary de A consistente (score 100 no teto: -5 +10)",
  repA.score?.integerValue === "100", JSON.stringify(repA));
const pubB = await waitFor("reputação de B espelhada em public_profiles", async () => {
  const f = await fsGet(`public_profiles/${Bu.uid}`, A.token);
  return f?.reputation?.mapValue?.fields?.score ? f.reputation.mapValue.fields : null;
});
ok("espelho público da reputação de B (score 100, 1 jogo)",
  pubB.score?.integerValue === "100" && pubB.gamesCompleted?.integerValue === "1",
  JSON.stringify(pubB));

console.log(`\n== RESULTADO: ${pass} ok, ${fail} falhas ==`);
if (failures.length) console.log("Falhas:", failures.join(" | "));
process.exit(fail === 0 ? 0 : 1);
