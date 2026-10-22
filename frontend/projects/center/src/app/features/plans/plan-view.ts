import { holdsSeat } from '../../domain/enrollment';
import type { Enrollment, Plan, PlanType } from '../../domain/models';

type RuleFields = { type?: PlanType; planType?: PlanType } & Pick<Plan, 'classesPerWeek' | 'makeupsPerMonth' | 'credits' | 'validityDays'>;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Regra do plano/contrato numa linha: "2 aulas/semana · 1 reposição/mês" ou "8 créditos · validade 60 dias". */
export function planRule(p: RuleFields): string {
  const type = p.type ?? p.planType;
  if (type === 'class_pack') {
    const parts = [plural(p.credits ?? 0, 'crédito', 'créditos')];
    if (p.validityDays) {
      parts.push(`validade ${p.validityDays} dias`);
    }
    return parts.join(' · ');
  }
  const parts = [`${p.classesPerWeek ?? 0}x/semana`];
  if (p.makeupsPerMonth != null) {
    parts.push(plural(p.makeupsPerMonth, 'reposição/mês', 'reposições/mês'));
  }
  return parts.join(' · ');
}

export function priceSuffix(type: PlanType): string {
  return type === 'class_pack' ? 'total' : '/mês';
}

export interface PlanContracts {
  count: number;
  /** Preços contratados distintos (o snapshot de cada matrícula), do menor pro maior. */
  prices: number[];
}

/** Contratos REAIS de cada plano: matrículas que ocupam vaga (pendente, ativa, pausada). */
export function contractsByPlan(enrollments: Enrollment[]): Map<string, PlanContracts> {
  const out = new Map<string, PlanContracts>();
  for (const e of enrollments) {
    if (!e.planId || !holdsSeat(e.status)) {
      continue;
    }
    const c = out.get(e.planId) ?? { count: 0, prices: [] };
    c.count++;
    const price = e.contract?.priceCents;
    if (price != null && !c.prices.includes(price)) {
      c.prices.push(price);
      c.prices.sort((a, b) => a - b);
    }
    out.set(e.planId, c);
  }
  return out;
}

export interface PlanDraft {
  name: string;
  type: PlanType;
  /** Só na criação (edição de preço tem fluxo próprio). null = inválido/ausente. */
  priceCents: number | null;
  classesPerWeek: number;
  makeupsPerMonth: number;
  credits: number;
  validityDays: number;
}

/** Primeiro problema do formulário de plano, ou null se dá pra salvar. */
export function planDraftError(d: PlanDraft, creating: boolean): string | null {
  if (d.name.trim().length < 2) {
    return 'Dê um nome ao plano.';
  }
  if (creating && (d.priceCents == null || d.priceCents <= 0)) {
    return 'Informe um preço válido.';
  }
  const int = (n: number) => Number.isInteger(n);
  if (d.type === 'monthly') {
    if (!int(d.classesPerWeek) || d.classesPerWeek < 1 || d.classesPerWeek > 7) {
      return 'Aulas por semana: de 1 a 7.';
    }
    if (!int(d.makeupsPerMonth) || d.makeupsPerMonth < 0 || d.makeupsPerMonth > 31) {
      return 'Reposições por mês: de 0 a 31.';
    }
  } else {
    if (!int(d.credits) || d.credits < 1 || d.credits > 200) {
      return 'Créditos: de 1 a 200.';
    }
    if (!int(d.validityDays) || d.validityDays < 1 || d.validityDays > 730) {
      return 'Validade: de 1 a 730 dias.';
    }
  }
  return null;
}
