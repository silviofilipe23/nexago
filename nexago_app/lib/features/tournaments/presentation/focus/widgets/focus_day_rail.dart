import 'dart:ui';

import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/focus/focus_views_logic.dart';

/// Item compacto da "Ordem do seu dia" em rail horizontal (protótipo Focus).
class FocusDayRailItem {
  const FocusDayRailItem({
    required this.title,
    required this.subtitle,
    required this.state,
    this.matchId,
    this.outcome,
  });

  final String title;
  final String subtitle;
  final TimelineState state;
  final String? matchId;

  /// Vitória/derrota quando a partida já terminou — verde nas vitórias,
  /// vermelho nas derrotas.
  final TimelineOutcome? outcome;
}

/// Rail horizontal de jogos do dia + header com "VER TODOS".
class FocusDayRail extends StatelessWidget {
  const FocusDayRail({
    super.key,
    required this.items,
    required this.onOpen,
    this.onSeeAll,
  });

  final List<FocusDayRailItem> items;
  final ValueChanged<String> onOpen;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            AppSpacing.lg,
            AppSpacing.screenH,
            AppSpacing.sm,
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'ORDEM DO SEU DIA',
                  style: AppTypography.eyebrow.copyWith(
                    color: Colors.white.withValues(alpha: 0.55),
                  ),
                ),
              ),
              if (onSeeAll != null)
                GestureDetector(
                  onTap: onSeeAll,
                  behavior: HitTestBehavior.opaque,
                  child: Text(
                    'VER TODOS >',
                    style: AppTypography.eyebrow.copyWith(
                      color: Colors.white.withValues(alpha: 0.55),
                      fontSize: 10,
                    ),
                  ),
                ),
            ],
          ),
        ),
        if (items.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenH,
              vertical: AppSpacing.sm,
            ),
            child: Text(
              'Nenhuma partida sua ainda.',
              style: AppTypography.bodyM.copyWith(
                color: Colors.white.withValues(alpha: 0.55),
              ),
            ),
          )
        else
          SizedBox(
            height: 100,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenH,
              ),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (context, index) {
                final item = items[index];
                return _DayCard(
                  item: item,
                  onTap: item.matchId != null
                      ? () => onOpen(item.matchId!)
                      : null,
                );
              },
            ),
          ),
      ],
    );
  }
}

class _DayCard extends StatelessWidget {
  const _DayCard({required this.item, this.onTap});

  final FocusDayRailItem item;
  final VoidCallback? onTap;

  static const _radius = 14.0;

  @override
  Widget build(BuildContext context) {
    final isWin = item.state == TimelineState.done &&
        item.outcome == TimelineOutcome.win;
    final isLoss = item.state == TimelineState.done &&
        item.outcome == TimelineOutcome.loss;
    final isActive =
        item.state == TimelineState.next || item.state == TimelineState.live;
    final accent = isWin
        ? AppColors.win
        : isLoss
            ? AppColors.live
            : item.state == TimelineState.live
                ? AppColors.live
                : AppColors.brand;
    final highlight = isActive || isWin || isLoss;
    final borderColor = highlight
        ? accent.withValues(alpha: 0.85)
        : Colors.white.withValues(alpha: 0.12);

    return ClipRRect(
      borderRadius: BorderRadius.circular(_radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(_radius),
            splashColor: accent.withValues(alpha: 0.18),
            highlightColor: Colors.white.withValues(alpha: 0.06),
            child: Ink(
              width: 96,
              padding: const EdgeInsets.fromLTRB(10, 12, 10, 10),
              decoration: BoxDecoration(
                color: highlight
                    ? accent.withValues(alpha: 0.12)
                    : Colors.white.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(_radius),
                border: Border.all(
                  color: borderColor,
                  width: highlight ? 1.5 : 1,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _Mark(state: item.state, outcome: item.outcome),
                  const Spacer(),
                  Text(
                    item.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      color: Colors.white.withValues(alpha: 0.92),
                      fontWeight: FontWeight.w700,
                      fontSize: 11,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    item.subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.monoMeta.copyWith(
                      color: highlight
                          ? accent
                          : Colors.white.withValues(alpha: 0.55),
                      fontSize: 10,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Mark extends StatelessWidget {
  const _Mark({required this.state, this.outcome});

  final TimelineState state;
  final TimelineOutcome? outcome;

  @override
  Widget build(BuildContext context) {
    return switch (state) {
      TimelineState.done => Icon(
        Icons.check_circle_rounded,
        size: 20,
        color: outcome == TimelineOutcome.loss
            ? AppColors.live
            : AppColors.win,
      ),
      TimelineState.live => const Icon(
        Icons.circle,
        size: 16,
        color: AppColors.live,
      ),
      TimelineState.next => const Icon(
        Icons.radio_button_unchecked_rounded,
        size: 18,
        color: AppColors.brand,
      ),
      TimelineState.upcoming => Icon(
        Icons.gps_fixed_rounded,
        size: 18,
        color: Colors.white.withValues(alpha: 0.45),
      ),
    };
  }
}
