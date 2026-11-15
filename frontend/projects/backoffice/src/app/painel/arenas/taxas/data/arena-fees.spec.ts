import {
  DEFAULT_ARENA_FEE_DEFAULTS,
  arenaFeeDefaultsFromRaw,
  arenaFeeOverrideFromRaw,
  draftIssues,
  draftOf,
  draftProducts,
  feeTierOf,
  resolveArenaFee,
  sameDraft,
} from './arena-fees';

const TODAY = '2026-11-15';

describe('arena-fees (espelho de functions/src/arena-fees.ts)', () => {
  it('doc ausente = a tabela de antes', () => {
    expect(arenaFeeDefaultsFromRaw(undefined)).toEqual({
      tierPercent: { starter: 8, pro: 6, elite: 5, none: 8 },
      clubPercent: 5,
    });
  });

  it('plano só conta com assinatura que dá titularidade', () => {
    expect(feeTierOf('pro', 'active')).toBe('pro');
    expect(feeTierOf('elite', 'canceling')).toBe('elite');
    expect(feeTierOf('pro', 'canceled')).toBe('none');
    expect(feeTierOf(null, 'active')).toBe('none');
  });

  it('exceção vale só nos produtos dela e até o último dia', () => {
    const override = arenaFeeOverrideFromRaw({ mode: 'custom', products: { booking: 3 }, until: TODAY });
    const d = DEFAULT_ARENA_FEE_DEFAULTS;
    expect(resolveArenaFee(d, 'pro', override, 'booking', TODAY)).toEqual({ percent: 3, fromArena: true });
    expect(resolveArenaFee(d, 'pro', override, 'class', TODAY)).toEqual({ percent: 6, fromArena: false });
    expect(resolveArenaFee(d, 'pro', override, 'club', TODAY)).toEqual({ percent: 5, fromArena: false });
    expect(resolveArenaFee(d, 'pro', override, 'booking', '2026-11-16')).toEqual({ percent: 6, fromArena: false });
  });

  it('rascunho personalizado exige produto, motivo e data válida', () => {
    const draft = { ...draftOf(null), mode: 'custom' as const };
    expect(Object.keys(draftIssues(draft, TODAY)).sort()).toEqual(['products', 'reason']);
    const ok = { ...draft, products: { ...draft.products, club: 0 }, reason: 'Arena piloto', until: '' };
    expect(draftIssues(ok, TODAY)).toEqual({});
    expect(draftIssues({ ...ok, until: '2026-11-14' }, TODAY)['until']).toBeTruthy();
    expect(draftIssues({ ...ok, products: { ...ok.products, booking: 25 } }, TODAY)['booking']).toBeTruthy();
    expect(draftProducts(ok)).toEqual({ club: 0 });
  });

  it('voltar ao padrão a partir do padrão não é mudança', () => {
    expect(sameDraft(draftOf(null), { ...draftOf(null), reason: 'x' })).toBeTrue();
  });
});
