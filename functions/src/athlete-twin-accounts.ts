/**
 * Contas gêmeas: a MESMA pessoa com duas contas (Google numa, e-mail na outra;
 * ou a conta nova que o link de convite externo fez criar).
 *
 * Para o servidor são dois uids, então toda trava de "já inscrito" deixava a
 * pessoa entrar duas vezes na mesma categoria. O que liga as contas é o
 * WhatsApp — obrigatório no cadastro, mas digitado e não verificado.
 *
 * Regra de "mesma pessoa": mesmo WhatsApp normalizado, A NÃO SER que as duas
 * contas tenham data de nascimento e elas sejam diferentes. É o que libera a
 * família que divide o número (pai e filho na mesma dupla), sem deixar passar
 * a conta antiga, que quase sempre repete o nascimento ou nem o tem.
 *
 * A inscrição pelo organizador NÃO passa por aqui de propósito: ela é a saída
 * para o falso positivo ("fale com o organizador").
 */

import {HttpsError} from "firebase-functions/v2/https";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {artifactsInscriptionsPath} from "./firebase-paths";

export const TWIN_ACCOUNT_REASON = "twinAccount";

/**
 * Chave do WhatsApp: DDD + número, só dígitos ("" quando não dá para confiar).
 *
 * Absorve as grafias que o app e o portal já gravaram: máscara, `+55`, e o
 * celular antigo de 8 dígitos (sem o 9 na frente). Número de enfeite —
 * "99999-9999", "00000-0000" — não identifica ninguém e volta vazio.
 */
export function phoneIdentityKey(raw: unknown): string {
  let digits =
    typeof raw === "string" ? raw.replace(/\D/g, "") :
    typeof raw === "number" && Number.isFinite(raw) ? String(Math.trunc(raw)) :
    "";
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  if (digits.length === 10 && /[6-9]/.test(digits[2])) {
    digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }
  if (digits.length !== 10 && digits.length !== 11) return "";
  if (digits.startsWith("0")) return "";
  if (/^(\d)\1+$/.test(digits.slice(2))) return "";
  return digits;
}

const SAO_PAULO_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Nascimento como `AAAA-MM-DD` ("" quando ausente ou ilegível). */
export function birthDayKey(raw: unknown): string {
  if (raw instanceof Timestamp) return SAO_PAULO_DAY.format(raw.toDate());
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? "" : SAO_PAULO_DAY.format(raw);
  }
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
}

export interface AthleteFingerprint {
  phoneKey: string;
  birthDay: string;
}

export function athleteFingerprint(
  userData: Record<string, unknown> | null | undefined,
): AthleteFingerprint {
  return {
    phoneKey: phoneIdentityKey(userData?.phoneNumber),
    birthDay: birthDayKey(userData?.birthDate),
  };
}

export function isSameAthlete(a: AthleteFingerprint, b: AthleteFingerprint): boolean {
  if (!a.phoneKey || a.phoneKey !== b.phoneKey) return false;
  return !(a.birthDay && b.birthDay && a.birthDay !== b.birthDay);
}

export type TwinConflict =
  /** Dois integrantes do elenco que está se formando são a mesma pessoa. */
  | {kind: "pair"; uid: string; twinUid: string}
  /** Quem está entrando já está na categoria por outra conta. */
  | {kind: "registered"; uid: string; twinUid: string};

/**
 * Procura a primeira conta gêmea de quem está ENTRANDO na categoria.
 *
 * `teamUids` é o elenco que está se formando; `registeredUids`, todos os
 * inscritos da categoria. Quem já está inscrito não é "entrante": ninguém é
 * barrado na própria vaga por causa de uma conta gêmea que entrou depois.
 */
export function findTwinConflict(params: {
  teamUids: string[];
  registeredUids: Set<string>;
  fingerprints: Map<string, AthleteFingerprint>;
  ignoreUids?: Set<string>;
}): TwinConflict | null {
  const {teamUids, registeredUids, fingerprints} = params;
  const ignore = params.ignoreUids ?? new Set<string>();
  const team = new Set(teamUids);
  const candidates = [...new Set([...teamUids, ...registeredUids])].filter(
    (uid) => !ignore.has(uid),
  );

  for (const uid of teamUids) {
    if (registeredUids.has(uid)) continue;
    const mine = fingerprints.get(uid);
    if (!mine?.phoneKey) continue;
    for (const other of candidates) {
      if (other === uid) continue;
      const theirs = fingerprints.get(other);
      if (!theirs || !isSameAthlete(mine, theirs)) continue;
      return {kind: team.has(other) ? "pair" : "registered", uid, twinUid: other};
    }
  }
  return null;
}

/** Duas contas da mesma categoria que parecem ser a mesma pessoa. */
export interface TwinRegistrationPair {
  categoryId: string;
  /** As duas inscrições — repetidas quando as duas contas estão no mesmo elenco. */
  registrationIds: [string, string];
  /** A conta de cada inscrição, na mesma ordem de `registrationIds`. */
  uids: [string, string];
}

/**
 * Os pares de contas gêmeas que JÁ estão inscritos, por categoria — o que a
 * trava de entrada não desfaz. É para o organizador enxergar e decidir: ele é
 * a saída do falso positivo, então o par vira aviso, nunca bloqueio.
 *
 * A mesma conta em duas inscrições não entra aqui: isso é outra trava.
 */
export function findTwinRegistrationPairs(params: {
  registrations: Array<{id: string; categoryId: string; uids: string[]}>;
  fingerprints: Map<string, AthleteFingerprint>;
}): TwinRegistrationPair[] {
  type Seat = {registrationId: string; uid: string; fingerprint: AthleteFingerprint};
  // Só compara quem divide a chave do WhatsApp: sem ela, `isSameAthlete` já diz não.
  const seatsByPhone = new Map<string, Seat[]>();
  for (const reg of params.registrations) {
    for (const uid of new Set(reg.uids)) {
      const fingerprint = params.fingerprints.get(uid);
      if (!fingerprint?.phoneKey) continue;
      const key = `${reg.categoryId}\u0000${fingerprint.phoneKey}`;
      const seats = seatsByPhone.get(key) ?? [];
      seats.push({registrationId: reg.id, uid, fingerprint});
      seatsByPhone.set(key, seats);
    }
  }

  const pairs: TwinRegistrationPair[] = [];
  for (const [key, seats] of seatsByPhone) {
    const categoryId = key.slice(0, key.indexOf("\u0000"));
    for (let i = 0; i < seats.length; i++) {
      for (let j = i + 1; j < seats.length; j++) {
        const a = seats[i];
        const b = seats[j];
        if (a.uid === b.uid || !isSameAthlete(a.fingerprint, b.fingerprint)) continue;
        pairs.push({
          categoryId,
          registrationIds: [a.registrationId, b.registrationId],
          uids: [a.uid, b.uid],
        });
      }
    }
  }
  return pairs;
}

/** `jo•••@gmail.com` — o bastante para a pessoa reconhecer a própria conta. */
export function maskEmail(raw: unknown): string {
  const email = typeof raw === "string" ? raw.trim() : "";
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return "";
  const local = email.slice(0, at);
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}•••${email.slice(at)}`;
}

function displayName(userData: Record<string, unknown> | undefined): string {
  for (const key of ["fullName", "name", "nickname"]) {
    const value = userData?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Seu parceiro";
}

export function twinConflictMessage(params: {
  conflict: TwinConflict;
  callerUid: string;
  users: Map<string, Record<string, unknown>>;
}): string {
  const {conflict, callerUid, users} = params;
  const help = "fale com o organizador do torneio.";
  if (conflict.kind === "pair") {
    return (
      "As duas contas têm o mesmo WhatsApp e parecem ser da mesma pessoa. " +
      `Escolha outro parceiro ou ${help}`
    );
  }
  if (conflict.uid === callerUid) {
    const masked = maskEmail(users.get(conflict.twinUid)?.email);
    const which = masked ? ` (${masked})` : "";
    return (
      `Outra conta com o seu WhatsApp${which} já está inscrita nesta categoria. ` +
      `Se essa conta é sua, entre com ela para continuar; se não é, ${help}`
    );
  }
  return (
    `${displayName(users.get(conflict.uid))} já está nesta categoria por outra ` +
    "conta com o mesmo WhatsApp. Para seguir, use a conta que já está inscrita " +
    `ou ${help}`
  );
}

function cleanUids(uids: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      uids
        .map((uid) => (typeof uid === "string" ? uid.trim() : ""))
        .filter((uid) => uid.length > 0),
    ),
  ];
}

const GET_ALL_CHUNK = 200;

/**
 * Barra quem tenta entrar numa categoria em que já está por outra conta.
 *
 * Fica FORA de transação, como as outras réguas de entrada (nível, idade): a
 * corrida de duas contas da mesma pessoa no mesmo segundo não é o caso real.
 */
export async function assertNoTwinAccountInCategory(params: {
  db: Firestore;
  projectId: string;
  tournamentId: string;
  categoryKeys: Set<string>;
  /** Elenco que está se formando: quem convida, quem aceita, quem entra. */
  teamUids: Array<string | null | undefined>;
  /** Quem chamou a callable — decide se a mensagem fala "você" ou o nome. */
  callerUid: string;
  /** Quem está SAINDO (substituição): trocar a conta errada pela certa é legítimo. */
  ignoreUids?: string[];
}): Promise<void> {
  const {db, projectId, tournamentId, categoryKeys, callerUid} = params;
  const teamUids = cleanUids(params.teamUids);
  if (teamUids.length === 0) return;

  const snap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();
  const registeredUids = new Set<string>();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!categoryKeys.has(String(data.categoryId ?? "").trim())) continue;
    const participants = Array.isArray(data.participantUids) ? data.participantUids : [];
    for (const uid of cleanUids([...participants, data.player1Id])) {
      registeredUids.add(uid);
    }
  }
  if (teamUids.every((uid) => registeredUids.has(uid))) return;

  const allUids = [...new Set([...teamUids, ...registeredUids])];
  const users = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < allUids.length; i += GET_ALL_CHUNK) {
    const refs = allUids.slice(i, i + GET_ALL_CHUNK).map((uid) => db.doc(`users/${uid}`));
    for (const userSnap of await db.getAll(...refs)) {
      if (userSnap.exists) users.set(userSnap.id, userSnap.data() ?? {});
    }
  }
  const fingerprints = new Map(
    [...users].map(([uid, data]) => [uid, athleteFingerprint(data)]),
  );

  const conflict = findTwinConflict({
    teamUids,
    registeredUids,
    fingerprints,
    ignoreUids: new Set(cleanUids(params.ignoreUids ?? [])),
  });
  if (!conflict) return;

  throw new HttpsError(
    "failed-precondition",
    twinConflictMessage({conflict, callerUid, users}),
    {reason: TWIN_ACCOUNT_REASON},
  );
}
