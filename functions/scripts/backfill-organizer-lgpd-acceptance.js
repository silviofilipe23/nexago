/* eslint-disable */
/**
 * Backfill do termo de uso de imagem/LGPD nas inscrições feitas pelo ORGANIZADOR antes do #996.
 *
 * Desde o #996, `organizerCreateTeamRegistration` grava o aceite do termo em nome dos atletas que
 * o organizador inscreve pelo painel. As inscrições anteriores ficaram "Pendente". Este script
 * aplica a MESMA regra, com as MESMAS funções da callable (código compilado em lib/):
 *   - só inscrição com carimbo do organizador (`isOrganizerRegistered`);
 *   - só atleta que ainda não aceitou — o aceite que o próprio atleta deu não é reescrito
 *     (`organizerLgpdAcceptanceUpdate`);
 *   - instante do aceite = `organizerRegisteredAt` da inscrição, que é como a callable registra a
 *     procedência (mesmo instante do carimbo do organizador).
 *
 * Inscrição feita pelo próprio atleta sem aceite NÃO é tocada — marcar seria inventar um
 * consentimento que ninguém deu. O dry-run só conta quantas são.
 *
 * Um torneio por vez, de propósito: o organizador de cada torneio é quem responde pelo aceite.
 *
 * ATENÇÃO — DEV é base viva: o app da loja aponta para este projeto. Rode o dry-run
 * imediatamente antes do `--yes`.
 *
 * Pré-requisitos:
 *   gcloud auth application-default login
 *   npm run build   (o script usa o código compilado em lib/)
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-organizer-lgpd-acceptance.js --project volley-track-dev-4596c --find "goiania open"
 *   node scripts/backfill-organizer-lgpd-acceptance.js --project volley-track-dev-4596c --tournament <id>
 *   node scripts/backfill-organizer-lgpd-acceptance.js --project volley-track-dev-4596c --tournament <id> --yes
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
const tournamentId = (argValue("--tournament") || "").trim();
const findTerm = (argValue("--find") || "").trim();

if (!projectId || (!tournamentId && !findTerm)) {
  console.error("Uso: --project <projectId> (--find \"<nome>\" | --tournament <id> [--yes])");
  process.exit(1);
}

process.env.GCLOUD_PROJECT = projectId;
admin.initializeApp({projectId});
const db = admin.firestore();
const {FieldValue} = admin.firestore;
const {
  isOrganizerRegistered,
  organizerLgpdAcceptanceUpdate,
} = require("../lib/organizer-create-registration-core");

/** "Goiânia" tem de achar "goiania": mesma normalização da busca do painel. */
function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function stringList(value) {
  return Array.isArray(value) ?
    value.map((v) => String(v || "").trim()).filter(Boolean) :
    [];
}

async function find() {
  const term = normalize(findTerm);
  const snap = await db.collection("tournaments").select("name", "startAt", "status").get();
  const rows = snap.docs
    .filter((d) => normalize(d.get("name")).includes(term))
    .map((d) => {
      const startAt = d.get("startAt");
      return {
        id: d.id,
        name: d.get("name"),
        status: d.get("status") || "",
        startAt: startAt && typeof startAt.toDate === "function" ?
          startAt.toDate().toISOString().slice(0, 10) :
          "",
      };
    });
  console.log(`${rows.length} torneio(s) com "${findTerm}" no nome (de ${snap.size}):`);
  if (rows.length) console.table(rows);
}

async function backfill() {
  const tournament = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tournament.exists) {
    console.error(`Torneio ${tournamentId} não existe em ${projectId}.`);
    process.exit(1);
  }
  console.log(`Torneio: ${tournament.get("name")} (${tournamentId}) | projeto: ${projectId}`);
  console.log(APPLY ? "MODO: aplicando" : "MODO: dry-run (use --yes para aplicar)");

  const snap = await db
    .collection(`artifacts/${projectId}/public/data/inscriptions`)
    .where("tournamentId", "==", tournamentId)
    .get();

  const rows = [];
  let organizerTotal = 0;
  let organizerDone = 0;
  let athletePending = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const athleteUids = stringList(data.participantUids);
    const accepted = new Set(stringList(data.lgpdAcceptedUids));
    const missing = athleteUids.filter((uid) => !accepted.has(uid));

    if (!isOrganizerRegistered(data)) {
      if (missing.length > 0) athletePending++;
      continue;
    }
    organizerTotal++;

    const update = organizerLgpdAcceptanceUpdate({
      athleteUids,
      alreadyAccepted: data.lgpdAcceptedUids,
      timestamp: data.organizerRegisteredAt || FieldValue.serverTimestamp(),
      arrayUnion: (...uids) => FieldValue.arrayUnion(...uids),
    });
    if (Object.keys(update).length === 0) {
      organizerDone++;
      continue;
    }

    const row = {
      registrationId: doc.id,
      categoryId: data.categoryId || "",
      athletes: athleteUids.length,
      toAccept: missing.length,
      action: APPLY ? "" : "aceitaria",
    };
    if (APPLY) {
      try {
        await doc.ref.update(update);
        row.action = "aceito";
      } catch (e) {
        row.action = `erro: ${e.message}`;
      }
    }
    rows.push(row);
  }

  console.log(
    `${snap.size} inscrições | ${organizerTotal} feitas pelo organizador ` +
    `(${organizerDone} já com o termo aceito, ${rows.length} a completar) | ` +
    `${athletePending} feitas pelo atleta com termo pendente (não tocadas)`,
  );
  if (rows.length) console.table(rows);
}

(findTerm ? find() : backfill()).catch((e) => {
  console.error(e);
  process.exit(1);
});
