import {
  DEFAULT_CANCELLATION_POLICY,
  brl,
  parseCancelRequest,
  parseCancellationPolicy,
  type CancelRequest,
  type Charge,
  type Enrollment,
} from './billing.model';
import {
  buildCancellationRows,
  canEndNow,
  canUndo,
  canWaive,
  cancellationKpis,
  penaltyMath,
  penaltyPill,
  penaltyState,
  planLine,
} from './cancellations.model';

const TODAY = '2026-11-12';

function request(over: Partial<CancelRequest> = {}): CancelRequest {
  return {
    requestedAt: null, requestedOn: '2026-11-10', by: 'athlete', reason: 'routine', note: null,
    kind: 'commitment', remainingMonths: 2, penaltyReais: 260, penaltyStatus: 'open', waivedReason: null, ...over,
  };
}

function enrollment(id: string, over: Partial<Enrollment> = {}): Enrollment {
  return {
    id, studentId: `s-${id}`, name: `Aluno ${id}`, status: 'active', cycle: 'quarterly',
    plan: { planId: 'p1', name: 'Vôlei 2x', kind: 'monthly', priceReais: 260 },
    endsOn: '2026-12-10', commitmentEndsOn: '2027-02-01', cancelRequest: request(),
    cancellationPolicy: DEFAULT_CANCELLATION_POLICY, ...over,
  } as Enrollment;
}

function charge(over: Partial<Charge> = {}): Charge {
  return { id: 'x_penalty', status: 'open', amountReais: 260, paidOn: null, ...over } as Charge;
}

describe('cancelamentos de plano de aula (lado da arena)', () => {
  it('lê as regras do plano com o padrão de 30 dias e 50%', () => {
    expect(parseCancellationPolicy(undefined)).toEqual({ noticeDays: 30, penalty: { kind: 'percent', percent: 50, amountReais: null } });
    expect(parseCancellationPolicy({ noticeDays: 15, penalty: { kind: 'fixed', amountReais: 199.999 } }))
      .toEqual({ noticeDays: 15, penalty: { kind: 'fixed', percent: null, amountReais: 200 } });
    expect(parseCancellationPolicy({ noticeDays: 400, penalty: { kind: 'x' } }).noticeDays).toBe(30);
  });

  it('pedido sem data não conta; motivo desconhecido vira "outro"', () => {
    expect(parseCancelRequest(null)).toBeNull();
    expect(parseCancelRequest({ reason: 'routine' })).toBeNull();
    expect(parseCancelRequest({ requestedOn: '2026-11-10', reason: '??' })?.reason).toBe('other');
  });

  it('situação da multa: a cobrança manda sobre o pedido', () => {
    expect(penaltyState(request(), charge({ status: 'paid' }))).toBe('paid');
    expect(penaltyState(request({ penaltyStatus: 'waived' }), charge({ status: 'canceled' }))).toBe('waived');
    expect(penaltyState(request(), charge())).toBe('open');
    expect(penaltyState(request(), null)).toBe('open');
    expect(penaltyState(request({ penaltyReais: 0, penaltyStatus: 'none' }), null)).toBe('none');
  });

  it('lista quem pediu, encerrados recentes depois, e esconde encerrados antigos', () => {
    const rows = buildCancellationRows([
      enrollment('a', { endsOn: '2026-12-20' }),
      enrollment('b', { endsOn: '2026-11-30' }),
      enrollment('c', { status: 'canceled', endsOn: '2026-11-01' }),
      enrollment('d', { status: 'ended', endsOn: '2026-08-01' }),
      enrollment('e', { cancelRequest: null, endsOn: null }),
    ], new Map(), TODAY);
    expect(rows.map((r) => r.enrollment.id)).toEqual(['b', 'a', 'c']);
    expect(rows[2]!.closed).toBeTrue();
  });

  it('números do topo', () => {
    const rows = buildCancellationRows([
      enrollment('a', { endsOn: '2026-11-28' }),
      enrollment('b', { endsOn: '2026-12-10', cancelRequest: request({ reason: 'price' }) }),
      enrollment('c', { endsOn: '2026-11-20' }),
      enrollment('d', { status: 'canceled', endsOn: '2026-11-05', cancelRequest: request({ penaltyReais: 0, penaltyStatus: 'none' }) }),
    ], new Map([
      ['b', charge({ status: 'paid', paidOn: '2026-11-11', amountReais: 300 })],
      ['c', charge({ status: 'paid', paidOn: '2026-10-30' })],
    ]), TODAY);
    const k = cancellationKpis(rows, TODAY);
    expect(k.leavingThisMonth).toBe(2);
    expect(k.openPenaltiesReais).toBe(260);
    expect(k.openPenaltiesStudents).toBe(1);
    expect(k.paidPenaltiesReais).toBe(300);
    expect(k.paidPenaltiesCount).toBe(1);
    expect(k.topReason?.reason).toBe('routine');
    expect(k.topReason?.count).toBe(3);
  });

  it('pill, plano e conta da multa', () => {
    expect(penaltyPill({ penaltyState: 'paid', penaltyReais: 260 })).toEqual({ label: `Paga ${brl(260)}`, tone: 'green' });
    expect(penaltyPill({ penaltyState: 'open', penaltyReais: 130 }).tone).toBe('yellow');
    expect(penaltyPill({ penaltyState: 'waived', penaltyReais: 130 }).label).toBe('Isentada');
    expect(penaltyPill({ penaltyState: 'none', penaltyReais: 0 }).label).toBe('Sem multa');
    expect(planLine(enrollment('a'))).toBe('Vôlei 2x · Trimestral');

    const [row] = buildCancellationRows([enrollment('a')], new Map(), TODAY);
    expect(penaltyMath(row!)).toBe(`2 mensalidades × ${brl(260)} × 50% = ${brl(260)}`);
    const fixed = enrollment('f', { cancellationPolicy: { noticeDays: 30, penalty: { kind: 'fixed', percent: null, amountReais: 200 } }, cancelRequest: request({ penaltyReais: 200 }) });
    expect(penaltyMath(buildCancellationRows([fixed], new Map(), TODAY)[0]!)).toBe(`Valor fixo do contrato = ${brl(200)}`);
    const monthly = enrollment('m', { cancelRequest: request({ kind: 'monthly', penaltyReais: 0, penaltyStatus: 'none' }) });
    expect(penaltyMath(buildCancellationRows([monthly], new Map(), TODAY)[0]!)).toContain('sem multa');
  });

  it('ações disponíveis', () => {
    const [open] = buildCancellationRows([enrollment('a')], new Map(), TODAY);
    expect(canWaive(open!)).toBeTrue();
    expect(canUndo(open!)).toBeTrue();
    expect(canEndNow(open!)).toBeTrue();
    const [closed] = buildCancellationRows([enrollment('c', { status: 'canceled' })], new Map([['c', charge({ status: 'paid' })]]), TODAY);
    expect(canWaive(closed!)).toBeFalse();
    expect(canUndo(closed!)).toBeFalse();
    expect(canEndNow(closed!)).toBeFalse();
  });
});
