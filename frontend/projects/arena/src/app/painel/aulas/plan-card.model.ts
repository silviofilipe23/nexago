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

/** Professor como o card mostra (pilha de avatares). */
export interface CardTeacher {
  id: string;
  name: string;
  photoUrl: string | null;
}

/** Até 4 avatares na pilha; o resto vira "+N". */
export const CARD_AVATAR_MAX = 4;

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
  /** Professores do plano para a pilha de avatares (vazio = qualquer professor). */
  teachers: CardTeacher[];
  /** Quantos não couberam na pilha. */
  moreTeachers: number;
  /** "Thiago Mendes" / "3 professores" / "Qualquer professor da arena". */
  teachersLabel: string;
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
  /** Professores ativos da arena (os do plano saem daqui, na ordem do plano). */
  arenaTeachers: readonly CardTeacher[],
): PlanCardView {
  const byId = new Map(arenaTeachers.map((t) => [t.id, t]));
  const planTeachers = plan.kind === 'single' ? [] :
    plan.teacherIds.map((id) => byId.get(id)).filter((t): t is CardTeacher => t != null);
  const teacherCount = planTeachers.length;
  const teachersText = plan.kind === 'single' ? '' :
    plan.teacherIds.length === 0 ? 'qualquer professor' :
      `${teacherCount} professor${teacherCount === 1 ? '' : 'es'}`;
  const sub = [planDetail(plan), teachersText].filter(Boolean).join(' · ');
  const teachersLabel = plan.kind === 'single' ? '' :
    plan.teacherIds.length === 0 ? 'Qualquer professor da arena' :
      teacherCount === 1 ? planTeachers[0]!.name : `${teacherCount} professores`;
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
    teachers: planTeachers.slice(0, CARD_AVATAR_MAX),
    moreTeachers: Math.max(0, teacherCount - CARD_AVATAR_MAX),
    teachersLabel,
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
