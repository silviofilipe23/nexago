import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/nexa_share.dart';

import '../../../../../core/router/routes.dart';
import '../../../domain/sand_rank/sand_rank_catalog.dart';
import '../../../domain/sand_rank/sand_rank_models.dart';
import '../../../domain/sand_rank/sand_rank_reward_catalog.dart';
import 'sand_rank_emblem.dart';

/// Celebração fullscreen de promoção de elo. Mostra o degrau mais alto
/// recém-alcançado e todas as recompensas ainda não vistas (inclui as
/// retroativas do backfill no primeiro login).
Future<void> showSandRankPromotionSheet(
  BuildContext context, {
  required List<UserSandRankReward> unseenRewards,
}) async {
  if (unseenRewards.isEmpty) return;
  final highestIndex = unseenRewards
      .map((r) => r.trackIndex)
      .reduce((a, b) => a > b ? a : b);
  final step = sandRankStepByTrackIndex(highestIndex);
  if (step == null) return;

  await showGeneralDialog<void>(
    context: context,
    barrierDismissible: false,
    barrierColor: Colors.black.withValues(alpha: 0.82),
    transitionDuration: const Duration(milliseconds: 350),
    transitionBuilder: (context, animation, _, child) {
      return FadeTransition(
        opacity: animation,
        child: ScaleTransition(
          scale: CurvedAnimation(parent: animation, curve: Curves.easeOutBack),
          child: child,
        ),
      );
    },
    pageBuilder: (context, _, __) => _SandRankPromotionDialog(
      step: step,
      unseenRewards: unseenRewards,
    ),
  );
}

class _SandRankPromotionDialog extends StatelessWidget {
  const _SandRankPromotionDialog({
    required this.step,
    required this.unseenRewards,
  });

  final SandRankStep step;
  final List<UserSandRankReward> unseenRewards;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final rankColor = sandRankColor(step.rankCode);
    final label = sandRankLabel(step);
    final rewardDefs = unseenRewards
        .map((r) => SandRankRewardCatalog.byId(r.rewardId))
        .whereType<SandRankRewardDefinition>()
        .toList(growable: false);

    return Dialog(
      backgroundColor: colors.surfaceCard,
      insetPadding: const EdgeInsets.symmetric(horizontal: 22, vertical: 40),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
        side: BorderSide(color: colors.outline.withValues(alpha: 0.14)),
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(22, 26, 22, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'PROMOÇÃO DE ELO',
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.8,
                color: rankColor,
              ),
            ),
            const SizedBox(height: 22),
            TweenAnimationBuilder<double>(
              tween: Tween(begin: 0.6, end: 1),
              duration: const Duration(milliseconds: 600),
              curve: Curves.elasticOut,
              builder: (context, scale, child) =>
                  Transform.scale(scale: scale, child: child),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  boxShadow: [
                    BoxShadow(
                      color: rankColor.withValues(alpha: 0.35),
                      blurRadius: 36,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: SandRankStepEmblem(
                  step: step,
                  size: SandRankEmblemSize.hero,
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Você alcançou $label!',
              textAlign: TextAlign.center,
              style: AppTypography.soraRegular(
                fontSize: 22,
                fontWeight: FontWeight.w900,
                color: rankColor,
                letterSpacing: -0.4,
                height: 1.15,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Sua dedicação na areia está deixando marca.',
              textAlign: TextAlign.center,
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: colors.onSurfaceMuted,
                height: 1.35,
              ),
            ),
            if (rewardDefs.isNotEmpty) ...[
              const SizedBox(height: 20),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
                decoration: BoxDecoration(
                  color: colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: colors.outline.withValues(alpha: 0.12),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'RECOMPENSAS DESBLOQUEADAS',
                      style: AppTypography.mono(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.1,
                        color: rankColor,
                      ),
                    ),
                    const SizedBox(height: 10),
                    for (final def in rewardDefs.take(6))
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(
                              Icons.add_rounded,
                              size: 16,
                              color: AppColors.brand,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                def.title,
                                style: AppTypography.soraRegular(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: colors.onSurface,
                                  height: 1.25,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    if (rewardDefs.length > 6)
                      Padding(
                        padding: const EdgeInsets.only(top: 4, left: 24),
                        child: Text(
                          '+ ${rewardDefs.length - 6} recompensas na trilha',
                          style: AppTypography.mono(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: colors.onSurfaceMuted,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 22),
            _RankCtaButton(
              color: rankColor,
              onPressed: () {
                Navigator.of(context).pop();
                context.pushNamed(AppRouteNames.athleteRankTrack);
              },
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextButton.icon(
                    onPressed: () {
                      nexaShareText(
                        context,
                        'Subi pro elo $label no nexaGO! 🏐🔥 '
                        'Bora pra areia comigo: https://nexago.app',
                      );
                    },
                    icon: Icon(
                      Icons.ios_share_rounded,
                      size: 16,
                      color: AppColors.brand,
                    ),
                    label: Text(
                      'Compartilhar',
                      style: AppTypography.soraRegular(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.brand,
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: Text(
                      'Continuar',
                      style: AppTypography.soraRegular(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _RankCtaButton extends StatelessWidget {
  const _RankCtaButton({
    required this.color,
    required this.onPressed,
  });

  final Color color;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 50,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(14),
          child: Ink(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  Color.lerp(color, Colors.white, 0.38)!,
                  color,
                  Color.lerp(color, Colors.black, 0.18)!,
                ],
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
              ),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Center(
              child: Text(
                'Ver minha trilha',
                style: AppTypography.soraRegular(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: AppColors.black,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
