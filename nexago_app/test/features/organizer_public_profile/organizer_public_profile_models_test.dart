import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_public_profile_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';

void main() {
  group('OrganizerPublicProfile.fromMap', () {
    test('lê o doc completo gravado pelo servidor', () {
      final since = DateTime(2021, 3, 6, 9);
      final profile = OrganizerPublicProfile.fromMap('org1', {
        'uid': 'org1',
        'name': ' Liga Amadora Goiânia ',
        'logoUrl': 'https://x/logo.jpg',
        'coverUrl': 'https://x/cover.jpg',
        'bio': 'Ligas de areia em Goiânia.',
        'city': 'Goiânia',
        'state': 'go',
        'whatsapp': '5562999990000',
        'isOrganizer': true,
        'verified': true,
        'listed': true,
        'followersCount': 2100,
        'stats': {
          'listedEvents': 40,
          'eventsCompleted': 38,
          'openEvents': 3,
          'athletes': 1240,
          'organizerSince': Timestamp.fromDate(since),
          'sports': ['beachVolleyball', 'beachTennis', ''],
          'venues': [
            {
              'name': 'Arena ErreJota',
              'arenaId': 'a1',
              'city': 'Goiânia',
              'count': 12,
            },
            {'name': '', 'count': 3},
            'lixo',
          ],
        },
      })!;

      expect(profile.uid, 'org1');
      expect(profile.name, 'Liga Amadora Goiânia');
      expect(profile.logoUrl, 'https://x/logo.jpg');
      expect(profile.coverUrl, 'https://x/cover.jpg');
      expect(profile.bio, 'Ligas de areia em Goiânia.');
      expect(profile.city, 'Goiânia');
      expect(profile.state, 'GO');
      expect(profile.whatsapp, '5562999990000');
      expect(profile.isOrganizer, isTrue);
      expect(profile.isDisplayable, isTrue);
      expect(profile.verified, isTrue);
      expect(profile.listed, isTrue);
      expect(profile.followersCount, 2100);
      expect(profile.stats.listedEvents, 40);
      expect(profile.stats.eventsCompleted, 38);
      expect(profile.stats.openEvents, 3);
      expect(profile.stats.athletes, 1240);
      expect(profile.stats.organizerSince, since);
      expect(profile.stats.sports, ['beachVolleyball', 'beachTennis']);
      expect(profile.stats.venues, hasLength(1));
      expect(profile.stats.venues.single.name, 'Arena ErreJota');
      expect(profile.stats.venues.single.arenaId, 'a1');
      expect(profile.stats.venues.single.count, 12);
    });

    test('doc ausente vira null', () {
      expect(OrganizerPublicProfile.fromMap('org1', null), isNull);
    });

    test('doc mínimo: nulos e zeros, nunca exceção', () {
      final profile = OrganizerPublicProfile.fromMap('org2', {
        'name': '',
        'bio': '   ',
        'whatsapp': null,
        'followersCount': -4,
        'stats': 'quebrado',
      })!;
      expect(profile.uid, 'org2');
      expect(profile.name, 'Organizador');
      expect(profile.bio, isNull);
      expect(profile.whatsapp, isNull);
      expect(profile.state, isNull);
      expect(profile.verified, isFalse);
      expect(profile.listed, isFalse);
      expect(profile.followersCount, 0);
      expect(profile.stats.eventsCompleted, 0);
      expect(profile.stats.organizerSince, isNull);
      expect(profile.stats.sports, isEmpty);
      expect(profile.stats.venues, isEmpty);
    });

    test('doc só com números (sem identidade) não é exibível', () {
      // O gatilho de números cria `{uid, stats, listed: false}` para qualquer managerId, e o
      // contador de seguidores cria `{followersCount}` por merge — sem `isOrganizer`.
      final statsOnly = OrganizerPublicProfile.fromMap('org3', {
        'uid': 'org3',
        'listed': false,
        'stats': {'listedEvents': 2, 'eventsCompleted': 1},
      })!;
      final followersOnly = OrganizerPublicProfile.fromMap('org4', {
        'followersCount': 1,
      })!;
      expect(statsOnly.isOrganizer, isFalse);
      expect(statsOnly.isDisplayable, isFalse);
      expect(followersOnly.isDisplayable, isFalse);
    });
  });

  group('OrganizerReputation.fromMap (aspectos e distribuição)', () {
    test('com 3+ avaliações traz distribuição e aspectos', () {
      final reputation = OrganizerReputation.fromMap({
        'organizerId': 'org1',
        'reviewsCount': 312,
        'tournamentsRated': 9,
        'average': 4.8,
        'distribution': {'1': 2, '2': 3, '3': 10, '4': 40, '5': 257},
        'aspects': {
          'organization': {'count': 300, 'average': 4.9},
          'prizes': {'count': 120, 'average': 5},
          'bogus': {'count': 3, 'average': 1},
        },
      })!;
      expect(reputation.average, 4.8);
      expect(reputation.distribution, {1: 2, 2: 3, 3: 10, 4: 40, 5: 257});
      expect(
        reputation.aspects!.keys,
        unorderedEquals([
          TournamentReviewAspect.organization,
          TournamentReviewAspect.prizes,
        ]),
      );
      expect(reputation.aspects![TournamentReviewAspect.prizes]!.average, 5.0);
    });

    test('abaixo de 3 avaliações: média, distribuição e aspectos nulos', () {
      final reputation = OrganizerReputation.fromMap({
        'reviewsCount': 2,
        'tournamentsRated': 1,
        'average': null,
        'distribution': null,
        'aspects': null,
      })!;
      expect(reputation.reviewsCount, 2);
      expect(reputation.average, isNull);
      expect(reputation.distribution, isNull);
      expect(reputation.aspects, isNull);
    });
  });
}
