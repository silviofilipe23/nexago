import { DEFAULT_SQUAD_RULES } from '../../niveis-regras/data/squad-rules';
import type { Contract, CountedCommission } from '../../data/squad-program.repository';
import {
  DEFAULT_STATUS_FILTER,
  ambassadorsCsv,
  applyFilters,
  buildRows,
  roiLabel,
  sortRows,
  tabCounts,
  type Filters,
} from './ambassador';

const NOW = new Date('2026-10-17T15:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (n: number) => new Date(NOW.getTime() - n * DAY);

function contract(uid: string, over: Partial<Contract> = {}): Contract {
  return {
    uid,
    name: uid,
    city: 'Goiânia',
    arenaName: 'Arena Errejota',
    tier: 'amb',
    code: `${uid.toUpperCase()}10`,
    commissionPct: 10,
    rulesVersion: 1,
    state: 'active',
    start: ago(60),
    end: null,
    pausedUntil: null,
    endsAt: null,
    pendingTier: null,
    score: null,
    points: null,
    ...over,
  };
}

const sale = (ambassadorId: string, daysAgo: number, netCents = 120_00): CountedCommission => ({
  ambassadorId,
  netCents,
  amountCents: netCents / 10,
  registeredAt: ago(daysAgo),
});

const FILTERS: Filters = { tab: 'all', search: '', cities: [], statuses: [...DEFAULT_STATUS_FILTER], sort: 'roi' };

describe('tela 02 · linhas dos embaixadores', () => {
  it('conversões, receita, custo (comissão + kit) e ROI do período', () => {
    const rows = buildRows({
      contracts: [contract('joao')],
      commissions: [sale('joao', 50), sale('joao', 10), sale('outro', 5)],
      rules: DEFAULT_SQUAD_RULES,
      period: 'pilot',
      now: NOW,
    });
    const r = rows[0]!;
    expect(r.conversions).toBe(2);
    expect(r.revenueCents).toBe(240_00);
    // 2 × R$ 12 de comissão + kit do Ambassador (R$ 120).
    expect(r.costCents).toBe(24_00 + 120_00);
    expect(roiLabel(r.roi)).toBe('1,7x');
  });

  it('período de 30 dias tira o que é antigo e o kit de contrato mais velho', () => {
    const [r] = buildRows({
      contracts: [contract('joao')],
      commissions: [sale('joao', 50), sale('joao', 10)],
      rules: DEFAULT_SQUAD_RULES,
      period: 'last30',
      now: NOW,
    });
    expect(r!.conversions).toBe(1);
    expect(r!.costCents).toBe(12_00);
  });

  it('o status olha o contrato inteiro, não o período', () => {
    // 60 dias, ROI total abaixo de 1,5x → Em risco, mesmo com o mês bom.
    const [r] = buildRows({
      contracts: [contract('ana', { tier: 'ath' })],
      commissions: [sale('ana', 5, 20_00)],
      rules: DEFAULT_SQUAD_RULES,
      period: 'last30',
      now: NOW,
    });
    expect(r!.status).toBe('at_risk');
  });

  it('abas contam contratos não encerrados; filtro padrão esconde encerrados', () => {
    const rows = buildRows({
      contracts: [contract('a'), contract('b', { tier: 'pro' }), contract('c', { state: 'ended' }), contract('d', { state: 'paused' })],
      commissions: [],
      rules: DEFAULT_SQUAD_RULES,
      period: 'pilot',
      now: NOW,
    });
    expect(tabCounts(rows)).toEqual({ all: 3, ath: 0, amb: 2, pro: 1, cap: 0 });
    expect(applyFilters(rows, FILTERS).map((r) => r.contract.uid)).toEqual(['a', 'b', 'd']);
    expect(applyFilters(rows, { ...FILTERS, tab: 'pro' }).map((r) => r.contract.uid)).toEqual(['b']);
  });

  it('busca por nome, código ou arena a partir de 2 caracteres, sem acento', () => {
    const rows = buildRows({
      contracts: [contract('joao', { name: 'João Victor' }), contract('marcos', { name: 'Marcos Reis', arenaName: 'Arena CFC' })],
      commissions: [],
      rules: DEFAULT_SQUAD_RULES,
      period: 'pilot',
      now: NOW,
    });
    const names = (search: string) => applyFilters(rows, { ...FILTERS, search }).map((r) => r.contract.name);
    expect(names('joao')).toEqual(['João Victor']);
    expect(names('MARCOS10')).toEqual(['Marcos Reis']);
    expect(names('cfc')).toEqual(['Marcos Reis']);
    expect(names('j').length).toBe(2);
  });

  it('ordena por ROI com quem não tem ROI no fim', () => {
    const rows = buildRows({
      contracts: [contract('a', { name: 'A' }), contract('b', { name: 'B' })],
      commissions: [sale('b', 5, 1000_00)],
      rules: DEFAULT_SQUAD_RULES,
      period: 'last30',
      now: NOW,
    });
    expect(sortRows(rows, 'roi').map((r) => r.contract.name)).toEqual(['B', 'A']);
    expect(sortRows(rows, 'name').map((r) => r.contract.name)).toEqual(['A', 'B']);
  });

  it('CSV nas colunas da spec, sem Score inventado', () => {
    const rows = buildRows({
      contracts: [contract('joao', { name: 'João Victor' })],
      commissions: [sale('joao', 5)],
      rules: DEFAULT_SQUAD_RULES,
      period: 'pilot',
      now: NOW,
    });
    const [head, line] = ambassadorsCsv(rows).split('\n');
    expect(head).toBe('nome;cidade;arena;nivel;codigo;status;inicio_contrato;fim_contrato;conversoes;receita;custo;roi;score;pontos');
    expect(line!.startsWith('João Victor;Goiânia;Arena Errejota;Ambassador;JOAO10;')).toBeTrue();
    expect(line!.endsWith(';;')).toBeTrue();
  });
});
