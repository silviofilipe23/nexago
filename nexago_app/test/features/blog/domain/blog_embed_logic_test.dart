import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/blog/domain/blog_embed_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

import '../blog_test_tournaments.dart';

void main() {
  final now = DateTime(2026, 11, 5, 10);

  group('status do card do torneio', () {
    test('aberto com prazo: "fecham em N dias"', () {
      final s = blogTournamentCardStatus(
        blogTestTournament(registrationClosesAt: DateTime(2026, 11, 11, 23)),
        now: now,
      );
      expect(s.label, 'Inscrições abertas');
      expect(s.registrationOpen, isTrue);
      expect(s.closesLabel, 'fecham em 6 dias');
    });

    test('fecham hoje / amanhã; sem prazo, sem linha', () {
      expect(blogClosesInLabel(DateTime(2026, 11, 5, 23), now), 'fecham hoje');
      expect(blogClosesInLabel(DateTime(2026, 11, 6, 9), now), 'fecham amanhã');
      final s = blogTournamentCardStatus(blogTestTournament(), now: now);
      expect(s.closesLabel, isNull);
      expect(s.registrationOpen, isTrue);
    });

    test('prazo vencido: encerradas, sem botão de inscrição', () {
      final s = blogTournamentCardStatus(
        blogTestTournament(registrationClosesAt: DateTime(2026, 11, 4)),
        now: now,
      );
      expect(s.label, 'Inscrições encerradas');
      expect(s.registrationOpen, isFalse);
      expect(s.closesLabel, isNull);
    });

    test('antes da abertura: "Inscrições em breve"', () {
      final s = blogTournamentCardStatus(
        blogTestTournament(registrationOpensAt: DateTime(2026, 11, 8)),
        now: now,
      );
      expect(s.label, 'Inscrições em breve');
      expect(s.registrationOpen, isFalse);
    });

    test('status real fora das inscrições', () {
      final s = blogTournamentCardStatus(
        blogTestTournament(
          status: TournamentListingStatus.live,
          listingStatusRaw: 'in_progress',
        ),
        now: now,
      );
      expect(s.label, 'Em andamento');
      expect(s.registrationOpen, isFalse);
    });
  });

  test('rascunho e cancelado não aparecem', () {
    expect(blogTournamentVisible(blogTestTournament()), isTrue);
    expect(
      blogTournamentVisible(blogTestTournament(listingStatusRaw: 'draft')),
      isFalse,
    );
    expect(
      blogTournamentVisible(blogTestTournament(listingStatusRaw: 'cancelled')),
      isFalse,
    );
    expect(blogTournamentVisible(null), isFalse);
  });

  test('vagas só com a contagem real das inscrições', () {
    final t = blogTestTournament();
    expect(blogTournamentSpotsLeft(t, enrollmentByCategoryId: null), isNull);
    expect(
      blogTournamentSpotsLeft(t, enrollmentByCategoryId: {'c1': 10, 'c2': 2}),
      12,
    );
    // Sem categorias: o total do doc, menos o que a contagem achou.
    expect(
      blogTournamentSpotsLeft(
        blogTestTournament(categoryOffers: const []),
        enrollmentByCategoryId: const {'x': 4},
      ),
      20,
    );
  });
}
