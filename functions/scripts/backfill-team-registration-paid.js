/* eslint-disable */
/**
 * Backfill do portão das listagens de equipe: grava `registrationPaid: true`
 * nas equipes cuja inscrição está paga e preenche o `gender` que ficou faltando.
 *
 * POR QUE existe: o `gender` só nascia no instante em que a inscrição fechava
 * (`markTeamRegistrationPaid`), e a baixa manual do organizador
 * (`organizerConfirmRegistrationPayment`, `paymentMethod: organizer_direct`)
 * era o único caminho de confirmação que nunca chamava esse carimbo — toda
 * equipe confirmada no balcão nascia sem gênero. O `registrationPaid` é novo:
 * sem este backfill, as equipes legítimas já pagas não têm o campo e sumiriam
 * das listagens no dia em que o filtro do app/portal subir.
 *
 * ORDEM DE ROLLOUT (importa): deploy das Functions -> ESTE script nos dois
 * projetos -> só então o app/portal com o filtro.
 *
 * Só escreve o que falta: quem já tem `registrationPaid` e `gender` não é
 * tocado. Equipe sem inscrição paga não recebe nada — é justamente quem deve
 * ficar fora da listagem.
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-team-registration-paid.js --project volley-track-dev-4596c
 *   node scripts/backfill-team-registration-paid.js --project <id> --apply
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
const apply = process.argv.includes("--apply");

admin.initializeApp({projectId});
const db = admin.firestore();
const base = `artifacts/${projectId}/public/data`;

/** Cópia de `normalizeAthleteGenderBucket` (tournament-registration-pix-helpers.ts). */
function normalizeGenderBucket(raw) {
  const g = String(raw ?? "").trim().toLowerCase();
  if (!g) return null;
  if (g === "masculino" || g === "m" || g === "male" || g === "homem") return "M";
  if (g === "feminino" || g === "f" || g === "female" || g === "mulher") return "F";
  return null;
}

/** Cópia de `extractTeamMemberUids` (tournament-team-category.ts). */
function extractTeamMemberUids(team) {
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

/** Cópia de `teamGenderLabelForBuckets` (tournament-team-category.ts). */
function teamGenderLabelForBuckets(buckets) {
  if (buckets.length === 0) return null;
  if (buckets.some((b) => b !== "M" && b !== "F")) return null;
  const hasMen = buckets.includes("M");
  const hasWomen = buckets.includes("F");
  if (hasMen && hasWomen) return "Misto";
  return hasMen ? "Masculino" : "Feminino";
}

/** Cópia de `expectedRosterSize` (tournament-team-roster.ts): 2..5, senão dupla. */
function expectedRosterSize(team) {
  const n = Number(team.teamSize);
  return Number.isInteger(n) && n >= 2 && n <= 5 ? n : 2;
}

(async () => {
  const [teams, regs] = await Promise.all([
    db.collection(`${base}/teams`).get(),
    db.collection(`${base}/inscriptions`).get(),
  ]);

  const paidTeamIds = new Set();
  for (const d of regs.docs) {
    const r = d.data();
    const teamId = String(r.teamId ?? "").trim();
    if (teamId && r.isPaid === true) paidTeamIds.add(teamId);
  }

  const genderCache = new Map();
  async function bucketFor(uid) {
    if (genderCache.has(uid)) return genderCache.get(uid);
    const snap = await db.doc(`users/${uid}`).get();
    const b = snap.exists ? normalizeGenderBucket(snap.data().gender) : null;
    genderCache.set(uid, b);
    return b;
  }

  const plano = [];
  const stats = {
    semInscricaoPaga: 0, jaCompleta: 0,
    soRegistrationPaid: 0, soGender: 0, ambos: 0, generoIndefinido: 0,
  };

  for (const doc of teams.docs) {
    const team = doc.data();
    if (!paidTeamIds.has(doc.id)) { stats.semInscricaoPaga++; continue; }

    const temFlag = team.registrationPaid === true;
    const temGenero = typeof team.gender === "string" && team.gender.trim().length > 0;
    if (temFlag && temGenero) { stats.jaCompleta++; continue; }

    let genero = null;
    if (!temGenero) {
      const membros = extractTeamMemberUids(team);
      if (membros.length >= expectedRosterSize(team)) {
        const buckets = await Promise.all(membros.map(bucketFor));
        genero = teamGenderLabelForBuckets(buckets);
      }
      if (!genero) stats.generoIndefinido++;
    }

    const update = {};
    if (!temFlag) update.registrationPaid = true;
    if (genero) update.gender = genero;
    if (Object.keys(update).length === 0) continue;

    if (update.registrationPaid && update.gender) stats.ambos++;
    else if (update.registrationPaid) stats.soRegistrationPaid++;
    else stats.soGender++;

    plano.push({ref: doc.ref, id: doc.id, update});
  }

  console.log(`\n== ${projectId} ${apply ? "(APLICANDO)" : "(dry-run)"} ==`);
  console.log(`equipes ${teams.size} | inscrições ${regs.size} | equipes com inscrição paga ${paidTeamIds.size}`);
  console.log(`  sem inscrição paga (fora da listagem, intocadas) : ${stats.semInscricaoPaga}`);
  console.log(`  já completas (nada a fazer)                      : ${stats.jaCompleta}`);
  console.log(`  a gravar registrationPaid + gender               : ${stats.ambos}`);
  console.log(`  a gravar só registrationPaid                     : ${stats.soRegistrationPaid}`);
  console.log(`  a gravar só gender                               : ${stats.soGender}`);
  console.log(`  paga mas gênero INDEFINIDO (perfil incompleto)   : ${stats.generoIndefinido}`);
  console.log(`  total de docs a escrever                         : ${plano.length}`);

  for (const p of plano.slice(0, 10)) {
    console.log(`    ${p.id}  ${JSON.stringify(p.update)}`);
  }
  if (plano.length > 10) console.log(`    ... e mais ${plano.length - 10}`);

  if (!apply) {
    console.log(`\nNada foi escrito. Rode de novo com --apply para gravar.`);
    process.exit(0);
  }

  let escritos = 0;
  for (let i = 0; i < plano.length; i += 400) {
    const batch = db.batch();
    for (const p of plano.slice(i, i + 400)) {
      batch.set(p.ref, {...p.update, updatedAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
      escritos++;
    }
    await batch.commit();
  }
  console.log(`\n${escritos} equipes atualizadas.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
