import {
  TOURNAMENT_REVIEW_ASPECTS,
  inviteFromData,
  myReviewFromData,
  openPendingReviews,
  reviewCardItems,
  reviewCtaState,
  reviewDayMonth,
  reviewDialogInviteOf,
  reviewQuestion,
  reviewRatingLabel,
  shouldLoadMyReview,
  type TournamentReviewInvite,
  formatRating,
  organizerReputationFromData,
  organizerReputationLabel,
  publicAspectRows,
  publicSummaryFromData,
  reviewBadgeLabel,
} from './tournament-reviews';

const NOW = new Date('2026-10-06T15:00:00Z');
const FUTURE = new Date('2026-10-11T13:00:00Z');

function invite(overrides: Partial<TournamentReviewInvite> = {}): TournamentReviewInvite {
  return { tournamentId: 't1', tournamentName: 'Copa', coverUrl: null, closesAt: FUTURE, status: 'pending', ...overrides };
}

describe('tournament-reviews (regras puras)', () => {
  it('aspectos: mesma lista e ordem do backend (functions/src/tournament-review-constants.ts)', () => {
    expect(TOURNAMENT_REVIEW_ASPECTS.map((a) => a.key)).toEqual(['organization', 'schedule', 'refereeing', 'venue', 'prizes']);
  });

  it('inviteFromData lê o convite do job; sem closesAt não há convite', () => {
    const parsed = inviteFromData('t1', { tournamentName: ' Copa ', closesAt: { toDate: () => FUTURE }, status: 'submitted' });
    expect(parsed).toEqual({ tournamentId: 't1', tournamentName: 'Copa', coverUrl: null, closesAt: FUTURE, status: 'submitted' });
    expect(inviteFromData('t1', { status: 'pending' })).toBeNull();
    expect(inviteFromData('t1', { closesAt: FUTURE, status: '???' })!.status).toBe('pending');
  });

  it('myReviewFromData ignora aspecto inválido e trata comentário vazio como null', () => {
    expect(myReviewFromData({ overall: 4, aspects: { schedule: 2, food: 5, venue: 9 }, comment: '  ' })).toEqual({ overall: 4, aspects: { schedule: 2 }, comment: null });
    expect(myReviewFromData({ overall: 0 })).toBeNull();
  });

  it('reviewCtaState: closesAt vencido fecha mesmo com convite pending (job atrasado)', () => {
    expect(reviewCtaState(null, NOW)).toBe('none');
    expect(reviewCtaState(invite(), NOW)).toBe('pending');
    expect(reviewCtaState(invite({ status: 'submitted' }), NOW)).toBe('submitted');
    expect(reviewCtaState(invite({ closesAt: NOW }), NOW)).toBe('closed');
    expect(reviewCtaState(invite({ status: 'expired' }), NOW)).toBe('closed');
  });

  it('openPendingReviews: só pendentes abertos, o que fecha antes primeiro', () => {
    const list = openPendingReviews([
      invite({ tournamentId: 'late', closesAt: new Date('2026-10-15T13:00:00Z') }),
      invite({ tournamentId: 'vencido', closesAt: new Date('2026-10-01T13:00:00Z') }),
      invite({ tournamentId: 'feito', status: 'submitted' }),
      invite({ tournamentId: 'soon', closesAt: new Date('2026-10-07T13:00:00Z') }),
    ], NOW);
    expect(list.map((i) => i.tournamentId)).toEqual(['soon', 'late']);
  });

  it('reviewDialogInviteOf: só abre com ?avaliar=1, convite aberto e do torneio da rota', () => {
    expect(reviewDialogInviteOf(false, invite(), NOW, 't1')).toBeNull();
    expect(reviewDialogInviteOf(true, null, NOW, 't1')).toBeNull();
    expect(reviewDialogInviteOf(true, invite({ closesAt: NOW }), NOW, 't1')).toBeNull();
    expect(reviewDialogInviteOf(true, invite(), NOW, 't2')).toBeNull();
    expect(reviewDialogInviteOf(true, invite(), NOW, 't1')?.tournamentId).toBe('t1');
  });

  it('shouldLoadMyReview: só com convite submitted DESTE torneio (a rule nega doc inexistente)', () => {
    expect(shouldLoadMyReview(invite({ status: 'submitted' }), 't1')).toBeTrue();
    expect(shouldLoadMyReview(invite({ status: 'submitted' }), 't2')).toBeFalse();
    expect(shouldLoadMyReview(invite(), 't1')).toBeFalse();
    expect(shouldLoadMyReview(null, 't1')).toBeFalse();
  });

  it('reviewQuestion: o artigo concorda com "torneio"', () => {
    expect(reviewQuestion('Liga nexaGO – 1ª etapa')).toBe('Como foi o torneio Liga nexaGO – 1ª etapa?');
    expect(reviewQuestion('  ')).toBe('Como foi o torneio?');
    expect(reviewQuestion('Torneio de Verão')).toBe('Como foi o Torneio de Verão?');
  });

  it('reviewRatingLabel e reviewDayMonth (fuso de São Paulo)', () => {
    expect([1, 2, 3, 4, 5].map((n) => reviewRatingLabel(n))).toEqual(['Péssimo', 'Ruim', 'Ok', 'Bom', 'Excelente']);
    expect(reviewRatingLabel(null)).toBe('');
    expect(reviewDayMonth(new Date('2026-10-15T13:00:00Z'))).toBe('15/10');
  });

  it('reviewCardItems monta o card do painel', () => {
    expect(reviewCardItems([invite({ tournamentName: 'Copa Areia' })], NOW)).toEqual([
      { tournamentId: 't1', question: 'Como foi o torneio Copa Areia?', closesLabel: '11/10' },
    ]);
  });
});

describe('avaliação pública (resumo, reputação e organizador)', () => {
  it('lê o resumo público: média dos aspectos com nota, chave desconhecida fica de fora', () => {
    const s = publicSummaryFromData({
      count: 23,
      average: 4.62,
      aspects: { schedule: { count: 18, average: 3.4 }, bogus: { count: 1, average: 1 } },
    })!;
    expect(s).toEqual({ count: 23, average: 4.62, aspects: { schedule: 3.4 } });
    expect(publicSummaryFromData(undefined)).toBeNull();
    expect(publicSummaryFromData({ count: 2, average: null, aspects: null })).toEqual({ count: 2, average: null, aspects: {} });
  });

  it('lê a reputação do organizador', () => {
    expect(organizerReputationFromData({ reviewsCount: 86, tournamentsRated: 5, average: 4.71 })).toEqual({
      reviewsCount: 86,
      tournamentsRated: 5,
      average: 4.71,
    });
    expect(organizerReputationFromData(undefined)).toBeNull();
  });

  it('selo: estrela, uma casa com vírgula e a contagem; nada abaixo de 3', () => {
    expect(reviewBadgeLabel({ count: 23, average: 4.62, aspects: {} })).toBe('★ 4,6 · 23 avaliações');
    expect(reviewBadgeLabel({ count: 3, average: 4, aspects: {} })).toBe('★ 4,0 · 3 avaliações');
    expect(reviewBadgeLabel({ count: 2, average: null, aspects: {} })).toBeNull();
    expect(reviewBadgeLabel({ count: 5, average: null, aspects: {} })).toBeNull();
    expect(reviewBadgeLabel(null)).toBeNull();
  });

  it('nota do organizador (a linha "Organizado por" é montada pela casca do torneio)', () => {
    const rep = { reviewsCount: 86, tournamentsRated: 5, average: 4.71 };
    expect(organizerReputationLabel(rep)).toBe('★ 4,7 (86 avaliações em 5 torneios)');
    expect(organizerReputationLabel({ reviewsCount: 3, tournamentsRated: 1, average: 5 })).toBe('★ 5,0 (3 avaliações em 1 torneio)');
    expect(organizerReputationLabel({ reviewsCount: 2, tournamentsRated: 1, average: null })).toBeNull();
  });

  it('aspectos: só os com nota, na ordem da lista; nada sem números públicos', () => {
    const rows = publicAspectRows({ count: 23, average: 4.62, aspects: { prizes: 3.4, organization: 4.8 } });
    expect(rows).toEqual([
      { key: 'organization', label: 'Organização geral', value: '4,8', pct: 96 },
      { key: 'prizes', label: 'Premiação e kit', value: '3,4', pct: 68 },
    ]);
    expect(publicAspectRows({ count: 2, average: null, aspects: { venue: 4 } })).toEqual([]);
    expect(publicAspectRows({ count: 23, average: 4.62, aspects: {} })).toEqual([]);
    expect(publicAspectRows(null)).toEqual([]);
  });

  it('formatRating usa vírgula', () => {
    expect(formatRating(4.62)).toBe('4,6');
  });
});
