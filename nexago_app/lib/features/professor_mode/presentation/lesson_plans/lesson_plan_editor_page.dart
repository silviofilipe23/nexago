import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_lesson_plans_providers.dart';
import '../../domain/professor_lesson_plans.dart';
import '../../infrastructure/professor_students_repository.dart'
    show ProfessorStudentsException;
import '../wallet/professor_wallet_widgets.dart';
import '../widgets/professor_students_widgets.dart';
import 'lesson_exercise_pages.dart';
import 'lesson_live_page.dart' show LessonPlanDayActions;
import 'lesson_plan_comments_sheet.dart';
import 'lesson_plan_widgets.dart';

/// H2 · Editor do plano da aula: objetivo e fundamentos, blocos (ordem,
/// tempo, comentários), foco individual, "Mostrar plano aos alunos",
/// "Salvar modelo" e "Salvar e publicar". Pede confirmação para sair com
/// alteração não salva.
class ProfessorLessonPlanEditorPage extends ConsumerStatefulWidget {
  const ProfessorLessonPlanEditorPage({
    super.key,
    required this.kind,
    required this.refId,
    this.prefill,
  });

  final LessonPlanKind kind;
  final String refId;

  /// Modelo ou plano anterior ("Usar modelo" / "Repetir anterior").
  final LessonPlanContent? prefill;

  @override
  ConsumerState<ProfessorLessonPlanEditorPage> createState() =>
      _ProfessorLessonPlanEditorPageState();
}

class _ProfessorLessonPlanEditorPageState
    extends ConsumerState<ProfessorLessonPlanEditorPage> {
  final _objective = TextEditingController();
  final _tags = <LessonPlanCategory>{};
  var _blocks = <LessonPlanBlock>[];
  var _focus = <LessonPlanFocus>[];
  bool _published = true;
  bool _dirty = false;
  bool _ready = false;
  bool _saving = false;
  LessonPlan? _existing;
  int _seq = 0;

  LessonPlanRef get _key => (kind: widget.kind, refId: widget.refId);

  String _nextId() =>
      'b${DateTime.now().millisecondsSinceEpoch % 100000000}_${_seq++}';

  @override
  void initState() {
    super.initState();
    _objective.addListener(_markDirtyFromText);
  }

  String _lastObjective = '';

  void _markDirtyFromText() {
    if (!_ready || _objective.text == _lastObjective) return;
    _lastObjective = _objective.text;
    if (!_dirty) setState(() => _dirty = true);
  }

  @override
  void dispose() {
    _objective.dispose();
    super.dispose();
  }

  void _init(LessonPlan? plan) {
    _existing = plan;
    final prefill = widget.prefill;
    final content = prefill ?? plan?.content;
    if (content != null) {
      _objective.text = content.objective;
      _tags
        ..clear()
        ..addAll(content.tags);
      _blocks = prefill != null
          ? lessonPlanFreshBlocks(content.blocks, nextId: _nextId)
          : List.of(content.blocks);
    }
    if (plan != null) {
      _focus = List.of(plan.focus);
      _published = plan.published || plan.status == LessonPlanStatus.draft;
    }
    _lastObjective = _objective.text;
    _dirty = prefill != null;
    _ready = true;
  }

  void _change(VoidCallback fn) => setState(() {
        fn();
        _dirty = true;
      });

  Future<bool> _confirmDiscard() async {
    final r = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sair sem salvar?'),
        content: const Text('As alterações deste plano serão perdidas.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Continuar editando'),
          ),
          FilledButton(
            key: const Key('lesson-plan-discard'),
            style: FilledButton.styleFrom(backgroundColor: AppColors.live),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Descartar'),
          ),
        ],
      ),
    );
    return r == true;
  }

  Future<void> _leave() async {
    if (_dirty && !await _confirmDiscard()) return;
    if (!mounted) return;
    setState(() => _dirty = false);
    popOrGo(context, AppRoutes.professorLessonPlans);
  }

  Future<void> _addExercises(String subtitle) async {
    final picks = await pickLessonExercises(context, subtitle: subtitle);
    if (picks == null || picks.isEmpty || !mounted) return;
    _change(() {
      for (final p in picks) {
        _blocks.add(
          p.exercise.toBlock(blockId: _nextId(), minutesInPlan: p.minutes),
        );
      }
    });
  }

  void _move(int from, int to) {
    if (to < 0 || to >= _blocks.length || from == to) return;
    _change(() {
      final b = _blocks.removeAt(from);
      _blocks.insert(to, b);
    });
  }

  Future<void> _remove(int i) async {
    final b = _blocks[i];
    final ok = await confirmProfessorWalletAction(
      context,
      title: 'Remover bloco?',
      body: '"${b.name}" sai deste plano.',
      confirmLabel: 'Remover',
    );
    if (!ok || !mounted) return;
    _change(() => _blocks.removeAt(i));
  }

  Future<void> _editBlock(int i) async {
    final edited = await showProfessorLinksSheet<LessonPlanBlock>(
      context,
      builder: (_) => _BlockEditSheet(block: _blocks[i]),
    );
    if (edited == null || !mounted) return;
    _change(() => _blocks[i] = edited);
  }

  Future<void> _openComments(int? blockIndex) async {
    final lesson = ref.read(lessonPlanLessonProvider(_key)).valueOrNull;
    final r = await showProfessorLinksSheet<LessonPlanCommentsResult>(
      context,
      builder: (_) => LessonPlanCommentsSheet(
        block: blockIndex == null ? null : _blocks[blockIndex],
        blockNumber: blockIndex == null ? null : blockIndex + 1,
        focus: _focus,
        lessonKey: _key,
        fallbackStudents: lesson?.students,
      ),
    );
    if (r == null || !mounted) return;
    _change(() {
      if (blockIndex != null) {
        _blocks[blockIndex] = _blocks[blockIndex]
            .copyWith(note: r.note, notePublic: r.notePublic);
      }
      _focus = r.focus;
    });
  }

  LessonPlanDraft _draft(LessonPlanStatus status) => LessonPlanDraft(
        kind: widget.kind,
        refId: widget.refId,
        objective: _objective.text,
        tags: _tags.toList(),
        blocks: _blocks,
        focus: _focus,
        published: _published,
        status: status,
      );

  Future<void> _save(LessonPlanStatus status) async {
    final draft = _draft(status);
    final error = validateLessonPlanDraft(draft);
    if (error != null) {
      showAppSnackBar(context, error, isError: true);
      return;
    }
    setState(() => _saving = true);
    try {
      final r = await ref
          .read(professorLessonPlansRepositoryProvider)
          .savePlan(draft);
      if (!mounted) return;
      final payload = draft.toPayload();
      final published = payload['published'] == true;
      showAppSnackBar(
        context,
        draft.effectiveStatus == LessonPlanStatus.draft
            ? 'Rascunho salvo.'
            : published && r.viewCount > 0
                ? 'Plano publicado para ${r.viewCount} '
                    'aluno${r.viewCount == 1 ? '' : 's'}.'
                : 'Plano salvo.',
      );
      setState(() {
        _dirty = false;
        _saving = false;
      });
      popOrGo(context, AppRoutes.professorLessonPlans);
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showAppSnackBar(
        context,
        e is ProfessorStudentsException
            ? e.message
            : 'Não foi possível salvar o plano.',
        isError: true,
      );
    }
  }

  Future<void> _delete() async {
    final plan = _existing;
    if (plan == null) return;
    final ok = await confirmProfessorWalletAction(
      context,
      title: 'Apagar plano?',
      body: 'O plano desta aula some para você e para os alunos.',
      confirmLabel: 'Apagar plano',
    );
    if (!ok || !mounted) return;
    final done = await runProfessorWalletAction(
      context,
      () =>
          ref.read(professorLessonPlansRepositoryProvider).deletePlan(plan.id),
      message: 'Plano apagado.',
    );
    if (!done || !mounted) return;
    setState(() => _dirty = false);
    popOrGo(context, AppRoutes.professorLessonPlans);
  }

  Future<void> _saveTemplate() async {
    if (_blocks.isEmpty) {
      showAppSnackBar(context, 'Adicione blocos antes de salvar o modelo.',
          isError: true);
      return;
    }
    final r = await showDialog<({String name, String level})>(
      context: context,
      builder: (_) => const LessonTemplateNameDialog(),
    );
    if (r == null || !mounted) return;
    await runProfessorWalletAction(
      context,
      () => ref.read(professorLessonPlansRepositoryProvider).saveTemplate(
            ref.read(professorLinksUidProvider),
            name: r.name,
            level: r.level,
            content: LessonPlanContent(
              objective: _objective.text,
              tags: _tags.toList(),
              blocks: _blocks,
            ),
          ),
      message: 'Modelo salvo.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final planAsync = ref.watch(professorLessonPlanProvider(_key));
    final lesson = ref.watch(lessonPlanLessonProvider(_key)).valueOrNull;
    if (!_ready && (planAsync.hasValue || planAsync.hasError)) {
      _init(planAsync.valueOrNull);
    }
    final title = lesson?.title ?? _existing?.title ?? 'Aula';
    final date = lesson?.date ?? _existing?.date ?? '';
    final start = lesson?.startTime ?? _existing?.startTime ?? '';
    final duration = lesson?.durationMin ??
        _existing?.lessonDurationMin ??
        kLessonPlanDefaultDurationMin;
    final subtitle = [
      if (date.isNotEmpty) lessonPlanDayLabel(date),
      if (start.isNotEmpty) start,
      '$duration MIN',
    ].join(' · ');

    final menu = PopupMenuButton<String>(
      key: const Key('lesson-plan-menu'),
      icon: Icon(Icons.more_horiz_rounded, color: colors.onSurface),
      onSelected: (v) {
        if (v == 'draft') _save(LessonPlanStatus.draft);
        if (v == 'delete') _delete();
      },
      itemBuilder: (_) => [
        const PopupMenuItem(
          key: Key('lesson-plan-menu-draft'),
          value: 'draft',
          child: Text('Salvar rascunho'),
        ),
        if (_existing != null)
          const PopupMenuItem(
            key: Key('lesson-plan-menu-delete'),
            value: 'delete',
            child: Text('Apagar plano'),
          ),
      ],
    );

    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _leave();
      },
      child: ProfessorLinksScaffold(
        title: 'Plano · $title',
        subtitle: subtitle,
        onBack: _leave,
        trailing: _ready ? menu : null,
        body: !_ready
            ? ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
                children: [
                  if (planAsync.hasError)
                    ProfessorRetryCard(
                      message: 'Não foi possível carregar o plano.',
                      onRetry: () =>
                          ref.invalidate(professorLessonPlansProvider),
                    )
                  else
                    const ProfessorWalletLoading(),
                ],
              )
            : _body(context, title, date, duration),
      ),
    );
  }

  Widget _body(BuildContext context, String title, String date, int duration) {
    final colors = context.themeColors;
    final total = lessonPlanTotalMinutes(_blocks);
    final fits = lessonPlanFits(total, duration);
    final dayLabel = date.isEmpty ? '' : ' · ${lessonPlanDayLabel(date)}';
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            children: [
              if (ref.watch(professorLessonPlanProvider(_key)).valueOrNull
                  case final saved?) ...[
                LessonPlanDayActions(plan: saved),
                const SizedBox(height: 12),
              ],
              ProfessorLinksCard(
                padding: const EdgeInsets.all(13),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const ProfessorLinksKicker('Objetivo da aula'),
                    const SizedBox(height: 6),
                    TextField(
                      key: const Key('lesson-plan-objective'),
                      controller: _objective,
                      maxLength: kLessonPlanObjectiveMax,
                      minLines: 1,
                      maxLines: 3,
                      textCapitalization: TextCapitalization.sentences,
                      style: ProfessorLinksStyle.display(
                        15,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                      decoration: InputDecoration(
                        isDense: true,
                        counterText: '',
                        border: InputBorder.none,
                        hintText: 'Ex.: saque com direção e devolução cruzada',
                        hintStyle: AppTypography.bodyM.copyWith(
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final c in LessonPlanCategory.values)
                          LessonPlanChip(
                            key: Key('lesson-plan-tag-${c.name}'),
                            label: c.label,
                            color: lessonPlanCategoryColor(c),
                            selected: _tags.contains(c),
                            onTap: () => _change(() {
                              if (!_tags.remove(c) &&
                                  _tags.length < kLessonPlanMaxTags) {
                                _tags.add(c);
                              }
                            }),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: ProfessorLinksKicker('Blocos · ${_blocks.length}'),
                  ),
                  Text(
                    '$total′ / $duration′',
                    key: const Key('lesson-plan-total'),
                    style: ProfessorLinksStyle.mono(
                      11,
                      color: colors.readableTone(
                        fits ? AppColors.win : AppColors.live,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              LessonPlanTimeBar(
                key: const Key('lesson-plan-time-bar'),
                segments: lessonPlanSegmentsOf(_blocks),
                durationMin: duration,
              ),
              if (!fits) ...[
                const SizedBox(height: 8),
                ProfessorLinksNote(
                  'Os blocos passam ${total - duration}′ da duração da aula.',
                  key: const Key('lesson-plan-over'),
                  tone: ProfessorLinksNoteTone.red,
                ),
              ],
              const SizedBox(height: 10),
              ReorderableListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                buildDefaultDragHandles: false,
                itemCount: _blocks.length,
                onReorderItem: _move,
                itemBuilder: (context, i) => Padding(
                  key: ValueKey(_blocks[i].id),
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _BlockCard(
                    index: i,
                    block: _blocks[i],
                    isFirst: i == 0,
                    isLast: i == _blocks.length - 1,
                    onTap: () => _openComments(i),
                    onAction: (a) => switch (a) {
                      _BlockAction.edit => _editBlock(i),
                      _BlockAction.up => _move(i, i - 1),
                      _BlockAction.down => _move(i, i + 1),
                      _BlockAction.remove => _remove(i),
                    },
                  ),
                ),
              ),
              LessonPlanAddButton(
                key: const Key('lesson-plan-add-exercise'),
                label: 'Adicionar exercício',
                onTap: () => _addExercises('ADICIONAR AO PLANO$dayLabel'),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: ProfessorLinksKicker(
                      'Foco individual · ${_focus.length}',
                    ),
                  ),
                  TextButton(
                    key: const Key('lesson-plan-focus-edit'),
                    onPressed: () => _openComments(null),
                    child: Text(
                      _focus.isEmpty ? '+ Marcar aluno' : 'Editar',
                      style: AppTypography.bodyS.copyWith(
                        fontWeight: FontWeight.w600,
                        color: colors.readableTone(AppColors.brandHover),
                      ),
                    ),
                  ),
                ],
              ),
              if (_focus.isEmpty)
                const ProfessorMutedText(
                  'Marque um ponto de atenção para um aluno — privado ou '
                  'visível para ele.',
                )
              else
                for (final f in _focus)
                  Padding(
                    key: Key('lesson-plan-focus-${f.athleteId}'),
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                f.name,
                                style: ProfessorLinksStyle.display(
                                  12.5,
                                  weight: FontWeight.w600,
                                  color: colors.onSurface,
                                ),
                              ),
                              const SizedBox(height: 2),
                              ProfessorMutedText(f.text),
                            ],
                          ),
                        ),
                        LessonPlanFocusVisibilityTag(public: f.public),
                      ],
                    ),
                  ),
              const SizedBox(height: 14),
              ProfessorLinksCard(
                padding: const EdgeInsets.fromLTRB(13, 8, 8, 8),
                child: ProfessorWalletToggleRow(
                  key: const Key('lesson-plan-publish-toggle'),
                  title: 'Mostrar plano aos alunos',
                  subtitle: _published
                      ? 'Objetivo, blocos e notas marcadas como visíveis'
                      : 'Só você vê este plano',
                  value: _published,
                  onChanged: (v) => _change(() => _published = v),
                ),
              ),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: Row(
              children: [
                SizedBox(
                  width: 140,
                  child: ProfessorLinksGhostButton(
                    key: const Key('lesson-plan-save-template'),
                    label: 'Salvar modelo',
                    height: 52,
                    onPressed: _saving ? null : _saveTemplate,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ProfessorLinksPrimaryButton(
                    key: const Key('lesson-plan-save'),
                    label: _published ? 'Salvar e publicar' : 'Salvar plano',
                    loading: _saving,
                    onPressed: () => _save(LessonPlanStatus.ready),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

enum _BlockAction { edit, up, down, remove }

class _BlockCard extends StatelessWidget {
  const _BlockCard({
    required this.index,
    required this.block,
    required this.isFirst,
    required this.isLast,
    required this.onTap,
    required this.onAction,
  });

  final int index;
  final LessonPlanBlock block;
  final bool isFirst;
  final bool isLast;
  final VoidCallback onTap;
  final ValueChanged<_BlockAction> onAction;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final b = block;
    return ProfessorLinksCard(
      key: Key('lesson-plan-block-$index'),
      padding: const EdgeInsets.fromLTRB(4, 8, 0, 10),
      onTap: onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ReorderableDragStartListener(
            index: index,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(4, 4, 6, 4),
              child: Icon(Icons.drag_indicator_rounded,
                  size: 18, color: ProfessorLinksStyle.dim(colors)),
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      LessonPlanCategoryTag(b.category),
                      const Spacer(),
                      Text(
                        '${b.minutes}′',
                        style: ProfessorLinksStyle.mono(
                          12,
                          color: colors.onSurface,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    b.name,
                    style: ProfessorLinksStyle.display(
                      13.5,
                      weight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  if (b.detail.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      b.detail,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                  if (b.hasNote) ...[
                    const SizedBox(height: 9),
                    LessonPlanNoteBox(
                      key: Key('lesson-plan-block-note-$index'),
                      text: b.note,
                      public: b.notePublic,
                    ),
                  ],
                ],
              ),
            ),
          ),
          PopupMenuButton<_BlockAction>(
            key: Key('lesson-plan-block-menu-$index'),
            icon: Icon(Icons.more_vert_rounded,
                size: 18, color: ProfessorLinksStyle.dim(colors)),
            onSelected: onAction,
            itemBuilder: (_) => [
              const PopupMenuItem(
                value: _BlockAction.edit,
                child: Text('Editar'),
              ),
              if (!isFirst)
                const PopupMenuItem(
                  value: _BlockAction.up,
                  child: Text('Subir'),
                ),
              if (!isLast)
                const PopupMenuItem(
                  value: _BlockAction.down,
                  child: Text('Descer'),
                ),
              const PopupMenuItem(
                value: _BlockAction.remove,
                child: Text('Remover'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Edita nome, detalhe, fundamento e tempo do bloco.
class _BlockEditSheet extends StatefulWidget {
  const _BlockEditSheet({required this.block});

  final LessonPlanBlock block;

  @override
  State<_BlockEditSheet> createState() => _BlockEditSheetState();
}

class _BlockEditSheetState extends State<_BlockEditSheet> {
  late final _name = TextEditingController(text: widget.block.name);
  late final _detail = TextEditingController(text: widget.block.detail);
  late LessonPlanCategory _category = widget.block.category;
  late int _minutes = widget.block.minutes;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _detail.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ProfessorLinksSheetBody(
      title: 'Editar bloco',
      children: [
        ProfessorWalletField(
          key: const Key('lesson-plan-block-name'),
          label: 'Nome',
          controller: _name,
          maxLength: 80,
          error: _error,
        ),
        ProfessorWalletField(
          key: const Key('lesson-plan-block-detail'),
          label: 'Detalhe',
          controller: _detail,
          maxLength: 200,
        ),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final c in LessonPlanCategory.values)
              LessonPlanChip(
                label: c.label,
                color: lessonPlanCategoryColor(c),
                selected: _category == c,
                onTap: () => setState(() => _category = c),
              ),
          ],
        ),
        Row(
          children: [
            const Expanded(child: ProfessorLinksKicker('Tempo')),
            LessonPlanStepper(
              value: _minutes,
              min: kLessonPlanBlockMinMin,
              max: kLessonPlanBlockMaxMin,
              onChanged: (v) => setState(() => _minutes = v),
            ),
          ],
        ),
        ProfessorLinksPrimaryButton(
          key: const Key('lesson-plan-block-save'),
          label: 'Salvar bloco',
          onPressed: () {
            if (_name.text.trim().isEmpty) {
              setState(() => _error = 'Dê um nome ao bloco.');
              return;
            }
            Navigator.of(context).pop(widget.block.copyWith(
              name: _name.text.trim(),
              detail: _detail.text.trim(),
              category: _category,
              minutes: _minutes,
            ));
          },
        ),
      ],
    );
  }
}

/// Nome e nível do modelo ("Salvar modelo", editar modelo).
class LessonTemplateNameDialog extends StatefulWidget {
  const LessonTemplateNameDialog({super.key, this.name, this.level});

  final String? name;
  final String? level;

  @override
  State<LessonTemplateNameDialog> createState() =>
      _LessonTemplateNameDialogState();
}

class _LessonTemplateNameDialogState extends State<LessonTemplateNameDialog> {
  late final _name = TextEditingController(text: widget.name);
  late String _level = widget.level ?? 'Todos';
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.name == null ? 'Salvar como modelo' : 'Editar modelo'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            key: const Key('lesson-template-name'),
            controller: _name,
            maxLength: kLessonTemplateNameMax,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: 'Nome do modelo',
              errorText: _error,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final l in kLessonPlanLevels)
                LessonPlanChip(
                  key: Key('lesson-template-level-$l'),
                  label: l,
                  selected: _level == l,
                  onTap: () => setState(() => _level = l),
                ),
            ],
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          key: const Key('lesson-template-confirm'),
          onPressed: () {
            final name = _name.text.trim();
            if (name.isEmpty) {
              setState(() => _error = 'Dê um nome ao modelo.');
              return;
            }
            Navigator.pop(context, (name: name, level: _level));
          },
          child: const Text('Salvar'),
        ),
      ],
    );
  }
}
