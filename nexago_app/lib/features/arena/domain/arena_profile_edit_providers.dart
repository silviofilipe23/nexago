import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/data/arena_search_metadata_service.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../data/arena_profile_edit_service.dart';

final arenaProfileEditServiceProvider = Provider<ArenaProfileEditService>((ref) {
  return ArenaProfileEditService(
    ref.watch(firestoreProvider),
    FirebaseStorage.instance,
  );
});

final arenaSearchMetadataServiceProvider =
    Provider<ArenaSearchMetadataService>((ref) {
  return ArenaSearchMetadataService(ref.watch(firestoreProvider));
});
