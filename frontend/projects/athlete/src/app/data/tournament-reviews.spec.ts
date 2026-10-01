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
