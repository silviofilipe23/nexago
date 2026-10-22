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
import '../../domain/training_origin_links.dart';

/// Peças de "Treinos por origem" (protótipo `at-treino-origem-*.jsx`): cor
/// fixa por origem — azul (particular), laranja (arena), lilás (centro) — em
/// agenda, cartões e pagamentos.

/// Lilás do centro de treinamento.
const Color trainingCenterColor = Color(0xFFB48CFF);

Color trainingOriginColor(TrainingOrigin o) => switch (o) {
  TrainingOrigin.private => ProfessorLinksStyle.blue,
  TrainingOrigin.arena => AppColors.brand,
  TrainingOrigin.center => trainingCenterColor,
};

Color trainingLinkNoticeColor(TrainingLinkNoticeTone tone) => switch (tone) {
  TrainingLinkNoticeTone.info => ProfessorLinksStyle.blue,
  TrainingLinkNoticeTone.warning => AppColors.pending,
  TrainingLinkNoticeTone.danger => AppColors.live,
};

/// Abre o detalhe do vínculo (O4 particular, O5 turma de arena, O6 centro).
void openTrainingOriginLink(BuildContext context, TrainingOriginLink l) {
  switch (l.origin) {
    case TrainingOrigin.private:
      context.pushNamed(
        AppRouteNames.athleteTrainingPrivateLink,
        pathParameters: {'professorUid': l.id},
      );
    case TrainingOrigin.arena:
      context.pushNamed(
        AppRouteNames.athleteTrainingArenaClass,
        pathParameters: {'enrollmentId': l.id},
      );
    case TrainingOrigin.center:
      context.pushNamed(
        AppRouteNames.athleteTrainingCenter,
        pathParameters: {'centerId': l.id},
      );
  }
}

/// Etiqueta "PARTICULAR" / "ARENA" / "CENTRO".
class TrainingOriginTag extends StatelessWidget {
  const TrainingOriginTag(this.origin, {super.key});

  final TrainingOrigin origin;

  @override
  Widget build(BuildContext context) => ArenaClassTag(
    label: trainingOriginLabel(origin),
    color: trainingOriginColor(origin),
  );
}

/// Iniciais na cor da origem (redonda para o professor, quadrada para arena
/// e centro).
class TrainingOriginMark extends StatelessWidget {
  const TrainingOriginMark({
    super.key,
    required this.origin,
    required this.name,
    this.size = 44,
  });

  final TrainingOrigin origin;
  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    final color = trainingOriginColor(origin);
    final initials = arenaClassInitials(name);
    final round = origin == TrainingOrigin.private;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(round ? size / 2 : size * 0.3),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        initials,
        style: ProfessorLinksStyle.display(
          size * 0.32,
          color: context.themeColors.readableTone(color),
        ),
      ),
    );
  }
}

/// Filtro "Todos · Particular · Arena · Centro" — só com 2+ origens.
class TrainingOriginFilter extends StatelessWidget {
  const TrainingOriginFilter({
    super.key,
    required this.origins,
    required this.selected,
    required this.onChanged,
  });

  final List<TrainingOrigin> origins;
  final TrainingOrigin? selected;
  final ValueChanged<TrainingOrigin?> onChanged;

  @override
  Widget build(BuildContext context) {
    if (origins.length < 2) return const SizedBox.shrink();
    return Row(
      children: [
        _OriginChip(
          key: const Key('training-origin-all'),
          label: 'Todos',
          selected: selected == null,
          onTap: () => onChanged(null),
        ),
        for (final o in origins) ...[
          const SizedBox(width: 6),
          Expanded(
            child: _OriginChip(
              key: Key('training-origin-${o.name}'),
              label: trainingOriginLabel(o),
              color: trainingOriginColor(o),
              selected: selected == o,
              onTap: () => onChanged(selected == o ? null : o),
            ),
          ),
        ],
      ],
    );
  }
}

class _OriginChip extends StatelessWidget {
  const _OriginChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    this.color,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = color ?? colors.onSurface;
    final tone = colors.readableTone(c);
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? c.withValues(alpha: 0.12) : colors.surfaceCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(
            color: selected
                ? c.withValues(alpha: 0.45)
                : ProfessorLinksStyle.line(colors),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            height: 34,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            alignment: Alignment.center,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (color != null) ...[
                  Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: color,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 6),
                ],
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: selected ? tone : ProfessorLinksStyle.mute(colors),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Cartão de chave-valor ("Quem cobra · O professor").
class TrainingKeyValueCard extends StatelessWidget {
  const TrainingKeyValueCard({super.key, required this.rows});

  /// (rótulo, valor, cor do valor).
  final List<(String, String, Color?)> rows;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
      child: Column(
        children: [
          for (final (i, (label, value, valueColor)) in rows.indexed)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                border: i == 0
                    ? null
                    : Border(
                        top: BorderSide(
                          color: ProfessorLinksStyle.line(colors),
                        ),
                      ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      value,
                      textAlign: TextAlign.right,
                      style: ProfessorLinksStyle.display(
                        12.5,
                        weight: FontWeight.w600,
                        color: valueColor == null
                            ? colors.onSurface
                            : colors.readableTone(valueColor),
                      ),
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

/// Aviso colorido com título ("Local mudou só nesta aula").
class TrainingOriginNote extends StatelessWidget {
  const TrainingOriginNote({
    super.key,
    required this.color,
    required this.title,
    required this.text,
    this.icon,
  });

  final Color color;
  final String title;
  final String text;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final tone = colors.readableTone(color);
    return Container(
      padding: const EdgeInsets.fromLTRB(13, 11, 13, 11),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (icon != null) ...[
            Padding(
              padding: const EdgeInsets.only(top: 1),
              child: Icon(icon, size: 16, color: tone),
            ),
            const SizedBox(width: 10),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: ProfessorLinksStyle.display(
                    12.5,
                    weight: FontWeight.w700,
                    color: tone,
                  ),
                ),
                if (text.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    text,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12,
                      height: 1.4,
                      color: ProfessorLinksStyle.mute(colors),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Cabeçalho do vínculo: marca, etiqueta da origem, nome e uma linha, com
/// um bloco extra embaixo (pacote, turma, frequência).
class TrainingOriginHeader extends StatelessWidget {
  const TrainingOriginHeader({
    super.key,
    required this.origin,
    required this.name,
    required this.line,
    this.extra,
  });

  final TrainingOrigin origin;
  final String name;
  final String line;
  final Widget? extra;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final color = trainingOriginColor(origin);
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        color: colors.surfaceCard,
        gradient: RadialGradient(
          center: const Alignment(1, -1),
          radius: 1.2,
          colors: [color.withValues(alpha: 0.14), colors.surfaceCard],
        ),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              TrainingOriginMark(origin: origin, name: name, size: 54),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TrainingOriginTag(origin),
                    const SizedBox(height: 6),
                    Text(
                      name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.display(
                        19,
                        color: colors.onSurface,
                      ),
                    ),
                    if (line.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        line,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 12,
                          color: ProfessorLinksStyle.mute(colors),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          if (extra != null) ...[const SizedBox(height: 12), extra!],
        ],
      ),
    );
  }
}

/// Linha de "Onde eu treino" no hub: marca, nome, linha, etiqueta e os
/// quadros "Próxima" e "quem cobra".
class TrainingOriginLinkCard extends StatelessWidget {
  const TrainingOriginLinkCard({
    super.key,
    required this.origin,
    required this.name,
    required this.subtitle,
    required this.next,
    required this.plan,
    this.notice,
    this.noticeColor,
    this.onTap,
  });

  final TrainingOrigin origin;
  final String name;
  final String subtitle;
  final String next;
  final String plan;
  final String? notice;
  final Color? noticeColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    Widget box(String kicker, String value) => Expanded(
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 9, 10, 9),
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(11),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              kicker.toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: ProfessorLinksStyle.mono(
                8.5,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
            const SizedBox(height: 3),
            Text(
              value,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.bodyS.copyWith(
                fontSize: 11.5,
                height: 1.3,
                color: colors.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
    final noticeTone = colors.readableTone(
      noticeColor ?? ProfessorLinksStyle.blue,
    );
    return ProfessorLinksCard(
      onTap: onTap,
      padding: const EdgeInsets.all(13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              TrainingOriginMark(origin: origin, name: name),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.display(
                        14.5,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    if (subtitle.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
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
              const SizedBox(width: 8),
              TrainingOriginTag(origin),
            ],
          ),
          const SizedBox(height: 11),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              box('Próxima', next),
              const SizedBox(width: 8),
              box(trainingOriginPayerLabel(origin), plan),
            ],
          ),
          if (notice != null) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: noticeTone,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    notice!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: noticeTone,
                    ),
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 16,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
