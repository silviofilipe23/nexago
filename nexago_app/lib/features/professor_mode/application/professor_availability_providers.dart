import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/time/nexago_event_timezone.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../domain/professor_availability.dart';
import '../infrastructure/professor_availability_repository.dart';

export '../infrastructure/professor_availability_repository.dart'
    show professorAvailabilityRepositoryProvider;

/// Disponibilidade de um professor (`null` = sem documento). O professor lê
/// a dele; o aluno a publicada (prazo de cancelamento sem custo).
final professorAvailabilityProvider = StreamProvider.autoDispose
    .family<ProfessorAvailability?, String>((ref, professorUid) {
  if (ref.watch(professorLinksUidProvider).isEmpty || professorUid.isEmpty) {
    return Stream.value(null);
  }
  return ref
      .watch(professorAvailabilityRepositoryProvider)
      .watchAvailability(professorUid);
});

/// A do professor logado.
final myProfessorAvailabilityProvider =
    Provider.autoDispose<AsyncValue<ProfessorAvailability?>>((ref) {
  return ref.watch(
    professorAvailabilityProvider(ref.watch(professorLinksUidProvider)),
  );
});

/// Particulares do professor desde 35 dias atrás (cobre o Mês da agenda),
/// início mais cedo primeiro.
final professorPrivateLessonsProvider =
    StreamProvider.autoDispose<List<PrivateLesson>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  final now = ref.watch(professorLinksClockProvider)();
  final anchor = nexagoEventDayKeyAnchor(nexagoEventDayKey(now)) ?? now;
  return ref
      .watch(professorAvailabilityRepositoryProvider)
      .watchProfessorLessons(
        uid,
        since: anchor.subtract(const Duration(days: 35)),
      );
});

/// Pedidos esperando resposta (ainda no futuro), mais cedo primeiro.
final professorPendingPrivateLessonsProvider =
    Provider.autoDispose<List<PrivateLesson>>((ref) {
  final now = ref.watch(professorLinksClockProvider)();
  return [
    for (final l
        in ref.watch(professorPrivateLessonsProvider).valueOrNull ?? const [])
      if (l.status == PrivateLessonStatus.pending && l.startAt.isAfter(now)) l,
  ];
});

/// Confirmadas que ainda não começaram, mais cedo primeiro.
final professorUpcomingPrivateLessonsProvider =
    Provider.autoDispose<List<PrivateLesson>>((ref) {
  final now = ref.watch(professorLinksClockProvider)();
  return [
    for (final l
        in ref.watch(professorPrivateLessonsProvider).valueOrNull ?? const [])
      if (l.status == PrivateLessonStatus.confirmed && l.startAt.isAfter(now))
        l,
  ];
});

// ── lado do aluno ──

/// Particulares do aluno logado (mais recentes primeiro).
final athletePrivateLessonsProvider =
    StreamProvider.autoDispose<List<PrivateLesson>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(professorAvailabilityRepositoryProvider)
      .watchAthleteLessons(uid);
});

/// Horários livres do professor nos próximos 14 dias.
final professorOpenSlotsProvider = FutureProvider.autoDispose
    .family<ProfessorOpenSlots, String>((ref, professorUid) {
  return ref
      .watch(professorAvailabilityRepositoryProvider)
      .fetchOpenSlots(professorUid, days: kPrivateLessonWindowDays);
});
