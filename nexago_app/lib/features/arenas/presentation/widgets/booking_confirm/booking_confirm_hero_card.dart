import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/arena_booking_labels.dart';

class BookingConfirmHeroCard extends StatelessWidget {
  const BookingConfirmHeroCard({
    super.key,
    required this.dateKey,
    required this.timeRange,
    required this.arenaName,
    required this.courtName,
    this.courtSubtitle,
  });

  final String dateKey;
  final String timeRange;
  final String arenaName;
  final String courtName;
  final String? courtSubtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dateUpper = formatBookingDateHeaderUppercase(dateKey);
    final locationParts = <String>[arenaName, courtName];

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF1A0F06), // rgb(26, 15, 6) 0%
            Color(0xFF2A1408), // rgb(42, 20, 8) 60%
            Color(0xFF050505), // rgb(5, 5, 5) 100%
          ],
          stops: [0.0, 0.6, 1.0],
        ),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            dateUpper,
            style: AppTypography.mono(
              color: AppColors.brand,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            timeRange,
            style: AppTypography.mono(
              fontWeight: FontWeight.w900,
              fontSize: 36,
              color: Colors.white,
              letterSpacing: -0.5,
              height: 1.05,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.location_on_outlined,
                size: 18,
                color: AppColors.brand,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  locationParts.join(' · '),
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: Colors.white.withValues(alpha: 0.82),
                    fontWeight: FontWeight.w600,
                    height: 1.35,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
