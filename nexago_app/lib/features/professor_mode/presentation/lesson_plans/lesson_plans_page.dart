import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_agenda_providers.dart';
import '../../application/professor_lesson_plans_providers.dart';
import '../../domain/professor_actions_logic.dart' show professorDayLabel;
import '../../domain/professor_lesson_plans.dart';
import '../agenda/professor_agenda_widgets.dart' show ProfessorAgendaTypeTag;
import '../wallet/professor_wallet_widgets.dart';
import '../widgets/professor_students_widgets.dart';
import 'lesson_exercise_pages.dart';
import 'lesson_live_page.dart' show LessonPlanDayActions, openLessonReview;
import 'lesson_plan_editor_page.dart' show LessonTemplateNameDialog;
import 'lesson_plan_widgets.dart';

/// H1 · Planos de aula: as próximas aulas (7 dias) com a situação do plano,
/// os modelos e a biblioteca de exercícios.
class ProfessorLessonPlansPage extends ConsumerStatefulWidget {
  const ProfessorLessonPlansPage({super.key, this.initialTab = 0});

  final int initialTab;

  @override
  ConsumerState<ProfessorLessonPlansPage> createState() =>
      _ProfessorLessonPlansPageState();
}

class _ProfessorLessonPlansPageState
    extends ConsumerState<ProfessorLessonPlansPage> {
  late int _tab = widget.initialTab;

  /// "Usar modelo": escolhe o modelo e abre o editor preenchido.
  Future<void> _useTemplate(PlannableLesson lesson) async {
    final t = await pickLessonTemplate(context);
    if (t == null || !mounted) return;
    _applyTemplate(t, lesson);
  }

  void _applyTemplate(LessonTemplate t, PlannableLesson lesson) {
    // Contador "usado N×": não segura a navegação.
    ref
        .read(professorLessonPlansRepositoryProvider)
        .markTemplateUsed(ref.read(professorLinksUidProvider), t.id)
        .catchError((_) {});
    openLessonPlanEditor(
      context,
      kind: lesson.kind,
      refId: lesson.refId,
      prefill: t.content,
    );
  }

  Future<void> _newPlan(List<LessonPlanRow> rows) async {
    final lesson = await pickPlannableLesson(context, rows);
    if (lesson == null || !mounted) return;
    openLessonPlanEditor(context, kind: lesson.kind, refId: lesson.refId);
  }

  Future<void> _templateActions(
    LessonTemplate t,
    List<LessonPlanRow> rows,
  ) async {
    final action = await showProfessorLinksSheet<String>(
      context,
      builder: (ctx) => ProfessorLinksSheetBody(
        title: t.name,
        subtitle: '${t.level} · ${t.durationMin}′ · usado ${t.uses}×',
        children: [
          ProfessorLinksPrimaryButton(
            key: const Key('lesson-template-apply'),
            label: 'Aplicar a uma aula',
            onPressed: () => Navigator.pop(ctx, 'apply'),
          ),
          ProfessorLinksGhostButton(
            key: const Key('lesson-template-edit'),
            label: 'Editar nome e nível',
            onPressed: () => Navigator.pop(ctx, 'edit'),
          ),
          ProfessorLinksGhostButton(
            key: const Key('lesson-template-delete'),
            label: 'Apagar modelo',
            color: AppColors.live,
            onPressed: () => Navigator.pop(ctx, 'delete'),
          ),
        ],
      ),
    );
    if (!mounted || action == null) return;
    final repo = ref.read(professorLessonPlansRepositoryProvider);
    final uid = ref.read(professorLinksUidProvider);
    switch (action) {
      case 'apply':
        final lesson = await pickPlannableLesson(context, rows);
        if (lesson != null && mounted) _applyTemplate(t, lesson);
      case 'edit':
        final r = await showDialog<({String name, String level})>(
          context: context,
          builder: (_) =>
              LessonTemplateNameDialog(name: t.name, level: t.level),
        );
        if (r == null || !mounted) return;
        await runProfessorWalletAction(
          context,
          () => repo.saveTemplate(
            uid,
            templateId: t.id,
            name: r.name,
            level: r.level,
            content: t.content,
            uses: t.uses,
          ),
          message: 'Modelo atualizado.',
        );
      case 'delete':
        final ok = await confirmProfessorWalletAction(
          context,
          title: 'Apagar modelo?',
          body: '"${t.name}" sai dos seus modelos. Os planos já feitos com '
              'ele continuam.',
          confirmLabel: 'Apagar',
        );
        if (!ok || !mounted) return;
        await runProfessorWalletAction(
          context,
          () => repo.deleteTemplate(uid, t.id),
          message: 'Modelo apagado.',
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final rowsAsync = ref.watch(professorLessonPlanRowsProvider);
    final rows = rowsAsync.valueOrNull;
    return ProfessorLinksScaffold(
      title: 'Planos de aula',
      subtitle: rows == null ? 'PRÓXIMOS 7 DIAS' : lessonPlanRowsSummary(rows),
      onBack: () => popOrGo(context, AppRoutes.professorMore),
      trailing: ProfessorLinksRoundButton(
        key: const Key('lesson-plans-new'),
        icon: Icons.add_rounded,
        semanticLabel: 'Novo plano',
        filled: true,
        onTap: rows == null ? null : () => _newPlan(rows),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 10),
            child: LessonPlanSegmented(
              labels: const ['Próximas', 'Modelos', 'Exercícios'],
              index: _tab,
              onChanged: (i) => setState(() => _tab = i),
            ),
          ),
          Expanded(
            child: switch (_tab) {
              0 => _upcoming(rowsAsync),
              1 => _templates(rows ?? const []),
              _ => LessonExerciseList(
                  onOpen: (e) => openLessonExercise(context, e),
                ),
            },
          ),
        ],
      ),
    );
  }

  Widget _upcoming(AsyncValue<List<LessonPlanRow>> async) {
    final rows = async.valueOrNull;
    final today = ref.watch(professorAgendaNowProvider).todayKey;
    final toReview = ref.watch(professorLessonPlansToReviewProvider);
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
      children: [
        if (toReview.isNotEmpty) ...[
          const ProfessorLinksKicker('Para registrar'),
          const SizedBox(height: 8),
          for (final p in toReview) ...[
            _ReviewTile(plan: p, todayKey: today),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 10),
          const ProfessorLinksKicker('Próximos 7 dias'),
          const SizedBox(height: 8),
        ],
        if (rows == null && async.hasError)
          ProfessorRetryCard(
            message: 'Não foi possível carregar suas aulas.',
            onRetry: () => ref.invalidate(professorAgendaSessionsProvider),
          )
        else if (rows == null)
          const ProfessorWalletLoading()
        else if (rows.isEmpty)
          const ProfessorLinksCard(
            key: Key('lesson-plans-empty'),
            child: ProfessorMutedText(
              'Nenhuma aula nos próximos 7 dias. As aulas da agenda aparecem '
              'aqui para você planejar.',
            ),
          )
        else
          for (final r in rows) ...[
            _RowTile(
              row: r,
              todayKey: today,
              onOpen: () => openLessonPlanEditor(
                context,
                kind: r.lesson.kind,
                refId: r.lesson.refId,
              ),
              onTemplate: () => _useTemplate(r.lesson),
              onRepeat: r.previous == null
                  ? null
                  : () => openLessonPlanEditor(
                        context,
                        kind: r.lesson.kind,
                        refId: r.lesson.refId,
                        prefill: r.previous!.content,
                      ),
            ),
            const SizedBox(height: 10),
          ],
      ],
    );
  }

  Widget _templates(List<LessonPlanRow> rows) {
    final async = ref.watch(professorLessonTemplatesProvider);
    final list = async.valueOrNull;
    final colors = context.themeColors;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
      children: [
        if (list == null && async.hasError)
          ProfessorRetryCard(
            message: 'Não foi possível carregar seus modelos.',
            onRetry: () => ref.invalidate(professorLessonTemplatesProvider),
          )
        else if (list == null)
          const ProfessorWalletLoading()
        else if (list.isEmpty)
          const ProfessorLinksCard(
            key: Key('lesson-templates-empty'),
            child: ProfessorMutedText(
              'Nenhum modelo ainda. No editor do plano, toque em "Salvar '
              'modelo" para reaproveitar os blocos em outras aulas.',
            ),
          )
        else
          for (final t in list) ...[
            ProfessorLinksCard(
              key: Key('lesson-template-${t.id}'),
              padding: const EdgeInsets.all(13),
              onTap: () => _templateActions(t, rows),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: Text(
                          t.name,
                          style: ProfessorLinksStyle.display(
                            14,
                            weight: FontWeight.w700,
                            color: colors.onSurface,
                          ),
                        ),
                      ),
                      Text(
                        '${t.durationMin}′',
                        style: ProfessorLinksStyle.mono(
                          10,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${t.level} · usado ${t.uses}×',
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                  if (t.categories.isNotEmpty) ...[
                    const SizedBox(height: 9),
                    Wrap(
                      spacing: 5,
                      runSpacing: 5,
                      children: [
                        for (final c in t.categories) LessonPlanCategoryTag(c),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 10),
          ],
      ],
    );
  }
}

class _RowTile extends StatelessWidget {
  const _RowTile({
    required this.row,
    required this.todayKey,
    required this.onOpen,
    required this.onTemplate,
    this.onRepeat,
  });

  final LessonPlanRow row;
  final String todayKey;
  final VoidCallback onOpen;
  final VoidCallback onTemplate;
  final VoidCallback? onRepeat;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final l = row.lesson;
    final plan = row.plan;
    final status = row.status;
    final day = professorDayLabel(l.date, todayKey);
    final isToday = l.date == todayKey;
    final sub = plan == null
        ? (row.previous != null
            ? 'Repetir o plano de ${professorDayLabel(row.previous!.date, todayKey).toLowerCase()}?'
            : l.place)
        : plan.objective.isNotEmpty
            ? plan.objective
            : '${plan.blocks.length} bloco${plan.blocks.length == 1 ? '' : 's'}'
                ' · ${plan.totalMinutes}′';
    return Row(
      key: Key('lesson-plan-row-${l.refId}'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 48,
          child: Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  day.toUpperCase(),
                  style: ProfessorLinksStyle.mono(
                    9.5,
                    color: isToday
                        ? colors.readableTone(AppColors.brand)
                        : ProfessorLinksStyle.dim(colors),
                  ),
                ),
                Text(
                  l.startLabel,
                  style: ProfessorLinksStyle.mono(13, color: colors.onSurface),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: ProfessorLinksCard(
            padding: const EdgeInsets.fromLTRB(13, 11, 13, 11),
            borderColor:
                plan == null ? ProfessorLinksStyle.line2(colors) : null,
            onTap: onOpen,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    ProfessorAgendaTypeTag(l.typeLabel),
                    const Spacer(),
                    Text(
                      status.label,
                      key: Key('lesson-plan-status-${l.refId}'),
                      style: ProfessorLinksStyle.mono(
                        9.5,
                        color: colors.readableTone(
                          lessonPlanRowStatusColor(status, colors),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  l.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    14,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                if (sub.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    sub,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
                if (plan != null && plan.blocks.isNotEmpty) ...[
                  const SizedBox(height: 9),
                  LessonPlanTimeBar(
                    segments: lessonPlanSegmentsOf(plan.blocks),
                    durationMin: l.durationMin,
                    height: 6,
                  ),
                ],
                if (plan != null && l.date == todayKey) ...[
                  const SizedBox(height: 10),
                  LessonPlanDayActions(plan: plan),
                ],
                if (plan == null) ...[
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      LessonPlanSmallButton(
                        key: Key('lesson-plan-plan-${l.refId}'),
                        label: 'Planejar',
                        accent: true,
                        onTap: onOpen,
                      ),
                      LessonPlanSmallButton(
                        key: Key('lesson-plan-template-${l.refId}'),
                        label: 'Usar modelo',
                        icon: Icons.copy_rounded,
                        onTap: onTemplate,
                      ),
                      if (onRepeat != null)
                        LessonPlanSmallButton(
                          key: Key('lesson-plan-repeat-${l.refId}'),
                          label: 'Repetir anterior',
                          icon: Icons.replay_rounded,
                          onTap: onRepeat!,
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Aula passada sem registro: "Registrar aula".
class _ReviewTile extends StatelessWidget {
  const _ReviewTile({required this.plan, required this.todayKey});

  final LessonPlan plan;
  final String todayKey;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      key: Key('lesson-plan-to-review-${plan.refId}'),
      padding: const EdgeInsets.fromLTRB(13, 11, 13, 11),
      onTap: () => openLessonReview(context, plan.id),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  [
                    professorDayLabel(plan.date, todayKey),
                    if (plan.startTime.isNotEmpty) plan.startTime,
                  ].join(' · ').toUpperCase(),
                  style: ProfessorLinksStyle.mono(
                    9.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  plan.title,
                  style: ProfessorLinksStyle.display(
                    13.5,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ],
            ),
          ),
          LessonPlanSmallButton(
            key: Key('lesson-plan-review-${plan.refId}'),
            label: 'Registrar aula',
            icon: Icons.fact_check_outlined,
            onTap: () => openLessonReview(context, plan.id),
          ),
        ],
      ),
    );
  }
}

/// Folha para escolher um modelo (`null` = desistiu ou nenhum).
Future<LessonTemplate?> pickLessonTemplate(BuildContext context) =>
    showProfessorLinksSheet<LessonTemplate>(
      context,
      builder: (ctx) => Consumer(
        builder: (ctx, ref, _) {
          final list = ref.watch(professorLessonTemplatesProvider).valueOrNull;
          return ProfessorLinksSheetBody(
            title: 'Usar modelo',
            subtitle: 'Os blocos do modelo entram no plano desta aula',
            children: [
              if (list == null)
                const ProfessorWalletLoading()
              else if (list.isEmpty)
                const ProfessorMutedText(
                  'Nenhum modelo ainda. Salve um plano como modelo no editor.',
                )
              else
                for (final t in list)
                  ProfessorLinksCard(
                    key: Key('lesson-template-pick-${t.id}'),
                    onTap: () => Navigator.pop(ctx, t),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            t.name,
                            style: ProfessorLinksStyle.display(
                              13.5,
                              weight: FontWeight.w700,
                              color: ctx.themeColors.onSurface,
                            ),
                          ),
                        ),
                        Text(
                          '${t.level} · ${t.durationMin}′',
                          style: ProfessorLinksStyle.mono(
                            10,
                            color: ProfessorLinksStyle.dim(ctx.themeColors),
                          ),
                        ),
                      ],
                    ),
                  ),
            ],
          );
        },
      ),
    );

/// Folha para escolher uma das próximas aulas.
Future<PlannableLesson?> pickPlannableLesson(
  BuildContext context,
  List<LessonPlanRow> rows,
) =>
    showProfessorLinksSheet<PlannableLesson>(
      context,
      builder: (ctx) => Consumer(
        builder: (ctx, ref, _) {
          final today = ref.watch(professorAgendaNowProvider).todayKey;
          return ProfessorLinksSheetBody(
            title: 'Escolha a aula',
            subtitle: 'Próximos 7 dias',
            children: [
              if (rows.isEmpty)
                const ProfessorMutedText('Nenhuma aula nos próximos 7 dias.'),
              for (final r in rows)
                ProfessorLinksCard(
                  key: Key('lesson-pick-${r.lesson.refId}'),
                  onTap: () => Navigator.pop(ctx, r.lesson),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              r.lesson.title,
                              style: ProfessorLinksStyle.display(
                                13.5,
                                weight: FontWeight.w700,
                                color: ctx.themeColors.onSurface,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${professorDayLabel(r.lesson.date, today)} · '
                              '${r.lesson.startLabel}',
                              style: ProfessorLinksStyle.mono(
                                10,
                                color: ProfessorLinksStyle.dim(ctx.themeColors),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        r.status.label,
                        style: ProfessorLinksStyle.mono(
                          9.5,
                          color: ctx.themeColors.readableTone(
                            lessonPlanRowStatusColor(r.status, ctx.themeColors),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
