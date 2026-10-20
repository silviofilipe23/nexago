import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../data/arena_class_repository.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_staff_role.dart';
import '../../domain/aulas/arena_class_enrollment_providers.dart';
import '../../domain/aulas/arena_class_logic.dart';
import '../../domain/aulas/arena_class_providers.dart';
import '../../domain/aulas/arena_class_session.dart';
import '../widgets/arena_async_state.dart';
import 'arena_class_cancel_sheet.dart';
import 'arena_class_extra_sheet.dart';
import 'widgets/arena_class_atoms.dart';
import 'widgets/arena_class_attendance_widgets.dart';

/// Chamada de uma aula (A2): presente / falta / avisou por aluno, "Todos
/// presentes" e "Fechar chamada" (`saveArenaClassAttendance`). O menu ⋯ abre
/// o cancelamento (A4); "Encaixar aluno" abre a reposição/experimental (A3).
///
/// Só entra quem faz a turma naquele dia da semana (`weekdays` do aluno) e
/// não está pausado; os encaixes da aula vêm no fim, com etiqueta.
///
/// As marcas ficam num rascunho local até o gestor fechar a chamada — marcar
/// aluno a aluno não dispara uma callable por toque.
class ArenaClassAttendancePage extends ConsumerStatefulWidget {
  const ArenaClassAttendancePage({super.key, required this.sessionId});

  final String sessionId;

  @override
  ConsumerState<ArenaClassAttendancePage> createState() =>
      _ArenaClassAttendancePageState();
}

class _ArenaClassAttendancePageState
    extends ConsumerState<ArenaClassAttendancePage> {
  /// Marcas que o gestor mexeu e ainda não gravou. Fora delas, vale o que
  /// está no servidor (outro aparelho pode estar fazendo a chamada).
  final Map<String, AttendanceMark?> _edits = {};
  bool _saving = false;

  @override
  Widget build(BuildContext context) {
    final sessionAsync = ref.watch(arenaClassSessionProvider(widget.sessionId));
    final session = sessionAsync.valueOrNull;
    final canWrite = ref.watch(arenaCanWriteProvider(ArenaArea.agenda));

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ArenaClassHeader(
              eyebrow: 'CHAMADA',
              title: session?.className ?? 'Aula',
              subtitle: session == null
                  ? null
                  : '${session.startTime}–${session.endTime} · '
                          '${session.courtName} · '
                          '${session.teacherName.split(' ').first}'
                      .toUpperCase(),
              onBack: () => context.pop(),
              trailing: session != null && canWrite && session.isScheduled
                  ? _MoreMenu(onCancel: () => _openCancel(session))
                  : null,
            ),
            Expanded(
              child: sessionAsync.when(
                data: (s) {
                  if (s == null) {
                    return const ArenaEmptyState(
                      title: 'Aula não encontrada',
                      message: 'Esta aula não existe mais — a turma pode ter '
                          'sido remarcada ou encerrada.',
                      icon: Icons.event_busy_outlined,
                    );
                  }
                  return _buildBody(context, s, canWrite: canWrite);
                },
                loading: () =>
                    const ArenaLoadingState(label: 'Carregando chamada...'),
                error: (e, _) => ArenaErrorState(message: '$e'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(
    BuildContext context,
    ArenaClassSession session, {
    required bool canWrite,
  }) {
    final studentsAsync = ref.watch(
      arenaClassStudentsProvider(
        (arenaId: session.arenaId, classId: session.classId),
      ),
    );
    final students = studentsAsync.valueOrNull;
    if (students == null) {
      return studentsAsync.hasError
          ? ArenaErrorState(message: '${studentsAsync.error}')
          : const ArenaLoadingState(label: 'Carregando alunos...');
    }

    // Edição que o servidor já confirmou deixa de ser edição. Podar aqui (e
    // não ao fim do save) evita a lista piscar o valor antigo até o snapshot
    // novo chegar. Não muda o que é desenhado, então dispensa setState.
    _edits.removeWhere((id, mark) => session.attendance[id] == mark);
    // Aula cancelada (aqui ou em outro aparelho): marca não gravada não vale
    // mais nada — a tela mostra só o que ficou registrado.
    if (session.isCanceled) _edits.clear();

    final todayKey = ref.watch(arenaClassTodayKeyProvider);
    final roster = arenaClassAttendanceRoster(session, students);
    final draft = ArenaClassAttendanceDraft.fromSession(
      roster.map((s) => s.id),
      session.attendance,
    );
    final current = ArenaClassAttendanceDraft({
      for (final e in draft.marks.entries)
        e.key: _edits.containsKey(e.key) ? _edits[e.key] : e.value,
    });
    final summary = current.summary;
    final open = arenaClassAttendanceOpen(session, todayKey);
    final editable = canWrite && open && !_saving;
    final dirty = current.differsFrom(session.attendance);

    final notice = _notice(session, canWrite: canWrite, open: open);
    // Encaixe só em aula de hoje em diante que ainda vai acontecer.
    final canAddExtra = canWrite &&
        session.isScheduled &&
        session.date.compareTo(todayKey) >= 0 &&
        !_saving;
    // Tirar encaixe: enquanto a chamada não fechou (o backend recusa depois).
    final canRemoveExtra = canWrite && session.isScheduled && !_saving;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
            children: [
              if (!session.isCanceled) ...[
                ArenaClassAttendanceSummaryCard(
                  summary: summary,
                  onAllPresent: editable && summary.unmarked > 0
                      ? () => setState(() {
                            for (final e in current
                                .withUnmarkedPresent()
                                .marks
                                .entries) {
                              if (current.marks[e.key] != e.value) {
                                _edits[e.key] = e.value;
                              }
                            }
                          })
                      : null,
                  allPresentLabel: current.hasAnyMark
                      ? 'Demais presentes'
                      : 'Todos presentes',
                  onAddExtra:
                      canAddExtra ? () => _openExtra(session, students) : null,
                ),
                if (notice != null) const SizedBox(height: 12),
              ],
              if (notice != null) notice,
              const SizedBox(height: 8),
              if (roster.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 24),
                  child: ArenaEmptyState(
                    title: 'Ninguém nesta aula',
                    message: 'Nenhum aluno faz esta turma neste dia. '
                        'Matricule pela Nova matrícula ou encaixe uma '
                        'reposição.',
                    icon: Icons.person_add_alt_outlined,
                  ),
                ),
              for (final entry in roster)
                _StudentRow(
                  entry: entry,
                  mark: current.marks[entry.id],
                  onMark: editable
                      ? (mark) => setState(() => _edits[entry.id] = mark)
                      : null,
                  onOpen: entry.isExtra
                      ? null
                      : () => context.pushNamed(
                            AppRouteNames.arenaClassStudent,
                            pathParameters: {'studentId': entry.id},
                          ),
                  onRemove: entry.isExtra && canRemoveExtra
                      ? () => _removeExtra(session, entry)
                      : null,
                ),
            ],
          ),
        ),
        if (canWrite && open)
          ArenaClassAttendanceFooter(
            label: session.isCompleted
                ? 'Salvar alterações'
                : 'Fechar chamada · ${summary.present} '
                    'presente${summary.present == 1 ? '' : 's'}',
            saving: _saving,
            onPressed: _saving || (session.isCompleted && !dirty)
                ? null
                : () => _save(session, current),
          ),
      ],
    );
  }

  Widget? _notice(
    ArenaClassSession session, {
    required bool canWrite,
    required bool open,
  }) {
    if (session.isCanceled) {
      final reason = session.cancelReason;
      final why = reason == null || reason == ArenaClassCancelReason.other
          ? ''
          : ' (${reason.label.toLowerCase()})';
      final note = session.cancelNote;
      return ArenaClassAttendanceNotice(
        color: AppColors.live,
        icon: Icons.event_busy_rounded,
        text: 'Aula cancelada$why. A quadra foi liberada na agenda.'
            '${note != null && note.isNotEmpty ? '\n$note' : ''}',
      );
    }
    if (!open) {
      final d = session.date;
      final label =
          d.length == 10 ? '${d.substring(8)}/${d.substring(5, 7)}' : d;
      return ArenaClassAttendanceNotice(
        color: context.themeColors.onSurfaceMuted,
        icon: Icons.lock_clock_outlined,
        text: 'A chamada abre no dia da aula ($label).',
      );
    }
    if (session.isCompleted) {
      final closed = session.closedAt;
      final at = closed == null
          ? ''
          : ' às ${closed.hour.toString().padLeft(2, '0')}:'
              '${closed.minute.toString().padLeft(2, '0')}';
      return ArenaClassAttendanceNotice(
        color: AppColors.win,
        icon: Icons.check_circle_outline_rounded,
        text: 'Chamada fechada$at.'
            '${canWrite ? ' Ainda dá para corrigir uma marca.' : ''}',
      );
    }
    if (!canWrite) {
      return ArenaClassAttendanceNotice(
        color: context.themeColors.onSurfaceMuted,
        icon: Icons.visibility_outlined,
        text: 'Só leitura — sua função na arena não registra chamada.',
      );
    }
    return null;
  }

  Future<void> _save(
    ArenaClassSession session,
    ArenaClassAttendanceDraft draft,
  ) async {
    final summary = draft.summary;
    final closing = !session.isCompleted;
    if (closing && summary.unmarked > 0) {
      final n = summary.unmarked;
      final go = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: ctx.themeColors.surfaceSheet,
          title: const Text('Fechar com alunos sem marca?'),
          content: Text(
            '$n aluno${n == 1 ? '' : 's'} ficam sem registro nesta aula. '
            'Dá para corrigir depois.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Voltar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Fechar chamada'),
            ),
          ],
        ),
      );
      if (go != true || !mounted) return;
    }

    setState(() => _saving = true);
    try {
      await ref.read(arenaClassRepositoryProvider).saveAttendance(
            sessionId: session.id,
            marks: draft.toPayload(),
            close: true,
          );
      if (!mounted) return;
      final p = summary.present;
      showAppSnackBar(
        context,
        closing
            ? 'Chamada fechada · $p presente${p == 1 ? '' : 's'}.'
            : 'Chamada atualizada.',
      );
      if (closing) context.pop();
    } on ArenaClassException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível salvar a chamada. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _openCancel(ArenaClassSession session) async {
    final students = ref
            .read(
              arenaClassStudentsProvider(
                (arenaId: session.arenaId, classId: session.classId),
              ),
            )
            .valueOrNull ??
        const <ArenaClassStudent>[];
    // Quem faria esta aula: alunos do dia + encaixes (mesmo público do push
    // de `cancelClassSessionCore`).
    final regulars = arenaClassRegularsOn(
      students,
      arenaClassDateKeyWeekday(session.date),
    ).where((s) => !session.extras.containsKey(s.id)).toList();
    final extras = session.extras.values;
    final result = await showArenaClassCancelSheet(
      context,
      session: session,
      studentCount: regulars.length + extras.length,
      studentsWithAccount: regulars.where((s) => s.hasAccount).length +
          extras.where((e) => e.athleteId != null).length,
      regularCount: regulars.length,
    );
    if (result == null || !mounted) return;
    final n = result.notified;
    final c = result.credited;
    final credits =
        c > 0 ? ' · $c crédito${c == 1 ? '' : 's'} de reposição' : '';
    showAppSnackBar(
      context,
      n > 0
          ? 'Aula cancelada. Quadra liberada · $n aluno${n == 1 ? '' : 's'} '
              'avisado${n == 1 ? '' : 's'}$credits.'
          : 'Aula cancelada. Quadra liberada na agenda$credits.',
    );
  }

  Future<void> _openExtra(
    ArenaClassSession session,
    List<ArenaClassStudent> students,
  ) async {
    final message = await showArenaClassExtraSheet(
      context,
      session: session,
      students: students,
    );
    if (message == null || !mounted) return;
    showAppSnackBar(context, message);
  }

  Future<void> _removeExtra(
    ArenaClassSession session,
    ArenaClassRosterEntry entry,
  ) async {
    final makeup = entry.kind == ArenaClassRosterKind.makeup;
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.themeColors.surfaceSheet,
        title: Text('Tirar ${entry.name} da aula?'),
        content: Text(
          makeup
              ? 'O crédito de reposição volta a ficar disponível para outra '
                  'aula.'
              : 'A vaga da aula experimental fica livre de novo.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Tirar da aula'),
          ),
        ],
      ),
    );
    if (go != true || !mounted) return;
    setState(() => _saving = true);
    try {
      await ref.read(arenaClassRepositoryProvider).removeExtra(
            sessionId: session.id,
            studentId: entry.id,
          );
      _edits.remove(entry.id);
      if (!mounted) return;
      showAppSnackBar(
        context,
        makeup
            ? '${entry.name} saiu da aula. O crédito voltou.'
            : '${entry.name} saiu da aula.',
      );
    } on ArenaClassException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível tirar da aula. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _MoreMenu extends StatelessWidget {
  const _MoreMenu({required this.onCancel});

  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: colors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: SizedBox(
        width: 44,
        height: 44,
        child: PopupMenuButton<String>(
          tooltip: 'Mais ações',
          icon: Icon(Icons.more_vert_rounded, color: colors.onSurface),
          color: colors.surfaceSheet,
          onSelected: (_) => onCancel(),
          itemBuilder: (_) => const [
            PopupMenuItem<String>(
              value: 'cancel',
              child: Row(
                children: [
                  Icon(Icons.event_busy_rounded,
                      color: AppColors.live, size: 18),
                  SizedBox(width: 10),
                  Text('Cancelar aula'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StudentRow extends StatelessWidget {
  const _StudentRow({
    required this.entry,
    required this.mark,
    required this.onMark,
    required this.onOpen,
    required this.onRemove,
  });

  final ArenaClassRosterEntry entry;
  final AttendanceMark? mark;

  /// `null` = só leitura.
  final ValueChanged<AttendanceMark?>? onMark;

  /// Abre a página do aluno (alunos da turma).
  final VoidCallback? onOpen;

  /// Tira o encaixe da aula.
  final VoidCallback? onRemove;

  String get _subtitle {
    final s = entry.student;
    switch (entry.kind) {
      case ArenaClassRosterKind.makeup:
        return 'Reposição com crédito';
      case ArenaClassRosterKind.trial:
        return entry.extra?.athleteId != null
            ? 'Aula experimental · Atleta NexaGO'
            : 'Aula experimental';
      case ArenaClassRosterKind.regular:
        if (s == null) return '';
        if (s.isPaused) return 'Plano pausado';
        if (!s.isActive) return 'Saiu da turma';
        final plan = s.planName;
        if (plan != null) return plan;
        return s.hasAccount ? 'Atleta NexaGO' : (s.phone ?? 'Aluno sem conta');
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final student = entry.student;
    final tag = switch (entry.kind) {
      ArenaClassRosterKind.makeup => const ArenaClassTag(
          label: 'Reposição',
          color: AppColors.win,
        ),
      ArenaClassRosterKind.trial => const ArenaClassTag(
          label: 'Experimental',
          color: AppColors.pending,
        ),
      ArenaClassRosterKind.regular => null,
    };
    final info = Row(
      children: [
        ArenaClassAvatar(
          initials: arenaClassInitials(entry.name),
          photoUrl: student?.photoUrl,
          zoomName: entry.name,
          zoomMeta: student?.planName,
        ),
        const SizedBox(width: 11),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Flexible(
                    child: Text(
                      entry.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                  if (tag != null) ...[const SizedBox(width: 6), tag],
                ],
              ),
              const SizedBox(height: 2),
              Text(
                _subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11, color: colors.onSurfaceMuted),
              ),
            ],
          ),
        ),
      ],
    );
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 9),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: colors.onSurface.withValues(alpha: 0.05)),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: onOpen == null
                ? info
                : Semantics(
                    button: true,
                    label: 'Abrir aluno ${entry.name}',
                    child: InkWell(
                      onTap: onOpen,
                      borderRadius: BorderRadius.circular(12),
                      child: info,
                    ),
                  ),
          ),
          if (onRemove != null)
            IconButton(
              onPressed: onRemove,
              visualDensity: VisualDensity.compact,
              tooltip: 'Tirar ${entry.name} da aula',
              icon: Icon(
                Icons.remove_circle_outline_rounded,
                size: 20,
                color: colors.onSurfaceMuted,
              ),
            )
          else
            const SizedBox(width: 8),
          ArenaClassMarkControl(name: entry.name, mark: mark, onMark: onMark),
        ],
      ),
    );
  }
}
