/* eslint-disable */
/**
 * Lógica compartilhada do seed de atletas de teste.
 *
 * Separada de `seed-athletes.js` para que o orquestrador
 * (`seed-test-data.js`) possa rodar o seed de atletas e o de torneio no
 * mesmo processo. A lib recebe `db`/`auth` prontos e nunca encerra o processo.
 */

const admin = require("firebase-admin");

const LEVELS = [
  {code: "iniciante_1", label: "Iniciante 1"},
  {code: "iniciante_2", label: "Iniciante 2"},
  {code: "intermediario_1", label: "Intermediário 1"},
  {code: "intermediario_2", label: "Intermediário 2"},
  {code: "open", label: "Open"},
];
const GENDERS = [
  {type: "male", label: "Masculino", short: "m"},
  {type: "female", label: "Feminino", short: "f"},
];

const SPORT_LABEL = "Vôlei de praia";
const PRIMARY_SPORT = "VOLEI_PRAIA";

/** Prefixos de busca (espelha o comportamento de keywords do app). */
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

/** Lista de recorte -> Set; ausente ou vazia vira `null` (sem recorte). */
function toFilterSet(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return new Set(values);
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

async function ensureAuthUser(auth, email, displayName, password) {
  let uid;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
  } catch (e) {
    const created = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: true,
    });
    uid = created.uid;
  }
  await auth.setCustomUserClaims(uid, {role: "athlete", roles: ["athlete"]});
  return uid;
}

/**
 * Cria/atualiza `count` atletas por (nível × gênero). Idempotente: se o
 * e-mail já existe no Auth, reaproveita o uid e só atualiza o perfil.
 *
 * `levels` (códigos de `LEVELS`) e `genders` (tipos de `GENDERS`) recortam
 * quais combinações são criadas; ausentes, valem todas — o comportamento
 * original. O telefone passou a sair da POSIÇÃO da combinação na ordem
 * `LEVELS × GENDERS` em vez de um contador do laço: assim o mesmo e-mail
 * conserva, sob recorte, o telefone que teria numa rodada completa.
 */
async function seedAthletes({
  db,
  auth,
  count = 32,
  password = "Senha123!",
  city = "Goiânia",
  state = "GO",
  log = console.log,
  levels,
  genders,
}) {
  const levelFilter = toFilterSet(levels);
  const genderFilter = toFilterSet(genders);
  let total = 0;
  for (const [levelIdx, level] of LEVELS.entries()) {
    if (levelFilter && !levelFilter.has(level.code)) continue;
    for (const [genderIdx, gender] of GENDERS.entries()) {
      if (genderFilter && !genderFilter.has(gender.type)) continue;
      const baseSeq = (levelIdx * GENDERS.length + genderIdx) * count;
      for (let n = 1; n <= count; n++) {
        const nn = String(n).padStart(2, "0");
        const fullName = `Atleta ${level.label} ${gender.label} ${nn}`;
        const email = `seed-${level.code}-${gender.short}-${nn}@nexago.test`;
        const phone = phoneFor(baseSeq + n);
        const birthDate = birthDateForLevel(n);

        const uid = await ensureAuthUser(auth, email, fullName, password);

        const profile = {
          fullName,
          email,
          gender: gender.label,
          role: "athlete",
          roles: ["athlete"],
          hasAthleteRole: true,
          phoneNumber: phone,
          birthDate,
          city,
          state,
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
          keywords: generateKeywords([fullName, city]),
          seedTestAthlete: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await db.doc(`users/${uid}`).set(profile, {merge: true});
        total += 1;
        if (total % 20 === 0) log(`  ... ${total} atletas`);
      }
    }
  }
  return {total};
}

module.exports = {
  LEVELS,
  GENDERS,
  generateKeywords,
  seedAthletes,
};
