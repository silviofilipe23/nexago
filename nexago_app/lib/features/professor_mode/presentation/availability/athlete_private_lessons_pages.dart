import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/time/nexago_event_timezone.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../messages/application/messages_providers.dart';
import '../../../messages/domain/messages.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_availability_providers.dart';
import '../../domain/professor_actions_logic.dart' show professorDayLabel;
import '../../domain/professor_availability.dart';
import '../../infrastructure/professor_students_repository.dart'
    show ProfessorStudentsException;
import '../../application/professor_lesson_plans_providers.dart'
    show athleteLessonPlanViewsProvider;
import '../../domain/professor_lesson_plans.dart'
    show LessonPlanKind, lessonPlanViewFor;
import '../lesson_plans/athlete_lesson_plan_pages.dart'
    show openAthleteLessonPlan;
import '../wallet/professor_wallet_widgets.dart';
import '../widgets/professor_students_widgets.dart';
import 'availability_widgets.dart';

/// Lado do ATLETA (fase 10): as particulares dele com os professores e o
/// atalho para agendar com cada professor.
class AthletePrivateLessonsPage extends ConsumerStatefulWidget {
  const AthletePrivateLessonsPage({super.key});

  @override
  ConsumerState<AthletePrivateLessonsPage> createState() =>
      _AthletePrivateLessonsPageState();
}

class _AthletePrivateLessonsPageState
    extends ConsumerState<AthletePrivateLessonsPage> {
  String? _busyId;

  Future<void> _cancel(PrivateLesson l, {required bool late}) async {
    final sure = await confirmProfessorWalletAction(
      context,
      title: 'Cancelar particular?',
      body: late
          ? 'Você está dentro do prazo de cancelamento com custo: o '
              'professor pode cobrar esta aula.'
          : 'O professor recebe o aviso e o horário volta a ficar livre.',
      confirmLabel: 'Cancelar aula',
    );
    if (!sure || !mounted) return;
    setState(() => _busyId = l.id);
    try {
      final lateCancel =
          await ref.read(professorAvailabilityRepositoryProvider).cancel(l.id);
      if (mounted) {
        showAppSnackBar(
          context,
          lateCancel
              ? 'Particular cancelada fora do prazo sem custo.'
              : 'Particular cancelada.',
        );
      }
    } catch (e) {
      if (mounted) {
        showAppSnackBar(
          context,
          e is ProfessorStudentsException
              ? e.message
              : 'Não deu certo agora. Tente de novo.',
          isError: true,
        );
      }
    }
    if (mounted) setState(() => _busyId = null);
  }

  @override
  Widget build(BuildContext context) {
    final now = ref.watch(professorLinksClockProvider)();
    final todayKey = nexagoEventDayKey(now);
    final async = ref.watch(athletePrivateLessonsProvider);
    final list = async.valueOrNull;
    final professors = ref.watch(myProfessorsProvider).valueOrNull;
    final split = list == null ? null : splitPrivateLessons(list, now);
    final planViews =
        ref.watch(athleteLessonPlanViewsProvider).valueOrNull ?? const [];

    Widget lessonCard(PrivateLesson l, {required bool upcoming}) {
      final canCancel = upcoming && l.canCancelAt(now);
      // Plano publicado pelo professor para esta particular (H8).
      final plan = upcoming
          ? lessonPlanViewFor(planViews, LessonPlanKind.privateLesson, l.id)
          : null;
      return _LessonWithPolicy(
        key: Key('athlete-private-${l.id}'),
        lesson: l,
        now: now,
        builder: (late) => PrivateLessonCard(
          lesson: l,
          title: l.professorName,
          todayKey: todayKey,
          showStatus: true,
          footer: canCancel && late
              ? const ProfessorLinksNote(
                  'Dentro do prazo de cancelamento com custo.',
                  key: Key('athlete-private-late-warning'),
                  tone: ProfessorLinksNoteTone.yellow,
                )
              : l.status == PrivateLessonStatus.canceled && l.lateCancel
                  ? const ProfessorMutedText(
                      'Cancelada fora do prazo sem custo.')
                  : null,
          actions: [
            if (plan != null)
              ProfessorLinksGhostButton(
                key: Key('athlete-lesson-plan-link-${l.id}'),
                label: 'Ver plano',
                height: 42,
                onPressed: () => openAthleteLessonPlan(context, plan.id),
              ),
            if (canCancel)
              ProfessorLinksGhostButton(
                key: Key('athlete-private-cancel-${l.id}'),
                label: 'Cancelar',
                color: AppColors.live,
                height: 42,
                loading: _busyId == l.id,
                onPressed:
                    _busyId == null ? () => _cancel(l, late: late) : null,
              ),
          ],
        ),
      );
    }

    return ProfessorLinksScaffold(
      title: 'Minhas particulares',
      subtitle: 'AULAS COM SEUS PROFESSORES',
      onBack: () => popOrGo(context, AppRoutes.home),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (professors != null && professors.isNotEmpty) ...[
            const ProfessorLinksKicker('Agendar particular'),
            const SizedBox(height: 8),
            for (final p in professors) ...[
              _ProfessorBookRow(professor: p),
              const SizedBox(height: 8),
            ],
            const SizedBox(height: 14),
          ],
          if (split == null && async.hasError)
            ProfessorRetryCard(
              message: 'Não foi possível carregar suas particulares.',
              onRetry: () => ref.invalidate(athletePrivateLessonsProvider),
            )
          else if (split == null)
            const ProfessorWalletLoading()
          else if (split.upcoming.isEmpty && split.past.isEmpty)
            const ProfessorLinksCard(
              key: Key('athlete-private-empty'),
              child: ProfessorMutedText(
                'Nenhuma particular ainda. Escolha um horário livre do seu '
                'professor e agende pelo app.',
              ),
            )
          else ...[
            if (split.upcoming.isNotEmpty) ...[
              const ProfessorLinksKicker('Próximas'),
              const SizedBox(height: 8),
              for (final l in split.upcoming) ...[
                lessonCard(l, upcoming: true),
                const SizedBox(height: 10),
              ],
              const SizedBox(height: 12),
            ],
            if (split.past.isNotEmpty) ...[
              const ProfessorLinksKicker('Anteriores'),
              const SizedBox(height: 8),
              for (final l in split.past) ...[
                lessonCard(l, upcoming: false),
                const SizedBox(height: 10),
              ],
            ],
          ],
        ],
      ),
    );
  }
}

/// Lê o prazo sem custo do professor (documento publicado) para avisar do
/// cancelamento com custo.
class _LessonWithPolicy extends ConsumerWidget {
  const _LessonWithPolicy({
    super.key,
    required this.lesson,
    required this.now,
    required this.builder,
  });

  final PrivateLesson lesson;
  final DateTime now;
  final Widget Function(bool late) builder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    var late = false;
    if (lesson.status == PrivateLessonStatus.confirmed &&
        lesson.startAt.isAfter(now)) {
      final availability = ref
          .watch(professorAvailabilityProvider(lesson.professorUid))
          .valueOrNull;
      late = availability != null &&
          privateLessonIsLateCancel(
            lesson,
            now: now,
            freeCancelHours: availability.freeCancelHours,
          );
    }
    return builder(late);
  }
}

class _ProfessorBookRow extends StatelessWidget {
  const _ProfessorBookRow({required this.professor});

  final MyProfessor professor;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
      child: Row(
        children: [
          ArenaClassAvatar(
            initials: arenaClassInitials(professor.name),
            photoUrl: professor.photoUrl,
            size: 38,
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Text(
              professor.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: ProfessorLinksStyle.display(
                13.5,
                weight: FontWeight.w600,
                color: colors.onSurface,
              ),
            ),
          ),
          SizedBox(
            width: 120,
            child: ProfessorLinksGhostButton(
              key: Key('private-book-${professor.professorUid}'),
              label: 'Agendar',
              height: 38,
              onPressed: () => openPrivateLessonBooking(
                context,
                professorUid: professor.professorUid,
                professorName: professor.name,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Abre "Agendar particular" com o professor.
void openPrivateLessonBooking(
  BuildContext context, {
  required String professorUid,
  String? professorName,
}) {
  context.pushNamed(
    AppRouteNames.athletePrivateLessonBook,
    pathParameters: {'professorUid': professorUid},
    extra: professorName,
  );
}

/// Agendar particular: horários livres do professor nos próximos 14 dias
/// (`getProfessorOpenSlots`), por dia; dupla só quando ele aceita; o pedido
/// vai por `requestPrivateLesson`.
class AthletePrivateLessonBookPage extends ConsumerStatefulWidget {
  const AthletePrivateLessonBookPage({
    super.key,
    required this.professorUid,
    this.professorName,
  });

  final String professorUid;
  final String? professorName;

  @override
  ConsumerState<AthletePrivateLessonBookPage> createState() =>
      _AthletePrivateLessonBookPageState();
}

class _AthletePrivateLessonBookPageState
    extends ConsumerState<AthletePrivateLessonBookPage> {
  final _note = TextEditingController();
  String? _dayKey;
  OpenSlot? _slot;
  bool _pair = false;
  bool _sending = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _submit(ProfessorOpenSlots info) async {
    final slot = _slot;
    if (slot == null || _sending) return;
    setState(() => _sending = true);
    try {
      final result = await ref
          .read(professorAvailabilityRepositoryProvider)
          .requestLesson(PrivateLessonRequest(
            professorUid: widget.professorUid,
            startAt: slot.startAt,
            pair: info.acceptPairs && _pair,
            note: _note.text,
          ));
      if (!mounted) return;
      showAppSnackBar(
        context,
        result.status == PrivateLessonStatus.confirmed
            ? 'Particular agendada! Está nas suas particulares.'
            : 'Pedido enviado. Você recebe o aviso quando o professor '
                'responder.',
      );
      context.goNamed(AppRouteNames.athletePrivateLessons);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        e is ProfessorStudentsException
            ? e.message
            : 'Não deu certo agora. Tente de novo.',
        isError: true,
      );
      // "Este horário não está mais livre": recarrega a lista.
      setState(() {
        _sending = false;
        _slot = null;
      });
      ref.invalidate(professorOpenSlotsProvider(widget.professorUid));
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final async = ref.watch(professorOpenSlotsProvider(widget.professorUid));
    final info = async.valueOrNull;
    final todayKey =
        nexagoEventDayKey(ref.watch(professorLinksClockProvider)());
    final name = widget.professorName?.trim() ?? '';
    final days = info == null ? null : groupOpenSlotsByDay(info.slots);
    OpenSlotDay? day;
    if (days != null && days.isNotEmpty) {
      day = days.firstWhere(
        (d) => d.dateKey == _dayKey,
        orElse: () => days.first,
      );
    }

    Widget body;
    if (info == null && async.hasError) {
      body = ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          ProfessorRetryCard(
            message: async.error is ProfessorStudentsException
                ? (async.error! as ProfessorStudentsException).message
                : 'Não foi possível carregar os horários.',
            onRetry: () =>
                ref.invalidate(professorOpenSlotsProvider(widget.professorUid)),
          ),
        ],
      );
    } else if (info == null || days == null) {
      body = const ProfessorWalletLoading();
    } else if (day == null) {
      body = ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: const [
          ProfessorLinksCard(
            key: Key('private-book-empty'),
            child: ProfessorMutedText(
              'Sem horários livres nos próximos 14 dias',
            ),
          ),
        ],
      );
    } else {
      final selectedDay = day;
      body = Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                const ProfessorLinksKicker('Dia'),
                const SizedBox(height: 8),
                SizedBox(
                  height: 36,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: days.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 6),
                    itemBuilder: (_, i) => AvailabilityChoiceChip(
                      key: Key('private-book-day-${days[i].dateKey}'),
                      label: professorDayLabel(days[i].dateKey, todayKey),
                      selected: days[i].dateKey == selectedDay.dateKey,
                      onTap: () => setState(() {
                        _dayKey = days[i].dateKey;
                        _slot = null;
                      }),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                ProfessorLinksKicker(
                  'Horário · ${availabilityDurationLabel(info.durationMin)}',
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final s in selectedDay.slots)
                      AvailabilityChoiceChip(
                        key: Key(
                            'private-book-slot-${s.startAt.toIso8601String()}'),
                        label: s.timeLabel,
                        selected: _slot?.startAt == s.startAt,
                        onTap: () => setState(() => _slot = s),
                      ),
                  ],
                ),
                const SizedBox(height: 18),
                if (info.acceptPairs) ...[
                  ProfessorLinksCard(
                    padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
                    child: ProfessorWalletToggleRow(
                      key: const Key('private-book-pair'),
                      title: 'Em dupla',
                      subtitle: 'Você leva quem treina com você',
                      value: _pair,
                      onChanged: (v) => setState(() => _pair = v),
                    ),
                  ),
                  const SizedBox(height: 14),
                ],
                ProfessorWalletField(
                  key: const Key('private-book-note'),
                  label: 'Observação (opcional)',
                  hint: 'O que quer treinar?',
                  controller: _note,
                  maxLength: kPrivateLessonNoteMax,
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Icon(
                      Icons.info_outline_rounded,
                      size: 15,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: ProfessorMutedText(
                        privateLessonCancelPolicy(info.freeCancelHours),
                        key: const Key('private-book-policy'),
                      ),
                    ),
                  ],
                ),
                if (!info.autoConfirm) ...[
                  const SizedBox(height: 6),
                  const ProfessorMutedText(
                    'O professor confirma o horário pelo app.',
                  ),
                ],
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: ProfessorLinksPrimaryButton(
                key: const Key('private-book-submit'),
                label: info.autoConfirm ? 'Agendar' : 'Pedir horário',
                loading: _sending,
                onPressed: _slot == null ? null : () => _submit(info),
              ),
            ),
          ),
        ],
      );
    }

    return ProfessorLinksScaffold(
      title: 'Agendar particular',
      subtitle: name.isEmpty ? 'COM SEU PROFESSOR' : name.toUpperCase(),
      onBack: () => popOrGo(context, AppRoutes.athletePrivateLessons),
      body: body,
    );
  }
}
