/** Passos do fluxo de inscrição (UI). */
export type RegistrationStep = 'category' | 'partner' | 'confirmation' | 'payment' | 'success';

/** Snapshot persistido no localStorage. */
export type RegistrationPaymentStatus = 'idle' | 'pending' | 'approved' | 'rejected';

export interface RegistrationTournament {
  id: string;
  name: string;
  city: string;
  location: string;
  dateLabel: string;
  enrolledCount: number;
  spotsLeft: number;
  spotsTotal: number;
  statusLabel: string;
  /** Ex.: "Circuito Verão NexaGO · Etapa Nordeste" quando o torneio faz parte de uma liga. */
  leagueContextLabel?: string;
}

/** Categoria ofertada no checkout (espelha mock de detalhe + valor numérico). */
export interface RegistrationCategory {
  id: string;
  name: string;
  level: string;
  spotsLeft: number;
  spotsTotal: number;
  priceLabel: string;
  /** Valor em reais (inteiro) extraído de priceLabel. */
  priceReais: number;
}

export type PartnerLinkStatus = 'pending' | 'confirmed';

export type PartnerSource = 'invite' | 'existing' | 'matchmaking';

export interface RegistrationPartner {
  id: string;
  displayName: string;
  handle?: string;
  status: PartnerLinkStatus;
  source: PartnerSource;
  /** Preenchido quando convite por e-mail / @handle. */
  inviteTarget?: string;
}

export type PaymentInstallmentChoice = 'full' | 'half';

/** Estado completo do rascunho (memória + persistência). */
export interface RegistrationDraft {
  tournamentId: string;
  step: RegistrationStep;
  category: RegistrationCategory | null;
  partner: RegistrationPartner | null;
  paymentOption: PaymentInstallmentChoice | null;
  paymentStatus: RegistrationPaymentStatus;
}

export interface PersistedRegistrationPayload {
  v: 1;
  tournamentId: string;
  step: RegistrationStep;
  categoryId: string | null;
  partner: RegistrationPartner | null;
  paymentOption: PaymentInstallmentChoice | null;
  paymentStatus: RegistrationPaymentStatus;
}

export function parsePriceLabelToReais(label: string): number {
  const digits = label.replace(/\D/g, '');
  if (!digits) return 0;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}
