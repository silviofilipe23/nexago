import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/tournament_detail_model.dart';
import 'nexago_artifacts_paths.dart';
import 'tournament_document_mapper.dart';

/// Busca um torneio por id, com fallback pro caminho legado
/// (`artifacts/{projectId}/public/data/tournaments/{id}`).
Future<TournamentDetail?> loadTournamentDetailById(
  FirebaseFirestore firestore,
  String id,
) async {
  var doc = await firestore.collection('tournaments').doc(id).get();
  if (!doc.exists) {
    doc = await firestore.doc(NexagoArtifactsPaths.legacyTournamentDoc(id)).get();
  }
  return TournamentDocumentMapper.detailFromSnapshot(doc);
}
