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
        'Inscreva-se no Open Goiânia no NexaGO:\n'
        'nexago:///torneios/abc/inscricao',
      );
    });
  });

  group('categoryReadyHint', () {
    test('full category ready to generate', () {
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
  });
}
