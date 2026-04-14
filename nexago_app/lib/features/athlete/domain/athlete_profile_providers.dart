import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../data/athlete_profile_repository.dart';
import 'athlete_profile.dart';

final athleteProfileRepositoryProvider = Provider<AthleteProfileRepository>((ref) {
  return AthleteProfileRepository(ref.watch(firestoreProvider));
});

/// Documento `athletes/{uid}` ou `null` se ainda não existir.
final athleteProfileProvider = StreamProvider.autoDispose<AthleteProfile?>((ref) {
  final user = ref.watch(authProvider).valueOrNull;
  if (user == null) {
    return const Stream<AthleteProfile?>.empty();
  }
  return ref.watch(athleteProfileRepositoryProvider).watchProfile(user.uid);
});
