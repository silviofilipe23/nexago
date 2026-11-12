import { DEFAULT_CANCELLATION_POLICY, DEFAULT_PLAN_BILLING, DEFAULT_PLAN_CYCLES, type ClassPlan, type Enrollment } from './billing.model';
import { planActivity, planCardView, plansStats } from './plan-card.model';

function plan(over: Partial<ClassPlan> = {}): ClassPlan {
  return {
    id: 'p1', name: 'Vôlei 2x', kind: 'monthly', priceReais: 260, classesPerWeek: 2, makeupsPerMonth: 1,
    credits: null, validityDays: null, description: null, status: 'active', teacherIds: ['t1', 't2'],
    availableInApp: true, cycles: DEFAULT_PLAN_CYCLES, billing: DEFAULT_PLAN_BILLING,
    cancellation: DEFAULT_CANCELLATION_POLICY, ...over,
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
    }), { students: 3, monthlyReais: 720 }, [
      { id: 't1', name: 'Thiago Mendes', photoUrl: null },
      { id: 't2', name: 'Larissa Souza', photoUrl: 'https://x/l.jpg' },
      { id: 't9', name: 'Fora do plano', photoUrl: null },
    ]);
    expect(c.pill).toEqual({ label: 'No app', tone: 'green' });
    expect(c.offer).toBe('até −15% no anual');
    expect(c.chips).toEqual(['Mensal', 'Trimestral −10%', 'Anual −15%', 'Pix · Na arena', 'Venc. 5/15/25']);
    expect(c.sub).toContain('2 professores');
    expect(c.revenue).toContain('720');
    expect(c.unit).toBe('/mês');
    expect(c.teachers.map((t) => t.name)).toEqual(['Thiago Mendes', 'Larissa Souza']);
    expect(c.teachersLabel).toBe('2 professores');
    expect(c.moreTeachers).toBe(0);
  });

  it('selo: só recepção e arquivado; pacote mostra créditos', () => {
    expect(planCardView(plan({ availableInApp: false }), undefined, []).pill.label).toBe('Só recepção');
    expect(planCardView(plan({ status: 'archived' }), undefined, []).pill.label).toBe('Arquivado');
    const pkg = planCardView(plan({ kind: 'package', credits: 10, validityDays: 60, teacherIds: [] }), undefined, []);
    expect(pkg.chips).toEqual(['10 créditos', '60 dias']);
    expect(pkg.teachersLabel).toBe('Qualquer professor da arena');
    expect(pkg.teachers).toEqual([]);
    expect(pkg.sub).toContain('qualquer professor');
  });

  it('pilha com até 4 avatares e "+N"; um só mostra o nome', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, name: 'Prof ' + id, photoUrl: null }));
    const c = planCardView(plan({ teacherIds: six.map((t) => t.id) }), undefined, six);
    expect(c.teachers.length).toBe(4);
    expect(c.moreTeachers).toBe(2);
    expect(planCardView(plan({ teacherIds: ['a'] }), undefined, six).teachersLabel).toBe('Prof a');
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
