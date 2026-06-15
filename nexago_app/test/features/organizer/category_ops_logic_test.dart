import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_logic.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';

OrganizerCategoryTeamRow _team({
  required String teamId,
  required String name,
  OrganizerTeamRegistrationStatus status =
      OrganizerTeamRegistrationStatus.pending,
  int? seedRank,
  int ranking = 0,
}) {
  return OrganizerCategoryTeamRow(
    registrationId: 'r-$teamId',
    teamId: teamId,
    player1: OrganizerCategoryPlayerInfo(uid: 'p1-$teamId', name: name, rankingPoints: ranking),
    player2: OrganizerCategoryPlayerInfo(uid: 'p2-$teamId', name: 'Parceiro'),
    status: status,
    seedRank: seedRank,
    expectedAmountCents: 10000,
  );
}

void main() {
  group('filterCategoryTeams', () {
    final teams = [
      _team(teamId: 'a', name: 'Alpha', status: OrganizerTeamRegistrationStatus.confirmed, seedRank: 1),
      _team(teamId: 'b', name: 'Beta', status: OrganizerTeamRegistrationStatus.pending),
      _team(teamId: 'c', name: 'Gamma', status: OrganizerTeamRegistrationStatus.waitlist),
    ];

    test('filters pending only', () {
      final result = filterCategoryTeams(
        teams,
        OrganizerCategoryTeamFilter.pending,
        '',
      );
      expect(result, hasLength(1));
      expect(result.first.teamId, 'b');
    });

    test('search by player name', () {
      final result = filterCategoryTeams(
        teams,
        OrganizerCategoryTeamFilter.all,
        'alpha',
      );
      expect(result, hasLength(1));
      expect(result.first.teamId, 'a');
    });
  });

  group('buildPaymentsSummary', () {
    test('computes net transfer with 6% fee', () {
      final teams = [
        _team(teamId: 'a', name: 'A', status: OrganizerTeamRegistrationStatus.confirmed),
        _team(teamId: 'b', name: 'B', status: OrganizerTeamRegistrationStatus.pending),
      ];
      final summary = buildPaymentsSummary(
        teams: teams,
        expectedPerTeamCents: 10000,
      );
      expect(summary.paidCount, 1);
      expect(summary.pendingCount, 1);
      expect(summary.collectedCents, 10000);
      expect(summary.netTransferCents, 9400);
    });
  });

  group('categoryOpsFromMap', () {
    test('parses seeds and bracket status', () {
      final state = categoryOpsFromMap({
        'seeds': ['t1', 't2'],
        'bracketStatus': 'published',
        'bracketConfig': {'winnersAdvantage': false},
      });
      expect(state.seeds, ['t1', 't2']);
      expect(state.bracketStatus, CategoryBracketStatus.published);
      expect(state.winnersAdvantage, isFalse);
    });
  });
}
