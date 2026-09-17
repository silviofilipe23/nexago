import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class MatchDetailInfoSection extends StatelessWidget {
  const MatchDetailInfoSection({super.key, required this.rows});

  final List<MatchDetailInfoRow> rows;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
          ),
          child: Column(
            children: [
              for (var i = 0; i < rows.length; i++) ...[
                rows[i],
                if (i < rows.length - 1)
                  Divider(
                    height: 1,
                    thickness: 1,
                    color: Colors.white.withValues(alpha: 0.12),
                    indent: 52,
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class MatchDetailInfoRow extends StatelessWidget {
  const MatchDetailInfoRow({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: context.themeColors.onSurfaceMuted),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: AppTypography.mono(
                    fontWeight: FontWeight.w600,
                    color: context.themeColors.onSurfaceMuted,
                    letterSpacing: 0.4,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: AppTypography.soraRegular(
                    fontWeight: FontWeight.w500,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
