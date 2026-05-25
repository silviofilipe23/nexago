import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';

class BookingSuccessHeader extends StatelessWidget {
  const BookingSuccessHeader({super.key, required this.paymentSubtitle});

  final String paymentSubtitle;

  static const _headlineStyle = TextStyle(
    fontFamily: AppTypography.fontFamily,
    fontSize: 28,
    fontWeight: FontWeight.w900,
    color: AppColors.onSurface,
    letterSpacing: -0.6,
    height: 1.12,
  );

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          width: double.infinity,
          height: 160,
          child: Stack(
            alignment: Alignment.center,
            clipBehavior: Clip.none,
            children: [
              // Halo externo (anel verde escuro)
              Container(
                width: 104,
                height: 104,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: AppColors.win.withValues(alpha: 0.22),
                    width: 10,
                  ),
                ),
              ),
              // Glow suave
              Container(
                width: 92,
                height: 92,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.win.withValues(alpha: 0.45),
                      blurRadius: 36,
                      spreadRadius: 2,
                    ),
                    BoxShadow(
                      color: AppColors.win.withValues(alpha: 0.18),
                      blurRadius: 64,
                      spreadRadius: 8,
                    ),
                  ],
                ),
              ),
              // Círculo principal + check
              Container(
                width: 80,
                height: 80,
                decoration: const BoxDecoration(
                  color: AppColors.win,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check_rounded,
                  color: AppColors.black,
                  size: 48,
                  weight: 900,
                ),
              ),
            ],
          ),
        ),
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
        const SizedBox(height: 14),
        const Text(
          'Quadra garantida.',
          style: _headlineStyle,
          textAlign: TextAlign.center,
        ),
        const Text(
          'Bora jogar! 🏐',
          style: _headlineStyle,
          textAlign: TextAlign.center,
        ),
        if (paymentSubtitle.trim().isNotEmpty) ...[
          const SizedBox(height: 14),
          Text(
            paymentSubtitle,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: AppColors.onSurfaceMuted,
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
