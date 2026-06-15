import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/league_create/league_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/league_stage_create/league_stage_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/league_stage_create/league_stage_create_logic.dart';

LeagueStageCreateDraft _validDraft() {
  return LeagueStageCreateDraft(
    leagueId: 'league-1',
    leagueName: 'Circuito Verão',
    plannedStagesCount: 6,
    stage: LeagueStageDraft(
      id: 'stage-2',
      name: 'Etapa 2',
      order: 2,
      locationName: 'Arena NexaGO',
      city: 'Goiânia',
      startAt: DateTime(2026, 4, 10),
      endAt: DateTime(2026, 4, 12),
    ),
    categories: const [
      LeagueStageCategoryDraft(
        categoryId: 'c1',
        name: 'Masc Open',
        enabled: true,
        spots: 16,
      ),
    ],
    courtsCount: 4,
    registrationOpensAt: DateTime(2026, 3, 1),
    registrationClosesAt: DateTime(2026, 4, 1),
  );
}

void main() {
  group('resolveTargetStage', () {
    test('reuses first pending slot without tournaments', () {
      const stages = [
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
        LeagueStageDraft(
          id: 'stage-3',
          name: 'Etapa 3',
          order: 3,
          status: LeagueStageStatus.pending,
        ),
      ];

      final target = resolveTargetStage(stages);

      expect(target.id, 'stage-2');
      expect(target.order, 2);
    });

    test('appends new stage when no pending slot is free', () {
      const stages = [
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
          tournamentIds: ['t2'],
        ),
      ];

      final target = resolveTargetStage(stages);

      expect(target.id, 'stage-3');
      expect(target.order, 3);
      expect(target.name, 'Etapa 3');
      expect(target.status, LeagueStageStatus.pending);
    });
  });

  group('canContinueFromStageStep', () {
    test('location requires name, city, venue and dates', () {
      const draft = LeagueStageCreateDraft();
      expect(
        canContinueFromStageStep(draft, LeagueStageCreateStep.location),
        isFalse,
      );

      expect(
        canContinueFromStageStep(_validDraft(), LeagueStageCreateStep.location),
        isTrue,
      );
    });

    test('categories step requires enabled category and registration range', () {
      final draft = _validDraft().copyWith(
        categories: const [
          LeagueStageCategoryDraft(
            categoryId: 'c1',
            name: 'Masc Open',
            enabled: false,
            spots: 16,
          ),
        ],
      );
      expect(
        canContinueFromStageStep(
          draft,
          LeagueStageCreateStep.categoriesRegistration,
        ),
        isFalse,
      );

      expect(
        canContinueFromStageStep(
          _validDraft(),
          LeagueStageCreateStep.categoriesRegistration,
        ),
        isTrue,
      );
    });

    test('review requires all previous steps valid', () {
      expect(
        canContinueFromStageStep(_validDraft(), LeagueStageCreateStep.review),
        isTrue,
      );
      expect(isValidStageForPublish(_validDraft()), isTrue);
    });
  });

  group('review summaries', () {
    test('formats league, location and categories summaries', () {
      final draft = _validDraft();

      expect(
        reviewStageLeagueSummary(draft),
        'Circuito Verão · Etapa 2 de 6',
      );
      expect(
        reviewStageCategoriesSummary(draft),
        'Masc Open · 16 vagas',
      );
    });
  });
}
