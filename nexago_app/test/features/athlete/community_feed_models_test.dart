import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/community/community_feed_models.dart';

void main() {
  group('CommunityFeedType', () {
    test('parses backend values and falls back to unknown', () {
      expect(
        CommunityFeedType.fromValue('tournament_open'),
        CommunityFeedType.tournamentOpen,
      );
      expect(
        CommunityFeedType.fromValue('tournament_champions'),
        CommunityFeedType.tournamentChampions,
      );
      expect(
        CommunityFeedType.fromValue('organizer_announcement'),
        CommunityFeedType.organizerAnnouncement,
      );
      expect(CommunityFeedType.fromValue('algo_novo'), CommunityFeedType.unknown);
      expect(CommunityFeedType.fromValue(null), CommunityFeedType.unknown);
    });
  });

  group('CommunityFeedChampion', () {
    test('playersLabel joins pair with &', () {
      const champion = CommunityFeedChampion(
        categoryName: 'Masculino B',
        playerNames: ['Fu', 'Beltrano'],
      );
      expect(champion.playersLabel, 'Fu & Beltrano');
    });
  });

  group('communityFeedRelativeTime', () {
    final now = DateTime(2026, 7, 2, 12, 0);

    test('recent buckets in pt-BR', () {
      expect(
        communityFeedRelativeTime(now.subtract(const Duration(seconds: 30)),
            now: now),
        'agora',
      );
      expect(
        communityFeedRelativeTime(now.subtract(const Duration(minutes: 5)),
            now: now),
        'há 5 min',
      );
      expect(
        communityFeedRelativeTime(now.subtract(const Duration(hours: 3)),
            now: now),
        'há 3 h',
      );
      expect(
        communityFeedRelativeTime(now.subtract(const Duration(days: 1)),
            now: now),
        'ontem',
      );
      expect(
        communityFeedRelativeTime(now.subtract(const Duration(days: 3)),
            now: now),
        'há 3 dias',
      );
    });

    test('falls back to dd/MM after a week', () {
      expect(
        communityFeedRelativeTime(DateTime(2026, 5, 12), now: now),
        '12/05',
      );
    });
  });
}
