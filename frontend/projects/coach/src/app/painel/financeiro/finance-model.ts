import type { PlanCycle } from './finance-rules';

export type ChargeStatus = 'pendente' | 'pago' | 'cancelado';
export type EnrollmentStatus = 'ativa' | 'encerrada';
export type PaymentMethod = 'pix' | 'dinheiro' | 'cartao' | 'outro';

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  outro: 'Outro',
};

export interface Plan {
  id: string;
  name: string;
  amountCents: number;
  cycle: PlanCycle;
  description: string;
  active: boolean;
}

export interface Enrollment {
  athleteUid: string;
  athleteName: string;
  planId: string;
  startDate: string;
  dueDay: number;
  status: EnrollmentStatus;
}

export interface Charge {
  id: string;
  athleteUid: string;
  athleteName: string;
  planId: string;
  planName: string;
  periodKey: string;
  amountCents: number;
  dueDate: string;
  status: ChargeStatus;
  paidAt: string | null;
  method: PaymentMethod | null;
  note: string;
}

type Data = Record<string, unknown> | undefined;

function str(data: Data, key: string): string {
  const value = data?.[key];
  return typeof value === 'string' ? value : '';
}

function int(data: Data, key: string): number {
  const value = data?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
}

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function readPlan(id: string, data: Data): Plan {
  return {
    id,
    name: str(data, 'name'),
    amountCents: int(data, 'amountCents'),
    cycle: oneOf(str(data, 'cycle'), ['mensal', 'trimestral', 'anual'] as const, 'mensal'),
    description: str(data, 'description'),
    active: data?.['active'] !== false,
  };
}

export function readEnrollment(id: string, data: Data): Enrollment {
  return {
    athleteUid: str(data, 'athleteUid') || id,
    athleteName: str(data, 'athleteName'),
    planId: str(data, 'planId'),
    startDate: str(data, 'startDate'),
    dueDay: int(data, 'dueDay') || 5,
    status: oneOf(str(data, 'status'), ['ativa', 'encerrada'] as const, 'ativa'),
  };
}

export function readCharge(id: string, data: Data): Charge {
  const method = str(data, 'method');
  return {
    id,
    athleteUid: str(data, 'athleteUid'),
    athleteName: str(data, 'athleteName'),
    planId: str(data, 'planId'),
    planName: str(data, 'planName'),
    periodKey: str(data, 'periodKey'),
    amountCents: int(data, 'amountCents'),
    dueDate: str(data, 'dueDate'),
    status: oneOf(str(data, 'status'), ['pendente', 'pago', 'cancelado'] as const, 'pendente'),
    paidAt: str(data, 'paidAt') || null,
    method: method ? oneOf(method, ['pix', 'dinheiro', 'cartao', 'outro'] as const, 'outro') : null,
    note: str(data, 'note'),
  };
}
