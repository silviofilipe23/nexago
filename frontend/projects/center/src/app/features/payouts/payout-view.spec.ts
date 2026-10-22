import type { Payout, PayoutCalc } from '../../domain/payouts';
import { canClose, payoutRows, payoutTotals, payoutsCsv } from './payout-view';

const calc = (uid: string, p: Partial<PayoutCalc>): PayoutCalc => ({
  coachUid: uid,
  rule: { kind: 'per_class', amountCents: 8000, percent: 0 },
  classesGiven: 3,
  pendingAttendance: 0,
  baseCents: 0,
  totalCents: 24000,
  lines: [],
  ...p,
});
const payout = (uid: string, p: Partial<Payout>): Payout =>
  ({
    id: `2026-10_${uid}`, month: '2026-10', coachUid: uid, coachName: 'Ex', rule: { kind: 'per_class', amountCents: 8000, percent: 0 },
    classesGiven: 3, baseCents: 0, totalCents: 24000, lines: [], status: 'closed', closedAt: null, closedByName: '',
    paidAt: null, paidOn: '', paidByName: '', paidMethod: '', note: '', transferStatus: '', transferAuthorized: true, transferError: '', ...p,
  }) as Payout;

describe('tela de repasses', () => {
  const coaches = [{ uid: 'ana', displayName: 'Ana' }, { uid: 'rui', displayName: 'Rui' }, { uid: 'zeca', displayName: 'Zeca' }];

  it('aberto usa o cálculo; fechado usa o retrato e avisa se o cálculo mudou', () => {
    const calcs = new Map([
      ['ana', calc('ana', {})],
      ['rui', calc('rui', { totalCents: 32000, classesGiven: 4 })],
      ['zeca', calc('zeca', { rule: { kind: 'none', amountCents: 0, percent: 0 }, classesGiven: 0, totalCents: 0 })],
    ]);
    const rows = payoutRows(coaches, calcs, [payout('rui', { coachName: 'Rui' }), payout('ex', { status: 'paid', totalCents: 5000 })]);
    expect(rows.map((r) => [r.coachName, r.status, r.totalCents])).toEqual([
      ['Ana', 'open', 24000],
      ['Ex', 'paid', 5000],
      ['Rui', 'closed', 24000],
    ]);
    const rui = rows.find((r) => r.coachUid === 'rui')!;
    expect(rui.outdated).toBeTrue();
    expect(rui.liveTotalCents).toBe(32000);
    expect(rows.map(canClose)).toEqual([true, false, true]);
    expect(payoutTotals(rows)).toEqual(jasmine.objectContaining({ totalCents: 53000, openCents: 24000, closedCents: 24000, paidCents: 5000 }));
    expect(payoutsCsv('2026-10', rows)[0]![0]).toBe('Mês');
  });

  it('transferência em andamento ou sem confirmação trava refazer o fechamento', () => {
    const calcs = new Map([['rui', calc('rui', { totalCents: 32000 })]]);
    const [pending] = payoutRows([{ uid: 'rui', displayName: 'Rui' }], calcs, [payout('rui', { coachName: 'Rui', transferStatus: 'pending' })]);
    expect(pending!.outdated).toBeTrue();
    expect(canClose(pending!)).toBeFalse();
    const [failed] = payoutRows([{ uid: 'rui', displayName: 'Rui' }], calcs, [payout('rui', { coachName: 'Rui', transferStatus: 'failed' })]);
    expect(canClose(failed!)).toBeTrue();
  });
});
