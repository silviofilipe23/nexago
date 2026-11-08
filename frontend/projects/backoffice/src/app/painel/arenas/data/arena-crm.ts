import type { PillTone } from '../../ui/pill.component';

/** Status comercial da arena (CRM simples do backoffice). Espelha a lista das rules de `arenaCrm`. */
export type ArenaCrmStatus = 'not_contacted' | 'contacted' | 'negotiating' | 'not_interested' | 'registered';

export const CRM_STATUSES: readonly { id: ArenaCrmStatus; label: string; tone: PillTone }[] = [
  { id: 'not_contacted', label: 'Não contatada', tone: 'dim' },
  { id: 'contacted', label: 'Contato realizado', tone: 'yellow' },
  { id: 'negotiating', label: 'Em negociação', tone: 'orange' },
  { id: 'not_interested', label: 'Sem interesse', tone: 'red' },
  { id: 'registered', label: 'Cadastrada', tone: 'green' },
];

export interface ArenaCrmEntry {
  status: ArenaCrmStatus;
  note: string | null;
  updatedAtMs: number | null;
  updatedByName: string | null;
}

export function isCrmStatus(value: unknown): value is ArenaCrmStatus {
  return typeof value === 'string' && CRM_STATUSES.some((s) => s.id === value);
}

export function crmLabel(status: ArenaCrmStatus): string {
  return CRM_STATUSES.find((s) => s.id === status)?.label ?? status;
}

export function crmTone(status: ArenaCrmStatus): PillTone {
  return CRM_STATUSES.find((s) => s.id === status)?.tone ?? 'dim';
}

/**
 * Status de uma arena sem registro no CRM: quem já tem conta (não é pré-cadastro) já está
 * "Cadastrada"; pré-cadastro ainda não foi trabalhado ("Não contatada"). O registro gravado
 * sempre vence — o comercial pode marcar uma arena com conta como "Em negociação" de plano.
 */
export function effectiveCrmStatus(unclaimed: boolean, entry: ArenaCrmEntry | undefined): ArenaCrmStatus {
  if (entry) return entry.status;
  return unclaimed ? 'not_contacted' : 'registered';
}
