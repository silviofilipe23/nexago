import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';

class AthleteNotificationsSectionHeader extends StatelessWidget {
  const AthleteNotificationsSectionHeader({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 20, 4, 10),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: AppColors.onSurfaceMuted,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}
