import { DEFAULT_SQUAD_RULES, type SquadTier } from '../../niveis-regras/data/squad-rules';
import type { Commission, CommissionStatus } from '../../comissoes/data/commission';
import type { Contract, CountedCommission } from '../../data/squad-program.repository';
import { buildRows } from '../../embaixadores/data/ambassador';
import {
  attentionItems,
  costInsight,
  costLines,
  overviewCsv,
  overviewKpis,
  scoreLeaders,
  tierMixLabel,
  tierSummaries,
} from './overview';

const NOW = new Date('2026-10-15T15:00:00-03:00');
const DAY = 24 * 60 * 60 * 1000;
const ago = (n: number) => new Date(NOW.getTime() - n * DAY);

function contract(uid: string, tier: SquadTier, over: Partial<Contract> = {}): Contract {
  return {
    uid,
    name: uid,
    city: 'Goiânia',
    arenaName: null,
    tier,
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

function commission(ambassadorId: string, status: CommissionStatus, daysAgo: number, net = 120_00): Commission {
  return {
    id: `${ambassadorId}-${status}-${daysAgo}-${Math.random()}`,
    ambassadorId,
    ambassadorName: ambassadorId,
    ambassadorCode: null,
    ambassadorTier: null,
    registrationId: 'r',
    tournamentName: 'Open',
    categoryName: 'Masc. C',
    paymentId: 'p',
    convertedLabel: 'Lucas M.',
    convertedCount: 1,
    origin: 'code',
    grossCents: net,
    feeCents: 0,
    netCents: net,
    pct: 10,
    amountCents: net / 10,
    rulesVersion: 1,
    status,
    cancelReason: null,
    cancelNote: null,
    payoutId: null,
    hold: null,
    timeline: [],
    registeredAt: ago(daysAgo),
    releasedAt: null,
  };
}

const many = (id: string, n: number, status: CommissionStatus = 'released') =>
  Array.from({ length: n }, (_, i) => commission(id, status, i + 1));

function setup(contracts: Contract[], commissions: Commission[]) {
  const counted: CountedCommission[] = commissions
    .filter((c) => c.status === 'released' || c.status === 'paid')
    .map((c) => ({ ambassadorId: c.ambassadorId, netCents: c.netCents, amountCents: c.amountCents, registeredAt: c.registeredAt }));
  const rows = buildRows({ contracts, commissions: counted, rules: DEFAULT_SQUAD_RULES, period: 'pilot', now: NOW });
  return { rows, commissions };
}

describe('overviewKpis', () => {
  it('soma as linhas da tela 02: custo = comissões + kits; ativos = não encerrados', () => {
    const { rows, commissions } = setup(
      [contract('ana', 'ath'), contract('joao', 'amb'), contract('edu', 'amb', { state: 'ended' }), contract('lia', 'cap', { state: 'paused' })],
      [...many('ana', 3), ...many('joao', 10), commission('joao', 'pending', 1)],
    );
    const k = overviewKpis({ rows, commissions, rules: DEFAULT_SQUAD_RULES, now: NOW });
    expect(k.live).toBe(3);
    expect(k.liveByTier).toEqual({ ath: 1, amb: 1, pro: 0, cap: 1 });
    expect(tierMixLabel(k.liveByTier)).toBe('1 · 1 · 0 · 1 por nível');
    expect(k.conversions).toBe(13);
    expect(k.revenueCents).toBe(13 * 120_00);
    // Kits: ath 60 + amb 120 + amb 120 (encerrado também gastou) + cap 120.
    expect(k.kitCents).toBe(420_00);
    expect(k.commissionCents).toBe(13 * 12_00);
    expect(k.costCents).toBe(k.commissionCents + k.kitCents);
    expect(k.roi).toBeCloseTo((13 * 120_00) / k.costCents, 5);
    // Semana: dias 1–7 (o pendente não conta).
    expect(k.conversionsWeek).toBe(10);
  });
});

describe('tierSummaries e costInsight', () => {
  it('um bloco por nível com contrato, maior ROI primeiro, e o custo por conversão', () => {
    const { rows } = setup(
      [contract('marcos', 'cap'), contract('rayssa', 'pro'), contract('joao', 'amb')],
      [...many('marcos', 30), ...many('rayssa', 30), ...many('joao', 2)],
    );
    const s = tierSummaries(rows);
    expect(s.map((x) => x.tier)).toEqual(['cap', 'pro', 'amb']);
    const cap = s[0]!;
    expect(cap.conversions).toBe(30);
    expect(cap.cpcCents).toBe(Math.round((30 * 12_00 + 120_00) / 30));
    const insight = costInsight(s)!;
    expect(insight.lead).toContain('Captains:');
    expect(insight.lead).toContain('por conversão');
    expect(insight.rest).toContain('30 conversões por embaixador');
    expect(insight.rest).toContain('dos Ambassadors');
  });

  it('sem dois níveis convertendo, sem destaque', () => {
    const { rows } = setup([contract('joao', 'amb'), contract('ana', 'ath')], many('joao', 4));
    expect(costInsight(tierSummaries(rows))).toBeNull();
  });
});

describe('costLines', () => {
  it('comissões e kits com barra; o resto sem fonte', () => {
    const lines = costLines({ commissionCents: 200_00, kitCents: 100_00 });
    expect(lines.map((l) => l.label)).toEqual(['Comissões', 'Kits', 'Inscrições gratuitas', 'Cachês de campanha', 'Eventos']);
    expect(lines[0]!.pct).toBe(100);
    expect(lines[1]!.pct).toBe(50);
    expect(lines.slice(2).every((l) => l.cents === null)).toBeTrue();
  });
});

describe('attentionItems', () => {
  it('repasse, elegível, em risco, candidaturas e aditivo, nessa ordem, cada um com a tela que resolve', () => {
    const { rows } = setup(
      [
        contract('ana', 'ath'),
        contract('maria', 'amb', { start: ago(40) }),
        contract('bruno', 'ath', { pendingTier: 'amb' }),
        contract('edu', 'amb', { state: 'ended' }),
      ],
      [...many('ana', 12), ...many('bruno', 5), ...many('edu', 0)],
    );
    const items = attentionItems({
      rows,
      released: { cents: 128_400, ambassadors: 14 },
      payoutDate: '2026-10-20',
      newApplications: 3,
      pilotFull: true,
      freeSeats: 0,
      rules: DEFAULT_SQUAD_RULES,
      now: NOW,
    });
    expect(items.map((i) => i.key)).toEqual(['payout', 'eligible-ana', 'risk-maria', 'applications', 'amendment-bruno']);
    // O Intl separa "R$" do número com espaço não separável.
    expect(items[0]!.title.replace(/\s/g, ' ')).toBe('R$ 1.284 em comissões liberadas');
    expect(items[0]!.sub).toBe('14 embaixadores · repasse em 20 out');
    expect(items[0]!.route).toBe('/painel/squad/comissoes');
    expect(items[1]!.title).toBe('ana elegível a Ambassador');
    expect(items[1]!.sub).toBe('12 conversões · meta era 10');
    expect(items[1]!.route).toBe('/painel/squad/embaixadores/ana');
    expect(items[2]!.tone).toBe('red');
    expect(items[2]!.sub).toBe('0 conversões em 40 dias');
    expect(items[3]!.sub).toBe('Piloto cheio · vão para a lista de espera');
    expect(items[4]!.sub).toContain('Athlete → Ambassador');
  });

  it('nada pendente: lista vazia', () => {
    const { rows } = setup([contract('joao', 'amb', { start: ago(10) })], []);
    const items = attentionItems({
      rows,
      released: { cents: 0, ambassadors: 0 },
      payoutDate: null,
      newApplications: 0,
      pilotFull: false,
      freeSeats: 5,
      rules: DEFAULT_SQUAD_RULES,
      now: NOW,
    });
    expect(items).toEqual([]);
  });
});

describe('scoreLeaders', () => {
  it('só contratos vivos com Score, do maior para o menor', () => {
    const { rows } = setup(
      [
        contract('a', 'amb', { score: 70 }),
        contract('b', 'amb', { score: 92 }),
        contract('c', 'amb'),
        contract('d', 'amb', { score: 99, state: 'ended' }),
      ],
      [],
    );
    expect(scoreLeaders(rows).map((r) => r.contract.uid)).toEqual(['b', 'a']);
  });
});

describe('overviewCsv', () => {
  it('uma linha por nível e o total, com ; e vírgula decimal', () => {
    const { rows, commissions } = setup([contract('joao', 'amb')], many('joao', 2));
    const k = overviewKpis({ rows, commissions, rules: DEFAULT_SQUAD_RULES, now: NOW });
    const csv = overviewCsv(tierSummaries(rows), k).split('\n');
    expect(csv[0]).toBe('perfil;embaixadores;conversoes;receita;custo;roi;custo_por_conversao');
    expect(csv[1]).toBe('Ambassador;1;2;240,00;144,00;1,7;72,00');
    expect(csv[2]).toBe('Total;1;2;240,00;144,00;1,7;72,00');
  });
});
