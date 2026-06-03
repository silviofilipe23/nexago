import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';

class MyTournamentsSkeleton extends StatefulWidget {
  const MyTournamentsSkeleton({super.key});

  @override
  State<MyTournamentsSkeleton> createState() => _MyTournamentsSkeletonState();
}

class _MyTournamentsSkeletonState extends State<MyTournamentsSkeleton>
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
        final t = Curves.easeInOut.transform(_pulse.value);
        return ListView(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          children: [
            _ShimmerBox(height: 14, widthFactor: 0.4, pulse: t),
            SizedBox(height: 10),
            _ShimmerBox(height: 28, widthFactor: 0.7, pulse: t),
            SizedBox(height: 20),
            _ShimmerBox(height: 44, widthFactor: 1, pulse: t, radius: 14),
            SizedBox(height: 16),
            for (var i = 0; i < 3; i++) ...[
              _ShimmerBox(height: 120, widthFactor: 1, pulse: t, radius: 16),
              SizedBox(height: 10),
            ],
          ],
        );
      },
    );
  }
}

class _ShimmerBox extends StatelessWidget {
  const _ShimmerBox({
    required this.height,
    required this.widthFactor,
    required this.pulse,
    this.radius = 8,
  });

  final double height;
  final double widthFactor;
  final double pulse;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final base = context.themeColors.onSurfaceMuted.withValues(alpha: 0.1);
    final highlight = context.themeColors.onSurfaceMuted.withValues(alpha: 0.18);
    return LayoutBuilder(
      builder: (context, constraints) {
        return Container(
          width: constraints.maxWidth * widthFactor,
          height: height,
          decoration: BoxDecoration(
            color: Color.lerp(base, highlight, pulse),
            borderRadius: BorderRadius.circular(radius),
          ),
        );
      },
    );
  }
}
