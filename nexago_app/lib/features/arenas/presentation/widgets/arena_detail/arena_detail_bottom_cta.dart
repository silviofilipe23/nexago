import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../../core/theme/app_colors.dart';

/// Horário escolhido na agenda do perfil, pronto para reservar.
class ArenaDetailBookingSelection {
  const ArenaDetailBookingSelection({
    required this.title,
    required this.subtitle,
    required this.onReserve,
  });

  /// Ex.: "19:00–20:00".
  final String title;

  /// Ex.: "sex, 21 mar · Quadra 2 · R$ 120".
  final String subtitle;
  final VoidCallback onReserve;
}

/// Barra fixa do perfil da arena. Sem horário escolhido: preço de entrada e
/// horários livres hoje à esquerda, "Ver horários" à direita (sem preço, o
/// botão ocupa a largura). Com horário escolhido: o que vai ser reservado e
/// "Reservar".
class ArenaDetailBottomCta extends StatelessWidget {
  const ArenaDetailBottomCta({
    super.key,
    required this.onPressed,
    this.entryPricePerHour,
    this.freeSlotsToday,
    this.selection,
  });

  final VoidCallback onPressed;

  /// Menor preço/h; `null` = sem preço para mostrar.
  final double? entryPricePerHour;

  /// Horários livres hoje somando as quadras; `null` enquanto carrega.
  final int? freeSlotsToday;

  /// Horário escolhido na agenda; troca a barra para "Reservar".
  final ArenaDetailBookingSelection? selection;

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
    final selection = this.selection;
    final Widget? leading = selection != null
        ? _SelectionSummary(selection: selection)
        : _entrySummary(context);
    final button = _CtaButton(
      label: selection != null ? 'Reservar' : 'Ver horários',
      onPressed: selection?.onReserve ?? onPressed,
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
            child: leading == null
                ? SizedBox(width: double.infinity, child: button)
                : Row(
                    children: [
                      Expanded(child: leading),
                      const SizedBox(width: 12),
                      button,
                    ],
                  ),
          ),
        ),
      ),
    );
  }

  Widget? _entrySummary(BuildContext context) {
    final price = entryPricePerHour;
    if (price == null) return null;
    final colors = context.themeColors;
    final availability = availabilityLabel(freeSlotsToday);
    return Column(
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
    );
  }
}

class _SelectionSummary extends StatelessWidget {
  const _SelectionSummary({required this.selection});

  final ArenaDetailBookingSelection selection;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          selection.title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.mono(
            fontSize: 14,
            fontWeight: FontWeight.w800,
            color: colors.onSurface,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          selection.subtitle,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: colors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }
}

class _CtaButton extends StatelessWidget {
  const _CtaButton({required this.label, required this.onPressed});

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
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
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
          const SizedBox(width: 8),
          const Icon(Icons.arrow_forward_rounded, size: 20),
        ],
      ),
    );
  }
}
