/**
 * Quem pode mexer na carteira de um organizador (`organizerWallets/{uid}`).
 *
 * Até 09/2026 a resposta era só "o próprio dono": o portal lia
 * `organizerWallets/{uid do logado}` e o saque usava `request.auth.uid` cru.
 * Gestor de equipe (`tournaments/{id}/staff/{uid}` com `role: manager`) logava
 * no portal, abria Financeiro e via saldo R$ 0,00 para sempre — a carteira que
 * ele queria é a do DONO do torneio que ele opera.
 *
 * Decisão do dono (09/09/2026): o gestor vê a carteira do dono e solicita
 * saque dela, mas o PIX sai SEMPRE para a chave cadastrada pelo dono — o
 * gestor não cadastra nem troca chave (`setOrganizerPayoutPixKey` continua
 * escrevendo só na carteira de quem chama). Assim, mesmo uma conta de gestor
 * comprometida não consegue desviar o dinheiro para outro destino.
 *
 * A relação gestor → dono não cabe nas rules (elas só fazem leitura pontual, e
 * "algum torneio cujo managerId é X" é uma busca). Por isso o acesso delegado
 * passa por callable, com este helper recalculando a permissão a cada chamada
 * — sem espelho novo para dessincronizar.
 */
import {HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import type {Firestore} from "firebase-admin/firestore";
import {isSuperAdminClaim} from "./auth-roles";
import {staffRoleGrantsOrganizerAccess} from "./tournament-staff-sync";

/** Teto de torneios lidos do espelho — protege o `getAll` de um staff enorme. */
const MAX_STAFF_TOURNAMENTS = 200;

/** Mesma regra do espelho `users/{uid}/tournamentStaff/{tid}`: mesário fora,
 *  papel ausente conta como gestor, `status` ausente conta como ativo. */
export function isActiveStaffManagerMirror(data: Record<string, unknown>): boolean {
  const status = (data["status"] as string | undefined) ?? "active";
  return status === "active" && staffRoleGrantsOrganizerAccess(data["role"]);
}

/**
 * Carteiras que `uid` pode ver e sacar: a própria, sempre em primeiro, mais a
 * dos donos dos torneios em que ele é gestor ativo. Espelho órfão (torneio
 * apagado) some sozinho — o doc não existe mais e não vira dono nenhum.
 */
export async function listAccessibleOrganizerIds(
  db: Firestore,
  uid: string,
): Promise<string[]> {
  const ids = [uid];
  const mirror = await db.collection(`users/${uid}/tournamentStaff`).get();
  const tournamentIds = mirror.docs
    .filter((d) => isActiveStaffManagerMirror(d.data() as Record<string, unknown>))
    .map((d) => d.id)
    .slice(0, MAX_STAFF_TOURNAMENTS);
  if (tournamentIds.length === 0) return ids;

  const snaps = await db.getAll(
    ...tournamentIds.map((id) => db.doc(`tournaments/${id}`)),
  );
  for (const snap of snaps) {
    const managerId = snap.data()?.managerId;
    if (typeof managerId !== "string") continue;
    const owner = managerId.trim();
    if (owner && !ids.includes(owner)) ids.push(owner);
  }
  return ids;
}

/** Lança `permission-denied` se `uid` não puder agir sobre a carteira. */
export async function assertCanAccessOrganizerWallet(
  db: Firestore,
  uid: string,
  organizerId: string,
): Promise<void> {
  if (uid === organizerId) return;
  const accessible = await listAccessibleOrganizerIds(db, uid);
  if (accessible.includes(organizerId)) return;
  // Suporte da plataforma continua alcançando qualquer carteira (mesma porta
  // do backoffice); só pagamos o `getUser` quando o caminho normal falhou.
  try {
    const user = await getAuth().getUser(uid);
    if (isSuperAdminClaim(user.customClaims)) return;
  } catch {
    // Sessão órfã ou Auth indisponível: cai na negativa abaixo.
  }
  throw new HttpsError(
    "permission-denied",
    "Você não tem acesso à carteira deste organizador.",
  );
}

/**
 * Chave PIX do dono vista por um gestor da equipe: ela é CPF/telefone/e-mail
 * dele, então o delegado só recebe o suficiente para conferir o destino — o
 * saque delegado usa a chave guardada na carteira, nunca uma digitada.
 */
export function maskDelegatePayoutPixKey(pixKey: string): string {
  const key = pixKey.trim();
  if (key.length === 0) return "";
  if (key.length <= 4) return "•".repeat(key.length);
  return `${key.slice(0, 3)}${"•".repeat(Math.min(6, key.length - 5))}${key.slice(-2)}`;
}

/**
 * De onde sai a chave PIX do saque. É aqui que mora a garantia de dinheiro do
 * saque delegado: quando quem pede é gestor da equipe, a chave é SEMPRE a que
 * o dono cadastrou na carteira, e o que veio no payload é descartado.
 * Testável de fora de propósito — a callable só a chama.
 */
export function resolveWithdrawalPixSource(params: {
  delegated: boolean;
  walletPixKey: string;
  walletPixKeyType: string;
  payloadPixKey?: string;
  payloadPixKeyType?: string;
}): {pixKey: string; pixKeyType: string} {
  const walletPixKey = params.walletPixKey.trim();
  const walletPixKeyType = params.walletPixKeyType.trim();

  if (params.delegated) {
    if (walletPixKey.length < 5) {
      throw new HttpsError(
        "failed-precondition",
        "O dono da carteira ainda não cadastrou a chave PIX de repasse. " +
        "Só quem é dono dela pode cadastrar.",
      );
    }
    return {pixKey: walletPixKey, pixKeyType: walletPixKeyType};
  }

  let pixKey = params.payloadPixKey?.trim() ?? "";
  let pixKeyType = params.payloadPixKeyType?.trim().toUpperCase() ?? "";
  if (pixKey.length < 5) {
    pixKey = walletPixKey;
    if (!pixKeyType) pixKeyType = walletPixKeyType;
  }
  if (pixKey.length < 5) {
    throw new HttpsError(
      "invalid-argument",
      "Cadastre uma chave PIX de repasse antes de sacar.",
    );
  }
  return {pixKey, pixKeyType};
}
