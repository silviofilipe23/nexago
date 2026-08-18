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

    test('equipe (trio+) prefixa o formato no nome', () {
      const trioMisto = TournamentCategoryDraft(
        id: '1',
        dispute: TournamentCategoryDispute.trio,
        gender: TournamentCategoryGender.mixed,
      );
      expect(suggestCategoryName(trioMisto), startsWith('Trio'));
      expect(suggestCategoryName(trioMisto), 'Trio Misto');
    });

    test('equipe genderFree usa Livre no lugar do gênero', () {
      const quartetoLivre = TournamentCategoryDraft(
        id: '1',
        dispute: TournamentCategoryDispute.quarteto,
        genderFree: true,
      );
      expect(suggestCategoryName(quartetoLivre), contains('Livre'));
      expect(suggestCategoryName(quartetoLivre), 'Quarteto Livre');
    });
  });

  group('skillLevelOptionsForSport', () {
    test('editor oferece a escada de 7', () {
      final options = skillLevelOptionsForSport(TournamentSport.beachVolleyball);
      expect(options.length, 7);
      expect(skillLevelLabel(TournamentSkillLevel.avancado1), 'Avançado 1');
      expect(skillLevelLabel(TournamentSkillLevel.avancado2), 'Avançado 2');
    });
  });

  group('categoryLevelPresets', () {
    test('presets de faixa espelham a tabela canônica', () {
      final byLabel = {for (final p in categoryLevelPresets) p.label: p};
      expect(byLabel['Open']!.minLevel, 'Avançado 1');
      expect(byLabel['Open']!.maxSkillLevel, TournamentSkillLevel.open);
      expect(byLabel['Elite']!.minLevel, 'Open');
      expect(byLabel['Elite']!.maxSkillLevel, TournamentSkillLevel.open);
      expect(byLabel['Livre']!.minLevel, 'Iniciante 1');
      expect(byLabel['Avançado']!.maxSkillLevel, TournamentSkillLevel.avancado2);
      expect(categoryLevelPresets, hasLength(6));
    });
  });

  group('activeCategoryLevelPreset', () {
    test('casa faixa exata e devolve null pra legado', () {
      final draft = emptyCategoryDraft('c1').copyWith(
        skillLevel: TournamentSkillLevel.open,
        minLevel: 'Avançado 1',
      );
      expect(activeCategoryLevelPreset(draft), 'Open');
      expect(
        activeCategoryLevelPreset(draft.copyWith(minLevel: '')),
        isNull, // sem piso = legado, nunca um preset
      );
      expect(
        activeCategoryLevelPreset(draft.copyWith(minLevel: 'Open')),
        'Elite',
      );
    });
  });

  group('emptyCategoryDraft', () {
    test('categoria nova nasce num preset real (Livre), nunca em faixa legada', () {
      final draft = emptyCategoryDraft('c1');
      expect(activeCategoryLevelPreset(draft), 'Livre');
      expect(draft.minLevel, 'Iniciante 1');
      expect(draft.skillLevel, TournamentSkillLevel.open);
    });
  });

  group('labels de disputa de equipe', () {
    test('categoryDisputeLabel mapeia trio/quarteto/quinteto', () {
      expect(categoryDisputeLabel(TournamentCategoryDispute.trio), 'Trio');
      expect(
        categoryDisputeLabel(TournamentCategoryDispute.quarteto),
        'Quarteto',
      );
      expect(
        categoryDisputeLabel(TournamentCategoryDispute.quinteto),
        'Quinteto',
      );
    });

    test('spotsUnitLabel usa equipe(s) para trio+', () {
      expect(spotsUnitLabel(TournamentCategoryDispute.trio, 8), '8 equipes');
      expect(spotsUnitLabel(TournamentCategoryDispute.quinteto, 1), '1 equipe');
      expect(spotsUnitLabel(TournamentCategoryDispute.dupla, 8), '8 duplas');
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

  group('canContinueFromStep location', () {
    TournamentCreateDraft draft({
      String city = 'Goiânia',
      String location = 'Arena',
      DateTime? start,
      DateTime? end,
      int courts = 4,
    }) {
      return TournamentCreateDraft(
        name: 'Open',
        city: city,
        locationName: location,
        startAt: start ?? DateTime(2026, 3, 28),
        endAt: end ?? DateTime(2026, 3, 30),
        courtsCount: courts,
      );
    }

    test('valid location passes', () {
      expect(
        canContinueFromStep(draft(), TournamentCreateStep.location),
        isTrue,
      );
    });

    test('allows same-day start and end', () {
      final d = draft(start: DateTime(2026, 3, 28), end: DateTime(2026, 3, 28));
      expect(canContinueFromStep(d, TournamentCreateStep.location), isTrue);
    });

    test('rejects end before start', () {
      final d = draft(start: DateTime(2026, 3, 30), end: DateTime(2026, 3, 28));
      expect(canContinueFromStep(d, TournamentCreateStep.location), isFalse);
    });

    test('rejects blank city or location', () {
      expect(
        canContinueFromStep(draft(city: '   '), TournamentCreateStep.location),
        isFalse,
      );
      expect(
        canContinueFromStep(
          draft(location: ''),
          TournamentCreateStep.location,
        ),
        isFalse,
      );
    });

    test('rejects zero courts', () {
      expect(
        canContinueFromStep(draft(courts: 0), TournamentCreateStep.location),
        isFalse,
      );
    });
  });

  group('canContinueFromStep registration', () {
    test('valid window passes', () {
      final d = TournamentCreateDraft(
        registrationOpensAt: DateTime(2026, 3, 1),
        registrationClosesAt: DateTime(2026, 3, 20),
      );
      expect(canContinueFromStep(d, TournamentCreateStep.registration), isTrue);
    });

    test('allows opens == closes', () {
      final d = TournamentCreateDraft(
        registrationOpensAt: DateTime(2026, 3, 1),
        registrationClosesAt: DateTime(2026, 3, 1),
      );
      expect(canContinueFromStep(d, TournamentCreateStep.registration), isTrue);
    });

    test('rejects closes before opens', () {
      final d = TournamentCreateDraft(
        registrationOpensAt: DateTime(2026, 3, 20),
        registrationClosesAt: DateTime(2026, 3, 1),
      );
      expect(
        canContinueFromStep(d, TournamentCreateStep.registration),
        isFalse,
      );
    });

    test('rejects missing dates', () {
      expect(
        canContinueFromStep(
          const TournamentCreateDraft(),
          TournamentCreateStep.registration,
        ),
        isFalse,
      );
    });

    test('rejects registration closing after the tournament start', () {
      final d = TournamentCreateDraft(
        startAt: DateTime(2026, 5, 10),
        endAt: DateTime(2026, 5, 12),
        registrationOpensAt: DateTime(2026, 5, 1),
        registrationClosesAt: DateTime(2026, 5, 11), // depois do início
      );
      expect(
        canContinueFromStep(d, TournamentCreateStep.registration),
        isFalse,
      );
      expect(
        registrationWindowError(d),
        contains('depois do início'),
      );
    });

    test('allows registration closing on the start day', () {
      final d = TournamentCreateDraft(
        startAt: DateTime(2026, 5, 10),
        registrationOpensAt: DateTime(2026, 5, 1),
        registrationClosesAt: DateTime(2026, 5, 10),
      );
      expect(registrationWindowError(d), isNull);
      expect(
        canContinueFromStep(d, TournamentCreateStep.registration),
        isTrue,
      );
    });
  });

  group('buildExpressTournamentDraft', () {
    final now = DateTime(2026, 5, 1);

    test('produces a draft valid for immediate publish', () {
      final draft = buildExpressTournamentDraft(
        name: '  Open Goiânia  ',
        locationName: 'Arena Beach',
        city: 'Goiânia',
        state: 'GO',
        startAt: DateTime(2026, 6, 6),
        now: now,
      );

      expect(isValidForPublish(draft), isTrue);
      expect(draft.name, 'Open Goiânia');
      expect(draft.cashPrizesEnabled, isFalse);
      expect(draft.categories, hasLength(1));
      expect(draft.courtsCount, 4);
      // Inscrições abrem hoje e fecham no início.
      expect(draft.registrationOpensAt, DateTime(2026, 5, 1));
      expect(draft.registrationClosesAt, DateTime(2026, 6, 6));
      // Fim padrão = início quando não informado.
      expect(draft.endAt, DateTime(2026, 6, 6));
      // Categoria expressa também nasce no preset Livre (mesmo invariante
      // do editor manual) em vez de faixa legada sem piso.
      expect(
        activeCategoryLevelPreset(draft.categories.single),
        'Livre',
      );
    });

    test('keeps a valid multi-day range and clamps inverted end', () {
      final ok = buildExpressTournamentDraft(
        name: 'X',
        locationName: 'Arena',
        city: 'Goiânia',
        startAt: DateTime(2026, 6, 6),
        endAt: DateTime(2026, 6, 8),
        now: now,
      );
      expect(ok.endAt, DateTime(2026, 6, 8));

      final clamped = buildExpressTournamentDraft(
        name: 'X',
        locationName: 'Arena',
        city: 'Goiânia',
        startAt: DateTime(2026, 6, 6),
        endAt: DateTime(2026, 6, 1), // antes do início → vira início
        now: now,
      );
      expect(clamped.endAt, DateTime(2026, 6, 6));
    });
  });

  group('registrationWindowError', () {
    test('is null when dates are incomplete', () {
      expect(registrationWindowError(const TournamentCreateDraft()), isNull);
    });

    test('flags close before open', () {
      final d = TournamentCreateDraft(
        registrationOpensAt: DateTime(2026, 5, 10),
        registrationClosesAt: DateTime(2026, 5, 1),
      );
      expect(registrationWindowError(d), contains('antes da abertura'));
    });
  });

  group('canContinueFromStep prizes', () {
    test('cash prizes disabled always passes', () {
      const d = TournamentCreateDraft(
        cashPrizesEnabled: false,
        categories: [TournamentCategoryDraft(id: 'c1')],
      );
      expect(canContinueFromStep(d, TournamentCreateStep.prizes), isTrue);
    });

    test('cash enabled requires every category to have prizes', () {
      const withPrize = TournamentCreateDraft(
        cashPrizesEnabled: true,
        categories: [
          TournamentCategoryDraft(
            id: 'c1',
            prizes: [TournamentCategoryPrizeDraft(position: '1', valueCents: 1)],
          ),
        ],
      );
      expect(
        canContinueFromStep(withPrize, TournamentCreateStep.prizes),
        isTrue,
      );

      const missingPrize = TournamentCreateDraft(
        cashPrizesEnabled: true,
        categories: [TournamentCategoryDraft(id: 'c1')],
      );
      expect(
        canContinueFromStep(missingPrize, TournamentCreateStep.prizes),
        isFalse,
      );
    });

    test('rules step no longer blocks on prizes', () {
      const missingPrize = TournamentCreateDraft(
        cashPrizesEnabled: true,
        categories: [TournamentCategoryDraft(id: 'c1')],
      );
      expect(
        canContinueFromStep(missingPrize, TournamentCreateStep.rules),
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

    test('splits 50/31.25 in whole reais with remainder to third', () {
      final prizes = defaultCategoryPrizes(100000);
      expect(prizes[0].valueCents, 50000);
      expect(prizes[1].valueCents, 31300);
      expect(prizes[2].valueCents, 18700);
    });

    test('shares are whole reais when the total is', () {
      final prizes = defaultCategoryPrizes(800000);
      for (final prize in prizes) {
        expect(prize.valueCents % 100, 0);
      }
    });

    test('odd total still sums exactly to total', () {
      final prizes = defaultCategoryPrizes(99999);
      final sum = prizes.fold<int>(0, (s, p) => s + p.valueCents);
      expect(sum, 99999);
    });

    test('returns empty for zero or negative total', () {
      expect(defaultCategoryPrizes(0), isEmpty);
      expect(defaultCategoryPrizes(-100), isEmpty);
    });
  });

  group('defaultPrizeLabelForPosition', () {
    test('maps podium labels and falls back to Nº lugar', () {
      expect(defaultPrizeLabelForPosition(1), 'Campeão');
      expect(defaultPrizeLabelForPosition(2), 'Vice-campeão');
      expect(defaultPrizeLabelForPosition(3), 'Terceiro lugar');
      expect(defaultPrizeLabelForPosition(4), '4º lugar');
      expect(defaultPrizeLabelForPosition(10), '10º lugar');
    });
  });

  group('nextPrizeDraft', () {
    test('empty list starts at first place', () {
      final next = nextPrizeDraft(const []);
      expect(next.position, '1');
      expect(next.label, 'Campeão');
      expect(next.valueCents, 0);
    });

    test('follows the highest existing position', () {
      final next = nextPrizeDraft(defaultCategoryPrizes(100000));
      expect(next.position, '4');
      expect(next.label, '4º lugar');
      expect(next.valueCents, 0);
    });

    test('non numeric positions fall back to first place', () {
      const prizes = [
        TournamentCategoryPrizeDraft(position: 'ouro', valueCents: 100),
      ];
      final next = nextPrizeDraft(prizes);
      expect(next.position, '1');
    });
  });

  group('prizeListTotalCents', () {
    test('sums value cents', () {
      expect(prizeListTotalCents(const []), 0);
      expect(prizeListTotalCents(defaultCategoryPrizes(100000)), 100000);
    });
  });

  group('reviewPrizesSummary', () {
    test('reflects the highest placement count across categories', () {
      final draft = TournamentCreateDraft(
        cashPrizesEnabled: true,
        categories: [
          TournamentCategoryDraft(
            id: 'c1',
            prizes: [
              ...defaultCategoryPrizes(100000),
              nextPrizeDraft(defaultCategoryPrizes(100000)),
            ],
          ),
          const TournamentCategoryDraft(id: 'c2'),
        ],
      );
      expect(reviewPrizesSummary(draft), contains('1º ao 4º'));
    });

    test('omits the placement range with a single placement', () {
      const draft = TournamentCreateDraft(
        cashPrizesEnabled: true,
        categories: [
          TournamentCategoryDraft(
            id: 'c1',
            prizes: [
              TournamentCategoryPrizeDraft(position: '1', valueCents: 100000),
            ],
          ),
        ],
      );
      expect(reviewPrizesSummary(draft), isNot(contains('1º ao')));
    });
  });

  group('bracketSystemFromRaw', () {
    test('parses enum names', () {
      for (final system in TournamentBracketSystem.values) {
        expect(bracketSystemFromRaw(system.name), system);
      }
    });

    test('returns null for empty or junk', () {
      expect(bracketSystemFromRaw(''), isNull);
      expect(bracketSystemFromRaw('   '), isNull);
      expect(bracketSystemFromRaw('xpto'), isNull);
    });

    test('maps firestore and legacy aliases', () {
      expect(
        bracketSystemFromRaw('groups_then_knockout'),
        TournamentBracketSystem.groupsThenKnockout,
      );
      expect(
        bracketSystemFromRaw('pool play+se'),
        TournamentBracketSystem.groupsThenKnockout,
      );
      expect(
        bracketSystemFromRaw('single elimination'),
        TournamentBracketSystem.singleElimination,
      );
      expect(
        bracketSystemFromRaw('double elimination'),
        TournamentBracketSystem.doubleElimination,
      );
    });

    test('uses heuristics for free-form strings', () {
      expect(
        bracketSystemFromRaw('Grupos + mata-mata'),
        TournamentBracketSystem.groupsThenKnockout,
      );
      expect(
        bracketSystemFromRaw('play-in'),
        TournamentBracketSystem.groupsThenKnockout,
      );
      expect(
        bracketSystemFromRaw('Dupla eliminatória'),
        TournamentBracketSystem.doubleElimination,
      );
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

    test('maps prizes to its own step', () {
      expect(parseWizardStep('prizes'), TournamentCreateStep.prizes);
    });
  });

  group('wizard steps', () {
    test('has 7 steps with prizes as a dedicated step', () {
      expect(TournamentCreateStepX.total, 7);
      expect(
        TournamentCreateStep.values,
        contains(TournamentCreateStep.prizes),
      );
      expect(
        TournamentCreateStep.values.indexOf(TournamentCreateStep.prizes),
        TournamentCreateStep.values.indexOf(TournamentCreateStep.rules) - 1,
      );
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

  group('supportedBracketSystems', () {
    test('lists only implemented formats', () {
      expect(supportedBracketSystems, [
        TournamentBracketSystem.groupsThenKnockout,
        TournamentBracketSystem.singleElimination,
        TournamentBracketSystem.doubleElimination,
      ]);
    });

    test('blocks publish when category uses round robin', () {
      const draft = TournamentCreateDraft(
        name: 'Copa',
        categories: const [
          TournamentCategoryDraft(
            id: '1',
            name: 'Open',
            bracketSystem: TournamentBracketSystem.roundRobin,
          ),
        ],
      );
      expect(isValidForPublish(draft), isFalse);
      expect(
        publishBlockReasonForUnsupportedBrackets(draft),
        contains('Todos contra todos'),
      );
    });

    test('unsupportedBracketFormatHint for round_robin', () {
      expect(
        unsupportedBracketFormatHint('round_robin'),
        contains('em breve'),
      );
      expect(unsupportedBracketFormatHint('groups_knockout'), isNull);
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

  group('wizard exit dialog copy', () {
    test('tournamentWizardDiscardSubtitle adapts to category count', () {
      expect(tournamentWizardDiscardSubtitle(0), 'Apaga os dados preenchidos.');
      expect(
        tournamentWizardDiscardSubtitle(1),
        'Apaga a categoria e os dados preenchidos.',
      );
      expect(
        tournamentWizardDiscardSubtitle(3),
        'Apaga as 3 categorias e os dados preenchidos.',
      );
    });

    test('tournamentWizardExitCategoryHighlight formats count', () {
      expect(tournamentWizardExitCategoryHighlight(0), '');
      expect(tournamentWizardExitCategoryHighlight(1), '1 categoria');
      expect(tournamentWizardExitCategoryHighlight(3), '3 categorias');
    });
  });
}
