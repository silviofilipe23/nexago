import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/time/nexago_event_timezone.dart';
import '../../messages/application/messages_providers.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../domain/arena_professor_notices.dart';
import '../domain/professor_agenda.dart';
import '../domain/professor_today.dart';
import 'professor_agenda_providers.dart';
import 'professor_availability_providers.dart';
import 'professor_evaluations_providers.dart';
import 'professor_lesson_plans_providers.dart';
import 'professor_notices_providers.dart';

/// Hoje do modo Professor (J1/J2).

/// De quanto em quanto tempo o Hoje relê o relógio ("faltam N min", fase das
/// aulas). `null` desliga (testes: o relógio injetado manda).
final professorTodayRefreshIntervalProvider = Provider<Duration?>(
  (ref) => const Duration(seconds: 30),
);

/// Agora (instante). O Hoje invalida a cada [professorTodayRefreshIntervalProvider];
/// só quem é do Hoje depende dele.
final professorTodayNowProvider = Provider.autoDispose<DateTime>((ref) {
  return ref.watch(professorLinksClockProvider)();
});

/// Agora na parede de São Paulo: o dia, os minutos e o horário de parede.
final professorTodayWallProvider =
    Provider.autoDispose<({String todayKey, int nowMin, DateTime wall})>((ref) {
  final now = ref.watch(professorTodayNowProvider);
  final wall = toNexagoEventLocal(now);
  return (
    todayKey: nexagoEventDayKey(now),
    nowMin: wall.hour * 60 + wall.minute,
    wall: wall,
  );
});

/// Quantos dias para trás o Hoje olha (chamada que ficou aberta).
const int kProfessorTodayLookbackDays = 7;

/// Intervalo carregado: a última semana até hoje (uma chamada só).
final professorTodayRangeProvider =
    Provider.autoDispose<ProfessorAgendaRange>((ref) {
  final today = ref.watch(professorTodayWallProvider).todayKey;
  return (
    fromKey: professorShiftDay(today, -kProfessorTodayLookbackDays),
    toKey: today,
  );
});

/// Itens da agenda do intervalo do Hoje (todas as arenas).
final professorTodayItemsProvider =
    Provider.autoDispose<AsyncValue<List<ProfessorAgendaItem>>>((ref) {
  return ref.watch(professorAgendaItemsProvider(
    ref.watch(professorTodayRangeProvider),
  ));
});

/// Quantos comunicados da gestão o Hoje confere (os mais novos).
const int kProfessorTodayNoticesChecked = 10;

/// Comunicados da gestão ainda não lidos (entre os mais novos).
final professorTodayUnreadNoticesProvider =
    Provider.autoDispose<List<ArenaProfessorNotice>>((ref) {
  final all = ref.watch(arenaProfessorNoticesProvider).valueOrNull ?? const [];
  return [
    for (final n in all.take(kProfessorTodayNoticesChecked))
      if (!ref.watch(arenaProfessorNoticeReadProvider(n.id))) n,
  ];
});

/// "Precisa de você": só as fontes com contagem.
final professorTodayPendingsProvider =
    Provider.autoDispose<List<ProfessorTodayPending>>((ref) {
  final wall = ref.watch(professorTodayWallProvider);
  final now = ref.watch(professorTodayNowProvider);
  final uid = ref.watch(professorLinksUidProvider);
  final items = ref.watch(professorTodayItemsProvider).valueOrNull ?? const [];
  final plans = ref.watch(professorLessonPlansProvider).valueOrNull;
  final privates =
      ref.watch(professorPrivateLessonsProvider).valueOrNull ?? const [];
  return professorTodayPendings(
    todayKey: wall.todayKey,
    sessions: [
      for (final i in items)
        if (i.session case final s?) s,
    ],
    privateRequests: ref.watch(professorPendingPrivateLessonsProvider),
    reschedules: professorRescheduleRequests(privates, now),
    unreadMessages: ref.watch(unreadMessagesCountProvider),
    // Sem os planos carregados, não acusa "sem plano".
    unplanned: plans == null
        ? const []
        : professorUnplannedToday(
            items,
            todayKey: wall.todayKey,
            nowMin: wall.nowMin,
            plans: plans,
            uid: uid,
          ),
    toReview: ref.watch(professorLessonPlansToReviewProvider),
    evaluationsPending: ref.watch(evaluationPendingProvider).length,
    evaluationPeriod: ref.watch(professorEvaluationPeriodProvider),
    unreadNotices: ref.watch(professorTodayUnreadNoticesProvider),
  );
});
