import 'package:flutter/material.dart';

import '../../../domain/sand_rank/sand_rank_catalog.dart';
import '../../../domain/sand_rank/sand_rank_reward_catalog.dart';

enum SandRankEmblemSize {
  small(28),
  badgeCompact(34),
  badge(40),
  medium(48),
  hero(120);

  const SandRankEmblemSize(this.dimension);
  final double dimension;

  bool get showsDivisionPips =>
      this == SandRankEmblemSize.medium || this == SandRankEmblemSize.hero;
}

/// Emblema do elo (asset gerado por IA) + pips de divisão desenhados em
/// código. Divisão III = 1 pip aceso, II = 2, I = 3; Lenda não tem pips.
class SandRankEmblem extends StatelessWidget {
  const SandRankEmblem({
    super.key,
    required this.rankCode,
    required this.division,
    this.size = SandRankEmblemSize.medium,
    this.locked = false,
  });

  final String rankCode;
  final int division;
  final SandRankEmblemSize size;

  /// Degraus ainda não alcançados aparecem dessaturados.
  final bool locked;

  @override
  Widget build(BuildContext context) {
    final color = sandRankColor(rankCode);
    final isLegend = rankCode == 'LENDA';

    Widget image = Image.asset(
      sandRankEmblemAsset(rankCode),
      width: size.dimension,
      height: size.dimension,
      fit: BoxFit.contain,
    );

    if (locked) {
      image = ColorFiltered(
        colorFilter: const ColorFilter.matrix(<double>[
          0.2126, 0.7152, 0.0722, 0, 0,
          0.2126, 0.7152, 0.0722, 0, 0,
          0.2126, 0.7152, 0.0722, 0, 0,
          0, 0, 0, 0.55, 0,
        ]),
        child: image,
      );
    } else if (isLegend && size.showsDivisionPips) {
      image = DecoratedBox(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: color.withValues(alpha: 0.45),
              blurRadius: size.dimension / 4,
              spreadRadius: 1,
            ),
          ],
        ),
        child: image,
      );
    }

    final showPips = division > 0 && size.showsDivisionPips;
    if (!showPips) return image;

    final litPips = (4 - division).clamp(1, 3);
    final pipSize = size == SandRankEmblemSize.hero ? 8.0 : 5.0;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        image,
        SizedBox(height: size == SandRankEmblemSize.hero ? 8 : 4),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (index) {
            final lit = index < litPips && !locked;
            return Container(
              width: pipSize,
              height: pipSize,
              margin: EdgeInsets.symmetric(horizontal: pipSize / 3),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: lit ? color : color.withValues(alpha: 0.22),
              ),
            );
          }),
        ),
      ],
    );
  }
}

/// Emblema resolvido direto de um degrau da trilha.
class SandRankStepEmblem extends StatelessWidget {
  const SandRankStepEmblem({
    super.key,
    required this.step,
    this.size = SandRankEmblemSize.medium,
    this.locked = false,
  });

  final SandRankStep step;
  final SandRankEmblemSize size;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    return SandRankEmblem(
      rankCode: step.rankCode,
      division: step.division,
      size: size,
      locked: locked,
    );
  }
}
