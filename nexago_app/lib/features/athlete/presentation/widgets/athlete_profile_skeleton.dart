import 'package:flutter/material.dart';

import '../../../arena/presentation/widgets/arena_dashboard_tokens.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Pulso compartilhado para skeletons do perfil do atleta.
class AthleteProfileSkeletonPulse extends StatefulWidget {
  const AthleteProfileSkeletonPulse({super.key, required this.builder});

  final Widget Function(BuildContext context, double pulse) builder;

  @override
  State<AthleteProfileSkeletonPulse> createState() =>
      _AthleteProfileSkeletonPulseState();
}

class _AthleteProfileSkeletonPulseState extends State<AthleteProfileSkeletonPulse>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final pulse = Curves.easeInOut.transform(_controller.value);
        return widget.builder(context, pulse);
      },
    );
  }
}

class ProfileShimmerBox extends StatelessWidget {
  const ProfileShimmerBox({
    super.key,
    required this.width,
    required this.height,
    required this.pulse,
    this.borderRadius = 8,
  });

  final double width;
  final double height;
  final double pulse;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    final base = context.themeColors.onSurfaceMuted.withValues(alpha: 0.1);
    final highlight = context.themeColors.onSurfaceMuted.withValues(alpha: 0.2);
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: Color.lerp(base, highlight, pulse),
        borderRadius: BorderRadius.circular(borderRadius),
      ),
    );
  }
}

/// Skeleton do card de ranking (~160px).
class AthleteProfileRankingSkeleton extends StatelessWidget {
  const AthleteProfileRankingSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return AthleteProfileSkeletonPulse(
      builder: (context, pulse) {
        return DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            color: context.themeColors.surfaceRaised.withValues(alpha: 0.55),
            border: Border.all(
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.08),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ProfileShimmerBox(width: 160, height: 10, pulse: pulse),
                SizedBox(height: 14),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    ProfileShimmerBox(width: 72, height: 40, pulse: pulse),
                    Spacer(),
                    ProfileShimmerBox(width: 48, height: 28, pulse: pulse),
                    SizedBox(width: 18),
                    ProfileShimmerBox(width: 36, height: 28, pulse: pulse),
                  ],
                ),
                SizedBox(height: 12),
                LayoutBuilder(
                  builder: (context, constraints) {
                    return ProfileShimmerBox(
                      width: constraints.maxWidth,
                      height: 12,
                      pulse: pulse,
                    );
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Skeleton do grid JOGOS · VITÓRIAS · SEQUÊNCIA · RANKING.
class AthleteProfileStatsGridSkeleton extends StatelessWidget {
  const AthleteProfileStatsGridSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return AthleteProfileSkeletonPulse(
      builder: (context, pulse) {
        return Row(
          children: [
            for (var i = 0; i < 4; i++) ...[
              if (i > 0) SizedBox(width: 8),
              Expanded(child: _StatCardSkeleton(pulse: pulse)),
            ],
          ],
        );
      },
    );
  }
}

class _StatCardSkeleton extends StatelessWidget {
  const _StatCardSkeleton({required this.pulse});

  final double pulse;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(
        context,
        color: context.themeColors.surfaceRaised.withValues(alpha: 0.75),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 6),
        child: Column(
          children: [
            ProfileShimmerBox(width: 18, height: 18, pulse: pulse),
            SizedBox(height: 8),
            ProfileShimmerBox(width: 28, height: 18, pulse: pulse),
            SizedBox(height: 6),
            ProfileShimmerBox(width: 40, height: 8, pulse: pulse),
          ],
        ),
      ),
    );
  }
}

/// Skeleton da faixa horizontal "Joga com".
class AthleteProfilePlaysWithSkeleton extends StatelessWidget {
  const AthleteProfilePlaysWithSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return AthleteProfileSkeletonPulse(
      builder: (context, pulse) {
        return SizedBox(
          height: 100,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: 4,
            separatorBuilder: (_, __) => SizedBox(width: 14),
            itemBuilder: (context, index) {
              return SizedBox(
                width: 64,
                child: Column(
                  children: [
                    ProfileShimmerBox(
                      width: 56,
                      height: 56,
                      pulse: pulse,
                      borderRadius: 999,
                    ),
                    SizedBox(height: 8),
                    ProfileShimmerBox(width: 48, height: 10, pulse: pulse),
                    SizedBox(height: 4),
                    ProfileShimmerBox(width: 36, height: 8, pulse: pulse),
                  ],
                ),
              );
            },
          ),
        );
      },
    );
  }
}

/// Skeleton da seção Histórico (2 cards compactos).
class AthleteProfileHistorySkeleton extends StatelessWidget {
  const AthleteProfileHistorySkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return AthleteProfileSkeletonPulse(
      builder: (context, pulse) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < 2; i++) ...[
              if (i > 0) SizedBox(height: 8),
              _HistoryRowSkeleton(pulse: pulse),
            ],
          ],
        );
      },
    );
  }
}

class _HistoryRowSkeleton extends StatelessWidget {
  const _HistoryRowSkeleton({required this.pulse});

  final double pulse;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(
        context,
        color: context.themeColors.surfaceRaised.withValues(alpha: 0.75),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            ProfileShimmerBox(width: 40, height: 40, pulse: pulse),
            SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  LayoutBuilder(
                    builder: (context, constraints) {
                      return ProfileShimmerBox(
                        width: constraints.maxWidth * 0.85,
                        height: 12,
                        pulse: pulse,
                      );
                    },
                  ),
                  SizedBox(height: 8),
                  ProfileShimmerBox(width: 120, height: 10, pulse: pulse),
                ],
              ),
            ),
            SizedBox(width: 8),
            ProfileShimmerBox(width: 36, height: 14, pulse: pulse),
          ],
        ),
      ),
    );
  }
}
