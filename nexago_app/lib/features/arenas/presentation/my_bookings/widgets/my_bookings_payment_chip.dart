import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/my_booking_payment.dart';

class MyBookingsPaymentChip extends StatelessWidget {
  const MyBookingsPaymentChip({
    super.key,
    required this.payment,
  });

  final MyBookingPaymentDisplay payment;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: payment.accentColor.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: payment.accentColor.withValues(alpha: 0.28),
        ),
      ),
      child: Text(
        payment.label.toUpperCase(),
        style: AppTypography.mono(
          fontSize: 9,
          fontWeight: FontWeight.w700,
          color: payment.accentColor,
          letterSpacing: 0.35,
        ),
      ),
    );
  }
}
