import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';

void main() {
  group('TournamentReviewSummary.fromMap', () {
    test('lê o resumo gravado pelo servidor', () {
      final closesAt = DateTime(2026, 10, 15, 10);
      final s = TournamentReviewSummary.fromMap('t1', {
        'tournamentId': 't1',
        'organizerId': 'o1',
        'tournamentName': ' Copa Aurora ',
        'status': 'open',
        'eligibleCount': 42,
        'count': 23,
        'average': 4.62,
        'distribution': {'1': 1, '2': 1, '3': 2, '4': 7, '5': 12},
        'aspects': {
          'schedule': {'count': 18, 'average': 3.4},
          'organization': {'count': 20, 'average': 5},
          'bogus': {'count': 1, 'average': 1},
        },
        'closesAt': Timestamp.fromDate(closesAt),
      })!;
      expect(s.tournamentName, 'Copa Aurora');
      expect(s.isOpen, isTrue);
      expect(s.eligibleCount, 42);
      expect(s.count, 23);
      expect(s.average, 4.62);
      expect(s.distribution, {1: 1, 2: 1, 3: 2, 4: 7, 5: 12});
      expect(
        s.aspects!.keys,
        unorderedEquals([TournamentReviewAspect.schedule, TournamentReviewAspect.organization]),
      );
      // Média inteira chega do Firestore como int.
      expect(s.aspects![TournamentReviewAspect.organization]!.average, 5.0);
      expect(s.closesAt, closesAt);
    });

    test('com menos de 3 avaliações só a contagem vem preenchida', () {
      final s = TournamentReviewSummary.fromMap('t9', {
        'status': 'open',
        'eligibleCount': 42,
        'count': 2,
        'average': null,
        'distribution': null,
        'aspects': null,
      })!;
      expect(s.tournamentId, 't9');
      expect(s.count, 2);
      expect(s.average, isNull);
      expect(s.distribution, isNull);
      expect(s.aspects, isNull);
    });

    test('doc ausente vira null; status diferente de open é fechado', () {
      expect(TournamentReviewSummary.fromMap('t1', null), isNull);
      expect(TournamentReviewSummary.fromMap('t1', {'status': 'closed'})!.isOpen, isFalse);
    });
  });

  group('AnonymousTournamentReview.fromMap', () {
    test('comentário só com espaços vira null; aspecto desconhecido e nota fora de 1–5 somem', () {
      final r = AnonymousTournamentReview.fromMap('a1', {
        'overall': 4,
        'aspects': {'schedule': 2, 'venue': 7, 'bogus': 3},
        'comment': '   ',
        'shuffleKey': 0.42,
      })!;
      expect(r.overall, 4);
      expect(r.aspects, {TournamentReviewAspect.schedule: 2});
      expect(r.comment, isNull);
      expect(r.shuffleKey, 0.42);
    });

    test('sem nota geral válida não vira avaliação', () {
      expect(AnonymousTournamentReview.fromMap('a1', {'overall': 0}), isNull);
      expect(AnonymousTournamentReview.fromMap('a1', null), isNull);
    });
  });
}
