import {
  REVIEWS_EMPTY_TEXT,
  TOURNAMENT_REVIEW_ASPECTS,
  anonymousReviewFromData,
  aspectRows,
  collectingText,
  commentCards,
  distributionRows,
  formatRating,
  hasPublicNumbers,
  isReviewWindowOpen,
  reputationFromData,
  responseRateLabel,
  reviewAspectChips,
  reviewKpiLabel,
  reviewWindowLabel,
  reviewsCountLabel,
  reviewsEmptyState,
  starsText,
  summaryFromData,
  weakestAspectLabel,
  type AnonymousReview,
  type TournamentReviewSummary,
} from './tournament-reviews';

/** Timestamp do SDK de mentira: o parse só usa `toDate()`. */
const ts = (d: Date) => ({ toDate: () => d });
const NOW = new Date('2026-10-06T15:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function summary(over: Partial<TournamentReviewSummary> = {}): TournamentReviewSummary {
  return {
    tournamentId: 't1',
    tournamentName: 'Copa Aurora',
    tournamentStartAt: null,
    status: 'open',
    eligibleCount: 42,
    count: 23,
    average: 4.62,
    distribution: { 1: 1, 2: 1, 3: 2, 4: 7, 5: 12 },
    aspects: { organization: { count: 20, average: 4.8 }, schedule: { count: 18, average: 3.4 } },
    opensAt: null,
    closesAt: new Date(NOW.getTime() + 5 * DAY),
    ...over,
  };
}

function review(id: string, overall: 1 | 2 | 3 | 4 | 5, comment: string | null, shuffleKey: number): AnonymousReview {
  return { id, overall, aspects: {}, comment, shuffleKey };
}

describe('tournament-reviews (organizador)', () => {
  it('aspectos na mesma ordem de functions/src/tournament-review-constants.ts', () => {
    expect(TOURNAMENT_REVIEW_ASPECTS.map((a) => a.key)).toEqual(['organization', 'schedule', 'refereeing', 'venue', 'prizes']);
    expect(TOURNAMENT_REVIEW_ASPECTS.map((a) => a.label)).toEqual([
      'Organização geral',
      'Cumprimento dos horários',
      'Arbitragem / mesa',
      'Estrutura do local',
      'Premiação e kit',
    ]);
  });

  describe('summaryFromData', () => {
    it('lê o resumo gravado pelo servidor', () => {
      const closesAt = new Date('2026-10-15T13:00:00Z');
      const s = summaryFromData('t1', {
        tournamentId: 't1',
        organizerId: 'o1',
        tournamentName: ' Copa Aurora ',
        tournamentStartAt: ts(new Date('2026-10-04T12:00:00Z')),
        status: 'open',
        eligibleCount: 42,
        count: 23,
        average: 4.62,
        distribution: { '1': 1, '2': 1, '3': 2, '4': 7, '5': 12 },
        aspects: { schedule: { count: 18, average: 3.4 }, bogus: { count: 1, average: 1 } },
        closesAt: ts(closesAt),
      })!;
      expect(s.tournamentName).toBe('Copa Aurora');
      expect(s.status).toBe('open');
      expect(s.distribution).toEqual({ 1: 1, 2: 1, 3: 2, 4: 7, 5: 12 });
      expect(s.aspects).toEqual({ schedule: { count: 18, average: 3.4 } });
      expect(s.closesAt).toEqual(closesAt);
      expect(s.tournamentStartAt).toEqual(new Date('2026-10-04T12:00:00Z'));
    });

    it('com menos de 3 avaliações só a contagem vem preenchida', () => {
      const s = summaryFromData('t9', { status: 'open', eligibleCount: 42, count: 2, average: null, distribution: null, aspects: null })!;
      expect(s.tournamentId).toBe('t9');
      expect(s.count).toBe(2);
      expect(s.average).toBeNull();
      expect(s.distribution).toBeNull();
      expect(s.aspects).toBeNull();
      expect(hasPublicNumbers(s)).toBeFalse();
    });

    it('doc ausente vira null; status diferente de open é closed', () => {
      expect(summaryFromData('t1', undefined)).toBeNull();
      expect(summaryFromData('t1', { status: 'closed' })!.status).toBe('closed');
    });
  });

  describe('anonymousReviewFromData', () => {
    it('comentário só com espaços vira null; aspecto desconhecido e nota fora de 1–5 somem', () => {
      const r = anonymousReviewFromData('a1', {
        overall: 4,
        aspects: { schedule: 2, venue: 7, bogus: 3 },
        comment: '   ',
        shuffleKey: 0.42,
      })!;
      expect(r.overall).toBe(4);
      expect(r.aspects).toEqual({ schedule: 2 });
      expect(r.comment).toBeNull();
      expect(r.shuffleKey).toBe(0.42);
    });

    it('sem nota geral válida não vira avaliação', () => {
      expect(anonymousReviewFromData('a1', { overall: 0 })).toBeNull();
      expect(anonymousReviewFromData('a1', undefined)).toBeNull();
    });
  });

  it('reputationFromData', () => {
    expect(
      reputationFromData({ organizerId: 'o1', reviewsCount: 86, tournamentsRated: 5, average: 4.71, aspects: { venue: { count: 40, average: 3.9 } } }),
    ).toEqual({ reviewsCount: 86, tournamentsRated: 5, average: 4.71, aspects: { venue: { count: 40, average: 3.9 } } });
    expect(reputationFromData(undefined)).toBeNull();
  });

  it('formatação: uma casa com vírgula, contagem e taxa de resposta', () => {
    expect(formatRating(4.62)).toBe('4,6');
    expect(formatRating(4)).toBe('4,0');
    expect(reviewsCountLabel(1)).toBe('1 avaliação');
    expect(reviewsCountLabel(23)).toBe('23 avaliações');
    expect(responseRateLabel(summary())).toBe('23 de 42 atletas');
  });

  describe('janela', () => {
    it('aberta até dd/MM (São Paulo) enquanto closesAt está no futuro', () => {
      const s = summary({ closesAt: new Date('2026-10-15T13:00:00Z') });
      expect(isReviewWindowOpen(s, NOW)).toBeTrue();
      expect(reviewWindowLabel(s, NOW)).toBe('Aberta até 15/10');
    });

    it('status open com closesAt vencido (job atrasado) já é Encerrada', () => {
      const s = summary({ closesAt: new Date(NOW.getTime() - 60_000) });
      expect(isReviewWindowOpen(s, NOW)).toBeFalse();
      expect(reviewWindowLabel(s, NOW)).toBe('Encerrada');
    });

    it('closed é Encerrada', () => {
      expect(reviewWindowLabel(summary({ status: 'closed' }), NOW)).toBe('Encerrada');
    });
  });

  it('texto de quem ainda não tem 3 avaliações, inclusive sem elegíveis', () => {
    expect(collectingText(summary({ count: 2, average: null }))).toBe(
      '2 de 42 atletas avaliaram. As notas aparecem a partir de 3 avaliações.',
    );
    expect(collectingText(summary({ count: 0, eligibleCount: 0, average: null }))).toBe(
      'Nenhum atleta ficou apto a avaliar este torneio.',
    );
  });

  describe('reviewsEmptyState', () => {
    const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

    it('torneio por vir ou rolando', () => {
      expect(reviewsEmptyState({ status: 'inscricoes', endAt: at(2 * DAY) }, NOW)).toBe('notEnded');
      expect(reviewsEmptyState({ status: 'andamento', endAt: null }, NOW)).toBe('notEnded');
    });

    it('terminou há até 3 dias: o job das 10h ainda abre', () => {
      expect(reviewsEmptyState({ status: 'andamento', endAt: at(-20 * 60 * 60 * 1000) }, NOW)).toBe('opening');
      expect(reviewsEmptyState({ status: 'concluido', endAt: null }, NOW)).toBe('opening');
      expect(reviewsEmptyState({ status: 'concluido', endAt: at(2 * DAY) }, NOW)).toBe('opening');
    });

    it('terminou há mais de 3 dias sem resumo', () => {
      expect(reviewsEmptyState({ status: 'concluido', endAt: at(-30 * DAY) }, NOW)).toBe('endedBefore');
      expect(reviewsEmptyState({ status: 'encerradas', endAt: at(-4 * DAY) }, NOW)).toBe('endedBefore');
    });

    it('cancelado nunca recebe avaliação', () => {
      expect(reviewsEmptyState({ status: 'cancelado', endAt: at(-DAY) }, NOW)).toBe('cancelled');
    });

    it('textos', () => {
      expect(REVIEWS_EMPTY_TEXT).toEqual({
        notEnded: 'A avaliação abre quando o torneio terminar.',
        opening: 'O torneio terminou. O pedido de avaliação sai para os atletas às 10h.',
        endedBefore: 'Este torneio terminou antes de as avaliações existirem.',
        cancelled: 'Torneio cancelado não recebe avaliações.',
      });
    });
  });

  it('aspectRows: do mais fraco ao mais forte, empate na ordem da lista', () => {
    const rows = aspectRows({
      prizes: { count: 5, average: 3.4 },
      organization: { count: 20, average: 4.8 },
      schedule: { count: 18, average: 3.4 },
      venue: { count: 1, average: 4 },
    });
    expect(rows.map((r) => r.key)).toEqual(['schedule', 'prizes', 'venue', 'organization']);
    expect(rows[0].label).toBe('Cumprimento dos horários');
    expect(rows[0].text).toBe('3,4 · 18 notas');
    expect(rows[2].text).toBe('4,0 · 1 nota');
    expect(rows[3].pct).toBe(96);
    expect(aspectRows(null)).toEqual([]);
    expect(weakestAspectLabel({ venue: { count: 2, average: 3 }, organization: { count: 9, average: 4 } })).toBe('Estrutura do local');
    expect(weakestAspectLabel(null)).toBeNull();
  });

  it('distributionRows: de 5★ a 1★ com porcentagem inteira', () => {
    expect(distributionRows({ 1: 1, 2: 1, 3: 2, 4: 7, 5: 12 }).map((r) => [r.label, r.count, r.pct])).toEqual([
      ['5★', 12, 52],
      ['4★', 7, 30],
      ['3★', 2, 9],
      ['2★', 1, 4],
      ['1★', 1, 4],
    ]);
    expect(distributionRows(null)).toEqual([]);
  });

  it('commentCards: só com texto, por shuffleKey; filtro low = 1–2★', () => {
    const reviews = [
      review('a', 5, 'Tudo pontual', 0.9),
      review('b', 1, 'Atrasou duas horas', 0.1),
      review('c', 4, null, 0.5),
      review('d', 2, 'Quadra ruim', 0.3),
    ];
    expect(commentCards(reviews, 'all').map((r) => r.id)).toEqual(['b', 'd', 'a']);
    expect(commentCards(reviews, 'low').map((r) => r.id)).toEqual(['b', 'd']);
  });

  it('estrelas e aspectos marcados no card, na ordem da lista', () => {
    expect(starsText(4)).toBe('★★★★☆');
    const r: AnonymousReview = { id: 'a', overall: 4, aspects: { schedule: 2, organization: 5 }, comment: 'x', shuffleKey: 0 };
    expect(reviewAspectChips(r)).toEqual(['Organização geral 5★', 'Cumprimento dos horários 2★']);
  });

  it('KPI: média com estrela ou —', () => {
    expect(reviewKpiLabel(summary())).toBe('4,6 ★');
    expect(reviewKpiLabel(summary({ count: 2, average: null }))).toBe('—');
    expect(reviewKpiLabel(null)).toBe('—');
  });
});
