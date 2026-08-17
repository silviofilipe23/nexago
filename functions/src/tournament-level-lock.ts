/**
 * Trigger da janela de calibração de nível: a primeira inscrição ATIVA do
 * atleta num esporte tranca `sportOnboarding.levelLocked.{SPORT_CODE}: true`
 * em `users/{uid}` — a partir daí o ratchet "nível só sobe" volta a valer
 * (rules cuidam do enforcement; este trigger só grava o flag).
 *
 * Cancelamento NUNCA reabre a janela: o flag só é gravado como `true`, nunca
 * apagado/desfeito.
 *
 * ## Shape real do doc de inscrição (achado na Etapa 1)
 *
 * `artifacts/{appId}/public/data/inscriptions/{registrationId}` NÃO tem
 * campo de status. Cancelamento (pelo atleta via `cancelTournamentRegistration`
 * em tournament-partner-invite.ts, pelo organizador via
 * `organizerRemoveFromCategory` em organizer-category-ops.ts, ou por pedido
 * aprovado via `respondRegistrationCancellationRequest` em
 * tournament-cancellation-request-ops.ts) é sempre HARD DELETE do doc —
 * `firestore.rules:1859-1863` documenta isso explicitamente. A auditoria vai
 * para uma coleção à parte (`tournamentRegistrationCancellations`), nunca
 * para um campo no doc que sobrevive. Por isso "antes ausente" e "antes
 * cancelada" são a MESMA condição aqui: uma inscrição só existe como `before`
 * enquanto está viva. [inscriptionBecameActive] reflete exatamente isso.
 *
 * uids dos atletas: `participantUids` (array) é mantido em sincronia por
 * TODOS os escritores — solo (`registerSoloTournament`), dupla (criação e
 * "attach" via `FieldValue.arrayUnion`) e equipe trio+
 * (`tournament-team-registration.ts`, inclusive `arrayRemove` ao sair). Por
 * isso [inscriptionAthleteUids] lê só o doc da inscrição, sem precisar
 * carregar `teams/{teamId}` — ao contrário de `loadTeamAthleteIds`
 * (league-ranking.ts), que só olha `player1Id`/`player2Id` e perderia o
 * 3º+ integrante de uma equipe.
 *
 * tournamentId: campo `tournamentId` (string), igual em toda a base.
 */
import {getFirestore} from "firebase-admin/firestore";
import type {Firestore} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";

import {tournamentSportToLevelSportCode} from "./category-level-eligibility";

/**
 * Uma inscrição "fica ativa" quando é CRIADA — `before` ausente e `after`
 * presente. Não existe um status "pendente"/"cancelada" persistido nesta
 * coleção (ver nota de topo do arquivo): qualquer `before` presente já é uma
 * inscrição que estava viva (paga ou não, com parceiro pendente ou não), e
 * cancelamento é delete, então nunca aparece como um `before` "cancelado" —
 * só como `after` ausente.
 */
export function inscriptionBecameActive(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): boolean {
  return after != null && before == null;
}

/**
 * Uids dos atletas da inscrição, direto do doc (sem carregar `teams`).
 * `participantUids` cobre solo, dupla e equipe trio+; `player1Id` entra como
 * reforço para docs legados que só tinham esse campo.
 */
export function inscriptionAthleteUids(
  data: Record<string, unknown> | null | undefined,
): string[] {
  if (!data) return [];
  const uids = new Set<string>();

  const player1 = data.player1Id;
  if (typeof player1 === "string" && player1.trim()) uids.add(player1.trim());

  const participants = data.participantUids;
  if (Array.isArray(participants)) {
    for (const raw of participants) {
      if (typeof raw === "string" && raw.trim()) uids.add(raw.trim());
    }
  }

  return [...uids];
}

/**
 * Uids que passam a ter uma inscrição ativa NESTA escrita — o que precisa de
 * lock.
 *
 * Cobre dois casos, os dois validados por elegibilidade de nível no momento
 * em que acontecem (`assertTeamLevelEligibility`, chamado antes da escrita
 * nos dois): a inscrição nova (dupla/equipe inteira ausente no `before`) E o
 * atleta que ENTRA numa reserva solo que já existia — aceite de convite
 * (`acceptTournamentPartnerInvite`) ou "attach" pelo organizador
 * (`organizerCreateTeamRegistration`). Neste segundo caso o DOC não é novo
 * (`inscriptionBecameActive` seria `false`), só um uid a mais em
 * `participantUids` — por isso não dá pra travar só quando o doc inteiro
 * nasce, tem que ser por uid.
 *
 * Uids que já estavam no `before` nunca voltam: ou já foram travados na vez
 * deles, ou o esporte não trava nada — não há por que reler o doc deles de
 * novo a cada update (waitlist, uniforme, pagamento, LGPD...) da inscrição.
 */
export function inscriptionNewlyActiveAthleteUids(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): string[] {
  if (!after) return [];
  if (inscriptionBecameActive(before, after)) return inscriptionAthleteUids(after);
  const beforeUids = new Set(inscriptionAthleteUids(before));
  return inscriptionAthleteUids(after).filter((uid) => !beforeUids.has(uid));
}

/** `true` quando `users/{uid}.sportOnboarding.levelLocked.{sportCode}` já é
 *  `true` — exportada para não duplicar a leitura do shape em teste/trigger. */
export function isLevelLocked(
  userData: Record<string, unknown> | undefined,
  sportCode: string,
): boolean {
  const onboarding = userData?.sportOnboarding;
  if (onboarding == null || typeof onboarding !== "object") return false;
  const locked = (onboarding as Record<string, unknown>).levelLocked;
  if (locked == null || typeof locked !== "object") return false;
  return (locked as Record<string, unknown>)[sportCode] === true;
}

/**
 * Trava o nível de UM atleta num esporte — idempotente, só escreve se ainda
 * não estiver travado (economiza writes numa dupla/equipe inteira: ler antes
 * de escrever é a garantia do brief).
 */
export async function lockLevelForUid(
  db: Firestore,
  uid: string,
  sportCode: string,
): Promise<void> {
  const userRef = db.doc(`users/${uid}`);
  const snap = await userRef.get();
  if (isLevelLocked(snap.data() as Record<string, unknown> | undefined, sportCode)) {
    return;
  }
  await userRef.set(
    {sportOnboarding: {levelLocked: {[sportCode]: true}}},
    {merge: true},
  );
}

/**
 * Corpo assíncrono do trigger, extraído para ser testável sem o wrapper do
 * `onDocumentWritten` (nenhum outro trigger deste repo é testado através do
 * wrapper — só a lógica que ele chama). Resolve o torneio → sportCode
 * (esporte sem equivalente = não trava nada) e trava cada uid.
 */
export async function lockLevelsForTournamentRegistration(
  db: Firestore,
  params: {tournamentId: string; uids: string[]; registrationId?: string},
): Promise<void> {
  const {tournamentId, uids, registrationId} = params;
  if (uids.length === 0) return;

  const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tournamentSnap.exists) return;

  const sportCode = tournamentSportToLevelSportCode(tournamentSnap.data()?.sport);
  if (!sportCode) return; // esporte sem equivalente no perfil — não trava nada.

  await Promise.all(
    uids.map((uid) =>
      lockLevelForUid(db, uid, sportCode).catch((err) => {
        logger.error("tournament-level-lock: falha ao travar nível do atleta", {
          uid,
          sportCode,
          tournamentId,
          registrationId,
          err,
        });
      }),
    ),
  );
}

export const onInscriptionWrittenLockLevels = onDocumentWritten(
  "artifacts/{appId}/public/data/inscriptions/{registrationId}",
  async (event) => {
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;
    if (!after) return;

    const tournamentId = String(after.tournamentId ?? "").trim();
    if (!tournamentId) return;

    const uids = inscriptionNewlyActiveAthleteUids(before, after);
    if (uids.length === 0) return;

    try {
      await lockLevelsForTournamentRegistration(getFirestore(), {
        tournamentId,
        uids,
        registrationId: event.params.registrationId,
      });
    } catch (err) {
      logger.error("tournament-level-lock: falha ao processar inscrição", {
        tournamentId,
        registrationId: event.params.registrationId,
        err,
      });
    }
  },
);
