import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';

/// Coleção dos passes de vaga (`tournamentSpotPasses`).
///
/// O passe é a permissão nominal que o organizador dá para UM atleta se inscrever numa
/// categoria lotada. Aqui só se LÊ: quem grava é a Cloud Function, porque a vaga só existe de
/// verdade quando o teto da categoria sobe — e isso acontece na mesma transação que cria a
/// inscrição, fora do alcance do app.
const kTournamentSpotPassesCollection = 'tournamentSpotPasses';

class TournamentSpotPassRepository {
  TournamentSpotPassRepository(this._firestore);

  final FirebaseFirestore _firestore;

  /// Categorias deste torneio em que o atleta tem passe VIVO.
  ///
  /// O `status` é filtrado em memória de propósito: a consulta casa por atleta e torneio (o
  /// índice que as regras do Firestore permitem verificar numa listagem), e passe usado ou
  /// revogado é raro o bastante para não valer um índice a mais.
  Stream<Set<String>> watchActiveCategoryIds({
    required String tournamentId,
    required String uid,
  }) {
    return _firestore
        .collection(kTournamentSpotPassesCollection)
        .where('athleteUid', isEqualTo: uid)
        .where('tournamentId', isEqualTo: tournamentId)
        .snapshots()
        .map((snap) {
      final ids = <String>{};
      for (final doc in snap.docs) {
        final data = doc.data();
        if (data['status'] != 'active') continue;
        final categoryId = (data['categoryId'] as String?)?.trim() ?? '';
        if (categoryId.isNotEmpty) ids.add(categoryId);
      }
      return ids;
    });
  }
}

final tournamentSpotPassRepositoryProvider =
    Provider<TournamentSpotPassRepository>((ref) {
  return TournamentSpotPassRepository(ref.watch(firestoreProvider));
});

/// Categorias do torneio em que o usuário autenticado tem vaga liberada.
///
/// Conjunto VAZIO é o caso normal — nenhuma tela deve tratar ausência de passe como erro.
final tournamentSpotPassCategoryIdsProvider =
    StreamProvider.autoDispose.family<Set<String>, String>((ref, tournamentId) {
  final auth = ref.watch(authProvider);
  if (auth.isLoading) return const Stream<Set<String>>.empty();
  final uid = auth.valueOrNull?.uid.trim() ?? '';
  if (uid.isEmpty) return Stream.value(const <String>{});
  return ref.watch(tournamentSpotPassRepositoryProvider).watchActiveCategoryIds(
        tournamentId: tournamentId,
        uid: uid,
      );
});
