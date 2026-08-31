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
  int paidAmountCents = 0,
  String paymentMethod = '',
  List<String> lgpdAcceptedUids = const [],
}) {
  return OrganizerCategoryTeamRow(
    registrationId: 'r-$teamId',
    teamId: teamId,
    player1: OrganizerCategoryPlayerInfo(uid: 'p1-$teamId', name: name, rankingPoints: ranking),
    player2: OrganizerCategoryPlayerInfo(uid: 'p2-$teamId', name: 'Parceiro'),
    status: status,
    seedRank: seedRank,
    expectedAmountCents: 10000,
    paidAmountCents: paidAmountCents,
    paymentMethod: paymentMethod,
    partnerPending: partnerPending,
    lgpdAcceptedUids: lgpdAcceptedUids,
  );
}

/// Dupla com os campos de pagamento por atleta. `p1`/`p2` são os uids dos
/// participantes — passar `p2: ''` produz a inscrição solo (um uid só).
OrganizerCategoryTeamRow _payTeam({
  String p1 = 'u1',
  String p2 = 'u2',
  OrganizerTeamRegistrationStatus status =
      OrganizerTeamRegistrationStatus.pending,
  List<String> sharePaidUids = const [],
  List<String> organizerConfirmedShareUids = const [],
  DateTime? declaredPaidAt,
  bool paymentVerifiedByOrganizer = false,
  String paymentMethod = '',
  int? seedRank,
}) {
  return OrganizerCategoryTeamRow(
    registrationId: 'reg-1',
    teamId: 'team-1',
    player1: OrganizerCategoryPlayerInfo(uid: p1, name: 'Marcos'),
    player2: OrganizerCategoryPlayerInfo(uid: p2, name: 'Victor'),
    status: status,
    seedRank: seedRank,
    expectedAmountCents: 10000,
    paymentMethod: paymentMethod,
    sharePaidUids: sharePaidUids,
    organizerConfirmedShareUids: organizerConfirmedShareUids,
    declaredPaidAt: declaredPaidAt,
    paymentVerifiedByOrganizer: paymentVerifiedByOrganizer,
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

  group('inscriptionPaidAmountCents', () {
    test('converts Firestore reais to cents', () {
      expect(inscriptionPaidAmountCents(160), 16000);
      expect(inscriptionPaidAmountCents(99.5), 9950);
      expect(inscriptionPaidAmountCents(0), 0);
      expect(inscriptionPaidAmountCents(null), 0);
    });
  });

  group('buildPaymentsBreakdown', () {
    test('direct confirmation counts toward viaOrganizer without app fee', () {
      final teams = [
        _team(teamId: 'a', name: 'A', status: OrganizerTeamRegistrationStatus.confirmed),
        _team(teamId: 'b', name: 'B', status: OrganizerTeamRegistrationStatus.pending),
      ];
      final summary = buildPaymentsBreakdown(
        teams: teams,
        expectedPerTeamCents: 10000,
      );
      expect(summary.paidCount, 1);
      expect(summary.pendingCount, 1);
      expect(summary.viaOrganizerCents, 10000);
      expect(summary.viaAppCents, 0);
      expect(summary.collectedCents, 10000);
      expect(summary.netTransferCents, 0);
    });

    test('mixed app and direct with net fee only on app', () {
      final teams = [
        _team(
          teamId: 'app1',
          name: 'App1',
          status: OrganizerTeamRegistrationStatus.confirmed,
          paidAmountCents: 10000,
          paymentMethod: 'pix',
        ),
        _team(
          teamId: 'app2',
          name: 'App2',
          status: OrganizerTeamRegistrationStatus.confirmed,
          paidAmountCents: 10000,
        ),
        _team(
          teamId: 'direct',
          name: 'Direct',
          status: OrganizerTeamRegistrationStatus.confirmed,
          paidAmountCents: 10000,
          paymentMethod: kOrganizerDirectPaymentMethod,
        ),
      ];
      final summary = buildPaymentsBreakdown(
        teams: teams,
        expectedPerTeamCents: 10000,
      );
      expect(summary.viaAppCents, 20000);
      expect(summary.viaOrganizerCents, 10000);
      expect(summary.collectedCents, 30000);
      expect(summary.netTransferCents, 18800);
      expect(summary.outstandingCents, 0);
    });
  });

  group('organizerCategoryExploreSubtitles', () {
    test('teams subtitle pluralizes and shows pending', () {
      expect(
        organizerCategoryExploreTeamsSubtitle(teamCount: 0, pendingCount: 0),
        'Nenhuma inscrição',
      );
      expect(
        organizerCategoryExploreTeamsSubtitle(teamCount: 3, pendingCount: 2),
        '3 duplas · 2 pendentes',
      );
    });

    test('payments subtitle shows direct breakdown when mixed', () {
      const breakdown = OrganizerPaymentsBreakdown(
        viaAppCents: 10000,
        viaOrganizerCents: 5000,
      );
      expect(
        organizerCategoryExplorePaymentsSubtitle(breakdown),
        contains('direto'),
      );
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

    test('rejects odd totals that the old >>1 check accepted', () {
      expect(isBalancedKnockoutQualifierCount(3), isFalse);
      expect(isBalancedKnockoutQualifierCount(5), isFalse);
      expect(isBalancedKnockoutQualifierCount(9), isFalse);
      expect(isBalancedKnockoutQualifierCount(1), isFalse);
      expect(isBalancedKnockoutQualifierCount(2), isTrue);
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

  group('lgpd consent status', () {
    test('all participants accepted → lgpdAcceptedByAll', () {
      final team = _team(
        teamId: 'a',
        name: 'Alpha',
        lgpdAcceptedUids: const ['p1-a', 'p2-a'],
      );
      expect(team.lgpdAcceptedByAll, isTrue);
      expect(team.lgpdPartiallyAccepted, isFalse);
    });

    test('only one of the pair accepted → partial', () {
      final team = _team(
        teamId: 'a',
        name: 'Alpha',
        lgpdAcceptedUids: const ['p1-a'],
      );
      expect(team.lgpdAcceptedByAll, isFalse);
      expect(team.lgpdPartiallyAccepted, isTrue);
    });

    test('legacy inscription without the field → pending, not partial', () {
      final team = _team(teamId: 'a', name: 'Alpha');
      expect(team.lgpdAcceptedByAll, isFalse);
      expect(team.lgpdPartiallyAccepted, isFalse);
    });

    test('solo inscription (single uid) with acceptance counts as all', () {
      final team = OrganizerCategoryTeamRow(
        registrationId: 'r-solo',
        teamId: '',
        player1: const OrganizerCategoryPlayerInfo(uid: 'p1', name: 'Solo'),
        player2: const OrganizerCategoryPlayerInfo(uid: ''),
        partnerPending: true,
        lgpdAcceptedUids: const ['p1'],
      );
      expect(team.lgpdAcceptedByAll, isTrue);
      expect(team.lgpdPartiallyAccepted, isFalse);
    });
  });

  // Confirmação de pagamento POR ATLETA. Fonte da verdade das regras:
  // `functions/src/organizer-payment-share.ts` (share/bulk) e
  // `functions/src/organizer-category-ops.ts` (a callable). O que estiver
  // errado aqui vira dinheiro marcado como recebido sem ter entrado.
  group('teamAwaitsPaymentVerification', () {
    test('declaração do atleta sem baixa do organizador entra na fila', () {
      expect(
        teamAwaitsPaymentVerification(
          _payTeam(
            status: OrganizerTeamRegistrationStatus.confirmed,
            declaredPaidAt: DateTime(2026, 8, 20),
            paymentMethod: kOrganizerDirectPaymentMethod,
          ),
        ),
        isTrue,
      );
    });

    test('declaração já conferida sai da fila', () {
      expect(
        teamAwaitsPaymentVerification(
          _payTeam(
            status: OrganizerTeamRegistrationStatus.confirmed,
            declaredPaidAt: DateTime(2026, 8, 20),
            paymentVerifiedByOrganizer: true,
          ),
        ),
        isFalse,
      );
    });

    test(
      'inscrição direta ANTERIOR ao fluxo (sem declaredPaidAt) nunca entra '
      'numa fila de conferência retroativa, mesmo paga direto com o '
      'organizador',
      () {
        expect(
          teamAwaitsPaymentVerification(
            _payTeam(
              status: OrganizerTeamRegistrationStatus.confirmed,
              paymentMethod: kOrganizerDirectPaymentMethod,
            ),
          ),
          isFalse,
        );
      },
    );

    test('sem declaração, o flag de verificação sozinho não cria fila', () {
      expect(
        teamAwaitsPaymentVerification(
          _payTeam(paymentVerifiedByOrganizer: true),
        ),
        isFalse,
      );
    });
  });

  group('isTeamPaymentSettled', () {
    test('paga e sem conferência pendente é pagamento resolvido', () {
      expect(
        isTeamPaymentSettled(
          _payTeam(status: OrganizerTeamRegistrationStatus.confirmed),
        ),
        isTrue,
      );
    });

    test('paga por declaração ainda a conferir NÃO está resolvida', () {
      expect(
        isTeamPaymentSettled(
          _payTeam(
            status: OrganizerTeamRegistrationStatus.confirmed,
            declaredPaidAt: DateTime(2026, 8, 20),
          ),
        ),
        isFalse,
      );
    });

    test('pendente e fila nunca são resolvidas', () {
      expect(isTeamPaymentSettled(_payTeam()), isFalse);
      expect(
        isTeamPaymentSettled(
          _payTeam(
            status: OrganizerTeamRegistrationStatus.waitlist,
            paymentVerifiedByOrganizer: true,
          ),
        ),
        isFalse,
      );
    });
  });

  group('athletePaymentState', () {
    test('uid fora das duas listas está pendente', () {
      expect(
        athletePaymentState(_payTeam(), 'u1'),
        OrganizerAthletePaymentState.pending,
      );
    });

    test('só em sharePaidUids = declarado pelo atleta', () {
      expect(
        athletePaymentState(_payTeam(sharePaidUids: const ['u1']), 'u1'),
        OrganizerAthletePaymentState.declared,
      );
    });

    test(
      'em organizerConfirmedShareUids = confirmado por você (a callable grava '
      'nas DUAS listas, e a confirmação manual tem de vencer a declaração — '
      'é a única que pode ser desfeita)',
      () {
        expect(
          athletePaymentState(
            _payTeam(
              sharePaidUids: const ['u1'],
              organizerConfirmedShareUids: const ['u1'],
            ),
            'u1',
          ),
          OrganizerAthletePaymentState.organizerConfirmed,
        );
      },
    );

    test('cada atleta tem o próprio estado na mesma inscrição', () {
      final team = _payTeam(
        sharePaidUids: const ['u1'],
        organizerConfirmedShareUids: const ['u1'],
      );
      expect(
        athletePaymentState(team, 'u1'),
        OrganizerAthletePaymentState.organizerConfirmed,
      );
      expect(
        athletePaymentState(team, 'u2'),
        OrganizerAthletePaymentState.pending,
      );
    });

    test('uid vazio ou desconhecido cai em pendente, sem estourar', () {
      final team = _payTeam(sharePaidUids: const ['u1']);
      expect(
        athletePaymentState(team, ''),
        OrganizerAthletePaymentState.pending,
      );
      expect(
        athletePaymentState(team, '   '),
        OrganizerAthletePaymentState.pending,
      );
      expect(
        athletePaymentState(team, 'outro'),
        OrganizerAthletePaymentState.pending,
      );
    });
  });

  // Espelho de `bulkConfirmBlockedByPartialShare` (CF): quando é true, a
  // callable em bloco RECUSA (failed-precondition) e a tela precisa esconder
  // a ação em bloco.
  group('teamHasPartialPayment', () {
    test('solo (um uid só) nunca é parcial, nem com a parte paga', () {
      expect(
        teamHasPartialPayment(
          _payTeam(p2: '', sharePaidUids: const ['u1']),
        ),
        isFalse,
      );
      expect(teamHasPartialPayment(_payTeam(p2: '')), isFalse);
    });

    test('dupla sem nenhuma parcela paga não é parcial', () {
      expect(teamHasPartialPayment(_payTeam()), isFalse);
    });

    test('metade da dupla paga é parcial', () {
      expect(
        teamHasPartialPayment(_payTeam(sharePaidUids: const ['u1'])),
        isTrue,
      );
      expect(
        teamHasPartialPayment(_payTeam(sharePaidUids: const ['u2'])),
        isTrue,
      );
    });

    test('dupla inteira paga não é parcial', () {
      expect(
        teamHasPartialPayment(_payTeam(sharePaidUids: const ['u1', 'u2'])),
        isFalse,
      );
    });

    test('uid estranho na lista não conta como parcela dos participantes', () {
      expect(
        teamHasPartialPayment(_payTeam(sharePaidUids: const ['fantasma'])),
        isTrue,
      );
    });
  });

  group('showsAthletePaymentBreakdown', () {
    test('dupla pendente mostra a divisão por atleta', () {
      expect(showsAthletePaymentBreakdown(_payTeam()), isTrue);
    });

    test('dupla na fila de espera também mostra', () {
      expect(
        showsAthletePaymentBreakdown(
          _payTeam(status: OrganizerTeamRegistrationStatus.waitlist),
        ),
        isTrue,
      );
    });

    test('solo não tem o que dividir', () {
      expect(showsAthletePaymentBreakdown(_payTeam(p2: '')), isFalse);
    });

    test('inscrição a conferir já é elenco completo declarado', () {
      expect(
        showsAthletePaymentBreakdown(
          _payTeam(
            status: OrganizerTeamRegistrationStatus.confirmed,
            sharePaidUids: const ['u1', 'u2'],
            declaredPaidAt: DateTime(2026, 8, 20),
          ),
        ),
        isFalse,
      );
    });

    test('inscrição paga e conferida não mostra divisão', () {
      expect(
        showsAthletePaymentBreakdown(
          _payTeam(
            status: OrganizerTeamRegistrationStatus.confirmed,
            sharePaidUids: const ['u1', 'u2'],
          ),
        ),
        isFalse,
      );
    });
  });

  // Selo do parcial na lista da categoria ("1/2 PAGO"): é o que revela, sem
  // abrir dupla por dupla, quem pagou pela metade.
  group('teamSharePaidCount e teamPartialPaymentLabel', () {
    test('conta os participantes que estão em sharePaidUids', () {
      expect(teamSharePaidCount(_payTeam(sharePaidUids: const ['u1'])), 1);
      expect(
        teamPartialPaymentLabel(_payTeam(sharePaidUids: const ['u1'])),
        '1/2 PAGO',
      );
    });

    test('nenhuma parcela paga conta zero', () {
      expect(teamSharePaidCount(_payTeam()), 0);
      expect(teamPartialPaymentLabel(_payTeam()), '0/2 PAGO');
    });

    test('dupla inteira paga fecha o contador', () {
      final team = _payTeam(sharePaidUids: const ['u1', 'u2']);
      expect(teamSharePaidCount(team), 2);
      expect(teamPartialPaymentLabel(team), '2/2 PAGO');
    });

    test(
      'uid em sharePaidUids que NÃO é participante não conta (senão a dupla '
      'apareceria paga por um estranho — ex.: parceiro trocado depois da '
      'declaração)',
      () {
        final team = _payTeam(sharePaidUids: const ['fantasma']);
        expect(teamSharePaidCount(team), 0);
        expect(teamPartialPaymentLabel(team), '0/2 PAGO');

        final mixed = _payTeam(sharePaidUids: const ['fantasma', 'u2']);
        expect(teamSharePaidCount(mixed), 1);
        expect(teamPartialPaymentLabel(mixed), '1/2 PAGO');
      },
    );

    test('uid repetido na lista não infla a contagem', () {
      final team = _payTeam(sharePaidUids: const ['u1', 'u1']);
      expect(teamSharePaidCount(team), 1);
      expect(teamPartialPaymentLabel(team), '1/2 PAGO');
    });

    test('solo conta sobre o elenco de um (o selo não chega a aparecer)', () {
      final team = _payTeam(p2: '', sharePaidUids: const ['u1']);
      expect(teamSharePaidCount(team), 1);
      expect(teamPartialPaymentLabel(team), '1/1 PAGO');
      expect(teamHasPartialPayment(team), isFalse);
    });
  });

  group('rótulos de pagamento', () {
    test('estado do atleta', () {
      expect(
        athletePaymentStateLabel(
          OrganizerAthletePaymentState.organizerConfirmed,
        ),
        'Confirmado por você',
      );
      expect(
        athletePaymentStateLabel(OrganizerAthletePaymentState.declared),
        'Declarado pelo atleta · aguardando conferência',
      );
      expect(
        athletePaymentStateLabel(OrganizerAthletePaymentState.pending),
        'Pagamento pendente',
      );
    });

    test('ação por atleta distingue baixa de lançamento novo', () {
      expect(
        athletePaymentActionLabel(
          OrganizerAthletePaymentState.organizerConfirmed,
        ),
        'Desfazer',
      );
      expect(
        athletePaymentActionLabel(OrganizerAthletePaymentState.declared),
        'Confirmar recebimento',
      );
      expect(
        athletePaymentActionLabel(OrganizerAthletePaymentState.pending),
        'Confirmar pagamento',
      );
    });

    test('ação em bloco vira "recebimento" quando aguarda conferência', () {
      expect(
        teamConfirmPaymentActionLabel(
          _payTeam(
            status: OrganizerTeamRegistrationStatus.confirmed,
            declaredPaidAt: DateTime(2026, 8, 20),
          ),
        ),
        'Confirmar recebimento',
      );
      expect(teamConfirmPaymentActionLabel(_payTeam()), 'Confirmar pagamento');
      expect(
        teamConfirmPaymentActionLabel(
          _payTeam(
            status: OrganizerTeamRegistrationStatus.confirmed,
            declaredPaidAt: DateTime(2026, 8, 20),
            paymentVerifiedByOrganizer: true,
          ),
        ),
        'Confirmar pagamento',
      );
    });
  });

  // A reconstrução campo a campo já derrubou `partnerPending` e o pedido de
  // cancelamento das cabeças de chave; os 4 campos de pagamento por atleta
  // entram na mesma armadilha se `copyWith` esquecer de propagá-los — a dupla
  // seed apareceria como "ninguém pagou".
  group('copyWith preserva o pagamento por atleta', () {
    final source = _payTeam(
      status: OrganizerTeamRegistrationStatus.waitlist,
      sharePaidUids: const ['u1'],
      organizerConfirmedShareUids: const ['u1'],
      declaredPaidAt: DateTime(2026, 8, 20, 10, 30),
      paymentVerifiedByOrganizer: true,
    );

    test('copyWith(seedRank:) mantém os quatro campos novos', () {
      final copy = source.copyWith(seedRank: 3);

      expect(copy.seedRank, 3);
      expect(copy.sharePaidUids, const ['u1']);
      expect(copy.organizerConfirmedShareUids, const ['u1']);
      expect(copy.declaredPaidAt, DateTime(2026, 8, 20, 10, 30));
      expect(copy.paymentVerifiedByOrganizer, isTrue);
    });

    test('estado derivado do atleta sobrevive à cópia', () {
      final copy = source.copyWith(seedRank: 1);

      expect(
        athletePaymentState(copy, 'u1'),
        OrganizerAthletePaymentState.organizerConfirmed,
      );
      expect(
        athletePaymentState(copy, 'u2'),
        OrganizerAthletePaymentState.pending,
      );
      expect(teamHasPartialPayment(copy), isTrue);
    });

    test('applySeedOrder (caminho real da cópia) não zera o pagamento', () {
      final ordered = applySeedOrder([
        _payTeam(
          sharePaidUids: const ['u1'],
          organizerConfirmedShareUids: const ['u1'],
        ),
      ], ['team-1']);

      expect(ordered.single.seedRank, 1);
      expect(ordered.single.sharePaidUids, const ['u1']);
      expect(ordered.single.organizerConfirmedShareUids, const ['u1']);
      expect(teamHasPartialPayment(ordered.single), isTrue);
      expect(showsAthletePaymentBreakdown(ordered.single), isTrue);
    });
  });

  group('participantes da inscrição', () {
    test('dupla completa expõe os dois atletas', () {
      final team = _payTeam();
      expect(team.participantUids, const ['u1', 'u2']);
      expect(team.participants.map((p) => p.name), ['Marcos', 'Victor']);
    });

    test('solo aguardando parceiro expõe um só', () {
      final team = _payTeam(p2: '');
      expect(team.participantUids, const ['u1']);
    });

    test('uid em branco não vira participante fantasma', () {
      final team = _payTeam(p1: '   ', p2: 'u2');
      expect(team.participantUids, const ['u2']);
    });
  });
}
