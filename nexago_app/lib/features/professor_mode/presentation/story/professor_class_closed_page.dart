import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../athlete/domain/agenda/class_story_tag.dart';
import '../../../athlete/domain/agenda/teacher_class_roster.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_agenda_providers.dart';
import '../../application/professor_lesson_plans_providers.dart';
import '../../domain/professor_actions_logic.dart' show professorDayLabel;
import '../../domain/professor_class_story.dart';
import '../../domain/professor_lesson_plans.dart';
import '../../infrastructure/professor_students_repository.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_class_story_page.dart';

/// G1 · Treino encerrado — fecha a aula com os números da chamada, os
/// presentes e o plano do treino (opcional, o professor monta aqui e ele vai
/// para o story), e abre o "Compartilhar no story" (G2). Abre depois de fechar
/// a chamada e pelo detalhe de uma aula que já terminou.
class ProfessorClassClosedPage extends ConsumerStatefulWidget {
  const ProfessorClassClosedPage({super.key, required this.sessionId});

  final String sessionId;

  @override
  ConsumerState<ProfessorClassClosedPage> createState() =>
      _ProfessorClassClosedPageState();
}

class _ProfessorClassClosedPageState
    extends ConsumerState<ProfessorClassClosedPage> {
  final List<ClassStoryPlanBlock> _plan = [];

  /// O plano de aula da turma já foi olhado (preenche uma vez só, e nunca por
  /// cima do que o professor montou aqui).
  bool _seeded = false;
  bool _fromLessonPlan = false;

  /// Blocos do plano de aula que não couberam no story.
  int _planLeft = 0;

  String get _planNote {
    if (!_fromLessonPlan) {
      return 'Opcional. O plano aparece no story e no card dos alunos '
          'marcados.';
    }
    final left = _planLeft == 0
        ? ''
        : ' — o story cabe $kClassStoryPlanMaxBlocks blocos, $_planLeft '
            '${_planLeft == 1 ? 'ficou' : 'ficaram'} de fora';
    return 'Veio do seu plano de aula$left. Tirar ou trocar um bloco aqui só '
        'muda o story.';
  }

  void _seedFromLessonPlan(AsyncValue<LessonPlan?> lessonPlan) {
    if (_seeded || !lessonPlan.hasValue) return;
    _seeded = true;
    final plan = lessonPlan.value;
    if (plan == null || _plan.isNotEmpty) return;
    final r = classStoryPlanFromLessonPlan(plan);
    if (r.blocks.isEmpty) return;
    _plan.addAll(r.blocks);
    _fromLessonPlan = true;
    _planLeft = r.left;
  }

  void _close() => popOrGo(context, AppRoutes.professorAgenda);

  Future<void> _addBlock() async {
    final block = await showDialog<ClassStoryPlanBlock>(
      context: context,
      builder: (_) => const _PlanBlockDialog(),
    );
    if (block == null || !mounted) return;
    setState(() => _plan.add(block));
  }

  void _openStory(TeacherClassRoster roster) {
    Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute<void>(
        builder: (_) => ProfessorClassStoryPage(
          roster: roster,
          plan: List.unmodifiable(_plan),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Plano de aula da turma (H1–H5): vira o plano do treino daqui.
    _seedFromLessonPlan(ref.watch(professorLessonPlanProvider(
      (kind: LessonPlanKind.session, refId: widget.sessionId),
    )));
    final async = ref.watch(professorSessionRosterProvider(widget.sessionId));
    final roster = async.valueOrNull;
    final now = ref.watch(professorAgendaNowProvider);
    final session = roster?.session;

    final Widget body;
    if (roster != null) {
      body = _body(context, roster);
    } else if (async.hasError) {
      body = ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          ProfessorRetryCard(
            message: async.error is ProfessorStudentsException
                ? (async.error as ProfessorStudentsException).message
                : 'Não foi possível carregar a chamada.',
            onRetry: () => ref
                .invalidate(professorSessionRosterProvider(widget.sessionId)),
          ),
        ],
      );
    } else {
      body = const Center(
        child: CircularProgressIndicator(color: AppColors.brand),
      );
    }

    return ProfessorLinksScaffold(
      title: 'Treino encerrado',
      subtitle: session == null
          ? null
          : '${session.className} · '
                  '${professorDayLabel(session.date, now.todayKey)} '
                  '${session.startTime}–${session.endTime}'
              .toUpperCase(),
      onBack: _close,
      body: body,
    );
  }

  Widget _body(BuildContext context, TeacherClassRoster roster) {
    final colors = context.themeColors;
    final summary = professorClassSummary(roster);
    final present = [
      for (final s in roster.students)
        if (s.isPresent) s,
    ];
    final canShare = !roster.session.isCanceled;

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            children: [
              ProfessorLinksCard(
                key: const Key('professor-class-closed-stats'),
                child: Row(
                  children: [
                    _Stat(
                      value:
                          summary.minutes == null ? '—' : '${summary.minutes}′',
                      label: 'Duração',
                      first: true,
                    ),
                    _Stat(
                      value: '${summary.present}/${summary.total}',
                      label: 'Presentes',
                    ),
                    _Stat(
                      value: '${summary.taggable}',
                      label: 'No story',
                      color: AppColors.win,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 22),
              const ProfessorLinksKicker('Presentes'),
              const SizedBox(height: 6),
              if (present.isEmpty)
                const ProfessorMutedText(
                  'Ninguém foi marcado como presente na chamada.',
                )
              else
                for (final s in present)
                  Padding(
                    key: Key('professor-class-closed-present-${s.studentId}'),
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
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                s.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: ProfessorLinksStyle.display(
                                  13,
                                  weight: FontWeight.w600,
                                  color: colors.onSurface,
                                ),
                              ),
                              Text(
                                s.storyTaggable
                                    ? 'Pode ser marcado no story'
                                    : s.kind == 'makeup'
                                        ? 'Reposição'
                                        : s.kind == 'trial'
                                            ? 'Experimental'
                                            : 'Não liberou o story',
                                style: ProfessorLinksStyle.display(
                                  10.5,
                                  color: colors.onSurfaceMuted,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Icon(
                          Icons.check_rounded,
                          size: 18,
                          color: colors.win,
                        ),
                      ],
                    ),
                  ),
              const SizedBox(height: 22),
              const ProfessorLinksKicker('Plano do treino'),
              const SizedBox(height: 8),
              ProfessorLinksCard(
                key: const Key('professor-class-closed-plan'),
                padding: const EdgeInsets.fromLTRB(14, 8, 6, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (var i = 0; i < _plan.length; i++)
                      Row(
                        key: Key('professor-class-closed-plan-$i'),
                        children: [
                          SizedBox(
                            width: 34,
                            child: Text(
                              _plan[i].artLine.$1,
                              style: ProfessorLinksStyle.mono(
                                11,
                                color: colors.brandText,
                                weight: FontWeight.w700,
                              ),
                            ),
                          ),
                          Expanded(
                            child: Text(
                              _plan[i].label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: ProfessorLinksStyle.display(
                                12.5,
                                weight: FontWeight.w500,
                                color: colors.onSurface,
                              ),
                            ),
                          ),
                          IconButton(
                            tooltip: 'Tirar bloco',
                            visualDensity: VisualDensity.compact,
                            icon: Icon(
                              Icons.close_rounded,
                              size: 16,
                              color: colors.onSurfaceMuted,
                            ),
                            onPressed: () => setState(() => _plan.removeAt(i)),
                          ),
                        ],
                      ),
                    if (_plan.length < kClassStoryPlanMaxBlocks)
                      TextButton.icon(
                        key: const Key('professor-class-closed-add-block'),
                        onPressed: _addBlock,
                        style: TextButton.styleFrom(
                          foregroundColor: colors.brandText,
                          padding: EdgeInsets.zero,
                        ),
                        icon: const Icon(Icons.add_rounded, size: 18),
                        label: Text(
                          _plan.isEmpty ? 'Montar o plano' : 'Adicionar bloco',
                          style: ProfessorLinksStyle.display(
                            13,
                            weight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              ProfessorMutedText(
                _planNote,
                key: const Key('professor-class-closed-plan-note'),
              ),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (canShare) ...[
                  ProfessorLinksPrimaryButton(
                    key: const Key('professor-class-closed-share'),
                    label: 'Compartilhar no story',
                    onPressed: () => _openStory(roster),
                  ),
                  const SizedBox(height: 8),
                ],
                ProfessorLinksGhostButton(
                  key: const Key('professor-class-closed-close'),
                  label: 'Fechar',
                  onPressed: _close,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({
    required this.value,
    required this.label,
    this.first = false,
    this.color,
  });

  final String value;
  final String label;
  final bool first;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Expanded(
      child: Container(
        padding: EdgeInsets.only(left: first ? 0 : 12),
        decoration: BoxDecoration(
          border: first
              ? null
              : Border(
                  left: BorderSide(
                    color: colors.onSurface.withValues(alpha: 0.08),
                  ),
                ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: ProfessorLinksStyle.display(
                19,
                weight: FontWeight.w800,
                color: color == null
                    ? colors.onSurface
                    : colors.readableTone(color!),
              ),
            ),
            const SizedBox(height: 3),
            Text(
              label,
              style: ProfessorLinksStyle.display(
                11,
                color: colors.onSurfaceMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Um bloco novo do plano: minutos + o que foi feito.
class _PlanBlockDialog extends StatefulWidget {
  const _PlanBlockDialog();

  @override
  State<_PlanBlockDialog> createState() => _PlanBlockDialogState();
}

class _PlanBlockDialogState extends State<_PlanBlockDialog> {
  final _minutes = TextEditingController(text: '10');
  final _label = TextEditingController();

  @override
  void dispose() {
    _minutes.dispose();
    _label.dispose();
    super.dispose();
  }

  ClassStoryPlanBlock? get _block {
    final minutes = int.tryParse(_minutes.text.trim());
    final label = _label.text.trim();
    if (minutes == null || minutes < 1 || minutes > 240 || label.isEmpty) {
      return null;
    }
    return ClassStoryPlanBlock(minutes: minutes, label: label);
  }

  @override
  Widget build(BuildContext context) {
    final block = _block;
    return AlertDialog(
      backgroundColor: context.themeColors.surfaceSheet,
      title: const Text('Bloco do treino'),
      content: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 72,
            child: TextField(
              key: const Key('professor-plan-block-minutes'),
              controller: _minutes,
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(3),
              ],
              decoration: const InputDecoration(labelText: 'Min'),
              onChanged: (_) => setState(() {}),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: TextField(
              key: const Key('professor-plan-block-label'),
              controller: _label,
              autofocus: true,
              maxLength: kClassStoryPlanLabelMax,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'O que foi feito',
                hintText: 'Ex.: saque cruzado',
              ),
              onChanged: (_) => setState(() {}),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Voltar'),
        ),
        FilledButton(
          key: const Key('professor-plan-block-save'),
          onPressed: block == null ? null : () => Navigator.pop(context, block),
          child: const Text('Adicionar'),
        ),
      ],
    );
  }
}
