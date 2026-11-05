/* eslint-disable */
/**
 * SOMENTE LEITURA. Exporta as 5 melhores duplas, masculino e feminino, do
 * RANKING GERAL de um esporte (teamRankingsBySport, ordenado por totalPoints,
 * mesma lógica da tela de ranking do app), com nome, foto e @ do Instagram
 * (quando o perfil tiver), e baixa as fotos. Usado pelo marketing no carrossel
 * de collab.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *
 * Uso (na pasta functions/):
 *   node scripts/export-ranking-top5.js                    # vôlei de praia
 *   node scripts/export-ranking-top5.js --sport FUTEVOLEI   # outro esporte (profileCode)
 *   node scripts/export-ranking-top5.js --year 2026         # só pontos da temporada
 *
 * Saída: ../marketing/ranking-top5/ranking.json + fotos/<uid>.<ext>
 */
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
const projectId = arg("--project") || "volley-track-dev-4596c";
const TOP = parseInt(arg("--top") || "5", 10);
const SPORT = arg("--sport") || "VOLEI_PRAIA";
const YEAR = arg("--year");
const OUT = path.resolve(__dirname, "../../marketing/ranking-top5");

admin.initializeApp({projectId});
const db = admin.firestore();
const base = `artifacts/${projectId}/public/data`;
const s = (v) => (typeof v === "string" ? v.trim() : "");
const num = (v) => (typeof v === "number" ? v : 0);

function genderOf(raw) {
  const n = s(raw).toLowerCase();
  if (n.startsWith("masc") || n === "m" || n === "male") return "Masculino";
  if (n.startsWith("fem") || n === "f" || n === "female") return "Feminino";
  if (n.startsWith("mix") || n === "misto" || n === "x") return "Misto";
  return "?";
}

async function athlete(uid) {
  const [pub, priv] = await Promise.all([db.doc(`public_profiles/${uid}`).get(), db.doc(`users/${uid}`).get()]);
  const p = pub.exists ? pub.data() : {};
  const u = priv.exists ? priv.data() : {};
  const name = s(p.nickname) || s(p.name) || s(p.fullName) || s(u.nickname) || s(u.name) || s(u.fullName) || "Atleta";
  const photo = s(p.profilePhotoUrl) || s(p.avatarUrl) || s(p.photoURL) || s(u.profilePhotoUrl) || s(u.avatarUrl) || s(u.photoURL);
  const social = u.socialLinks || u.socials || {};
  const ig = (s(u.instagram) || s(u.instagramHandle) || s(social.instagram) || s(p.instagram)).replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
  return {uid, name, fullName: s(p.fullName) || s(u.fullName) || name, photoUrl: photo || null, instagram: ig || null};
}

async function download(url, uid) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const type = r.headers.get("content-type") || "";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const file = path.join(OUT, "fotos", `${uid}.${ext}`);
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    return `fotos/${uid}.${ext}`;
  } catch (e) { return null; }
}

(async () => {
  const snap = await db.collection(`${base}/teamRankingsBySport`).where("sport", "==", SPORT).get();
  const pointsOf = (x) => (YEAR ? num((x.pointsByYear || {})[YEAR]) : num(x.totalPoints));
  const entries = snap.docs.map((d) => d.data()).filter((x) => s(x.teamId) && pointsOf(x) > 0)
    .sort((a, b) => pointsOf(b) - pointsOf(a));
  console.log(`Projeto ${projectId} · ${SPORT}${YEAR ? " · " + YEAR : " · geral"}: ${entries.length} equipes com pontos`);
  fs.mkdirSync(path.join(OUT, "fotos"), {recursive: true});

  const buckets = {Masculino: [], Feminino: []};
  for (const e of entries) {
    if (buckets.Masculino.length >= TOP && buckets.Feminino.length >= TOP) break;
    const t = await db.doc(`${base}/teams/${e.teamId}`).get();
    const td = t.exists ? t.data() : {};
    const uids = Array.isArray(td.memberUids) && td.memberUids.length ? td.memberUids : [td.player1Id, td.player2Id].filter(Boolean);
    const isDupla = (td.teamSize == null || td.teamSize === 2) && uids.length <= 2;
    const g = genderOf(td.gender);
    if (!isDupla || !buckets[g] || buckets[g].length >= TOP) continue;
    const athletes = [];
    for (const uid of uids) {
      const a = await athlete(uid);
      a.photoFile = a.photoUrl ? await download(a.photoUrl, uid) : null;
      athletes.push(a);
    }
    buckets[g].push({position: buckets[g].length + 1, teamId: e.teamId, teamName: s(td.name) || null, points: pointsOf(e), tournaments: num(e.tournamentsCount), athletes});
  }

  const result = {projectId, sport: SPORT, period: YEAR || "geral", leagueName: "Ranking geral nexaGO · Vôlei de praia", exportedAt: new Date().toISOString(), categories: []};
  for (const [g, teams] of Object.entries(buckets)) {
    result.categories.push({categoryId: g, name: g, gender: g, teams});
    console.log(`\n${g}`);
    if (!teams.length) console.log("  (nenhuma dupla com gênero definido)");
    teams.forEach((t) => console.log(`  ${t.position}. ${t.athletes.map((a) => a.name).join(" / ")} — ${t.points} pts — fotos: ${t.athletes.filter((a) => a.photoFile).length}/${t.athletes.length} — ig: ${t.athletes.map((a) => a.instagram || "-").join(", ")}`));
  }
  fs.writeFileSync(path.join(OUT, "ranking.json"), JSON.stringify(result, null, 2));
  console.log(`\nSalvo em ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
