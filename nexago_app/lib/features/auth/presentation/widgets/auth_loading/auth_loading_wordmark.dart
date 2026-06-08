import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';

class AuthLoadingWordmark extends StatefulWidget {
  const AuthLoadingWordmark({super.key});

  @override
  State<AuthLoadingWordmark> createState() => _AuthLoadingWordmarkState();
}

class _AuthLoadingWordmarkState extends State<AuthLoadingWordmark>
    with SingleTickerProviderStateMixin {
  late final AnimationController _shimmer;

  @override
  void initState() {
    super.initState();
    _shimmer = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3200),
    )..repeat();
  }

  @override
  void dispose() {
    _shimmer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final baseStyle = AppTypography.soraRegular(
      fontSize: 32,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.6,
      height: 1,
    );

    return AnimatedBuilder(
      animation: _shimmer,
      builder: (context, child) {
        final t = _shimmer.value;
        return Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Text(
              'nexa',
              style: baseStyle.copyWith(color: AppColors.onSurface),
            ),
            ShaderMask(
              blendMode: BlendMode.srcIn,
              shaderCallback: (bounds) {
                return LinearGradient(
                  begin: Alignment(-1.2 + (t * 2.4), -0.5),
                  end: Alignment(-0.2 + (t * 2.4), 0.5),
                  colors: const [
                    AppColors.brand,
                    AppColors.brandHover,
                    AppColors.brand,
                  ],
                  stops: const [0.0, 0.5, 1.0],
                ).createShader(bounds);
              },
              child: Text(
                'GO',
                style: baseStyle.copyWith(color: AppColors.brand),
              ),
            ),
          ],
        );
      },
    );
  }
}
