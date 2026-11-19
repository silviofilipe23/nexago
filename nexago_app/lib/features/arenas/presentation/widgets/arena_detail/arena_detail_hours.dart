import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/arena_detail_hours_logic.dart';

/// "Aberta agora · até 23:00" no topo do perfil, com bolinha verde quando
/// está aberta.
class ArenaDetailOpenStatusLine extends StatelessWidget {
  const ArenaDetailOpenStatusLine({super.key, required this.status});

  final ArenaOpenStatus status;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final color = status.isOpen ? colors.win : colors.onSurfaceMuted;
    return Row(
      children: [
        SizedBox(
          width: 18,
          child: Center(
            child: Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
          ),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            status.label,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: color,
                  fontWeight: FontWeight.w700,
                ),
          ),
        ),
      ],
    );
  }
}

/// "Horários de reserva" da semana, em Sobre e contato.
class ArenaDetailWeekHours extends StatelessWidget {
  const ArenaDetailWeekHours({super.key, required this.rows});

  final List<ArenaWeekHoursRow> rows;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) return const SizedBox.shrink();
    final colors = context.themeColors;
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'HORÁRIOS DE RESERVA',
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 1,
            color: colors.onSurfaceMuted,
          ),
        ),
        const SizedBox(height: 8),
        for (final row in rows)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    row.daysLabel,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: colors.onSurface,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Text(
                  row.hoursLabel,
                  style: AppTypography.mono(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: row.hoursLabel == 'Fechado'
                        ? colors.onSurfaceMuted
                        : colors.onSurface,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
