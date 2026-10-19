import {
  attentionOf,
  contractFromRaw,
  dayRangeLabel,
  inTab,
  matchesSearch,
  nextStep,
  sortByEvent,
  sortSponsors,
  sponsorFromRaw,
  tabCounts,
  tabOf,
  type PlanContract,
  type PlanSponsor,
} from './plan-contracts';

const RAW = {
  organizerId: 'org1',
  tournamentId: 't1',
  tournamentName: 'Open Goiânia Beach',
  city: 'Goiânia',
  startDate: '2026-11-28',
  endDate: '2026-11-30',
  planId: 'plano-4',
  planVersion: 2,
  plan: { name: 'Plano 4', priceCents: 3500_00, depositPct: 50, balanceDays: 7, cancelPolicy: 'parcial', courts: 4,
    refsPerCourt: 2, live: true, narrator: true, hours: 10, extraHourCents: 0, leadDays: 21, cities: ['Goiânia'] },
  priceCents: 3500_00,
  depositCents: 1750_00,
  balanceCents: 1750_00,
  balanceDueDate: '2026-11-21',
  sponsors: { enabled: true, organizerSharePct: 20, logoApproval: true,
    tiers: [{ id: 'ouro', name: 'Ouro', color: '#F4C543', priceCents: 200_00, appearances: 50, seconds: 5, mentions: 2, maxPerEvent: 2 }] },
  status: 'requested',
  createdBy: { uid: 'org1', name: 'Ana Organiza' },
  history: [{ status: 'requested', at: new Date('2026-10-19T12:00:00Z'), by: { uid: 'org1', name: 'Ana Organiza' } }],
};

function contract(edit: Record<string, unknown> = {}, id = 't1'): PlanContract {
  return contractFromRaw(id, { ...RAW, ...edit })!;
}

function sponsor(id: string, edit: Record<string, unknown>): PlanSponsor {
  return sponsorFromRaw(id, { name: id, tierId: 'ouro', tier: RAW.sponsors.tiers[0], ...edit })!;
}

describe('plan-contracts (backoffice)', () => {
  it('lê o contrato congelado com organizador, contas e histórico', () => {
    const c = contract();
    expect(c.id).toBe('t1');
    expect(c.organizerName).toBe('Ana Organiza');
    expect(c.plan.courts).toBe(4);
    expect(c.planVersion).toBe(2);
    expect(c.sponsors.tiers.map((t) => t.id)).toEqual(['ouro']);
    expect(c.history.length).toBe(1);
    expect(c.history[0]!.by).toBe('Ana Organiza');
  });

  it('descarta doc sem status conhecido ou sem data', () => {
    expect(contractFromRaw('x', { ...RAW, status: 'pending' })).toBeNull();
    expect(contractFromRaw('x', { ...RAW, startDate: '' })).toBeNull();
  });

  it('próximo passo na ordem; concluir só a partir do último dia', () => {
    expect(nextStep(contract(), '2026-10-19')?.to).toBe('deposit_paid');
    expect(nextStep(contract({ status: 'deposit_paid' }), '2026-10-19')?.to).toBe('paid');
    expect(nextStep(contract({ status: 'paid' }), '2026-11-29')?.blocked).toContain('30 Nov');
    expect(nextStep(contract({ status: 'paid' }), '2026-11-30')?.blocked).toBeNull();
    expect(nextStep(contract({ status: 'completed' }), '2026-12-01')).toBeNull();
    expect(nextStep(contract({ status: 'cancelled' }), '2026-12-01')).toBeNull();
  });

  it('plano sem sinal muda o rótulo do primeiro passo', () => {
    expect(nextStep(contract({ depositCents: 0, balanceCents: 3500_00 }), '2026-10-19')?.label).toBe('Confirmar contrato');
  });

  it('pendência: sinal a receber, saldo vencido, evento terminado', () => {
    // O Intl põe espaço sem quebra entre "R$" e o valor.
    expect(attentionOf(contract(), '2026-10-19')?.text).toMatch(/^Aguardando sinal de R\$\s1\.750$/);
    expect(attentionOf(contract({ status: 'deposit_paid' }), '2026-11-22')).toEqual({ text: 'Saldo vencido em 21 Nov', tone: 'late' });
    expect(attentionOf(contract({ status: 'deposit_paid' }), '2026-11-20')?.tone).toBe('dim');
    expect(attentionOf(contract({ status: 'paid' }), '2026-11-29')).toBeNull();
    expect(attentionOf(contract({ status: 'paid' }), '2026-11-30')?.tone).toBe('warn');
  });

  it('abas: "Em aberto" junta solicitado, sinal pago e pago; aba desconhecida cai nela', () => {
    const list = [
      contract({}, 'a'),
      contract({ status: 'deposit_paid' }, 'b'),
      contract({ status: 'paid' }, 'c'),
      contract({ status: 'completed' }, 'd'),
      contract({ status: 'cancelled' }, 'e'),
    ];
    const counts = tabCounts(list);
    expect(counts.abertos).toBe(3);
    expect(counts.todos).toBe(5);
    expect(counts.cancelled).toBe(1);
    expect(tabOf('xyz')).toBe('abertos');
    expect(inTab(list[3]!, 'abertos')).toBeFalse();
  });

  it('ordena pela data do evento, o mais próximo primeiro', () => {
    const list = [
      contract({ startDate: '2026-12-05', endDate: '2026-12-06' }, 'tarde'),
      contract({ startDate: '2026-11-01', endDate: '2026-11-01' }, 'cedo'),
      contract({}, 'meio'),
    ];
    expect(sortByEvent(list).map((c) => c.id)).toEqual(['cedo', 'meio', 'tarde']);
  });

  it('busca sem acento por evento, organizador, cidade ou plano', () => {
    expect(matchesSearch(contract(), 'goiania')).toBeTrue();
    expect(matchesSearch(contract(), 'ana org')).toBeTrue();
    expect(matchesSearch(contract(), 'plano 4')).toBeTrue();
    expect(matchesSearch(contract(), 'recife')).toBeFalse();
  });

  it('logos em análise vêm primeiro; motivo da recusa e origem lidos do doc', () => {
    const list = [
      sponsor('aprovada', { logoStatus: 'approved', logoUrl: 'u1' }),
      sponsor('analise', { logoStatus: 'review', logoUrl: 'u2' }),
      sponsor('recusada', { logoStatus: 'rejected', logoUrl: 'u3', logoRejectReason: 'Fundo branco', source: 'nexago' }),
    ];
    expect(sortSponsors(list).map((s) => s.id)).toEqual(['analise', 'recusada', 'aprovada']);
    expect(list[2]!.logoRejectReason).toBe('Fundo branco');
    expect(list[2]!.source).toBe('nexago');
    expect(list[0]!.source).toBe('organizer');
  });

  it('período do evento com o ano', () => {
    expect(dayRangeLabel('2026-11-28', '2026-11-30')).toBe('28–30 Nov 2026');
    expect(dayRangeLabel('2026-11-30', '2026-12-01')).toBe('30 Nov – 01 Dez 2026');
    expect(dayRangeLabel('2026-11-28', '2026-11-28')).toBe('28 Nov 2026');
  });
});
