import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/agenda/athlete_agenda_models.dart';

class AgendaMonthSummary extends StatelessWidget {
  const AgendaMonthSummary({
    super.key,
    required this.rows,
    required this.freeDaysCount,
    required this.onDayTap,
  });

  final List<AthleteAgendaMonthSummaryRow> rows;
  final int freeDaysCount;
  final ValueChanged<DateTime> onDayTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final busyRows = rows.where((r) => !r.isFree).toList();

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Resumo do mês',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
              if (freeDaysCount > 0)
                Text(
                  '$freeDaysCount LIVRES',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.4,
                  ),
                ),
            ],
          ),
          if (busyRows.isNotEmpty) ...[
            const SizedBox(height: 12),
            for (var i = 0; i < busyRows.length; i++) ...[
              if (i > 0) const SizedBox(height: 8),
              _SummaryRow(
                row: busyRows[i],
                onTap: () => onDayTap(busyRows[i].date),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.row,
    required this.onTap,
  });

  final AthleteAgendaMonthSummaryRow row;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 3,
                height: 44,
                decoration: BoxDecoration(
                  color: row.accentColor,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          row.title,
                          style: theme.textTheme.labelLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: context.themeColors.onSurface,
                          ),
                        ),
                        const Spacer(),
                        Text(
                          row.subtitle,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: AppColors.brand,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    if (row.description.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        row.description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
