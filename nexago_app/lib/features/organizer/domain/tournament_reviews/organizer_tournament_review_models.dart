import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';

/// Lado do organizador da avaliação do torneio — spec
/// `docs/superpowers/specs/2026-10-01-tournament-athlete-reviews-design.md` §4. Os docs são
/// gravados só pelo servidor (`functions/src/tournament-review-derived.ts`); aqui só se lê.

/// Média e contagem de um aspecto.
class TournamentReviewAspectStat {
  const TournamentReviewAspectStat({required this.count, required this.average});

  final int count;
  final double average;
}

/// `tournamentReviewSummaries/{tournamentId}` — público. Com `count < 3`, `average`,
/// `distribution` e `aspects` vêm nulos: só a contagem é real.
class TournamentReviewSummary {
  const TournamentReviewSummary({
    required this.tournamentId,
    required this.tournamentName,
    required this.isOpen,
    required this.eligibleCount,
    required this.count,
    this.average,
    this.distribution,
    this.aspects,
    this.closesAt,
  });

  final String tournamentId;
  final String tournamentName;

  /// `status == 'open'` no doc. A janela só está aberta de fato com `closesAt` no futuro.
  final bool isOpen;
  final int eligibleCount;
  final int count;
  final double? average;

  /// Estrelas (1–5) → quantidade de notas gerais.
  final Map<int, int>? distribution;
  final Map<TournamentReviewAspect, TournamentReviewAspectStat>? aspects;
  final DateTime? closesAt;

  static TournamentReviewSummary? fromMap(String id, Map<String, dynamic>? data) {
    if (data == null) return null;
    final tournamentId = _textOf(data['tournamentId']);
    return TournamentReviewSummary(
      tournamentId: tournamentId.isEmpty ? id : tournamentId,
      tournamentName: _textOf(data['tournamentName']),
      isOpen: data['status'] == 'open',
      eligibleCount: _countOf(data['eligibleCount']),
      count: _countOf(data['count']),
      average: _numOf(data['average']),
      distribution: _distributionOf(data['distribution']),
      aspects: _aspectStatsOf(data['aspects']),
      closesAt: _dateOf(data['closesAt']),
    );
  }
}

/// `tournaments/{tid}/anonymousReviews/{anonId}` — cópia sem uid, data nem categoria. A rule só
/// libera a leitura para quem gerencia o torneio, e só com 3+ avaliações no resumo.
class AnonymousTournamentReview {
  const AnonymousTournamentReview({
    required this.id,
    required this.overall,
    required this.aspects,
    required this.shuffleKey,
    this.comment,
  });

  final String id;
  final int overall;
  final Map<TournamentReviewAspect, int> aspects;
  final String? comment;

  /// Ordem embaralhada fixa: a ordem de chegada não pode denunciar quem escreveu.
  final double shuffleKey;

  static AnonymousTournamentReview? fromMap(String id, Map<String, dynamic>? data) {
    if (data == null) return null;
    final overall = _starOf(data['overall']);
    if (overall == null) return null;
    final aspects = <TournamentReviewAspect, int>{};
    final rawAspects = data['aspects'];
    if (rawAspects is Map) {
      for (final entry in rawAspects.entries) {
        final aspect = TournamentReviewAspect.fromKey('${entry.key}');
        final value = _starOf(entry.value);
        if (aspect != null && value != null) aspects[aspect] = value;
      }
    }
    final comment = _textOf(data['comment']);
    return AnonymousTournamentReview(
      id: id,
      overall: overall,
      aspects: aspects,
      comment: comment.isEmpty ? null : comment,
      shuffleKey: _numOf(data['shuffleKey']) ?? 0,
    );
  }
}

DateTime? _dateOf(Object? value) {
  if (value is Timestamp) return value.toDate();
  if (value is DateTime) return value;
  return null;
}

String _textOf(Object? value) => value is String ? value.trim() : '';

int _countOf(Object? value) => value is num && value.isFinite && value > 0 ? value.toInt() : 0;

double? _numOf(Object? value) => value is num && value.isFinite ? value.toDouble() : null;

int? _starOf(Object? value) {
  if (value is num && value == value.roundToDouble() && value >= 1 && value <= 5) {
    return value.toInt();
  }
  return null;
}

Map<int, int>? _distributionOf(Object? value) {
  if (value is! Map) return null;
  return {for (var stars = 1; stars <= 5; stars++) stars: _countOf(value['$stars'])};
}

Map<TournamentReviewAspect, TournamentReviewAspectStat>? _aspectStatsOf(Object? value) {
  if (value is! Map) return null;
  final out = <TournamentReviewAspect, TournamentReviewAspectStat>{};
  for (final entry in value.entries) {
    final aspect = TournamentReviewAspect.fromKey('${entry.key}');
    final raw = entry.value;
    if (aspect == null || raw is! Map) continue;
    final average = _numOf(raw['average']);
    final count = _countOf(raw['count']);
    if (average != null && count > 0) {
      out[aspect] = TournamentReviewAspectStat(count: count, average: average);
    }
  }
  return out;
}
