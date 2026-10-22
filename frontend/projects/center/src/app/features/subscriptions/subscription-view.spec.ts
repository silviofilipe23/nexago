import { dunningLadder } from '../../domain/billing';
import { DEFAULT_BILLING, type BillingRun, type Invoice, type Subscription } from '../../domain/models';
import {
  countByFilter,
  cycleLines,
  cycleProgress,
  filterSubscriptions,
  issueFailReasons,
  ladderOffset,
  ladderView,
  nextCycleLine,
  planChangePreview,
  prorationFormula,
  runBar,
  runDueDate,
  runLines,
  subscriptionRow,
  subscriptionStats,
  subscriptionsCsv,
} from './subscription-view';

function sub(p: Partial<Subscription>): Subscription {
  return {
    id: 'e1',
    enrollmentId: 'e1',
    studentId: 's1',
    studentName: 'Lucas Prado',
    payerName: 'Lucas Prado',
    classId: 'c1',
    className: 'BT Intermediário B',
    planId: 'p2',
    planName: 'Mensal 2x/semana',
    priceCents: 32000,
    billingDay: 5,
    method: 'pix_manual',
    status: 'active',
    startDate: '2026-07-12',
    nextChargeDate: '2026-11-05',
    lastDueDate: '2026-10-05',
    pausedUntil: null,
    cancelAt: null,
    pendingPlanChange: null,
    lateFees: { finePercent: 2, interestPercent: 1 },
    dunningStage: 0,
    overdueSince: null,
    checkinBlocked: false,
    skippedCycles: [],
    notices: [],
    createdAt: null,
    endedAt: null,
    endReason: '',
    ...p,
  };
}

function inv(p: Partial<Invoice>): Invoice {
  return {
    id: 'sub_e1_2026-10',
    studentId: 's1',
    enrollmentId: 'e1',
    payerName: 'Lucas Prado',
    reference: 'Mensal · out',
    amountCents: 32000,
    dueDate: '2026-10-05',
    status: 'pending',
    method: null,
    providerRef: '', providerUrl: '', providerStatus: '', providerApproved: false,
    events: [],
    approvedAt: null,
    refundedCents: 0,
    subscriptionId: 'e1',
    cycle: '2026-10',
    createdAt: null,
    ...p,
  };
}

function run(p: Partial<BillingRun['summary']>, items: BillingRun['items'] = []): BillingRun {
  return {
    id: '2026-11-02',
    date: '2026-11-02',
    ranAt: null,
    runs: 1,
    online: true,
    summary: {
      generated: 0, generatedCents: 0, issued: 0, issueFailed: 0, skippedPaused: 0, reminders: 0, notices: 0,
      blocked: 0, suspended: 0, resumed: 0, packsCompleted: 0, cancelledAtCycleEnd: 0, errors: 0,
      ...p,
    },
    items,
  };
}

describe('subscription-view', () => {
  const today = '2026-10-22';

  describe('lista', () => {
    const list = [
      sub({ id: 'a', payerName: 'Carla Dias', priceCents: 32000, nextChargeDate: '2026-11-05' }),
      sub({ id: 'b', payerName: 'Élisa Prado', status: 'past_due', overdueSince: '2026-10-05', nextChargeDate: '2026-11-05', priceCents: 18000 }),
      sub({ id: 'c', payerName: 'Felipe Rocha', priceCents: 42000, nextChargeDate: '2026-11-10' }),
      sub({ id: 'd', payerName: 'Gabriela', status: 'paused', pausedUntil: '2026-11-03' }),
      sub({ id: 'e', payerName: 'Marina', status: 'canceling', cancelAt: '2026-10-30', nextChargeDate: '2026-10-30' }),
      sub({ id: 'f', payerName: 'Rafa', status: 'cancelled', endedAt: new Date('2026-10-10T15:00:00Z') }),
      sub({ id: 'g', payerName: 'Su', status: 'suspended' }),
    ];

    it('conta e filtra por situação, com busca sem acento', () => {
      const c = countByFilter(list);
      expect(c).toEqual({ all: 7, active: 2, past_due: 1, paused: 1, canceling: 1, ended: 2 });
      expect(filterSubscriptions(list, 'ended', '').map((s) => s.id)).toEqual(['f', 'g']);
      expect(filterSubscriptions(list, 'all', 'elisa').map((s) => s.id)).toEqual(['b']);
      expect(filterSubscriptions(list, 'active', 'prado').length).toBe(2);
    });

    it('stats: recorrente, próxima rodada, atraso e cancelamentos do mês', () => {
      const invoices = [
        inv({ subscriptionId: 'b', id: 'sub_b_2026-10', amountCents: 18000 }),
        inv({ subscriptionId: 'b', id: 'sub_b_2026-09', dueDate: '2026-09-05', amountCents: 18000 }),
        inv({ subscriptionId: null, id: 'avulsa', amountCents: 5000 }),
        inv({ subscriptionId: 'a', id: 'sub_a_2026-10', status: 'approved' }),
      ];
      const s = subscriptionStats(list, invoices, today);
      expect(s.mrrCents).toBe(32000 + 18000 + 42000 + 32000);
      expect(s.mrrCount).toBe(4);
      expect(s.nextRun).toEqual({ date: '2026-11-05', cents: 50000, count: 2 });
      expect(s.overdueCents).toBe(36000);
      expect(s.overdueCount).toBe(1);
      expect(s.cancellations).toBe(2);
      expect(s.atCycleEnd).toBe(1);
    });

    it('próxima rodada usa o preço da mudança agendada', () => {
      const s = subscriptionStats([sub({ pendingPlanChange: { planId: 'p3', planName: '3x', priceCents: 42000, byName: '', requestedAt: null } })], [], today);
      expect(s.nextRun?.cents).toBe(42000);
    });

    it('linha da tabela usa nextLabel', () => {
      expect(subscriptionRow(list[1]!, today).next).toEqual({ text: 'Venceu 05 out', tone: 'red' });
      expect(subscriptionRow(list[3]!, today).next.text).toBe('Volta 03 nov');
      expect(subscriptionRow(list[4]!, today).next.text).toBe('Encerra 30 out');
      expect(subscriptionRow(list[0]!, today).next).toEqual({ text: '05 nov', tone: '' });
      // Já dentro dos 3 dias da geração: destaca.
      expect(subscriptionRow(list[0]!, '2026-11-02').next.tone).toBe('yellow');
      expect(subscriptionRow(list[0]!, today).method).toBe('Pix mensal');
    });

    it('CSV com cabeçalho e valores em reais', () => {
      const rows = subscriptionsCsv([list[0]!], today);
      expect(rows[0]![0]).toBe('Pagador');
      expect(rows[1]).toEqual(['Carla Dias', 'Lucas Prado', 'Mensal 2x/semana', 'BT Intermediário B', '320,00', 'Dia 05', 'Pix mensal', '05 nov', 'Em dia', '12 jul 2026']);
    });
  });

  describe('detalhe', () => {
    it('ciclos: cobranças + pulados, mais novos primeiro', () => {
      const s = sub({ skippedCycles: ['2026-08'] });
      const lines = cycleLines(s, [
        inv({ id: 'sub_e1_2026-09', cycle: '2026-09', dueDate: '2026-09-05', status: 'approved', method: 'pix', providerApproved: true }),
        inv({}),
        inv({ id: 'e1_plano_2026-10-01', cycle: '2026-10', dueDate: '2026-10-01', reference: 'Diferença de plano', amountCents: 4839, status: 'approved', method: 'card' }),
      ], today);
      expect(lines.map((l) => l.title)).toEqual(['Out 2026', 'Diferença de plano', 'Set 2026', 'Ago 2026']);
      expect(lines[0]!.detail).toBe('Venceu 05 out · 17 dias em atraso');
      expect(lines[0]!.warn).toBeTrue();
      expect(lines[2]!.detail).toBe('Pago · Pix · confirmado pelo provedor');
      expect(lines[3]!.pill[0]).toBe('Pulado');
    });

    it('linha tracejada do próximo ciclo por situação', () => {
      expect(nextCycleLine(sub({}))).toEqual({ title: 'Nov 2026', detail: 'Agendada para 05 nov · gerada 3 dias antes', cents: 32000 });
      expect(nextCycleLine(sub({ status: 'canceling', cancelAt: '2026-11-05' }))!.detail).toBe('Não será cobrado — encerra em 05 nov');
      expect(nextCycleLine(sub({ status: 'paused', pausedUntil: '2026-12-01' }))!.cents).toBeNull();
      expect(nextCycleLine(sub({ status: 'cancelled' }))).toBeNull();
    });

    it('régua marca o estágio atual pelos dias de atraso', () => {
      expect(ladderOffset('D−3')).toBe(-3);
      expect(ladderOffset('D0')).toBe(0);
      expect(ladderOffset('D+20')).toBe(20);
      const steps = dunningLadder(DEFAULT_BILLING);
      const v = ladderView(steps, sub({ status: 'past_due', overdueSince: '2026-10-05' }), today);
      // 17 dias: passou do D+15 (aviso de bloqueio), não do D+20.
      const cur = v.find((x) => x.current)!;
      expect(cur.day).toBe('D+15');
      expect(v.filter((x) => x.reached).length).toBe(5);
      expect(ladderView(steps, sub({}), today).some((x) => x.reached)).toBeFalse();
    });
  });

  describe('mudar plano', () => {
    it('proporcional até o vencimento do ciclo ainda não gerado', () => {
      const pv = planChangePreview(sub({}), 42000, [], today);
      expect(pv.periodEnd).toBe('2026-11-05');
      expect(pv.days).toBe(14);
      expect(pv.cycleDays).toBe(31);
      expect(pv.cents).toBe(Math.round((10000 * 14) / 31));
      expect(pv.nextFrom).toBe('2026-11-05');
      expect(pv.blockedByLate).toBeNull();
      expect(prorationFormula(32000, 42000, 14, 31)).toBe('(R$ 420 − R$ 320) × 14/31');
    });

    it('usa o ciclo pendente ainda não vencido como fim do período', () => {
      const s = sub({ nextChargeDate: '2026-12-05' });
      const pv = planChangePreview(s, 42000, [inv({ id: 'sub_e1_2026-11', cycle: '2026-11', dueDate: '2026-11-05' })], '2026-11-03');
      expect(pv.periodEnd).toBe('2026-11-05');
      expect(pv.days).toBe(2);
      expect(pv.nextFrom).toBe('2026-12-05');
      expect(pv.blockedBySent).toBeNull();
    });

    it('downgrade não devolve; cobrança vencida ou já enviada bloqueia "agora"', () => {
      expect(planChangePreview(sub({}), 18000, [], today).cents).toBe(0);
      expect(planChangePreview(sub({}), 42000, [inv({})], today).blockedByLate?.id).toBe('sub_e1_2026-10');
      const sent = inv({ id: 'sub_e1_2026-11', cycle: '2026-11', dueDate: '2026-11-05', providerUrl: 'https://pay' });
      expect(planChangePreview(sub({ nextChargeDate: '2026-12-05' }), 42000, [sent], '2026-11-03').blockedBySent?.id).toBe('sub_e1_2026-11');
    });
  });

  describe('rodada', () => {
    const r = run(
      { generated: 10, generatedCents: 320000, issued: 7, issueFailed: 2, skippedPaused: 3, cancelledAtCycleEnd: 1, errors: 1 },
      [
        { subscriptionId: 'a', name: 'A', kind: 'issue_failed', detail: 'CPF ausente', cents: 32000 },
        { subscriptionId: 'b', name: 'B', kind: 'issue_failed', detail: 'CPF ausente', cents: 32000 },
        { subscriptionId: 'c', name: 'C', kind: 'issue_failed', detail: '', cents: 32000 },
        { subscriptionId: 'd', name: 'D', kind: 'generated', detail: '', cents: 32000 },
      ],
    );

    it('linhas do resultado', () => {
      const lines = runLines(r);
      expect(lines.length).toBe(12);
      expect(lines[0]).toEqual({ key: 'generated', label: 'Cobranças geradas', count: 10, cents: 320000, tone: 'orange' });
      expect(lines.find((l) => l.key === 'errors')!.count).toBe(1);
    });

    it('barra proporcional sem fatias vazias', () => {
      expect(runBar(r).map((b) => [b.label, b.count])).toEqual([
        ['Fatura no provedor', 7],
        ['Sem fatura online', 2],
        ['Sem link · baixa manual', 1],
        ['Puladas · pausadas', 3],
        ['Canceladas no fim do ciclo', 1],
      ]);
    });

    it('motivos agrupados', () => {
      expect(issueFailReasons(r)).toEqual([
        { reason: 'CPF ausente', count: 2 },
        { reason: 'Sem motivo informado', count: 1 },
      ]);
    });

    it('acompanha ao vivo as cobranças do ciclo da rodada', () => {
      expect(runDueDate('2026-11-02')).toBe('2026-11-05');
      const p = cycleProgress([
        inv({ id: 'sub_e1_2026-11', dueDate: '2026-11-05', status: 'approved' }),
        inv({ id: 'sub_e2_2026-11', subscriptionId: 'e2', dueDate: '2026-11-05' }),
        inv({ id: 'e1_plano_2026-11-05', dueDate: '2026-11-05' }),
        inv({ id: 'avulsa', subscriptionId: null, dueDate: '2026-11-05' }),
      ], '2026-11-05');
      expect(p).toEqual({ approved: 1, pending: 1, other: 0, approvedCents: 32000, totalCents: 64000 });
    });
  });
});
