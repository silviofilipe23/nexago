import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class AuthLoadingProgressBar extends StatefulWidget {
  const AuthLoadingProgressBar({
    super.key,
    required this.progress,
    this.leftLabel = 'CONECTANDO',
    this.rightLabel = 'BEACH VOLLEY',
  });

  final double progress;
  final String leftLabel;
  final String rightLabel;

  @override
  State<AuthLoadingProgressBar> createState() => _AuthLoadingProgressBarState();
}

class _AuthLoadingProgressBarState extends State<AuthLoadingProgressBar>
    with SingleTickerProviderStateMixin {
  late final AnimationController _shimmer;
  double _displayProgress = 0;

  @override
  void initState() {
    super.initState();
    _displayProgress = widget.progress.clamp(0.0, 1.0);
    _shimmer = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();
  }

  @override
  void didUpdateWidget(covariant AuthLoadingProgressBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.progress != widget.progress) {
      setState(() {
        _displayProgress = widget.progress.clamp(0.0, 1.0);
      });
    }
  }

  @override
  void dispose() {
    _shimmer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final labelStyle = AppTypography.mono(
      fontSize: 10,
      fontWeight: FontWeight.w700,
      color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.9),
      letterSpacing: 0.55,
    );

    return AnimatedBuilder(
      animation: _shimmer,
      builder: (context, _) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(widget.leftLabel, style: labelStyle),
                Text(widget.rightLabel, style: labelStyle),
              ],
            ),
            const SizedBox(height: 12),
            TweenAnimationBuilder<double>(
              tween: Tween<double>(
                begin: _displayProgress,
                end: widget.progress.clamp(0.0, 1.0),
              ),
              duration: widget.progress >= 1
                  ? const Duration(milliseconds: 900)
                  : const Duration(milliseconds: 680),
              curve: Curves.easeOutCubic,
              onEnd: () {
                if (mounted) {
                  setState(() {
                    _displayProgress = widget.progress.clamp(0.0, 1.0);
                  });
                }
              },
              builder: (context, animatedProgress, child) {
                return _ProgressTrack(
                  progress: animatedProgress,
                  shimmer: _shimmer.value,
                );
              },
            ),
          ],
        );
      },
    );
  }
}

class _ProgressTrack extends StatelessWidget {
  const _ProgressTrack({required this.progress, required this.shimmer});

  final double progress;
  final double shimmer;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(99),
      child: SizedBox(
        height: 4,
        child: Stack(
          fit: StackFit.expand,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                color: AppColors.white.withValues(alpha: 0.06),
                border: Border.all(
                  color: AppColors.white.withValues(alpha: 0.05),
                ),
              ),
            ),
            FractionallySizedBox(
              alignment: Alignment.centerLeft,
              widthFactor: progress,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          AppColors.brandPressed,
                          AppColors.brand,
                          AppColors.brandHover,
                        ],
                      ),
                    ),
                  ),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment(-1.5 + (shimmer * 3), 0),
                        end: Alignment(-0.5 + (shimmer * 3), 0),
                        colors: [
                          Colors.transparent,
                          AppColors.white.withValues(alpha: 0.35),
                          Colors.transparent,
                        ],
                      ),
                    ),
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: Container(
                      width: 6,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.white.withValues(alpha: 0.85),
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.brand.withValues(alpha: 0.9),
                            blurRadius: 10,
                            spreadRadius: 1,
                          ),
                        ],
                      ),
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
