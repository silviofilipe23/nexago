import { DEFAULT_SQUAD_RULES } from '../../niveis-regras/data/squad-rules';
import type { Commission, CommissionStatus } from '../../comissoes/data/commission';
import type { Contract, CountedCommission } from '../../data/squad-program.repository';
import { buildRows } from '../../embaixadores/data/ambassador';
import {
  amendmentLines,
  benefitsOf,
  contractLines,
  conversionLines,
  costParts,
  identityLine,
  profileContractFromDoc,
  promotionView,
  roiGoalHint,
  scoreParts,
  scoreRank,
  shareLinks,
  type ProfileContract,
} from './profile';

const NOW = new Date('2026-10-15T15:00:00-03:00');
const DAY = 24 * 60 * 60 * 1000;
const ago = (n: number) => new Date(NOW.getTime() - n * DAY);
const ts = (d: Date) => ({ toDate: () => d });
const plain = (s: string) => s.replace(/\s/g, ' ');

function contract(over: Partial<ProfileContract> = {}): ProfileContract {
  return {
    ...profileContractFromDoc('joao', {
      displayName: 'João Victor Alves',
      tier: 'amb',
      code: 'JOAO10',
      slug: 'joao10',
      commissionPct: 10,
      followerDiscountPct: 10,
      rulesVersion: 2,
      status: 'active',
      start: ts(new Date('2026-09-08T10:00:00-03:00')),
      end: ts(new Date('2026-12-06T23:59:59-03:00')),
    }),
    ...over,
  };
}

function commission(status: CommissionStatus, daysAgo: number, over: Partial<Commission> = {}): Commission {
  return {
    id: `c-${status}-${daysAgo}`,
    ambassadorId: 'joao',
    ambassadorName: 'João Victor',
    ambassadorCode: 'JOAO10',
    ambassadorTier: 'amb',
    registrationId: 'r',
    tournamentName: 'Open Errejota',
    categoryName: 'Masc. C',
    paymentId: 'p',
    convertedLabel: 'Lucas M.',
    convertedCount: 1,
    origin: 'code',
    grossCents: 120_00,
    feeCents: 9_60,
    netCents: 120_00,
    pct: 10,
    amountCents: 12_00,
    rulesVersion: 2,
    status,
    cancelReason: null,
    cancelNote: null,
    payoutId: null,
    hold: null,
    timeline: [],
    registeredAt: ago(daysAgo),
    releasedAt: null,
    ...over,
  };
}

function rowOf(c: Contract, n: number) {
  const counted: CountedCommission[] = Array.from({ length: n }, (_, i) => ({
    ambassadorId: c.uid,
    netCents: 120_00,
    amountCents: 12_00,
    registeredAt: ago(i + 1),
  }));
  return buildRows({ contracts: [c], commissions: counted, rules: DEFAULT_SQUAD_RULES, period: 'pilot', now: NOW })[0]!;
}

describe('profileContractFromDoc', () => {
  it('lê o contrato completo, com aditivos e motivos', () => {
    const c = profileContractFromDoc('joao', {
      displayName: 'João',
      tier: 'amb',
      status: 'paused',
      pausedUntil: '2026-11-01',
      pauseReason: 'Lesão',
      followerDiscountPct: 15,
      amendments: [
        { at: ts(ago(3)), fromTier: 'amb', toTier: 'pro', reason: 'Bateu a meta', by: { name: 'Lia' }, acceptedAt: null, canceledAt: null },
        { at: ts(ago(9)), fromTier: 'amb', toTier: 'cap', reason: 'x', acceptedAt: null, canceledAt: ts(ago(3)) },
        { fromTier: 'nada', toTier: 'pro' },
      ],
    });
    expect(c.state).toBe('paused');
    expect(c.pauseReason).toBe('Lesão');
    expect(c.followerDiscountPct).toBe(15);
    expect(c.amendments.length).toBe(2);
    expect(c.amendments[0]!.by).toBe('Lia');
    expect(c.pendingTier).toBe('pro');
  });
});

describe('identidade e links', () => {
  it('monta a linha só com o que existe', () => {
    const c = contract({ city: 'Goiânia' });
    expect(identityLine(c, null)).toBe('Goiânia');
    expect(
      identityLine(c, {
        city: 'Goiânia',
        state: 'GO',
        arenaName: 'Arena Errejota',
        elo: 'Competidor II',
        tournaments: 12,
        rankingPosition: 4,
        referredCount: 3,
        followers: null,
        engagementPct: null,
      }),
    ).toBe('Goiânia/GO · joga na Arena Errejota · Competidor II · 12 torneios no NexaGO');
  });

  it('o link que a atribuição já entende, e o QR com via=qr', () => {
    expect(shareLinks('JOAO10')).toEqual({
      link: 'https://atleta.nexago.com.br/?squad=JOAO10',
      label: 'atleta.nexago.com.br/?squad=JOAO10',
      qr: 'https://atleta.nexago.com.br/?squad=JOAO10&via=qr',
    });
  });
});

describe('scoreRank e scoreParts', () => {
  it('posição entre os vivos com Score; sem Score, nada', () => {
    const list = [
      contract({ uid: 'a', name: 'A', score: 80 }),
      contract({ uid: 'joao', score: 92 }),
      contract({ uid: 'b', name: 'B', score: 99, state: 'ended' }),
      contract({ uid: 'c', name: 'C', score: null }),
    ];
    expect(scoreRank('joao', list)).toEqual({ position: 1, of: 2 });
    expect(scoreRank('c', list)).toBeNull();
  });

  it('os 8 componentes com o peso das regras', () => {
    const parts = scoreParts(DEFAULT_SQUAD_RULES);
    expect(parts.length).toBe(8);
    expect(parts[0]).toEqual({ key: 'conversions', label: 'Conversões', max: 30 });
    expect(parts.reduce((n, p) => n + p.max, 0)).toBe(100);
  });
});

describe('promotionView', () => {
  it('Ambassador → Pro: conversões, ROI mínimo e o checklist manual', () => {
    const v = promotionView(rowOf(contract(), 27), DEFAULT_SQUAD_RULES);
    expect(v.kind).toBe('promotion');
    if (v.kind !== 'promotion') return;
    expect(v.to).toBe('pro');
    expect(v.conversions).toBe(27);
    expect(v.min).toBe(30);
    expect(v.pct).toBe(90);
    expect(v.criteria.map((c) => [c.label, c.value, c.ok])).toEqual([
      ['ROI mínimo 3,0x', '7,3x', true],
      ['Influência relevante', 'avaliação do time', null],
      ['Participação consistente', 'avaliação do time', null],
      ['≥ 30 conversões', 'faltam 3', false],
    ]);
  });

  it('Pro e Captain não têm promoção: mostra a permanência pelo ROI', () => {
    const v = promotionView(rowOf(contract({ tier: 'pro' }), 1), DEFAULT_SQUAD_RULES);
    expect(v.kind).toBe('stay');
    if (v.kind !== 'stay') return;
    expect(v.criteria[0]!.label).toBe('ROI acima de 1,5x');
    expect(v.criteria[0]!.ok).toBeFalse();
    expect(v.watch).toEqual(DEFAULT_SQUAD_RULES.termination.checklist);
  });

  it('a dica do KPI de ROI', () => {
    expect(roiGoalHint('amb', DEFAULT_SQUAD_RULES)).toBe('meta mínima 3,0x');
    expect(roiGoalHint('ath', DEFAULT_SQUAD_RULES)).toBe('limite de encerramento 1,5x');
  });
});

describe('custo e benefícios', () => {
  it('comissão + kit; inscrições gratuitas e cachês sem fonte', () => {
    const parts = costParts(rowOf(contract(), 27), DEFAULT_SQUAD_RULES);
    expect(parts).toEqual([
      { label: 'Comissão 10%', cents: 27 * 12_00 },
      { label: 'Kit completo', cents: 120_00 },
      { label: 'Inscrições gratuitas', cents: null },
      { label: 'Cachês e bônus', cents: null },
    ]);
  });

  it('o pacote do nível, com o desconto do seguidor do contrato', () => {
    const pro = benefitsOf(DEFAULT_SQUAD_RULES.tiers.pro, contract({ tier: 'pro', followerDiscountPct: 12 }));
    expect(pro.map((b) => b.label)).toEqual([
      'Kit premium + uniforme',
      'Inscrições ilimitadas',
      'Eventos · Prioridade + exclusivos',
      '50% para a dupla',
      '12% de desconto para o seguidor',
      'Cachê de campanha',
    ]);
    const amb = benefitsOf(DEFAULT_SQUAD_RULES.tiers.amb, contract({ followerDiscountPct: null }));
    expect(amb.map((b) => b.label)).toContain('1 inscrição grátis por mês');
    expect(amb.map((b) => b.label)).toContain('10% de desconto para o seguidor');
  });
});

describe('contrato', () => {
  it('período, comissão, regras e encerramento agendado', () => {
    const lines = contractLines(contract({ endsAt: '2026-10-31', endReason: 'low_conversion' }), NOW);
    expect(lines).toEqual([
      { label: 'Período', value: '08 set → 06 dez 2026' },
      { label: 'Dias de contrato', value: '37 dias' },
      { label: 'Comissão', value: '10% da receita líquida' },
      { label: 'Desconto do seguidor', value: '10%' },
      { label: 'Regras', value: 'v2.0 · congeladas no aceite' },
      { label: 'Encerramento agendado', value: 'em 31 out · Baixa conversão' },
    ]);
  });

  it('pausa sem data de volta e encerrado', () => {
    const paused = contractLines(contract({ state: 'paused', pauseReason: 'Lesão' }), NOW);
    expect(paused.find((l) => l.label === 'Pausa')!.value).toBe('sem data de volta · Lesão');
    const ended = contractLines(contract({ state: 'ended', endedAt: ago(2), endReason: 'athlete_request' }), NOW);
    expect(ended.find((l) => l.label === 'Encerrado')!.value).toBe('em 13 out · Pedido do atleta');
    expect(ended.find((l) => l.label === 'Dias de contrato')!.value).toBe('35 dias');
  });

  it('aditivos do mais novo para o mais antigo', () => {
    const c = contract({
      amendments: [
        { at: ago(20), fromTier: 'ath', toTier: 'amb', reason: '', by: null, commissionPct: 10, acceptedAt: ago(19), canceledAt: null },
        { at: ago(3), fromTier: 'amb', toTier: 'pro', reason: '', by: null, commissionPct: 12, acceptedAt: null, canceledAt: null },
        { at: ago(9), fromTier: 'amb', toTier: 'cap', reason: '', by: null, commissionPct: 10, acceptedAt: null, canceledAt: ago(3) },
      ],
    });
    expect(amendmentLines(c)).toEqual([
      { label: 'Ambassador → Pro Ambassador', status: 'aguardando aceite · enviado 12 out', tone: 'orange' },
      { label: 'Ambassador → Captain', status: 'substituído', tone: 'dim' },
      { label: 'Athlete → Ambassador', status: 'aceito 26 set', tone: 'green' },
    ]);
  });
});

describe('conversionLines', () => {
  it('mais recentes primeiro, com status e origem da comissão', () => {
    const lines = conversionLines(
      [
        commission('paid', 6, { origin: 'qr' }),
        commission('pending', 0, { registeredAt: new Date('2026-10-15T14:12:00-03:00') }),
        commission('canceled', 2, { cancelReason: 'refund', origin: 'link' }),
      ],
      NOW,
    );
    expect(lines.map((l) => l.when)).toEqual(['Hoje 14:12', '13 out', '09 out']);
    expect(lines.map((l) => l.status)).toEqual(['Aguardando pgto', 'Cancelada · reembolso', 'Paga']);
    expect(lines.map((l) => l.origin)).toEqual(['Código', 'Link', 'QR']);
    expect(lines[0]!.registration).toBe('Open Errejota · Masc. C');
    expect(lines[1]!.canceled).toBeTrue();
    expect(plain(lines[0]!.status)).toBe('Aguardando pgto');
  });
});
