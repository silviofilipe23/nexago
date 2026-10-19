import { SQUAD_TEST_NOW, ambassadorView, callableResponses, candidateView, commission, daysAgoIso, member, ranking } from '../../../testing/squad-fixtures';
import {
  availableHint,
  benefitsOf,
  brl,
  commissionStatusMeta,
  contractNotice,
  cyclePill,
  earnedCents,
  followerOffer,
  funnelSteps,
  levelProgress,
  monthConversions,
  packageChips,
  promotionCopy,
  rankingRows,
  shareLinks,
  statementLines,
  totalHint,
  weekBars,
  whenLabel,
} from './squad-model';
import { composeSquadView } from './squad-view';

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

  it('ciclo: dia do contrato pela data civil de São Paulo', () => {
    expect(cyclePill(member(), NOW)).toBe('Piloto · dia 40 de 90');
    expect(cyclePill(member(), new Date('2026-09-01T12:00:00Z'))).toBe('Piloto · começa em 08 set');
    expect(cyclePill(member({ cycleId: 'c2' }), new Date('2026-12-10T12:00:00Z'))).toBe('Ciclo · encerrado em 06 dez');
  });

  it('quando: hoje com hora, ontem, data curta', () => {
    expect(whenLabel('2026-10-17T17:12:00Z', NOW)).toBe('Hoje 14:12');
    expect(whenLabel(daysAgoIso(1), NOW)).toBe('Ontem');
    expect(whenLabel('2026-10-14T15:00:00Z', NOW)).toBe('14 out');
  });

  it('o desconto do seguidor sai como "até X%" (o teto na taxa corta); 0% não promete nada', () => {
    const offer = followerOffer(member());
    expect(offer.discount).toBe('até 10% OFF na primeira inscrição, reserva e clubinho');
    expect(offer.rest).toBe('Você recebe 10% depois que o pagamento é confirmado.');
    expect(followerOffer(member({ followerDiscountPct: 0 })).discount).toBeNull();
    expect(benefitsOf(member({ followerDiscountPct: 0 })).some((b) => b.label.includes('OFF'))).toBeFalse();
  });

  it('disponível: data do repasse, o que fica para depois e o mínimo', () => {
    const m = member();
    const withEarnings = (e: Partial<typeof m.earnings>) => member({ earnings: { ...m.earnings, ...e } });
    expect(availableHint(m)).toBe('vai pra carteira em 20 out');
    expect(availableHint(withEarnings({ nextPayoutCents: 100_00 }))).toBe('R$ 100,00 vão pra carteira em 20 out');
    expect(availableHint(withEarnings({ nextPayoutCents: 0 }))).toBe('entra num próximo repasse');
    expect(availableHint(withEarnings({ availableCents: 12_00, nextPayoutCents: 12_00 }))).toBe('acumulando · repasse a partir de R$ 20');
    expect(availableHint(withEarnings({ availableCents: 0, nextPayoutCents: 0 }))).toBe('próximo repasse em 20 out');
  });

  it('ganho = confirmado (sem o pendente); este mês pela data da inscrição', () => {
    expect(earnedCents(member())).toBe(324_00);
    expect(totalHint(member())).toBe('10% de R$ 3.240');
    // c1 está pendente; c2 (ontem) liberada; c3 cancelada.
    expect(monthConversions(member(), NOW)).toBe(1);
  });

  it('funil: cliques sem medição ficam "—"; zero não ganha largura mínima', () => {
    const v = ambassadorView();
    const steps = funnelSteps(v.member, v.extras);
    expect(steps.map((s) => s.value)).toEqual([null, 74, 31, 27]);
    expect(steps[0]!.pct).toBe(0);
    expect(steps[1]!.pct).toBe(100);
    const empty = funnelSteps(member({ conversions: 0 }), { signups: 0, registrations: 0, pending: 0, promotionChecklist: [] });
    expect(empty.map((s) => s.pct)).toEqual([0, 0, 0, 0]);
  });

  it('ranking: top 5 + o atleta no fim, seta da semana e "novo"', () => {
    const r = ranking();
    expect(rankingRows(r.entries, r.me).map((x) => [x.name, x.deltaLabel, x.deltaTone])).toEqual([
      ['João Victor', '▲2', 'up'],
      ['Marcos Reis', '▼1', 'down'],
      ['Rayssa Brito', '—', 'flat'],
    ]);
    const others = Array.from({ length: 6 }, (_, i) => ({ position: i + 1, name: `A${i}`, photoUrl: null, points: 100 - i, delta: 0, me: false }));
    const me = { position: 9, name: 'João Victor', photoUrl: null, points: 10, delta: null, me: true };
    const rows = rankingRows(others, me);
    expect(rows.length).toBe(6);
    expect(rows[5]!.position).toBe(9);
    expect(rows[5]!.deltaLabel).toBe('novo');
  });

  it('nível: Gold com 28% da faixa e 720 pts para Elite', () => {
    const l = levelProgress(member().points);
    expect(l.current).toBe('Gold');
    expect(l.next).toEqual({ name: 'Elite', missing: 720 });
    expect(l.bars.map((b) => b.pct)).toEqual([100, 100, 28, 0]);
    expect(l.bars.map((b) => b.done)).toEqual([true, true, false, false]);
    expect(levelProgress({ total: 2400, levels: member().points.levels }).next).toBeNull();
  });

  it('promoção: faltam 3, sem ROI; Pro no topo e Captain paralelo', () => {
    const p = promotionCopy(member());
    expect(p.title).toBe('Faltam 3 conversões pra concorrer');
    expect(p.summary).toBe('Mais 3 até a avaliação de 06 dez para concorrer a Pro Ambassador.');
    expect(p.pct).toBe(90);
    expect(JSON.stringify(p).toLowerCase()).not.toContain('roi');
    expect(promotionCopy(member({ tier: 'pro', progress: null })).title).toBe('Você está no topo do Squad');
    expect(promotionCopy(member({ tier: 'cap', progress: null })).kind).toBe('captain');
  });

  it('o que muda: chips do pacote do próximo nível', () => {
    expect(packageChips(member().nextPackage!)).toEqual([
      'Comissão de 10 a 15%',
      'Inscrições gratuitas',
      'Kit premium + uniforme',
      'Eventos: Prioridade + exclusivos',
      '50% para sua dupla',
      'Cachê por campanha',
    ]);
  });

  it('benefícios: "Ativo" só no que o NexaGO opera; pausa apaga', () => {
    expect(benefitsOf(member()).map((b) => [b.label, b.status])).toEqual([
      ['10% de comissão', 'active'],
      ['Até 10% OFF pra quem usa seu código', 'active'],
      ['1 inscrição gratuita por mês', 'package'],
      ['Kit completo', 'package'],
      ['Eventos: Prioridade', 'package'],
    ]);
    expect(benefitsOf(member({ status: 'paused' }))[0]!.status).toBe('paused');
  });

  it('aviso de contrato: pausado, encerramento marcado e aditivo pendente', () => {
    expect(contractNotice(member())).toBeNull();
    expect(contractNotice(member({ status: 'paused', pausedUntil: '2026-11-01' }))?.text).toContain('pausado até 01 nov');
    expect(contractNotice(member({ endsAt: '2026-11-10' }))?.text).toContain('termina em 10 nov');
    const amendment = { at: daysAgoIso(1), package: member().nextPackage! };
    expect(contractNotice(member({ pendingAmendment: amendment }))?.text).toContain('Pro Ambassador');
  });

  it('status da comissão com o motivo do cancelamento', () => {
    expect(commissionStatusMeta('canceled', 'refund')).toEqual({ label: 'Cancelada · reembolso', tone: 'live' });
    expect(commissionStatusMeta('canceled', 'chargeback').label).toBe('Cancelada · contestação');
    expect(commissionStatusMeta('pending', null).label).toBe('Aguardando pgto');
  });

  it('semanas do servidor em barras, a melhor destacada', () => {
    const w = weekBars(member().weekly);
    expect(w.bars.map((b) => b.label)).toEqual(['7 set', '14', '21', '28', '5 out', '12']);
    expect(w.bars[4]!.best).toBeTrue();
    expect(w.best).toEqual({ cents: 84_00, weekStart: '2026-10-05' });
    expect(weekBars(member().weekly.map((x) => ({ ...x, cents: 0 }))).best).toBeNull();
  });

  it('extrato: comissões e repasses do mais novo ao mais velho, com filtro', () => {
    const m = member({ commissions: [...member().commissions, commission({ id: 'old', at: '2026-10-01T15:00:00Z', status: 'paid' })] });
    const all = statementLines(m, 'all', NOW);
    expect(all.map((l) => [l.title, l.amount])).toEqual([
      ['Lucas M. · Open Errejota', '+ R$ 12,00'],
      ['Tatiane R. · Liga NexaGO', '+ R$ 14,00'],
      ['Henrique A. · Open Errejota', 'R$ 10,00'],
      ['Repasse para a carteira', '− R$ 180,00'],
      ['Lucas M. · Open Errejota', '+ R$ 12,00'],
    ]);
    expect(all[2]!.struck).toBeTrue();
    expect(statementLines(m, 'payouts', NOW).map((l) => l.kind)).toEqual(['payout']);
    expect(statementLines(m, 'commissions', NOW).some((l) => l.kind === 'payout')).toBeFalse();
  });

  it('junta as três leituras; resposta torta vira null', () => {
    const a = callableResponses(ambassadorView());
    expect(composeSquadView(a.mySquad, a.portal, a.ranking)?.kind).toBe('ambassador');
    // Ranking recusado não derruba a tela.
    const noRank = composeSquadView(a.mySquad, a.portal, null);
    expect(noRank?.kind === 'ambassador' ? noRank.ranking : 'x').toBeNull();
    const c = callableResponses(candidateView());
    expect(composeSquadView(c.mySquad, c.portal, null)?.kind).toBe('candidate');
    expect(composeSquadView({ member: { tier: 'amb' } }, a.portal, null)).toBeNull();
    expect(composeSquadView(null, a.portal, null)).toBeNull();
    expect(composeSquadView({ member: null }, { join: null, member: null }, null)).toBeNull();
  });
});
