/* eslint-disable */
/**
 * Auditor da integridade inscrição ↔ equipe: toda inscrição com `teamId` tem de
 * resolver para um doc de equipe existente cujos integrantes batam com
 * `participantUids`.
 *
 * POR QUE existe: a entrega da identidade única da dupla reponta o `teamId` de
 * inscrições que JÁ EXISTEM. Uma inscrição apontando para equipe inexistente
 * some das listagens e passa a ser barrada pela regra
 * `inscriptionParticipantUidsMatchTeam` em qualquer update do cliente — quebra
 * silenciosa, que nenhum teste de unidade pega.
 *
 * Uso: rodar ANTES da migração (linha de base) e DEPOIS de cada --apply. O
 * conjunto de quebradas não pode crescer.
 *
 *   node scripts/check-registration-team-integrity.js --project volley-track-dev-4596c
 *
 * Só leitura. Sai com código 1 se achar inscrição quebrada.
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error("Informe --project <projectId>");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const base = `artifacts/${projectId}/public/data`;

/** Cópia de `extractTeamMemberUids` (functions/src/tournament-team-category.ts:154-171).
 * CRÍTICO: `memberUids` vence; legado (player1/2) é apenas fallback.
 * Early return após memberUids evita falso "OK" ao rodar contra roster desatualizado.
 */
function teamMemberUids(team) {
  if (!team) return [];
  const out = [];
  const push = (raw) => {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (id && !out.includes(id)) out.push(id);
  };
  if (Array.isArray(team.memberUids)) {
    for (const raw of team.memberUids) push(raw);
    if (out.length > 0) return out;
  }
  push(team.player1Id);
  push(team.player2Id);
  return out;
}

(async () => {
  const [inscriptions, teams] = await Promise.all([
    db.collection(`${base}/inscriptions`).get(),
    db.collection(`${base}/teams`).get(),
  ]);
  const teamById = new Map(teams.docs.map((d) => [d.id, d.data()]));

  const missingTeam = [];
  const memberMismatch = [];
  let semTeamId = 0;

  for (const doc of inscriptions.docs) {
    const data = doc.data();
    const teamId = String(data.teamId ?? "").trim();
    if (!teamId) {
      semTeamId += 1;
      continue;
    }
    const team = teamById.get(teamId);
    if (!team) {
      missingTeam.push(`${doc.id} -> teams/${teamId} (INEXISTENTE)`);
      continue;
    }
    const participants = Array.isArray(data.participantUids) ?
      data.participantUids.map((p) => String(p).trim()).filter(Boolean) :
      [];
    if (participants.length === 0) continue;
    const members = teamMemberUids(team);
    const orphan = participants.filter((uid) => !members.includes(uid));
    if (orphan.length > 0) {
      memberMismatch.push(
        `${doc.id} -> teams/${teamId}: participante(s) fora do elenco: ${orphan.join(", ")}`,
      );
    }
  }

  console.log(`inscricoes=${inscriptions.size} equipes=${teams.size} sem_teamId=${semTeamId}`);
  console.log(`equipe inexistente: ${missingTeam.length}`);
  missingTeam.forEach((line) => console.log(`  ${line}`));
  console.log(`elenco divergente: ${memberMismatch.length}`);
  memberMismatch.forEach((line) => console.log(`  ${line}`));

  const broken = missingTeam.length + memberMismatch.length;
  if (broken > 0) {
    console.error(`\nQUEBRADAS: ${broken}`);
    process.exit(1);
  }
  console.log("\nintegridade OK.");
})().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
