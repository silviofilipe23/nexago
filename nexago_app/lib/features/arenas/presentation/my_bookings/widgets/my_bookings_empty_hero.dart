import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../arena_booking_navigation.dart';

class MyBookingsEmptyHero extends ConsumerWidget {
  const MyBookingsEmptyHero({
    super.key,
    required this.nearbyCountToday,
    required this.firstBookingXp,
    required this.proximityPhrase,
  });

  final int nearbyCountToday;
  final int firstBookingXp;
  final String proximityPhrase;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        boxShadow: [],
      ),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surfaceCard,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.brand.withValues(alpha: 0.2)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 28, 20, 24),
        child: Column(
          children: [
            Stack(
              alignment: Alignment.center,
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(18),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.brand.withValues(alpha: 0.5),
                        blurRadius: 32,
                        spreadRadius: 2,
                      ),
                    ],
                  ),
                ),
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    gradient: const LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Color(0xFFCC0000), Color(0xFFFF6A1A)],
                    ),
                  ),
                  child: const _CourtLineIcon(size: 28),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Text(
              'SUA PRIMEIRA RESERVA',
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.brand,
                letterSpacing: 1.2,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Hora de pisar\nna areia.',
              textAlign: TextAlign.center,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.onSurface,
                letterSpacing: -0.5,
                height: 1.1,
                fontSize: 26,
              ),
            ),
            const SizedBox(height: 14),
            RichText(
              textAlign: TextAlign.center,
              text: TextSpan(
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.onSurfaceMuted,
                  height: 1.5,
                  fontSize: 14,
                ),
                children: [
                  TextSpan(
                    text: nearbyCountToday > 0
                        ? '$nearbyCountToday arenas $proximityPhrase com horário aberto hoje. '
                        : _emptyDescription(proximityPhrase),
                  ),
                  const TextSpan(text: 'Primeira reserva: '),
                  TextSpan(
                    text: '+$firstBookingXp XP.',
                    style: AppTypography.mono(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: AppColors.brand,
                      letterSpacing: 0.2,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.brand.withValues(alpha: 0.55),
                      blurRadius: 22,
                      offset: const Offset(0, 10),
                    ),
                    BoxShadow(
                      color: AppColors.brand.withValues(alpha: 0.28),
                      blurRadius: 36,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: FilledButton(
                  onPressed: () => openDiscoverReservarTab(context, ref: ref),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    elevation: 0,
                    shadowColor: Colors.transparent,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 24,
                        height: 24,
                        decoration: const BoxDecoration(
                          color: AppColors.black,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.add_rounded,
                          color: AppColors.brand,
                          size: 18,
                        ),
                      ),
                      const SizedBox(width: 10),
                      const Text(
                        'Reservar uma quadra',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 15,
                          color: AppColors.black,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _emptyDescription(String proximityPhrase) {
    if (proximityPhrase == 'com horário aberto') {
      return 'Encontre uma arena perto de você e reserve hoje. ';
    }
    return 'Encontre uma arena $proximityPhrase e reserve hoje. ';
  }
}

/// Ícone de quadra (retângulo, linha central e círculo) — protótipo 05.
class _CourtLineIcon extends StatelessWidget {
  const _CourtLineIcon({this.size = 28});

  final double size;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size.square(size),
      painter: _CourtLineIconPainter(),
    );
  }
}

class _CourtLineIconPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.black
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.width * 0.075
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final court = RRect.fromRectAndRadius(
      Rect.fromLTWH(
        size.width * 0.14,
        size.height * 0.22,
        size.width * 0.72,
        size.height * 0.56,
      ),
      Radius.circular(size.width * 0.05),
    );
    canvas.drawRRect(court, paint);

    final midX = size.width / 2;
    canvas.drawLine(
      Offset(midX, size.height * 0.22),
      Offset(midX, size.height * 0.78),
      paint,
    );

    canvas.drawCircle(
      Offset(midX, size.height * 0.5),
      size.width * 0.09,
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
