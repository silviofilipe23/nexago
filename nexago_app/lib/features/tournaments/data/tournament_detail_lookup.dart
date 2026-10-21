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
  final doc = await firestore.collection('tournaments').doc(id).get();
  if (doc.exists) return TournamentDocumentMapper.detailFromSnapshot(doc);
  final legacy = await getLegacyTournamentDoc(firestore, id);
  return legacy == null
      ? null
      : TournamentDocumentMapper.detailFromSnapshot(legacy);
}

/// Lê o doc legado do torneio; `null` quando a leitura é negada.
///
/// O caminho legado não tem regra própria e cai no catch-all `false` das
/// rules — então um torneio apagado da raiz (inscrição órfã) virava
/// `permission-denied` e derrubava o stream inteiro de "Meus torneios".
Future<DocumentSnapshot<Map<String, dynamic>>?> getLegacyTournamentDoc(
  FirebaseFirestore firestore,
  String id,
) async {
  try {
    return await firestore
        .doc(NexagoArtifactsPaths.legacyTournamentDoc(id))
        .get();
  } on FirebaseException catch (e) {
    if (e.code == 'permission-denied') return null;
    rethrow;
  }
}
