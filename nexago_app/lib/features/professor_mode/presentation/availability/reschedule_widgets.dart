import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/time/nexago_event_timezone.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_availability_providers.dart';
import '../../domain/professor_availability.dart';
import '../../infrastructure/professor_students_repository.dart'
    show ProfessorStudentsException;
import '../widgets/professor_students_widgets.dart';
import 'availability_widgets.dart';

/// Remarcação de particular (D3): a folha com os horários livres do
/// professor e os dois fluxos (pedir e responder), usados pelo cartão da
/// conversa, por "Minhas particulares" e pela Disponibilidade.

/// Escolhe um horário livre do professor nos próximos 14 dias, sem o
/// horário atual da aula. `null` = fechou sem escolher.
Future<OpenSlot?> showRescheduleSlotPicker(
  BuildContext context, {
  required String professorUid,
  required DateTime currentStartAt,
}) =>
    showProfessorLinksSheet<OpenSlot>(
      context,
      builder: (_) => RescheduleSlotSheet(
        professorUid: professorUid,
        currentStartAt: currentStartAt,
      ),
    );

/// Folha → `requestLessonReschedule` → aviso. `true` = pedido enviado.
Future<bool> requestLessonRescheduleFlow(
  BuildContext context,
  WidgetRef ref, {
  required String lessonId,
  required String professorUid,
  required DateTime currentStartAt,
  required String successMessage,
}) async {
  final repo = ref.read(professorAvailabilityRepositoryProvider);
  final slot = await showRescheduleSlotPicker(
    context,
    professorUid: professorUid,
    currentStartAt: currentStartAt,
  );
  if (slot == null || !context.mounted) return false;
  try {
    await repo.requestReschedule(lessonId, slot.startAt);
    if (context.mounted) showAppSnackBar(context, successMessage);
    return true;
  } catch (e) {
    if (context.mounted) _showError(context, e);
    return false;
  }
}

/// `respondLessonReschedule` → aviso (o erro do servidor, como "O horário
/// pedido não está mais livre. Sugira outro.", vai como veio).
Future<bool> respondLessonRescheduleFlow(
  BuildContext context,
  WidgetRef ref, {
  required String lessonId,
  required bool accept,
}) async {
  final repo = ref.read(professorAvailabilityRepositoryProvider);
  try {
    await repo.respondReschedule(lessonId, accept: accept);
    if (context.mounted) {
      showAppSnackBar(
        context,
        accept ? 'Particular remarcada.' : 'Remarcação recusada.',
      );
    }
    return true;
  } catch (e) {
    if (context.mounted) _showError(context, e);
    return false;
  }
}

/// Chip "Remarcar" da conversa: com uma particular vai direto aos horários;
/// com mais de uma, escolhe qual antes.
Future<bool> rescheduleOneOfLessonsFlow(
  BuildContext context,
  WidgetRef ref, {
  required List<PrivateLesson> lessons,
  required String successMessage,
}) async {
  if (lessons.isEmpty) return false;
  final lesson = lessons.length == 1
      ? lessons.single
      : await showProfessorLinksSheet<PrivateLesson>(
          context,
          builder: (_) => _PickLessonSheet(lessons: lessons),
        );
  if (lesson == null || !context.mounted) return false;
  return requestLessonRescheduleFlow(
    context,
    ref,
    lessonId: lesson.id,
    professorUid: lesson.professorUid,
    currentStartAt: lesson.startAt,
    successMessage: successMessage,
  );
}

class _PickLessonSheet extends StatelessWidget {
  const _PickLessonSheet({required this.lessons});

  final List<PrivateLesson> lessons;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksSheetBody(
      key: const Key('reschedule-pick-lesson'),
      title: 'Qual particular?',
      subtitle: 'Escolha a aula que vai mudar de horário',
      children: [
        for (final l in lessons)
          ProfessorLinksCard(
            key: Key('reschedule-pick-${l.id}'),
            onTap: () => Navigator.of(context).pop(l),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    rescheduleSlotLabel(l.startAt),
                    style: ProfessorLinksStyle.display(
                      14,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                Text(
                  availabilityDurationLabel(l.durationMin),
                  style: ProfessorLinksStyle.mono(
                    11,
                    color: ProfessorLinksStyle.mute(colors),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

void _showError(BuildContext context, Object e) => showAppSnackBar(
      context,
      e is ProfessorStudentsException
          ? e.message
          : 'Não deu certo agora. Tente de novo.',
      isError: true,
    );

class RescheduleSlotSheet extends ConsumerStatefulWidget {
  const RescheduleSlotSheet({
    super.key,
    required this.professorUid,
    required this.currentStartAt,
  });

  final String professorUid;
  final DateTime currentStartAt;

  @override
  ConsumerState<RescheduleSlotSheet> createState() =>
      _RescheduleSlotSheetState();
}

class _RescheduleSlotSheetState extends ConsumerState<RescheduleSlotSheet> {
  String? _dayKey;
  OpenSlot? _slot;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(professorOpenSlotsProvider(widget.professorUid));
    final info = async.valueOrNull;
    final todayKey =
        nexagoEventDayKey(ref.watch(professorLinksClockProvider)());
    final days = info == null
        ? null
        : groupOpenSlotsByDay([
            for (final s in info.slots)
              if (!s.startAt.isAtSameMomentAs(widget.currentStartAt)) s,
          ]);
    OpenSlotDay? day;
    if (days != null && days.isNotEmpty) {
      day = days.firstWhere(
        (d) => d.dateKey == _dayKey,
        orElse: () => days.first,
      );
    }

    final List<Widget> children;
    if (info == null && async.hasError) {
      children = [
        ProfessorRetryCard(
          message: async.error is ProfessorStudentsException
              ? (async.error! as ProfessorStudentsException).message
              : 'Não foi possível carregar os horários.',
          onRetry: () =>
              ref.invalidate(professorOpenSlotsProvider(widget.professorUid)),
        ),
      ];
    } else if (info == null || days == null) {
      children = const [
        Padding(
          padding: EdgeInsets.all(24),
          child: Center(
            child: CircularProgressIndicator(color: AppColors.brand),
          ),
        ),
      ];
    } else if (day == null) {
      children = const [
        ProfessorMutedText(
          'Sem horários livres nos próximos 14 dias',
          key: Key('reschedule-empty'),
        ),
      ];
    } else {
      final selectedDay = day;
      children = [
        OpenSlotDayTimePicker(
          days: days,
          selectedDay: selectedDay,
          selectedSlot: _slot,
          todayKey: todayKey,
          durationMin: info.durationMin,
          keyPrefix: 'reschedule',
          onDay: (d) => setState(() {
            _dayKey = d.dateKey;
            _slot = null;
          }),
          onSlot: (s) => setState(() => _slot = s),
        ),
        const SizedBox(height: 4),
        const ProfessorMutedText(
          'A particular muda de horário; nada mais é alterado.',
        ),
        ProfessorLinksPrimaryButton(
          key: const Key('reschedule-submit'),
          label: 'Propor horário',
          onPressed:
              _slot == null ? null : () => Navigator.of(context).pop(_slot),
        ),
      ];
    }

    return ProfessorLinksSheetBody(
      key: const Key('reschedule-sheet'),
      title: 'Remarcar particular',
      subtitle: 'Atual: ${rescheduleSlotLabel(widget.currentStartAt)}',
      children: children,
    );
  }
}
