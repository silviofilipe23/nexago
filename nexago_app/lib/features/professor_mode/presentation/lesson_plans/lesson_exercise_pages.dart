import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
import 'lesson_plan_widgets.dart';

/// Biblioteca de exercícios (H3), detalhe do exercício (H4) e o formulário
/// do exercício próprio.

/// O que a biblioteca devolve ao editor: o exercício e o tempo no plano.
typedef LessonExercisePick = ({LessonExercise exercise, int minutes});

/// Abre a biblioteca para escolher exercícios (H3).
Future<List<LessonExercisePick>?> pickLessonExercises(
  BuildContext context, {
  String? subtitle,
}) =>
    Navigator.of(context).push<List<LessonExercisePick>>(
      MaterialPageRoute(
        builder: (_) => LessonExerciseLibraryPage(subtitle: subtitle),
      ),
    );

/// Abre o detalhe (H4). Em [addMode] devolve os minutos escolhidos.
Future<int?> openLessonExercise(
  BuildContext context,
  LessonExercise exercise, {
  bool addMode = false,
}) =>
    Navigator.of(context).push<int>(
      MaterialPageRoute(
        builder: (_) =>
            LessonExercisePage(exercise: exercise, addMode: addMode),
      ),
    );

Future<void> openLessonExerciseForm(
  BuildContext context, {
  LessonExercise? exercise,
}) =>
    Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => LessonExerciseFormPage(exercise: exercise),
      ),
    );

/// Busca, filtro por fundamento e a lista (NexaGO + próprios).
class LessonExerciseList extends ConsumerStatefulWidget {
  const LessonExerciseList({
    super.key,
    required this.onOpen,
    this.selectedIds,
    this.onToggle,
    this.bottomPadding = 40,
  });

  /// Ids marcados (`null` = só leitura).
  final Set<String>? selectedIds;
  final ValueChanged<LessonExercise>? onToggle;
  final ValueChanged<LessonExercise> onOpen;
  final double bottomPadding;

  @override
  ConsumerState<LessonExerciseList> createState() => _LessonExerciseListState();
}

class _LessonExerciseListState extends ConsumerState<LessonExerciseList> {
  LessonPlanCategory? _filter;
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final all = ref.watch(lessonExerciseLibraryProvider);
    final list = [
      for (final e in all)
        if ((_filter == null || e.category == _filter) && e.matches(_query)) e,
    ];
    final selectable = widget.selectedIds != null;
    return ListView(
      padding: EdgeInsets.fromLTRB(20, 4, 20, widget.bottomPadding),
      children: [
        TextField(
          key: const Key('lesson-exercise-search'),
          onChanged: (v) => setState(() => _query = v),
          style: AppTypography.bodyM.copyWith(color: colors.onSurface),
          decoration: InputDecoration(
            isDense: true,
            hintText: 'Buscar por nome, fundamento…',
            prefixIcon: Icon(Icons.search_rounded,
                size: 18, color: ProfessorLinksStyle.dim(colors)),
            filled: true,
            fillColor: ProfessorLinksStyle.soft(colors),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(13),
              borderSide: BorderSide(color: ProfessorLinksStyle.line(colors)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(13),
              borderSide: BorderSide(color: ProfessorLinksStyle.line(colors)),
            ),
          ),
        ),
        const SizedBox(height: 12),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              LessonPlanChip(
                key: const Key('lesson-exercise-filter-all'),
                label: 'Todos',
                selected: _filter == null,
                onTap: () => setState(() => _filter = null),
              ),
              for (final c in LessonPlanCategory.values)
                if (c != LessonPlanCategory.outro)
                  Padding(
                    padding: const EdgeInsets.only(left: 6),
                    child: LessonPlanChip(
                      key: Key('lesson-exercise-filter-${c.name}'),
                      label: c.label,
                      color: lessonPlanCategoryColor(c),
                      selected: _filter == c,
                      onTap: () => setState(() => _filter = c),
                    ),
                  ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (list.isEmpty)
          const ProfessorLinksCard(
            key: Key('lesson-exercise-empty'),
            child: ProfessorMutedText('Nenhum exercício com esse filtro.'),
          ),
        for (final e in list) ...[
          _ExerciseTile(
            exercise: e,
            selected: widget.selectedIds?.contains(e.id) ?? false,
            selectable: selectable,
            onTap: selectable
                ? () => widget.onToggle?.call(e)
                : () => widget.onOpen(e),
            onInfo: () => widget.onOpen(e),
          ),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _ExerciseTile extends StatelessWidget {
  const _ExerciseTile({
    required this.exercise,
    required this.selected,
    required this.selectable,
    required this.onTap,
    required this.onInfo,
  });

  final LessonExercise exercise;
  final bool selected;
  final bool selectable;
  final VoidCallback onTap;
  final VoidCallback onInfo;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final e = exercise;
    return ProfessorLinksCard(
      key: Key('lesson-exercise-${e.id}'),
      padding: const EdgeInsets.all(12),
      borderColor: selected ? AppColors.brand.withValues(alpha: 0.45) : null,
      backgroundColor: selected
          ? Color.alphaBlend(
              AppColors.brand.withValues(alpha: 0.08),
              colors.surfaceCard,
            )
          : null,
      onTap: onTap,
      child: Row(
        children: [
          LessonExerciseThumb(category: e.category),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  e.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    13.5,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  [
                    '${e.minutes}′',
                    if (e.players.isNotEmpty) '${e.players} JOG.',
                    e.level.toUpperCase(),
                  ].join(' · '),
                  style: ProfessorLinksStyle.mono(
                    10,
                    weight: FontWeight.w600,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  e.sourceLabel,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 10.5,
                    color: e.isOwn
                        ? colors.readableTone(AppColors.brandHover)
                        : ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          if (selectable) ...[
            IconButton(
              key: Key('lesson-exercise-info-${e.id}'),
              tooltip: 'Ver exercício',
              onPressed: onInfo,
              icon: Icon(Icons.info_outline_rounded,
                  size: 18, color: ProfessorLinksStyle.dim(colors)),
            ),
            Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                color: selected ? AppColors.brand : Colors.transparent,
                borderRadius: BorderRadius.circular(8),
                border: selected
                    ? null
                    : Border.all(color: ProfessorLinksStyle.line2(colors)),
              ),
              child: selected
                  ? const Icon(Icons.check_rounded,
                      size: 16, color: ProfessorLinksStyle.onBrand)
                  : null,
            ),
          ] else
            Icon(Icons.chevron_right_rounded,
                color: ProfessorLinksStyle.dim(colors)),
        ],
      ),
    );
  }
}

// ── H3 · Biblioteca ──────────────────────────────────────────────────────

class LessonExerciseLibraryPage extends ConsumerStatefulWidget {
  const LessonExerciseLibraryPage({super.key, this.subtitle});

  final String? subtitle;

  @override
  ConsumerState<LessonExerciseLibraryPage> createState() =>
      _LessonExerciseLibraryPageState();
}

class _LessonExerciseLibraryPageState
    extends ConsumerState<LessonExerciseLibraryPage> {
  /// Na ordem em que foram marcados.
  final _selected = <String, LessonExercise>{};

  List<LessonExercisePick> get _picks => [
        for (final e in _selected.values) (exercise: e, minutes: e.minutes),
      ];

  void _toggle(LessonExercise e) => setState(() {
        if (_selected.remove(e.id) == null) _selected[e.id] = e;
      });

  Future<void> _open(LessonExercise e) async {
    final minutes = await openLessonExercise(context, e, addMode: true);
    if (minutes == null || !mounted) return;
    _selected.remove(e.id);
    Navigator.of(context).pop([..._picks, (exercise: e, minutes: minutes)]);
  }

  @override
  Widget build(BuildContext context) {
    final picks = _picks;
    final total = picks.fold<int>(0, (s, p) => s + p.minutes);
    return ProfessorLinksScaffold(
      title: 'Exercícios',
      subtitle: widget.subtitle ?? 'ADICIONAR AO PLANO',
      onBack: () => Navigator.of(context).maybePop(),
      trailing: ProfessorLinksRoundButton(
        key: const Key('lesson-exercise-new'),
        icon: Icons.add_rounded,
        semanticLabel: 'Novo exercício',
        onTap: () => openLessonExerciseForm(context),
      ),
      body: Column(
        children: [
          Expanded(
            child: LessonExerciseList(
              selectedIds: _selected.keys.toSet(),
              onToggle: _toggle,
              onOpen: _open,
              bottomPadding: 16,
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: ProfessorLinksPrimaryButton(
                key: const Key('lesson-exercise-add-selected'),
                label: picks.isEmpty
                    ? 'Selecione exercícios'
                    : 'Adicionar ${picks.length} ao plano · $total′',
                onPressed: picks.isEmpty
                    ? null
                    : () => Navigator.of(context).pop(picks),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── H4 · Exercício ───────────────────────────────────────────────────────

class LessonExercisePage extends ConsumerStatefulWidget {
  const LessonExercisePage({
    super.key,
    required this.exercise,
    this.addMode = false,
  });

  final LessonExercise exercise;

  /// Aberto da biblioteca do editor: duração + "Adicionar ao plano".
  final bool addMode;

  @override
  ConsumerState<LessonExercisePage> createState() => _LessonExercisePageState();
}

class _LessonExercisePageState extends ConsumerState<LessonExercisePage> {
  late int _minutes = widget.exercise.minutes.clamp(5, 60);

  LessonExercise get _live {
    if (widget.exercise.builtIn) return widget.exercise;
    for (final e
        in ref.watch(professorOwnExercisesProvider).valueOrNull ?? const []) {
      if (e.id == widget.exercise.id) return e;
    }
    return widget.exercise;
  }

  Future<void> _delete(LessonExercise e) async {
    final ok = await confirmProfessorWalletAction(
      context,
      title: 'Apagar exercício?',
      body: '"${e.name}" sai da sua biblioteca. Os planos que já usam o '
          'exercício continuam com o bloco.',
      confirmLabel: 'Apagar',
    );
    if (!ok || !mounted) return;
    final done = await runProfessorWalletAction(
      context,
      () => ref
          .read(professorLessonPlansRepositoryProvider)
          .deleteExercise(ref.read(professorLinksUidProvider), e.id),
      message: 'Exercício apagado.',
    );
    if (done && mounted) Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final e = _live;
    Widget tag(String text) => Container(
          height: 22,
          padding: const EdgeInsets.symmetric(horizontal: 8),
          decoration: BoxDecoration(
            color: ProfessorLinksStyle.soft(colors),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Center(
            widthFactor: 1,
            child: Text(
              text,
              style: AppTypography.bodyS.copyWith(
                fontSize: 11,
                color: ProfessorLinksStyle.mute(colors),
              ),
            ),
          ),
        );
    Widget variation(String label, String text, Color c, Key key) => Expanded(
          child: ProfessorLinksCard(
            key: key,
            padding: const EdgeInsets.all(11),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label.toUpperCase(),
                  style: ProfessorLinksStyle.mono(9.5,
                      color: colors.readableTone(c)),
                ),
                const SizedBox(height: 5),
                Text(
                  text.isEmpty ? '—' : text,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12,
                    height: 1.4,
                    color: ProfessorLinksStyle.mute(colors),
                  ),
                ),
              ],
            ),
          ),
        );

    return ProfessorLinksScaffold(
      title: e.name,
      subtitle: [
        e.sourceLabel.toUpperCase(),
        if (e.uses > 0) 'USADO ${e.uses}×',
      ].join(' · '),
      onBack: () => Navigator.of(context).maybePop(),
      trailing: e.isOwn
          ? PopupMenuButton<String>(
              key: const Key('lesson-exercise-menu'),
              icon: Icon(Icons.more_horiz_rounded, color: colors.onSurface),
              onSelected: (v) {
                if (v == 'edit') openLessonExerciseForm(context, exercise: e);
                if (v == 'delete') _delete(e);
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'edit', child: Text('Editar')),
                PopupMenuItem(value: 'delete', child: Text('Apagar')),
              ],
            )
          : null,
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                const LessonExerciseMediaPlaceholder(),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    LessonPlanCategoryTag(e.category, small: false),
                    tag(e.level),
                    if (e.players.isNotEmpty) tag('${e.players} jogadores'),
                    if (e.equipment.isNotEmpty) tag(e.equipment),
                  ],
                ),
                const SizedBox(height: 18),
                const ProfessorLinksKicker('Como fazer'),
                const SizedBox(height: 8),
                if (e.steps.isEmpty)
                  const ProfessorMutedText('Sem passos descritos.'),
                for (var i = 0; i < e.steps.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 22,
                          height: 22,
                          decoration: BoxDecoration(
                            color: ProfessorLinksStyle.soft(colors),
                            borderRadius: BorderRadius.circular(7),
                            border: Border.all(
                              color: ProfessorLinksStyle.line2(colors),
                            ),
                          ),
                          child: Center(
                            child: Text(
                              '${i + 1}',
                              style: ProfessorLinksStyle.mono(
                                10.5,
                                color: colors.onSurface,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 11),
                        Expanded(
                          child: Text(
                            e.steps[i],
                            style: AppTypography.bodyS.copyWith(
                              fontSize: 13,
                              height: 1.45,
                              color: colors.onSurface,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 8),
                const ProfessorLinksKicker('Variações'),
                const SizedBox(height: 8),
                IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      variation('Mais fácil', e.easier, AppColors.win,
                          const Key('lesson-exercise-easier')),
                      const SizedBox(width: 8),
                      variation('Mais difícil', e.harder, AppColors.live,
                          const Key('lesson-exercise-harder')),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                const ProfessorLinksKicker('Pontos de atenção'),
                const SizedBox(height: 8),
                Container(
                  key: const Key('lesson-exercise-attention'),
                  padding: const EdgeInsets.fromLTRB(13, 11, 13, 11),
                  decoration: BoxDecoration(
                    color: AppColors.pending.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: AppColors.pending.withValues(alpha: 0.22),
                    ),
                  ),
                  child: Text(
                    e.attention.isEmpty ? '—' : e.attention,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12.5,
                      height: 1.5,
                      color: ProfessorLinksStyle.mute(colors),
                    ),
                  ),
                ),
                if (widget.addMode) ...[
                  const SizedBox(height: 14),
                  ProfessorLinksCard(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Duração neste plano',
                                style: ProfessorLinksStyle.display(
                                  13,
                                  weight: FontWeight.w600,
                                  color: colors.onSurface,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'Sugerido ${e.minutes}′',
                                style: AppTypography.bodyS.copyWith(
                                  fontSize: 11,
                                  color: ProfessorLinksStyle.dim(colors),
                                ),
                              ),
                            ],
                          ),
                        ),
                        LessonPlanStepper(
                          value: _minutes,
                          onChanged: (v) => setState(() => _minutes = v),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (widget.addMode)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: ProfessorLinksPrimaryButton(
                  key: const Key('lesson-exercise-add'),
                  label: 'Adicionar ao plano · $_minutes′',
                  onPressed: () => Navigator.of(context).pop(_minutes),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── exercício próprio ────────────────────────────────────────────────────

class LessonExerciseFormPage extends ConsumerStatefulWidget {
  const LessonExerciseFormPage({super.key, this.exercise});

  /// `null` = novo.
  final LessonExercise? exercise;

  @override
  ConsumerState<LessonExerciseFormPage> createState() =>
      _LessonExerciseFormPageState();
}

class _LessonExerciseFormPageState
    extends ConsumerState<LessonExerciseFormPage> {
  late final _name = TextEditingController(text: widget.exercise?.name);
  late final _players = TextEditingController(text: widget.exercise?.players);
  late final _equipment =
      TextEditingController(text: widget.exercise?.equipment);
  late final _steps =
      TextEditingController(text: widget.exercise?.steps.join('\n'));
  late final _easier = TextEditingController(text: widget.exercise?.easier);
  late final _harder = TextEditingController(text: widget.exercise?.harder);
  late final _attention =
      TextEditingController(text: widget.exercise?.attention);
  late LessonPlanCategory _category =
      widget.exercise?.category ?? LessonPlanCategory.saque;
  late int _minutes = widget.exercise?.minutes ?? 10;
  late String _level = widget.exercise?.level ?? 'Todos';
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [
      _name,
      _players,
      _equipment,
      _steps,
      _easier,
      _harder,
      _attention,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final input = LessonExerciseInput(
      name: _name.text,
      category: _category,
      minutes: _minutes,
      players: _players.text,
      level: _level,
      equipment: _equipment.text,
      steps: _steps.text.split('\n'),
      easier: _easier.text,
      harder: _harder.text,
      attention: _attention.text,
    );
    final error = validateLessonExercise(input);
    setState(() => _error = error);
    if (error != null) return;
    setState(() => _saving = true);
    try {
      await ref.read(professorLessonPlansRepositoryProvider).saveExercise(
            ref.read(professorLinksUidProvider),
            input,
            exerciseId: widget.exercise?.id,
          );
      if (!mounted) return;
      showAppSnackBar(context, 'Exercício salvo na sua biblioteca.');
      Navigator.of(context).maybePop();
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        e is ProfessorStudentsException
            ? e.message
            : 'Não foi possível salvar o exercício.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    Widget multiline(
            String label, TextEditingController c, String hint, Key key,
            {int lines = 2}) =>
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ProfessorLinksKicker(label),
            const SizedBox(height: 7),
            TextField(
              key: key,
              controller: c,
              minLines: lines,
              maxLines: lines + 4,
              style: AppTypography.bodyM.copyWith(color: colors.onSurface),
              decoration: InputDecoration(
                isDense: true,
                hintText: hint,
                filled: true,
                fillColor: ProfessorLinksStyle.soft(colors),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(13),
                  borderSide:
                      BorderSide(color: ProfessorLinksStyle.line2(colors)),
                ),
              ),
            ),
          ],
        );
    return ProfessorLinksScaffold(
      title: widget.exercise == null ? 'Novo exercício' : 'Editar exercício',
      subtitle: 'MEU EXERCÍCIO',
      onBack: () => Navigator.of(context).maybePop(),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                ProfessorWalletField(
                  key: const Key('lesson-exercise-form-name'),
                  label: 'Nome',
                  controller: _name,
                  hint: 'Ex.: Saque em zonas-alvo',
                  maxLength: kLessonExerciseNameMax,
                  textCapitalization: TextCapitalization.sentences,
                  error: _error,
                ),
                const SizedBox(height: 16),
                const ProfessorLinksKicker('Fundamento'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final c in LessonPlanCategory.values)
                      LessonPlanChip(
                        key: Key('lesson-exercise-form-cat-${c.name}'),
                        label: c.label,
                        color: lessonPlanCategoryColor(c),
                        selected: _category == c,
                        onTap: () => setState(() => _category = c),
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    const Expanded(child: ProfessorLinksKicker('Duração')),
                    LessonPlanStepper(
                      value: _minutes,
                      min: 5,
                      max: 120,
                      onChanged: (v) => setState(() => _minutes = v),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                const ProfessorLinksKicker('Nível'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final l in kLessonPlanLevels)
                      LessonPlanChip(
                        label: l,
                        selected: _level == l,
                        onTap: () => setState(() => _level = l),
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                ProfessorWalletField(
                  key: const Key('lesson-exercise-form-players'),
                  label: 'Jogadores',
                  controller: _players,
                  hint: 'Ex.: 2–6',
                  maxLength: 20,
                ),
                const SizedBox(height: 16),
                ProfessorWalletField(
                  key: const Key('lesson-exercise-form-equipment'),
                  label: 'Material',
                  controller: _equipment,
                  hint: 'Ex.: 6 cones · 20 bolas',
                  maxLength: 80,
                ),
                const SizedBox(height: 16),
                multiline('Como fazer · um passo por linha', _steps,
                    'Até 12 passos', const Key('lesson-exercise-form-steps'),
                    lines: 3),
                const SizedBox(height: 16),
                multiline('Mais fácil', _easier, 'Variação mais simples',
                    const Key('lesson-exercise-form-easier')),
                const SizedBox(height: 16),
                multiline('Mais difícil', _harder, 'Variação mais exigente',
                    const Key('lesson-exercise-form-harder')),
                const SizedBox(height: 16),
                multiline(
                    'Pontos de atenção',
                    _attention,
                    'O que observar nos alunos',
                    const Key('lesson-exercise-form-attention')),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: ProfessorLinksPrimaryButton(
                key: const Key('lesson-exercise-form-save'),
                label: 'Salvar exercício',
                loading: _saving,
                onPressed: _save,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
