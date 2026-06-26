import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_logic.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_models.dart';

void main() {
  group('buildTournamentSummary', () {
    test('aggregates KPIs from categories and inscriptions', () {
      final categories = [
        const OrganizerTournamentCategorySummary(
          categoryId: 'masc',
          name: 'Masculino',
          maxTeams: 16,
          enrolledCount: 10,
          paidCount: 8,
          pendingCount: 2,
          collectedCents: 80000,
        ),
      ];
      final summary = buildTournamentSummary(
        tournamentId: 't1',
        data: {'name': 'Copa Teste', 'listingStatus': 'open'},
        categories: categories,
        paidCount: 8,
        pendingCount: 2,
        paymentsBreakdown: const OrganizerPaymentsBreakdown(viaAppCents: 80000),
      );
      expect(summary.name, 'Copa Teste');
      expect(summary.enrolledCount, 8);
      expect(summary.pendingCount, 2);
      expect(summary.collectedCents, 80000);
      expect(summary.categoryCount, 1);
    });
  });

  group('share links', () {
    test('registration link includes inscricao path', () {
      expect(
        organizerTournamentRegistrationShareLink('abc'),
        'nexago:///torneios/abc/inscricao',
      );
    });

    test('registration share message includes name and link', () {
      expect(
        organizerTournamentRegistrationShareMessage(
          tournamentName: 'Open Goiânia',
          tournamentId: 'abc',
        ),
        'Inscreva-se no Open Goiânia no NexaGO:\n'
        'nexago:///torneios/abc/inscricao',
      );
    });
  });

  group('categoryReadyHint', () {
    test('full category ready to generate when paid slots reach max', () {
      const category = OrganizerTournamentCategorySummary(
        categoryId: 'fem',
        name: 'Feminino',
        maxTeams: 8,
        enrolledCount: 8,
        paidCount: 8,
        pendingCount: 0,
      );
      expect(category.isFull, isTrue);
      expect(category.readyToGenerateBracket, isTrue);
      expect(categoryReadyHint(category), contains('pronto'));
    });

    test('pending inscriptions do not mark category as full', () {
      const category = OrganizerTournamentCategorySummary(
        categoryId: 'fem',
        name: 'Feminino',
        maxTeams: 8,
        enrolledCount: 8,
        paidCount: 6,
        pendingCount: 2,
      );
      expect(category.isFull, isFalse);
      expect(category.readyToGenerateBracket, isFalse);
    });
  });

  group('generateBracketBlockedHint', () {
    test('returns unsupported hint before team count', () {
      expect(
        generateBracketBlockedHint(
          confirmedCount: 8,
          bracketFormat: 'round_robin',
        ),
        contains('em breve'),
      );
    });
  });

  group('generateBracketRouteFormat', () {
    test('maps formats to generate routes', () {
      expect(
        generateBracketRouteFormat('double_elimination'),
        'double_elimination',
      );
      expect(generateBracketRouteFormat('groups_knockout'), 'groups_knockout');
      expect(generateBracketRouteFormat('Pool Play + SE'), 'groups_knockout');
      expect(
        generateBracketRouteFormat('single_elimination'),
        'single_elimination',
      );
    });
  });

  group('buildCategorySummary', () {
    test('maps genderType to Portuguese label', () {
      final summary = buildCategorySummary(
        categoryMap: const {
          'id': 'masc',
          'categoryName': 'Open',
          'genderType': 'male',
          'maxTeams': 8,
        },
        paidCount: 0,
        pendingCount: 0,
        collectedCents: 0,
      );
      expect(summary.genderLabel, 'Masculino');
    });
  });

  group('canGenerateCategoryBracket', () {
    test('requires at least two confirmed teams', () {
      expect(canGenerateCategoryBracket(confirmedCount: 0), isFalse);
      expect(canGenerateCategoryBracket(confirmedCount: 1), isFalse);
      expect(canGenerateCategoryBracket(confirmedCount: 2), isTrue);
      expect(
        generateBracketBlockedHint(confirmedCount: 1),
        contains('Falta 1'),
      );
    });
  });

  group('showGenerateBracketCta', () {
    test('hidden when bracket is published', () {
      const category = OrganizerTournamentCategorySummary(
        categoryId: 'open',
        name: 'Open',
        bracketStatus: OrganizerCategoryBracketStatus.published,
      );
      expect(showGenerateBracketCta(category), isFalse);
    });

    test('visible when bracket not published', () {
      const category = OrganizerTournamentCategorySummary(
        categoryId: 'open',
        name: 'Open',
      );
      expect(showGenerateBracketCta(category), isTrue);
    });
  });

  group('showGenerateBracketQuickAction', () {
    test('false when published even with enough teams', () {
      const category = OrganizerTournamentCategorySummary(
        categoryId: 'open',
        name: 'Open',
        bracketFormat: 'single_elimination',
        bracketStatus: OrganizerCategoryBracketStatus.published,
      );
      expect(
        showGenerateBracketQuickAction(
          category: category,
          eligibleConfirmedCount: 8,
        ),
        isFalse,
      );
    });

    test('true when not published and enough confirmed teams', () {
      const category = OrganizerTournamentCategorySummary(
        categoryId: 'open',
        name: 'Open',
        bracketFormat: 'single_elimination',
      );
      expect(
        showGenerateBracketQuickAction(
          category: category,
          eligibleConfirmedCount: 2,
        ),
        isTrue,
      );
    });
  });

  group('organizerTournamentMatchDayVisible', () {
    final start = DateTime(2026, 10, 24, 8);

    test('hidden before tournament day', () {
      expect(
        organizerTournamentMatchDayVisible(
          startAt: start,
          now: DateTime(2026, 10, 23, 23, 59),
        ),
        isFalse,
      );
    });

    test('visible from tournament start day onward', () {
      expect(
        organizerTournamentMatchDayVisible(
          startAt: start,
          now: DateTime(2026, 10, 24, 0, 0),
        ),
        isTrue,
      );
      expect(
        organizerTournamentMatchDayVisible(
          startAt: start,
          now: DateTime(2026, 10, 26, 12),
        ),
        isTrue,
      );
    });

    test('hidden when start date is missing', () {
      expect(organizerTournamentMatchDayVisible(startAt: null), isFalse);
    });
  });

  group('organizerCanAddTournamentCategory', () {
    final start = DateTime(2026, 10, 24, 8);

    test('enabled through the day before tournament start', () {
      expect(
        organizerCanAddTournamentCategory(
          startAt: start,
          now: DateTime(2026, 10, 23, 23, 59),
        ),
        isTrue,
      );
      expect(
        organizerCanAddTournamentCategory(
          startAt: start,
          now: DateTime(2026, 10, 20, 10),
        ),
        isTrue,
      );
    });

    test('disabled from tournament start day onward', () {
      expect(
        organizerCanAddTournamentCategory(
          startAt: start,
          now: DateTime(2026, 10, 24, 0, 0),
        ),
        isFalse,
      );
      expect(
        organizerCanAddTournamentCategory(
          startAt: start,
          now: DateTime(2026, 10, 25, 9),
        ),
        isFalse,
      );
    });

    test('enabled when start date is missing', () {
      expect(organizerCanAddTournamentCategory(startAt: null), isTrue);
    });
  });

  group('organizerTournamentDayScheduleEnabled', () {
    test('enabled when at least one category has published bracket', () {
      const categories = [
        OrganizerTournamentCategorySummary(
          categoryId: 'a',
          name: 'A',
          bracketStatus: OrganizerCategoryBracketStatus.none,
        ),
        OrganizerTournamentCategorySummary(
          categoryId: 'b',
          name: 'B',
          bracketStatus: OrganizerCategoryBracketStatus.published,
        ),
      ];
      expect(organizerTournamentDayScheduleEnabled(categories), isTrue);
    });

    test('disabled when no category has published bracket', () {
      const categories = [
        OrganizerTournamentCategorySummary(
          categoryId: 'a',
          name: 'A',
          bracketStatus: OrganizerCategoryBracketStatus.draft,
        ),
      ];
      expect(organizerTournamentDayScheduleEnabled(categories), isFalse);
      expect(organizerTournamentDayScheduleEnabled(const []), isFalse);
    });
  });

  group('defaultOrganizerDetailTab', () {
    final start = DateTime(2026, 10, 24, 8);
    final end = DateTime(2026, 10, 25, 20);

    test('opens on Partidas during the event window (open status)', () {
      expect(
        defaultOrganizerDetailTab(
          listingStatus: 'open',
          startAt: start,
          endAt: end,
          now: DateTime(2026, 10, 24, 14),
        ),
        OrganizerTournamentDetailTab.matches,
      );
      expect(
        defaultOrganizerDetailTab(
          listingStatus: 'open',
          startAt: start,
          endAt: end,
          now: DateTime(2026, 10, 25, 22),
        ),
        OrganizerTournamentDetailTab.matches,
      );
    });

    test('opens on Categorias before and after the event', () {
      expect(
        defaultOrganizerDetailTab(
          listingStatus: 'open',
          startAt: start,
          endAt: end,
          now: DateTime(2026, 10, 20, 10),
        ),
        OrganizerTournamentDetailTab.categories,
      );
      expect(
        defaultOrganizerDetailTab(
          listingStatus: 'open',
          startAt: start,
          endAt: end,
          now: DateTime(2026, 10, 27, 10),
        ),
        OrganizerTournamentDetailTab.categories,
      );
    });

    test('non-open status or missing date stays on Categorias', () {
      expect(
        defaultOrganizerDetailTab(
          listingStatus: 'draft',
          startAt: start,
          now: DateTime(2026, 10, 24, 14),
        ),
        OrganizerTournamentDetailTab.categories,
      );
      expect(
        defaultOrganizerDetailTab(
          listingStatus: 'open',
          startAt: null,
          now: DateTime(2026, 10, 24, 14),
        ),
        OrganizerTournamentDetailTab.categories,
      );
    });
  });

  group('organizerExploreSubtitles', () {
    test('categories subtitle pluralizes correctly', () {
      expect(organizerExploreCategoriesSubtitle(1), '1 categoria');
      expect(organizerExploreCategoriesSubtitle(4), '4 categorias');
    });

    test('overview subtitle includes registration and date', () {
      const summary = OrganizerTournamentSummary(
        tournamentId: 't1',
        name: 'Test',
        listingStatus: 'open',
        dateLabel: '24 out',
      );
      expect(
        organizerExploreOverviewSubtitle(summary),
        'Inscrições abertas · 24 out',
      );
    });

    test('financial subtitle handles zero and positive amounts', () {
      expect(
        organizerExploreFinancialSubtitle(const OrganizerPaymentsBreakdown()),
        'Nenhum pagamento ainda',
      );
      expect(
        organizerExploreFinancialSubtitle(
          const OrganizerPaymentsBreakdown(viaAppCents: 3000200),
        ),
        contains('arrecadado'),
      );
      expect(
        organizerExploreFinancialSubtitle(
          const OrganizerPaymentsBreakdown(
            viaAppCents: 10000,
            viaOrganizerCents: 5000,
          ),
        ),
        contains('direto'),
      );
    });

    test('matches subtitle handles empty, live and totals', () {
      expect(
        organizerExploreMatchesSubtitle(total: 0, live: 0),
        'Operação do dia',
      );
      expect(
        organizerExploreMatchesSubtitle(total: 12, live: 2),
        '12 partidas · 2 ao vivo',
      );
      expect(
        organizerExploreMatchesSubtitle(total: 1, live: 0),
        '1 partida',
      );
    });

    test('uniforms subtitle handles pending states', () {
      expect(
        organizerExploreUniformsSubtitle(
          pendingCount: 0,
          totalAthletes: 0,
        ),
        'Aguardando inscrições',
      );
      expect(
        organizerExploreUniformsSubtitle(
          pendingCount: 3,
          totalAthletes: 10,
        ),
        '3 pendentes',
      );
      expect(
        organizerExploreUniformsSubtitle(
          pendingCount: 0,
          totalAthletes: 10,
        ),
        'Todos confirmados',
      );
    });
  });

  group('friendlyTournamentOpsError', () {
    test('interpolates the action into auth/permission messages', () {
      expect(
        friendlyTournamentOpsError(
          action: 'cancelar o torneio',
          code: 'permission-denied',
        ),
        'Você não tem permissão para cancelar o torneio.',
      );
      expect(
        friendlyTournamentOpsError(
          action: 'encerrar as inscrições',
          code: 'unauthenticated',
        ),
        contains('encerrar as inscrições'),
      );
    });

    test('passes through server PT message on failed-precondition', () {
      expect(
        friendlyTournamentOpsError(
          action: 'cancelar o torneio',
          code: 'failed-precondition',
          message: 'O torneio já começou.',
        ),
        'O torneio já começou.',
      );
    });

    test('maps network codes and falls back for unknown/null', () {
      expect(
        friendlyTournamentOpsError(
          action: 'cancelar o torneio',
          code: 'unavailable',
        ),
        contains('conexão'),
      );
      expect(
        friendlyTournamentOpsError(action: 'cancelar o torneio'),
        'Não foi possível cancelar o torneio. Tente novamente.',
      );
    });
  });
}
