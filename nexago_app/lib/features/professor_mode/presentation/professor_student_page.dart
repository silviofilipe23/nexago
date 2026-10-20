import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../arena/domain/aulas/arena_class.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../application/professor_students_providers.dart';
import '../domain/professor_students.dart';
import '../domain/professor_students_logic.dart';
import '../infrastructure/professor_students_repository.dart';
import 'widgets/professor_students_widgets.dart';

/// Aluno do professor (B3): turmas com ele, presença das últimas aulas,
/// plano e situação do pagamento (só equipe da arena) e as anotações que só
/// o professor vê. Lê do mesmo resultado da lista — sem outra callable.
class ProfessorStudentPage extends ConsumerWidget {
  const ProfessorStudentPage({
    super.key,
    required this.arenaId,
    required this.studentId,
  });

  final String arenaId;
  final String studentId;

  void _back(BuildContext context) =>
      popOrGo(context, AppRoutes.professorStudents);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(professorStudentsProvider);
    final snapshot = async.valueOrNull;
    final student = snapshot?.student(arenaId, studentId);

    if (student == null) {
      return ProfessorLinksScaffold(
        title: 'Aluno',
        onBack: () => _back(context),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (snapshot == null && !async.hasError)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.brand),
                ),
              )
            else if (async.hasError && snapshot == null)
              ProfessorRetryCard(
                message: 'Não foi possível carregar o aluno.',
                onRetry: () => ref.invalidate(professorStudentsProvider),
              )
            else
              const ProfessorLinksCard(
                key: Key('professor-student-missing'),
                child: ProfessorMutedText(
                  'Este aluno não está mais nas suas turmas.',
                ),
              ),
          ],
        ),
      );
    }

    final since = professorSinceLabel(student.since);
    return ProfessorLinksScaffold(
      title: student.name,
      subtitle: [
        student.arenaName.toUpperCase(),
        if (since != null) since,
      ].join(' · '),
      onBack: () => _back(context),
      body: RefreshIndicator(
        color: AppColors.brand,
        onRefresh: () async {
          ref.invalidate(professorStudentsProvider);
          await ref
              .read(professorStudentsProvider.future)
              .then<void>((_) {}, onError: (_) {});
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            _HeaderCard(student: student),
            const SizedBox(height: 22),
            _PresenceSection(student: student),
            const SizedBox(height: 22),
            _PlanSection(student: student, todayKey: snapshot!.todayKey),
            const SizedBox(height: 22),
            _NotesSection(arenaId: arenaId, studentId: studentId),
          ],
        ),
      ),
    );
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.student});

  final ProfessorStudent student;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final s = student;
    final types = <ArenaClassType>{for (final c in s.classes) c.type};
    return ProfessorLinksCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ArenaClassAvatar(
            initials: arenaClassInitials(s.name),
            photoUrl: s.photoUrl,
            size: 52,
            zoomName: s.name,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final t in types) ArenaClassTypeTag(type: t),
                    if (s.paused)
                      ArenaClassTag(
                        label: 'Pausado',
                        color: ProfessorLinksStyle.mute(colors),
                      ),
                  ],
                ),
                for (final c in s.classes) ...[
                  const SizedBox(height: 6),
                  Text(
                    '${c.name} · ${professorScheduleLabel(c.weekdays, c.startTime)}',
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12,
                      color: ProfessorLinksStyle.mute(colors),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                s.presenceRate == null ? '—' : '${s.presenceRate}%',
                key: const Key('professor-student-presence-rate'),
                style: ProfessorLinksStyle.display(
                  24,
                  color: colors.onSurface,
                ),
              ),
              Text(
                'PRESENÇA',
                style: ProfessorLinksStyle.mono(
                  9,
                  color: ProfessorLinksStyle.dim(colors),
                ).copyWith(letterSpacing: 0.8),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PresenceSection extends StatelessWidget {
  const _PresenceSection({required this.student});

  final ProfessorStudent student;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final s = student;
    final n = s.marks.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: ProfessorLinksKicker(
                n == 0
                    ? 'Presença'
                    : 'Presença · $n última${n == 1 ? '' : 's'}',
              ),
            ),
            if (s.credits > 0)
              Text(
                '${s.credits} CRÉDITO${s.credits == 1 ? '' : 'S'} DE REPOSIÇÃO',
                key: const Key('professor-student-credits'),
                style: ProfessorLinksStyle.mono(
                  9.5,
                  color: AppColors.pending,
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),
        if (n == 0)
          const ProfessorMutedText(
            'Sem chamada registrada nas suas aulas ainda.',
          )
        else ...[
          ProfessorPresenceStrip(marks: s.marks),
          const SizedBox(height: 10),
          const ProfessorPresenceLegend(),
          if (s.lastDate != null) ...[
            const SizedBox(height: 8),
            Text(
              'Última aula com você: ${professorShortDate(s.lastDate!)}',
              style: AppTypography.bodyS.copyWith(
                fontSize: 11.5,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ],
        ],
      ],
    );
  }
}

class _PlanSection extends StatelessWidget {
  const _PlanSection({required this.student, required this.todayKey});

  final ProfessorStudent student;
  final String todayKey;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final s = student;
    final billing = s.billing;
    if (billing == null) {
      // Professor independente escalado em turma da arena: a cobrança é
      // da arena e não aparece para ele.
      return ProfessorLinksNote(
        'Turma da ${s.arenaName}: plano e cobrança ficam com a arena.',
        tone: ProfessorLinksNoteTone.blue,
      );
    }
    final rows = <Widget>[
      for (final p in s.plans)
        Builder(builder: (_) {
          final row = professorPlanRow(p, s.arenaName);
          return ProfessorInfoRow(
            label: row.label,
            value: row.value,
            sub: row.sub,
          );
        }),
      ProfessorInfoRow(
        key: const Key('professor-student-billing'),
        label: 'Pagamento',
        value: billing.standing.label,
        valueColor: professorBillingColor(billing.standing, colors),
        sub: professorBillingDetail(billing, todayKey),
        last: true,
      ),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ProfessorLinksKicker('Plano e cobrança'),
        const SizedBox(height: 10),
        ProfessorRowsBlock(children: rows),
        const SizedBox(height: 10),
        ProfessorLinksNote(
          'Turma da ${s.arenaName}: preço e cobrança são da arena. Pedidos de '
          'desconto vão para a gestão.',
          tone: ProfessorLinksNoteTone.neutral,
        ),
      ],
    );
  }
}

class _NotesSection extends ConsumerWidget {
  const _NotesSection({required this.arenaId, required this.studentId});

  final String arenaId;
  final String studentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final key = (arenaId: arenaId, studentId: studentId);
    final note = ref.watch(professorStudentNoteProvider(key)).valueOrNull;
    final empty = note == null || note.isEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ProfessorLinksKicker('Suas anotações · só você vê'),
        const SizedBox(height: 10),
        ProfessorLinksCard(
          key: const Key('professor-student-note'),
          padding: const EdgeInsets.fromLTRB(13, 11, 13, 11),
          onTap: () => showProfessorLinksSheet<void>(
            context,
            builder: (_) => _NoteEditorSheet(
              arenaId: arenaId,
              studentId: studentId,
              initial: note ?? '',
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  empty
                      ? 'Toque para escrever. Nem a arena nem o aluno '
                          'veem.'
                      : note,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12.5,
                    height: 1.5,
                    color: empty
                        ? ProfessorLinksStyle.dim(colors)
                        : colors.onSurface,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                Icons.edit_outlined,
                size: 17,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _NoteEditorSheet extends ConsumerStatefulWidget {
  const _NoteEditorSheet({
    required this.arenaId,
    required this.studentId,
    required this.initial,
  });

  final String arenaId;
  final String studentId;
  final String initial;

  @override
  ConsumerState<_NoteEditorSheet> createState() => _NoteEditorSheetState();
}

class _NoteEditorSheetState extends ConsumerState<_NoteEditorSheet> {
  late final TextEditingController _text =
      TextEditingController(text: widget.initial);
  bool _saving = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final uid = ref.read(professorLinksUidProvider);
    if (uid.isEmpty) return;
    setState(() => _saving = true);
    try {
      await ref.read(professorStudentsRepositoryProvider).saveNote(
            uid: uid,
            arenaId: widget.arenaId,
            studentId: widget.studentId,
            text: _text.text,
          );
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showAppSnackBar(
        context,
        e is ProfessorStudentsException
            ? e.message
            : 'Não foi possível salvar a anotação. Tente de novo.',
        isError: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksSheetBody(
      title: 'Anotações',
      subtitle: 'Só você vê — nem a arena nem o aluno.',
      children: [
        TextField(
          key: const Key('professor-note-field'),
          controller: _text,
          autofocus: true,
          minLines: 4,
          maxLines: 8,
          maxLength: kProfessorNoteMaxLength,
          textCapitalization: TextCapitalization.sentences,
          style: AppTypography.bodyM.copyWith(color: colors.onSurface),
          decoration: InputDecoration(
            hintText: 'Ex.: dor no ombro direito, evitar volume de smash.',
            hintStyle: AppTypography.bodyM.copyWith(
              color: ProfessorLinksStyle.dim(colors),
            ),
            filled: true,
            fillColor: ProfessorLinksStyle.soft(colors),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
          ),
        ),
        ProfessorLinksPrimaryButton(
          key: const Key('professor-note-save'),
          label: 'Salvar anotação',
          loading: _saving,
          onPressed: _save,
        ),
      ],
    );
  }
}
