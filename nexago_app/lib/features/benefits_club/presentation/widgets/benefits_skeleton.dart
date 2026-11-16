import 'package:flutter/material.dart';

import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';

/// Duração de uma passada do brilho do esqueleto.
const Duration _shimmerPeriod = Duration(milliseconds: 1300);

/// Brilho que corre por cima dos blocos do esqueleto (sem pacote: um
/// `ShaderMask` animado). Com "reduzir movimento" ligado, fica parado.
class BenefitsShimmer extends StatefulWidget {
  const BenefitsShimmer({super.key, required this.child});

  final Widget child;

  @override
  State<BenefitsShimmer> createState() => _BenefitsShimmerState();
}

class _BenefitsShimmerState extends State<BenefitsShimmer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: _shimmerPeriod,
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (reduceMotion) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final base = colors.surfaceRaised;
    final highlight = Color.alphaBlend(
      colors.onSurface.withValues(alpha: 0.08),
      base,
    );
    return AnimatedBuilder(
      animation: _controller,
      child: widget.child,
      builder: (context, child) {
        final t = _controller.value;
        return ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (bounds) => LinearGradient(
            begin: Alignment(-1 - 2 + 4 * t, 0),
            end: Alignment(1 - 2 + 4 * t, 0),
            colors: [base, highlight, base],
            stops: const [0.25, 0.5, 0.75],
          ).createShader(bounds),
          child: child,
        );
      },
    );
  }
}

/// Bloco cinza do esqueleto.
class SkeletonBlock extends StatelessWidget {
  const SkeletonBlock({
    super.key,
    this.width,
    required this.height,
    this.radius = AppRadii.mdAll,
  });

  final double? width;
  final double height;
  final BorderRadius radius;

  @override
  Widget build(BuildContext context) => Container(
    width: width,
    height: height,
    decoration: BoxDecoration(
      color: context.themeColors.surfaceRaised,
      borderRadius: radius,
    ),
  );
}

/// Esqueleto da tela do clube: carteirinha, destaque, chips e três cards.
class BenefitsClubSkeleton extends StatelessWidget {
  const BenefitsClubSkeleton({super.key});

  static const Key skeletonKey = Key('benefits-skeleton');

  @override
  Widget build(BuildContext context) => Semantics(
    key: skeletonKey,
    label: 'Carregando o clube',
    child: ExcludeSemantics(
      child: BenefitsShimmer(
        child: ListView(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            AppSpacing.xs,
            AppSpacing.screenH,
            AppSpacing.xl,
          ),
          children: [
            const SkeletonBlock(height: 176, radius: AppRadii.xlAll),
            const SizedBox(height: AppSpacing.md),
            const SkeletonBlock(height: 196, radius: AppRadii.xlAll),
            const SizedBox(height: AppSpacing.md),
            const Row(
              children: [
                SkeletonBlock(width: 72, height: 36, radius: AppRadii.pillAll),
                SizedBox(width: AppSpacing.sm),
                SkeletonBlock(width: 108, height: 36, radius: AppRadii.pillAll),
                SizedBox(width: AppSpacing.sm),
                SkeletonBlock(width: 88, height: 36, radius: AppRadii.pillAll),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            for (var i = 0; i < 3; i++) ...[
              const SkeletonBlock(height: 84, radius: AppRadii.lgAll),
              const SizedBox(height: 10),
            ],
          ],
        ),
      ),
    ),
  );
}
