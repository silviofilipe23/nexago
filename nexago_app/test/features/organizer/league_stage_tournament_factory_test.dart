import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/organizer/data/league_stage_tournament_factory.dart';
import 'package:nexago_app/features/organizer/domain/league_create/league_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/league_stage_create/league_stage_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';

LeagueStageCreateDraft _draft() {
  return LeagueStageCreateDraft(
    leagueId: 'league-1',
    leagueName: 'Circuito Verão',
    defaultPriceCents: 9000,
    stage: LeagueStageDraft(
      id: 'stage-2',
      name: 'Etapa 2',
      order: 2,
      locationName: 'Arena NexaGO',
      city: 'Goiânia',
      dateLabel: '10/04 – 12/04',
      startAt: DateTime(2026, 4, 10),
      endAt: DateTime(2026, 4, 12),
    ),
    categories: const [
      LeagueStageCategoryDraft(
        categoryId: 'c1',
        name: 'Masc Open',
        enabled: true,
        spots: 16,
        priceCents: 9000,
      ),
      LeagueStageCategoryDraft(
        categoryId: 'c2',
        name: 'Fem Open',
        enabled: false,
        spots: 12,
        priceCents: 9000,
      ),
    ],
    courtsCount: 6,
    registrationOpensAt: DateTime(2026, 3, 1),
    registrationClosesAt: DateTime(2026, 4, 1),
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('LeagueStageTournamentFactory.build', () {
    test('sets listingStatus open when publishing league stages', () {
      final league = LeagueCreateDraft(
        leagueId: 'league-1',
        name: 'Circuito',
        seasonStartAt: DateTime(2026, 2, 1),
        seasonEndAt: DateTime(2026, 10, 1),
        categories: const [
          TournamentCategoryDraft(
            id: 'c1',
            name: 'Masc Open',
            spots: 8,
            priceCents: 8000,
          ),
        ],
        stages: const [
          LeagueStageDraft(
            id: 'stage-1',
            name: 'Etapa 1',
            order: 1,
            status: LeagueStageStatus.defined,
          ),
        ],
      );

      final map = LeagueStageTournamentFactory.build(
        league: league,
        stage: league.stages.first,
        managerId: 'manager-1',
        tournamentId: 'tournament-1',
      );

      expect(map['listingStatus'], 'open');
      expect(map['isLeagueStage'], isTrue);
    });
  });

  group('LeagueStageTournamentFactory.buildFromStageCreate', () {
    test('publish sets listingStatus open and enabled categories only', () {
      final map = LeagueStageTournamentFactory.buildFromStageCreate(
        draft: _draft(),
        managerId: 'manager-1',
        tournamentId: 'tournament-1',
        publish: true,
      );

      expect(map['listingStatus'], 'open');
      expect(map['isLeagueStage'], isTrue);
      expect(map['leagueId'], 'league-1');
      expect(map['leagueStageId'], 'stage-2');
      expect(map['courtsCount'], 6);
      expect(map['capacity'], 16);

      final categories = map['categories'] as List;
      expect(categories, hasLength(2));

      final enabled = categories.first as Map<String, dynamic>;
      expect(enabled['registrationClosed'], isFalse);
      expect(enabled['maxTeams'], 16);

      final disabled = categories.last as Map<String, dynamic>;
      expect(disabled['registrationClosed'], isTrue);
    });

    test('draft sets listingStatus draft', () {
      final map = LeagueStageTournamentFactory.buildFromStageCreate(
        draft: _draft(),
        managerId: 'manager-1',
        tournamentId: 'tournament-1',
        publish: false,
      );

      expect(map['listingStatus'], 'draft');
      expect(map['registrationOpensAt'], isNotNull);
      expect(map['registrationClosesAt'], isNotNull);
    });
  });

  group('mergeStageIntoLeagueStages', () {
    test('updates pending slot with tournament id', () {
      const existing = [
        LeagueStageDraft(
          id: 'stage-1',
          name: 'Etapa 1',
          order: 1,
          status: LeagueStageStatus.defined,
          tournamentIds: ['t1'],
        ),
        LeagueStageDraft(
          id: 'stage-2',
          name: 'Etapa 2',
          order: 2,
          status: LeagueStageStatus.pending,
        ),
      ];

      const updated = LeagueStageDraft(
        id: 'stage-2',
        name: 'Etapa 2',
        order: 2,
        status: LeagueStageStatus.defined,
        locationName: 'Arena',
        city: 'Goiânia',
        tournamentIds: ['t2'],
      );

      final merged = LeagueStageTournamentFactory.mergeStageIntoLeagueStages(
        existingStages: existing,
        updatedStage: updated,
      );

      expect(merged, hasLength(2));
      final stage2 = merged.last;
      expect(stage2['status'], 'defined');
      expect(stage2['tournamentIds'], ['t2']);
      expect(stage2['locationName'], 'Arena');
    });

    test('appends stage when id not found', () {
      const existing = [
        LeagueStageDraft(
          id: 'stage-1',
          name: 'Etapa 1',
          order: 1,
          status: LeagueStageStatus.defined,
          tournamentIds: ['t1'],
        ),
      ];

      const updated = LeagueStageDraft(
        id: 'stage-3',
        name: 'Etapa 3',
        order: 3,
        status: LeagueStageStatus.defined,
        tournamentIds: ['t3'],
      );

      final merged = LeagueStageTournamentFactory.mergeStageIntoLeagueStages(
        existingStages: existing,
        updatedStage: updated,
      );

      expect(merged, hasLength(2));
      expect(merged.last['id'], 'stage-3');
      expect(merged.last['status'], 'defined');
    });
  });
}
