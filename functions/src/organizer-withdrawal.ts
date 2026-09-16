/**
 * Saque do organizador — espelha os callables de saque de arena
 * (`arena-booking-pix.ts`). Desde 16/09/2026 o dinheiro sai do caixa do
 * TORNEIO (`tournamentWallets/{tournamentId}`), não mais da carteira por uid:
 * qualquer GESTOR ativo da equipe do evento pode solicitar o saque, sempre
 * para a PRÓPRIA chave PIX — ela vem do perfil de quem pede
 * (`organizerPayoutProfiles/{uid}`, ver `organizer-payout-profile.ts`), o
 * payload não tem voz nenhuma sobre o destino. `organizerId` continua gravado
 * no doc do saque com o DONO do evento (`tournaments/{id}.managerId`): é por
 * ele que a fila do backoffice e o webhook de payout encontram o saque, e é
 * ele quem é notificado quando quem pediu não é ele mesmo. Aprovação: auto até
 * R$500, manual acima (revisão no backoffice).
 *
 * O caminho antigo por uid (`organizerWallets/{uid}`, `organizer-wallet.ts`)
 * segue existindo só para saque legado ainda em voo — ver
 * `organizer-wallet-access.ts` para a regra de acesso que valia antes.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import * as logger from "firebase-functions/logger";
import {roundMoney} from "./mercadopago-arena-helpers";
import {releaseOrganizerWithdrawalReservation} from "./organizer-wallet";
import {loadPayoutPixKey, savePayoutPixKey} from "./organizer-payout-profile";
import {
  reserveTournamentWithdrawalAmount,
  releaseTournamentWithdrawalReservation,
  tournamentWalletRef,
} from "./tournament-wallet";
import {
  assertCanWithdrawFromTournament,
  listWithdrawableTournamentIds,
} from "./tournament-wallet-access";
import {
  completeOrganizerWithdrawalPayout,
  resolveWithdrawalWalletTarget,
} from "./organizer-withdrawal-payout";
import {isAsaasPayoutError} from "./arena-withdrawal-payout";
import {resolveWithdrawalPixFields} from "./asaas-payout";
import {asaasArenaSecrets} from "./asaas-client";
import {callerIsOrganizer, callerIsSuperAdmin} from "./auth-roles";
import {maskDelegatePayoutPixKey} from "./organizer-wallet-access";
import {deliverNotificationToUser} from "./notification-delivery";
import {ARENA_WITHDRAWAL_AUTO_MAX_REAIS} from "./arena-booking-payment-constants";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  artifactsInscriptionsPath,
  artifactsTeamsPath,
} from "./firebase-paths";
import {chunkList} from "./test-data-cleanup";

const ORGANIZER_WITHDRAWALS = "organizerWithdrawals";
/** Admin `getAll` aceita no máximo 100 refs por chamada. */
const GET_ALL_CHUNK = 100;

async function assertPlatformAdmin(uid: string): Promise<void> {
  let caller;
  try {
    caller = await getAuth().getUser(uid);
  } catch (err: unknown) {
    const code = (err as {code?: string})?.code;
    if (code === "auth/user-not-found") {
      // Token ainda válido (JWT não expirou) mas a conta foi apagada depois
      // que o cliente o obteve — sessão órfã, não um erro interno real.
      throw new HttpsError(
        "unauthenticated",
        "Sua sessão expirou. Entre novamente para continuar."
      );
    }
    throw err;
  }
  if (!callerIsOrganizer(caller) && !callerIsSuperAdmin(caller)) {
    throw new HttpsError(
      "permission-denied",
      "Apenas administradores da plataforma podem acessar saques.",
    );
  }
}

function isFirestoreIndexError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as {code?: number}).code;
  const message = err instanceof Error ? err.message : "";
  return code === 9 || message.includes("requires an index");
}

/**
 * Valida só a FORMA do pedido (torneio e valor) — sem tocar em I/O nenhum,
 * nem no controle de acesso, nem na leitura de perfil. A callable chama isto
 * antes de qualquer consulta ao Firestore: um `tournamentId` vazio não pode
 * chegar a `db.doc("tournaments/")` e estourar um erro cru de path — tem de
 * virar `invalid-argument` com mensagem em português primeiro.
 */
function validateWithdrawalRequestShape(params: {
  tournamentId: string;
  amountReais: number;
}): {tournamentId: string; amountReais: number} {
  const tournamentId = params.tournamentId.trim();
  if (!tournamentId) {
    throw new HttpsError("invalid-argument", "Informe o torneio do saque.");
  }
  if (!Number.isFinite(params.amountReais) || params.amountReais <= 0) {
    throw new HttpsError("invalid-argument", "Informe um valor válido para saque.");
  }
  return {tournamentId, amountReais: params.amountReais};
}

/**
 * Regras de entrada do saque, sem I/O — é aqui que mora a garantia de destino:
 * a chave é SEMPRE a do perfil de quem pede, e o payload não tem voz nenhuma
 * sobre para onde o dinheiro vai.
 */
export function resolveWithdrawalRequest(params: {
  tournamentId: string;
  amountReais: number;
  profilePixKey: string;
  profilePixKeyType: string;
}): {amount: number; pixKey: string; pixKeyType: string} {
  // Revalida a forma mesmo quando a callable já validou antes do controle de
  // acesso — aqui é no-op (os valores já vieram trimados e positivos), mas
  // mantém esta função íntegra pra quem a chamar direto, fora da callable.
  const {amountReais} = validateWithdrawalRequestShape(params);
  const pixKey = params.profilePixKey.trim();
  if (pixKey.length < 5) {
    throw new HttpsError(
      "failed-precondition",
      "Cadastre sua chave PIX de repasse antes de sacar.",
    );
  }
  return {
    amount: roundMoney(amountReais),
    pixKey,
    pixKeyType: params.profilePixKeyType.trim().toUpperCase(),
  };
}

/**
 * `assertCanWithdrawFromTournament` libera por dono, por gestor da equipe OU
 * por super admin — o caminho de super admin alcança qualquer torneio,
 * inclusive um com `managerId` malformado/ausente. Sem esta guarda, um saque
 * assim grava `organizerId: ""` no doc e nunca aparece na fila do backoffice
 * nem no payout: o PIX ainda vai pra chave de quem pediu (não é desvio), mas
 * o registro do saque fica órfão, sem ninguém pra encontrá-lo depois.
 */
export function assertTournamentHasOwner(ownerId: string): void {
  if (!ownerId) {
    throw new HttpsError("failed-precondition", "Torneio sem responsável definido.");
  }
}

/** Um saque pendente por CAIXA: vários gestores sacam do mesmo dinheiro, então
 *  a trava tem de ser do torneio, não de quem pede. */
async function assertNoPendingTournamentWithdrawal(
  db: ReturnType<typeof getFirestore>,
  tournamentId: string,
): Promise<void> {
  const col = db.collection(ORGANIZER_WITHDRAWALS);
  const snap = await col
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "pending")
    .limit(1)
    .get()
    .catch(async (err) => {
      if (!isFirestoreIndexError(err)) throw err;
      return col.where("tournamentId", "==", tournamentId).limit(20).get();
    });
  const hasPending = snap.docs.some(
    (d) => (d.data().status as string | undefined)?.toLowerCase() === "pending",
  );
  if (hasPending) {
    throw new HttpsError(
      "failed-precondition",
      "Já existe um saque pendente neste torneio. Aguarde a conclusão.",
    );
  }
}

/** Cadastra/atualiza a chave PIX de repasse da PESSOA (`organizerPayoutProfiles`).
 *  Com o caixa morando no torneio, cada um saca para a própria chave — não há
 *  mais "destino da carteira" pra escolher, é sempre a chave de quem chama. */
export const setOrganizerPayoutPixKey = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");

  const data = (request.data ?? {}) as {pixKey?: string; pixKeyType?: string};
  const pixKey = data.pixKey?.trim() ?? "";
  const pixKeyType = data.pixKeyType?.trim().toUpperCase() ?? "";

  const {pixAddressKey, pixAddressKeyType} = resolveWithdrawalPixFields(
    pixKey,
    pixKeyType || undefined,
  );
  if (pixAddressKey.length < 5) {
    throw new HttpsError("invalid-argument", "Chave PIX inválida.");
  }

  const db = getFirestore();
  await savePayoutPixKey(db, uid, {
    pixKey: pixAddressKey,
    pixKeyType: pixAddressKeyType,
  });
  return {success: true, pixKey: pixAddressKey, pixKeyType: pixAddressKeyType};
});

export const requestOrganizerWithdrawal = onCall(
  {region: CLIENT_FACING_REGIONS, secrets: [...asaasArenaSecrets]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");

    const data = (request.data ?? {}) as {
      amountReais?: number;
      tournamentId?: string;
    };

    // Forma do payload antes de qualquer I/O — inclusive antes do controle de
    // acesso: um pedido malformado não paga consulta ao Firestore, e um
    // `tournamentId` vazio não pode estourar um erro cru de path.
    const {tournamentId, amountReais} = validateWithdrawalRequestShape({
      tournamentId: data.tournamentId?.trim() ?? "",
      amountReais: typeof data.amountReais === "number" ? data.amountReais : 0,
    });

    const db = getFirestore();
    await assertCanWithdrawFromTournament(db, uid, tournamentId);

    const profile = await loadPayoutPixKey(db, uid);
    const {amount, pixKey, pixKeyType} = resolveWithdrawalRequest({
      tournamentId,
      amountReais,
      profilePixKey: profile.pixKey,
      profilePixKeyType: profile.pixKeyType,
    });

    const {pixAddressKey, pixAddressKeyType} = resolveWithdrawalPixFields(
      pixKey,
      pixKeyType || undefined,
    );
    if (pixAddressKey.length < 5) {
      throw new HttpsError("invalid-argument", "Chave PIX inválida.");
    }

    await assertNoPendingTournamentWithdrawal(db, tournamentId);

    const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
    const ownerId =
      (tournamentSnap.data()?.managerId as string | undefined)?.trim() ?? "";
    const tournamentName =
      (tournamentSnap.data()?.name as string | undefined)?.trim() ?? "";
    assertTournamentHasOwner(ownerId);
    const delegated = ownerId !== uid;

    try {
      await reserveTournamentWithdrawalAmount(db, tournamentId, amount);
    } catch (e) {
      if (e instanceof Error && e.message === "INSUFFICIENT_BALANCE") {
        throw new HttpsError("failed-precondition", "Saldo insuficiente para este saque.");
      }
      throw e;
    }

    const autoEligible = amount <= ARENA_WITHDRAWAL_AUTO_MAX_REAIS + 0.001;
    const processingMode = autoEligible ? "auto" : "manual_review";

    const withdrawalRef = db.collection(ORGANIZER_WITHDRAWALS).doc();
    await withdrawalRef.set({
      tournamentId,
      tournamentName,
      // `organizerId` segue gravado com o dono do evento: é por ele que a fila
      // do backoffice e o webhook de payout encontram o saque.
      organizerId: ownerId,
      amountReais: amount,
      pixKey: pixAddressKey,
      pixKeyType: pixAddressKeyType,
      processingMode,
      status: "pending",
      payoutStatus: "pending",
      payoutProvider: "asaas",
      requestedBy: uid,
      requestedByStaff: delegated,
      createdAt: FieldValue.serverTimestamp(),
    });

    const withdrawalId = withdrawalRef.id;
    if (delegated) {
      await notifyOwnerOfDelegatedWithdrawal(db, {
        organizerId: ownerId,
        tournamentName,
        requestedBy: uid,
        amountReais: amount,
        pixKey: pixAddressKey,
      });
    }

    if (autoEligible) {
      try {
        const result = await completeOrganizerWithdrawalPayout(
          db,
          withdrawalRef,
          {
            organizerId: ownerId,
            amountReais: amount,
            pixKey: pixAddressKey,
            pixKeyType: pixAddressKeyType,
          },
          uid,
          delegated ?
            "PIX automático na solicitação (gestor da equipe)" :
            "PIX automático na solicitação",
        );
        return {
          withdrawalId,
          status: result.status,
          payoutStatus: result.payoutStatus,
          asaasTransferId: result.payoutId,
          autoProcessed: true,
          processingMode,
        };
      } catch (e) {
        const message = isAsaasPayoutError(e) ?
          e.message :
          "Não foi possível enviar o PIX automaticamente. Nossa equipe vai revisar.";
        logger.warn(`requestOrganizerWithdrawal auto payout failed ${withdrawalId}`, e);
        const snap = await withdrawalRef.get();
        const payoutStatus = (snap.data()?.payoutStatus as string | undefined) ?? "failed";
        return {
          withdrawalId,
          status: "pending",
          payoutStatus,
          autoProcessed: false,
          processingMode,
          message,
        };
      }
    }

    return {
      withdrawalId,
      status: "pending",
      payoutStatus: "pending",
      autoProcessed: false,
      processingMode,
      message:
        `Saque acima de R$ ${ARENA_WITHDRAWAL_AUTO_MAX_REAIS}. Aguardando aprovação da plataforma.`,
    };
  },
);

/** O dono sempre fica sabendo que alguém da equipe mexeu no dinheiro dele.
 *  Falha de notificação nunca derruba o saque já registrado. */
async function notifyOwnerOfDelegatedWithdrawal(
  db: ReturnType<typeof getFirestore>,
  params: {
    organizerId: string;
    tournamentName: string;
    requestedBy: string;
    amountReais: number;
    pixKey: string;
  },
): Promise<void> {
  try {
    const requesterSnap = await db.doc(`users/${params.requestedBy}`).get();
    const requesterName =
      (requesterSnap.data()?.displayName as string | undefined)?.trim() ||
      "Um gestor da sua equipe";
    await deliverNotificationToUser({
      userId: params.organizerId,
      title: "Saque solicitado pela sua equipe",
      body:
        `${requesterName} solicitou um saque de ` +
        `R$ ${params.amountReais.toFixed(2).replace(".", ",")} do caixa de ` +
        `${params.tournamentName || "um torneio seu"} para a chave PIX ` +
        `${maskDelegatePayoutPixKey(params.pixKey)}.`,
      type: "organizer_withdrawal_requested",
      data: {url: "/painel/financeiro"},
    });
  } catch (err) {
    logger.warn("notifyOwnerOfDelegatedWithdrawal falhou", err);
  }
}

/**
 * Chave PIX "cadastrada" pra tela: mesmo piso usado no saque automático
 * (`resolveWithdrawalPixFields`/`asaas-payout.ts`). Extraída pra função pura
 * porque o payload devolve `hasPixKey` em dois retornos diferentes da
 * callable (sem torneio × com torneio) — a regra não pode divergir entre
 * eles.
 */
export function hasUsablePixKey(pixKey: string): boolean {
  return pixKey.length >= 5;
}

/** Linhas do seletor de caixas: o mais cheio primeiro, empate pelo nome. */
export function buildWalletViewRows(
  tournaments: Array<{id: string; name: string}>,
  wallets: Map<string, {availableReais: number; pendingReais: number}>,
): Array<{
  tournamentId: string;
  tournamentName: string;
  availableReais: number;
  pendingReais: number;
}> {
  return tournaments
    .map((t) => ({
      tournamentId: t.id,
      tournamentName: t.name,
      availableReais: wallets.get(t.id)?.availableReais ?? 0,
      pendingReais: wallets.get(t.id)?.pendingReais ?? 0,
    }))
    .sort((a, b) =>
      b.availableReais - a.availableReais ||
      a.tournamentName.localeCompare(b.tournamentName, "pt-BR"),
    );
}

/**
 * Tudo que a tela Financeiro precisa numa chamada só: os caixas de torneio que
 * o chamador alcança (dono + gestor ativo, via `listWithdrawableTournamentIds`)
 * e o extrato/saques do caixa escolhido.
 *
 * Existe como callable porque a relação gestor → torneio não cabe nas rules
 * (ver `tournament-wallet-access.ts`).
 */
export const loadOrganizerWalletView = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");

  const db = getFirestore();
  const payload = (request.data ?? {}) as {
    tournamentId?: string;
    ledgerLimit?: number;
  };
  // A tela soma as taxas da plataforma pelo extrato, então precisa de mais que
  // a primeira página; o teto evita que um cliente peça a coleção inteira.
  const ledgerLimit = Math.min(
    500,
    Math.max(1, Math.trunc(Number(payload.ledgerLimit) || 30)),
  );

  // Uma leitura só do perfil de repasse: os dois retornos da callable (sem
  // torneio × com torneio) usam o mesmo `payout` e a mesma regra de
  // `hasPixKey`, pra nunca se contradizer sobre a própria chave do chamador.
  const [tournamentIds, payout] = await Promise.all([
    listWithdrawableTournamentIds(db, uid),
    loadPayoutPixKey(db, uid),
  ]);
  if (tournamentIds.length === 0) {
    return {
      tournaments: [],
      selected: null,
      payout: {...payout, hasPixKey: hasUsablePixKey(payout.pixKey)},
      ledger: [],
      withdrawals: [],
    };
  }

  const [tournamentSnaps, walletSnaps] = await Promise.all([
    db.getAll(...tournamentIds.map((id) => db.doc(`tournaments/${id}`))),
    db.getAll(...tournamentIds.map((id) => tournamentWalletRef(db, id))),
  ]);
  const wallets = new Map(
    walletSnaps.map((snap, i) => [
      tournamentIds[i]!,
      {
        availableReais: Number(snap.data()?.availableReais) || 0,
        pendingReais: Number(snap.data()?.pendingReais) || 0,
      },
    ]),
  );
  const rows = buildWalletViewRows(
    tournamentIds.map((id, i) => ({
      id,
      name: (tournamentSnaps[i]?.data()?.name as string | undefined)?.trim() || "Torneio",
    })),
    wallets,
  );

  // Pedido fora da lista cai no caixa mais cheio em vez de estourar: a lista
  // muda quando alguém sai da equipe e o cliente pode ter guardado a antiga.
  const requested = payload.tournamentId?.trim() ?? "";
  const selected = rows.find((r) => r.tournamentId === requested) ?? rows[0]!;

  const ledgerSnap = await tournamentWalletRef(db, selected.tournamentId)
    .collection("ledger")
    .orderBy("createdAt", "desc")
    .limit(ledgerLimit)
    .get()
    .catch(() => null);

  const withdrawalsSnap = await db
    .collection(ORGANIZER_WITHDRAWALS)
    .where("tournamentId", "==", selected.tournamentId)
    .orderBy("createdAt", "desc")
    .limit(20)
    .get()
    .catch(async (err) => {
      if (!isFirestoreIndexError(err)) return null;
      return db
        .collection(ORGANIZER_WITHDRAWALS)
        .where("tournamentId", "==", selected.tournamentId)
        .limit(20)
        .get();
    });

  const ledgerDocs = ledgerSnap?.docs ?? [];
  const athleteLabelByKey = await resolveLedgerAthleteLabels(db, ledgerDocs);

  return {
    tournaments: rows,
    selected,
    payout: {...payout, hasPixKey: hasUsablePixKey(payout.pixKey)},
    ledger: ledgerDocs.map((d) => {
      const e = d.data();
      const registrationId =
        typeof e.registrationId === "string" ? e.registrationId.trim() : "";
      const payerUid = typeof e.payerUid === "string" ? e.payerUid.trim() : "";
      return {
        id: d.id,
        netReais: Number(e.netReais) || 0,
        grossReais: Number(e.grossReais) || 0,
        platformFeeReais: Number(e.platformFeeReais) || 0,
        createdAt: (e.createdAt as Timestamp | undefined)?.toDate?.()?.toISOString() ?? null,
        athleteLabel:
          (registrationId && athleteLabelByKey.get(registrationId)) ||
          (payerUid && athleteLabelByKey.get(`payer:${payerUid}`)) ||
          "",
      };
    }),
    withdrawals: (withdrawalsSnap?.docs ?? []).map((d) => {
      const x = d.data();
      const requestedBy = (x.requestedBy as string | undefined)?.trim() ?? "";
      return {
        id: d.id,
        amountReais: Number(x.amountReais) || 0,
        status: (x.status as string | undefined) ?? "pending",
        // Chave de OUTRA pessoa nunca vai inteira para a tela: cada um só vê a
        // sua por extenso. `maskPixKey` do cliente não protege CPF (11 < 12).
        pixKey: requestedBy === uid ?
          ((x.pixKey as string | undefined) ?? "") :
          maskDelegatePayoutPixKey((x.pixKey as string | undefined) ?? ""),
        requestedBy,
        requestedByStaff: x.requestedByStaff === true,
        payoutStatus: (x.payoutStatus as string | undefined) ?? null,
        createdAt: (x.createdAt as Timestamp | undefined)?.toDate?.()?.toISOString() ?? null,
      };
    }),
  };
});

/** Até duas palavras — o extrato não precisa do nome civil completo. */
function twoWordPersonName(raw: string): string {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[1]}`;
}

function profileDisplayName(data: DocumentData | undefined): string {
  if (!data) return "";
  const raw =
    (typeof data.nickname === "string" && data.nickname.trim()) ||
    (typeof data.fullName === "string" && data.fullName.trim()) ||
    (typeof data.name === "string" && data.name.trim()) ||
    (typeof data.displayName === "string" && data.displayName.trim()) ||
    "";
  return twoWordPersonName(raw);
}

/**
 * Resolve o rótulo do extrato a partir de `registrationId` (preferido) ou
 * `payerUid` (fallback). Lê inscriptions → teams → public_profiles em lote —
 * uma passada por load da tela, não por linha.
 */
async function resolveLedgerAthleteLabels(
  db: ReturnType<typeof getFirestore>,
  ledgerDocs: QueryDocumentSnapshot[],
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (ledgerDocs.length === 0) return labels;

  const registrationIds = [...new Set(
    ledgerDocs
      .map((d) => {
        const id = d.data().registrationId;
        return typeof id === "string" ? id.trim() : "";
      })
      .filter(Boolean),
  )];
  const payerUids = [...new Set(
    ledgerDocs
      .map((d) => {
        const id = d.data().payerUid;
        return typeof id === "string" ? id.trim() : "";
      })
      .filter(Boolean),
  )];

  const inscriptionById = new Map<string, DocumentData>();
  const teamIds = new Set<string>();
  const profileUids = new Set<string>(payerUids);

  for (const chunk of chunkList(registrationIds, GET_ALL_CHUNK)) {
    if (chunk.length === 0) continue;
    const snaps = await db.getAll(
      ...chunk.map((id) => db.doc(`${artifactsInscriptionsPath()}/${id}`)),
    );
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data() ?? {};
      inscriptionById.set(snap.id, data);
      const teamId = typeof data.teamId === "string" ? data.teamId.trim() : "";
      if (teamId) teamIds.add(teamId);
      if (Array.isArray(data.participantUids)) {
        for (const uid of data.participantUids) {
          if (typeof uid === "string" && uid.trim()) profileUids.add(uid.trim());
        }
      }
      const player1 =
        typeof data.player1Id === "string" ? data.player1Id.trim() : "";
      if (player1) profileUids.add(player1);
    }
  }

  const teamById = new Map<string, DocumentData>();
  for (const chunk of chunkList([...teamIds], GET_ALL_CHUNK)) {
    if (chunk.length === 0) continue;
    const snaps = await db.getAll(
      ...chunk.map((id) => db.doc(`${artifactsTeamsPath()}/${id}`)),
    );
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data() ?? {};
      teamById.set(snap.id, data);
      for (const key of ["player1Id", "player2Id"] as const) {
        const uid =
          typeof data[key] === "string" ? (data[key] as string).trim() : "";
        if (uid) profileUids.add(uid);
      }
      if (Array.isArray(data.memberUids)) {
        for (const uid of data.memberUids) {
          if (typeof uid === "string" && uid.trim()) profileUids.add(uid.trim());
        }
      }
    }
  }

  const nameByUid = new Map<string, string>();
  for (const chunk of chunkList([...profileUids], GET_ALL_CHUNK)) {
    if (chunk.length === 0) continue;
    const snaps = await db.getAll(
      ...chunk.map((id) => db.doc(`public_profiles/${id}`)),
    );
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const name = profileDisplayName(snap.data());
      if (name) nameByUid.set(snap.id, name);
    }
    // Fallback users/{uid} quando o espelho público ainda não tem o nome.
    const missing = chunk.filter((id) => !nameByUid.has(id));
    if (missing.length === 0) continue;
    const userSnaps = await db.getAll(
      ...missing.map((id) => db.doc(`users/${id}`)),
    );
    for (const snap of userSnaps) {
      if (!snap.exists) continue;
      const name = profileDisplayName(snap.data());
      if (name) nameByUid.set(snap.id, name);
    }
  }

  for (const [registrationId, inscription] of inscriptionById) {
    const teamId = typeof inscription.teamId === "string" ?
      inscription.teamId.trim() :
      "";
    const team = teamId ? teamById.get(teamId) : undefined;
    const customName =
      (typeof inscription.customTeamName === "string" &&
        inscription.customTeamName.trim()) ||
      (typeof team?.teamName === "string" && team.teamName.trim()) ||
      "";
    if (customName) {
      labels.set(registrationId, customName);
      continue;
    }

    const uids: string[] = [];
    const seen = new Set<string>();
    const pushUid = (raw: unknown) => {
      if (typeof raw !== "string") return;
      const id = raw.trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      uids.push(id);
    };
    if (Array.isArray(inscription.participantUids)) {
      for (const uid of inscription.participantUids) pushUid(uid);
    }
    if (team) {
      pushUid(team.player1Id);
      pushUid(team.player2Id);
      if (Array.isArray(team.memberUids)) {
        for (const uid of team.memberUids) pushUid(uid);
      }
    }
    pushUid(inscription.player1Id);

    const names = uids
      .map((uid) => nameByUid.get(uid) ?? "")
      .filter(Boolean);
    if (names.length > 0) {
      labels.set(registrationId, names.join(" / "));
    }
  }

  for (const payerUid of payerUids) {
    const name = nameByUid.get(payerUid);
    if (name) labels.set(`payer:${payerUid}`, name);
  }

  return labels;
}
async function fetchPendingOrganizerWithdrawalDocs(
  db: ReturnType<typeof getFirestore>,
): Promise<QueryDocumentSnapshot[]> {
  const col = db.collection(ORGANIZER_WITHDRAWALS);
  try {
    const snap = await col
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    return snap.docs;
  } catch (err) {
    if (!isFirestoreIndexError(err)) throw err;
    const snap = await col.where("status", "==", "pending").limit(100).get();
    return [...snap.docs].sort((a, b) => {
      const ta = (a.data().createdAt as Timestamp | undefined)?.toMillis?.() ?? 0;
      const tb = (b.data().createdAt as Timestamp | undefined)?.toMillis?.() ?? 0;
      return tb - ta;
    });
  }
}

export const listPendingOrganizerWithdrawals = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  await assertPlatformAdmin(uid);

  const db = getFirestore();
  const docs = await fetchPendingOrganizerWithdrawalDocs(db);
  const organizerIds = new Set<string>();
  const items = docs.map((docSnap) => {
    const data = docSnap.data();
    const organizerId = (data.organizerId as string | undefined)?.trim() ?? "";
    if (organizerId) organizerIds.add(organizerId);
    const createdAt = data.createdAt as Timestamp | undefined;
    return {
      id: docSnap.id,
      organizerId,
      amountReais: Number(data.amountReais) || 0,
      pixKey: (data.pixKey as string | undefined) ?? "",
      status: (data.status as string | undefined) ?? "pending",
      payoutStatus: (data.payoutStatus as string | undefined) ?? null,
      payoutError: (data.payoutError as string | undefined) ?? null,
      asaasTransferId: (data.asaasTransferId as string | undefined) ?? null,
      createdAt: createdAt?.toDate?.()?.toISOString() ?? null,
    };
  });

  const names: Record<string, string> = {};
  await Promise.all(
    [...organizerIds].map(async (organizerId) => {
      const userSnap = await db.collection("users").doc(organizerId).get();
      names[organizerId] =
        (userSnap.data()?.displayName as string | undefined)?.trim() || organizerId;
    }),
  );

  return {
    items: items.map((row) => ({
      ...row,
      organizerName: names[row.organizerId] ?? row.organizerId,
    })),
  };
});

export const reviewOrganizerWithdrawal = onCall(
  {region: CLIENT_FACING_REGIONS, secrets: [...asaasArenaSecrets]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
    await assertPlatformAdmin(uid);

    const data = (request.data ?? {}) as {
      withdrawalId?: string;
      decision?: string;
      note?: string;
    };
    const withdrawalId = data.withdrawalId?.trim() ?? "";
    const decision = data.decision?.trim().toLowerCase() ?? "";
    const note = data.note?.trim() ?? "";

    if (!withdrawalId) {
      throw new HttpsError("invalid-argument", "withdrawalId é obrigatório");
    }
    if (
      decision !== "approved" &&
      decision !== "approved_manual" &&
      decision !== "rejected"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "decision deve ser approved, approved_manual ou rejected",
      );
    }

    const db = getFirestore();
    const ref = db.collection(ORGANIZER_WITHDRAWALS).doc(withdrawalId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Solicitação de saque não encontrada");
    }
    const w = snap.data()!;
    if ((w.status as string | undefined)?.toLowerCase() !== "pending") {
      throw new HttpsError("failed-precondition", "Saque já foi revisado.");
    }

    const amountReais = Number(w.amountReais) || 0;

    if (decision === "rejected") {
      const target = resolveWithdrawalWalletTarget(w);
      if (target.kind === "tournament") {
        await releaseTournamentWithdrawalReservation(db, target.tournamentId, amountReais, false);
      } else {
        await releaseOrganizerWithdrawalReservation(db, target.organizerId, amountReais, false);
      }
      await ref.update({
        status: "rejected",
        reviewedBy: uid,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewNote: note || null,
      });
      return {withdrawalId, status: "rejected"};
    }

    if (decision === "approved_manual") {
      const target = resolveWithdrawalWalletTarget(w);
      if (target.kind === "tournament") {
        await releaseTournamentWithdrawalReservation(db, target.tournamentId, amountReais, true);
      } else {
        await releaseOrganizerWithdrawalReservation(db, target.organizerId, amountReais, true);
      }
      await ref.update({
        status: "approved",
        payoutStatus: "manual",
        payoutError: FieldValue.delete(),
        reviewedBy: uid,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewNote: note || "PIX enviado manualmente fora do sistema",
      });
      return {withdrawalId, status: "approved", payoutStatus: "manual"};
    }

    try {
      const result = await completeOrganizerWithdrawalPayout(db, ref, w, uid, note);
      return {
        withdrawalId,
        status: result.status,
        payoutStatus: result.payoutStatus,
        asaasTransferId: result.payoutId,
      };
    } catch (e) {
      if (isAsaasPayoutError(e)) {
        throw new HttpsError("failed-precondition", e.message);
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "PIX_KEY_INVALID") {
        throw new HttpsError("invalid-argument", "Chave PIX do saque inválida.");
      }
      if (msg === "WITHDRAWAL_RESERVATION_INVALID") {
        throw new HttpsError(
          "failed-precondition",
          "Reserva de saldo inconsistente. Rejeite o saque e peça nova solicitação.",
        );
      }
      throw new HttpsError("internal", "Falha ao processar o saque.");
    }
  },
);
