import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/agenda/athlete_agenda_models.dart';

class AgendaEmptyDayHero extends StatelessWidget {
  const AgendaEmptyDayHero({
    super.key,
    required this.dayLabel,
    required this.description,
    required this.onReserveTap,
    required this.onDropInTap,
  });

  final String dayLabel;
  final AgendaEmptyHeroDescriptionParts description;
  final VoidCallback onReserveTap;
  final VoidCallback onDropInTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const radius = 20.0;

    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Stack(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(20, 28, 20, 22),
            decoration: BoxDecoration(
              color: context.themeColors.surfaceCard,
              borderRadius: BorderRadius.circular(radius),
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.22),
              ),
            ),
            child: Column(
              children: [
                Stack(
                  alignment: Alignment.center,
                  clipBehavior: Clip.hardEdge,
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        color: context.themeColors.surfaceRaised,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: AppColors.brand.withValues(alpha: 0.35),
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.brand.withValues(alpha: 0.22),
                            blurRadius: 10,
                            spreadRadius: -6,
                            offset: const Offset(0, 3),
                          ),
                        ],
                      ),
                      child: Icon(
                        Icons.calendar_today_rounded,
                        size: 26,
                        color: AppColors.brand,
                      ),
                    ),
                  ],
                ),
            const SizedBox(height: 16),
            Text(
              dayLabel,
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.brand,
                letterSpacing: 1.1,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Sem jogos marcados.',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
                letterSpacing: -0.3,
              ),
            ),
            const SizedBox(height: 12),
            RichText(
              textAlign: TextAlign.center,
              text: TextSpan(
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  height: 1.5,
                  fontSize: 14,
                ),
                children: [
                  TextSpan(text: description.lead),
                  if (description.nearbyCount != null) ...[
                    TextSpan(
                      text: '${description.nearbyCount}',
                      style: AppTypography.mono(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: AppColors.brand,
                      ),
                    ),
                    TextSpan(text: description.suffix),
                  ] else
                    TextSpan(text: description.suffix),
                ],
              ),
            ),
            const SizedBox(height: 22),
            Row(
              children: [
                Expanded(
                  flex: 3,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.brand.withValues(alpha: 0.4),
                          blurRadius: 18,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: FilledButton.icon(
                      onPressed: onReserveTap,
                      icon: const Icon(Icons.add_rounded, size: 18),
                      label: const Text('Reservar agora'),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.brand,
                        foregroundColor: AppColors.black,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(999),
                        ),
                        textStyle: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ),
                ),
                // TODO: Uncomment this when the drop-in button is ready
                // const SizedBox(width: 10),
                // Expanded(
                //   flex: 2,
                //   child: OutlinedButton.icon(
                //     onPressed: onDropInTap,
                //     icon: const Icon(Icons.person_add_outlined, size: 16),
                //     label: const Text('Drop-in'),
                //     style: OutlinedButton.styleFrom(
                //       foregroundColor: context.themeColors.onSurface,
                //       side: BorderSide(color: context.themeColors.surfaceRaised),
                //       padding: const EdgeInsets.symmetric(vertical: 14),
                //       shape: RoundedRectangleBorder(
                //         borderRadius: BorderRadius.circular(999),
                //       ),
                //       textStyle: const TextStyle(
                //         fontWeight: FontWeight.w700,
                //         fontSize: 13,
                //       ),
                //     ),
                //   ),
                // ),
              ],
            ),
          ],
        ),
          ),
          Positioned.fill(
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(radius),
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      AppColors.brand.withValues(alpha: 0.10),
                      Colors.transparent,
                      Colors.transparent,
                      AppColors.brand.withValues(alpha: 0.06),
                    ],
                    stops: const [0, 0.18, 0.82, 1],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
