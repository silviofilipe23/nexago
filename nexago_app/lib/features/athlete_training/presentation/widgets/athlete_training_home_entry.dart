import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/time/nexago_event_timezone.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../../professor_mode/application/professor_lesson_plans_providers.dart';
import '../../../professor_mode/domain/professor_lesson_plans.dart';
import '../../../professor_mode/presentation/lesson_plans/athlete_lesson_plan_pages.dart'
    show openAthleteLessonPlan;
import '../../application/athlete_training_providers.dart';
import '../../domain/athlete_training.dart';
import '../../domain/class_presence.dart';
import 'class_presence_widgets.dart';
import 'training_widgets.dart';

/// T1 · Entrada de Treinos na aba Início: o cartão "Próximo treino" e o
/// feedback novo do professor. Sem aula marcada nem feedback novo não aparece
/// nada (nem o respiro) — o atalho Treinos leva ao hub.
///
/// O "Próximo treino" começa compacto (uma linha); a seta expande para o
/// cartão inteiro, com plano, presença e botões. Com presença por confirmar
/// (ou check-in aberto) já abre expandido — a ação não fica escondida. Depois
/// que o atleta usa a seta, vale a escolha dele.
class AthleteTrainingHomeEntry extends ConsumerStatefulWidget {
  const AthleteTrainingHomeEntry({
    super.key,
    this.initiallyExpanded = false,
    this.bottomGap = AppSpacing.sectionGap,
  });

  final bool initiallyExpanded;

  /// Respiro abaixo da entrada (a Início aperta entre os cards dinâmicos).
  final double bottomGap;

  @override
  ConsumerState<AthleteTrainingHomeEntry> createState() =>
      _AthleteTrainingHomeEntryState();
}

class _AthleteTrainingHomeEntryState
    extends ConsumerState<AthleteTrainingHomeEntry> {
  /// Escolha do atleta pela seta; `null` = ainda não mexeu.
  bool? _userExpanded;

  /// Abriu sozinho por presença pendente: continua aberto depois de
  /// confirmar (senão o cartão recolheria no meio do toque em "Vou").
  bool _autoExpanded = false;

  Widget _wrap(Widget child) => Padding(
    key: const Key('athlete-training-home-entry'),
    padding: EdgeInsets.fromLTRB(
      AppSpacing.screenH,
      0,
      AppSpacing.screenH,
      widget.bottomGap,
    ),
    child: child,
  );

  @override
  Widget build(BuildContext context) {
    final invites =
        ref.watch(athleteTrainingCentersDataProvider).valueOrNull?.invites ??
        const [];
    final invite = invites.isEmpty ? null : _CenterInviteTile(count: invites.length, centerName: invites.first.centerName);
    if (!ref.watch(athleteHasTrainingsProvider)) {
      return invite == null ? const SizedBox.shrink() : _wrap(invite);
    }
    final now = ref.watch(professorLinksClockProvider)();
    final trainings = ref.watch(athleteTrainingsProvider) ?? const [];
    final views =
        ref.watch(athleteLessonPlanViewsProvider).valueOrNull ?? const [];
    final badge = ref.watch(athleteTrainingNewFeedbackCountProvider);
    final next = nextTraining(trainings, now);
    final feedbacks = trainingFeedbacks(views);
    final fresh =
        feedbacks.isNotEmpty && trainingFeedbackIsNew(feedbacks.first, now)
            ? feedbacks.first
            : null;
    // Sem aula marcada e sem feedback novo, nada aparece (nem o respiro): o
    // atalho Treinos da linha de atalhos já leva ao hub.
    if (next == null && fresh == null) {
      return invite == null ? const SizedBox.shrink() : _wrap(invite);
    }
    void openHub() => context.pushNamed(AppRouteNames.athleteTrainings);
    final needsPresence = next != null &&
        (trainingAwaitsResponse(next, now) || trainingCanCheckIn(next, now));
    if (needsPresence) _autoExpanded = true;
    final expanded =
        _userExpanded ?? (widget.initiallyExpanded || _autoExpanded);
    void toggle() => setState(() => _userExpanded = !expanded);

    return Padding(
      key: const Key('athlete-training-home-entry'),
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        widget.bottomGap,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (invite != null) ...[invite, const SizedBox(height: 10)],
          if (next != null)
            AnimatedSize(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOutCubic,
              alignment: Alignment.topCenter,
              child: expanded
                  ? TrainingNextCard(
                      training: next,
                      todayKey: nexagoEventDayKey(now),
                      plan: lessonPlanViewFor(views, next.planKind, next.id),
                      primaryLabel: 'Meus treinos',
                      badge: badge,
                      onPrimary: openHub,
                      onCollapse: toggle,
                      presence: TrainingPresenceButton.appliesTo(next, now)
                          ? TrainingPresenceButton(training: next)
                          : null,
                    )
                  : TrainingNextCompactCard(
                      training: next,
                      todayKey: nexagoEventDayKey(now),
                      badge: badge,
                      onExpand: toggle,
                    ),
            ),
          if (fresh != null) ...[
            if (next != null) const SizedBox(height: 10),
            _FreshFeedback(view: fresh),
          ],
        ],
      ),
    );
  }
}

/// Convite do centro de treinamento (O3) na Início.
class _CenterInviteTile extends StatelessWidget {
  const _CenterInviteTile({required this.count, required this.centerName});

  final int count;
  final String centerName;

  @override
  Widget build(BuildContext context) {
    return TrainingTilesBlock(
      children: [
        TrainingListTile(
          key: const Key('athlete-training-home-center-invite'),
          icon: Icons.mail_outline_rounded,
          highlight: true,
          title: count == 1
              ? 'Convite do $centerName'
              : '$count convites de centros de treinamento',
          subtitle: 'Toque para ver a turma e aceitar',
          onTap: () => context.pushNamed(AppRouteNames.athleteTrainingAdd),
        ),
      ],
    );
  }
}

/// "Feedback novo do Thiago — “Joelho bem melhor!…”".
class _FreshFeedback extends StatelessWidget {
  const _FreshFeedback({required this.view});

  final LessonPlanView view;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      key: const Key('athlete-training-home-feedback'),
      onTap: () => openAthleteLessonPlan(context, view.id),
      padding: const EdgeInsets.all(13),
      child: Row(
        children: [
          ArenaClassAvatar(
            initials: arenaClassInitials(view.professorName),
            size: 36,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Feedback novo do ${trainingFirstName(view.professorName)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    13,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '“${view.feedback!.text}”',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            width: 8,
            height: 8,
            decoration: const BoxDecoration(
              color: AppColors.brand,
              shape: BoxShape.circle,
            ),
          ),
        ],
      ),
    );
  }
}
