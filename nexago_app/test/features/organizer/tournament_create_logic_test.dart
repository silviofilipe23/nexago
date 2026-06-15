import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_logic.dart';

void main() {
  group('suggestCategoryName', () {
    test('combines gender age and level', () {
      const category = TournamentCategoryDraft(
        id: '1',
        gender: TournamentCategoryGender.male,
        ageBand: TournamentAgeBand.open,
        skillLevel: TournamentSkillLevel.open,
      );
      expect(suggestCategoryName(category), 'Masculino');
    });
  });

  group('canContinueFromStep', () {
    test('identity requires name', () {
      const draft = TournamentCreateDraft();
      expect(canContinueFromStep(draft, TournamentCreateStep.identity), isFalse);

      const valid = TournamentCreateDraft(name: 'Open Test');
      expect(canContinueFromStep(valid, TournamentCreateStep.identity), isTrue);
    });

    test('categories requires at least one category', () {
      const draft = TournamentCreateDraft(name: 'Open');
      expect(canContinueFromStep(draft, TournamentCreateStep.categories), isFalse);

      const withCategory = TournamentCreateDraft(
        name: 'Open',
        categories: [
          TournamentCategoryDraft(id: 'c1', spots: 8),
        ],
      );
      expect(
        canContinueFromStep(withCategory, TournamentCreateStep.categories),
        isTrue,
      );
    });
  });

  group('defaultCategoryPrizes', () {
    test('sums to total cents', () {
      const total = 800000;
      final prizes = defaultCategoryPrizes(total);
      final sum = prizes.fold<int>(0, (s, p) => s + p.valueCents);
      expect(sum, total);
      expect(prizes, hasLength(3));
    });
  });

  group('inferResumeStep', () {
    test('returns first incomplete step', () {
      const draft = TournamentCreateDraft(name: 'Open');
      expect(inferResumeStep(draft), TournamentCreateStep.location);

      final withLocation = TournamentCreateDraft(
        name: 'Open',
        locationName: 'Arena',
        city: 'Goiânia',
        startAt: DateTime(2026, 3, 28),
        endAt: DateTime(2026, 3, 30),
      );
      expect(inferResumeStep(withLocation), TournamentCreateStep.categories);
    });

    test('returns review when all steps valid', () {
      final draft = TournamentCreateDraft(
        name: 'Open',
        locationName: 'Arena',
        city: 'Goiânia',
        startAt: DateTime(2026, 3, 28),
        endAt: DateTime(2026, 3, 30),
        categories: const [TournamentCategoryDraft(id: '1', spots: 16)],
        registrationOpensAt: DateTime(2026, 3, 1),
        registrationClosesAt: DateTime(2026, 3, 26),
        cashPrizesEnabled: false,
      );
      expect(inferResumeStep(draft), TournamentCreateStep.review);
    });
  });

  group('hasMeaningfulLocalDraft', () {
    test('requires non-empty trimmed name', () {
      expect(hasMeaningfulLocalDraft(const TournamentCreateDraft()), isFalse);
      expect(
        hasMeaningfulLocalDraft(const TournamentCreateDraft(name: '  Open  ')),
        isTrue,
      );
    });
  });

  group('categoryFormatSummary', () {
    test('includes bracket and sets', () {
      const category = TournamentCategoryDraft(
        id: '1',
        bracketSystem: TournamentBracketSystem.doubleElimination,
        bestOf: TournamentBestOf.bestOf3,
      );
      expect(categoryFormatSummary(category), 'Dupla eliminatória · MD3');
      expect(categoryFormatCardLabel(category), 'Dupla elim. · MD3');
    });
  });

  group('parseWizardStep', () {
    test('maps legacy format step to categories', () {
      expect(parseWizardStep('format'), TournamentCreateStep.categories);
    });
  });

  group('review summaries', () {
    test('formats categories summary', () {
      const draft = TournamentCreateDraft(
        name: 'Open',
        categories: [
          TournamentCategoryDraft(id: '1', spots: 16),
          TournamentCategoryDraft(id: '2', spots: 12),
        ],
      );
      expect(reviewCategoriesSummary(draft), '2 categorias · 28 vagas no total');
    });
  });

  group('reviewUniformSummary', () {
    test('describes kit and registration fields', () {
      expect(
        reviewUniformSummary(
          const TournamentCreateDraft(uniformRequired: false),
        ),
        'Sem kit na inscrição',
      );
      expect(
        reviewUniformSummary(
          const TournamentCreateDraft(
            uniformRequired: true,
            uniformNumberOnShirt: true,
            uniformNameOnShirt: true,
          ),
        ),
        'Kit na inscrição · número · nome na camisa',
      );
      expect(
        reviewUniformSummary(
          const TournamentCreateDraft(
            uniformRequired: true,
            uniformNumberOnShirt: false,
            uniformNameOnShirt: true,
          ),
        ),
        'Kit na inscrição · nome na camisa',
      );
    });
  });

  group('bracketFormatLabelFromRaw', () {
    test('maps firestore values to friendly portuguese labels', () {
      expect(
        bracketFormatLabelFromRaw('groups_knockout'),
        'Fase de grupos + mata-mata',
      );
      expect(
        bracketFormatShortLabelFromRaw('groups_knockout'),
        'Grupos + SE',
      );
      expect(
        bracketFormatLabelFromRaw('single_elimination'),
        'Mata-mata (chave simples)',
      );
      expect(
        bracketFormatLabelFromRaw('double_elimination'),
        'Dupla eliminatória',
      );
      expect(
        bracketFormatLabelFromRaw('round_robin'),
        'Todos contra todos',
      );
      expect(
        bracketFormatLabelFromRaw('groups_repechage'),
        'Grupos + repescagem',
      );
    });

    test('maps legacy display strings', () {
      expect(
        bracketFormatLabelFromRaw('Pool Play + SE'),
        'Fase de grupos + mata-mata',
      );
      expect(
        bracketFormatLabelFromRaw('Single Elimination'),
        'Mata-mata (chave simples)',
      );
    });
  });
}
