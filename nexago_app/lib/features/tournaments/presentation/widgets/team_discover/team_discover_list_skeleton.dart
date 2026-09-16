import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'team_discover_dual_avatars.dart';

class TeamDiscoverListSkeleton extends StatefulWidget {
  const TeamDiscoverListSkeleton({super.key});

  @override
  State<TeamDiscoverListSkeleton> createState() =>
      _TeamDiscoverListSkeletonState();
}

class _TeamDiscoverListSkeletonState extends State<TeamDiscoverListSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, _) {
        final pulse = Curves.easeInOut.transform(_pulse.value);
        return ListView.separated(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          itemCount: 7,
          separatorBuilder: (_, __) => const SizedBox(height: 2),
          itemBuilder: (_, __) => _RowSkeleton(pulse: pulse),
        );
      },
    );
  }
}

class _RowSkeleton extends StatelessWidget {
  const _RowSkeleton({required this.pulse});

  final double pulse;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          _DualAvatarSkeleton(pulse: pulse),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                _ShimmerLine(widthFactor: 0.5, height: 12, pulse: pulse),
                const SizedBox(height: 5),
                _ShimmerLine(widthFactor: 0.72, height: 8, pulse: pulse),
                const SizedBox(height: 5),
                _ShimmerLine(widthFactor: 0.4, height: 8, pulse: pulse),
                const SizedBox(height: 6),
                _ShimmerLine(widthFactor: 0.58, height: 8, pulse: pulse),
              ],
            ),
          ),
          const SizedBox(width: 10),
          _ShimmerBox(width: 24, height: 14, pulse: pulse),
          const SizedBox(width: 10),
          _ShimmerBox(width: 32, height: 32, pulse: pulse, radius: 999),
        ],
      ),
    );
  }
}

class _DualAvatarSkeleton extends StatelessWidget {
  const _DualAvatarSkeleton({required this.pulse});

  final double pulse;

  @override
  Widget build(BuildContext context) {
    const size = TeamDiscoverDualAvatars.listAvatarSize;
    return SizedBox(
      width: TeamDiscoverDualAvatars.footprintFor(size),
      height: size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            left: 0,
            child: _ShimmerCircle(size: size, pulse: pulse),
          ),
          Positioned(
            left: size * TeamDiscoverDualAvatars.listOverlap,
            child: _ShimmerCircle(size: size, pulse: pulse),
          ),
        ],
      ),
    );
  }
}

class _ShimmerCircle extends StatelessWidget {
  const _ShimmerCircle({required this.size, required this.pulse});

  final double size;
  final double pulse;

  @override
  Widget build(BuildContext context) {
    final base = context.themeColors.onSurfaceMuted.withValues(alpha: 0.1);
    final highlight =
        context.themeColors.onSurfaceMuted.withValues(alpha: 0.18);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Color.lerp(base, highlight, pulse),
        // A linha mora no canvas agora, não dentro de um card.
        border: Border.all(
          color: context.themeColors.canvas,
          width: 2,
        ),
      ),
    );
  }
}

class _ShimmerLine extends StatelessWidget {
  const _ShimmerLine({
    required this.widthFactor,
    required this.height,
    required this.pulse,
  });

  final double widthFactor;
  final double height;
  final double pulse;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return _ShimmerBox(
          width: constraints.maxWidth * widthFactor,
          height: height,
          pulse: pulse,
        );
      },
    );
  }
}

class _ShimmerBox extends StatelessWidget {
  const _ShimmerBox({
    required this.width,
    required this.height,
    required this.pulse,
    this.radius = 6,
  });

  final double width;
  final double height;
  final double pulse;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final base = context.themeColors.onSurfaceMuted.withValues(alpha: 0.1);
    final highlight =
        context.themeColors.onSurfaceMuted.withValues(alpha: 0.18);
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        color: Color.lerp(base, highlight, pulse),
      ),
    );
  }
}
