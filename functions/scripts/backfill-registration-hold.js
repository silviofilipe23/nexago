/* eslint-disable */
/**
 * Carimba o prazo de garantia da vaga (`holdExpiresAt`) nas inscrições que
 * nunca o receberam.
 *
 * POR QUE existe: a varredura `expirePendingTournamentRegistrations` consulta
 * `inscriptions` por `where("holdExpiresAt", "<", now)`. Inscrição SEM o campo
 * nunca aparece nessa consulta — campo ausente é imunidade PERMANENTE. Isso é
 * de propósito para três populações (fila de espera, criada pelo organizador,
 * torneio com o prazo desligado), mas pega junto o acervo anterior à regra
 * (31/08/2026): reserva solo de dupla que nunca pagou nada, em torneio ainda
 * aberto, segurando vaga na categoria para sempre.
 *
 * O que o script NÃO toca, e por quê (cada recusa aparece no relatório):
 *
 *   - FILA DE ESPERA        — não ocupa vaga; prazo ali não significa nada.
 *   - DINHEIRO REGISTRADO   — pago, valor baixado, baixa do organizador. Vale
 *                             também a PARCELA declarada (`sharePaidUids`):
 *                             a produção não a trata como imunidade, mas aqui
 *                             o carimbo é retroativo e em lote, e tirar a vaga
 *                             de quem disse que pagou é estrago que não se
 *                             desfaz.
 *   - CRIADA PELO ORGANIZADOR — `createdVia: "organizer"` é imunidade por
 *                             ORIGEM, declarada em organizer-create-registration.
 *   - PRAZO DESLIGADO       — `registrationHoldEnabled: false` no torneio.
 *   - TORNEIO QUE NÃO ACEITA INSCRIÇÃO — rascunho, cancelado, inexistente, ou
 *                             com as inscrições já encerradas. Liberar vaga que
 *                             ninguém mais pode ocupar não devolve vaga a
 *                             ninguém: só desinscreve, às vésperas do evento,
 *                             um atleta que contava com ela. Torneio morto é
 *                             assunto do `cleanup-incomplete-teams.js`.
 *
 * A CARÊNCIA (--grace-hours, padrão 48): numa inscrição nova o prazo nasce no
 * instante em que a vaga passa a depender de alguém pagar, e o atleta vê o
 * relógio correr na tela. No acervo esse instante já passou faz semanas —
 * carimbar os 30 minutos crus liberaria as vagas na primeira volta da
 * varredura, com um push "sua vaga foi liberada" para atletas reais que nunca
 * viram relógio nenhum. A carência é o aviso que eles não tiveram.
 * `--grace-hours 0` aplica a regra crua.
 *
 * Convite pendente vivo continua mandando: o prazo conta a partir do convite
 * mais longe, igual à produção (`computeRegistrationHoldExpiryMs`).
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-registration-hold.js --project volley-track-dev-4596c
 *   node scripts/backfill-registration-hold.js --project <id> --apply
 *   node scripts/backfill-registration-hold.js --project <id> --grace-hours 24 --apply
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
const graceRaw = argValue("--grace-hours");
const graceHours = graceRaw === undefined ? 48 : Number(graceRaw);
if (!Number.isFinite(graceHours) || graceHours < 0) {
  console.error("--grace-hours aceita um número de horas >= 0");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const Timestamp = admin.firestore.Timestamp;
const base = `artifacts/${projectId}/public/data`;
const INVITES_COLLECTION = "tournamentRegistrationInvites";

/** Cópia de `DEFAULT_REGISTRATION_HOLD_MINUTES` (tournament-registration-hold.ts). */
const DEFAULT_REGISTRATION_HOLD_MINUTES = 30;
/** Cópia de `ORGANIZER_CREATED_VIA` (organizer-create-registration-core.ts). */
const ORGANIZER_CREATED_VIA = "organizer";

function strList(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : [];
}

/**
 * Cópia de `registrationHoldImmunityReason` (tournament-registration-hold.ts),
 * MAIS a parcela declarada — ver o cabeçalho.
 */
function moneyReason(registration) {
  if (registration.isPaid === true) return "pago";
  if ((Number(registration.paidAmount) || 0) > 0) return "valor baixado";
  if (strList(registration.organizerConfirmedShareUids).length > 0) {
    return "baixa do organizador";
  }
  if (strList(registration.sharePaidUids).length > 0) return "parcela declarada";
  return null;
}

/** Cópia de `resolveRegistrationHoldMinutes` (tournament-registration-hold.ts). */
function resolveRegistrationHoldMinutes(tournament) {
  if (tournament && tournament.registrationHoldEnabled === false) return null;
  const raw = tournament && tournament.registrationHoldMinutes;
  const n =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  return DEFAULT_REGISTRATION_HOLD_MINUTES;
}

/** Cópia de `computeRegistrationHoldExpiryMs` (tournament-registration-hold.ts). */
function computeRegistrationHoldExpiryMs(nowMs, holdMinutes, liveInviteExpiresAtMs) {
  const invite = liveInviteExpiresAtMs || 0;
  return Math.max(nowMs, invite) + holdMinutes * 60 * 1000;
}

/** Cópia de `registrationOwnerUid` (tournament-registration-hold.ts). */
function registrationOwnerUid(registration) {
  const explicit = String(
    registration.captainUid != null ? registration.captainUid : registration.player1Id || "",
  ).trim();
  if (explicit) return explicit;
  for (const raw of strList(registration.participantUids)) {
    const uid = String(raw).trim();
    if (uid) return uid;
  }
  return "";
}

/** Cópia de `inviteMatchesCancelledRegistration` (tournament-registration-cancellation.ts). */
function inviteMatchesCancelledRegistration(invite, params) {
  const attachId = String(invite.attachRegistrationId != null ? invite.attachRegistrationId : "").trim();
  if (attachId) return attachId === params.registrationId;
  const inviter = String(invite.inviterUid != null ? invite.inviterUid : "").trim();
  return inviter === params.cancellerUid && invite.categoryId === params.categoryId;
}

/** Cópias de `inviteExpiresAtMs` / `inviteIsLive` (tournament-invite-constants.ts). */
function inviteExpiresAtMs(invite) {
  const expiresAt = invite && invite.expiresAt;
  if (!expiresAt || typeof expiresAt.toMillis !== "function") return null;
  return expiresAt.toMillis();
}
function inviteIsLive(invite, nowMs) {
  if (!invite || invite.status !== "pending") return false;
  const expiry = inviteExpiresAtMs(invite);
  return expiry == null || expiry >= nowMs;
}

/** Cópias de `normalizeListingStatus` / `isRegistrationListingClosed` (tournament-registration-guards.ts). */
function normalizeListingStatus(raw) {
  return String(raw == null ? "" : raw).trim().toLowerCase().replace(/_/g, " ");
}
function isRegistrationListingClosed(listingStatus) {
  const n = normalizeListingStatus(listingStatus);
  return n === "closed" || n === "inscrições encerradas" || n === "inscricoes encerradas";
}

/**
 * O torneio ainda aceita inscrição? Mesmas recusas de
 * `assertTournamentAcceptsRegistration`, sem a janela de abertura futura (um
 * torneio que ainda vai abrir não tem inscrição nenhuma para carimbar).
 */
function tournamentAcceptsRegistration(tournament, nowMs) {
  if (!tournament) return "torneio inexistente";
  const listingStatus =
    tournament.listingStatus != null ? tournament.listingStatus : tournament.status;
  const n = normalizeListingStatus(listingStatus);
  if (n === "draft" || n === "programado") return `torneio ${n}`;
  if (n === "cancelled" || n === "canceled" || n === "cancelado" || n === "cancelada") {
    return "torneio cancelado";
  }
  if (n === "completed") return "torneio encerrado";
  if (isRegistrationListingClosed(listingStatus)) return "inscrições encerradas";
  const closesAt = tournament.registrationClosesAt;
  if (closesAt && typeof closesAt.toMillis === "function" && closesAt.toMillis() < nowMs) {
    return "prazo de inscrição vencido";
  }
  return null;
}

function iso(ms) {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16);
}

(async () => {
  const nowMs = Date.now();
  const graceMs = graceHours * 60 * 60 * 1000;

  const [regs, invites] = await Promise.all([
    db.collection(`${base}/inscriptions`).get(),
    db.collection(INVITES_COLLECTION).where("status", "==", "pending").get(),
  ]);

  // Convites pendentes indexados por torneio: uma leitura para a coleção toda,
  // em vez de uma consulta por inscrição.
  const invitesByTournament = new Map();
  for (const doc of invites.docs) {
    const invite = doc.data();
    const tid = String(invite.tournamentId != null ? invite.tournamentId : "").trim();
    if (!tid) continue;
    if (!invitesByTournament.has(tid)) invitesByTournament.set(tid, []);
    invitesByTournament.get(tid).push(invite);
  }

  const tournamentCache = new Map();
  async function loadTournament(tournamentId) {
    const id = String(tournamentId == null ? "" : tournamentId).trim();
    if (!id) return null;
    if (tournamentCache.has(id)) return tournamentCache.get(id);
    const snap = await db.doc(`tournaments/${id}`).get();
    const data = snap.exists ? snap.data() : null;
    tournamentCache.set(id, data);
    return data;
  }

  /** Vencimento do convite vivo mais longe que segura ESTA vaga. */
  function liveInviteExpiryMs(registrationId, registration, tournamentId) {
    const lista = invitesByTournament.get(tournamentId) || [];
    const categoryId = String(registration.categoryId != null ? registration.categoryId : "").trim();
    const ownerUid = registrationOwnerUid(registration);
    let latest = null;
    for (const invite of lista) {
      if (invite.isSubstitutionInvite === true) continue;
      if (!inviteIsLive(invite, nowMs)) continue;
      if (!inviteMatchesCancelledRegistration(invite, {registrationId, cancellerUid: ownerUid, categoryId})) {
        continue;
      }
      const expiry = inviteExpiresAtMs(invite);
      if (expiry != null && (latest == null || expiry > latest)) latest = expiry;
    }
    return latest;
  }

  const skips = {};
  const plano = [];
  let comPrazo = 0;

  for (const doc of regs.docs) {
    const r = doc.data();
    if (r.holdExpiresAt !== undefined) { comPrazo++; continue; }

    const skip = (motivo) => { skips[motivo] = (skips[motivo] || 0) + 1; };

    if (r.waitlist === true) { skip("fila de espera"); continue; }
    const dinheiro = moneyReason(r);
    if (dinheiro) { skip(`dinheiro: ${dinheiro}`); continue; }
    if (r.createdVia === ORGANIZER_CREATED_VIA) { skip("criada pelo organizador"); continue; }

    const tournamentId = String(r.tournamentId == null ? "" : r.tournamentId).trim();
    const tournament = await loadTournament(tournamentId);
    const recusa = tournamentAcceptsRegistration(tournament, nowMs);
    if (recusa) { skip(recusa); continue; }

    const holdMinutes = resolveRegistrationHoldMinutes(tournament);
    if (holdMinutes == null) { skip("prazo desligado no torneio"); continue; }

    const inviteMs = liveInviteExpiryMs(doc.id, r, tournamentId);
    const regra = computeRegistrationHoldExpiryMs(nowMs, holdMinutes, inviteMs);
    const expiresAtMs = Math.max(regra, nowMs + graceMs);

    plano.push({
      ref: doc.ref,
      id: doc.id,
      expiresAtMs,
      torneio: String(tournament.name || tournamentId),
      categoria: String(r.categoryId == null ? "" : r.categoryId),
      atletas: strList(r.participantUids).length,
      convite: inviteMs != null,
      porCarencia: expiresAtMs > regra,
      criadaEm: r.createdAt && r.createdAt.toMillis ? iso(r.createdAt.toMillis()) : "?",
    });
  }

  console.log(`\nProjeto: ${projectId}   |   ${apply ? "APLICANDO" : "DRY-RUN (use --apply para gravar)"}`);
  console.log(`Carência: ${graceHours}h   |   inscrições: ${regs.size} (${comPrazo} já com prazo)\n`);

  console.log("Sem prazo, e por que ficam assim:");
  const motivos = Object.entries(skips).sort((a, b) => b[1] - a[1]);
  if (motivos.length === 0) console.log("   (nenhuma)");
  for (const [motivo, n] of motivos) console.log(`   ${String(n).padStart(4)}  ${motivo}`);

  console.log(`\nA carimbar: ${plano.length}`);
  for (const p of plano) {
    console.log(
      `   ${p.id}  ${iso(p.expiresAtMs)}  ${p.atletas} atleta(s)  criada em ${p.criadaEm}` +
      `${p.convite ? "  [convite vivo]" : ""}${p.porCarencia ? "  [carência]" : ""}  ${p.torneio} / ${p.categoria}`,
    );
  }

  if (!apply || plano.length === 0) {
    console.log(apply ? "\nNada a gravar." : "\nNada gravado (dry-run).");
    process.exit(0);
  }

  let gravadas = 0;
  for (let i = 0; i < plano.length; i += 400) {
    const batch = db.batch();
    for (const p of plano.slice(i, i + 400)) {
      batch.set(p.ref, {holdExpiresAt: Timestamp.fromMillis(p.expiresAtMs)}, {merge: true});
    }
    await batch.commit();
    gravadas += Math.min(400, plano.length - i);
  }
  console.log(`\nPrazo carimbado em ${gravadas} inscrição(ões).`);
  process.exit(0);
})().catch((e) => {
  console.error("ERRO:", e && e.message ? e.message : e);
  process.exit(1);
});
