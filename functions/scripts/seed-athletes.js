/* eslint-disable */
/**
 * Seed de atletas de teste: cria contas no Auth + perfil completo em users/{uid}.
 *
 * Gera COUNT atletas por (nível × gênero). Níveis: iniciante, intermediario,
 * open. Gêneros: Masculino, Feminino. Padrão: 32 por combinação (= 192).
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login      # ADC
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-athletes.js --project volley-track-dev-4596c
 *   COUNT=10 node scripts/seed-athletes.js --project <projectId>
 *
 * Idempotente: se o e-mail já existe no Auth, reaproveita o uid e só atualiza o perfil.
 */

const admin = require("firebase-admin");

// ── args/env ────────────────────────────────────────────────────────────────
function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

const COUNT = parseInt(process.env.COUNT || "32", 10);
const PASSWORD = process.env.SEED_PASSWORD || "Senha123!";
const CITY = process.env.SEED_CITY || "Goiânia";
const STATE = process.env.SEED_STATE || "GO";
const SPORT_LABEL = "Vôlei de praia";
const PRIMARY_SPORT = "VOLEI_PRAIA";

admin.initializeApp({projectId});
const auth = admin.auth();
const db = admin.firestore();

const LEVELS = [
  {code: "iniciante", label: "Iniciante"},
  {code: "intermediario", label: "Intermediário"},
  {code: "open", label: "Open"},
];
const GENDERS = [
  {label: "Masculino", short: "m"},
  {label: "Feminino", short: "f"},
];

// Prefixos de busca (espelha o comportamento de keywords do app).
function generateKeywords(sources) {
  const set = new Set();
  for (const raw of sources) {
    const norm = String(raw || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    if (!norm) continue;
    for (const word of norm.split(/\s+/)) {
      for (let i = 1; i <= word.length && i <= 20; i++) {
        set.add(word.slice(0, i));
      }
    }
  }
  return [...set].sort().slice(0, 200);
}

function birthDateForLevel(idx) {
  // Adultos por padrão (varia o dia/ano só para ter dados distintos).
  const year = 1990 + (idx % 12); // 1990..2001
  const month = String((idx % 12) + 1).padStart(2, "0");
  const day = String((idx % 27) + 1).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function phoneFor(seq) {
  // 62 + 9 + 8 dígitos = 11 dígitos (WhatsApp válido).
  return `629${String(seq).padStart(8, "0")}`;
}

async function ensureAuthUser(email, displayName) {
  let uid;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
  } catch (e) {
    const created = await auth.createUser({
      email,
      password: PASSWORD,
      displayName,
      emailVerified: true,
    });
    uid = created.uid;
  }
  await auth.setCustomUserClaims(uid, {role: "athlete", roles: ["athlete"]});
  return uid;
}

async function seed() {
  let total = 0;
  let seq = 1;
  for (const level of LEVELS) {
    for (const gender of GENDERS) {
      for (let n = 1; n <= COUNT; n++) {
        const nn = String(n).padStart(2, "0");
        const fullName = `Atleta ${level.label} ${gender.label} ${nn}`;
        const email = `seed-${level.code}-${gender.short}-${nn}@nexago.test`;
        const phone = phoneFor(seq);
        const birthDate = birthDateForLevel(n);

        const uid = await ensureAuthUser(email, fullName);

        const profile = {
          fullName,
          email,
          gender: gender.label,
          role: "athlete",
          roles: ["athlete"],
          hasAthleteRole: true,
          phoneNumber: phone,
          birthDate,
          city: CITY,
          state: STATE,
          isProfileComplete: true,
          onboardingCompleted: true,
          sport: SPORT_LABEL,
          level: level.label,
          sportProfile: {level: level.code},
          sports: [],
          primarySportFirestoreId: PRIMARY_SPORT,
          secondarySportFirestoreIds: [],
          levelsBySportFirestore: {[PRIMARY_SPORT]: level.code},
          sportOnboarding: {
            version: 1,
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            primarySportId: PRIMARY_SPORT,
            secondarySportIds: [],
            levelsBySport: {[PRIMARY_SPORT]: level.code},
            goals: ["COMPETIR"],
          },
          keywords: generateKeywords([fullName, CITY]),
          seedTestAthlete: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await db.doc(`users/${uid}`).set(profile, {merge: true});
        total += 1;
        seq += 1;
        if (total % 20 === 0) console.log(`  ... ${total} atletas`);
      }
    }
  }
  console.log(`OK: ${total} atletas criados/atualizados em ${projectId}.`);
  console.log(`Login: e-mails seed-<nivel>-<m|f>-NN@nexago.test / senha ${PASSWORD}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha no seed:", err);
    process.exit(1);
  });
