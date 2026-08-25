/** Espelha `arenas/{arenaId}/fiscal/config` gravado pelas functions. */

export type FiscalMode = 'always' | 'on_demand' | 'off';
export type FiscalConfigStatus = 'draft' | 'testing' | 'active' | 'error';

export const FISCAL_MODE_LABEL: Record<FiscalMode, string> = {
  always: 'Emitir sempre',
  on_demand: 'Só quando o cliente pedir',
  off: 'Desligado',
};

const FISCAL_CONFIG_STATUS_LABEL: Record<FiscalConfigStatus, string> = {
  draft: 'Rascunho',
  testing: 'Em teste',
  active: 'Ativa',
  error: 'Com erro',
};

export function fiscalConfigStatusLabel(status: FiscalConfigStatus): string {
  return FISCAL_CONFIG_STATUS_LABEL[status];
}

export interface FiscalServiceView {
  id: string;
  codigoMunicipal: string;
  descricao: string;
  aliquotaIss: number;
}

export interface ArenaFiscalConfigView {
  cnpj: string;
  razaoSocial: string;
  inscricaoMunicipal: string;
  services: FiscalServiceView[];
  defaultServiceIdBooking: string | null;
  defaultServiceIdClub: string | null;
  mode: FiscalMode;
  status: FiscalConfigStatus;
  statusMessage: string | null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Config incompleta é normal: o wizard grava em etapas. */
export function mapFiscalConfig(raw: Record<string, unknown> | undefined): ArenaFiscalConfigView | null {
  if (!raw) return null;
  const services = Array.isArray(raw['services']) ? (raw['services'] as FiscalServiceView[]) : [];
  return {
    cnpj: asString(raw['cnpj']),
    razaoSocial: asString(raw['razaoSocial']),
    inscricaoMunicipal: asString(raw['inscricaoMunicipal']),
    services,
    defaultServiceIdBooking: (raw['defaultServiceIdBooking'] as string) ?? null,
    defaultServiceIdClub: (raw['defaultServiceIdClub'] as string) ?? null,
    mode: (raw['mode'] as FiscalMode) ?? 'off',
    status: (raw['status'] as FiscalConfigStatus) ?? 'draft',
    statusMessage: (raw['statusMessage'] as string) ?? null,
  };
}
