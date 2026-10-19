import {
  balanceDueDateOf,
  brl,
  catalogFromRaw,
  contractAmounts,
  contractBlockers,
  contractFromRaw,
  contractNextStep,
  contractableTournaments,
  courtsWarning,
  dayRangeLabel,
  organizerShareCents,
  planSponsorFromRaw,
  recommendedPlanId,
  sortContracts,
  sponsorsRevenueCents,
  tierDeliveryLabel,
  tierUsage,
  validatePlanSponsorLogo,
  type CatalogPlan,
  type PlanContract,
  type PlanSponsor,
} from './plan-contracts';
import { planCallableMessage } from './plan-contracts-repository';
import type { OrganizerTournament } from './tournament.model';

function plan(id: string, courts: number, edit: Partial<CatalogPlan> = {}): CatalogPlan {
  return {
    id,
    order: courts,
    name: `Plano ${courts}`,
    description: '',
    priceCents: [0, 1700_00, 2500_00, 3000_00, 3500_00][courts] ?? 4000_00,
    depositPct: 50,
    balanceDays: 7,
    cancelPolicy: 'parcial',
    courts,
    refsPerCourt: 2,
    live: true,
    narrator: true,
    hours: 10,
    extraHourCents: 0,
    leadDays: 21,
    cities: ['Goiânia', 'Brasília'],
    ...edit,
  };
}

function contract(id: string, status: PlanContract['status'], startDate: string): PlanContract {
  return contractFromRaw(id, {
    status,
    startDate,
    endDate: startDate,
    planId: 'plano-4',
    plan: plan('plano-4', 4),
    priceCents: 3500_00,
    depositCents: 1750_00,
    balanceCents: 1750_00,
    balanceDueDate: '2026-11-21',
    sponsors: { enabled: true, organizerSharePct: 20, logoApproval: true, tiers: [] },
  })!;
}

describe('plan-contracts · leitura', () => {
  it('catálogo cru vira tipado, com defaults seguros', () => {
    const c = catalogFromRaw({
      plans: [{ id: 'plano-1', name: 'Plano 1', priceCents: 170000, courts: 1, live: false, narrator: true }, { name: 'sem id' }],
      sponsors: { tiers: [{ id: 'ouro', name: 'Ouro', color: 'roxo', priceCents: 20000 }], organizerSharePct: 20 },
      feePercent: 6,
      today: '2026-10-19',
    });
    expect(c.plans.map((p) => p.id)).toEqual(['plano-1']);
    expect(c.plans[0]!.narrator).toBeFalse();
    expect(c.sponsors.tiers[0]!.color).toBe('#C9CDD4');
    expect(c.feePercent).toBe(6);
  });

  it('contrato com status desconhecido é descartado', () => {
    expect(contractFromRaw('t1', { status: 'pending', startDate: '2026-11-28' })).toBeNull();
    expect(contract('t1', 'requested', '2026-11-28').plan.id).toBe('plano-4');
  });

  it('patrocinador sem nome é descartado e logoStatus estranho vira "Enviar logo"', () => {
    expect(planSponsorFromRaw('s1', { name: '  ' })).toBeNull();
    const s = planSponsorFromRaw('s1', { name: 'Açaí', tierId: 'ouro', tier: { name: 'Ouro', priceCents: 20000 }, logoStatus: '??' })!;
    expect(s.logoStatus).toBe('missing');
    expect(s.tier.id).toBe('ouro');
    expect(s.source).toBe('organizer');
    expect(s.logoRejectReason).toBeNull();
  });

  it('motivo da recusa só vale com a logo recusada', () => {
    const raw = { name: 'Açaí', tierId: 'ouro', logoUrl: 'u1', logoRejectReason: '  Fundo branco some na transmissão ' };
    expect(planSponsorFromRaw('s1', { ...raw, logoStatus: 'rejected' })!.logoRejectReason).toBe('Fundo branco some na transmissão');
    expect(planSponsorFromRaw('s1', { ...raw, logoStatus: 'rejected', logoRejectReason: null })!.logoRejectReason).toBeNull();
    expect(planSponsorFromRaw('s1', { ...raw, logoStatus: 'rejected', logoRejectReason: '   ' })!.logoRejectReason).toBeNull();
    // Reenviou: o servidor volta o status pra análise e deixa o motivo antigo no doc.
    expect(planSponsorFromRaw('s1', { ...raw, logoStatus: 'review' })!.logoRejectReason).toBeNull();
    expect(planSponsorFromRaw('s1', { ...raw, logoStatus: 'approved' })!.logoRejectReason).toBeNull();
  });
});

describe('plan-contracts · contas e datas', () => {
  it('sinal e saldo fecham o preço; saldo nunca vence no passado', () => {
    expect(contractAmounts({ priceCents: 3500_00, depositPct: 50 })).toEqual({ depositCents: 1750_00, balanceCents: 1750_00 });
    expect(balanceDueDateOf('2026-11-28', 7, '2026-10-19')).toBe('2026-11-21');
    expect(balanceDueDateOf('2026-10-21', 7, '2026-10-19')).toBe('2026-10-19');
  });

  it('período no mesmo mês e virando o mês', () => {
    expect(dayRangeLabel('2026-11-28', '2026-11-30')).toBe('28–30 Nov');
    expect(dayRangeLabel('2026-11-30', '2026-12-01')).toBe('30 Nov – 01 Dez');
    expect(dayRangeLabel('2026-11-28', '2026-11-28')).toBe('28 Nov');
  });

  it('valor redondo sem centavos, com centavos quando há', () => {
    expect(brl(3500_00).replace(/\s/g, ' ')).toBe('R$ 3.500');
    expect(brl(1750_50).replace(/\s/g, ' ')).toBe('R$ 1.750,50');
  });
});

describe('plan-contracts · escolha do plano', () => {
  const plans = [plan('plano-1', 1), plan('plano-2', 2), plan('plano-3', 3), plan('plano-4', 4)];

  it('recomenda o que cobre as quadras do evento', () => {
    expect(recommendedPlanId(plans, 3)).toBe('plano-3');
    expect(recommendedPlanId([plans[0]!, plans[3]!], 2)).toBe('plano-4');
    expect(recommendedPlanId(plans, 6)).toBe('plano-4');
  });

  it('avisa quando sobra quadra sem arbitragem', () => {
    expect(courtsWarning(plans[1]!, 4)).toBe('O Plano 2 cobre 2 quadras. As outras 2 ficam sem arbitragem NexaGO.');
    expect(courtsWarning(plans[2]!, 4)).toBe('O Plano 3 cobre 3 quadras. A outra fica sem arbitragem NexaGO.');
    expect(courtsWarning(plans[3]!, 4)).toBeNull();
  });

  it('trava pela antecedência e pela cidade, como o servidor', () => {
    const p = plans[3]!;
    expect(contractBlockers(p, { startDate: '2026-11-28', city: 'goiania' }, '2026-10-19')).toEqual([]);
    expect(contractBlockers(p, { startDate: '2026-11-01', city: 'Goiânia' }, '2026-10-19')[0]).toContain('21 dias');
    expect(contractBlockers(p, { startDate: '2026-11-28', city: 'Recife' }, '2026-10-19')[0]).toContain('não atende Recife');
    expect(contractBlockers({ ...p, cities: [] }, { startDate: '2026-11-28', city: null }, '2026-10-19')).toEqual([]);
  });

  it('só eventos do dono, por acontecer e sem contrato ativo', () => {
    const t = (id: string, startAt: string, edit: Partial<OrganizerTournament> = {}) =>
      ({ id, startAt: new Date(startAt), myRole: 'owner', status: 'inscricoes', ...edit }) as OrganizerTournament;
    const list = [
      t('futuro', '2026-12-05T12:00:00Z'),
      t('cedo', '2026-11-20T12:00:00Z'),
      t('passado', '2026-10-01T12:00:00Z'),
      t('alheio', '2026-12-01T12:00:00Z', { myRole: 'manager' }),
      t('cancelado', '2026-12-01T12:00:00Z', { status: 'cancelado' }),
      t('contratado', '2026-12-01T12:00:00Z'),
      t('recontratar', '2026-12-02T12:00:00Z'),
    ];
    const contracts = [contract('contratado', 'requested', '2026-12-01'), contract('recontratar', 'cancelled', '2026-12-02')];
    expect(contractableTournaments(list, contracts, '2026-10-19').map((x) => x.id)).toEqual(['cedo', 'recontratar', 'futuro']);
  });
});

describe('plan-contracts · contratos e cotas', () => {
  it('ativos primeiro por data, histórico depois', () => {
    const list = [
      contract('velho', 'completed', '2026-05-02'),
      contract('dez', 'paid', '2026-12-10'),
      contract('nov', 'requested', '2026-11-28'),
      contract('cancel', 'cancelled', '2026-09-01'),
    ];
    expect(sortContracts(list).map((c) => c.tournamentId)).toEqual(['nov', 'dez', 'cancel', 'velho']);
  });

  it('o próximo passo do dinheiro', () => {
    expect(contractNextStep(contract('a', 'deposit_paid', '2026-11-28')).replace(/\s/g, ' ')).toBe('Saldo de R$ 1.750 até 21 Nov');
    expect(contractNextStep(contract('a', 'requested', '2026-11-28'))).toContain('A NexaGO confirma a data');
  });

  it('uso das cotas, receita e repasse', () => {
    const tiers = [
      { id: 'bronze', name: 'Bronze', color: '#C98A5A', priceCents: 50_00, appearances: 10, seconds: 5, mentions: 0, maxPerEvent: 8 },
      { id: 'ouro', name: 'Ouro', color: '#F4C543', priceCents: 200_00, appearances: 50, seconds: 5, mentions: 2, maxPerEvent: 2 },
    ];
    const s = (id: string, tier: (typeof tiers)[number]): PlanSponsor => ({
      id, name: id, tierId: tier.id, tier, logoUrl: null, logoStatus: 'missing', logoRejectReason: null, source: 'organizer', createdAt: null,
    });
    const sponsors = [s('a', tiers[1]!), s('b', tiers[1]!), s('c', tiers[0]!)];
    expect(tierUsage(tiers, sponsors).map((u) => [u.used, u.left])).toEqual([[1, 7], [2, 0]]);
    expect(sponsorsRevenueCents(sponsors)).toBe(450_00);
    expect(organizerShareCents(450_00, 20)).toBe(90_00);
    expect(tierDeliveryLabel(tiers[1]!)).toBe('50 aparições de 5s + 2 menções do narrador');
  });

  it('logo: tipos de imagem até 4 MB', () => {
    expect(validatePlanSponsorLogo({ type: 'image/png', size: 1024 })).toBeNull();
    expect(validatePlanSponsorLogo({ type: 'application/pdf', size: 1024 })).toContain('PNG');
    expect(validatePlanSponsorLogo({ type: 'image/png', size: 5 * 1024 * 1024 })).toContain('4 MB');
  });

  it('callable não deployada não vaza "not-found" cru pra tela', () => {
    const raw = Object.assign(new Error('not-found'), { code: 'functions/not-found' });
    expect(planCallableMessage(raw)).toContain('Tente de novo');
    const real = Object.assign(new Error('A agenda do Plano 4 está cheia em 28/11/2026.'), { code: 'functions/resource-exhausted' });
    expect(planCallableMessage(real)).toContain('agenda do Plano 4');
  });
});
