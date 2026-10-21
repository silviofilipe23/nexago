import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../professor_mode/domain/professor_lessons.dart';
import '../../data/lesson_payment_repository.dart';
import 'lesson_payment.dart';

/// Cobrança do professor paga pelo atleta, ao vivo (`null` = não existe ou
/// não é dele — a rule nega e o stream erra).
final lessonPaymentProvider =
    StreamProvider.autoDispose.family<LessonPayment?, String>((ref, chargeId) {
  return ref.watch(lessonPaymentRepositoryProvider).watchPayment(chargeId);
});

/// Dono e aluno da cobrança — chave das leituras derivadas (não relê a cada
/// atualização do doc).
final _lessonPaymentPartiesProvider =
    Provider.autoDispose.family<(String, String)?, String>((ref, chargeId) {
  final p = ref.watch(lessonPaymentProvider(chargeId)).valueOrNull;
  if (p == null || p.professorUid.isEmpty || p.athleteId.isEmpty) return null;
  return (p.professorUid, p.athleteId);
});

/// Recorrência do aluno na carteira do professor (para a "Próxima cobrança").
final lessonPaymentRecurrenceProvider = FutureProvider.autoDispose
    .family<LessonPaymentRecurrence?, String>((ref, chargeId) async {
  final parties = ref.watch(_lessonPaymentPartiesProvider(chargeId));
  if (parties == null) return null;
  return ref.watch(lessonPaymentRepositoryProvider).fetchRecurrence(
        professorUid: parties.$1,
        athleteId: parties.$2,
      );
});

/// Próxima aula marcada com o professor.
final lessonPaymentNextLessonProvider = FutureProvider.autoDispose
    .family<ProfessorLesson?, String>((ref, chargeId) async {
  final parties = ref.watch(_lessonPaymentPartiesProvider(chargeId));
  if (parties == null) return null;
  return ref.watch(lessonPaymentRepositoryProvider).fetchNextLesson(
        professorUid: parties.$1,
        athleteId: parties.$2,
        now: DateTime.now(),
      );
});
