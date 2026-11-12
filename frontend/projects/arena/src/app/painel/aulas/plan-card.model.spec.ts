import { DEFAULT_PLAN_BILLING, DEFAULT_PLAN_CYCLES, type ClassPlan, type Enrollment } from './billing.model';
import { planActivity, planCardView, plansStats } from './plan-card.model';

function plan(over: Partial<ClassPlan> = {}): ClassPlan {
  return {
    id: 'p1', name: 'Vôlei 2x', kind: 'monthly', priceReais: 260, classesPerWeek: 2, makeupsPerMonth: 1,
    credits: null, validityDays: null, description: null, status: 'active', teacherIds: ['t1', 't2'],
    availableInApp: true, cycles: DEFAULT_PLAN_CYCLES, billing: DEFAULT_PLAN_BILLING, ...over,
  };
}

function enrollment(planId: string, priceReais: number, status: Enrollment['status'] = 'active'): Enrollment {
  return { status, plan: { planId, kind: 'monthly', priceReais } } as unknown as Enrollment;
}

describe('card do plano de aula (padrão dos Planos de horário)', () => {
  it('mensal com ciclos, formas e vencimento à escolha', () => {
    const c = planCardView(plan({
      cycles: { ...DEFAULT_PLAN_CYCLES, quarterly: { enabled: true, discountPercent: 10 }, annual: { enabled: true, discountPercent: 15 } },
      billing: { methods: ['pix', 'onsite'], dueDay: 5, dueDayOptions: [5, 15, 25] },
    }), { students: 3, monthlyReais: 720 }, 2);
    expect(c.pill).toEqual({ label: 'No app', tone: 'green' });
    expect(c.offer).toBe('até −15% no anual');
    expect(c.chips).toEqual(['Mensal', 'Trimestral −10%', 'Anual −15%', 'Pix · Na arena', 'Venc. 5/15/25']);
    expect(c.sub).toContain('2 professores');
    expect(c.revenue).toContain('720');
    expect(c.unit).toBe('/mês');
  });

  it('selo: só recepção e arquivado; pacote mostra créditos', () => {
    expect(planCardView(plan({ availableInApp: false }), undefined, 0).pill.label).toBe('Só recepção');
    expect(planCardView(plan({ status: 'archived' }), undefined, 0).pill.label).toBe('Arquivado');
    const pkg = planCardView(plan({ kind: 'package', credits: 10, validityDays: 60, teacherIds: [] }), undefined, 0);
    expect(pkg.chips).toEqual(['10 créditos', '60 dias']);
    expect(pkg.sub).toContain('qualquer professor');
  });

  it('atividade e números do topo', () => {
    const enrollments = [enrollment('p1', 260), enrollment('p1', 234), enrollment('p2', 160, 'canceled')];
    expect(planActivity(enrollments).get('p1')).toEqual({ students: 2, monthlyReais: 494 });
    const stats = plansStats([plan(), plan({ id: 'p2', availableInApp: false }), plan({ id: 'p3', status: 'archived' })], enrollments);
    expect(stats.onSale).toBe(2);
    expect(stats.inApp).toBe(1);
    expect(stats.students).toBe(2);
    expect(stats.monthlyReais).toBe(494);
  });
});
