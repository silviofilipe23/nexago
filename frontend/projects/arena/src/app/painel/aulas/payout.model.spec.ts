import {
  buildPayoutRows,
  classPayoutId,
  defaultPayoutMonth,
  isMonthKey,
  monthLastDay,
  monthLongLabel,
  parseDecimalInput,
  payoutBaseLabel,
  payoutColumnLabel,
  payoutDraftValue,
  payoutModelFromDraft,
  payoutModelLabel,
  payoutPreviewFromRaw,
  payoutState,
  payoutTotals,
  shiftMonth,
  shortMonthDay,
  type ClassPayout,
  type TeacherPayoutModel,
  type TeacherPayoutPreview,
} from './payout.model';

const SHARE: TeacherPayoutModel = { model: 'revenue_share', percent: 50, amountReais: null };
const PER_CLASS: TeacherPayoutModel = { model: 'per_class', percent: null, amountReais: 45 };
const PER_STUDENT: TeacherPayoutModel = { model: 'per_student', percent: null, amountReais: 12.5 };

function preview(over: Partial<TeacherPayoutPreview>): TeacherPayoutPreview {
  return {
    teacherId: 't1', teacherName: 'Thiago', teacherColor: '#FF6A1A', teacherStatus: 'active', model: SHARE,
    classesGiven: 8, presences: 40, students: 6, pendingSessions: 0, canceledSessions: 0,
    grossRevenueReais: 1600, platformFeeReais: 0, revenueReais: 1600, amountReais: 800, lines: [],
    ...over,
  };
}

function closed(over: Partial<ClassPayout>): ClassPayout {
  return {
    ...preview({}),
    id: 'arena1_t1_2026-10', arenaId: 'arena1', month: '2026-10',
    computedReais: 800, adjustmentReais: 0, adjustmentNote: null, status: 'closed',
    closedAt: null, paidOn: null, paymentMethod: null,
    ...over,
  };
}

describe('repasse do professor — helpers', () => {
  it('rótulo do modelo e da base de cálculo', () => {
    expect(payoutModelLabel(SHARE)).toBe('50% da receita');
    expect(payoutModelLabel({ ...SHARE, percent: 37.5 })).toBe('37,5% da receita');
    expect(payoutModelLabel(PER_CLASS).replace(/\s/g, ' ')).toBe('R$ 45 / aula');
    expect(payoutModelLabel(PER_STUDENT).replace(/\s/g, ' ')).toBe('R$ 12,50 / aluno presente');
    expect(payoutModelLabel(null)).toBe('Não definido');
    expect(payoutBaseLabel({ model: PER_CLASS, revenueReais: 0, classesGiven: 1, presences: 0 })).toBe('1 aula');
    expect(payoutBaseLabel({ model: PER_STUDENT, revenueReais: 0, classesGiven: 3, presences: 17 })).toBe('17 presenças');
    expect(payoutBaseLabel({ model: SHARE, revenueReais: 1600, classesGiven: 3, presences: 17 }).replace(/\s/g, ' ')).toBe('R$ 1.600 receita');
    expect(payoutColumnLabel(SHARE)).toBe('Repasse 50%');
  });

  it('meses: navegação, rótulo, último dia e o padrão da tela', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthLongLabel('2026-10')).toBe('outubro de 2026');
    expect(monthLastDay('2026-02')).toBe('2026-02-28');
    expect(monthLastDay('2028-02')).toBe('2028-02-29');
    expect(shortMonthDay('2026-10-31')).toBe('31 out');
    expect(isMonthKey('2026-13')).toBeFalse();
    expect(isMonthKey('2026-10')).toBeTrue();
    // Até o dia 10, a tela abre no mês anterior (hora de pagar); depois, no corrente.
    expect(defaultPayoutMonth('2026-11-03')).toBe('2026-10');
    expect(defaultPayoutMonth('2026-11-11')).toBe('2026-11');
    expect(defaultPayoutMonth('2026-01-05')).toBe('2025-12');
  });

  it('situação: sem modelo, parcial no mês corrente, a fechar, a pagar e pago', () => {
    expect(payoutState(null, null, '2026-10', '2026-11-03')).toBe('no_model');
    expect(payoutState(null, SHARE, '2026-11', '2026-11-03')).toBe('partial');
    expect(payoutState(null, SHARE, '2026-10', '2026-11-03')).toBe('to_close');
    expect(payoutState({ status: 'closed' }, null, '2026-10', '2026-11-03')).toBe('closed');
    expect(payoutState({ status: 'paid' }, SHARE, '2026-10', '2026-11-03')).toBe('paid');
  });

  it('linhas: o fechado manda nos números e avisa quando a conta de hoje mudou', () => {
    const rows = buildPayoutRows(
      [preview({ teacherId: 't1', teacherName: 'Thiago', amountReais: 850 }), preview({ teacherId: 't2', teacherName: 'Ana', model: null, amountReais: 0 })],
      [
        closed({ teacherId: 't1', amountReais: 780, computedReais: 800, adjustmentReais: -20 }),
        // Fechado e pago de quem sumiu da prévia (arquivado sem atividade) continua na lista.
        closed({ teacherId: 't9', teacherName: 'Zé', status: 'paid', amountReais: 300, computedReais: 300 }),
        closed({ teacherId: 't3', month: '2026-09' }),
      ],
      '2026-10',
      '2026-11-03',
    );
    expect(rows.map((r) => [r.teacherName, r.state, r.figures.amountReais, r.stale])).toEqual([
      ['Ana', 'no_model', 0, false],
      ['Thiago', 'closed', 780, true],
      ['Zé', 'paid', 300, false],
    ]);
    expect(payoutTotals(rows)).toEqual({ totalReais: 1080, paidReais: 300, toPayReais: 780, paidCount: 1, teachers: 3 });
  });

  it('formulário do modelo: valida e devolve o valor no formato do campo', () => {
    expect(payoutModelFromDraft('revenue_share', '45,5')).toEqual({ model: 'revenue_share', percent: 45.5, amountReais: null });
    expect(payoutModelFromDraft('per_class', '1.200,00')).toEqual({ model: 'per_class', percent: null, amountReais: 1200 });
    expect(payoutModelFromDraft('revenue_share', '120')).toContain('percentual');
    expect(payoutModelFromDraft('per_student', '')).toContain('valor');
    expect(payoutModelFromDraft('per_student', '12.50')).toEqual({ model: 'per_student', percent: null, amountReais: 12.5 });
    expect(parseDecimalInput('1.200')).toBe(1200);
    expect(parseDecimalInput('-120,5')).toBe(-120.5);
    expect(parseDecimalInput('')).toBeNaN();
    expect(payoutDraftValue(PER_STUDENT)).toBe('12,5');
    expect(payoutDraftValue(SHARE)).toBe('50');
  });

  it('lê a prévia da callable e o id do fechamento é o do servidor', () => {
    const out = payoutPreviewFromRaw({
      month: '2026-10', revenueReais: 320, platformFeesReais: 0, feesReais: 50, unassignedReais: 0,
      teachers: [{ teacherId: 't1', teacherName: 'Thiago', model: { model: 'per_class', amountReais: 45 }, classesGiven: 2, lines: [{ key: 'cA', label: 'Iniciante A', classes: 2 }] }],
    });
    expect(out.teachers[0]!.model).toEqual(PER_CLASS);
    expect(out.teachers[0]!.lines[0]!.classes).toBe(2);
    expect(out.teachers[0]!.amountReais).toBe(0);
    expect(classPayoutId('arena1', 't1', '2026-10')).toBe('arena1_t1_2026-10');
  });

  it('taxa NexaGO: lê bruto, taxa e base; retrato antigo sem os campos = valor cheio sem taxa', () => {
    const out = payoutPreviewFromRaw({
      month: '2026-10', revenueReais: 500, platformFeesReais: 19.2,
      teachers: [{
        teacherId: 't1', grossRevenueReais: 500, platformFeeReais: 19.2, revenueReais: 480.8,
        lines: [{ key: 'cA', grossRevenueReais: 500, platformFeeReais: 19.2, revenueReais: 480.8 }],
      }, {
        teacherId: 't2', revenueReais: 160, lines: [{ key: 'cB', revenueReais: 160 }],
      }],
    });
    expect(out.platformFeesReais).toBe(19.2);
    const [novo, antigo] = out.teachers;
    expect([novo!.grossRevenueReais, novo!.platformFeeReais, novo!.revenueReais]).toEqual([500, 19.2, 480.8]);
    expect(novo!.lines[0]!.platformFeeReais).toBe(19.2);
    expect([antigo!.grossRevenueReais, antigo!.platformFeeReais, antigo!.revenueReais]).toEqual([160, 0, 160]);
    expect(antigo!.lines[0]!.grossRevenueReais).toBe(160);
  });
});
