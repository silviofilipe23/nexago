import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/athlete_rating_repository.dart';

/// Estado derivado da engine de rating (`athleteRatings/{uid}_{sportCode}`).
/// Leitura pública; escrito apenas pelo backend (Glicko-2 por partida).
class AthleteRating {
  const AthleteRating({
    required this.athleteId,
    required this.sportCode,
    required this.rating,
    required this.rd,
    required this.ratedMatches,
    required this.wins,
    required this.losses,
    required this.levelCode,
    required this.zone,
    required this.ladderState,
    this.lastMatchAt,
  });

  final String athleteId;
  final String sportCode;
  final double rating;
  final double rd;
  final int ratedMatches;
  final int wins;
  final int losses;
  final String levelCode;

  /// `stable` | `promotion` | `relegation` (posição nas bandas do nível).
  final String zone;

  /// `stable` | `promotion_pending` | `relegation_observation`.
  final String ladderState;
  final DateTime? lastMatchAt;

  /// Ainda consolidando o rating (poucas partidas para decisões da escada).
  bool get isProvisional => ratedMatches < 10;

  factory AthleteRating.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    double readDouble(dynamic value) =>
        value is num ? value.toDouble() : 0;
    int readInt(dynamic value) => value is num ? value.round() : 0;
    String readStr(dynamic value) => value is String ? value.trim() : '';

    return AthleteRating(
      athleteId: readStr(data['athleteId']),
      sportCode: readStr(data['sportCode']),
      rating: readDouble(data['rating']),
      rd: readDouble(data['rd']),
      ratedMatches: readInt(data['ratedMatches']),
      wins: readInt(data['wins']),
      losses: readInt(data['losses']),
      levelCode: readStr(data['levelCode']),
      zone: readStr(data['zone']).isEmpty ? 'stable' : readStr(data['zone']),
      ladderState: readStr(data['ladderState']).isEmpty
          ? 'stable'
          : readStr(data['ladderState']),
      lastMatchAt: data['lastMatchAt'] is Timestamp
          ? (data['lastMatchAt'] as Timestamp).toDate()
          : null,
    );
  }
}

/// Rating do atleta logado para um esporte (código FS, ex.: `VOLEI_PRAIA`).
/// `null` enquanto a engine ainda não processou nenhuma partida dele.
final athleteRatingProvider =
    StreamProvider.autoDispose.family<AthleteRating?, String>((ref, sportCode) {
  return ref.watch(athleteRatingRepositoryProvider).watchOwnRating(sportCode);
});

/// Chave de busca de rating de um atleta arbitrário (não necessariamente o
/// usuário logado) — usada por features que comparam dois competidores, ex.
/// probabilidade de vitória pré-partida.
typedef AthleteRatingQuery = ({String athleteId, String sportCode});

/// Rating de um atleta específico (qualquer um, não só o logado) para um
/// esporte. `null` enquanto a engine ainda não processou nenhuma partida
/// dele. Leitura pública — mesma regra de [athleteRatingProvider].
final athleteRatingForAthleteProvider = StreamProvider.autoDispose
    .family<AthleteRating?, AthleteRatingQuery>((ref, query) {
  return ref.watch(athleteRatingRepositoryProvider).watchRating(
        athleteId: query.athleteId,
        sportCode: query.sportCode,
      );
});
