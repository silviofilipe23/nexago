import 'package:flutter_test/flutter_test.dart';
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
        collectedCents: 80000,
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
        'Inscreva-se no Open Goiânia no nexaGO:\n'
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
