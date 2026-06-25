import 'dart:math';

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
  bool partnerPending = false,
}) {
  return OrganizerCategoryTeamRow(
    registrationId: 'r-$teamId',
    teamId: teamId,
    player1: OrganizerCategoryPlayerInfo(uid: 'p1-$teamId', name: name, rankingPoints: ranking),
    player2: OrganizerCategoryPlayerInfo(uid: 'p2-$teamId', name: 'Parceiro'),
    status: status,
    seedRank: seedRank,
    expectedAmountCents: 10000,
    partnerPending: partnerPending,
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

  group('bracket draw eligibility', () {
    test('confirmed without partnerPending is eligible', () {
      final team = _team(
        teamId: 'a',
        name: 'A',
        status: OrganizerTeamRegistrationStatus.confirmed,
      );
      expect(isTeamEligibleForBracketDraw(team), isTrue);
    });

    test('pending and waitlist are not eligible', () {
      expect(
        isTeamEligibleForBracketDraw(
          _team(teamId: 'p', name: 'P', status: OrganizerTeamRegistrationStatus.pending),
        ),
        isFalse,
      );
      expect(
        isTeamEligibleForBracketDraw(
          _team(teamId: 'w', name: 'W', status: OrganizerTeamRegistrationStatus.waitlist),
        ),
        isFalse,
      );
    });

    test('solo paid awaiting partner is not eligible', () {
      expect(
        isTeamEligibleForBracketDraw(
          _team(
            teamId: 's',
            name: 'Solo',
            status: OrganizerTeamRegistrationStatus.confirmed,
            partnerPending: true,
          ),
        ),
        isFalse,
      );
    });

    test('teamsEligibleForBracketDraw filters list', () {
      final teams = [
        _team(teamId: 'a', name: 'A', status: OrganizerTeamRegistrationStatus.confirmed),
        _team(teamId: 'b', name: 'B', status: OrganizerTeamRegistrationStatus.pending),
      ];
      final eligible = teamsEligibleForBracketDraw(teams);
      expect(eligible, hasLength(1));
      expect(eligible.first.teamId, 'a');
    });

    test('filterSeedTeamIdsToEligible keeps only paid seeds', () {
      final eligible = [
        _team(teamId: 'a', name: 'A', status: OrganizerTeamRegistrationStatus.confirmed),
        _team(teamId: 'b', name: 'B', status: OrganizerTeamRegistrationStatus.confirmed),
      ];
      expect(
        filterSeedTeamIdsToEligible(['a', 'c', 'b'], eligible),
        ['a', 'b'],
      );
    });
  });

  group('visibleCategoryTeams', () {
    final all = [
      _team(teamId: 'a', name: 'A', status: OrganizerTeamRegistrationStatus.confirmed),
      _team(teamId: 'b', name: 'B', status: OrganizerTeamRegistrationStatus.pending),
      _team(teamId: 'c', name: 'C', status: OrganizerTeamRegistrationStatus.confirmed),
    ];

    test('returns all teams before bracket is published', () {
      expect(
        visibleCategoryTeams(teams: all, ops: const CategoryOpsState()),
        all,
      );
    });

    test('returns only bracket participants after publish', () {
      const ops = CategoryOpsState(
        bracketStatus: CategoryBracketStatus.published,
        seeds: ['a'],
        groupsPreview: [
          CategoryGroupPreview(id: 'A', teamIds: ['c']),
        ],
      );
      final visible = visibleCategoryTeams(teams: all, ops: ops);
      expect(visible.map((t) => t.teamId).toList(), ['a', 'c']);
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

  group('isGroupDrawPrimaryHead', () {
    test('true for seed ranks within primary head count', () {
      expect(
        isGroupDrawPrimaryHead(seedRank: 1, primaryHeadCount: 4),
        isTrue,
      );
      expect(
        isGroupDrawPrimaryHead(seedRank: 4, primaryHeadCount: 4),
        isTrue,
      );
    });

    test('false for ranks above primary head count or null', () {
      expect(
        isGroupDrawPrimaryHead(seedRank: 5, primaryHeadCount: 4),
        isFalse,
      );
      expect(
        isGroupDrawPrimaryHead(seedRank: null, primaryHeadCount: 4),
        isFalse,
      );
    });
  });

  group('groupDrawTeamBadgeLabel', () {
    test('returns seed badge for primary heads only', () {
      final team = _team(teamId: 'a', name: 'Alpha', seedRank: 1);
      expect(
        groupDrawTeamBadgeLabel(
          team: team,
          overallRankByTeamId: {'a': 1},
          primaryHeadCount: 4,
        ),
        'C1',
      );
    });

    test('returns C3 for third primary head', () {
      final team = _team(teamId: 'c', name: 'Charlie', seedRank: 3);
      expect(
        groupDrawTeamBadgeLabel(
          team: team,
          overallRankByTeamId: {'c': 3},
          primaryHeadCount: 4,
        ),
        'C3',
      );
    });

    test('returns global rank when seed rank is above primary head count', () {
      final team = _team(teamId: 'e', name: 'Echo', seedRank: 5);
      expect(
        groupDrawTeamBadgeLabel(
          team: team,
          overallRankByTeamId: {'e': 5},
          primaryHeadCount: 4,
        ),
        '#5',
      );
    });

    test('returns global rank for non-seed teams', () {
      final team = _team(teamId: 'b', name: 'Beta');
      expect(
        groupDrawTeamBadgeLabel(
          team: team,
          overallRankByTeamId: {'b': 8},
          primaryHeadCount: 4,
        ),
        '#8',
      );
    });
  });

  group('defaultGroupCountForCategory', () {
    test('16 teams with 4 per group yields 4 groups', () {
      expect(
        defaultGroupCountForCategory(teamCount: 16, teamsPerGroup: 4),
        4,
      );
    });

    test('14 teams with 4 per group rounds up to 4 groups', () {
      expect(
        defaultGroupCountForCategory(teamCount: 14, teamsPerGroup: 4),
        4,
      );
    });

    test('6 teams with 4 per group yields 2 groups', () {
      expect(
        defaultGroupCountForCategory(teamCount: 6, teamsPerGroup: 4),
        2,
      );
    });

    test('zero teams yields 1 group', () {
      expect(
        defaultGroupCountForCategory(teamCount: 0, teamsPerGroup: 4),
        1,
      );
    });

    test('invalid teamsPerGroup falls back to 4', () {
      expect(
        defaultGroupCountForCategory(teamCount: 16, teamsPerGroup: 0),
        4,
      );
      expect(
        defaultGroupCountForCategory(teamCount: 16, teamsPerGroup: 1),
        4,
      );
    });
  });

  group('isBalancedKnockoutQualifierCount', () {
    test('accepts power-of-two pairings', () {
      expect(isBalancedKnockoutQualifierCount(4), isTrue);
      expect(isBalancedKnockoutQualifierCount(8), isTrue);
      expect(isBalancedKnockoutQualifierCount(16), isTrue);
    });

    test('rejects unbalanced totals', () {
      expect(isBalancedKnockoutQualifierCount(10), isFalse);
      expect(isBalancedKnockoutQualifierCount(6), isFalse);
    });
  });

  group('distributeTeamsIntoGroups', () {
    test('places seeds in different groups with snake draft', () {
      final groups = distributeTeamsIntoGroups(
        teamIds: ['t1', 't2', 't3', 't4'],
        seedTeamIds: ['t1', 't2'],
        respectSeeds: true,
        random: Random(1),
      );
      expect(groups, hasLength(2));
      expect(groups[0].teamIds.first, 't1');
      expect(groups[1].teamIds.first, 't2');
      expect(
        {...groups[0].teamIds, ...groups[1].teamIds},
        {'t1', 't2', 't3', 't4'},
      );
    });

    test('ignores seed order when respectSeeds is false', () {
      final withSeeds = distributeTeamsIntoGroups(
        teamIds: ['a', 'b', 'c', 'd'],
        seedTeamIds: ['a', 'b'],
        respectSeeds: true,
        random: Random(42),
      );
      final withoutSeeds = distributeTeamsIntoGroups(
        teamIds: ['a', 'b', 'c', 'd'],
        seedTeamIds: ['a', 'b'],
        respectSeeds: false,
        random: Random(42),
      );
      expect(withSeeds[0].teamIds.first, 'a');
      expect(withoutSeeds, isNot(equals(withSeeds)));
    });

    test('distributes 16 teams into 4 groups with top seeds in each', () {
      final teamIds = List.generate(16, (i) => 't${i + 1}');
      final seedTeamIds = ['t1', 't2', 't3', 't4'];
      final groups = distributeTeamsIntoGroups(
        teamIds: teamIds,
        seedTeamIds: seedTeamIds,
        respectSeeds: true,
        groupCount: 4,
        random: Random(1),
      );

      expect(groups, hasLength(4));
      expect(groups.map((g) => g.id), ['A', 'B', 'C', 'D']);
      for (final group in groups) {
        expect(group.teamIds, hasLength(4));
      }
      expect(groups[0].teamIds.first, 't1');
      expect(groups[1].teamIds.first, 't2');
      expect(groups[2].teamIds.first, 't3');
      expect(groups[3].teamIds.first, 't4');
      expect(
        groups.expand((g) => g.teamIds).toSet(),
        teamIds.toSet(),
      );
    });
  });

  group('seedingCategoryEyebrow', () {
    test('keeps Portuguese gender label without uppercasing', () {
      expect(
        seedingCategoryEyebrow(genderLabel: 'Masculino', levelLabel: 'Open'),
        'Masculino · OPEN',
      );
    });
  });

  group('bracketStructure', () {
    test('returns zeros below the 2-team minimum', () {
      expect(bracketStructure(0), (bracketSize: 0, byes: 0, rounds: 0));
      expect(bracketStructure(1), (bracketSize: 0, byes: 0, rounds: 0));
    });

    test('exact power of two has no byes', () {
      expect(bracketStructure(8), (bracketSize: 8, byes: 0, rounds: 3));
      expect(bracketStructure(16), (bracketSize: 16, byes: 0, rounds: 4));
    });

    test('rounds up to the next power of two and counts byes', () {
      expect(bracketStructure(5), (bracketSize: 8, byes: 3, rounds: 3));
      expect(bracketStructure(6), (bracketSize: 8, byes: 2, rounds: 3));
      expect(bracketStructure(12), (bracketSize: 16, byes: 4, rounds: 4));
    });
  });

  group('bracketStructureSummary', () {
    test('asks for the minimum below 2 teams', () {
      expect(bracketStructureSummary(1), 'Mínimo de 2 duplas para gerar a chave.');
    });

    test('no-bye summary omits the bye clause', () {
      expect(bracketStructureSummary(8), '8 duplas · chave de 8 · sem byes');
    });

    test('singular bye uses singular wording', () {
      expect(
        bracketStructureSummary(3),
        '3 duplas · chave de 4 · 1 bye (top 1 avança direto)',
      );
    });

    test('plural byes use plural wording', () {
      expect(
        bracketStructureSummary(5),
        '5 duplas · chave de 8 · 3 byes (top 3 avançam direto)',
      );
    });
  });
}
