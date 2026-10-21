import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/time/nexago_event_timezone.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arenas/data/booking_service.dart';
import '../../../arenas/domain/arena_booking_cancellation_policy.dart';
import '../../../arenas/domain/arena_booking_success_actions.dart';
import '../../../arenas/domain/arenas_providers.dart';
import '../../../arenas/domain/booking_providers.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/domain/arena_professor_link.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_agenda_providers.dart';
import '../../application/professor_wallet_providers.dart';
import '../../domain/professor_actions_logic.dart' show professorDayLabel;
import '../../domain/professor_lessons.dart';
import '../../domain/professor_wallet.dart';
import '../../domain/professor_wallet_logic.dart';
import '../widgets/professor_students_widgets.dart';
import '../wallet/professor_wallet_widgets.dart';
import '../../domain/professor_lesson_plans.dart' show LessonPlanKind;
import '../lesson_plans/lesson_plan_agenda_card.dart';
import 'professor_agenda_widgets.dart';

/// Início da aula como instante (o horário da reserva é parede de SP).
DateTime? professorLessonStart(ProfessorLesson l) {
  final d = DateTime.tryParse(l.date);
  final p = l.startTime.split(':');
  if (d == null || p.length < 2) return null;
  return nexagoEventDateTime(
    year: d.year,
    month: d.month,
    day: d.day,
    hour: int.tryParse(p[0]) ?? 0,
    minute: int.tryParse(p[1]) ?? 0,
  );
}

/// Situação da reserva, em palavras.
String professorBookingStatusLabel(String? status) => switch (status) {
      null => '—',
      'canceled' || 'cancelled' => 'cancelada',
      'expired' => 'PIX expirado',
      'rejected' => 'recusada',
      'pending_payment' || 'pending' || 'processing' => 'aguardando pagamento',
      'completed' => 'concluída',
      _ => 'confirmada',
    };

/// E5 Detalhe da aula particular da carteira: a reserva (arena, quadra,
/// situação, custo), a cobrança do aluno, "Como chegar", o aluno e
/// "Cancelar aula e reserva" pelo cancelamento de reserva do atleta (mesmo
/// prazo grátis do app).
class ProfessorAgendaLessonPage extends ConsumerStatefulWidget {
  const ProfessorAgendaLessonPage({super.key, required this.bookingId});

  final String bookingId;

  @override
  ConsumerState<ProfessorAgendaLessonPage> createState() =>
      _ProfessorAgendaLessonPageState();
}

class _ProfessorAgendaLessonPageState
    extends ConsumerState<ProfessorAgendaLessonPage> {
  bool _canceling = false;

  void _back() => popOrGo(context, AppRoutes.professorAgenda);

  Future<void> _openMaps(ProfessorLesson l) async {
    final arena = ref.read(arenaByIdProvider(l.arenaId)).valueOrNull;
    final query = ArenaBookingSuccessActions.mapsQueryFromArena(
      arenaName: l.arenaName,
      locationLabel: arena?.locationLabel,
    );
    final uri = Uri.parse(ArenaBookingSuccessActions.buildMapsSearchUrl(query));
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication)
        .catchError((_) => false);
    if (!ok && mounted) {
      showAppSnackBar(context, 'Não foi possível abrir o mapa.', isError: true);
    }
  }

  Future<void> _cancel(ProfessorLesson l, {required bool free}) async {
    if (!free) {
      showAppSnackBar(
        context,
        ArenaBookingCancellationPolicy.blockedCancellationMessage(
          arenaName: l.arenaName,
        ),
      );
      return;
    }
    final ok = await confirmProfessorWalletAction(
      context,
      title: 'Cancelar aula e reserva?',
      body: 'A reserva da ${l.courtName} na ${l.arenaName} é cancelada e o '
          'horário volta para a arena. Avise ${l.studentName}.',
      confirmLabel: 'Cancelar aula',
    );
    if (!ok || !mounted) return;
    setState(() => _canceling = true);
    try {
      await ref.read(bookingServiceProvider).cancelBooking(
            bookingId: l.bookingId,
            athleteId: ref.read(professorLinksUidProvider),
          );
      if (mounted) showAppSnackBar(context, 'Aula e reserva canceladas.');
    } catch (e) {
      if (mounted) {
        showAppSnackBar(
          context,
          e is BookingException
              ? e.message
              : 'Não foi possível cancelar a reserva.',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _canceling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final lessonsAsync = ref.watch(professorLessonsProvider);
    ProfessorLesson? lesson;
    for (final l in lessonsAsync.valueOrNull ?? const <ProfessorLesson>[]) {
      if (l.bookingId == widget.bookingId) lesson = l;
    }
    if (lesson == null) {
      return ProfessorLinksScaffold(
        title: 'Aula',
        onBack: _back,
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (!lessonsAsync.hasValue && !lessonsAsync.hasError)
              const ProfessorWalletLoading()
            else
              const ProfessorLinksCard(
                key: Key('professor-agenda-lesson-missing'),
                child: ProfessorMutedText('Aula não encontrada.'),
              ),
          ],
        ),
      );
    }
    final l = lesson;
    final colors = context.themeColors;
    final now = ref.watch(professorAgendaNowProvider);
    final palette = ref.watch(professorArenaPaletteProvider);
    ref.watch(arenaByIdProvider(l.arenaId));
    ProfessorCourtBooking? booking;
    for (final b in ref.watch(professorCourtBookingsProvider).valueOrNull ??
        const <ProfessorCourtBooking>[]) {
      if (b.id == l.bookingId) booking = b;
    }
    ProfessorWalletStudent? student;
    for (final s in ref.watch(professorWalletAllStudentsProvider).valueOrNull ??
        const <ProfessorWalletStudent>[]) {
      if (s.athleteId == l.athleteId) student = s;
    }
    final plans =
        ref.watch(professorWalletPlansProvider).valueOrNull ?? const [];
    final plan = professorPlanById(plans, student?.planId);
    final canceled = professorBookingIsVoid(booking?.status);
    final start = professorLessonStart(l);
    final clock = ref.watch(professorLinksClockProvider)();
    final upcoming = start != null && start.isAfter(clock);
    final free = start != null &&
        ArenaBookingCancellationPolicy.canCancelBookingForFree(start, clock);
    final deadline = start?.subtract(const Duration(
        hours:
            ArenaBookingCancellationPolicy.freeCancellationHoursBeforeStart));

    return ProfessorLinksScaffold(
      title: l.studentName,
      subtitle: '${professorDayLabel(l.date, now.todayKey)} · '
              '${l.startTime}–${l.endTime}'
          .toUpperCase(),
      onBack: _back,
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                ProfessorLinksCard(
                  borderColor: professorArenaColor(palette, l.arenaId)
                      .withValues(alpha: 0.5),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          const ProfessorAgendaTypeTag('Particular'),
                          const ProfessorLinkTypeTag(
                            ArenaProfessorLinkType.independent,
                            small: true,
                          ),
                          if (canceled)
                            const ProfessorWalletTag(
                              'Cancelada',
                              color: AppColors.live,
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      ProfessorInfoRow(
                        key: const Key('professor-agenda-lesson-booking'),
                        label: 'Reserva',
                        value: l.courtName,
                        sub: '${l.arenaName} · '
                            '${professorBookingStatusLabel(booking?.status)}',
                      ),
                      ProfessorInfoRow(
                        label: 'Custo de quadra',
                        value: '− ${formatBRL(l.courtCostReais)}',
                        valueColor: ProfessorLinksStyle.dim(colors),
                      ),
                      ProfessorInfoRow(
                        key: const Key('professor-agenda-lesson-plan'),
                        label: 'Cobrança',
                        value: plan?.name ?? 'Sem plano combinado',
                        sub: plan == null
                            ? 'Você cobra pela carteira'
                            : professorPlanSubtitle(plan),
                      ),
                      ProfessorInfoRow(
                        key: const Key('professor-agenda-lesson-deadline'),
                        label: 'Cancelamento grátis',
                        value: deadline == null
                            ? '—'
                            : free
                                ? 'até ${_wall(deadline)}'
                                : 'prazo encerrado',
                        last: true,
                      ),
                    ],
                  ),
                ),
                if (!canceled) ...[
                  const SizedBox(height: 18),
                  LessonPlanAgendaCard(
                    kind: LessonPlanKind.lesson,
                    refId: l.bookingId,
                  ),
                ],
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: ProfessorLinksGhostButton(
                        key: const Key('professor-agenda-lesson-maps'),
                        label: 'Como chegar',
                        onPressed: () => _openMaps(l),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ProfessorLinksGhostButton(
                        key: const Key('professor-agenda-lesson-student'),
                        label: 'Ver aluno',
                        onPressed: () => context.pushNamed(
                          AppRouteNames.professorWalletStudent,
                          pathParameters: {'athleteId': l.athleteId},
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                ProfessorLinksNote(
                  ArenaBookingCancellationPolicy.freeCancellationSubtitle(
                    l.arenaName,
                  ).replaceFirst('Depois disso', 'Depois do prazo'),
                  tone: ProfessorLinksNoteTone.blue,
                ),
              ],
            ),
          ),
          if (!canceled && upcoming)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: ProfessorLinksGhostButton(
                  key: const Key('professor-agenda-lesson-cancel'),
                  label: 'Cancelar aula e reserva',
                  color: AppColors.live,
                  height: 52,
                  loading: _canceling,
                  onPressed: () => _cancel(l, free: free),
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// "18:00 de qua" (parede de SP).
  static String _wall(DateTime instant) {
    const days = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
    final w = toNexagoEventLocal(instant);
    return '${w.hour.toString().padLeft(2, '0')}:'
        '${w.minute.toString().padLeft(2, '0')} de ${days[w.weekday - 1]}';
  }
}
