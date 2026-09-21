/**
 * Quem pode sacar do caixa de um torneio (`tournamentWallets/{tournamentId}`).
 *
 * Dono do evento e GESTOR ativo da equipe. O papel `eventAdmin` (administrador)
 * opera o torneio inteiro mas não toca no dinheiro — decisão do dono em
 * 16/09/2026 — e mesário nunca teve acesso. A recusa vive aqui, no servidor: a
 * tela que esconde o Financeiro é conveniência, não segurança.
 *
 * A relação gestor → torneio é lida do espelho `users/{uid}/tournamentStaff`,
 * mantido por `onTournamentStaffWrittenSyncMirror`.
 */
import {HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import type {Firestore} from "firebase-admin/firestore";
import {isSuperAdminClaim} from "./auth-roles";

/** Teto de torneios lidos do espelho — protege a varredura de um staff enorme. */
const MAX_STAFF_TOURNAMENTS = 200;
/** `getAll` do Admin SDK aceita no máximo 100 refs por chamada. */
const MAX_WALLETS_PER_VIEW = 100;

/**
 * Papel que saca: gestor, e só. Papel **ausente** conta como gestor, mesmo
 * default de `buildStaffMirrorData`; `status` ausente conta como ativo.
 */
export function isActiveWithdrawalStaffMirror(data: Record<string, unknown>): boolean {
  const status = (data["status"] as string | undefined) ?? "active";
  const role = (data["role"] as string | undefined) ?? "manager";
  return status === "active" && role === "manager";
}

/**
 * Torneios de onde `uid` pode sacar: os que ele é dono e os que é gestor ativo.
 * O teto de 100 não é decorativo — quem consome isso faz `getAll` da lista, e o
 * Admin SDK aceita no máximo 100 refs por chamada.
 */
export async function listWithdrawableTournamentIds(
  db: Firestore,
  uid: string,
): Promise<string[]> {
  const [ownSnap, mirrorSnap] = await Promise.all([
    db.collection("tournaments").where("managerId", "==", uid).get(),
    db.collection(`users/${uid}/tournamentStaff`).get(),
  ]);
  const ids = ownSnap.docs.map((d) => d.id);
  for (const d of mirrorSnap.docs.slice(0, MAX_STAFF_TOURNAMENTS)) {
    if (!isActiveWithdrawalStaffMirror(d.data() as Record<string, unknown>)) continue;
    if (!ids.includes(d.id)) ids.push(d.id);
  }
  return ids.slice(0, MAX_WALLETS_PER_VIEW);
}

/** Lança `permission-denied` se `uid` não puder sacar do caixa de `tournamentId`. */
export async function assertCanWithdrawFromTournament(
  db: Firestore,
  uid: string,
  tournamentId: string,
): Promise<void> {
  const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tournamentSnap.exists) {
    throw new HttpsError("not-found", "Torneio não encontrado.");
  }
  const managerId = (tournamentSnap.data()?.managerId as string | undefined)?.trim() ?? "";
  if (managerId && managerId === uid) return;

  const mirror = await db.doc(`users/${uid}/tournamentStaff/${tournamentId}`).get();
  if (mirror.exists &&
      isActiveWithdrawalStaffMirror(mirror.data() as Record<string, unknown>)) {
    return;
  }

  // Suporte da plataforma alcança qualquer caixa (mesma porta do backoffice);
  // só pagamos o `getUser` quando o caminho normal falhou.
  try {
    const user = await getAuth().getUser(uid);
    if (isSuperAdminClaim(user.customClaims)) return;
  } catch {
    // Sessão órfã ou Auth indisponível: cai na negativa abaixo.
  }

  throw new HttpsError(
    "permission-denied",
    "Você não tem acesso ao caixa deste torneio.",
  );
}
