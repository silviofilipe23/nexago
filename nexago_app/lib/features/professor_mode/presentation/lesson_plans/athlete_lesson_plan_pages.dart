import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/time/nexago_event_timezone.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart'
    show arenaClassInitials;
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../messages/infrastructure/messages_repository.dart'
    show messagesRepositoryProvider;
import '../../../messages/presentation/messages_widgets.dart'
    show openConversationWith;
import '../../application/professor_lesson_plans_providers.dart';
import '../../infrastructure/professor_students_repository.dart'
    show ProfessorStudentsException;
import '../../domain/professor_actions_logic.dart' show professorDayLabel;
import '../../domain/professor_lesson_plans.dart';
import '../wallet/professor_wallet_widgets.dart';
import '../widgets/professor_students_widgets.dart';
import 'lesson_plan_widgets.dart';

/// Lado do ATLETA: o plano da aula publicado pelo professor (H8) e a lista
/// deles. O servidor já tira as notas privadas e o foco dos outros alunos.

void openAthleteLessonPlan(BuildContext context, String viewId) {
  context.pushNamed(
    AppRouteNames.athleteLessonPlan,
    pathParameters: {'viewId': viewId},
  );
}

/// H8 · Plano da próxima aula.
class AthleteLessonPlanPage extends ConsumerWidget {
  const AthleteLessonPlanPage({super.key, required this.viewId});

  final String viewId;

  void _back(BuildContext context) {
    if (GoRouter.maybeOf(context) == null) {
      Navigator.of(context).maybePop();
      return;
    }
    popOrGo(context, AppRoutes.athleteLessonPlans);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(athleteLessonPlanViewProvider(viewId));
    final v = async.valueOrNull;
    if (v == null) {
      return ProfessorLinksScaffold(
        title: 'Plano da aula',
        onBack: () => _back(context),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (async.isLoading)
              const ProfessorWalletLoading()
            else
              const ProfessorLinksCard(
                key: Key('athlete-lesson-plan-missing'),
                child: ProfessorMutedText(
                  'Este plano não está mais disponível. O professor pode ter '
                  'despublicado ou apagado.',
                ),
              ),
          ],
        ),
      );
    }
    final today = nexagoEventDayKey(ref.watch(professorLinksClockProvider)());
    final upcoming = v.date.compareTo(today) >= 0;
    final where = v.place.isNotEmpty ? v.place : v.arenaName;
    final fb = v.feedback;
    final subtitle = fb != null
        ? [
            if (v.date.isNotEmpty) lessonPlanDayLabel(v.date),
            v.lessonTitle.toUpperCase(),
          ].join(' · ')
        : [
            if (v.date.isNotEmpty) lessonPlanDayLabel(v.date),
            if (v.startTime.isNotEmpty) v.startTime,
            if (where.isNotEmpty) where.toUpperCase(),
          ].join(' · ');
    return ProfessorLinksScaffold(
      title: fb != null
          ? 'Feedback da aula'
          : upcoming
              ? 'Próxima aula'
              : 'Plano da aula',
      subtitle: subtitle,
      onBack: () => _back(context),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
              children: [
                if (fb != null) ...[
                  LessonFeedbackSection(view: v, feedback: fb),
                  if (v.planVisible) ...[
                    const SizedBox(height: 18),
                    _CollapsiblePlan(view: v),
                  ],
                ] else if (v.planVisible)
                  _PlanContent(view: v)
                else
                  const ProfessorLinksCard(
                    key: Key('athlete-lesson-plan-hidden'),
                    child: ProfessorMutedText(
                      'O professor ainda não compartilhou o plano desta aula.',
                    ),
                  ),
              ],
            ),
          ),
          if (fb != null && v.professorUid.isNotEmpty)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: _ReplyButton(professorUid: v.professorUid),
              ),
            ),
        ],
      ),
    );
  }
}

/// H8: objetivo, foco do aluno e o roteiro.
class _PlanContent extends StatelessWidget {
  const _PlanContent({required this.view});

  final LessonPlanView view;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final v = view;
    final total = v.totalMinutes;
    final duration =
        v.endTime.isEmpty ? (total > 0 ? total : 60) : v.lessonDurationMin;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProfessorLinksCard(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  ArenaClassAvatar(
                    initials: arenaClassInitials(v.professorName),
                    size: 36,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          v.lessonTitle,
                          style: ProfessorLinksStyle.display(
                            13.5,
                            weight: FontWeight.w700,
                            color: colors.onSurface,
                          ),
                        ),
                        Text(
                          [
                            'Prof. ${v.professorName}',
                            if (v.arenaName.isNotEmpty) v.arenaName,
                          ].join(' · '),
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 11.5,
                            color: ProfessorLinksStyle.dim(colors),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (v.objective.isNotEmpty) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Divider(
                    height: 1,
                    color: ProfessorLinksStyle.line(colors),
                  ),
                ),
                const ProfessorLinksKicker('Objetivo'),
                const SizedBox(height: 6),
                Text(
                  v.objective,
                  key: const Key('athlete-lesson-plan-objective'),
                  style: ProfessorLinksStyle.display(
                    15,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ],
              if (v.tags.isNotEmpty) ...[
                const SizedBox(height: 10),
                Wrap(
                  spacing: 5,
                  runSpacing: 5,
                  children: [
                    for (final t in v.tags) LessonPlanCategoryTag(t),
                  ],
                ),
              ],
            ],
          ),
        ),
        if (v.myFocus != null) ...[
          const SizedBox(height: 12),
          Container(
            key: const Key('athlete-lesson-plan-focus'),
            padding: const EdgeInsets.fromLTRB(13, 12, 13, 12),
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.35),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.track_changes_rounded,
                    size: 16, color: colors.readableTone(AppColors.brandHover)),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'SEU FOCO NESTA AULA',
                        style: ProfessorLinksStyle.mono(
                          9.5,
                          color: colors.readableTone(AppColors.brandHover),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        v.myFocus!,
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 13,
                          height: 1.4,
                          color: colors.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 18),
        Row(
          children: [
            const Expanded(child: ProfessorLinksKicker('Roteiro')),
            Text(
              '$total′',
              key: const Key('athlete-lesson-plan-total'),
              style: ProfessorLinksStyle.mono(
                10.5,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        LessonPlanTimeBar(
          segments: [
            for (final b in v.blocks)
              (category: b.category, minutes: b.minutes),
          ],
          durationMin: duration,
          height: 6,
        ),
        const SizedBox(height: 10),
        if (v.blocks.isEmpty)
          const ProfessorLinksCard(
            child: ProfessorMutedText(
              'O professor ainda não montou os blocos desta aula.',
            ),
          )
        else
          ProfessorRowsBlock(
            children: [
              for (var i = 0; i < v.blocks.length; i++)
                Container(
                  key: Key('athlete-lesson-plan-block-$i'),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    border: i == v.blocks.length - 1
                        ? null
                        : Border(
                            bottom: BorderSide(
                              color: ProfessorLinksStyle.line(colors),
                            ),
                          ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          SizedBox(
                            width: 36,
                            child: Text(
                              '${v.blocks[i].minutes}′',
                              style: ProfessorLinksStyle.mono(
                                11,
                                color: colors.readableTone(
                                  lessonPlanCategoryColor(
                                    v.blocks[i].category,
                                  ),
                                ),
                              ),
                            ),
                          ),
                          Expanded(
                            child: Text(
                              v.blocks[i].name,
                              style: AppTypography.bodyS.copyWith(
                                fontSize: 13,
                                color: colors.onSurface,
                              ),
                            ),
                          ),
                        ],
                      ),
                      if (v.blocks[i].note.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(left: 36, top: 3),
                          child: Text(
                            v.blocks[i].note,
                            key: Key('athlete-lesson-plan-note-$i'),
                            style: AppTypography.bodyS.copyWith(
                              fontSize: 11.5,
                              height: 1.4,
                              color: ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
            ],
          ),
      ],
    );
  }
}

/// Planos das aulas: os publicados para o aluno (próximos e anteriores).
class AthleteLessonPlansPage extends ConsumerWidget {
  const AthleteLessonPlansPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(athleteLessonPlanViewsProvider);
    final list = async.valueOrNull;
    final today = nexagoEventDayKey(ref.watch(professorLinksClockProvider)());
    final upcoming = [
      for (final v in list ?? const <LessonPlanView>[])
        if (v.date.compareTo(today) >= 0) v,
    ].reversed.toList();
    final past = [
      for (final v in list ?? const <LessonPlanView>[])
        if (v.date.compareTo(today) < 0) v,
    ];
    Widget tile(LessonPlanView v) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: _ViewTile(view: v, todayKey: today),
        );
    return ProfessorLinksScaffold(
      title: 'Planos das aulas',
      subtitle: 'PUBLICADOS PELOS SEUS PROFESSORES',
      onBack: () => popOrGo(context, AppRoutes.home),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (list == null && async.hasError)
            ProfessorRetryCard(
              message: 'Não foi possível carregar os planos.',
              onRetry: () => ref.invalidate(athleteLessonPlanViewsProvider),
            )
          else if (list == null)
            const ProfessorWalletLoading()
          else if (list.isEmpty)
            const ProfessorLinksCard(
              key: Key('athlete-lesson-plans-empty'),
              child: ProfessorMutedText(
                'Quando um professor publicar o plano de uma aula sua, ele '
                'aparece aqui.',
              ),
            )
          else ...[
            if (upcoming.isNotEmpty) ...[
              const ProfessorLinksKicker('Próximas'),
              const SizedBox(height: 8),
              for (final v in upcoming) tile(v),
              const SizedBox(height: 12),
            ],
            if (past.isNotEmpty) ...[
              const ProfessorLinksKicker('Anteriores'),
              const SizedBox(height: 8),
              for (final v in past) tile(v),
            ],
          ],
        ],
      ),
    );
  }
}

class _ViewTile extends StatelessWidget {
  const _ViewTile({required this.view, required this.todayKey});

  final LessonPlanView view;
  final String todayKey;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final v = view;
    return ProfessorLinksCard(
      key: Key('athlete-lesson-plan-${v.id}'),
      onTap: () => openAthleteLessonPlan(context, v.id),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${professorDayLabel(v.date, todayKey)}'
                          '${v.startTime.isEmpty ? '' : ' · ${v.startTime}'}'
                      .toUpperCase(),
                  style: ProfessorLinksStyle.mono(
                    9.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
                const SizedBox(height: 4),
                if (v.feedback != null) ...[
                  const SizedBox(height: 4),
                  ProfessorWalletTag(
                    'Feedback',
                    key: Key('athlete-lesson-plan-feedback-${v.id}'),
                    color: AppColors.brand,
                  ),
                ],
                const SizedBox(height: 4),
                Text(
                  v.lessonTitle,
                  style: ProfessorLinksStyle.display(
                    14,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  v.objective.isNotEmpty
                      ? v.objective
                      : 'Prof. ${v.professorName}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right_rounded,
              color: ProfessorLinksStyle.dim(colors)),
        ],
      ),
    );
  }
}

/// "Ver plano da aula" no detalhe da aula do aluno — só quando o professor
/// publicou o plano daquela aula.
class AthleteLessonPlanLink extends ConsumerWidget {
  const AthleteLessonPlanLink({
    super.key,
    required this.kind,
    required this.refId,
  });

  final LessonPlanKind kind;
  final String refId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final view =
        ref.watch(athleteLessonPlanViewForProvider((kind: kind, refId: refId)));
    if (view == null || GoRouter.maybeOf(context) == null) {
      return const SizedBox.shrink();
    }
    return ProfessorLinksGhostButton(
      key: Key('athlete-lesson-plan-link-$refId'),
      label: 'Ver plano da aula',
      height: 44,
      onPressed: () => openAthleteLessonPlan(context, view.id),
    );
  }
}

/// H9 · Feedback recebido: o texto do professor, o exercício para casa e as
/// estrelas ("Como foi pra você?").
class LessonFeedbackSection extends ConsumerStatefulWidget {
  const LessonFeedbackSection({
    super.key,
    required this.view,
    required this.feedback,
  });

  final LessonPlanView view;
  final LessonViewFeedback feedback;

  @override
  ConsumerState<LessonFeedbackSection> createState() =>
      _LessonFeedbackSectionState();
}

class _LessonFeedbackSectionState extends ConsumerState<LessonFeedbackSection> {
  int? _stars;
  bool _saving = false;

  Future<void> _rate(int stars) async {
    if (_saving) return;
    final before = _stars;
    setState(() {
      _stars = stars;
      _saving = true;
    });
    try {
      await ref
          .read(professorLessonPlansRepositoryProvider)
          .rateFeedback(widget.view.id, stars);
      if (mounted) showAppSnackBar(context, 'Obrigado pela avaliação!');
    } catch (e) {
      if (!mounted) return;
      setState(() => _stars = before);
      showAppSnackBar(
        context,
        e is ProfessorStudentsException
            ? e.message
            : 'Não foi possível salvar sua avaliação.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final v = widget.view;
    final fb = widget.feedback;
    final now = ref.watch(professorLinksClockProvider)();
    final stars = _stars ?? v.ratingStars ?? 0;
    final hw = fb.homework;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProfessorLinksCard(
          key: const Key('lesson-feedback-card'),
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  ArenaClassAvatar(
                    initials: arenaClassInitials(v.professorName),
                    size: 36,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Prof. ${v.professorName}',
                          style: ProfessorLinksStyle.display(
                            13.5,
                            weight: FontWeight.w700,
                            color: colors.onSurface,
                          ),
                        ),
                        if (fb.sentAt != null)
                          Text(
                            'Enviado ${lessonRelativeAgo(fb.sentAt!, now)}',
                            key: const Key('lesson-feedback-sent'),
                            style: AppTypography.bodyS.copyWith(
                              fontSize: 11.5,
                              color: ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                fb.text,
                key: const Key('lesson-feedback-text'),
                style: AppTypography.bodyM.copyWith(
                  fontSize: 14,
                  height: 1.5,
                  color: colors.onSurface,
                ),
              ),
            ],
          ),
        ),
        if (hw != null) ...[
          const SizedBox(height: 18),
          const ProfessorLinksKicker('Para treinar até a próxima'),
          const SizedBox(height: 8),
          ProfessorLinksCard(
            key: const Key('lesson-feedback-homework'),
            padding: const EdgeInsets.all(12),
            // T9: marca as séries do dia no Treino em casa.
            onTap: () => context.pushNamed(
              AppRouteNames.athleteTrainingHomework,
              pathParameters: {'viewId': v.id},
            ),
            child: Row(
              children: [
                LessonExerciseThumb(
                  category: hw.category ?? LessonPlanCategory.outro,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        hw.name,
                        style: ProfessorLinksStyle.display(
                          13.5,
                          weight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                      if (hw.detail.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          hw.detail,
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 11.5,
                            color: ProfessorLinksStyle.dim(colors),
                          ),
                        ),
                      ],
                      const SizedBox(height: 4),
                      Text(
                        'MARCAR TREINO · ${hw.sets}×/DIA',
                        style: ProfessorLinksStyle.mono(
                          9.5,
                          color: colors.brandText,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 18,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 18),
        const ProfessorLinksKicker('Como foi pra você?'),
        const SizedBox(height: 8),
        Row(
          children: [
            for (var s = 1; s <= 5; s++) ...[
              if (s > 1) const SizedBox(width: 8),
              Expanded(
                child: Semantics(
                  button: true,
                  label: '$s estrela${s == 1 ? '' : 's'}',
                  selected: s <= stars,
                  child: Material(
                    color: s <= stars
                        ? AppColors.brand.withValues(alpha: 0.10)
                        : ProfessorLinksStyle.soft(colors),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(
                        color: s <= stars
                            ? AppColors.brand.withValues(alpha: 0.4)
                            : ProfessorLinksStyle.line(colors),
                      ),
                    ),
                    child: InkWell(
                      key: Key('lesson-feedback-star-$s'),
                      borderRadius: BorderRadius.circular(12),
                      onTap: () => _rate(s),
                      child: SizedBox(
                        height: 44,
                        child: Icon(
                          s <= stars
                              ? Icons.star_rounded
                              : Icons.star_outline_rounded,
                          size: 20,
                          color: s <= stars
                              ? AppColors.brand
                              : ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }
}

/// "Plano da aula" recolhido abaixo do feedback.
class _CollapsiblePlan extends StatefulWidget {
  const _CollapsiblePlan({required this.view});

  final LessonPlanView view;

  @override
  State<_CollapsiblePlan> createState() => _CollapsiblePlanState();
}

class _CollapsiblePlanState extends State<_CollapsiblePlan> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InkWell(
          key: const Key('lesson-feedback-plan-toggle'),
          borderRadius: BorderRadius.circular(10),
          onTap: () => setState(() => _open = !_open),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              children: [
                const Expanded(child: ProfessorLinksKicker('Plano da aula')),
                Icon(
                  _open
                      ? Icons.keyboard_arrow_up_rounded
                      : Icons.keyboard_arrow_down_rounded,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ],
            ),
          ),
        ),
        if (_open) ...[
          const SizedBox(height: 6),
          _PlanContent(view: widget.view),
        ],
      ],
    );
  }
}

/// "Responder ao professor": abre a conversa direta.
class _ReplyButton extends ConsumerStatefulWidget {
  const _ReplyButton({required this.professorUid});

  final String professorUid;

  @override
  ConsumerState<_ReplyButton> createState() => _ReplyButtonState();
}

class _ReplyButtonState extends ConsumerState<_ReplyButton> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) => ProfessorLinksGhostButton(
        key: const Key('lesson-feedback-reply'),
        label: 'Responder ao professor',
        height: 52,
        loading: _busy,
        onPressed: () async {
          setState(() => _busy = true);
          await openConversationWith(
            context,
            () => ref
                .read(messagesRepositoryProvider)
                .openStudentConversation(widget.professorUid),
            professorMode: false,
          );
          if (mounted) setState(() => _busy = false);
        },
      );
}
