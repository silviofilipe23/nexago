import 'package:flutter/material.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/squad_models.dart';
import '../../domain/squad_rules.dart';
import 'squad_ui.dart';

/// Linha de "Últimas conversões" (App 01): atleta, evento, comissão e status.
class SquadConversionRow extends StatelessWidget {
  const SquadConversionRow({
    super.key,
    required this.commission,
    this.divider = false,
  });

  final SquadCommission commission;
  final bool divider;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = commission;
    final canceled = c.status == SquadCommissionStatus.canceled;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 11),
      decoration: BoxDecoration(
        border: divider
            ? Border(top: BorderSide(color: SquadStyle.line(colors)))
            : null,
      ),
      child: Row(
        children: [
          SquadAvatar(name: c.label, size: 38, hue: squadHueFor(c.label)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  c.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: SquadStyle.display(
                    14,
                    color: colors.onSurface,
                    weight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  squadCommissionEvent(c),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    color: SquadStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                canceled
                    ? formatBRLFromCents(c.amountCents)
                    : '+${formatBRLFromCents(c.amountCents)}',
                style:
                    SquadStyle.display(
                      14,
                      color: canceled
                          ? SquadStyle.dim(colors)
                          : colors.onSurface,
                      weight: FontWeight.w700,
                    ).copyWith(
                      decoration: canceled ? TextDecoration.lineThrough : null,
                    ),
              ),
              const SizedBox(height: 2),
              Text(
                squadCommissionStatusLabel(c, short: true),
                style: AppTypography.bodyS.copyWith(
                  fontSize: 11,
                  color: SquadStyle.toneColor(squadCommissionTone(c), colors),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
