import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../../core/theme/app_colors.dart';

/// Barra fixa do perfil da arena: preço de entrada e horários livres hoje à
/// esquerda, "Ver horários" à direita. Sem preço, o botão ocupa a largura.
class ArenaDetailBottomCta extends StatelessWidget {
  const ArenaDetailBottomCta({
    super.key,
    required this.onPressed,
    this.entryPricePerHour,
    this.freeSlotsToday,
  });

  final VoidCallback onPressed;

  /// Menor preço/h; `null` = sem preço para mostrar.
  final double? entryPricePerHour;

  /// Horários livres hoje somando as quadras; `null` enquanto carrega.
  final int? freeSlotsToday;

  static String? availabilityLabel(int? freeSlotsToday) {
    if (freeSlotsToday == null) return null;
    if (freeSlotsToday == 0) return 'Hoje lotado · veja outros dias';
    return freeSlotsToday == 1
        ? '1 horário livre hoje'
        : '$freeSlotsToday horários livres hoje';
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final price = entryPricePerHour;
    final availability = availabilityLabel(freeSlotsToday);
    final button = FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.brand,
        foregroundColor: AppColors.black,
        elevation: 0,
        minimumSize: const Size(0, 52),
        padding: const EdgeInsets.symmetric(horizontal: 22),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(999),
        ),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Ver horários',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
          SizedBox(width: 8),
          Icon(Icons.arrow_forward_rounded, size: 20),
        ],
      ),
    );

    return Material(
      color: colors.canvas,
      elevation: 0,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(color: colors.outline.withValues(alpha: 0.25)),
          ),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 14),
            child: price == null
                ? SizedBox(width: double.infinity, child: button)
                : Row(
                    children: [
                      Expanded(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text.rich(
                              TextSpan(
                                children: [
                                  TextSpan(
                                    text: 'a partir de ',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: colors.onSurfaceMuted,
                                    ),
                                  ),
                                  TextSpan(
                                    text: '${formatBRLWhole(price)}/h',
                                    style: AppTypography.mono(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w800,
                                      color: colors.onSurface,
                                    ),
                                  ),
                                ],
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (availability != null) ...[
                              const SizedBox(height: 2),
                              Text(
                                availability,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: (freeSlotsToday ?? 0) > 0
                                      ? colors.win
                                      : colors.onSurfaceMuted,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      button,
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
