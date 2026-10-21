import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../professor_links/application/professor_links_providers.dart';
import '../domain/professor_agenda.dart';
import '../domain/professor_lesson_plans.dart';
import '../infrastructure/professor_lesson_plans_repository.dart';
import 'professor_agenda_providers.dart';

export '../infrastructure/professor_lesson_plans_repository.dart'
    show professorLessonPlansRepositoryProvider;

/// Plano de aula (H1–H5, H8).

/// Quantos dias para trás os planos carregam (o "Repetir anterior").
const int kLessonPlanHistoryDays = 28;

/// Quantos dias a aba Próximas cobre (hoje e os 6 seguintes).
const int kLessonPlanUpcomingDays = 7;

/// Planos do professor das últimas 4 semanas em diante.
final professorLessonPlansProvider =
    StreamProvider.autoDispose<List<LessonPlan>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  final today = ref.watch(professorAgendaNowProvider).todayKey;
  return ref.watch(professorLessonPlansRepositoryProvider).watchPlans(
        uid,
        fromDateKey: professorShiftDay(today, -kLessonPlanHistoryDays),
      );
});

/// O plano de uma aula (`null` = sem plano; carregando = sem valor).
final professorLessonPlanProvider = Provider.autoDispose
    .family<AsyncValue<LessonPlan?>, LessonPlanRef>((ref, key) {
  final uid = ref.watch(professorLinksUidProvider);
  final id = lessonPlanId(uid, key.kind, key.refId);
  return ref.watch(professorLessonPlansProvider).whenData((plans) {
    for (final p in plans) {
      if (p.id == id) return p;
    }
    return null;
  });
});

/// Um plano pelo id (modo aula, registro). `null` = não está nos carregados.
final professorLessonPlanByIdProvider =
    Provider.autoDispose.family<AsyncValue<LessonPlan?>, String>((ref, id) {
  return ref.watch(professorLessonPlansProvider).whenData((plans) {
    for (final p in plans) {
      if (p.id == id) return p;
    }
    return null;
  });
});

/// Planos que já aconteceram (até hoje) e ainda não têm registro (H7).
final professorLessonPlansToReviewProvider =
    Provider.autoDispose<List<LessonPlan>>((ref) {
  final today = ref.watch(professorAgendaNowProvider).todayKey;
  final plans = ref.watch(professorLessonPlansProvider).valueOrNull ?? const [];
  return [
    for (final p in plans.reversed)
      if (p.date.compareTo(today) < 0 && !p.hasReview) p,
  ];
});

/// Relógio do modo aula (H6). Injetável em teste.
final lessonLiveClockProvider = Provider<DateTime Function()>(
  (ref) => ref.watch(professorLinksClockProvider),
);

/// Tela ligada no modo aula (`wakelock_plus`). Injetável em teste.
final lessonLiveWakelockProvider = Provider<Future<void> Function(bool on)>(
  (ref) => (on) => (on ? WakelockPlus.enable() : WakelockPlus.disable())
      .catchError((Object _) {}),
);

/// A aula do plano: `kind` + `refId`.
typedef LessonPlanRef = ({LessonPlanKind kind, String refId});

/// Intervalo da aba Próximas.
final lessonPlanUpcomingRangeProvider =
    Provider.autoDispose<ProfessorAgendaRange>((ref) {
  final today = ref.watch(professorAgendaNowProvider).todayKey;
  return (
    fromKey: today,
    toKey: professorShiftDay(today, kLessonPlanUpcomingDays - 1),
  );
});

/// Aulas dos próximos 7 dias (turmas, carteira e particulares do app).
final professorPlannableLessonsProvider =
    Provider.autoDispose<AsyncValue<List<PlannableLesson>>>((ref) {
  final range = ref.watch(lessonPlanUpcomingRangeProvider);
  return ref.watch(professorAgendaItemsProvider(range)).whenData(
        (items) => plannableLessonsFrom(
          items,
          fromKey: range.fromKey,
          toKey: range.toKey,
        ),
      );
});

/// Linhas da aba Próximas: cada aula com o plano dela.
final professorLessonPlanRowsProvider =
    Provider.autoDispose<AsyncValue<List<LessonPlanRow>>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  final plans = ref.watch(professorLessonPlansProvider).valueOrNull ?? const [];
  return ref.watch(professorPlannableLessonsProvider).whenData(
        (lessons) => lessonPlanRows(lessons: lessons, plans: plans, uid: uid),
      );
});

/// Dados e alunos da aula (`getLessonStudents`). Some quando a tela fecha.
final lessonPlanLessonProvider = FutureProvider.autoDispose
    .family<LessonPlanLesson, LessonPlanRef>((ref, key) {
  return ref
      .watch(professorLessonPlansRepositoryProvider)
      .fetchLessonStudents(key.kind, key.refId);
});

final professorLessonTemplatesProvider =
    StreamProvider.autoDispose<List<LessonTemplate>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref.watch(professorLessonPlansRepositoryProvider).watchTemplates(uid);
});

/// Exercícios próprios do professor.
final professorOwnExercisesProvider =
    StreamProvider.autoDispose<List<LessonExercise>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref.watch(professorLessonPlansRepositoryProvider).watchExercises(uid);
});

/// Biblioteca completa: os do professor primeiro, depois a NexaGO.
final lessonExerciseLibraryProvider =
    Provider.autoDispose<List<LessonExercise>>((ref) {
  final own = ref.watch(professorOwnExercisesProvider).valueOrNull ?? const [];
  return [...own, ...kNexagoExerciseLibrary];
});

// ── lado do aluno ────────────────────────────────────────────────────────

/// Planos publicados para o atleta da sessão.
final athleteLessonPlanViewsProvider =
    StreamProvider.autoDispose<List<LessonPlanView>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref.watch(professorLessonPlansRepositoryProvider).watchMyViews(uid);
});

final athleteLessonPlanViewProvider =
    StreamProvider.autoDispose.family<LessonPlanView?, String>((ref, viewId) {
  if (viewId.isEmpty || ref.watch(professorLinksUidProvider).isEmpty) {
    return Stream.value(null);
  }
  return ref.watch(professorLessonPlansRepositoryProvider).watchView(viewId);
});

/// A visão publicada para a aula (ou `null`, também carregando/erro).
final athleteLessonPlanViewForProvider =
    Provider.autoDispose.family<LessonPlanView?, LessonPlanRef>((ref, key) {
  final views = ref.watch(athleteLessonPlanViewsProvider).valueOrNull;
  return views == null ? null : lessonPlanViewFor(views, key.kind, key.refId);
});
