import { SQUAD_TEST_NOW, ambassadorView, commissionLine, daysAgoIso } from '../../../testing/squad-fixtures';
import {
  availableHint,
  benefitsOf,
  brl,
  commissionStatusMeta,
  contractNotice,
  cyclePill,
  followerOffer,
  funnelSteps,
  levelProgress,
  packageChips,
  payoutDaysLabel,
  pointsRules,
  promotionCopy,
  shareLinks,
  statementLines,
  weeklyCommissions,
  whenLabel,
} from './squad-model';
import { parseSquadView } from './squad-view';

const NOW = SQUAD_TEST_NOW;

describe('squad-model', () => {
  it('dinheiro: com e sem centavos, negativo com sinal', () => {
    expect(brl(3240_00, false)).toBe('R$ 3.240');
    expect(brl(132_00)).toBe('R$ 132,00');
    expect(brl(-10_50)).toBe('− R$ 10,50');
  });

  it('link e QR no formato que a atribuição entende', () => {
    expect(shareLinks('JOAO10')).toEqual({
      link: 'https://atleta.nexago.com.br/?squad=JOAO10',
      label: 'atleta.nexago.com.br/?squad=JOAO10',
      qr: 'https://atleta.nexago.com.br/?squad=JOAO10&via=qr',
    });
  });

  it('ciclo: dia do piloto pela data civil de São Paulo', () => {
    const cycle = { id: 'piloto', start: '2026-09-08', end: '2026-12-06', seats: 20 };
    expect(cyclePill(cycle, NOW)).toBe('Piloto · dia 40 de 90');
    expect(cyclePill(cycle, new Date('2026-09-01T12:00:00Z'))).toBe('Piloto · começa em 08 set');
    expect(cyclePill({ ...cycle, id: 'c2' }, new Date('2026-12-10T12:00:00Z'))).toBe('Ciclo · encerrado em 06 dez');
  });

  it('quando: hoje com hora, ontem, data curta', () => {
    expect(whenLabel('2026-10-17T17:12:00Z', NOW)).toBe('Hoje 14:12');
    expect(whenLabel(daysAgoIso(1), NOW)).toBe('Ontem');
    expect(whenLabel('2026-10-14T15:00:00Z', NOW)).toBe('14 out');
  });

  it('o desconto do seguidor sai como "até X%" (o teto na taxa corta)', () => {
    const offer = followerOffer(ambassadorView().contract);
    expect(offer.discount).toBe('até 10% OFF na primeira inscrição');
    expect(offer.rest).toBe('Você recebe 10% depois que o pagamento é confirmado.');
    // Nível sem desconto do seguidor não promete "até 0% OFF".
    const none = { ...ambassadorView().contract, followerDiscountPct: 0 };
    expect(followerOffer(none).discount).toBeNull();
    expect(benefitsOf({ ...ambassadorView(), contract: none }).some((b) => b.label.includes('OFF'))).toBeFalse();
  });

  it('disponível: data do repasse, acumulando abaixo do mínimo e retido', () => {
    const v = ambassadorView();
    expect(availableHint(v)).toBe('vai pra carteira em 20 out');
    expect(availableHint({ ...v, totals: { ...v.totals, availableCents: 12_00 } })).toBe('acumulando · repasse a partir de R$ 20');
    expect(availableHint({ ...v, totals: { ...v.totals, availableCents: 0, heldCents: 14_00 } })).toBe(
      'próximo repasse em 20 out · R$ 14,00 em revisão',
    );
  });

  it('funil: cliques sem medição ficam "—" e sem barra', () => {
    const steps = funnelSteps({ clicks: null, signups: 74, registrations: 31, paid: 27 });
    expect(steps.map((s) => s.value)).toEqual([null, 74, 31, 27]);
    expect(steps[0]!.pct).toBe(0);
    expect(steps[1]!.pct).toBe(100);
    // Zero não ganha a largura mínima: barra laranja em funil vazio parecia conversão.
    expect(funnelSteps({ clicks: null, signups: 0, registrations: 0, paid: 0 }).map((s) => s.pct)).toEqual([0, 0, 0, 0]);
  });

  it('nível: Gold com 28% da faixa e 720 pts para Elite', () => {
    const l = levelProgress(ambassadorView().points);
    expect(l.current).toBe('Gold');
    expect(l.next).toEqual({ name: 'Elite', missing: 720 });
    expect(l.bars.map((b) => b.pct)).toEqual([100, 100, 28, 0]);
    expect(l.bars.map((b) => b.done)).toEqual([true, true, false, false]);
    expect(levelProgress({ total: 2400, levels: ambassadorView().points.levels }).next).toBeNull();
  });

  it('presença e conteúdo sem fonte aparecem como "em breve"', () => {
    expect(pointsRules(ambassadorView().points).map((r) => [r.value, r.soon])).toEqual([
      ['+40', false],
      ['+20', true],
      ['+10', true],
    ]);
  });

  it('promoção: faltam 3, sem ROI em lugar nenhum', () => {
    const p = promotionCopy(ambassadorView().promotion);
    expect(p.title).toBe('Faltam 3 conversões pra concorrer');
    expect(p.summary).toBe('Mais 3 até a avaliação de 06 dez para concorrer a Pro Ambassador.');
    expect(p.pct).toBe(90);
    expect(JSON.stringify(p).toLowerCase()).not.toContain('roi');
    expect(promotionCopy({ kind: 'top' }).title).toBe('Você está no topo do Squad');
  });

  it('o que muda: chips do pacote do próximo nível', () => {
    const v = ambassadorView();
    const next = v.promotion.kind === 'promotion' ? v.promotion.nextPackage : v.package;
    expect(packageChips(next)).toEqual([
      'Comissão de 10 a 15%',
      'Inscrições gratuitas',
      'Kit premium + uniforme',
      'Eventos: Prioridade + exclusivos',
      '50% para sua dupla',
      'Cachê por campanha',
    ]);
  });

  it('benefícios: "Ativo" só no que o NexaGO opera; pausa apaga', () => {
    const v = ambassadorView();
    expect(benefitsOf(v).map((b) => [b.label, b.status])).toEqual([
      ['10% de comissão', 'active'],
      ['Até 10% OFF pra quem usa seu código', 'active'],
      ['1 inscrição gratuita por mês', 'package'],
      ['Kit completo', 'package'],
      ['Eventos: Prioridade', 'package'],
    ]);
    const paused = benefitsOf({ ...v, contract: { ...v.contract, status: 'paused' } });
    expect(paused[0]!.status).toBe('paused');
  });

  it('aviso de contrato: pausado, encerrado e aditivo pendente', () => {
    const c = ambassadorView().contract;
    expect(contractNotice(c)).toBeNull();
    expect(contractNotice({ ...c, status: 'paused', pausedUntil: '2026-11-01' })?.text).toContain('pausado até 01 nov');
    expect(contractNotice({ ...c, status: 'ended', endedAt: '2026-10-10T15:00:00Z' })?.text).toContain('terminou em 10 out');
    expect(contractNotice({ ...c, pendingTier: 'pro' })?.text).toContain('Pro Ambassador');
  });

  it('status da comissão com o motivo do cancelamento', () => {
    expect(commissionStatusMeta('canceled', 'refund')).toEqual({ label: 'Cancelada · reembolso', tone: 'live' });
    expect(commissionStatusMeta('held', null).label).toBe('Em revisão');
    expect(commissionStatusMeta('pending', null).label).toBe('Aguardando pgto');
  });

  it('semanas: 6 barras de segunda a domingo, a melhor com o torneio', () => {
    const lines = [
      commissionLine({ id: 'a', at: '2026-10-13T15:00:00Z', amountCents: 40_00, event: 'Open Errejota · Masc. C' }),
      commissionLine({ id: 'b', at: '2026-10-14T15:00:00Z', amountCents: 44_00, event: 'Open Errejota · Fem. B' }),
      commissionLine({ id: 'c', at: '2026-10-07T15:00:00Z', amountCents: 20_00, event: 'Copa CFC · Misto' }),
      commissionLine({ id: 'p', at: '2026-10-16T15:00:00Z', amountCents: 99_00, status: 'pending' }),
      commissionLine({ id: 'x', at: '2026-10-15T15:00:00Z', amountCents: 99_00, status: 'canceled' }),
    ];
    const w = weeklyCommissions(lines, NOW);
    expect(w.bars.map((b) => b.label)).toEqual(['7 set', '14', '21', '28', '5 out', '12']);
    expect(w.bars.map((b) => b.cents)).toEqual([0, 0, 0, 0, 20_00, 84_00]);
    expect(w.bars[5]!.best).toBeTrue();
    expect(w.best).toEqual({ cents: 84_00, event: 'Open Errejota' });
    expect(weeklyCommissions([], NOW).best).toBeNull();
  });

  it('extrato: comissões, estornos e repasses do mais novo ao mais velho, com filtro', () => {
    const v = ambassadorView({
      adjustments: [{ id: 'adj', at: daysAgoIso(2), amountCents: -10_00, athlete: 'Henrique A.' }],
    });
    const all = statementLines(v, 'all', NOW);
    expect(all.map((l) => [l.title, l.amount])).toEqual([
      ['Lucas M. · Open Errejota', '+ R$ 12,00'],
      ['Tatiane R. · Liga NexaGO', '+ R$ 14,00'],
      ['Estorno · Henrique A.', '− R$ 10,00'],
      ['Henrique A. · Open Errejota', 'R$ 10,00'],
      ['Repasse para a carteira', '− R$ 180,00'],
    ]);
    expect(all[3]!.struck).toBeTrue();
    expect(statementLines(v, 'payouts', NOW).map((l) => l.kind)).toEqual(['payout']);
    expect(statementLines(v, 'commissions', NOW).some((l) => l.kind === 'payout')).toBeFalse();
  });

  it('dias de repasse', () => {
    expect(payoutDaysLabel([20, 6])).toBe('dias 06 e 20');
    expect(payoutDaysLabel([15])).toBe('dia 15');
  });

  it('resposta torta do servidor vira null', () => {
    expect(parseSquadView(ambassadorView())?.kind).toBe('ambassador');
    expect(parseSquadView({ kind: 'ambassador', cycle: {} })).toBeNull();
    expect(parseSquadView(null)).toBeNull();
    expect(parseSquadView({ kind: 'candidate', cycle: {}, seatsLeft: 3, nextCycleStart: '2026-12-07' })?.kind).toBe('candidate');
  });
});
