import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/arenas_providers.dart';
import '../data/arena_profile_edit_service.dart';

final arenaProfileEditServiceProvider = Provider<ArenaProfileEditService>((ref) {
  return ArenaProfileEditService(ref.watch(firestoreProvider));
});
