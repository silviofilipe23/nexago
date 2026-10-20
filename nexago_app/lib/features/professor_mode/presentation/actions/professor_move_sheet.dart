import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_students_providers.dart';
import '../../domain/professor_actions_logic.dart';
import '../../domain/professor_students.dart';
import '../../domain/professor_students_logic.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_action_widgets.dart';

/// "Mover para outra turma" (rodapé do B3): troca uma turma do aluno por
/// outra do professor na mesma arena. O plano e o preço não mudam.
Future<void> showProfessorMoveSheet(
  BuildContext context,
  ProfessorStudent student,
) =>
    showProfessorLinksSheet<void>(
      context,
      builder: (_) => _MoveSheet(student: student),
    );

class _MoveSheet extends ConsumerStatefulWidget {
  const _MoveSheet({required this.student});

  final ProfessorStudent student;

  @override
  ConsumerState<_MoveSheet> createState() => _MoveSheetState();
}

class _MoveSheetState extends ConsumerState<_MoveSheet> {
  late String? _fromId = widget.student.classes.length == 1
      ? widget.student.classes.first.classId
      : null;
  String? _toId;
  bool _saving = false;

  Future<void> _save() async {
    setState(() => _saving = true);
    final s = widget.student;
    final ok = await runProfessorAction(
      context,
      ref,
      arenaId: s.arenaId,
      pop: false,
      action: () async {
        await ref.read(professorActionsRepositoryProvider).moveStudent(
              fromClassId: _fromId!,
              toClassId: _toId!,
              studentId: s.studentId,
            );
        return '${s.name} mudou de turma.';
      },
    );
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop();
    } else {
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.student;
    final ctx =
        ref.watch(professorActionsContextProvider(s.arenaId)).valueOrNull;
    ProfessorStudentClass? from;
    for (final c in s.classes) {
      if (c.classId == _fromId) from = c;
    }
    final targets = ctx == null || from == null
        ? const []
        : professorMoveTargets(
            ctx,
            fromClassId: from.classId,
            weekdayCount: from.weekdays.isEmpty ? 1 : from.weekdays.length,
          );
    return ProfessorLinksSheetBody(
      title: 'Mover para outra turma',
      subtitle: '${s.name} · o plano e o preço não mudam.',
      children: [
        if (s.classes.length > 1) ...[
          const ProfessorLinksKicker('Sai de'),
          for (final c in s.classes)
            ArenaClassChoiceCard(
              key: Key('professor-move-from-${c.classId}'),
              title: c.name,
              subtitle: professorScheduleLabel(c.weekdays, c.startTime),
              selected: c.classId == _fromId,
              onTap: () => setState(() {
                _fromId = c.classId;
                _toId = null;
              }),
            ),
        ],
        if (ctx == null)
          const Center(
            child: CircularProgressIndicator(color: AppColors.brand),
          )
        else if (from != null) ...[
          const ProfessorLinksKicker('Vai para'),
          if (targets.isEmpty)
            const ProfessorMutedText(
              'Nenhuma outra turma sua com dias suficientes para o plano.',
            ),
          for (final c in targets)
            ArenaClassChoiceCard(
              key: Key('professor-move-to-${c.classId}'),
              title: c.name,
              subtitle: professorScheduleLabel(c.weekdays, c.startTime),
              selected: c.classId == _toId,
              dimmed: c.isFull,
              trailing: ProfessorSpotsBadge(free: c.freeSpots),
              onTap: () => setState(() => _toId = c.classId),
            ),
        ],
        ProfessorLinksPrimaryButton(
          key: const Key('professor-move-submit'),
          label: 'Mover ${s.name.split(' ').first}',
          loading: _saving,
          onPressed: _fromId != null && _toId != null ? _save : null,
        ),
      ],
    );
  }
}
