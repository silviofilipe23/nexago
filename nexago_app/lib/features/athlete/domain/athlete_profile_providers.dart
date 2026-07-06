import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/providers/cache_for.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../data/athlete_profile_repository.dart';
import 'athlete_profile.dart';

final athleteProfileRepositoryProvider = Provider<AthleteProfileRepository>((ref) {
  return AthleteProfileRepository(ref.watch(firestoreProvider));
});

/// Evita que o redirect do router mande de volta ao onboarding logo após concluir.
final athleteOnboardingJustCompletedProvider = StateProvider<bool>((ref) => false);

/// Documento `users/{uid}` do atleta logado ou `null` se ainda não existir.
final athleteProfileProvider = StreamProvider.autoDispose<AthleteProfile?>((ref) {
  // Lido pelo `redirect` em toda navegação: mantém vivo para não re-assinar o
  // Firestore a cada troca de tela.
  cacheFor(ref);
  final user = ref.watch(authProvider).valueOrNull;
  if (user == null) {
    return const Stream<AthleteProfile?>.empty();
  }
  return ref.watch(athleteProfileRepositoryProvider).watchProfile(user.uid);
});

/// Perfil de outro usuário (ex.: gestor visualizando atleta). `users/{uid}`.
final athleteProfileByIdProvider =
    StreamProvider.autoDispose.family<AthleteProfile?, String>((ref, uid) {
  final id = uid.trim();
  if (id.isEmpty) {
    return const Stream<AthleteProfile?>.empty();
  }
  return ref.watch(athleteProfileRepositoryProvider).watchProfile(id);
});

/// E-mail em `users/{uid}` (quando as regras permitirem leitura).
final athleteUserEmailProvider =
    FutureProvider.autoDispose.family<String?, String>((ref, uid) async {
  final id = uid.trim();
  if (id.isEmpty) return null;
  final snap =
      await ref.watch(firestoreProvider).collection('users').doc(id).get();
  final data = snap.data();
  if (data == null) return null;
  final e = data['email'];
  return e is String && e.trim().isNotEmpty ? e.trim() : null;
});
