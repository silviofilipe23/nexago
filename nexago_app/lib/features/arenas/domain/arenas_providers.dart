import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';

export '../../../core/firebase/firebase_providers.dart' show firestoreProvider;

import '../data/arenas_repository.dart';
import 'arena_list_item.dart';

final arenasRepositoryProvider = Provider<ArenasRepository>((ref) {
  return ArenasRepository(ref.watch(firestoreProvider));
});

/// Arenas parceiras — as que dá para reservar, favoritar e avaliar.
///
/// Leitor padrão: use este em qualquer tela que ofereça um fluxo real. Arena de
/// pré-cadastro só entra na busca, via [arenasIncludingUnclaimedStreamProvider].
final partnerArenasStreamProvider =
    StreamProvider.autoDispose<List<ArenaListItem>>((ref) {
  return ref.watch(arenasRepositoryProvider).watchPartnerArenas();
});

/// Parceiras + pré-cadastradas. Só a busca do atleta usa.
final arenasIncludingUnclaimedStreamProvider =
    StreamProvider.autoDispose<List<ArenaListItem>>((ref) {
  return ref.watch(arenasRepositoryProvider).watchArenasIncludingUnclaimed();
});

/// Uma arena por id (detalhe).
final arenaByIdProvider =
    StreamProvider.autoDispose.family<ArenaListItem?, String>((ref, arenaId) {
  return ref.watch(arenasRepositoryProvider).watchArena(arenaId);
});
