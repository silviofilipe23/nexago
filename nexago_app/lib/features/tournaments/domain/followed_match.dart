import 'package:cloud_firestore/cloud_firestore.dart';

/// Uma partida que o atleta escolheu acompanhar.
///
/// Doc em `users/{uid}/followedMatches/{matchId}`, gravado por
/// `FollowedMatchesRepository.follow`.
class FollowedMatch {
  const FollowedMatch({
    required this.matchId,
    required this.tournamentId,
    required this.categoryId,
    required this.source,
    this.followedAt,
  });

  final String matchId;
  final String tournamentId;
  final String categoryId;

  /// Como o follow nasceu. Hoje sempre `manual` — o campo existe para que
  /// auto-seguir, se um dia entrar, seja distinguível sem migração.
  final String source;

  /// Nulo entre a escrita local e a confirmação do `serverTimestamp`.
  final DateTime? followedAt;

  factory FollowedMatch.fromDoc(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data();
    return FollowedMatch(
      matchId: (data['matchId'] as String?)?.trim().isNotEmpty == true
          ? (data['matchId'] as String).trim()
          : doc.id,
      tournamentId: (data['tournamentId'] as String?)?.trim() ?? '',
      categoryId: (data['categoryId'] as String?)?.trim() ?? '',
      source: (data['source'] as String?)?.trim() ?? 'manual',
      followedAt: _timestamp(data['followedAt']),
    );
  }

  static DateTime? _timestamp(dynamic value) {
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    return null;
  }

  @override
  bool operator ==(Object other) {
    return other is FollowedMatch &&
        other.matchId == matchId &&
        other.tournamentId == tournamentId &&
        other.categoryId == categoryId &&
        other.source == source &&
        other.followedAt == followedAt;
  }

  @override
  int get hashCode =>
      Object.hash(matchId, tournamentId, categoryId, source, followedAt);
}
