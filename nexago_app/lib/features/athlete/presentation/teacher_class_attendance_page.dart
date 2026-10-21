import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/domain/aulas/arena_class_session.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../arena/presentation/aulas/widgets/arena_class_attendance_widgets.dart';
import '../../arena/presentation/widgets/arena_async_state.dart';
import '../data/class_agenda_repository.dart';
import '../domain/agenda/athlete_agenda_providers.dart';
import '../domain/agenda/teacher_class_roster.dart';

/// Chamada de uma aula que o usuário dá como professor — liberada pelo
/// vínculo com a arena ("Gerenciar as próprias aulas"). Mesma chamada da
/// equipe (presente / falta / avisou, "Todos presentes", "Fechar chamada"),
/// sem encaixe nem cancelamento, que seguem da arena.
///
/// A lista vem de `getMyClassSessionRoster` (o professor não lê as coleções
/// de aula) e a gravação é a mesma `saveArenaClassAttendance` da equipe. As
/// marcas ficam num rascunho local até fechar.
class TeacherClassAttendancePage extends ConsumerStatefulWidget {
  const TeacherClassAttendancePage({super.key, required this.sessionId});

  final String sessionId;

  @override
  ConsumerState<TeacherClassAttendancePage> createState() =>
      _TeacherClassAttendancePageState();
}

class _TeacherClassAttendancePageState
    extends ConsumerState<TeacherClassAttendancePage> {
  /// Marcas mexidas e ainda não gravadas; fora delas vale o que veio do servidor.
  final Map<String, AttendanceMark?> _edits = {};
  bool _saving = false;

  void _back() => popOrGo(context, '${AppRoutes.discover}?tab=agenda');

  @override
  Widget build(BuildContext context) {
    final rosterAsync = ref.watch(teacherClassRosterProvider(widget.sessionId));
    final roster = rosterAsync.valueOrNull;
    final session = roster?.session;

    final Widget body;
    if (roster != null) {
      body = _buildBody(context, roster);
    } else if (rosterAsync.hasError) {
      final error = rosterAsync.error;
      body = ArenaErrorState(
        message: error is TeacherClassException
            ? error.message
            : 'Não foi possível abrir a chamada agora.',
        onRetry: () =>
            ref.invalidate(teacherClassRosterProvider(widget.sessionId)),
      );
    } else {
      body = const ArenaLoadingState(label: 'Carregando chamada...');
    }

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
                          '${session.courtName} · ${session.arenaName}'
                      .toUpperCase(),
              onBack: _back,
            ),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(BuildContext context, TeacherClassRoster roster) {
    final session = roster.session;
    final saved = roster.savedMarks;
    // Edição que o servidor já confirmou deixa de ser edição.
    _edits.removeWhere((id, mark) => saved[id] == mark);
    if (session.isCanceled) _edits.clear();

    final draft = ArenaClassAttendanceDraft.fromSession(
      roster.students.map((s) => s.studentId),
      saved,
    );
    final current = ArenaClassAttendanceDraft({
      for (final e in draft.marks.entries)
        e.key: _edits.containsKey(e.key) ? _edits[e.key] : e.value,
    });
    final summary = current.summary;
    final open = session.attendanceOpen;
    final editable = open && !_saving;
    final dirty = current.differsFrom(saved);
    final notice = _notice(session);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: RefreshIndicator(
            color: AppColors.brand,
            onRefresh: () => ref.refresh(
              teacherClassRosterProvider(widget.sessionId).future,
            ),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
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
                    onAddExtra: null,
                  ),
                  const SizedBox(height: 12),
                ],
                notice,
                const SizedBox(height: 8),
                if (roster.students.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 24),
                    child: ArenaEmptyState(
                      title: 'Ninguém nesta aula',
                      message: 'Nenhum aluno faz esta turma neste dia. A '
                          'arena matricula e encaixa os alunos.',
                      icon: Icons.person_outline_rounded,
                    ),
                  ),
                for (final student in roster.students)
                  _StudentRow(
                    student: student,
                    mark: current.marks[student.studentId],
                    onMark: editable
                        ? (mark) =>
                            setState(() => _edits[student.studentId] = mark)
                        : null,
                  ),
              ],
            ),
          ),
        ),
        if (open)
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

  Widget _notice(TeacherClassRosterSession session) {
    if (session.isCanceled) {
      return const ArenaClassAttendanceNotice(
        color: AppColors.live,
        icon: Icons.event_busy_rounded,
        text: 'Aula cancelada pela arena. A chamada fica fechada.',
      );
    }
    if (!session.attendanceOpen) {
      final d = session.date;
      final label =
          d.length == 10 ? '${d.substring(8)}/${d.substring(5, 7)}' : d;
      return ArenaClassAttendanceNotice(
        color: context.themeColors.onSurfaceMuted,
        icon: Icons.lock_clock_outlined,
        text: 'A chamada abre no dia da aula ($label). Por enquanto, esta é '
            'a lista de quem faz a turma nesse dia.',
      );
    }
    if (session.isCompleted) {
      return const ArenaClassAttendanceNotice(
        color: AppColors.win,
        icon: Icons.check_circle_outline_rounded,
        text: 'Chamada fechada. Ainda dá para corrigir uma marca.',
      );
    }
    return ArenaClassAttendanceNotice(
      color: AppColors.brand,
      icon: Icons.info_outline_rounded,
      text: 'A arena vê a chamada assim que você fecha — reposição e pacote '
          'de aulas são lançados na hora.',
    );
  }

  Future<void> _save(
    TeacherClassRosterSession session,
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
              key: const Key('teacher-attendance-confirm-close'),
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
      await ref.read(classAgendaRepositoryProvider).saveTeacherAttendance(
            sessionId: session.sessionId,
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
      ref.invalidate(teacherClassRosterProvider(widget.sessionId));
      ref.invalidate(myClassAgendaProvider);
      // Fechou a chamada: "Treino encerrado", com o "Compartilhar no story".
      if (closing) {
        context.pushReplacementNamed(
          AppRouteNames.professorClassClosed,
          pathParameters: {'sessionId': session.sessionId},
        );
      }
    } on TeacherClassException catch (e) {
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
}

class _StudentRow extends StatelessWidget {
  const _StudentRow({
    required this.student,
    required this.mark,
    required this.onMark,
  });

  final TeacherClassRosterStudent student;
  final AttendanceMark? mark;

  /// `null` = só leitura.
  final ValueChanged<AttendanceMark?>? onMark;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final (ArenaClassTag? tag, String subtitle) = switch (student.kind) {
      'makeup' => (
          const ArenaClassTag(label: 'Reposição', color: AppColors.win),
          'Reposição com crédito',
        ),
      'trial' => (
          const ArenaClassTag(label: 'Experimental', color: AppColors.pending),
          'Aula experimental',
        ),
      _ => (null, 'Aluno da turma'),
    };
    final appStatus = teacherRosterAppStatus(student);
    return Container(
      key: Key('teacher-attendance-${student.studentId}'),
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
            zoomName: student.name,
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
                        student.name,
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
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11, color: colors.onSurfaceMuted),
                ),
                if (appStatus != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    appStatus.text,
                    key: Key('teacher-attendance-app-${student.studentId}'),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: colors.readableTone(
                        appStatus.positive ? AppColors.win : AppColors.live,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          ArenaClassMarkControl(
            name: student.name,
            mark: mark,
            onMark: onMark,
          ),
        ],
      ),
    );
  }
}
