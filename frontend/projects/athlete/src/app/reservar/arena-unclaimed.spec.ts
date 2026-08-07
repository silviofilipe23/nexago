import {
  ARENA_AMENITIES_EMPTY,
  NEXAGO_SALES_EMAIL,
  NEXAGO_SALES_WHATSAPP,
  arenaContactWhatsAppUrl,
  buildArenaContactWhatsAppMessage,
  nexagoArenaSignupContactUrl,
  defaultArenaSearchQueryFilters,
  filterAndSortArenaResults,
  type ArenaListItem,
  type ArenaSearchQueryFilters,
  type ArenaSearchResult,
} from '@nexago/arena-discovery';

function arena(overrides: Partial<ArenaListItem> = {}): ArenaListItem {
  return {
    id: 'a1',
    name: 'Arena',
    locationLabel: 'Goiânia, GO',
    coverUrl: null,
    logoUrl: null,
    pricePerHourReais: 80,
    description: null,
    city: 'Goiânia',
    state: 'GO',
    galleryImageUrls: [],
    ratingAverage: 4.5,
    reviewsCount: 10,
    lat: -16.68,
    lng: -49.26,
    courtTypes: ['Vôlei de praia'],
    surfaces: ['Areia'],
    reputationScore: 90,
    onlinePaymentEnabled: true,
    onsitePaymentEnabled: true,
    amenities: ARENA_AMENITIES_EMPTY,
    phone: null,
    whatsapp: null,
    isUnclaimed: false,
    ...overrides,
  };
}

function result(item: ArenaListItem, displayPrice = 80): ArenaSearchResult {
  return {
    arena: item,
    selectedSlot: null,
    courtName: null,
    isExactMatch: false,
    minutesDistance: null,
    displayPricePerHourReais: displayPrice,
    showStartingFrom: false,
    hasAvailability: false,
    courtCount: 0,
  };
}

function idsAfterFilter(
  results: ArenaSearchResult[],
  filters: ArenaSearchQueryFilters,
): string[] {
  return filterAndSortArenaResults({
    results,
    filters,
    userCoords: { latitude: -16.68, longitude: -49.26 },
    favoriteIds: new Set<string>(),
  }).map((e) => e.result.arena.id);
}

describe('contato com arena pré-cadastrada', () => {
  it('a mensagem diz de onde o atleta veio', () => {
    const msg = buildArenaContactWhatsAppMessage('Arena Beach T3');
    expect(msg).toContain('nexaGO');
    expect(msg).toContain('Arena Beach T3');
  });

  it('mantém a mesma frase do app Flutter', () => {
    expect(buildArenaContactWhatsAppMessage('Arena X')).toBe(
      'Olá! Cheguei até vocês pela nexaGO. Vi Arena X no app e queria saber sobre horários e valores para jogar.',
    );
  });

  it('monta o wa.me com o número em E.164', () => {
    const url = arenaContactWhatsAppUrl(
      arena({ isUnclaimed: true, whatsapp: '5562982406456' }),
    );
    expect(url).toContain('https://wa.me/5562982406456');
    expect(url).toContain('text=');
  });

  it('completa o DDI quando o número vem só com DDD', () => {
    const url = arenaContactWhatsAppUrl(arena({ whatsapp: '(62) 98240-6456' }));
    expect(url).toContain('https://wa.me/5562982406456');
  });

  it('sem número não gera link — o botão não deve aparecer', () => {
    expect(arenaContactWhatsAppUrl(arena({ whatsapp: null, phone: null }))).toBeNull();
  });
});

describe('convite "Gostaria de ver sua arena aqui?"', () => {
  it('sem WhatsApp comercial configurado, cai no e-mail de vendas', () => {
    // Enquanto NEXAGO_SALES_WHATSAPP estiver vazio o botão tem de continuar
    // funcionando — link wa.me quebrado seria pior que não ter botão.
    const url = nexagoArenaSignupContactUrl();
    if (NEXAGO_SALES_WHATSAPP.length === 0) {
      expect(url.startsWith(`mailto:${NEXAGO_SALES_EMAIL}`)).toBe(true);
      expect(url).toContain('subject=');
    } else {
      expect(url.startsWith('https://wa.me/')).toBe(true);
    }
  });

  it('a mensagem diz que é dono de arena querendo cadastrar', () => {
    const url = decodeURIComponent(nexagoArenaSignupContactUrl());
    expect(url).toContain('arena');
    expect(url).toContain('nexaGO');
  });
});

describe('arena pré-cadastrada na busca', () => {
  it('aparece quando não há filtro de promessa', () => {
    const ids = idsAfterFilter(
      [
        result(arena({ id: 'partner' })),
        result(arena({ id: 'pre', isUnclaimed: true }), 0),
      ],
      defaultArenaSearchQueryFilters(),
    );
    expect(ids).toContain('partner');
    expect(ids).toContain('pre');
  });

  it('some quando o atleta filtra por faixa de preço', () => {
    const filters: ArenaSearchQueryFilters = {
      ...defaultArenaSearchQueryFilters(),
      priceBand: 'upTo60',
    };
    const ids = idsAfterFilter(
      [result(arena({ id: 'pre', isUnclaimed: true }), 0)],
      filters,
    );
    expect(ids).toEqual([]);
  });

  it('some quando o atleta exige reputação mínima', () => {
    const filters: ArenaSearchQueryFilters = {
      ...defaultArenaSearchQueryFilters(),
      minReputationScore: 50,
    };
    const ids = idsAfterFilter(
      [result(arena({ id: 'pre', isUnclaimed: true, reputationScore: 0 }), 0)],
      filters,
    );
    expect(ids).toEqual([]);
  });
});
