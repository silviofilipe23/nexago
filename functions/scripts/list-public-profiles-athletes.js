/* eslint-disable */
/**
 * Lista todos os docs em `public_profiles` com `hasAthleteRole == true`.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/list-public-profiles-athletes.js --project volley-track-dev-4596c
 *   node scripts/list-public-profiles-athletes.js --project <id> --csv
 *   node scripts/list-public-profiles-athletes.js --project <id> --out atletas.csv
 *   node scripts/list-public-profiles-athletes.js --project <id> --count
 *   node scripts/list-public-profiles-athletes.js --project <id> --city Goiânia
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const CSV = process.argv.includes("--csv");
const COUNT_ONLY = process.argv.includes("--count");
const CITY_FILTER = (argValue("--city") || "").trim().toLowerCase();
const OUT = argValue("--out");
const PAGE_SIZE = parseInt(argValue("--page-size") || "500", 10);

const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

function displayName(data) {
  const nickname = typeof data.nickname === "string" ? data.nickname.trim() : "";
  const fullName = typeof data.fullName === "string" ? data.fullName.trim() : "";
  const name = typeof data.name === "string" ? data.name.trim() : "";
  return nickname || fullName || name || "—";
}

function primarySport(data) {
  const onboarding = data.sportOnboarding;
  if (onboarding && typeof onboarding === "object" && onboarding.primarySportId) {
    return String(onboarding.primarySportId);
  }
  if (typeof data.primarySport === "string" && data.primarySport.trim()) {
    return data.primarySport.trim();
  }
  if (typeof data.sport === "string" && data.sport.trim()) {
    return data.sport.trim();
  }
  return "";
}

function discoverSports(data) {
  if (!Array.isArray(data.discoverSportIds)) return "";
  return data.discoverSportIds.filter((s) => typeof s === "string").join("|");
}

function isDiscoverable(data) {
  const prefs = data.privacyPreferences;
  if (prefs && typeof prefs === "object") {
    if (prefs.publicProfileEnabled === false) return false;
    if (prefs.profileVisibility === "private") return false;
  }
  if (data.publicProfileEnabled === false) return false;
  return true;
}

/**
 * @typedef {{
 *   uid: string,
 *   displayName: string,
 *   city: string,
 *   state: string,
 *   primarySport: string,
 *   discoverSportIds: string,
 *   level: string,
 *   discoverable: boolean,
 * }} Row
 */

async function fetchAllAthleteProfiles() {
  /** @type {Row[]} */
  const rows = [];
  let lastId = null;

  while (true) {
    let query = db
      .collection("public_profiles")
      .where("hasAthleteRole", "==", true)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (lastId) query = query.startAfter(lastId);

    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const data = doc.data();
      const city = typeof data.city === "string" ? data.city.trim() : "";
      if (CITY_FILTER && city.toLowerCase() !== CITY_FILTER) continue;

      rows.push({
        uid: doc.id,
        displayName: displayName(data),
        city,
        state: typeof data.state === "string" ? data.state.trim() : "",
        primarySport: primarySport(data),
        discoverSportIds: discoverSports(data),
        level:
          (typeof data.level === "string" && data.level.trim()) ||
          (typeof data.nivel === "string" && data.nivel.trim()) ||
          "",
        discoverable: isDiscoverable(data),
      });
    }

    lastId = snap.docs[snap.docs.length - 1].id;
    if (snap.size < PAGE_SIZE) break;
  }

  rows.sort((a, b) => a.displayName.localeCompare(b.displayName, "pt", {sensitivity: "base"}));
  return rows;
}

function formatRows(rows) {
  if (CSV) {
    const header =
      "uid,displayName,city,state,primarySport,discoverSportIds,level,discoverable";
    const lines = rows.map((r) =>
      [
        r.uid,
        r.displayName,
        r.city,
        r.state,
        r.primarySport,
        r.discoverSportIds,
        r.level,
        r.discoverable ? "true" : "false",
      ]
        .map((v) => JSON.stringify(String(v)))
        .join(","),
    );
    return [header, ...lines].join("\n") + "\n";
  }
  return (
    rows.map((r) => `${r.uid}\t${r.displayName}\t${r.city || "—"}\t${r.primarySport || "—"}`).join("\n") +
    (rows.length ? "\n" : "")
  );
}

async function run() {
  console.error(`Projeto: ${projectId}`);
  if (CITY_FILTER) console.error(`Filtro cidade: ${CITY_FILTER}`);

  const rows = await fetchAllAthleteProfiles();
  const discoverable = rows.filter((r) => r.discoverable).length;

  console.error(`Total hasAthleteRole=true: ${rows.length}`);
  console.error(`Discoverable (não privado): ${discoverable}`);

  if (COUNT_ONLY) return;

  const body = formatRows(rows);
  if (OUT) {
    const outPath = path.resolve(OUT);
    fs.writeFileSync(outPath, body, "utf8");
    console.error(`Salvo em: ${outPath}`);
  } else {
    process.stdout.write(body);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha ao listar public_profiles:", err);
    process.exit(1);
  });
