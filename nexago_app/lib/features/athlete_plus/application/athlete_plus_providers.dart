import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../domain/athlete_plus_waitlist.dart';
import '../infrastructure/firebase_athlete_plus_repository.dart';

export '../infrastructure/firebase_athlete_plus_repository.dart'
    show athletePlusRepositoryProvider;

/// Uid da sessão; vazio deslogado (nada é lido).
final athletePlusUidProvider = Provider.autoDispose<String>((ref) {
  return ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
});

/// `appConfig/athletePlus.waitlistEnabled` (a rule de `appConfig` exige sessão).
final athletePlusWaitlistFlagProvider = StreamProvider.autoDispose<bool>((ref) {
  if (ref.watch(athletePlusUidProvider).isEmpty) return Stream.value(false);
  return ref.watch(athletePlusRepositoryProvider).watchWaitlistEnabled();
});

/// Resposta do atleta; `null` = ainda não respondeu.
final myAthletePlusEntryProvider =
    StreamProvider.autoDispose<AthletePlusWaitlistEntry?>((ref) {
  final uid = ref.watch(athletePlusUidProvider);
  if (uid.isEmpty) return Stream.value(null);
  return ref.watch(athletePlusRepositoryProvider).watchMyEntry(uid);
});

/// Card da Início visível? Só com a flag ligada e o doc do atleta CARREGADO
/// e vazio. Carregando ou com erro = escondido: na dúvida, não insistir com
/// quem já respondeu.
final athletePlusCardVisibleProvider = Provider.autoDispose<bool>((ref) {
  if (ref.watch(athletePlusWaitlistFlagProvider).valueOrNull != true) {
    return false;
  }
  final entry = ref.watch(myAthletePlusEntryProvider);
  return entry.hasValue && !entry.hasError && entry.value == null;
});
