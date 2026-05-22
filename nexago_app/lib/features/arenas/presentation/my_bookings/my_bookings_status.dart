import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/theme/app_colors.dart';

class MyBookingStatusUi {
  const MyBookingStatusUi({
    required this.label,
    required this.dotColor,
    required this.textColor,
    required this.backgroundColor,
  });

  final String label;
  final Color dotColor;
  final Color textColor;
  final Color backgroundColor;
}

MyBookingStatusUi myBookingStatusUi(String raw) {
  final s = raw.trim().toLowerCase();
  switch (s) {
    case 'active':
      return MyBookingStatusUi(
        label: 'AGENDADA',
        dotColor: AppColors.win,
        textColor: AppColors.win,
        backgroundColor: AppColors.win.withValues(alpha: 0.12),
      );
    case 'canceled':
    case 'cancelled':
      return MyBookingStatusUi(
        label: 'CANCELADA',
        dotColor: AppColors.live,
        textColor: AppColors.live,
        backgroundColor: AppColors.live.withValues(alpha: 0.12),
      );
    case 'pending':
    case 'processing':
      return MyBookingStatusUi(
        label: 'PENDENTE',
        dotColor: AppColors.pending,
        textColor: AppColors.pending,
        backgroundColor: AppColors.pending.withValues(alpha: 0.14),
      );
    case 'checkin_open':
      return MyBookingStatusUi(
        label: 'CHECK-IN',
        dotColor: const Color(0xFF5B9FFF),
        textColor: const Color(0xFF5B9FFF),
        backgroundColor: const Color(0xFF5B9FFF).withValues(alpha: 0.14),
      );
    default:
      final pretty = s.isEmpty ? '—' : s.replaceAll('_', ' ').toUpperCase();
      return MyBookingStatusUi(
        label: pretty,
        dotColor: AppColors.onSurfaceMuted,
        textColor: AppColors.onSurfaceMuted,
        backgroundColor: AppColors.surfaceRaised,
      );
  }
}

class MyBookingStatusBadge extends StatelessWidget {
  const MyBookingStatusBadge({super.key, required this.ui});

  final MyBookingStatusUi ui;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: ui.backgroundColor,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: ui.dotColor,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 5),
          Text(
            ui.label,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
              color: ui.textColor,
            ),
          ),
        ],
      ),
    );
  }
}
