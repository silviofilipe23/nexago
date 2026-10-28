import 'dart:typed_data';

import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';

import '../../data/organizer_story_shares_repository.dart';
import 'organizer_story_share.dart';

final organizerStorySharesRepositoryProvider =
    Provider<OrganizerStorySharesRepository>((ref) {
  return OrganizerStorySharesRepository(
    firestore: ref.watch(firestoreProvider),
    storage: () => FirebaseStorage.instance,
  );
});

/// O envio do usuário logado — `null` quando não existe (já expirou e o
/// servidor apagou, ou o push é de outra conta).
final organizerStoryShareProvider = StreamProvider.autoDispose
    .family<OrganizerStoryShare?, String>((ref, shareId) async* {
  final user = await ref.watch(authProvider.future);
  if (user == null) {
    yield null;
    return;
  }
  yield* ref
      .watch(organizerStorySharesRepositoryProvider)
      .watchShare(user.uid, shareId);
});

/// Os PNGs do envio, na ordem. Baixa todos antes de liberar o botão: o
/// "Postar" abre a folha nativa na hora, sem esperar rede.
final organizerStorySharePagesProvider = FutureProvider.autoDispose
    .family<List<Uint8List>, String>((ref, shareId) async {
  final share = await ref.watch(organizerStoryShareProvider(shareId).future);
  if (share == null) return const [];
  final repository = ref.watch(organizerStorySharesRepositoryProvider);
  return Future.wait(share.pagePaths.map(repository.downloadPage));
});
