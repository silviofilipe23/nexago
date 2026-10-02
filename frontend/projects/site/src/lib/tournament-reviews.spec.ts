import {
  TOURNAMENT_REVIEW_ASPECTS,
  formatRating,
  organizerLine,
  organizerNameFromData,
  organizerReputationFromData,
  organizerReputationLabel,
  publicAspectRows,
  publicSummaryFromData,
  reviewBadgeLabel,
} from './tournament-reviews';

describe('avaliação pública no site', () => {
  it('aspectos na mesma ordem de functions/src/tournament-review-constants.ts', () => {
    expect(TOURNAMENT_REVIEW_ASPECTS.map((a) => a.key)).toEqual(['organization', 'schedule', 'refereeing', 'venue', 'prizes']);
  });

  it('lê o resumo público: média dos aspectos com nota, chave desconhecida fica de fora', () => {
    expect(
      publicSummaryFromData({ count: 23, average: 4.62, aspects: { schedule: { count: 18, average: 3.4 }, bogus: { count: 1, average: 1 } } }),
    ).toEqual({ count: 23, average: 4.62, aspects: { schedule: 3.4 } });
    expect(publicSummaryFromData(undefined)).toBeNull();
  });

  it('lê a reputação e o nome do organizador', () => {
    expect(organizerReputationFromData({ reviewsCount: 86, tournamentsRated: 5, average: 4.71 })).toEqual({
      reviewsCount: 86,
      tournamentsRated: 5,
      average: 4.71,
    });
    expect(organizerNameFromData({ fullName: ' Ana Organiza ', nickname: '@ana' })).toBe('Ana Organiza');
    expect(organizerNameFromData({ nickname: '@ana' })).toBe('ana');
    expect(organizerNameFromData({})).toBeNull();
  });

  it('selo: estrela, uma casa com vírgula e a contagem; nada abaixo de 3', () => {
    expect(reviewBadgeLabel({ count: 23, average: 4.62, aspects: {} })).toBe('★ 4,6 · 23 avaliações');
    expect(reviewBadgeLabel({ count: 2, average: null, aspects: {} })).toBeNull();
    expect(reviewBadgeLabel(null)).toBeNull();
  });

  it('nota do organizador e a linha "Organizado por"', () => {
    const rep = { reviewsCount: 86, tournamentsRated: 5, average: 4.71 };
    expect(organizerReputationLabel(rep)).toBe('★ 4,7 (86 avaliações em 5 torneios)');
    expect(organizerReputationLabel({ reviewsCount: 3, tournamentsRated: 1, average: 5 })).toBe('★ 5,0 (3 avaliações em 1 torneio)');
    expect(organizerReputationLabel({ reviewsCount: 2, tournamentsRated: 1, average: null })).toBeNull();
    expect(organizerLine('Ana Organiza', rep)).toBe('Organizado por Ana Organiza · ★ 4,7 (86 avaliações em 5 torneios)');
    expect(organizerLine('Ana Organiza', null)).toBe('Organizado por Ana Organiza');
    expect(organizerLine(null, rep)).toBeNull();
  });

  it('aspectos: só os com nota, na ordem da lista; nada sem números públicos', () => {
    expect(publicAspectRows({ count: 23, average: 4.62, aspects: { prizes: 3.4, organization: 4.8 } })).toEqual([
      { key: 'organization', label: 'Organização geral', value: '4,8', pct: 96 },
      { key: 'prizes', label: 'Premiação e kit', value: '3,4', pct: 68 },
    ]);
    expect(publicAspectRows({ count: 2, average: null, aspects: { venue: 4 } })).toEqual([]);
    expect(publicAspectRows({ count: 23, average: 4.62, aspects: {} })).toEqual([]);
  });

  it('formatRating usa vírgula', () => {
    expect(formatRating(4.62)).toBe('4,6');
  });
});
