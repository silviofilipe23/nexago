import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/league_create/league_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/league_create/league_create_logic.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';

LeagueCreateDraft _validDraft() {
  return LeagueCreateDraft(
    name: 'Copa Goiás Beach',
    seasonStartAt: DateTime(2026, 2, 1),
    seasonEndAt: DateTime(2026, 10, 1),
    plannedStagesCount: 6,
    categories: const [
      TournamentCategoryDraft(id: 'c1', spots: 16),
    ],
    stages: [
      const LeagueStageDraft(
        id: 's1',
        name: 'Etapa 1',
        order: 1,
        status: LeagueStageStatus.defined,
        locationName: 'Arena',
        city: 'Goiânia',
      ),
      const LeagueStageDraft(
        id: 's2',
        name: 'Etapa 2',
        order: 2,
        status: LeagueStageStatus.pending,
      ),
    ],
  );
}

void main() {
  group('canContinueFromLeagueStep', () {
    test('identity requires name', () {
      const draft = LeagueCreateDraft();
      expect(
        canContinueFromLeagueStep(draft, LeagueCreateStep.identity),
        isFalse,
      );

      const valid = LeagueCreateDraft(name: 'Copa');
      expect(
        canContinueFromLeagueStep(valid, LeagueCreateStep.identity),
        isTrue,
      );
    });

    test('season requires valid range and planned stages', () {
      const draft = LeagueCreateDraft(
        name: 'Copa',
        seasonStartAt: null,
      );
      expect(
        canContinueFromLeagueStep(draft, LeagueCreateStep.season),
        isFalse,
      );

      final valid = LeagueCreateDraft(
        name: 'Copa',
        seasonStartAt: DateTime(2026, 2, 1),
        seasonEndAt: DateTime(2026, 10, 1),
        plannedStagesCount: 6,
      );
      expect(
        canContinueFromLeagueStep(valid, LeagueCreateStep.season),
        isTrue,
      );
    });

    test('season rejects fewer than 2 planned stages and bad range', () {
      const onlyOne = LeagueCreateDraft(
        name: 'Copa',
        plannedStagesCount: 1,
      );
      expect(
        canContinueFromLeagueStep(
          onlyOne.copyWith(
            seasonStartAt: DateTime(2026, 2, 1),
            seasonEndAt: DateTime(2026, 10, 1),
          ),
          LeagueCreateStep.season,
        ),
        isFalse,
      );

      final endBeforeStart = const LeagueCreateDraft(name: 'Copa').copyWith(
        seasonStartAt: DateTime(2026, 10, 1),
        seasonEndAt: DateTime(2026, 2, 1),
        plannedStagesCount: 6,
      );
      expect(
        canContinueFromLeagueStep(endBeforeStart, LeagueCreateStep.season),
        isFalse,
      );
    });

    test('stages requires at least one stage', () {
      const draft = LeagueCreateDraft(name: 'Copa');
      expect(
        canContinueFromLeagueStep(draft, LeagueCreateStep.stages),
        isFalse,
      );

      const withStages = LeagueCreateDraft(
        name: 'Copa',
        stages: [
          LeagueStageDraft(id: 's1', name: 'Etapa 1', order: 1),
        ],
      );
      expect(
        canContinueFromLeagueStep(withStages, LeagueCreateStep.stages),
        isTrue,
      );
    });

    test('ranking requires grand final spots and valid wildcard', () {
      const noSpots = LeagueCreateDraft(grandFinalSpots: 0);
      expect(
        canContinueFromLeagueStep(noSpots, LeagueCreateStep.ranking),
        isFalse,
      );

      const wildcardOnNoSpots = LeagueCreateDraft(
        grandFinalSpots: 8,
        wildcardEnabled: true,
        wildcardSpots: 0,
      );
      expect(
        canContinueFromLeagueStep(wildcardOnNoSpots, LeagueCreateStep.ranking),
        isFalse,
      );

      const wildcardOff = LeagueCreateDraft(
        grandFinalSpots: 8,
        wildcardEnabled: false,
        wildcardSpots: 0,
      );
      expect(
        canContinueFromLeagueStep(wildcardOff, LeagueCreateStep.ranking),
        isTrue,
      );

      const wildcardOnWithSpots = LeagueCreateDraft(
        grandFinalSpots: 8,
        wildcardEnabled: true,
        wildcardSpots: 2,
      );
      expect(
        canContinueFromLeagueStep(
          wildcardOnWithSpots,
          LeagueCreateStep.ranking,
        ),
        isTrue,
      );
    });
  });

  group('inferLeagueResumeStep', () {
    test('returns first incomplete step', () {
      const draft = LeagueCreateDraft(name: 'Copa');
      expect(inferLeagueResumeStep(draft), LeagueCreateStep.season);
    });

    test('returns review when all steps valid', () {
      expect(inferLeagueResumeStep(_validDraft()), LeagueCreateStep.review);
    });
  });

  group('buildDefaultLeagueStages', () {
    test('includes grand final when enabled', () {
      const draft = LeagueCreateDraft(
        plannedStagesCount: 4,
        grandFinalEnabled: true,
      );
      final stages = buildDefaultLeagueStages(draft);
      expect(stages, hasLength(5));
      expect(stages.last.isGrandFinal, isTrue);
      expect(stages.last.order, 5);
    });

    test('omits grand final when disabled', () {
      const draft = LeagueCreateDraft(
        plannedStagesCount: 4,
        grandFinalEnabled: false,
      );
      final stages = buildDefaultLeagueStages(draft);
      expect(stages, hasLength(4));
      expect(stages.any((s) => s.isGrandFinal), isFalse);
    });

    test('clamps planned stages between 2 and 12', () {
      final tooMany = buildDefaultLeagueStages(
        const LeagueCreateDraft(plannedStagesCount: 20, grandFinalEnabled: false),
      );
      expect(tooMany, hasLength(12));

      final tooFew = buildDefaultLeagueStages(
        const LeagueCreateDraft(plannedStagesCount: 1, grandFinalEnabled: false),
      );
      expect(tooFew, hasLength(2));
    });
  });

  group('effectiveRankingPoints', () {
    test('uses custom points when provided', () {
      const draft = LeagueCreateDraft(
        rankingPointsByPlace: {'1': 1000, '2': 600},
      );
      expect(effectiveRankingPoints(draft), {'1': 1000, '2': 600});
    });

    test('falls back to default when empty', () {
      const draft = LeagueCreateDraft();
      expect(effectiveRankingPoints(draft), defaultLeagueRankingPoints);
    });
  });

  group('isValidLeagueForPublish', () {
    test('requires at least one defined stage', () {
      const pendingOnly = LeagueCreateDraft(
        name: 'Copa',
        seasonStartAt: null,
      );
      expect(isValidLeagueForPublish(pendingOnly), isFalse);

      final withDefined = _validDraft();
      expect(isValidLeagueForPublish(withDefined), isTrue);

      final allPending = LeagueCreateDraft(
        name: 'Copa Goiás Beach',
        seasonStartAt: DateTime(2026, 2, 1),
        seasonEndAt: DateTime(2026, 10, 1),
        plannedStagesCount: 6,
        categories: const [
          TournamentCategoryDraft(id: 'c1', spots: 16),
        ],
        stages: const [
          LeagueStageDraft(
            id: 's1',
            name: 'Etapa 1',
            order: 1,
            status: LeagueStageStatus.pending,
          ),
        ],
      );
      expect(isValidLeagueForPublish(allPending), isFalse);
    });

    test('rejects category with unsupported bracket system', () {
      final draft = _validDraft().copyWith(
        categories: const [
          TournamentCategoryDraft(
            id: 'c1',
            spots: 16,
            bracketSystem: TournamentBracketSystem.roundRobin,
          ),
        ],
      );
      expect(isValidLeagueForPublish(draft), isFalse);
    });
  });

  group('review summaries', () {
    test('stages summary counts defined only', () {
      final draft = _validDraft();
      expect(reviewLeagueStagesSummary(draft), '1 de 2 etapas definidas');
    });
  });
}
