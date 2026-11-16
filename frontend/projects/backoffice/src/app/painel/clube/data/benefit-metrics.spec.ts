import {
  aggregateEvents,
  benefitEventFromDoc,
  formatRate,
  metricsCsv,
  partnerMetricRows,
  periodStart,
  sourceLabel,
  EVENT_LABELS,
  type BenefitEvent,
  type BenefitEventType,
} from './benefit-metrics';
import { partnerFromDoc } from './partner';

function ev(type: BenefitEventType, uid: string, partnerId: string | null = null, source = 'hub_card'): BenefitEvent {
  return { type, uid, partnerId, source, createdAt: null };
}

const FAST = partnerFromDoc('fast-acai', {
  name: 'Fast Açaí',
  ctaType: 'link',
  couponMode: 'fixed',
  couponCode: 'NEXAGO10',
  active: true,
});
const LINQ = partnerFromDoc('linq', { name: 'LinQ Telecom', ctaType: 'lead_form', couponMode: 'none', active: true });
const OFF = partnerFromDoc('off', { name: 'Desligado', active: false });

const EVENTS: BenefitEvent[] = [
  ev('hub_card_view', 'ana'),
  ev('hub_card_view', 'ana'),
  ev('hub_card_view', 'bia'),
  ev('club_view', 'ana'),
  ev('partner_view', 'ana', 'fast-acai'),
  ev('partner_view', 'ana', 'fast-acai'),
  ev('partner_view', 'bia', 'fast-acai'),
  ev('partner_view', 'ana', 'linq'),
  ev('cta_click', 'ana', 'fast-acai', 'hub_card'),
  ev('cta_click', 'ana', 'fast-acai', 'hub_card'),
  ev('cta_click', 'bia', 'linq', 'competir_web'),
  ev('code_copy', 'ana', 'fast-acai'),
  ev('lead_submit', 'ana', 'linq'),
  ev('lead_submit', 'ana', 'linq'),
  ev('lead_submit', 'bia', 'linq'),
];

describe('clube: métricas', () => {
  it('lê evento válido e descarta tipo desconhecido ou sem uid', () => {
    const at = new Date(2026, 10, 16);
    expect(benefitEventFromDoc({ type: 'cta_click', uid: 'u', partnerId: 'p', source: 'push', createdAt: at })).toEqual({
      type: 'cta_click',
      uid: 'u',
      partnerId: 'p',
      source: 'push',
      createdAt: at,
    });
    expect(benefitEventFromDoc({ type: 'club_view', uid: 'u' })).toEqual(
      jasmine.objectContaining({ partnerId: null, source: 'unknown' }),
    );
    expect(benefitEventFromDoc({ type: 'bogus', uid: 'u' })).toBeNull();
    expect(benefitEventFromDoc({ type: 'club_view' })).toBeNull();
  });

  it('período: hoje desde a meia-noite local, 7 e 30 dias para trás, tudo sem filtro', () => {
    const now = new Date(2026, 10, 16, 15, 30);
    expect(periodStart('today', now)).toEqual(new Date(2026, 10, 16));
    expect(periodStart('7d', now)!.getTime()).toBe(now.getTime() - 7 * 86_400_000);
    expect(periodStart('30d', now)!.getTime()).toBe(now.getTime() - 30 * 86_400_000);
    expect(periodStart('all', now)).toBeNull();
  });

  it('agrega por tipo: total de eventos e atletas únicos no clube inteiro', () => {
    const m = aggregateEvents(EVENTS);
    expect(m.eventCount).toBe(15);
    expect(m.overall.hub_card_view).toEqual({ total: 3, athletes: 2 });
    expect(m.overall.club_view).toEqual({ total: 1, athletes: 1 });
    expect(m.overall.partner_view).toEqual({ total: 4, athletes: 2 });
    expect(m.overall.cta_click).toEqual({ total: 3, athletes: 2 });
    expect(m.club.partner_view).toEqual({ total: 0, athletes: 0 });
    expect(m.club.hub_card_view).toEqual({ total: 3, athletes: 2 });
  });

  it('leads contam par parceiro + atleta: reenvio não infla', () => {
    expect(aggregateEvents(EVENTS).leads).toBe(2);
    expect(aggregateEvents([ev('lead_submit', 'ana', 'linq'), ev('lead_submit', 'ana', 'outro')]).leads).toBe(2);
  });

  it('agrega por parceiro com atletas únicos', () => {
    const m = aggregateEvents(EVENTS);
    const fast = m.byPartner.find((p) => p.partnerId === 'fast-acai')!.counts;
    expect(fast.partner_view).toEqual({ total: 3, athletes: 2 });
    expect(fast.cta_click).toEqual({ total: 2, athletes: 1 });
    expect(fast.code_copy).toEqual({ total: 1, athletes: 1 });
    const linq = m.byPartner.find((p) => p.partnerId === 'linq')!.counts;
    expect(linq.lead_submit).toEqual({ total: 3, athletes: 2 });
  });

  it('origem dos cliques, da maior para a menor', () => {
    expect(aggregateEvents(EVENTS).clickSources).toEqual([
      { source: 'hub_card', total: 2, athletes: 1 },
      { source: 'competir_web', total: 1, athletes: 1 },
    ]);
  });

  it('tabela por parceiro: taxa por atleta, "—" onde não se aplica, ativo sem evento entra zerado', () => {
    const rows = partnerMetricRows(aggregateEvents(EVENTS), [FAST, LINQ, OFF]);
    expect(rows.map((r) => r.partnerId)).toEqual(['fast-acai', 'linq']);
    const fast = rows[0]!;
    expect(fast).toEqual(
      jasmine.objectContaining({ name: 'Fast Açaí', views: 3, viewers: 2, clicks: 2, clickers: 1, codeCopies: 1, leads: 0 }),
    );
    expect(fast.clickRate).toBe(0.5);
    expect(fast.couponApplies).toBeTrue();
    expect(fast.leadApplies).toBeFalse();
    const linq = rows[1]!;
    expect(linq.leads).toBe(2);
    expect(linq.clickRate).toBe(1);
    expect(linq.couponApplies).toBeFalse();

    const empty = partnerMetricRows(aggregateEvents([]), [FAST, OFF]);
    expect(empty).toEqual([jasmine.objectContaining({ partnerId: 'fast-acai', views: 0, clickRate: null })]);
    const orphan = partnerMetricRows(aggregateEvents([ev('partner_view', 'u', 'apagado')]), []);
    expect(orphan[0]!.name).toBe('apagado');
  });

  it('formata a taxa em pt-BR', () => {
    expect(formatRate(null)).toBe('—');
    expect(formatRate(0.5)).toBe('50%');
    expect(formatRate(1 / 3)).toBe('33,3%');
  });

  it('CSV no formato do script: clube primeiro, depois cada parceiro e tipo com evento', () => {
    const m = aggregateEvents(EVENTS);
    const csv = metricsCsv(m, partnerMetricRows(m, [FAST, LINQ]));
    expect(csv.split('\n')).toEqual([
      'parceiro;evento;total;atletas_unicos',
      'Clube (todos);Card do Hub visto;3;2',
      'Clube (todos);Clube aberto;1;1',
      'Fast Açaí;Parceiro visto;3;2',
      'Fast Açaí;Clique no botão;2;1',
      'Fast Açaí;Cupom copiado;1;1',
      'LinQ Telecom;Parceiro visto;1;1',
      'LinQ Telecom;Clique no botão;1;1',
      'LinQ Telecom;Lead enviado;3;2',
    ]);
  });

  it('v2: conta "Conseguiu usar?" e reconhece as origens novas', () => {
    const doc = (type: string, source: string) => benefitEventFromDoc({ type, uid: 'u', partnerId: 'fast-acai', source });
    expect(doc('use_confirmed', 'my_benefits')?.type).toBe('use_confirmed');
    expect(doc('use_denied', 'post_game')?.type).toBe('use_denied');
    const m = aggregateEvents([doc('use_confirmed', 'my_benefits')!, doc('use_denied', 'post_game')!]);
    const row = partnerMetricRows(m, [FAST])[0]!;
    expect(row.usedConfirmed).toBe(1);
    for (const source of ['post_game', 'tournament_day', 'featured', 'search', 'map', 'my_benefits']) {
      expect(sourceLabel(source)).not.toBe(source);
    }
    expect(EVENT_LABELS.use_confirmed).toBe('Confirmou que usou');
  });
});
