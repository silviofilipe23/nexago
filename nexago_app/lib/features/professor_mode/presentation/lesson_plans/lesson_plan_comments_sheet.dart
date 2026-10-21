import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart'
    show arenaClassInitials;
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_lesson_plans_providers.dart';
import '../../domain/professor_lesson_plans.dart';
import 'lesson_plan_widgets.dart';

/// O que a folha devolve ao editor.
typedef LessonPlanCommentsResult = ({
  String note,
  bool notePublic,
  List<LessonPlanFocus> focus,
});

/// H5 · Comentários do bloco: o comentário (só eu / turma vê) e o foco
/// individual do plano (privado / aluno vê). Sem [block], só o foco.
class LessonPlanCommentsSheet extends ConsumerStatefulWidget {
  const LessonPlanCommentsSheet({
    super.key,
    required this.focus,
    required this.lessonKey,
    this.block,
    this.blockNumber,
    this.fallbackStudents,
  });

  final LessonPlanBlock? block;
  final int? blockNumber;
  final List<LessonPlanFocus> focus;
  final LessonPlanRef lessonKey;

  /// Alunos já carregados pelo editor (a folha também observa).
  final List<LessonPlanStudent>? fallbackStudents;

  @override
  ConsumerState<LessonPlanCommentsSheet> createState() =>
      _LessonPlanCommentsSheetState();
}

class _LessonPlanCommentsSheetState
    extends ConsumerState<LessonPlanCommentsSheet> {
  late final _note = TextEditingController(text: widget.block?.note);
  late bool _notePublic = widget.block?.notePublic ?? false;
  late final List<LessonPlanFocus> _focus = List.of(widget.focus);
  late final Map<String, TextEditingController> _texts = {
    for (final f in widget.focus)
      f.athleteId: TextEditingController(text: f.text),
  };

  @override
  void dispose() {
    _note.dispose();
    for (final c in _texts.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _addStudent(List<LessonPlanStudent> students) async {
    final taken = {for (final f in _focus) f.athleteId};
    final free = [
      for (final s in students)
        if (!taken.contains(s.athleteId)) s,
    ];
    if (free.isEmpty) {
      showAppSnackBar(
        context,
        students.isEmpty
            ? 'Nenhum aluno com conta nesta aula.'
            : 'Todos os alunos já têm foco.',
      );
      return;
    }
    final picked = await showDialog<LessonPlanStudent>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('Marcar aluno'),
        children: [
          for (final s in free)
            SimpleDialogOption(
              key: Key('lesson-plan-focus-pick-${s.athleteId}'),
              onPressed: () => Navigator.pop(ctx, s),
              child: Text(s.name),
            ),
        ],
      ),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _texts[picked.athleteId] = TextEditingController();
      _focus.add(LessonPlanFocus(
        athleteId: picked.athleteId,
        name: picked.name,
        text: '',
      ));
    });
  }

  void _save() {
    final focus = [
      for (final f in _focus)
        if ((_texts[f.athleteId]?.text ?? f.text).trim().isNotEmpty)
          f.copyWith(text: (_texts[f.athleteId]?.text ?? f.text).trim()),
    ];
    Navigator.of(context).pop<LessonPlanCommentsResult>((
      note: _note.text.trim(),
      notePublic: _notePublic,
      focus: focus.take(kLessonPlanMaxFocus).toList(),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final async = ref.watch(lessonPlanLessonProvider(widget.lessonKey));
    final students =
        async.valueOrNull?.students ?? widget.fallbackStudents ?? const [];
    final b = widget.block;
    InputDecoration deco(String hint) => InputDecoration(
          isDense: true,
          hintText: hint,
          filled: true,
          fillColor: ProfessorLinksStyle.soft(colors),
          counterText: '',
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(13),
            borderSide: BorderSide(color: ProfessorLinksStyle.line2(colors)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(13),
            borderSide: const BorderSide(color: AppColors.brand),
          ),
        );

    return ProfessorLinksSheetBody(
      title: b?.name ?? 'Foco individual',
      subtitle: b == null
          ? 'Um ponto de atenção por aluno nesta aula'
          : 'Bloco ${widget.blockNumber} · ${b.minutes}′ · comentários e '
              'foco individual',
      children: [
        if (b != null) ...[
          const ProfessorLinksKicker('Comentário do bloco'),
          TextField(
            key: const Key('lesson-plan-note'),
            controller: _note,
            minLines: 2,
            maxLines: 5,
            maxLength: kLessonPlanNoteMax,
            textCapitalization: TextCapitalization.sentences,
            style: AppTypography.bodyM.copyWith(color: colors.onSurface),
            decoration: deco('Ex.: começar com 2 zonas e abrir a terceira…'),
          ),
          Row(
            children: [
              Expanded(
                child: LessonPlanVisibilityButton(
                  key: const Key('lesson-plan-note-private'),
                  label: 'Só eu',
                  icon: Icons.lock_outline_rounded,
                  selected: !_notePublic,
                  onTap: () => setState(() => _notePublic = false),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: LessonPlanVisibilityButton(
                  key: const Key('lesson-plan-note-public'),
                  label: 'Turma vê',
                  icon: Icons.visibility_outlined,
                  selected: _notePublic,
                  onTap: () => setState(() => _notePublic = true),
                ),
              ),
            ],
          ),
        ],
        Row(
          children: [
            const Expanded(child: ProfessorLinksKicker('Foco individual')),
            TextButton(
              key: const Key('lesson-plan-focus-add'),
              onPressed: async.isLoading && students.isEmpty
                  ? null
                  : () => _addStudent(students),
              child: Text(
                '+ Marcar aluno',
                style: AppTypography.bodyS.copyWith(
                  fontWeight: FontWeight.w600,
                  color: colors.readableTone(AppColors.brandHover),
                ),
              ),
            ),
          ],
        ),
        if (_focus.isEmpty)
          Text(
            async.hasError
                ? 'Não foi possível carregar os alunos desta aula.'
                : 'Nenhum aluno marcado.',
            style: AppTypography.bodyS.copyWith(
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
        for (var i = 0; i < _focus.length; i++)
          Row(
            key: Key('lesson-plan-focus-row-${_focus[i].athleteId}'),
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ArenaClassAvatar(
                initials: arenaClassInitials(_focus[i].name),
                size: 32,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _focus[i].name,
                      style: ProfessorLinksStyle.display(
                        12.5,
                        weight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 4),
                    TextField(
                      key: Key('lesson-plan-focus-text-${_focus[i].athleteId}'),
                      controller: _texts[_focus[i].athleteId],
                      maxLength: kLessonPlanFocusTextMax,
                      minLines: 1,
                      maxLines: 3,
                      textCapitalization: TextCapitalization.sentences,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 13,
                        color: colors.onSurface,
                      ),
                      decoration: deco('O que observar neste aluno'),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              LessonPlanFocusVisibilityTag(
                key: Key('lesson-plan-focus-toggle-${_focus[i].athleteId}'),
                public: _focus[i].public,
                onTap: () => setState(() {
                  _focus[i] = _focus[i].copyWith(public: !_focus[i].public);
                }),
              ),
            ],
          ),
        ProfessorLinksPrimaryButton(
          key: const Key('lesson-plan-comments-save'),
          label: b == null ? 'Salvar foco' : 'Salvar comentários',
          onPressed: _save,
        ),
      ],
    );
  }
}
