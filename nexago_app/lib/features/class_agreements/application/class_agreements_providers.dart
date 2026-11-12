import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/firebase/firebase_providers.dart';
import '../domain/class_agreements.dart';
import '../infrastructure/class_agreements_repository.dart';

final classAgreementsRepositoryProvider = Provider<ClassAgreementsRepository>(
  (ref) => ClassAgreementsRepository(firestore: ref.watch(firestoreProvider)),
);

/// Uid da sessão; vazio deslogado (nenhuma callable é chamada).
final classAgreementsUidProvider = Provider.autoDispose<String>(
  (ref) => ref.watch(authProvider).valueOrNull?.uid.trim() ?? '',
);

/// A arena tem plano de aula para contratar pelo app? Erro conta como não.
final arenaClassSignupOpenProvider =
    StreamProvider.autoDispose.family<bool, String>((ref, arenaId) {
  if (arenaId.isEmpty) return Stream.value(false);
  return ref
      .watch(classAgreementsRepositoryProvider)
      .watchSignupOpen(arenaId)
      .handleError((Object _) {});
});

/// Planos, professores e turmas com vaga da arena (passos 1–3).
final classSignupOptionsProvider = FutureProvider.autoDispose
    .family<ClassSignupOptions, String>((ref, arenaId) {
  return ref.watch(classAgreementsRepositoryProvider).signupOptions(arenaId);
});

/// Contratos do atleta (aluno) e do professor, os dois juntos.
final myClassAgreementsProvider =
    FutureProvider.autoDispose<List<ClassAgreement>>((ref) {
  if (ref.watch(classAgreementsUidProvider).isEmpty) {
    return const <ClassAgreement>[];
  }
  return ref.watch(classAgreementsRepositoryProvider).myAgreements();
});

/// Contratos de professor esperando assinatura (card no topo de Arenas). Erro
/// vira lista vazia: o card some, a tela segue.
final pendingProfessorAgreementsProvider =
    FutureProvider.autoDispose<List<ClassAgreement>>((ref) async {
  try {
    final all = await ref.watch(myClassAgreementsProvider.future);
    return all.where((a) => a.isProfessor && a.isPending).toList();
  } catch (_) {
    return const <ClassAgreement>[];
  }
});

final classAgreementProvider = FutureProvider.autoDispose
    .family<ClassAgreement, String>((ref, agreementId) {
  return ref.watch(classAgreementsRepositoryProvider).agreement(agreementId);
});
