import type { TournamentRow } from '../../data/tournaments.repository';
import { activeOverrideIds, buildFeeRow, rowMode, simulateOnPaid } from './fee-rows';
import {
  athleteFeeReais,
  draftIssues,
  draftOf,
  draftRule,
  feeDefaultsFromRaw,
  feeOverrideFromRaw,
  feeReais,
  feeSplit,
  resolveRule,
  sameDraft,
  type FeeDraft,
  type FeePayer,
  type FeeRule,
} from './tournament-fees';

const DEFAULTS: FeeRule = { percent: 8, floorReais: 1.5, payer: 'organizador' };
const TODAY = '2026-10-26';

function tournament(id: string, managerId: string | null = 'o1'): TournamentRow {
  return {
    id, name: `Torneio ${id}`, sport: null, status: 'inscricoes', visibility: null, startAt: null, place: null,
    categoriesCount: 1, capacity: null, managerId, entryFeeReais: { min: 100, max: 100 },
  };
}

describe('taxas: espelho de functions/src/tournament-fees.ts', () => {
  it('taxa = max(piso, %), sem passar do valor; isento não cobra nem o piso', () => {
    expect(feeReais(100, DEFAULTS)).toBe(8);
    expect(feeReais(10, DEFAULTS)).toBe(1.5);
    expect(feeReais(1, DEFAULTS)).toBe(0.99);
    expect(feeReais(100, { percent: 0, floorReais: 0, payer: 'organizador' })).toBe(0);
  });

  it('organizador paga: o atleta paga o preço; o organizador recebe o preço menos a taxa', () => {
    expect(feeSplit(120, { percent: 6, floorReais: 2, payer: 'organizador' })).toEqual({ fee: 7.2, athlete: 120, organizer: 112.8 });
  });

  it('quem paga: atleta paga preço + taxa; dividido, metade por cima e metade do repasse', () => {
    const rule = (payer: FeePayer): FeeRule => ({ ...DEFAULTS, payer });
    expect(feeSplit(100, rule('atleta'))).toEqual({ fee: 8, athlete: 108, organizer: 100 });
    expect(feeSplit(100, rule('dividido'))).toEqual({ fee: 8, athlete: 104, organizer: 96 });
    // Centavo ímpar fica com o organizador, igual ao servidor: R$ 19,37 × 8% = R$ 1,55.
    expect(athleteFeeReais(19.37, rule('dividido'))).toBe(0.77);
    expect(feeSplit(19.37, rule('dividido'))).toEqual({ fee: 1.55, athlete: 20.14, organizer: 18.59 });
    expect(athleteFeeReais(10, rule('atleta'))).toBe(1.5);
    expect(athleteFeeReais(100, rule('organizador'))).toBe(0);
  });

  it('sem quem paga gravado, o organizador paga', () => {
    expect(feeDefaultsFromRaw({ percent: 8, floorReais: 1.5 }).payer).toBe('organizador');
    expect(feeDefaultsFromRaw({ percent: 8, floorReais: 1.5, payer: 'atleta' }).payer).toBe('atleta');
    expect(feeOverrideFromRaw({ mode: 'custom', percent: 6, floorReais: 2 })?.payer).toBe('organizador');
    expect(feeOverrideFromRaw({ mode: 'custom', percent: 6, floorReais: 2, payer: 'dividido' })?.payer).toBe('dividido');
  });

  it('cascata: exceção vigente > comissão do cadastro > padrão; vencida volta', () => {
    const custom = feeOverrideFromRaw({ mode: 'custom', percent: 5, floorReais: 2, reason: 'Parceria comercial', until: '2026-10-26' });
    expect(resolveRule(custom, 6, DEFAULTS, TODAY)).toEqual({ percent: 5, floorReais: 2, payer: 'organizador', source: 'tournament' });
    expect(resolveRule(custom, 6, DEFAULTS, '2026-10-27')).toEqual({ percent: 6, floorReais: 1.5, payer: 'organizador', source: 'organizer' });
    expect(resolveRule(null, null, DEFAULTS, TODAY)).toEqual({ percent: 8, floorReais: 1.5, payer: 'organizador', source: 'default' });
  });

  it('quem paga na cascata: comissão do cadastro é sempre do organizador', () => {
    const atleta: FeeRule = { ...DEFAULTS, payer: 'atleta' };
    expect(resolveRule(null, 6, atleta, TODAY).payer).toBe('organizador');
    expect(resolveRule(null, null, atleta, TODAY).payer).toBe('atleta');
    const custom = feeOverrideFromRaw({ mode: 'custom', percent: 5, floorReais: 2, payer: 'dividido', reason: 'Parceria comercial' });
    expect(resolveRule(custom, 6, atleta, TODAY).payer).toBe('dividido');
  });

  it('valida como o servidor: motivo obrigatório na exceção, data de hoje em diante', () => {
    const base: FeeDraft = { mode: 'isento', percent: 8, floorReais: 1.5, payer: 'organizador', reason: '', until: '' };
    expect(Object.keys(draftIssues(base, TODAY))).toEqual(['reason']);
    expect(draftIssues({ ...base, reason: 'Evento beneficente' }, TODAY)).toEqual({});
    expect(Object.keys(draftIssues({ ...base, reason: 'Evento beneficente', until: '2026-10-25' }, TODAY))).toEqual(['until']);
    expect(Object.keys(draftIssues({ ...base, mode: 'custom', percent: 21, reason: 'Parceria comercial' }, TODAY))).toEqual(['percent']);
    expect(draftIssues({ ...base, mode: 'padrao' }, TODAY)).toEqual({});
  });

  it('rascunho: padrão segue a base; mudar só o modo para padrão é mudança', () => {
    const base: FeeRule = { percent: 6, floorReais: 1.5, payer: 'organizador' };
    const isento = feeOverrideFromRaw({ mode: 'isento', reason: 'Evento beneficente' });
    const initial = draftOf(isento, base);
    expect(initial.mode).toBe('isento');
    expect(draftRule({ ...initial, mode: 'padrao' }, base)).toEqual(base);
    expect(sameDraft(initial, { ...initial, percent: 3 })).toBeTrue();
    expect(sameDraft(initial, { ...initial, mode: 'padrao' })).toBeFalse();
  });

  it('rascunho personalizado: quem paga entra na regra e conta como mudança', () => {
    const custom = feeOverrideFromRaw({ mode: 'custom', percent: 6, floorReais: 2, reason: 'Parceria comercial' });
    const initial = draftOf(custom, DEFAULTS);
    expect(initial.payer).toBe('organizador');
    expect(draftRule({ ...initial, payer: 'atleta' }, DEFAULTS)).toEqual({ percent: 6, floorReais: 2, payer: 'atleta' });
    expect(sameDraft(initial, { ...initial, payer: 'dividido' })).toBeFalse();
    // No padrão o rascunho segue a base (inclusive quem paga).
    expect(draftOf(null, { ...DEFAULTS, payer: 'atleta' }).payer).toBe('atleta');
  });
});

describe('taxas: linhas da tabela', () => {
  const overrides = new Map([
    ['t1', { tournamentId: 't1', version: 2, override: feeOverrideFromRaw({ mode: 'custom', percent: 6, floorReais: 2, reason: 'Parceria comercial' }) }],
    ['t2', { tournamentId: 't2', version: 1, override: feeOverrideFromRaw({ mode: 'isento', reason: 'Evento beneficente', until: '2026-10-01' }) }],
    ['t3', { tournamentId: 't3', version: 3, override: null }],
  ]);

  it('exceção vencida conta como padrão e fica marcada', () => {
    const row = buildFeeRow(tournament('t2'), overrides.get('t2'), { name: 'Org', commissionPercent: null }, DEFAULTS, TODAY);
    expect(row.expired).toBeTrue();
    expect(rowMode(row)).toBe('padrao');
    expect(row.rule).toEqual({ percent: 8, floorReais: 1.5, payer: 'organizador', source: 'default' });
  });

  it('padrão de quem tem comissão no cadastro é a comissão dele', () => {
    const row = buildFeeRow(tournament('t9'), undefined, { name: 'Org', commissionPercent: 6 }, DEFAULTS, TODAY);
    expect(row.base).toEqual({ percent: 6, floorReais: 1.5, payer: 'organizador', source: 'organizer' });
    expect(row.version).toBe(0);
  });

  it('filtros Personalizada/Isento leem só as exceções vigentes', () => {
    expect(activeOverrideIds(overrides, 'custom', TODAY)).toEqual(['t1']);
    expect(activeOverrideIds(overrides, 'isento', TODAY)).toEqual([]);
  });

  it('simulação sobre o já pago aplica o piso por pagamento', () => {
    // 10 pagamentos de R$ 20: 5% daria R$ 1 cada, o piso de R$ 2 leva a R$ 20 no total.
    expect(simulateOnPaid({ feeReais: 16, grossReais: 200, payments: 10 }, { percent: 5, floorReais: 2, payer: 'organizador' })).toBe(20);
    expect(simulateOnPaid({ feeReais: 0, grossReais: 0, payments: 0 }, DEFAULTS)).toBe(0);
  });
});
