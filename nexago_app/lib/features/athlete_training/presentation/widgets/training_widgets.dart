import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/ui/card_collapse_toggle.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../athlete/presentation/class_session_detail_page.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../../professor_mode/domain/professor_lesson_plans.dart';
import '../../../professor_mode/presentation/availability/availability_widgets.dart';
import '../../../professor_mode/presentation/lesson_plans/athlete_lesson_plan_pages.dart'
    show openAthleteLessonPlan;
import '../../domain/athlete_training.dart';
import 'training_origin_widgets.dart';

/// Peças das telas de Treinos do atleta (protótipo `at-treino-*.jsx`), no
/// mesmo kit visual das telas do aluno que já existiam (`ProfessorLinks*`).

/// Abre o treino: aula da arena no detalhe da aula (F2), aula do centro na
/// sessão do centro (O7), particular na lista das particulares (onde dá para
/// remarcar e cancelar).
void openTraining(BuildContext context, TrainingSession t) {
  final entry = t.classEntry;
  if (t.isCenter) {
    context.pushNamed(
      AppRouteNames.athleteTrainingCenterSession,
      pathParameters: {'centerId': t.centerId, 'sessionId': t.id},
    );
  } else if (entry != null) {
    openClassSessionDetail(context, entry);
  } else {
    context.pushNamed(AppRouteNames.athletePrivateLessons);
  }
}

/// Cor do estado do treino.
Color trainingStateColor(TrainingSession t, AppThemeColors colors) =>
    switch (t.state) {
      TrainingState.scheduled || TrainingState.present => colors.win,
      TrainingState.awaitingProfessor ||
      TrainingState.excused => colors.pending,
      TrainingState.canceled || TrainingState.absent => colors.live,
      TrainingState.done => ProfessorLinksStyle.mute(colors),
    };

/// Pílula mono do estado ("PRESENTE", "FALTA AVISADA"…).
class TrainingStatePill extends StatelessWidget {
  const TrainingStatePill(this.training, {super.key});

  final TrainingSession training;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Text(
      trainingStateLabel(training),
      maxLines: 1,
      style: ProfessorLinksStyle.mono(
        9.5,
        color: colors.readableTone(trainingStateColor(training, colors)),
      ).copyWith(letterSpacing: 0.4),
    );
  }
}

/// Etiqueta do tipo (Turma, Particular, Reposição…).
class TrainingTypeTag extends StatelessWidget {
  const TrainingTypeTag(this.training, {super.key});

  final TrainingSession training;

  @override
  Widget build(BuildContext context) {
    final label = trainingTypeLabel(training);
    final color = switch (label) {
      'Turma' when training.isCenter => trainingCenterColor,
      'Particular' || 'Dupla' => ProfessorLinksStyle.blue,
      'Reposição' => ProfessorLinksStyle.blue,
      'Experimental' => AppColors.pending,
      _ => AppColors.brand,
    };
    return ArenaClassTag(label: label, color: color);
  }
}

/// Cartão "Próximo treino" — Início (T1) e hub (T2).
///
/// [focus] = o foco publicado no plano para o aluno (H8). Os botões vêm de
/// fora: na Início o principal leva ao hub, no hub abre o detalhe.
class TrainingNextCard extends StatelessWidget {
  const TrainingNextCard({
    super.key,
    required this.training,
    required this.todayKey,
    required this.primaryLabel,
    required this.onPrimary,
    this.plan,
    this.big = false,
    this.badge = 0,
    this.presence,
    this.onCollapse,
  });

  final TrainingSession training;
  final String todayKey;
  final LessonPlanView? plan;

  /// Com valor, o cabeçalho ganha a seta de recolher (Início: o cartão
  /// volta para a versão compacta, [TrainingNextCompactCard]).
  final VoidCallback? onCollapse;
  final bool big;
  final String primaryLabel;
  final VoidCallback onPrimary;

  /// Botão de presença da aula da turma ("Confirmar presença", "Vou",
  /// check-in). Com ele, o botão da direita é a presença e a ação principal
  /// vira o botão fantasma (ou o toque no cartão, quando há plano).
  final Widget? presence;

  /// Feedbacks novos (bolinha no botão principal).
  final int badge;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final t = training;
    final day = trainingRelativeDay(t.dateKey, todayKey);
    final focus = plan?.myFocus;
    final hasPlan = plan != null && plan!.planVisible;
    final sub = [t.title, t.placeLabel].where((s) => s.isNotEmpty).join(' · ');
    final card = Container(
      key: const Key('training-next-card'),
      padding: EdgeInsets.all(big ? 16 : 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        color: colors.surfaceCard,
        gradient: RadialGradient(
          center: Alignment.topRight,
          radius: 1.2,
          colors: [
            AppColors.brand.withValues(alpha: 0.16),
            colors.surfaceCard.withValues(alpha: 0),
          ],
        ),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.32)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                'PRÓXIMO TREINO',
                style: ProfessorLinksStyle.mono(
                  9.5,
                  color: colors.brandText,
                ).copyWith(letterSpacing: 0.4),
              ),
              // Sem botão principal (presença + plano), o badge sobe para cá.
              if (presence != null && hasPlan && badge > 0) ...[
                const SizedBox(width: 8),
                TrainingBadge(
                  key: const Key('training-next-badge'),
                  count: badge,
                ),
              ],
              const Spacer(),
              TrainingTypeTag(t),
              if (onCollapse != null) ...[
                const SizedBox(width: 4),
                CardCollapseToggle(
                  key: const Key('training-next-collapse'),
                  expanded: true,
                  onTap: onCollapse!,
                ),
              ],
            ],
          ),
          const SizedBox(height: 12),
          Text(
            '$day · ${t.startTime}',
            style: ProfessorLinksStyle.display(
              big ? 30 : 26,
              color: colors.onSurface,
            ).copyWith(height: 1),
          ),
          if (sub.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              sub,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: ProfessorLinksStyle.display(
                12,
                weight: FontWeight.w600,
                color: ProfessorLinksStyle.mute(colors),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              if (t.professorName.isNotEmpty) ...[
                ArenaClassAvatar(
                  initials: arenaClassInitials(t.professorName),
                  size: 30,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Prof. ${t.professorName}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12.5,
                      color: ProfessorLinksStyle.mute(colors),
                    ),
                  ),
                ),
              ] else
                const Spacer(),
              TrainingStatePill(t),
            ],
          ),
          if (focus != null) ...[
            const SizedBox(height: 12),
            TrainingFocusNote(focus: focus),
          ],
          const SizedBox(height: 12),
          if (presence != null)
            Row(
              children: [
                Expanded(
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      hasPlan
                          ? ProfessorLinksGhostButton(
                              key: const Key('training-next-plan'),
                              label: 'Ver plano da aula',
                              height: 44,
                              onPressed: () =>
                                  openAthleteLessonPlan(context, plan!.id),
                            )
                          : ProfessorLinksGhostButton(
                              key: const Key('training-next-primary'),
                              label: primaryLabel,
                              height: 44,
                              onPressed: onPrimary,
                            ),
                      if (badge > 0 && !hasPlan)
                        Positioned(
                          top: -5,
                          right: -4,
                          child: TrainingBadge(count: badge),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(child: presence!),
              ],
            )
          else
            Row(
              children: [
                if (hasPlan) ...[
                  Expanded(
                    child: ProfessorLinksGhostButton(
                      key: const Key('training-next-plan'),
                      label: 'Ver plano da aula',
                      height: 44,
                      onPressed: () => openAthleteLessonPlan(context, plan!.id),
                    ),
                  ),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      ProfessorLinksPrimaryButton(
                        key: const Key('training-next-primary'),
                        label: primaryLabel,
                        height: 44,
                        onPressed: onPrimary,
                      ),
                      if (badge > 0)
                        Positioned(
                          top: -5,
                          right: -4,
                          child: TrainingBadge(count: badge),
                        ),
                    ],
                  ),
                ),
              ],
            ),
        ],
      ),
    );
    // Presença + plano ocupam os dois botões: o cartão leva à ação principal.
    if (presence == null || !hasPlan) return card;
    return GestureDetector(
      key: const Key('training-next-card-tap'),
      behavior: HitTestBehavior.opaque,
      onTap: onPrimary,
      child: card,
    );
  }
}

/// Versão compacta do "Próximo treino" na Início: uma linha com dia, hora,
/// turma e estado; o toque expande para o [TrainingNextCard].
class TrainingNextCompactCard extends StatelessWidget {
  const TrainingNextCompactCard({
    super.key,
    required this.training,
    required this.todayKey,
    required this.onExpand,
    this.badge = 0,
  });

  final TrainingSession training;
  final String todayKey;
  final VoidCallback onExpand;
  final int badge;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final t = training;
    final day = trainingRelativeDay(t.dateKey, todayKey);
    final sub = [t.title, t.placeLabel].where((s) => s.isNotEmpty).join(' · ');
    return ProfessorLinksCard(
      key: const Key('training-next-compact'),
      onTap: onExpand,
      padding: const EdgeInsets.fromLTRB(13, 11, 8, 11),
      borderColor: AppColors.brand.withValues(alpha: 0.32),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child:
                Icon(Icons.sports_rounded, size: 20, color: colors.brandText),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      'PRÓXIMO TREINO',
                      style: ProfessorLinksStyle.mono(
                        9.5,
                        color: colors.brandText,
                      ).copyWith(letterSpacing: 0.4),
                    ),
                    const SizedBox(width: 8),
                    Flexible(child: TrainingStatePill(t)),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  '$day · ${t.startTime}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    15,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                if (sub.isNotEmpty)
                  Text(
                    sub,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12,
                      color: ProfessorLinksStyle.mute(colors),
                    ),
                  ),
              ],
            ),
          ),
          if (badge > 0) ...[
            const SizedBox(width: 8),
            TrainingBadge(count: badge),
          ],
          CardCollapseToggle(expanded: false, onTap: onExpand),
        ],
      ),
    );
  }
}

/// "SEU FOCO" — o foco do aluno no plano publicado.
class TrainingFocusNote extends StatelessWidget {
  const TrainingFocusNote({
    super.key,
    required this.focus,
    this.label = 'SEU FOCO',
  });

  final String focus;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(13),
        color: AppColors.brand.withValues(alpha: 0.08),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(
              Icons.track_changes_rounded,
              size: 14,
              color: colors.brandText,
            ),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: ProfessorLinksStyle.mono(9, color: colors.brandText),
                ),
                const SizedBox(height: 3),
                Text(
                  focus,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12.5,
                    color: colors.onSurface,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Bolinha laranja com número.
class TrainingBadge extends StatelessWidget {
  const TrainingBadge({super.key, required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 18),
      height: 18,
      padding: const EdgeInsets.symmetric(horizontal: 4),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.brand,
        borderRadius: BorderRadius.circular(9),
        border: Border.all(color: context.themeColors.canvas, width: 2),
      ),
      child: Text(
        count > 9 ? '9+' : '$count',
        style: ProfessorLinksStyle.mono(9, color: ProfessorLinksStyle.onBrand),
      ),
    );
  }
}

/// Linha de treino (Minhas aulas, "Esta semana" do hub): dia/hora à esquerda
/// e o cartão com tipo, estado, título e professor · local.
class TrainingRow extends StatelessWidget {
  const TrainingRow({
    super.key,
    required this.training,
    this.highlight = false,
    this.onTap,
    this.footer,
    this.showOrigin = false,
  });

  final TrainingSession training;

  /// Destaca o dia (o próximo treino).
  final bool highlight;

  /// Etiqueta da origem (Particular · Arena · Centro) — quando o aluno
  /// treina em mais de uma.
  final bool showOrigin;
  final VoidCallback? onTap;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final t = training;
    final who = [
      trainingFirstName(t.professorName),
      t.placeLabel,
    ].where((s) => s.isNotEmpty).join(' · ');
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 46,
          child: Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  trainingWeekdayDay(t.dateKey),
                  style: ProfessorLinksStyle.mono(
                    9.5,
                    color: highlight
                        ? colors.brandText
                        : ProfessorLinksStyle.dim(colors),
                  ),
                ),
                Text(
                  t.startTime,
                  style: ProfessorLinksStyle.mono(13, color: colors.onSurface),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Opacity(
            opacity: t.isCanceled ? 0.6 : 1,
            child: ProfessorLinksCard(
              padding: const EdgeInsets.fromLTRB(13, 11, 13, 11),
              onTap: onTap,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (showOrigin) ...[
                        TrainingOriginTag(t.origin),
                        const SizedBox(width: 6),
                      ],
                      if (!showOrigin || t.isMakeup || t.isTrial)
                        TrainingTypeTag(t),
                      const Spacer(),
                      TrainingStatePill(t),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    t.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      14,
                      weight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  if (who.isNotEmpty) ...[
                    const SizedBox(height: 5),
                    Row(
                      children: [
                        if (t.professorName.isNotEmpty) ...[
                          ArenaClassAvatar(
                            initials: arenaClassInitials(t.professorName),
                            size: 20,
                          ),
                          const SizedBox(width: 7),
                        ],
                        Expanded(
                          child: Text(
                            who,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.bodyS.copyWith(
                              fontSize: 11.5,
                              color: ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                  if (t.locationChanged && !t.isCanceled) ...[
                    const SizedBox(height: 5),
                    Text(
                      'LOCAL DIFERENTE NESTA AULA',
                      style: ProfessorLinksStyle.mono(
                        9.5,
                        color: colors.readableTone(AppColors.pending),
                      ),
                    ),
                  ],
                  if (footer != null) ...[const SizedBox(height: 8), footer!],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Chips "Todos · Thiago · Paula…" — `null` = todos.
class TrainingProfessorChips extends StatelessWidget {
  const TrainingProfessorChips({
    super.key,
    required this.names,
    required this.selected,
    required this.onChanged,
  });

  final List<String> names;
  final String? selected;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    if (names.length < 2) return const SizedBox.shrink();
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          AvailabilityChoiceChip(
            key: const Key('training-filter-all'),
            label: 'Todos',
            selected: selected == null,
            onTap: () => onChanged(null),
          ),
          for (final n in names) ...[
            const SizedBox(width: 6),
            AvailabilityChoiceChip(
              key: Key('training-filter-$n'),
              label: n,
              selected: selected == n,
              onTap: () => onChanged(n),
            ),
          ],
        ],
      ),
    );
  }
}

/// Número grande + rótulo (stats do hub e da evolução).
class TrainingStatTile extends StatelessWidget {
  const TrainingStatTile({
    super.key,
    required this.value,
    required this.label,
    this.color,
    this.icon,
  });

  final String value;
  final String label;
  final Color? color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 11),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 15, color: colors.brandText),
            const SizedBox(height: 6),
          ],
          Text(
            value,
            style: ProfessorLinksStyle.mono(
              20,
              color: color == null
                  ? colors.onSurface
                  : colors.readableTone(color!),
            ),
          ),
          const SizedBox(height: 3),
          Text(
            label,
            maxLines: 2,
            style: AppTypography.bodyS.copyWith(
              fontSize: 11,
              height: 1.3,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
        ],
      ),
    );
  }
}

/// Três [TrainingStatTile] lado a lado, todos da altura do mais alto.
class TrainingStatRow extends StatelessWidget {
  const TrainingStatRow({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            Expanded(child: children[i]),
          ],
        ],
      ),
    );
  }
}

/// Título de seção com ação opcional à direita ("Todas as aulas").
class TrainingSectionTitle extends StatelessWidget {
  const TrainingSectionTitle(
    this.title, {
    super.key,
    this.action,
    this.onAction,
  });

  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.only(top: 18, bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(child: ProfessorLinksKicker(title)),
          if (action != null)
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: onAction,
              child: Text(
                action!,
                style: AppTypography.bodyS.copyWith(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: colors.brandText,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Linha de lista com ícone (Do professor pra você, atalhos do hub).
class TrainingListTile extends StatelessWidget {
  const TrainingListTile({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.highlight = false,
    this.onTap,
    this.trailing,
  });

  final IconData icon;
  final String title;
  final String? subtitle;

  /// Bolinha laranja de "novo" e ícone na cor da marca.
  final bool highlight;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 11),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: colors.surfaceRaised,
                borderRadius: BorderRadius.circular(11),
              ),
              child: Icon(
                icon,
                size: 17,
                color: highlight
                    ? colors.brandText
                    : ProfessorLinksStyle.mute(colors),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      13,
                      weight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (trailing != null) ...[const SizedBox(width: 8), trailing!],
            if (highlight) ...[
              const SizedBox(width: 8),
              Container(
                width: 7,
                height: 7,
                decoration: const BoxDecoration(
                  color: AppColors.brand,
                  shape: BoxShape.circle,
                ),
              ),
            ],
            const SizedBox(width: 6),
            Icon(
              Icons.chevron_right_rounded,
              size: 18,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ],
        ),
      ),
    );
  }
}

/// Bloco de linhas separadas por fio (padrão `ProfessorRowsBlock`, com ícone).
class TrainingTilesBlock extends StatelessWidget {
  const TrainingTilesBlock({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 2),
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0)
              Divider(height: 1, color: ProfessorLinksStyle.line(colors)),
            children[i],
          ],
        ],
      ),
    );
  }
}
