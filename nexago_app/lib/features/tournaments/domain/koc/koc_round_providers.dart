import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/nexago_artifacts_paths.dart';
import 'koc_round_state.dart';

/// Estado ao vivo de uma rodada King of the Court, do doc de `matches`.
///
/// Stream própria, fora de `TournamentMatch`: aquele modelo é lido por dezenas
/// de telas de duelo e não deve carregar trono, fila e relógio. Quem precisa do
/// ao vivo — a mesa e o card do atleta — assina esta.
final kocRoundProvider = StreamProvider.autoDispose
    .family<KocRoundState?, String>((ref, matchId) {
  final id = matchId.trim();
  if (id.isEmpty) return Stream.value(null);
  return FirebaseFirestore.instance
      .collection(NexagoArtifactsPaths.matchesCollection())
      .doc(id)
      .snapshots()
      .map((snap) {
        final data = snap.data();
        return data == null ? null : kocRoundStateFromMap(data);
      });
});
