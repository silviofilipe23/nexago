import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { organizerFirestore } from './firestore';
import { organizerFunctions } from './functions';

/** Caixa do torneio (`tournamentWallets/{tournamentId}`) + o extrato e os saques dele.
 *
 *  Desde 16/09/2026 o dinheiro das inscrições cai no caixa do EVENTO, não mais na
 *  carteira por pessoa: qualquer gestor da equipe do torneio saca dele, sempre para a
 *  PRÓPRIA chave PIX, que é dado da pessoa (`organizerPayoutProfiles/{uid}`) e não do
 *  caixa. Toda escrita passa por Cloud Function (`setOrganizerPayoutPixKey`/
 *  `requestOrganizerWithdrawal`); do Firestore o client só lê o saldo, porque a
 *  relação gestor → torneio não cabe nas rules a ponto de listar os caixas — quem
 *  sabe calcular esse alcance é a callable `loadOrganizerWalletView`.
 *
 *  `watchWallet` (carteira por uid, `organizerWallets/{uid}`) segue aqui só porque
 *  Início e Config ainda leem dela; sai quando essas duas telas saírem. */

export interface OrganizerWalletSummary {
  availableReais: number;
  pendingReais: number;
  payoutPixKey: string;
  payoutPixKeyType: string;
}

export interface OrganizerLedgerEntry {
  id: string;
  netReais: number;
  grossReais: number;
  platformFeeReais: number;
  createdAt: Date | null;
  /** Dupla/equipe ou pagador — resolvido na callable a partir da inscrição. */
  athleteLabel: string;
}

export interface OrganizerWithdrawal {
  id: string;
  amountReais: number;
  status: string;
  /** Destino do saque. O caixa é compartilhado, então esta linha pode ser o saque de
   *  outra pessoa da equipe — e nesse caso a chave já chega MASCARADA do servidor
   *  (`buildWithdrawalRow`). A tela exibe o que recebe, sem re-mascarar. */
  pixKey: string;
  /** uid de quem pediu o saque. */
  requestedBy: string;
  /** `true` quando quem pediu não é o dono do evento — foi um gestor da equipe. */
  requestedByStaff: boolean;
  createdAt: Date | null;
  payoutStatus: string | null;
}

function numberOf(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

const EMPTY_WALLET: OrganizerWalletSummary = { availableReais: 0, pendingReais: 0, payoutPixKey: '', payoutPixKeyType: '' };

export function watchWallet(uid: string, cb: (w: OrganizerWalletSummary) => void): () => void {
  const db = organizerFirestore();
  return onSnapshot(
    doc(db, 'organizerWallets', uid),
    (snap) => {
      const d = snap.data() as Record<string, unknown> | undefined;
      cb({
        availableReais: numberOf(d?.['availableReais']),
        pendingReais: numberOf(d?.['pendingReais']),
        payoutPixKey: optionalStr(d?.['payoutPixKey']) ?? '',
        payoutPixKeyType: optionalStr(d?.['payoutPixKeyType']) ?? '',
      });
    },
    () => cb(EMPTY_WALLET),
  );
}



export class OrganizerWalletError extends Error {}

function mapCallableError(err: unknown): OrganizerWalletError {
  const message = err instanceof Error && err.message ? err.message : 'Não foi possível concluir a operação. Tente novamente.';
  return new OrganizerWalletError(message);
}

/** Grava a chave de repasse da PESSOA e devolve o que o servidor guardou de fato.
 *  O que foi digitado não é necessariamente o que fica gravado: o servidor normaliza
 *  a chave (`resolveWithdrawalPixFields` — telefone ganha `+55`, tipo vira maiúscula)
 *  e ecoa o valor final. Quem mostra DESTINO DE SAQUE tem de exibir o eco, não o
 *  rascunho do formulário. */
export async function setPayoutPixKey(pixKey: string, pixKeyType: string): Promise<OrganizerPayoutProfile> {
  const functions = organizerFunctions();
  try {
    const result = await httpsCallable<Record<string, unknown>, Record<string, unknown>>(
      functions,
      'setOrganizerPayoutPixKey',
    )({ pixKey, pixKeyType });
    return parseSavedPayout(result.data, { pixKey, pixKeyType });
  } catch (err) {
    throw mapCallableError(err);
  }
}

/** Perfil de repasse depois de um save bem-sucedido: o eco do servidor quando vem,
 *  senão o que foi enviado (deploy antigo da callable, que não ecoava). `hasPixKey`
 *  é derivado do mesmo piso de 5 caracteres que o servidor usa (`hasUsablePixKey`),
 *  porque este retorno não traz o flag. */
export function parseSavedPayout(
  data: Record<string, unknown>,
  sent: { pixKey: string; pixKeyType: string },
): OrganizerPayoutProfile {
  const pixKey = optionalStr(data['pixKey']) ?? sent.pixKey.trim();
  return {
    pixKey,
    pixKeyType: optionalStr(data['pixKeyType']) ?? sent.pixKeyType.trim().toUpperCase(),
    hasPixKey: pixKey.length >= 5,
  };
}

export interface WithdrawalRequestResult {
  withdrawalId: string;
  status: string;
  payoutStatus: string | null;
  autoProcessed: boolean;
  message: string | null;
}

/** Um caixa de torneio que o usuário alcança — dono ou gestor da equipe do evento. */
export interface TournamentWalletRow {
  tournamentId: string;
  tournamentName: string;
  availableReais: number;
  pendingReais: number;
}

/** Chave PIX de saque de quem está logado (`organizerPayoutProfiles/{uid}`). É da
 *  PESSOA, não do caixa: cada um saca para a sua, e por isso é sempre editável. */
export interface OrganizerPayoutProfile {
  pixKey: string;
  pixKeyType: string;
  hasPixKey: boolean;
}

export interface TournamentWalletView {
  tournaments: TournamentWalletRow[];
  /** `null` = o usuário não alcança caixa nenhum (é o caso do administrador do
   *  evento e de quem ainda não tem evento com dinheiro). */
  selected: TournamentWalletRow | null;
  payout: OrganizerPayoutProfile;
  ledger: OrganizerLedgerEntry[];
  withdrawals: OrganizerWithdrawal[];
}

function isoToDate(v: unknown): Date | null {
  const d = typeof v === 'string' ? new Date(v) : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
}

function boolOf(v: unknown): boolean {
  return v === true;
}

function walletRow(raw: Record<string, unknown>): TournamentWalletRow {
  return {
    tournamentId: optionalStr(raw['tournamentId']) ?? '',
    tournamentName: optionalStr(raw['tournamentName']) ?? 'Torneio',
    availableReais: numberOf(raw['availableReais']),
    pendingReais: numberOf(raw['pendingReais']),
  };
}

/** Parse do retorno de `loadOrganizerWalletView`, separado da chamada porque é a
 *  única parte testável sem Firebase — e é onde a forma do contrato é fixada. */
export function parseWalletView(data: Record<string, unknown>): TournamentWalletView {
  const rawSelected = data['selected'];
  return {
    tournaments: (Array.isArray(data['tournaments']) ? data['tournaments'] : []).map((t) =>
      walletRow(t as Record<string, unknown>),
    ),
    selected:
      rawSelected && typeof rawSelected === 'object'
        ? walletRow(rawSelected as Record<string, unknown>)
        : null,
    payout: parsePayout(data['payout']),
    ledger: (Array.isArray(data['ledger']) ? data['ledger'] : []).map((e) => {
      const row = e as Record<string, unknown>;
      return {
        id: optionalStr(row['id']) ?? '',
        netReais: numberOf(row['netReais']),
        grossReais: numberOf(row['grossReais']),
        platformFeeReais: numberOf(row['platformFeeReais']),
        createdAt: isoToDate(row['createdAt']),
        athleteLabel: optionalStr(row['athleteLabel']) ?? '',
      };
    }),
    withdrawals: (Array.isArray(data['withdrawals']) ? data['withdrawals'] : []).map((x) => {
      const row = x as Record<string, unknown>;
      return {
        id: optionalStr(row['id']) ?? '',
        amountReais: numberOf(row['amountReais']),
        status: optionalStr(row['status']) ?? 'pending',
        // Como veio: a máscara de chave de terceiro é do servidor.
        pixKey: optionalStr(row['pixKey']) ?? '',
        requestedBy: optionalStr(row['requestedBy']) ?? '',
        requestedByStaff: boolOf(row['requestedByStaff']),
        createdAt: isoToDate(row['createdAt']),
        payoutStatus: optionalStr(row['payoutStatus']),
      };
    }),
  };
}

function parsePayout(raw: unknown): OrganizerPayoutProfile {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    pixKey: optionalStr(row['pixKey']) ?? '',
    pixKeyType: optionalStr(row['pixKeyType']) ?? '',
    hasPixKey: boolOf(row['hasPixKey']),
  };
}

/** Uma chamada para a lista de caixas + extrato/saques do escolhido.
 *  `tournamentId` ausente (ou fora do alcance) devolve o caixa mais cheio — a
 *  decisão é do servidor, o portal não escolhe por conta. */
export async function loadWalletView(tournamentId?: string, ledgerLimit?: number): Promise<TournamentWalletView> {
  const functions = organizerFunctions();
  try {
    const result = await httpsCallable<Record<string, unknown>, Record<string, unknown>>(
      functions,
      'loadOrganizerWalletView',
    )({ ...(tournamentId ? { tournamentId } : {}), ...(ledgerLimit ? { ledgerLimit } : {}) });
    return parseWalletView(result.data);
  } catch (err) {
    throw mapCallableError(err);
  }
}

/** Saque do caixa de um torneio. A chave PIX NÃO vai no payload: o destino é
 *  sempre o perfil de quem pede, resolvido no servidor. */
export async function requestWithdrawal(tournamentId: string, amountReais: number): Promise<WithdrawalRequestResult> {
  const functions = organizerFunctions();
  try {
    const result = await httpsCallable<Record<string, unknown>, Record<string, unknown>>(
      functions,
      'requestOrganizerWithdrawal',
    )({ tournamentId, amountReais });
    const data = result.data;
    return {
      withdrawalId: optionalStr(data['withdrawalId']) ?? '',
      status: optionalStr(data['status']) ?? 'pending',
      payoutStatus: optionalStr(data['payoutStatus']),
      autoProcessed: data['autoProcessed'] === true,
      message: optionalStr(data['message']),
    };
  } catch (err) {
    throw mapCallableError(err);
  }
}

/** Saldo do doc do caixa. Doc ausente é zero de verdade — caixa que nunca creditou —,
 *  e é o mesmo zero que a callable devolve nesse caso (`buildWalletViewRows`). */
export function walletBalanceFromDoc(data: Record<string, unknown> | undefined): {
  availableReais: number;
  pendingReais: number;
} {
  return { availableReais: numberOf(data?.['availableReais']), pendingReais: numberOf(data?.['pendingReais']) };
}

/** Saldo do caixa ao vivo. Virou possível na Fase 1: as rules passaram a liberar
 *  a leitura de `tournamentWallets/{id}` para dono e gestor, então o saldo não
 *  precisa mais de callable.
 *
 *  ERRO DE LEITURA NÃO CHAMA O CALLBACK. Este listener só existe para atualizar um
 *  saldo que a callable já entregou certo; zerar na falha reproduzia o bug que abriu
 *  este projeto — saldo correto virando R$ 0,00, "Máximo disponível: R$ 0,00" e saque
 *  impossível, sem explicação nenhuma. Os cenários de falha reais aqui são rules não
 *  deployadas no projeto alvo, offline e erro transitório: em todos eles o certo é o
 *  saldo ficar parado no valor da callable. */
export function watchTournamentWallet(
  tournamentId: string,
  cb: (w: { availableReais: number; pendingReais: number }) => void,
): () => void {
  const db = organizerFirestore();
  return onSnapshot(
    doc(db, 'tournamentWallets', tournamentId),
    (snap) => cb(walletBalanceFromDoc(snap.data() as Record<string, unknown> | undefined)),
    () => {
      /* de propósito: ver o comentário acima — o erro não pode apagar o saldo em tela. */
    },
  );
}
