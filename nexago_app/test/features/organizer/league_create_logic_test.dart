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
    });
  });

  group('review summaries', () {
    test('stages summary counts defined only', () {
      final draft = _validDraft();
      expect(reviewLeagueStagesSummary(draft), '1 de 2 etapas definidas');
    });
  });
}
