import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  final now = DateTime(2026, 10, 6, 12);

  TournamentReviewInvite invite({
    String id = 't1',
    TournamentReviewInviteStatus status = TournamentReviewInviteStatus.pending,
    DateTime? closesAt,
  }) =>
      TournamentReviewInvite(
        tournamentId: id,
        tournamentName: 'Copa',
        closesAt: closesAt ?? now.add(const Duration(days: 5)),
        status: status,
      );

  group('tournamentReviewCtaState', () {
    test('sem convite não mostra nada', () {
      expect(tournamentReviewCtaState(null, now), TournamentReviewCtaState.none);
    });

    test('pendente e aberto pede a avaliação; enviado e aberto permite editar', () {
      expect(tournamentReviewCtaState(invite(), now), TournamentReviewCtaState.pending);
      expect(
        tournamentReviewCtaState(
            invite(status: TournamentReviewInviteStatus.submitted), now),
        TournamentReviewCtaState.submitted,
      );
    });

    test('closesAt vencido fecha mesmo com o convite ainda pending (job atrasado)', () {
      expect(tournamentReviewCtaState(invite(closesAt: now), now),
          TournamentReviewCtaState.closed);
      expect(
        tournamentReviewCtaState(
            invite(status: TournamentReviewInviteStatus.expired), now),
        TournamentReviewCtaState.closed,
      );
    });
  });

  test('openPendingTournamentReviews: só pendentes abertos, o que fecha antes primeiro', () {
    final list = openPendingTournamentReviews([
      invite(id: 'late', closesAt: now.add(const Duration(days: 9))),
      invite(id: 'vencido', closesAt: now.subtract(const Duration(minutes: 1))),
      invite(id: 'feito', status: TournamentReviewInviteStatus.submitted),
      invite(id: 'soon', closesAt: now.add(const Duration(days: 1))),
    ], now);
    expect(list.map((i) => i.tournamentId), ['soon', 'late']);
  });

  group('tournamentReviewQuestion', () {
    test('o artigo concorda com "torneio", não com o nome', () {
      expect(tournamentReviewQuestion('Liga nexaGO – 1ª etapa'),
          'Como foi o torneio Liga nexaGO – 1ª etapa?');
      expect(tournamentReviewQuestion('Copa VH'), 'Como foi o torneio Copa VH?');
    });

    test('nome vazio e nome que já começa com Torneio', () {
      expect(tournamentReviewQuestion('  '), 'Como foi o torneio?');
      expect(tournamentReviewQuestion('Torneio de Verão'), 'Como foi o Torneio de Verão?');
    });
  });

  test('tournamentReviewRatingLabel', () {
    expect(
      [1, 2, 3, 4, 5].map(tournamentReviewRatingLabel).toList(),
      ['Péssimo', 'Ruim', 'Ok', 'Bom', 'Excelente'],
    );
    expect(tournamentReviewRatingLabel(null), '');
  });

  test('tournamentReviewDayMonth formata dd/MM', () {
    expect(tournamentReviewDayMonth(DateTime(2026, 10, 15, 10)), '15/10');
  });
}
