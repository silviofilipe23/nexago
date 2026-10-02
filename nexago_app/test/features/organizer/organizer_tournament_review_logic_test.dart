import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_logic.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  final now = DateTime(2026, 10, 6, 12);

  TournamentReviewSummary summary({
    int count = 23,
    int eligible = 42,
    double? average = 4.62,
    bool open = true,
    DateTime? closesAt,
  }) =>
      TournamentReviewSummary(
        tournamentId: 't1',
        tournamentName: 'Copa Aurora',
        isOpen: open,
        eligibleCount: eligible,
        count: count,
        average: average,
        closesAt: closesAt ?? DateTime(2026, 10, 15, 10),
      );

  test('números públicos só com 3+ e média presente', () {
    expect(tournamentReviewHasPublicNumbers(summary()), isTrue);
    expect(tournamentReviewHasPublicNumbers(summary(count: 2, average: null)), isFalse);
    expect(tournamentReviewHasPublicNumbers(summary(average: null)), isFalse);
  });

  test('média com uma casa e vírgula; contagem e taxa de resposta', () {
    expect(formatTournamentReviewAverage(4.62), '4,6');
    expect(formatTournamentReviewAverage(4), '4,0');
    expect(tournamentReviewsCountLabel(1), '1 avaliação');
    expect(tournamentReviewsCountLabel(23), '23 avaliações');
    expect(tournamentReviewsResponseRate(summary()), '23 de 42 atletas');
  });

  group('janela', () {
    test('aberta até dd/MM enquanto closesAt está no futuro', () {
      expect(isTournamentReviewWindowOpen(summary(), now), isTrue);
      expect(tournamentReviewsWindowLabel(summary(), now), 'Aberta até 15/10');
    });

    test('status open com closesAt vencido (job atrasado) já é Encerrada', () {
      final late = summary(closesAt: now.subtract(const Duration(minutes: 1)));
      expect(isTournamentReviewWindowOpen(late, now), isFalse);
      expect(tournamentReviewsWindowLabel(late, now), 'Encerrada');
    });

    test('fechada é Encerrada', () {
      expect(tournamentReviewsWindowLabel(summary(open: false), now), 'Encerrada');
    });
  });

  test('texto de quem ainda não tem 3 avaliações, inclusive sem elegíveis', () {
    expect(
      tournamentReviewsCollectingText(summary(count: 2, average: null)),
      '2 de 42 atletas avaliaram. As notas aparecem a partir de 3 avaliações.',
    );
    expect(
      tournamentReviewsCollectingText(summary(count: 0, eligible: 0, average: null)),
      'Nenhum atleta ficou apto a avaliar este torneio.',
    );
  });

  test('subtítulo do card no hub', () {
    expect(organizerReviewsCardSubtitle(null), 'Notas dos atletas depois do torneio');
    expect(organizerReviewsCardSubtitle(summary(count: 2, average: null)), '2 de 42 atletas avaliaram');
    expect(
      organizerReviewsCardSubtitle(summary(count: 0, eligible: 0, average: null)),
      'Nenhum atleta apto a avaliar',
    );
    expect(organizerReviewsCardSubtitle(summary()), '4,6 ★ (23)');
  });

  group('tournamentReviewsEmptyState', () {
    Timestamp at(Duration offset) => Timestamp.fromDate(now.add(offset));

    test('torneio por vir ou rascunho', () {
      expect(
        tournamentReviewsEmptyState({'listingStatus': 'open', 'endAt': at(const Duration(days: 2))}, now),
        TournamentReviewsEmptyState.notEnded,
      );
      expect(tournamentReviewsEmptyState({'status': 'draft'}, now), TournamentReviewsEmptyState.notEnded);
    });

    test('terminou há até 3 dias: o job das 10h ainda abre', () {
      expect(
        tournamentReviewsEmptyState({'listingStatus': 'closed', 'endAt': at(const Duration(hours: -20))}, now),
        TournamentReviewsEmptyState.opening,
      );
      expect(
        tournamentReviewsEmptyState({
          'listingStatus': 'completed',
          'completedAt': at(const Duration(days: -1)),
          'endAt': at(const Duration(days: -40)),
        }, now),
        TournamentReviewsEmptyState.opening,
      );
      expect(tournamentReviewsEmptyState({'listingStatus': 'completed'}, now), TournamentReviewsEmptyState.opening);
    });

    test('terminou há mais de 3 dias sem resumo', () {
      expect(
        tournamentReviewsEmptyState({'listingStatus': 'completed', 'completedAt': at(const Duration(days: -30))}, now),
        TournamentReviewsEmptyState.endedBefore,
      );
      expect(
        tournamentReviewsEmptyState({'listingStatus': 'closed', 'endAt': at(const Duration(days: -4))}, now),
        TournamentReviewsEmptyState.endedBefore,
      );
    });

    test('cancelado nunca recebe avaliação', () {
      expect(
        tournamentReviewsEmptyState({'listingStatus': 'cancelled', 'endAt': at(const Duration(days: -1))}, now),
        TournamentReviewsEmptyState.cancelled,
      );
    });

    test('textos, na ordem do enum', () {
      expect(TournamentReviewsEmptyState.values.map(tournamentReviewsEmptyText).toList(), [
        'A avaliação abre quando o torneio terminar.',
        'O torneio terminou. O pedido de avaliação sai para os atletas às 10h.',
        'Este torneio terminou antes de as avaliações existirem.',
        'Torneio cancelado não recebe avaliações.',
      ]);
    });
  });

  test('aspectos do mais fraco ao mais forte; empate na ordem da lista', () {
    final rows = tournamentReviewAspectRows({
      TournamentReviewAspect.prizes: const TournamentReviewAspectStat(count: 5, average: 3.4),
      TournamentReviewAspect.organization: const TournamentReviewAspectStat(count: 20, average: 4.8),
      TournamentReviewAspect.schedule: const TournamentReviewAspectStat(count: 18, average: 3.4),
      TournamentReviewAspect.venue: const TournamentReviewAspectStat(count: 1, average: 4),
    });
    expect(rows.map((r) => r.aspect), [
      TournamentReviewAspect.schedule,
      TournamentReviewAspect.prizes,
      TournamentReviewAspect.venue,
      TournamentReviewAspect.organization,
    ]);
    expect(rows.first.label, 'Cumprimento dos horários');
    expect(rows.first.valueText, '3,4 · 18 notas');
    expect(rows[2].valueText, '4,0 · 1 nota');
    expect(rows.last.fraction, closeTo(0.96, 1e-9));
    expect(tournamentReviewAspectRows(null), isEmpty);
  });

  test('distribuição de 5★ a 1★', () {
    final rows = tournamentReviewDistributionRows({1: 1, 2: 1, 3: 2, 4: 7, 5: 12});
    expect(rows.map((r) => r.label), ['5★', '4★', '3★', '2★', '1★']);
    expect(rows.map((r) => r.count), [12, 7, 2, 1, 1]);
    expect(rows.first.fraction, closeTo(12 / 23, 1e-9));
    expect(tournamentReviewDistributionRows(null), isEmpty);
  });

  test('comentários: só com texto, por shuffleKey; lowOnly = 1–2★', () {
    AnonymousTournamentReview r(String id, int overall, String? comment, double key) =>
        AnonymousTournamentReview(id: id, overall: overall, aspects: const {}, comment: comment, shuffleKey: key);
    final reviews = [
      r('a', 5, 'Tudo pontual', 0.9),
      r('b', 1, 'Atrasou duas horas', 0.1),
      r('c', 4, null, 0.5),
      r('d', 2, 'Quadra ruim', 0.3),
    ];
    expect(tournamentReviewCommentCards(reviews, lowOnly: false).map((x) => x.id), ['b', 'd', 'a']);
    expect(tournamentReviewCommentCards(reviews, lowOnly: true).map((x) => x.id), ['b', 'd']);
  });

  test('estrelas e aspectos marcados no card, na ordem da lista', () {
    expect(tournamentReviewStars(4), '★★★★☆');
    const review = AnonymousTournamentReview(
      id: 'a',
      overall: 4,
      aspects: {TournamentReviewAspect.schedule: 2, TournamentReviewAspect.organization: 5},
      comment: 'x',
      shuffleKey: 0,
    );
    expect(tournamentReviewAspectChips(review), ['Organização geral 5★', 'Cumprimento dos horários 2★']);
  });
}
