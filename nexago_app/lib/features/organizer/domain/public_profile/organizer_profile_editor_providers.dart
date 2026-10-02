import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/firebase/firebase_providers.dart';
import '../../data/organizer_public_profile_editor_repository.dart';
import 'organizer_profile_editor_logic.dart';

final organizerPublicProfileEditorRepositoryProvider =
    Provider<OrganizerPublicProfileEditorRepository>((ref) {
      return OrganizerPublicProfileEditorRepository(
        firestore: ref.watch(firestoreProvider),
        storage: () => FirebaseStorage.instance,
      );
    });

/// Uid do organizador logado ('' sem sessão).
final organizerEditorUidProvider = Provider.autoDispose<String>((ref) {
  return ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
});

/// `users/{uid}.organizerProfile` do organizador logado, ao vivo.
final organizerProfileSourceProvider =
    StreamProvider.autoDispose<OrganizerProfileSource>((ref) {
      final uid = ref.watch(organizerEditorUidProvider);
      return ref
          .watch(organizerPublicProfileEditorRepositoryProvider)
          .watchSource(uid);
    });
