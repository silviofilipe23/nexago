import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/feedback/feedback_page.dart';
import '../../../../../core/theme/app_typography.dart';

class BookingSuccessHeader extends StatelessWidget {
  const BookingSuccessHeader({super.key, required this.paymentSubtitle});

  final String paymentSubtitle;

  @override
  Widget build(BuildContext context) {
    final headlineStyle = TextStyle(
      fontFamily: AppTypography.fontFamily,
      fontSize: 28,
      fontWeight: FontWeight.w900,
      color: context.themeColors.onSurface,
      letterSpacing: -0.6,
      height: 1.12,
    );

    return Column(
      children: [
        const FeedbackHeroIcon(kind: FeedbackKind.success),
        const SizedBox(height: 24),
        Text(
          'RESERVA CONFIRMADA',
          style: AppTypography.mono(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: AppColors.win,
            letterSpacing: 2.4,
          ),
        ),
        SizedBox(height: 14),
        Text(
          'Quadra garantida.',
          style: headlineStyle,
          textAlign: TextAlign.center,
        ),
        Text(
          'Bora jogar! 🏐',
          style: headlineStyle,
          textAlign: TextAlign.center,
        ),
        if (paymentSubtitle.trim().isNotEmpty) ...[
          SizedBox(height: 14),
          Text(
            paymentSubtitle,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w500,
              height: 1.4,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ],
    );
  }
}
