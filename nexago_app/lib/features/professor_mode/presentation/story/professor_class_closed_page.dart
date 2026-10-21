import 'package:flutter/material.dart';
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
import 'professor_plan_block_sheet.dart';

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
  /// O plano do story, na ordem da arte (arrastar reordena).
  final List<_PlanEntry> _plan = [];
  int _nextKey = 0;

  List<ClassStoryPlanBlock> get _blocks => [for (final e in _plan) e.block];

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
    _plan.addAll([for (final b in r.blocks) _PlanEntry(_nextKey++, b)]);
    _fromLessonPlan = true;
    _planLeft = r.left;
  }

  void _close() => popOrGo(context, AppRoutes.professorAgenda);

  /// G1b — a folha do "Novo bloco"; cada bloco entra na hora, com o selo
  /// NOVO.
  Future<void> _addBlock(int totalMinutes) {
    final plans = ref.read(professorLessonPlansProvider).valueOrNull ??
        const <LessonPlan>[];
    final suggestions = classStoryBlockSuggestions(plans);
    return showProfessorPlanBlockSheet(
      context,
      totalMinutes: totalMinutes,
      plan: _blocks,
      suggestions: suggestions.items,
      suggestionsFromHistory: suggestions.fromHistory,
      onAdd: (block) {
        if (!mounted) return;
        setState(() => _plan.add(_PlanEntry(_nextKey++, block, isNew: true)));
      },
    );
  }

  /// `onReorderItem` já desconta o item tirado de [from].
  void _reorder(int from, int to) {
    setState(() => _plan.insert(to, _plan.removeAt(from)));
  }

  void _openStory(TeacherClassRoster roster) {
    Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute<void>(
        builder: (_) => ProfessorClassStoryPage(
          roster: roster,
          plan: List.unmodifiable(_blocks),
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
    final totalMinutes = summary.minutes ?? 60;
    final used = classStoryPlanMinutes(_blocks);

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
              Row(
                children: [
                  const Expanded(
                    child: ProfessorLinksKicker('Plano do treino'),
                  ),
                  if (_plan.isNotEmpty)
                    Text(
                      '$used/$totalMinutes MIN',
                      key: const Key('professor-class-closed-plan-total'),
                      style: ProfessorLinksStyle.mono(
                        10,
                        weight: FontWeight.w700,
                        color: used > totalMinutes
                            ? colors.live
                            : colors.onSurfaceMuted,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              ProfessorLinksCard(
                key: const Key('professor-class-closed-plan'),
                padding: const EdgeInsets.fromLTRB(4, 6, 6, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ReorderableListView(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      buildDefaultDragHandles: false,
                      onReorderItem: _reorder,
                      proxyDecorator: (child, _, __) => Material(
                        color: Colors.transparent,
                        child: child,
                      ),
                      children: [
                        for (var i = 0; i < _plan.length; i++)
                          _PlanRow(
                            key: ValueKey(_plan[i].key),
                            rowKey: Key('professor-class-closed-plan-$i'),
                            index: i,
                            entry: _plan[i],
                            onRemove: () => setState(() => _plan.removeAt(i)),
                          ),
                      ],
                    ),
                    if (_plan.length < kClassStoryPlanMaxBlocks)
                      Padding(
                        padding: const EdgeInsets.only(left: 10),
                        child: TextButton.icon(
                          key: const Key('professor-class-closed-add-block'),
                          onPressed: () => _addBlock(totalMinutes),
                          style: TextButton.styleFrom(
                            foregroundColor: colors.brandText,
                            padding: EdgeInsets.zero,
                          ),
                          icon: const Icon(Icons.add_rounded, size: 18),
                          label: Text(
                            _plan.isEmpty
                                ? 'Montar o plano'
                                : 'Adicionar bloco',
                            style: ProfessorLinksStyle.display(
                              13,
                              weight: FontWeight.w600,
                            ),
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

/// Um bloco do plano do story; [key] fica com ele ao reordenar.
class _PlanEntry {
  _PlanEntry(this.key, this.block, {this.isNew = false});

  final int key;
  final ClassStoryPlanBlock block;

  /// Entrou agora pelo "Novo bloco" (selo NOVO).
  final bool isNew;
}

/// G1c — uma linha do plano: alça de arrastar, minutos, nome, NOVO e tirar.
class _PlanRow extends StatelessWidget {
  const _PlanRow({
    super.key,
    required this.rowKey,
    required this.index,
    required this.entry,
    required this.onRemove,
  });

  final Key rowKey;
  final int index;
  final _PlanEntry entry;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      key: rowKey,
      children: [
        ReorderableDragStartListener(
          index: index,
          child: Semantics(
            label: 'Arrastar para mudar a ordem',
            child: SizedBox(
              width: 30,
              height: 40,
              child: Icon(
                Icons.drag_indicator_rounded,
                size: 16,
                color: colors.onSurface.withValues(alpha: 0.35),
              ),
            ),
          ),
        ),
        SizedBox(
          width: 34,
          child: Text(
            entry.block.artLine.$1,
            style: ProfessorLinksStyle.mono(
              11,
              color: colors.brandText,
              weight: FontWeight.w700,
            ),
          ),
        ),
        Expanded(
          child: Row(
            children: [
              Flexible(
                child: Text(
                  entry.block.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    12.5,
                    weight: FontWeight.w500,
                    color: colors.onSurface,
                  ),
                ),
              ),
              if (entry.isNew) ...[
                const SizedBox(width: 8),
                Container(
                  key: const Key('professor-class-closed-plan-new'),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.brand.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: Text(
                    'NOVO',
                    style: ProfessorLinksStyle.mono(
                      8.5,
                      weight: FontWeight.w700,
                      color: colors.brandText,
                    ),
                  ),
                ),
              ],
            ],
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
          onPressed: onRemove,
        ),
      ],
    );
  }
}
