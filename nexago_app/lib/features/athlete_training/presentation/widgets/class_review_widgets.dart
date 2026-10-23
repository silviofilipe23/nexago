import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../domain/athlete_training.dart';
import '../../domain/class_review.dart';
import 'training_origin_widgets.dart';

/// Peças de "Avaliar aulas" (protótipo `at-avaliar.jsx`).

/// Abre o formulário do treino (A2–A4); [stars] vem do A1 ("Como foi?").
void openClassReview(BuildContext context, String key, {int? stars}) {
  context.pushNamed(
    AppRouteNames.athleteTrainingReview,
    pathParameters: {'key': key},
    queryParameters: {if (stars != null && stars > 0) 'n': '$stars'},
  );
}

/// "TER 20 · 19:00" a partir de `YYYY-MM-DD` + `HH:mm`.
String reviewDayLabel(String dateKey, String startTime) {
  final d = DateTime.tryParse(dateKey);
  if (d == null) return startTime;
  final day = '${arenaClassWeekdayShort(d.weekday).toUpperCase()} ${d.day}';
  return startTime.isEmpty ? day : '$day · $startTime';
}

/// Nome curto da parte no resumo ("Aula", "Juliana", "Arena").
String reviewPartShortLabel(ReviewPart p, ClassReview r) => switch (p) {
      ReviewPart.lesson =>
        r.origin == TrainingOrigin.center ? 'Sessão' : 'Aula',
      ReviewPart.professor => r.professorName.split(' ').first,
      ReviewPart.place => r.origin == TrainingOrigin.center ? 'CT' : 'Arena',
    };

Color _starColor(int stars, AppThemeColors colors) => stars <= 2
    ? colors.readableTone(colors.live)
    : stars == 3
        ? colors.readableTone(colors.pending)
        : colors.onSurface;

/// Fileira de 5 estrelas; com [onChanged], cada uma é um botão.
class ReviewStars extends StatelessWidget {
  const ReviewStars({
    super.key,
    required this.value,
    this.onChanged,
    this.size = 30,
    this.gap = 6,
    this.keyPrefix,
  });

  final int value;
  final ValueChanged<int>? onChanged;
  final double size;
  final double gap;

  /// Prefixo das chaves de teste de cada estrela (`{prefix}-{n}`).
  final String? keyPrefix;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var n = 1; n <= 5; n++) ...[
          if (n > 1) SizedBox(width: gap),
          Semantics(
            button: onChanged != null,
            label: onChanged == null ? null : '$n estrela${n > 1 ? 's' : ''}',
            child: GestureDetector(
              key: keyPrefix == null ? null : Key('$keyPrefix-$n'),
              behavior: HitTestBehavior.opaque,
              onTap: onChanged == null ? null : () => onChanged!(n),
              child: Icon(
                n <= value ? Icons.star_rounded : Icons.star_outline_rounded,
                size: size,
                color: n <= value
                    ? AppColors.brand
                    : colors.onSurface.withValues(alpha: 0.28),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Cartão do treino no topo do formulário (barra na cor da origem).
class ReviewSessionCard extends StatelessWidget {
  const ReviewSessionCard({super.key, required this.training});

  final TrainingSession training;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final t = training;
    final place = t.origin == TrainingOrigin.center
        ? [t.centerName, t.arenaName].where((s) => s.isNotEmpty).join(' · ')
        : t.placeLabel;
    return Container(
      padding: const EdgeInsets.fromLTRB(0, 12, 13, 12),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ProfessorLinksStyle.line(colors)),
      ),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 3,
              margin: const EdgeInsets.only(right: 12),
              decoration: BoxDecoration(
                color: trainingOriginColor(t.origin),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        reviewDayLabel(t.dateKey, t.startTime),
                        style: ProfessorLinksStyle.mono(
                          9.5,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                      const Spacer(),
                      TrainingOriginTag(t.origin),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Text(
                    t.title,
                    style: ProfessorLinksStyle.display(
                      15,
                      weight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    [
                      if (place.isNotEmpty) place,
                      t.origin == TrainingOrigin.private
                          ? 'aula feita'
                          : 'presença confirmada',
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
      ),
    );
  }
}

/// Quem/que é avaliado num bloco (aula, professor, local).
class ReviewTarget {
  const ReviewTarget({
    required this.part,
    required this.title,
    required this.subtitle,
    required this.origin,
  });

  final ReviewPart part;
  final String title;
  final String subtitle;
  final TrainingOrigin origin;
}

/// Blocos do formulário para o treino (A2 arena, A3 centro, A4 particular).
List<ReviewTarget> reviewTargetsFor(TrainingSession t) {
  final o = t.origin;
  final professor =
      t.professorName.trim().isEmpty ? 'Professor' : t.professorName.trim();
  return [
    for (final p in reviewPartsFor(o))
      switch (p) {
        ReviewPart.lesson => ReviewTarget(
            part: p,
            origin: o,
            title: o == TrainingOrigin.center ? 'A sessão' : 'A aula',
            subtitle: 'Conteúdo, ritmo e nível da turma',
          ),
        ReviewPart.professor => ReviewTarget(
            part: p,
            origin: o,
            title: professor,
            subtitle: switch (o) {
              TrainingOrigin.private => 'Didática, pontualidade e feedback',
              TrainingOrigin.arena => 'Professor da turma · equipe da arena',
              TrainingOrigin.center => 'Professor da sessão',
            },
          ),
        ReviewPart.place => ReviewTarget(
            part: p,
            origin: o,
            title: o == TrainingOrigin.center
                ? (t.centerName.isEmpty ? 'O centro' : t.centerName)
                : (t.arenaName.isEmpty ? 'A arena' : t.arenaName),
            subtitle: o == TrainingOrigin.center
                ? 'Estrutura e organização'
                : 'Quadra, estrutura e atendimento',
          ),
      },
  ];
}

/// A2–A5 · bloco de uma parte: estrelas, rótulo da nota e tags.
class ReviewPartBlock extends StatelessWidget {
  const ReviewPartBlock({
    super.key,
    required this.target,
    required this.score,
    required this.onChanged,
  });

  final ReviewTarget target;
  final PartScore score;
  final ValueChanged<PartScore> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final n = score.stars;
    final negative = n > 0 && n <= 3;
    final tags = reviewTagsFor(target.part, n);
    final tagColor = negative ? colors.pending : colors.win;
    return Container(
      key: Key('review-part-${target.part.wire}'),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: n > 0
              ? ProfessorLinksStyle.line2(colors)
              : ProfessorLinksStyle.line(colors),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              _TargetAvatar(target: target),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      target.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.display(
                        14,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      target.subtitle,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11.5,
                        height: 1.35,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              ReviewStars(
                value: n,
                keyPrefix: 'review-star-${target.part.wire}',
                onChanged: (v) => onChanged(score.withStars(v)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  n > 0 ? kReviewStarLabels[n] : 'Toque para avaliar',
                  textAlign: TextAlign.right,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    13,
                    weight: FontWeight.w600,
                    color: n > 0
                        ? _starColor(n, colors)
                        : ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ),
            ],
          ),
          if (tags.isNotEmpty) ...[
            const SizedBox(height: 12),
            ProfessorLinksKicker(
              negative ? 'O que pode melhorar?' : 'O que se destacou?',
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final tag in tags)
                  _TagChip(
                    label: tag,
                    selected: score.tags.contains(tag),
                    color: tagColor,
                    onTap: () => onChanged(score.toggle(tag)),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _TargetAvatar extends StatelessWidget {
  const _TargetAvatar({required this.target});

  final ReviewTarget target;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return switch (target.part) {
      ReviewPart.professor => ArenaClassAvatar(
          initials: arenaClassInitials(target.title),
          size: 40,
          color: trainingOriginColor(target.origin),
        ),
      ReviewPart.place => TrainingOriginMark(
          origin: target.origin,
          name: target.title,
          size: 40,
        ),
      ReviewPart.lesson => Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: trainingOriginColor(target.origin).withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: trainingOriginColor(target.origin).withValues(alpha: 0.27),
            ),
          ),
          child: Icon(
            Icons.sports_volleyball_outlined,
            size: 19,
            color: colors.readableTone(trainingOriginColor(target.origin)),
          ),
        ),
    };
  }
}

class _TagChip extends StatelessWidget {
  const _TagChip({
    required this.label,
    required this.selected,
    required this.color,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg = selected
        ? colors.readableTone(color)
        : ProfessorLinksStyle.mute(colors);
    return Material(
      color: selected ? color.withValues(alpha: 0.11) : colors.surfaceRaised,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(9),
        side: BorderSide(
          color: selected
              ? color.withValues(alpha: 0.47)
              : ProfessorLinksStyle.line(colors),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: Key('review-tag-$label'),
        onTap: onTap,
        child: Container(
          height: 30,
          padding: const EdgeInsets.symmetric(horizontal: 11),
          child: Center(
            widthFactor: 1,
            child: Text(
              label,
              style: AppTypography.bodyS.copyWith(
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
                color: fg,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Interruptor verde do protótipo (pedir retorno, mostrar nome).
class ReviewSwitchRow extends StatelessWidget {
  const ReviewSwitchRow({
    super.key,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
    this.danger = false,
  });

  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  /// Fundo vermelho (pedido de retorno da nota baixa).
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final row = Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: ProfessorLinksStyle.display(
                  13,
                  weight: danger ? FontWeight.w700 : FontWeight.w600,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                subtitle,
                style: AppTypography.bodyS.copyWith(
                  fontSize: 11.5,
                  height: 1.4,
                  color: danger
                      ? ProfessorLinksStyle.mute(colors)
                      : ProfessorLinksStyle.dim(colors),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Switch(
          value: value,
          onChanged: onChanged,
          activeTrackColor: colors.win,
          activeThumbColor: AppColors.white,
        ),
      ],
    );
    if (!danger) {
      return Padding(padding: const EdgeInsets.all(2), child: row);
    }
    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: colors.live.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.live.withValues(alpha: 0.3)),
      ),
      child: row,
    );
  }
}

/// Notas em mini cartões (A6/A7): "Aula ★3 · Juliana ★5 · Arena ★2".
class ReviewScoreChips extends StatelessWidget {
  const ReviewScoreChips({super.key, required this.review});

  final ClassReview review;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final parts = [
      for (final p in ReviewPart.values)
        if (review.scores[p]?.isSet == true) p,
    ];
    return Row(
      children: [
        for (var i = 0; i < parts.length; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 8),
              decoration: BoxDecoration(
                color: colors.surfaceRaised,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    reviewPartShortLabel(parts[i], review),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 10.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(
                        Icons.star_rounded,
                        size: 13,
                        color: review.scores[parts[i]]!.isLow
                            ? colors.readableTone(colors.live)
                            : AppColors.brand,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '${review.scores[parts[i]]!.stars}',
                        style: ProfessorLinksStyle.mono(
                          12,
                          color: review.scores[parts[i]]!.isLow
                              ? colors.readableTone(colors.live)
                              : colors.onSurface,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Cartão "Como foi o treino?" no hub (A1 compacto): as estrelas abrem o
/// formulário do treino mais recente com a nota marcada.
class ReviewPromptCard extends StatelessWidget {
  const ReviewPromptCard({super.key, required this.pending});

  final List<PendingReview> pending;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final first = pending.first;
    final t = first.training;
    final more = pending.length - 1;
    return Material(
      key: const Key('training-hub-review-prompt'),
      color: colors.surfaceCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: AppColors.brand.withValues(alpha: 0.3)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () =>
            context.pushNamed(AppRouteNames.athleteTrainingReviewStart),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Como foi o treino?',
                      style: ProfessorLinksStyle.display(
                        15,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                  if (more > 0)
                    Text(
                      '+$more para avaliar',
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11.5,
                        color: colors.brandText,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 3),
              Text(
                '${reviewDayLabel(t.dateKey, t.startTime)} · ${t.title}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.bodyS.copyWith(
                  fontSize: 12,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
              const SizedBox(height: 10),
              ReviewStars(
                value: 0,
                size: 30,
                gap: 8,
                keyPrefix: 'training-hub-review-star',
                onChanged: (n) => openClassReview(context, first.key, stars: n),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
