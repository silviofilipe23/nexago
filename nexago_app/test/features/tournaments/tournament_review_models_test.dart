import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';

void main() {
  group('TournamentReviewAspect', () {
    test('mesma lista e ordem do backend (functions/src/tournament-review-constants.ts)', () {
      final source =
          File('../functions/src/tournament-review-constants.ts').readAsStringSync();
      final block = RegExp(r'TOURNAMENT_REVIEW_ASPECTS = \[([^\]]*)\]')
          .firstMatch(source)!
          .group(1)!;
      final keys =
          RegExp(r'"([a-z]+)"').allMatches(block).map((m) => m.group(1)).toList();
      expect(TournamentReviewAspect.values.map((a) => a.key).toList(), keys);
    });

    test('fromKey devolve null para chave desconhecida', () {
      expect(TournamentReviewAspect.fromKey('venue'), TournamentReviewAspect.venue);
      expect(TournamentReviewAspect.fromKey('food'), isNull);
    });
  });

  group('TournamentReviewInvite.fromMap', () {
    final closes = DateTime(2026, 10, 15, 10);

    test('lê o convite gravado pelo job', () {
      final invite = TournamentReviewInvite.fromMap('t1', {
        'tournamentId': 't1',
        'tournamentName': ' Copa Areia ',
        'coverUrl': 'https://img/capa.jpg',
        'closesAt': Timestamp.fromDate(closes),
        'status': 'pending',
      })!;
      expect(invite.tournamentId, 't1');
      expect(invite.tournamentName, 'Copa Areia');
      expect(invite.coverUrl, 'https://img/capa.jpg');
      expect(invite.closesAt, closes);
      expect(invite.status, TournamentReviewInviteStatus.pending);
    });

    test('lê submitted e expired; status desconhecido conta como pendente', () {
      Map<String, dynamic> data(Object? status) =>
          {'closesAt': Timestamp.fromDate(closes), 'status': status};
      expect(TournamentReviewInvite.fromMap('t1', data('submitted'))!.status,
          TournamentReviewInviteStatus.submitted);
      expect(TournamentReviewInvite.fromMap('t1', data('expired'))!.status,
          TournamentReviewInviteStatus.expired);
      expect(TournamentReviewInvite.fromMap('t1', data('???'))!.status,
          TournamentReviewInviteStatus.pending);
    });

    test('sem closesAt não há convite; sem tournamentId usa o id do doc', () {
      expect(TournamentReviewInvite.fromMap('t1', {'status': 'pending'}), isNull);
      expect(TournamentReviewInvite.fromMap('t1', null), isNull);
      expect(
        TournamentReviewInvite.fromMap('t9', {'closesAt': Timestamp.fromDate(closes)})!
            .tournamentId,
        't9',
      );
    });
  });

  group('MyTournamentReview.fromMap', () {
    test('lê nota, aspectos válidos e comentário', () {
      final review = MyTournamentReview.fromMap({
        'overall': 4,
        'aspects': {'schedule': 2, 'venue': 5},
        'comment': 'Atrasou',
      })!;
      expect(review.overall, 4);
      expect(review.aspects, {
        TournamentReviewAspect.schedule: 2,
        TournamentReviewAspect.venue: 5,
      });
      expect(review.comment, 'Atrasou');
    });

    test('ignora aspecto desconhecido ou fora de 1..5 e trata comentário vazio como null', () {
      final review = MyTournamentReview.fromMap({
        'overall': 3,
        'aspects': {'food': 5, 'schedule': 9, 'venue': 1},
        'comment': '   ',
      })!;
      expect(review.aspects, {TournamentReviewAspect.venue: 1});
      expect(review.comment, isNull);
    });

    test('sem nota geral válida não há avaliação', () {
      expect(MyTournamentReview.fromMap({'overall': 0}), isNull);
      expect(MyTournamentReview.fromMap({'overall': '5'}), isNull);
      expect(MyTournamentReview.fromMap(null), isNull);
    });
  });
}
