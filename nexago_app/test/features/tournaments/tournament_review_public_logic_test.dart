import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_public_logic.dart';

void main() {
  TournamentReviewSummary summary({
    int count = 23,
    double? average = 4.62,
    Map<TournamentReviewAspect, TournamentReviewAspectStat>? aspects,
  }) =>
      TournamentReviewSummary(
        tournamentId: 't1',
        tournamentName: 'Copa Aurora',
        isOpen: false,
        eligibleCount: 42,
        count: count,
        average: average,
        aspects: aspects,
      );

  group('tournamentReviewBadgeLabel', () {
    test('com 3+ avaliações: estrela, uma casa com vírgula e a contagem', () {
      expect(tournamentReviewBadgeLabel(summary()), '★ 4,6 · 23 avaliações');
      expect(tournamentReviewBadgeLabel(summary(count: 3, average: 4)), '★ 4,0 · 3 avaliações');
    });

    test('abaixo de 3, sem média ou sem resumo: nada', () {
      expect(tournamentReviewBadgeLabel(summary(count: 2, average: null)), isNull);
      expect(tournamentReviewBadgeLabel(summary(average: null)), isNull);
      expect(tournamentReviewBadgeLabel(null), isNull);
    });
  });

  group('organizerReputationLabel', () {
    test('média, total e torneios', () {
      expect(
        organizerReputationLabel(
            const OrganizerReputation(reviewsCount: 86, tournamentsRated: 5, average: 4.71)),
        '★ 4,7 (86 avaliações em 5 torneios)',
      );
    });

    test('um torneio só fica no singular', () {
      expect(
        organizerReputationLabel(
            const OrganizerReputation(reviewsCount: 3, tournamentsRated: 1, average: 5)),
        '★ 5,0 (3 avaliações em 1 torneio)',
      );
    });

    test('abaixo de 3, sem média ou sem doc: nada', () {
      expect(
        organizerReputationLabel(
            const OrganizerReputation(reviewsCount: 2, tournamentsRated: 1, average: null)),
        isNull,
      );
      expect(
        organizerReputationLabel(
            const OrganizerReputation(reviewsCount: 9, tournamentsRated: 2, average: null)),
        isNull,
      );
      expect(organizerReputationLabel(null), isNull);
    });
  });

  group('tournamentPublicAspectRows', () {
    test('só aspectos com nota, na ordem da lista', () {
      final rows = tournamentPublicAspectRows(summary(aspects: const {
        TournamentReviewAspect.prizes: TournamentReviewAspectStat(count: 5, average: 3.4),
        TournamentReviewAspect.organization: TournamentReviewAspectStat(count: 20, average: 4.8),
      }));
      expect(rows.map((r) => r.aspect),
          [TournamentReviewAspect.organization, TournamentReviewAspect.prizes]);
      expect(rows.first.label, 'Organização geral');
      expect(rows.first.valueText, '4,8');
      expect(rows.first.fraction, closeTo(0.96, 1e-9));
    });

    test('sem números públicos ou sem aspecto avaliado: lista vazia', () {
      expect(
        tournamentPublicAspectRows(summary(count: 2, average: null, aspects: const {
          TournamentReviewAspect.venue: TournamentReviewAspectStat(count: 2, average: 4),
        })),
        isEmpty,
      );
      expect(tournamentPublicAspectRows(summary(aspects: const {})), isEmpty);
      expect(tournamentPublicAspectRows(summary()), isEmpty);
      expect(tournamentPublicAspectRows(null), isEmpty);
    });
  });
}
