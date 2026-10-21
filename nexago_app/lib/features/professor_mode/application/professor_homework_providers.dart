import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../professor_links/application/professor_links_providers.dart';
import '../domain/professor_homework.dart';
import '../domain/professor_lesson_plans.dart';
import '../infrastructure/professor_homework_repository.dart';
import 'professor_wallet_providers.dart' show professorWalletTodayKeyProvider;

export '../infrastructure/professor_homework_repository.dart'
    show professorHomeworkRepositoryProvider;

/// Progresso do treino em casa de todos os alunos do professor, por `viewId`.
final professorHomeworkProgressProvider =
    StreamProvider.autoDispose<Map<String, ProfessorHomeworkProgress>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const {});
  return ref
      .watch(professorHomeworkRepositoryProvider)
      .watchProgress(uid)
      .map((list) => {for (final p in list) p.viewId: p});
});

/// Progresso de uma visão (`planId_athleteId`), ou `null`.
final professorHomeworkProgressByViewProvider = Provider.autoDispose
    .family<ProfessorHomeworkProgress?, String>((ref, viewId) {
  return ref.watch(professorHomeworkProgressProvider).valueOrNull?[viewId];
});

/// Visões (feedbacks) do professor para o aluno.
final professorStudentViewsProvider = StreamProvider.autoDispose
    .family<List<LessonPlanView>, String>((ref, athleteId) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty || athleteId.isEmpty) return Stream.value(const []);
  return ref
      .watch(professorHomeworkRepositoryProvider)
      .watchStudentViews(uid, athleteId);
});

/// Tarefas do aluno que valem hoje (a semana da tarefa), as mais novas
/// primeiro, com os dias que ele já fez.
final professorStudentHomeworkProvider = Provider.autoDispose
    .family<AsyncValue<List<ProfessorHomeworkWeek>>, String>((ref, athleteId) {
  final today = ref.watch(professorWalletTodayKeyProvider);
  final progress =
      ref.watch(professorHomeworkProgressProvider).valueOrNull ?? const {};
  return ref.watch(professorStudentViewsProvider(athleteId)).whenData((views) {
    final weeks = <ProfessorHomeworkWeek>[];
    for (final v in views) {
      final hw = v.feedback?.homework;
      final sentAt = v.feedback?.sentAt;
      if (hw == null || sentAt == null) continue;
      final week = professorHomeworkWeek(
        viewId: v.id,
        homework: hw,
        sentAt: sentAt,
        progress: progress[v.id],
        lessonTitle: v.lessonTitle,
      );
      if (week.openOn(today)) weeks.add(week);
    }
    weeks.sort((a, b) => b.windowDays.first.compareTo(a.windowDays.first));
    return weeks;
  });
});
