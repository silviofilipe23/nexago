import 'package:flutter/material.dart';

import '../../../domain/agenda/athlete_agenda_models.dart';
import 'agenda_month_grid.dart';
import 'agenda_month_legend.dart';
import 'agenda_month_summary.dart';

class AgendaMonthView extends StatelessWidget {
  const AgendaMonthView({
    super.key,
    required this.visibleMonth,
    required this.monthDays,
    required this.summaryRows,
    required this.freeDaysCount,
    required this.onMonthChanged,
    required this.onDaySelected,
  });

  final DateTime visibleMonth;
  final List<AthleteAgendaMonthDay> monthDays;
  final List<AthleteAgendaMonthSummaryRow> summaryRows;
  final int freeDaysCount;
  final ValueChanged<DateTime> onMonthChanged;
  final ValueChanged<DateTime> onDaySelected;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AgendaMonthGrid(
          visibleMonth: visibleMonth,
          days: monthDays,
          onMonthChanged: onMonthChanged,
          onDaySelected: onDaySelected,
        ),
        const AgendaMonthLegend(),
        AgendaMonthSummary(
          rows: summaryRows,
          freeDaysCount: freeDaysCount,
          onDayTap: onDaySelected,
        ),
      ],
    );
  }
}
