import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arena/domain/aulas/arena_class.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../athlete/domain/agenda/class_agenda_entry.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_agenda_providers.dart';
import '../../application/professor_students_providers.dart';
import '../../domain/professor_agenda.dart';
import '../../domain/professor_actions_logic.dart' show professorDayLabel;
import '../../domain/professor_students_logic.dart'
    show professorScheduleLabel, professorShortDate;
import '../../infrastructure/professor_students_repository.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_agenda_widgets.dart';

/// E4 Detalhe da aula de turma (equipe da arena): local, recorrência, alunos
/// (quando o vínculo libera a chamada), "Abrir chamada" e "Cancelar" (com a
/// chave "Cancelar aulas" da arena). Sem repasse nem plano da aula — não há
/// dado para isso. Tipo pelo `classType` da agenda; a recorrência vem da
/// lista de turmas do professor.
class ProfessorAgendaSessionPage extends ConsumerWidget {
  const ProfessorAgendaSessionPage({
    super.key,
    required this.sessionId,
    this.entry,
  });

  final String sessionId;

  /// A aula como a Agenda carregou (vem pelo `extra` da rota).
  final ClassAgendaEntry? entry;

  void _back(BuildContext context) =>
      popOrGo(context, AppRoutes.professorAgenda);

  Future<void> _cancel(BuildContext context, WidgetRef ref) async {
    final e = entry!;
    final credits = await showDialog<bool>(
      context: context,
      builder: (ctx) => _CancelDialog(entry: e),
    );
    if (credits == null || !context.mounted) return;
    try {
      await ref.read(professorActionsRepositoryProvider).cancelSession(
            sessionId: e.sessionId,
            reason: 'teacher_absent',
            generateCredits: credits,
          );
      ref.invalidate(professorAgendaSessionsProvider);
      ref.invalidate(professorStudentsProvider);
      if (!context.mounted) return;
      showAppSnackBar(context, 'Aula cancelada. Os alunos foram avisados.');
      _back(context);
    } catch (err) {
      if (!context.mounted) return;
      showAppSnackBar(
        context,
        err is ProfessorStudentsException
            ? err.message
            : 'Não foi possível cancelar a aula.',
        isError: true,
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final e = entry;
    if (e == null) {
      return ProfessorLinksScaffold(
        title: 'Aula',
        onBack: () => _back(context),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: const [
            ProfessorLinksCard(
              key: Key('professor-agenda-session-missing'),
              child: ProfessorMutedText('Abra a aula pela Agenda.'),
            ),
          ],
        ),
      );
    }
    final now = ref.watch(professorAgendaNowProvider);
    final palette = ref.watch(professorArenaPaletteProvider);
    final snap = ref.watch(professorStudentsProvider).valueOrNull;
    final arena = snap?.arena(e.arenaId);
    ProfessorClassSummaryLite? klass;
    for (final c in snap?.classes ?? const []) {
      if (c.classId == e.classId) {
        klass = (type: c.type, weekdays: c.weekdays, startTime: c.startTime);
      }
    }
    final upcoming = e.date.compareTo(now.todayKey) >= 0;
    final canCancel =
        !e.isCanceled && upcoming && (arena?.actions.canCancelLessons ?? false);
    final canAttendance = !e.isCanceled && e.canManageLessons;

    return ProfessorLinksScaffold(
      title: e.className,
      subtitle: '${professorDayLabel(e.date, now.todayKey)} · '
              '${e.startTime}–${e.endTime}'
          .toUpperCase(),
      onBack: () => _back(context),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                ProfessorLinksCard(
                  borderColor: professorArenaColor(palette, e.arenaId)
                      .withValues(alpha: 0.5),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          ArenaClassTypeTag(
                            type: professorSessionType(e, {
                              if (klass != null) e.classId: klass.type,
                            }),
                          ),
                          if (arena?.type != null)
                            ProfessorLinkTypeTag(arena!.type!, small: true),
                          if (e.isCanceled)
                            const ArenaClassTag(
                              label: 'Cancelada',
                              color: AppColors.live,
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      ProfessorInfoRow(
                        label: 'Local',
                        value: e.courtName.isEmpty ? '—' : e.courtName,
                        sub: e.arenaName,
                      ),
                      ProfessorInfoRow(
                        key: const Key('professor-agenda-session-recurrence'),
                        label: 'Recorrência',
                        value: klass == null || klass.weekdays.isEmpty
                            ? 'Aula avulsa'
                            : professorScheduleLabel(
                                klass.weekdays,
                                klass.startTime,
                              ),
                        sub: professorShortDate(e.date),
                      ),
                      ProfessorInfoRow(
                        label: 'Alunos',
                        value:
                            e.studentCount == null ? '—' : '${e.studentCount}',
                        last: true,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 22),
                const ProfessorLinksKicker('Alunos'),
                const SizedBox(height: 6),
                if (!e.canManageLessons)
                  const ProfessorLinksNote(
                    'A arena não liberou "Gerenciar as próprias aulas" no seu '
                    'vínculo: os alunos desta aula ficam com a gestão.',
                    key: Key('professor-agenda-session-no-roster'),
                    tone: ProfessorLinksNoteTone.yellow,
                  )
                else
                  _Roster(sessionId: e.sessionId),
                if (!upcoming || e.isCanceled) ...[
                  const SizedBox(height: 18),
                  ProfessorMutedText(
                    e.isCanceled
                        ? 'Esta aula foi cancelada.'
                        : 'Aula de ${professorShortDate(e.date)}.',
                  ),
                ],
              ],
            ),
          ),
          // Sem rodapé: aula passada/cancelada ou vínculo sem as chaves.
          if (canCancel || canAttendance)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: Row(
                  children: [
                    if (canCancel)
                      Expanded(
                        child: ProfessorLinksGhostButton(
                          key: const Key('professor-agenda-session-cancel'),
                          label: canAttendance ? 'Cancelar' : 'Cancelar aula',
                          height: 52,
                          color: AppColors.live,
                          onPressed: () => _cancel(context, ref),
                        ),
                      ),
                    if (canCancel && canAttendance) const SizedBox(width: 8),
                    if (canAttendance)
                      Expanded(
                        flex: 2,
                        child: ProfessorLinksPrimaryButton(
                          key: const Key('professor-agenda-session-attendance'),
                          label: 'Abrir chamada',
                          onPressed: () => context.pushNamed(
                            AppRouteNames.professorClassAttendance,
                            pathParameters: {'sessionId': e.sessionId},
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Tipo e recorrência da turma (da lista de turmas do professor).
typedef ProfessorClassSummaryLite = ({
  ArenaClassType type,
  List<int> weekdays,
  String startTime,
});

class _Roster extends ConsumerWidget {
  const _Roster({required this.sessionId});

  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final async = ref.watch(professorSessionRosterProvider(sessionId));
    final roster = async.valueOrNull;
    if (roster == null && async.hasError) {
      return ProfessorRetryCard(
        message: async.error is ProfessorStudentsException
            ? (async.error as ProfessorStudentsException).message
            : 'Não foi possível carregar os alunos.',
        onRetry: () =>
            ref.invalidate(professorSessionRosterProvider(sessionId)),
      );
    }
    if (roster == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(child: CircularProgressIndicator(color: AppColors.brand)),
      );
    }
    if (roster.students.isEmpty) {
      return const ProfessorMutedText('Nenhum aluno nesta aula.');
    }
    return Column(
      children: [
        for (final s in roster.students)
          Padding(
            key: Key('professor-agenda-roster-${s.studentId}'),
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                ArenaClassAvatar(
                  initials: arenaClassInitials(s.name),
                  photoUrl: s.photoUrl,
                  size: 34,
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Text(
                    s.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      13,
                      weight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                if (s.kind != 'regular')
                  ArenaClassTag(
                    label: s.kind == 'makeup' ? 'Reposição' : 'Experimental',
                    color: AppColors.pending,
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

/// Confirma o cancelamento; devolve se dá crédito de reposição (`null` =
/// desistiu).
class _CancelDialog extends StatefulWidget {
  const _CancelDialog({required this.entry});

  final ClassAgendaEntry entry;

  @override
  State<_CancelDialog> createState() => _CancelDialogState();
}

class _CancelDialogState extends State<_CancelDialog> {
  bool _credits = true;

  @override
  Widget build(BuildContext context) {
    final e = widget.entry;
    return AlertDialog(
      title: const Text('Cancelar esta aula?'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${e.className} de ${professorShortDate(e.date)} às '
            '${e.startTime}. Os alunos são avisados pelo app.',
          ),
          const SizedBox(height: 8),
          CheckboxListTile(
            key: const Key('professor-agenda-cancel-credits'),
            contentPadding: EdgeInsets.zero,
            value: _credits,
            onChanged: (v) => setState(() => _credits = v ?? true),
            title: const Text('Dar crédito de reposição'),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Voltar'),
        ),
        FilledButton(
          key: const Key('professor-agenda-cancel-confirm'),
          style: FilledButton.styleFrom(backgroundColor: AppColors.live),
          onPressed: () => Navigator.pop(context, _credits),
          child: const Text('Cancelar aula'),
        ),
      ],
    );
  }
}
