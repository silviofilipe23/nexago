import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/organizer/data/league_create_mapper.dart';
import 'package:nexago_app/features/organizer/data/league_stage_tournament_factory.dart';
import 'package:nexago_app/features/organizer/domain/league_create/league_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('LeagueCreateMapper', () {
    test('toFirestore includes wizard step and listing status', () {
      final draft = LeagueCreateDraft(
        name: 'Copa Goiás',
        seasonStartAt: DateTime(2026, 2, 1),
        seasonEndAt: DateTime(2026, 10, 1),
        plannedStagesCount: 6,
        categories: const [
          TournamentCategoryDraft(id: 'c1', name: 'Masc Open', spots: 16),
        ],
        stages: const [
          LeagueStageDraft(
            id: 's1',
            name: 'Etapa 1',
            order: 1,
            status: LeagueStageStatus.defined,
            tournamentIds: ['t1'],
          ),
        ],
      );

      final data = LeagueCreateMapper.toFirestore(
        draft: draft,
        managerId: 'manager-1',
        publish: true,
        wizardStep: LeagueCreateStep.review,
      );

      expect(data['name'], 'Copa Goiás');
      expect(data['managerId'], 'manager-1');
      expect(data['listingStatus'], 'open');
      expect(data['wizardStep'], 'review');
      expect(data['countingStagesMode'], 'best_4_of_6');
      expect(data['stages'], isA<List>());
      final stage = (data['stages'] as List).first as Map<String, dynamic>;
      expect(stage['status'], 'defined');
      expect(stage['tournamentIds'], ['t1']);
    });

    test('zeroes wildcardSpots when wildcard disabled', () {
      LeagueCreateDraft base({
        required bool wildcardEnabled,
        int wildcardSpots = 5,
      }) {
        return LeagueCreateDraft(
          name: 'Copa',
          seasonStartAt: DateTime(2026, 2, 1),
          seasonEndAt: DateTime(2026, 10, 1),
          wildcardEnabled: wildcardEnabled,
          wildcardSpots: wildcardSpots,
        );
      }

      final off = LeagueCreateMapper.toFirestore(
        draft: base(wildcardEnabled: false),
        managerId: 'm',
        publish: true,
      );
      expect(off['wildcardEnabled'], isFalse);
      expect(off['wildcardSpots'], 0);

      final on = LeagueCreateMapper.toFirestore(
        draft: base(wildcardEnabled: true, wildcardSpots: 3),
        managerId: 'm',
        publish: true,
      );
      expect(on['wildcardSpots'], 3);
    });

    test('counting mode round-trips through firestore', () {
      final data = LeagueCreateMapper.toFirestore(
        draft: LeagueCreateDraft(
          name: 'Copa',
          seasonStartAt: DateTime(2026, 2, 1),
          seasonEndAt: DateTime(2026, 10, 1),
          countingStagesMode: LeagueCountingStagesMode.allStages,
        ),
        managerId: 'm',
        publish: true,
      );
      expect(data['countingStagesMode'], 'all_stages');

      final loaded = LeagueCreateMapper.fromFirestore({
        ...data,
        'countingStagesMode': 'all_stages',
      }, 'league-x');
      expect(
        loaded.draft.countingStagesMode,
        LeagueCountingStagesMode.allStages,
      );
    });

    test('counting mode defaults to best4Of6 when missing/unknown', () {
      final loaded = LeagueCreateMapper.fromFirestore({
        'name': 'Copa',
        'seasonStartAt': Timestamp.fromDate(DateTime(2026, 2, 1)),
        'seasonEndAt': Timestamp.fromDate(DateTime(2026, 10, 1)),
        'countingStagesMode': 'mystery',
      }, 'league-x');
      expect(
        loaded.draft.countingStagesMode,
        LeagueCountingStagesMode.best4Of6,
      );
    });

    test('fromFirestore tolerates legacy prize "value" as string', () {
      final loaded = LeagueCreateMapper.fromFirestore({
        'name': 'Copa',
        'categories': [
          {
            'id': 'c1',
            'maxTeams': 16,
            'prizes': [
              {'position': '1', 'value': '90'},
            ],
          },
        ],
      }, 'league-x');
      expect(loaded.draft.categories.first.prizes.first.valueCents, 9000);
    });

    test('categoria: level Avançado 1/2 grava e roundtripa (escada de 7)', () {
      final draft = LeagueCreateDraft(
        name: 'Copa',
        seasonStartAt: DateTime(2026, 2, 1),
        seasonEndAt: DateTime(2026, 10, 1),
        categories: const [
          TournamentCategoryDraft(
            id: 'c1',
            skillLevel: TournamentSkillLevel.avancado1,
          ),
          TournamentCategoryDraft(
            id: 'c2',
            skillLevel: TournamentSkillLevel.avancado2,
          ),
        ],
      );

      final data = LeagueCreateMapper.toFirestore(
        draft: draft,
        managerId: 'm',
        publish: true,
      );
      final categories = data['categories'] as List;
      expect(categories[0]['level'], 'Avançado 1');
      expect(categories[1]['level'], 'Avançado 2');

      final loaded = LeagueCreateMapper.fromFirestore(data, 'league-y');
      expect(
        loaded.draft.categories[0].skillLevel,
        TournamentSkillLevel.avancado1,
      );
      expect(
        loaded.draft.categories[1].skillLevel,
        TournamentSkillLevel.avancado2,
      );
    });

    test('categoria com minLevel sobrevive a um re-save do app (fromFirestore → toFirestore)', () {
      final loaded = LeagueCreateMapper.fromFirestore({
        'name': 'Circuito Elite',
        'seasonStartAt': Timestamp.fromDate(DateTime(2026, 2, 1)),
        'seasonEndAt': Timestamp.fromDate(DateTime(2026, 10, 1)),
        'categories': [
          {
            'id': 'c1',
            'categoryName': 'Elite',
            'maxTeams': 16,
            'level': 'Open',
            'minLevel': 'Avançado 1',
          },
        ],
      }, 'league-elite');

      expect(loaded.draft.categories.single.minLevel, 'Avançado 1');

      final data = LeagueCreateMapper.toFirestore(
        draft: loaded.draft,
        managerId: 'm',
        publish: true,
      );
      final category = (data['categories'] as List).single as Map<String, dynamic>;
      expect(category['minLevel'], 'Avançado 1');
    });

    test('fromFirestore restores draft and step', () {
      final data = {
        'name': 'Circuito Verão',
        'sport': 'beachVolleyball',
        'seasonStartAt': Timestamp.fromDate(DateTime(2026, 3, 1)),
        'seasonEndAt': Timestamp.fromDate(DateTime(2026, 9, 1)),
        'plannedStagesCount': 5,
        'grandFinalEnabled': true,
        'countingStagesMode': 'best_3_of_5',
        'rankingTableId': 'state_circuit',
        'grandFinalSpots': 16,
        'wildcardEnabled': false,
        'categories': [
          {
            'id': 'c1',
            'categoryName': 'Masc Open',
            'genderType': 'male',
            'disputeType': 'dupla',
            'ageBand': 'open',
            'level': 'Open',
            'maxTeams': 16,
            'entryFeeCents': 22000,
          },
        ],
        'stages': [
          {
            'id': 's1',
            'name': 'Etapa 1',
            'order': 1,
            'status': 'pending',
            'tournamentIds': [],
          },
        ],
        'wizardStep': 'categories',
      };

      final loaded = LeagueCreateMapper.fromFirestore(data, 'league-1');
      expect(loaded.draft.leagueId, 'league-1');
      expect(loaded.draft.name, 'Circuito Verão');
      expect(
        loaded.draft.countingStagesMode,
        LeagueCountingStagesMode.best3Of5,
      );
      expect(loaded.draft.categories, hasLength(1));
      expect(loaded.step, LeagueCreateStep.categories);
    });
  });

  group('LeagueStageTournamentFactory', () {
    test('build links tournament to league stage', () {
      final league = LeagueCreateDraft(
        leagueId: 'league-1',
        name: 'Copa Goiás',
        city: 'Goiânia',
        seasonStartAt: DateTime(2026, 4, 1),
        seasonEndAt: DateTime(2026, 4, 30),
        categories: const [TournamentCategoryDraft(id: 'c1', spots: 16)],
        stages: const [
          LeagueStageDraft(
            id: 'stage-1',
            name: 'Etapa Centro-Oeste',
            order: 1,
            status: LeagueStageStatus.defined,
            locationName: 'Arena Nexa',
            city: 'Goiânia',
            startAt: null,
            endAt: null,
          ),
        ],
      );

      final tournament = LeagueStageTournamentFactory.build(
        league: league,
        stage: league.stages.first.copyWith(dateLabel: 'Abr 2026'),
        managerId: 'manager-1',
        tournamentId: 'tournament-1',
      );

      expect(tournament['leagueId'], 'league-1');
      expect(tournament['leagueStageId'], 'stage-1');
      expect(tournament['leagueStageOrder'], 1);
      expect(tournament['listingStatus'], 'open');
      expect(tournament['isLeagueStage'], isTrue);
      expect(tournament['categories'], isA<List>());
    });
  });

  group('publish batch sizing', () {
    test('only defined stages should become tournaments', () {
      final draft = LeagueCreateDraft(
        name: 'Copa',
        seasonStartAt: DateTime(2026, 2, 1),
        seasonEndAt: DateTime(2026, 10, 1),
        stages: const [
          LeagueStageDraft(
            id: 'd1',
            name: 'E1',
            order: 1,
            status: LeagueStageStatus.defined,
          ),
          LeagueStageDraft(
            id: 'p1',
            name: 'E2',
            order: 2,
            status: LeagueStageStatus.pending,
          ),
          LeagueStageDraft(
            id: 'd2',
            name: 'GF',
            order: 3,
            status: LeagueStageStatus.defined,
            isGrandFinal: true,
          ),
        ],
      );

      final definedCount = draft.stages
          .where((s) => s.status == LeagueStageStatus.defined)
          .length;
      expect(definedCount, 2);
    });
  });
}
