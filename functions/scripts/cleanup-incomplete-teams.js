/* eslint-disable */
/**
 * Limpeza de equipes de elenco incompleto e do lixo que sobrou de inscrição
 * cancelada.
 *
 * POR QUE existe: o doc de equipe nem sempre morria junto com a inscrição —
 * antes do `teamDeletionBlockReason` (PR #430) alguns caminhos apagavam a
 * inscrição e deixavam `teams/{id}` para trás. Essas equipes órfãs continuam
 * aparecendo em busca e listagem sem ter inscrição nenhuma por trás, e as de
 * trio/quarteto ainda por cima com elenco pela metade.
 *
 * Dois passes, cada um com sua guarda:
 *
 *   1. EQUIPES ÓRFÃS  — doc em `teams` que nenhuma inscrição referencia.
 *      Só apaga com as MESMAS travas do `teamDeletionBlockReason`: nada de
 *      `registrationPaid` (inscrição anterior paga carimba a equipe pra
 *      sempre) e nada de partida publicada (apagar deixaria a partida órfã).
 *      O relatório separa elenco incompleto de elenco completo — o predicado
 *      é o mesmo.
 *
 *   2. RESERVA SOLO DE EVENTO MORTO — inscrição com elenco incompleto, sem
 *      dinheiro nenhum, cujo torneio não existe mais ou está `completed`.
 *      Some em silêncio: apaga o doc, cancela os convites pendentes que
 *      morreriam com ela e grava a trilha em
 *      `tournamentRegistrationCancellations`. NÃO passa pela varredura
 *      (`expirePendingTournamentRegistrations`) de propósito: ela notificaria
 *      "sua vaga foi liberada" para um torneio que já acabou.
 *
 *      Inscrição de torneio ABERTO nunca entra aqui — é atleta real esperando
 *      parceiro, e a vaga é dele.
 *
 * O que este script NÃO faz (e recusa, avisando): inscrição com cobrança PIX
 * aberta (cancelar no Asaas exige o secret, que script não tem) e inscrição
 * nascida de passe de vaga (devolver o passe é `restoreSpotPassSpot`).
 *
 * Uso (na pasta functions/):
 *   node scripts/cleanup-incomplete-teams.js --project volley-track-dev-4596c
 *   node scripts/cleanup-incomplete-teams.js --project <id> --apply
 *   node scripts/cleanup-incomplete-teams.js --project <id> --only teams
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
const only = argValue("--only") || "all";
if (!["all", "teams", "registrations"].includes(only)) {
  console.error("--only aceita: teams | registrations");
  process.exit(1);
}
const runTeams = only === "all" || only === "teams";
const runRegs = only === "all" || only === "registrations";

admin.initializeApp({projectId});
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const base = `artifacts/${projectId}/public/data`;
const INVITES_COLLECTION = "tournamentRegistrationInvites";
const CANCELLATIONS_COLLECTION = "tournamentRegistrationCancellations";
const CANCELLED_BY = "script:cleanup-incomplete-teams";

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

/** Cópia de `registrationTeamSize` (tournament-team-category.ts): 2..5, senão dupla. */
function rosterSize(doc) {
  const n = Number(doc && doc.teamSize);
  return Number.isInteger(n) && n >= 2 && n <= 5 ? n : 2;
}

/** Cópia de `registrationAthleteUids` (tournament-registration-pix-helpers.ts). */
function registrationAthleteUids(registration, team) {
  const out = new Set();
  if (team) {
    const memberUids = Array.isArray(team.memberUids) ? team.memberUids : [];
    for (const id of [...memberUids, team.player1Id, team.player2Id]) {
      if (typeof id === "string" && id.trim()) out.add(id.trim());
    }
    return [...out];
  }
  const p1 = registration.player1Id;
  if (typeof p1 === "string" && p1.trim()) out.add(p1.trim());
  const parts = registration.participantUids;
  if (Array.isArray(parts)) {
    for (const p of parts) {
      if (typeof p === "string" && p.trim()) out.add(p.trim());
    }
  }
  return [...out];
}

/** Cópia de `sharePaidUidsFromRegistration` (tournament-registration-pix-helpers.ts). */
function sharePaidUids(data) {
  const raw = data.sharePaidUids;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id) => typeof id === "string" && id.trim().length > 0);
}

/** Cópia de `organizerConfirmedShareUidsFromRegistration` (organizer-payment-share.ts). */
function organizerConfirmedShareUids(data) {
  const raw = data["organizerConfirmedShareUids"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((id) => typeof id === "string" && id.trim().length > 0);
}

/**
 * Cópia de `registrationHoldImmunityReason` (tournament-registration-hold.ts):
 * qualquer dinheiro registrado — inclusive a parcela de um atleta só.
 */
function moneyReason(registration) {
  if (registration.isPaid === true) return "paid";
  if (sharePaidUids(registration).length > 0) return "partialPayment";
  if ((Number(registration.paidAmount) || 0) > 0) return "settledAmount";
  if (organizerConfirmedShareUids(registration).length > 0) {
    return "organizerConfirmed";
  }
  return null;
}

/** Cópia de `inviteMatchesCancelledRegistration` (tournament-registration-cancellation.ts). */
function inviteMatchesCancelledRegistration(invite, params) {
  const attachId = String(invite.attachRegistrationId ?? "").trim();
  if (attachId) return attachId === params.registrationId;
  const inviter = String(invite.inviterUid ?? "").trim();
  return (
    inviter === params.cancellerUid && invite.categoryId === params.categoryId
  );
}

/** Cópia de `registrationOwnerUid` (tournament-registration-hold.ts). */
function registrationOwnerUid(registration) {
  const explicit = String(
    registration.captainUid ?? registration.player1Id ?? "",
  ).trim();
  if (explicit) return explicit;
  const participants = registration.participantUids;
  if (Array.isArray(participants)) {
    for (const raw of participants) {
      const uid = String(raw ?? "").trim();
      if (uid) return uid;
    }
  }
  return "";
}

/** Cópia de `buildRegistrationCancellationAudit` (tournament-registration-cancellation.ts). */
function buildRegistrationCancellationAudit(params) {
  const reg = params.registration;
  return {
    registrationId: params.registrationId,
    tournamentId: String(reg.tournamentId ?? "").trim(),
    categoryId: String(reg.categoryId ?? "").trim(),
    cancelledBy: params.cancelledBy,
    participantUids: params.athleteUids,
    registrationSnapshot: reg,
  };
}

/**
 * Cópia de `teamAppearsInAnyMatch` (tournament-team-matches.ts): duas consultas
 * de campo único, os mesmos campos que a produção olha.
 */
async function teamAppearsInAnyMatch(teamId) {
  const id = String(teamId ?? "").trim();
  if (!id) return false;
  const matches = db.collection(`${base}/matches`);
  const [comoA, comoB] = await Promise.all([
    matches.where("teamAId", "==", id).limit(1).get(),
    matches.where("teamBId", "==", id).limit(1).get(),
  ]);
  return !comoA.empty || !comoB.empty;
}

/** Roda `fn` sobre `items` em lotes, para não abrir centenas de conexões de uma vez. */
async function mapLimit(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

(async () => {
  const [teams, regs] = await Promise.all([
    db.collection(`${base}/teams`).get(),
    db.collection(`${base}/inscriptions`).get(),
  ]);

  // ---------------------------------------------------------------------
  // Passe 2 primeiro (só o PLANO): a equipe que ficar órfã por causa de uma
  // inscrição apagada aqui já entra no passe 1 na MESMA rodada.
  // ---------------------------------------------------------------------
  const regPlan = [];
  const regSkips = [];
  const regStats = {completo: 0, torneioVivo: 0, comDinheiro: 0, filaDeEspera: 0};

  if (runRegs) {
    const tournamentCache = new Map();
    async function tournamentState(tournamentId) {
      const id = String(tournamentId ?? "").trim();
      if (!id) return {morto: true, motivo: "sem tournamentId"};
      if (tournamentCache.has(id)) return tournamentCache.get(id);
      const snap = await db.doc(`tournaments/${id}`).get();
      // `listingStatus ?? status`, e não `status` cru: é a MESMA leitura de
      // `assertTournamentAcceptsRegistration`, que é quem decide se o torneio
      // ainda aceita inscrição. Torneio CANCELADO costuma ficar com
      // `status: "open"` e só o `listingStatus` conta a verdade — julgando pelo
      // campo cru, o evento cancelado passava por vivo e a reserva solo dele
      // ficava num beco: ninguém para apagá-la aqui, e o prazo de garantia
      // também não a alcança (a vaga é de um evento que não vai acontecer).
      const t = snap.exists ? snap.data() : null;
      const status = String((t ? (t.listingStatus ?? t.status) : "") ?? "")
        .trim().toLowerCase().replace(/_/g, " ");
      const cancelado =
        status === "cancelled" || status === "canceled" ||
        status === "cancelado" || status === "cancelada";
      const state = !snap.exists ?
        {morto: true, motivo: "torneio inexistente", nome: "(apagado)"} :
        status === "completed" || cancelado ?
          {morto: true, motivo: status, nome: String(t.name ?? id)} :
          {morto: false, motivo: status || "(sem status)", nome: String(t.name ?? id)};
      tournamentCache.set(id, state);
      return state;
    }

    const candidatos = [];
    for (const doc of regs.docs) {
      const r = doc.data();
      const size = rosterSize(r);
      const atletas = registrationAthleteUids(r, null);
      if (atletas.length >= size) { regStats.completo++; continue; }
      if (r.waitlist === true) { regStats.filaDeEspera++; continue; }
      const dinheiro = moneyReason(r);
      if (dinheiro) { regStats.comDinheiro++; continue; }
      candidatos.push({doc, r, size, atletas});
    }

    for (const c of candidatos) {
      const estado = await tournamentState(c.r.tournamentId);
      if (!estado.morto) {
        regStats.torneioVivo++;
        regSkips.push({
          id: c.doc.id,
          motivo: `torneio ${estado.motivo} — vaga é do atleta`,
          torneio: estado.nome,
        });
        continue;
      }
      // Passe de vaga e cobrança PIX aberta exigem efeito que script não faz.
      const spotPassId = String(c.r.spotPassId ?? "").trim();
      if (spotPassId) {
        regSkips.push({id: c.doc.id, motivo: "passe de vaga (restoreSpotPassSpot)", torneio: estado.nome});
        continue;
      }
      const pixPending = await c.doc.ref.collection("pixPending").get();
      if (!pixPending.empty) {
        regSkips.push({
          id: c.doc.id,
          motivo: `${pixPending.size} cobrança(s) PIX aberta(s) no Asaas`,
          torneio: estado.nome,
        });
        continue;
      }
      regPlan.push({
        ref: c.doc.ref,
        id: c.doc.id,
        registration: c.r,
        atletas: c.atletas,
        size: c.size,
        torneio: estado.nome,
        motivo: estado.motivo,
        ownerUid: registrationOwnerUid(c.r),
        categoryId: String(c.r.categoryId ?? "").trim(),
        tournamentId: String(c.r.tournamentId ?? "").trim(),
      });
    }

    // Convites pendentes que morrem com cada inscrição do plano.
    const tournamentIds = [...new Set(regPlan.map((p) => p.tournamentId).filter(Boolean))];
    const invitesPorTorneio = new Map();
    for (const tid of tournamentIds) {
      const snap = await db
        .collection(INVITES_COLLECTION)
        .where("tournamentId", "==", tid)
        .where("status", "==", "pending")
        .get();
      invitesPorTorneio.set(tid, snap.docs);
    }
    for (const p of regPlan) {
      const docs = invitesPorTorneio.get(p.tournamentId) ?? [];
      p.convites = docs.filter((d) =>
        inviteMatchesCancelledRegistration(d.data(), {
          registrationId: p.id,
          cancellerUid: p.ownerUid,
          categoryId: p.categoryId,
        }),
      );
    }
  }

  // ---------------------------------------------------------------------
  // Passe 1: equipes órfãs.
  // ---------------------------------------------------------------------
  const teamPlan = [];
  const teamSkips = [];
  const teamStats = {comInscricao: 0, paga: 0, emPartida: 0};
  const regIdsApagadas = new Set(regPlan.map((p) => p.id));

  if (runTeams) {
    const referenciadas = new Set();
    for (const d of regs.docs) {
      if (regIdsApagadas.has(d.id)) continue; // vai morrer no passe 2
      const teamId = String(d.data().teamId ?? "").trim();
      if (teamId) referenciadas.add(teamId);
    }

    const orfas = [];
    for (const doc of teams.docs) {
      const team = doc.data();
      if (referenciadas.has(doc.id)) { teamStats.comInscricao++; continue; }
      if (team.registrationPaid === true) {
        teamStats.paga++;
        teamSkips.push({id: doc.id, nome: team.teamName ?? "", motivo: "registrationPaid"});
        continue;
      }
      orfas.push({doc, team});
    }

    const comPartida = await mapLimit(orfas, 10, async (o) => teamAppearsInAnyMatch(o.doc.id));
    orfas.forEach((o, i) => {
      if (comPartida[i]) {
        teamStats.emPartida++;
        teamSkips.push({id: o.doc.id, nome: o.team.teamName ?? "", motivo: "aparece em partida"});
        return;
      }
      const membros = extractTeamMemberUids(o.team);
      const size = rosterSize(o.team);
      teamPlan.push({
        ref: o.doc.ref,
        id: o.doc.id,
        nome: String(o.team.teamName ?? "").trim(),
        size,
        membros: membros.length,
        incompleta: membros.length < size,
      });
    });
  }

  // ---------------------------------------------------------------------
  // Relatório
  // ---------------------------------------------------------------------
  const incompletas = teamPlan.filter((t) => t.incompleta);
  const completas = teamPlan.filter((t) => !t.incompleta);

  console.log(`\n== ${projectId} ${apply ? "(APLICANDO)" : "(dry-run)"} ==`);
  console.log(`equipes ${teams.size} | inscrições ${regs.size} | escopo: ${only}`);

  if (runTeams) {
    console.log(`\n[1] equipes órfãs (nenhuma inscrição aponta pra elas)`);
    console.log(`  com inscrição viva (intocadas)          : ${teamStats.comInscricao}`);
    console.log(`  órfã mas registrationPaid (preservada)  : ${teamStats.paga}`);
    console.log(`  órfã mas aparece em partida (preservada): ${teamStats.emPartida}`);
    console.log(`  A APAGAR — elenco incompleto            : ${incompletas.length}`);
    console.log(`  A APAGAR — elenco completo              : ${completas.length}`);
    for (const t of incompletas) {
      console.log(`    ${t.id}  "${t.nome}"  ${t.membros}/${t.size}`);
    }
    for (const t of completas.slice(0, 10)) {
      console.log(`    ${t.id}  "${t.nome}"  ${t.membros}/${t.size}`);
    }
    if (completas.length > 10) console.log(`    ... e mais ${completas.length - 10}`);
  }

  if (runRegs) {
    const convites = regPlan.reduce((n, p) => n + (p.convites ? p.convites.length : 0), 0);
    console.log(`\n[2] reserva solo de evento morto`);
    console.log(`  elenco completo (fora do critério)      : ${regStats.completo}`);
    console.log(`  incompleta mas com dinheiro (preservada): ${regStats.comDinheiro}`);
    console.log(`  incompleta em fila de espera (preservada): ${regStats.filaDeEspera}`);
    console.log(`  incompleta em torneio VIVO (preservada) : ${regStats.torneioVivo}`);
    console.log(`  A APAGAR                                : ${regPlan.length}`);
    console.log(`  convites pendentes a cancelar junto     : ${convites}`);
    for (const p of regPlan) {
      console.log(
        `    ${p.id}  ${p.atletas.length}/${p.size}  ${p.torneio} (${p.motivo})` +
        `${p.convites && p.convites.length ? `  +${p.convites.length} convite(s)` : ""}`,
      );
    }
    const recusadas = regSkips.filter((s) => !s.motivo.startsWith("torneio "));
    if (recusadas.length) {
      console.log(`  RECUSADAS (exigem efeito que script não faz):`);
      for (const s of recusadas) console.log(`    ${s.id}  ${s.motivo}`);
    }
  }

  if (!apply) {
    console.log(`\nNada foi escrito. Rode de novo com --apply para gravar.`);
    process.exit(0);
  }

  // ---------------------------------------------------------------------
  // Escrita
  // ---------------------------------------------------------------------
  let inscricoesApagadas = 0;
  let convitesCancelados = 0;
  for (const p of regPlan) {
    const batch = db.batch();
    batch.set(db.collection(CANCELLATIONS_COLLECTION).doc(), {
      ...buildRegistrationCancellationAudit({
        registrationId: p.id,
        cancelledBy: CANCELLED_BY,
        athleteUids: p.atletas,
        registration: p.registration,
      }),
      reason: "cleanup_incomplete_dead_tournament",
      cancelledAt: FieldValue.serverTimestamp(),
    });
    for (const invite of p.convites ?? []) {
      batch.update(invite.ref, {
        status: "cancelled",
        cancelReason: "registration_cancelled",
        updatedAt: FieldValue.serverTimestamp(),
      });
      convitesCancelados++;
    }
    batch.delete(p.ref);
    await batch.commit();
    inscricoesApagadas++;
  }

  let equipesApagadas = 0;
  for (let i = 0; i < teamPlan.length; i += 400) {
    const batch = db.batch();
    for (const t of teamPlan.slice(i, i + 400)) {
      batch.delete(t.ref);
      equipesApagadas++;
    }
    await batch.commit();
  }

  console.log(
    `\n${equipesApagadas} equipe(s) apagada(s) | ` +
    `${inscricoesApagadas} inscrição(ões) apagada(s) | ` +
    `${convitesCancelados} convite(s) cancelado(s).`,
  );
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
