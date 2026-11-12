/** Card do plano de aula na lista — mesmo desenho do card dos Planos de horário. Regras puras. */
import {
  CLASS_PAYMENT_FORM_LABEL,
  CYCLE_LABEL,
  PLAN_CYCLES,
  brl,
  planCycles,
  planDetail,
  type ClassPlan,
  type Enrollment,
} from './billing.model';

export interface PlanCardView {
  plan: ClassPlan;
  /** "2 AULAS/SEMANA · 3 PROFESSORES" (o card mostra em mono, caixa alta no CSS). */
  sub: string;
  pill: { label: string; tone: 'green' | 'dim' | 'blue' };
  price: string;
  unit: string;
  /** "até −15% no anual" (melhor desconto de ciclo), ou vazio. */
  offer: string;
  chips: string[];
  students: number;
  /** Receita do mês dos alunos ativos (mensal) ou "à vista"/"—". */
  revenue: string;
}

/** Alunos ativos e receita mensal por plano (valor de cada matrícula, que guarda o do ciclo). */
export function planActivity(enrollments: readonly Enrollment[]): Map<string, { students: number; monthlyReais: number }> {
  const out = new Map<string, { students: number; monthlyReais: number }>();
  for (const e of enrollments) {
    if (e.status !== 'active') continue;
    const cur = out.get(e.plan.planId) ?? { students: 0, monthlyReais: 0 };
    cur.students += 1;
    if (e.plan.kind === 'monthly') cur.monthlyReais += e.plan.priceReais;
    out.set(e.plan.planId, cur);
  }
  return out;
}

function dueLabel(plan: ClassPlan): string {
  if (plan.billing.dueDayOptions.length > 0) return `Venc. ${plan.billing.dueDayOptions.join('/')}`;
  if (plan.billing.dueDay != null) return `Venc. dia ${plan.billing.dueDay}`;
  return 'Venc. das Regras';
}

export function planCardView(
  plan: ClassPlan,
  activity: { students: number; monthlyReais: number } | undefined,
  teacherCount: number,
): PlanCardView {
  const teachers = plan.kind === 'single' ? '' :
    plan.teacherIds.length === 0 ? 'qualquer professor' :
      `${teacherCount} professor${teacherCount === 1 ? '' : 'es'}`;
  const sub = [planDetail(plan), teachers].filter(Boolean).join(' · ');
  const pill: PlanCardView['pill'] = plan.status === 'archived'
    ? { label: 'Arquivado', tone: 'dim' }
    : plan.availableInApp ? { label: 'No app', tone: 'green' } : { label: 'Só recepção', tone: 'blue' };

  const chips: string[] = [];
  let offer = '';
  if (plan.kind === 'monthly') {
    const cycles = planCycles(plan);
    for (const c of cycles) chips.push(c.discountPercent > 0 ? `${CYCLE_LABEL[c.cycle]} −${c.discountPercent}%` : CYCLE_LABEL[c.cycle]);
    const best = cycles.reduce((b, c) => (c.discountPercent > (b?.discountPercent ?? 0) ? c : b), cycles[0]);
    if (best && best.discountPercent > 0) offer = `até −${best.discountPercent}% no ${CYCLE_LABEL[best.cycle].toLowerCase()}`;
    chips.push(plan.billing.methods.map((m) => CLASS_PAYMENT_FORM_LABEL[m]).join(' · '));
    chips.push(dueLabel(plan));
  } else if (plan.kind === 'package') {
    chips.push(`${plan.credits ?? 0} créditos`, `${plan.validityDays ?? 0} dias`);
  } else {
    chips.push('Avulsa');
  }

  const students = activity?.students ?? 0;
  const revenue = plan.kind === 'monthly'
    ? (students > 0 ? `${brl(activity?.monthlyReais ?? 0)}/mês` : '—')
    : plan.kind === 'package' ? 'à vista' : '—';
  return {
    plan,
    sub,
    pill,
    price: plan.priceReais > 0 ? brl(plan.priceReais) : 'Grátis',
    unit: plan.kind === 'monthly' ? '/mês' : plan.kind === 'package' ? 'o pacote' : 'a aula',
    offer,
    chips: chips.filter(Boolean),
    students,
    revenue,
  };
}

/** Números do topo da lista. */
export function plansStats(plans: readonly ClassPlan[], enrollments: readonly Enrollment[]) {
  const live = plans.filter((p) => p.status !== 'archived');
  const active = enrollments.filter((e) => e.status === 'active');
  return {
    onSale: live.length,
    inApp: live.filter((p) => p.availableInApp && p.kind !== 'single').length,
    students: active.length,
    plansWithStudents: new Set(active.map((e) => e.plan.planId)).size,
    monthlyReais: active.filter((e) => e.plan.kind === 'monthly').reduce((s, e) => s + e.plan.priceReais, 0),
    withCycles: live.filter((p) => p.kind === 'monthly' && PLAN_CYCLES.some((c) => c !== 'monthly' && p.cycles[c].enabled)).length,
  };
}
