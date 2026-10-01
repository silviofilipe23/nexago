import 'package:cloud_firestore/cloud_firestore.dart';

/// Avaliação do torneio pelos atletas — spec
/// `docs/superpowers/specs/2026-10-01-tournament-athlete-reviews-design.md`.
///
/// Aspectos opcionais: MESMA lista e ordem de `functions/src/tournament-review-constants.ts`
/// (o teste de paridade lê aquele arquivo).
enum TournamentReviewAspect {
  organization('organization', 'Organização geral'),
  schedule('schedule', 'Cumprimento dos horários'),
  refereeing('refereeing', 'Arbitragem / mesa'),
  venue('venue', 'Estrutura do local'),
  prizes('prizes', 'Premiação e kit');

  const TournamentReviewAspect(this.key, this.label);

  final String key;
  final String label;

  static TournamentReviewAspect? fromKey(String key) {
    for (final aspect in values) {
      if (aspect.key == key) return aspect;
    }
    return null;
  }
}

enum TournamentReviewInviteStatus { pending, submitted, expired }

/// `users/{uid}/tournamentReviewInvites/{tournamentId}` — só o servidor grava. É a única prova
/// de "posso avaliar este torneio, e até quando".
class TournamentReviewInvite {
  const TournamentReviewInvite({
    required this.tournamentId,
    required this.tournamentName,
    required this.closesAt,
    required this.status,
    this.coverUrl,
  });

  final String tournamentId;
  final String tournamentName;
  final DateTime closesAt;
  final TournamentReviewInviteStatus status;
  final String? coverUrl;

  /// Sem `closesAt` o prazo é desconhecido — o convite é tratado como ausente.
  static TournamentReviewInvite? fromMap(String id, Map<String, dynamic>? data) {
    if (data == null) return null;
    final closesAt = _dateOf(data['closesAt']);
    if (closesAt == null) return null;
    final tournamentId = _textOf(data['tournamentId']);
    final coverUrl = _textOf(data['coverUrl']);
    return TournamentReviewInvite(
      tournamentId: tournamentId.isEmpty ? id : tournamentId,
      tournamentName: _textOf(data['tournamentName']),
      closesAt: closesAt,
      status: switch (data['status']) {
        'submitted' => TournamentReviewInviteStatus.submitted,
        'expired' => TournamentReviewInviteStatus.expired,
        _ => TournamentReviewInviteStatus.pending,
      },
      coverUrl: coverUrl.isEmpty ? null : coverUrl,
    );
  }
}

/// `tournamentReviews/{tournamentId}_{uid}`, lido pelo próprio autor para pré-preencher a
/// edição e mostrar "Você avaliou ★ N".
class MyTournamentReview {
  const MyTournamentReview({
    required this.overall,
    required this.aspects,
    this.comment,
  });

  final int overall;
  final Map<TournamentReviewAspect, int> aspects;
  final String? comment;

  static MyTournamentReview? fromMap(Map<String, dynamic>? data) {
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
    return MyTournamentReview(
      overall: overall,
      aspects: aspects,
      comment: comment.isEmpty ? null : comment,
    );
  }
}

DateTime? _dateOf(Object? value) {
  if (value is Timestamp) return value.toDate();
  if (value is DateTime) return value;
  return null;
}

String _textOf(Object? value) => value is String ? value.trim() : '';

int? _starOf(Object? value) {
  if (value is int && value >= 1 && value <= 5) return value;
  return null;
}
