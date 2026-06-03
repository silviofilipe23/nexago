import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../my_bookings_logic.dart';

class MyBookingsDateHeader extends StatelessWidget {
  const MyBookingsDateHeader({
    super.key,
    required this.dateRaw,
  });

  final String dateRaw;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final relative = relativeBookingDayLabel(dateRaw);
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 8, 2, 12),
      child: Row(
        children: [
          Container(
            width: 3,
            height: 22,
            decoration: BoxDecoration(
              color: AppColors.brand,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              formatBookingDateHeader(dateRaw),
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
                letterSpacing: -0.2,
              ),
            ),
          ),
          if (relative.isNotEmpty)
            Text(
              relative,
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurfaceMuted,
                letterSpacing: 0.8,
              ),
            ),
        ],
      ),
    );
  }
}
