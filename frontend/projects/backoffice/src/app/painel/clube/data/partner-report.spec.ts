import type { BenefitEvent, BenefitEventType } from './benefit-metrics';
import { redemptionFromDoc } from './benefit-redemption';
import { partnerReport, reportRange, shortDay, weekStart } from './partner-report';

function ev(type: BenefitEventType, uid: string, at: Date, source = 'hub_card', partnerId: string | null = 'fast'): BenefitEvent {
  return { type, uid, partnerId, source, createdAt: at };
}

function redemption(id: string, status: string, at: Date, discountCents = 500, partnerId = 'fast') {
  return redemptionFromDoc(`${partnerId}_${id}`, { partnerId, externalId: id, code: 'NEXA-AB12', status, discountCents, redeemedAt: at });
}

// Segunda 02/11/2026 a domingo 15/11/2026: duas semanas inteiras.
const FROM = new Date(2026, 10, 2);
const TO = new Date(2026, 10, 15, 23, 59, 59, 999);

describe('clube v2: relatório do patrocinador', () => {
  it('semana começa na segunda-feira local', () => {
    expect(weekStart(new Date(2026, 10, 15, 20))).toEqual(new Date(2026, 10, 9));
    expect(weekStart(new Date(2026, 10, 9))).toEqual(new Date(2026, 10, 9));
    expect(shortDay(new Date(2026, 0, 5))).toBe('05/01');
  });

  it('alcance em atletas únicos; toques, cliques, cupons e leads só deste parceiro e período', () => {
    const events = [
      ev('partner_view', 'ana', new Date(2026, 10, 3)),
      ev('partner_view', 'ana', new Date(2026, 10, 4), 'post_game'),
      ev('partner_view', 'bia', new Date(2026, 10, 10), 'search'),
      ev('cta_click', 'ana', new Date(2026, 10, 3)),
      ev('code_copy', 'ana', new Date(2026, 10, 3)),
      ev('lead_submit', 'bia', new Date(2026, 10, 11)),
      ev('lead_submit', 'bia', new Date(2026, 10, 12)),
      ev('partner_view', 'caio', new Date(2026, 10, 16)), // fora do período
      ev('partner_view', 'caio', new Date(2026, 10, 3), 'hub_card', 'outro'), // outro parceiro
      ev('hub_card_view', 'caio', new Date(2026, 10, 3), 'hub_card', null),
    ];
    const r = partnerReport(events, [], 'fast', FROM, TO);
    expect(r.reach).toBe(2);
    expect(r.views).toBe(3);
    expect(r.clicks).toBe(1);
    expect(r.clickers).toBe(1);
    expect(r.codeCopies).toBe(1);
    expect(r.leads).toBe(1);
    expect(r.weeks.map((w) => [w.start.getDate(), w.views, w.reach, w.clicks, w.leads])).toEqual([
      [2, 2, 1, 1, 0],
      [9, 1, 1, 0, 1],
    ]);
    expect(r.sources).toEqual([
      { source: 'hub_card', views: 1, clicks: 1, athletes: 1 },
      { source: 'post_game', views: 1, clicks: 0, athletes: 1 },
      { source: 'search', views: 1, clicks: 0, athletes: 1 },
    ]);
  });

  it('resgates: só os confirmados (matched) do parceiro no período, com o desconto somado', () => {
    const r = partnerReport(
      [],
      [
        redemption('P-1', 'matched', new Date(2026, 10, 3), 829),
        redemption('P-2', 'matched', new Date(2026, 10, 10), 500),
        redemption('P-3', 'ambiguous', new Date(2026, 10, 10)),
        redemption('P-4', 'unmatched', new Date(2026, 10, 10)),
        redemption('P-5', 'matched', new Date(2026, 9, 30)),
        redemption('P-6', 'matched', new Date(2026, 10, 10), 500, 'outro'),
      ],
      'fast',
      FROM,
      TO,
    );
    expect(r.confirmedRedemptions).toBe(2);
    expect(r.confirmedDiscountCents).toBe(1329);
    expect(r.weeks.map((w) => w.redemptions)).toEqual([1, 1]);
  });

  it('período vazio tem as semanas zeradas (a série não pula)', () => {
    const r = partnerReport([], [], 'fast', FROM, TO);
    expect(r.weeks.length).toBe(2);
    expect(r.reach).toBe(0);
    expect(r.sources).toEqual([]);
  });

  it('período dos inputs: fim ≥ início, até 1 ano', () => {
    expect(reportRange('2026-11-02', '2026-11-15')).toEqual({ from: FROM, to: TO });
    expect(reportRange('2026-11-15', '2026-11-02')).toEqual({ error: 'O fim precisa ser depois do início.' });
    expect('error' in reportRange('', '2026-11-02')).toBeTrue();
    expect('error' in reportRange('2024-01-01', '2026-11-02')).toBeTrue();
  });
});
