import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/ui/app_snackbar.dart';
import '../../data/arena_class_repository.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_date_utils.dart';
import '../../domain/arena_staff_role.dart';
import '../../domain/aulas/arena_class_logic.dart';
import '../../domain/aulas/arena_class_providers.dart';
import '../../domain/aulas/arena_class_session.dart';
import '../widgets/arena_async_state.dart';
import 'arena_class_cancel_sheet.dart';
import 'widgets/arena_class_atoms.dart';

/// Chamada de uma aula (A2): presente / falta / avisou por aluno, "Todos
/// presentes" e "Fechar chamada" (`saveArenaClassAttendance`). O menu ⋯ abre
/// o cancelamento (A4).
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

    final todayKey = arenaDateKey(arenaTodayDateOnly());
    final roster = arenaClassAttendanceRoster(students, session.attendance);
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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
            children: [
              if (!session.isCanceled) ...[
                _SummaryCard(
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
                ),
                if (notice != null) const SizedBox(height: 12),
              ],
              if (notice != null) notice,
              const SizedBox(height: 8),
              if (roster.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 24),
                  child: ArenaEmptyState(
                    title: 'Nenhum aluno na turma',
                    message: 'Matricule os alunos pelo portal da arena.',
                    icon: Icons.person_add_alt_outlined,
                  ),
                ),
              for (final student in roster)
                _StudentRow(
                  student: student,
                  mark: current.marks[student.id],
                  onMark: editable
                      ? (mark) => setState(() => _edits[student.id] = mark)
                      : null,
                ),
            ],
          ),
        ),
        if (canWrite && open)
          _Footer(
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
      return _Notice(
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
      return _Notice(
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
      return _Notice(
        color: AppColors.win,
        icon: Icons.check_circle_outline_rounded,
        text: 'Chamada fechada$at.'
            '${canWrite ? ' Ainda dá para corrigir uma marca.' : ''}',
      );
    }
    if (!canWrite) {
      return _Notice(
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
    final active = students.where((s) => s.isActive).toList();
    final result = await showArenaClassCancelSheet(
      context,
      session: session,
      studentCount: active.length,
      studentsWithAccount: active.where((s) => s.hasAccount).length,
    );
    if (result == null || !mounted) return;
    final n = result.notified;
    showAppSnackBar(
      context,
      n > 0
          ? 'Aula cancelada. Quadra liberada · $n aluno${n == 1 ? '' : 's'} '
              'avisado${n == 1 ? '' : 's'}.'
          : 'Aula cancelada. Quadra liberada na agenda.',
    );
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

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.summary,
    required this.onAllPresent,
    required this.allPresentLabel,
  });

  final AttendanceSummary summary;
  final VoidCallback? onAllPresent;
  final String allPresentLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.25)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          stops: const [0, 0.6],
          colors: [
            AppColors.brand.withValues(alpha: 0.18),
            colors.surfaceCard,
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'PRESENTES',
                      style: AppTypography.mono(
                        fontSize: 9.5,
                        letterSpacing: 1.5,
                        color: AppColors.brandHover,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text.rich(
                      TextSpan(
                        text: '${summary.present}',
                        style: AppTypography.soraRegular(
                          fontSize: 40,
                          fontWeight: FontWeight.w800,
                          color: colors.onSurface,
                          letterSpacing: -1.5,
                          height: 1,
                        ),
                        children: [
                          TextSpan(
                            text: '/${summary.total}',
                            style: AppTypography.soraRegular(
                              fontSize: 20,
                              color: colors.onSurfaceMuted,
                              letterSpacing: 0,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _count(
                    '${summary.absent} falta${summary.absent == 1 ? '' : 's'}',
                    AppColors.live,
                  ),
                  const SizedBox(height: 4),
                  _count('${summary.excused} avisou', AppColors.pending),
                  const SizedBox(height: 4),
                  _count(
                    '${summary.unmarked} sem marcar',
                    colors.onSurfaceMuted,
                  ),
                ],
              ),
            ],
          ),
          if (onAllPresent != null) ...[
            const SizedBox(height: 14),
            SizedBox(
              height: 38,
              child: OutlinedButton.icon(
                onPressed: onAllPresent,
                icon: const Icon(Icons.done_all_rounded, size: 16),
                label: Text(allPresentLabel),
                style: OutlinedButton.styleFrom(
                  foregroundColor: colors.onSurface,
                  backgroundColor: colors.surfaceRaised,
                  side: BorderSide(
                    color: colors.onSurfaceMuted.withValues(alpha: 0.2),
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  textStyle: AppTypography.soraRegular(fontSize: 12.5),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _count(String text, Color color) => Text(
        text,
        style: AppTypography.mono(
          fontSize: 10.5,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      );
}

class _Notice extends StatelessWidget {
  const _Notice({required this.color, required this.icon, required this.text});

  final Color color;
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 12.5,
                height: 1.35,
                fontWeight: FontWeight.w600,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StudentRow extends StatelessWidget {
  const _StudentRow({
    required this.student,
    required this.mark,
    required this.onMark,
  });

  final ArenaClassStudent student;
  final AttendanceMark? mark;

  /// `null` = só leitura.
  final ValueChanged<AttendanceMark?>? onMark;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final subtitle = !student.isActive
        ? 'Saiu da turma'
        : student.hasAccount
            ? 'Atleta NexaGO'
            : (student.phone ?? 'Aluno sem conta');
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 9),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: colors.onSurface.withValues(alpha: 0.05)),
        ),
      ),
      child: Row(
        children: [
          ArenaClassAvatar(
            initials: arenaClassInitials(student.name),
            photoUrl: student.photoUrl,
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  student.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11, color: colors.onSurfaceMuted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _MarkControl(name: student.name, mark: mark, onMark: onMark),
        ],
      ),
    );
  }
}

/// Sem marca: dois botões (falta ✗ e presente ✓). Com marca: a etiqueta, que
/// abre o menu para trocar (inclusive "Avisou") ou limpar.
class _MarkControl extends StatelessWidget {
  const _MarkControl({
    required this.name,
    required this.mark,
    required this.onMark,
  });

  final String name;
  final AttendanceMark? mark;
  final ValueChanged<AttendanceMark?>? onMark;

  static Color colorOf(AttendanceMark mark) => switch (mark) {
        AttendanceMark.present => AppColors.win,
        AttendanceMark.absent => AppColors.live,
        AttendanceMark.excused => AppColors.pending,
      };

  @override
  Widget build(BuildContext context) {
    final current = mark;
    final colors = context.themeColors;
    if (current == null) {
      if (onMark == null) {
        return Text(
          '—',
          style: AppTypography.mono(color: colors.onSurfaceMuted),
        );
      }
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _SquareButton(
            icon: Icons.close_rounded,
            semanticLabel: 'Marcar falta de $name',
            onTap: () => onMark!(AttendanceMark.absent),
          ),
          const SizedBox(width: 6),
          _SquareButton(
            icon: Icons.check_rounded,
            semanticLabel: 'Marcar presença de $name',
            onTap: () => onMark!(AttendanceMark.present),
          ),
        ],
      );
    }

    final color = colorOf(current);
    final pill = Container(
      height: 40,
      constraints: const BoxConstraints(minWidth: 92),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (current == AttendanceMark.present)
            Icon(Icons.check_rounded, size: 15, color: color)
          else if (current == AttendanceMark.absent)
            Icon(Icons.close_rounded, size: 15, color: color),
          if (current != AttendanceMark.excused) const SizedBox(width: 6),
          Text(
            current.label,
            style: AppTypography.soraRegular(fontSize: 12.5, color: color),
          ),
        ],
      ),
    );
    if (onMark == null) return pill;
    return PopupMenuButton<_MarkChoice>(
      tooltip: 'Trocar marca de $name',
      color: colors.surfaceSheet,
      position: PopupMenuPosition.under,
      onSelected: (choice) => onMark!(choice.mark),
      itemBuilder: (_) => [
        for (final m in AttendanceMark.values)
          if (m != current)
            PopupMenuItem(
              value: _MarkChoice(m),
              child: Text(m.label, style: TextStyle(color: colorOf(m))),
            ),
        const PopupMenuItem(
          value: _MarkChoice(null),
          child: Text('Limpar marca'),
        ),
      ],
      child: pill,
    );
  }
}

/// Embrulho para o `PopupMenuButton` distinguir "limpar" (null) de nada
/// escolhido.
class _MarkChoice {
  const _MarkChoice(this.mark);

  final AttendanceMark? mark;
}

class _SquareButton extends StatelessWidget {
  const _SquareButton({
    required this.icon,
    required this.semanticLabel,
    required this.onTap,
  });

  final IconData icon;
  final String semanticLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      button: true,
      label: semanticLabel,
      excludeSemantics: true,
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: colors.onSurfaceMuted.withValues(alpha: 0.25),
              ),
            ),
            child: Icon(icon, size: 17, color: colors.onSurfaceMuted),
          ),
        ),
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  const _Footer({
    required this.label,
    required this.saving,
    required this.onPressed,
  });

  final String label;
  final bool saving;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
      decoration: BoxDecoration(
        color: context.themeColors.canvas,
        border: Border(
          top: BorderSide(
            color: context.themeColors.onSurface.withValues(alpha: 0.06),
          ),
        ),
      ),
      child: SizedBox(
        height: 50,
        child: FilledButton(
          onPressed: onPressed,
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brand,
            foregroundColor: AppColors.black,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
          child: saving
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.black,
                  ),
                )
              : Text(label, style: AppTypography.soraRegular(fontSize: 15)),
        ),
      ),
    );
  }
}
