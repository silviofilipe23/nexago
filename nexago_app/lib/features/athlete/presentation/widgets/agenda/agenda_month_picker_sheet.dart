import 'package:flutter/material.dart';

import '../../../../../core/theme/app_theme_colors.dart';
import '../../../domain/agenda/athlete_agenda_logic.dart';
import '../../../domain/agenda/athlete_agenda_models.dart';
import 'agenda_month_grid.dart';
import 'agenda_month_legend.dart';

/// Seletor de data da Agenda: o mês com os pontos dos compromissos. Devolve o
/// dia tocado (ou `null` se o atleta fechar a folha).
Future<DateTime?> showAgendaMonthPicker(
  BuildContext context, {
  required List<AthleteAgendaItem> items,
  required DateTime now,
}) {
  return showModalBottomSheet<DateTime>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: context.themeColors.surfaceSheet,
    builder: (_) => _AgendaMonthPickerSheet(items: items, now: now),
  );
}

class _AgendaMonthPickerSheet extends StatefulWidget {
  const _AgendaMonthPickerSheet({required this.items, required this.now});

  final List<AthleteAgendaItem> items;
  final DateTime now;

  @override
  State<_AgendaMonthPickerSheet> createState() =>
      _AgendaMonthPickerSheetState();
}

class _AgendaMonthPickerSheetState extends State<_AgendaMonthPickerSheet> {
  late DateTime _month = startOfMonth(widget.now);

  @override
  Widget build(BuildContext context) {
    final days = buildAgendaMonthDayMarkers(
      visibleMonth: _month,
      selectedDay: widget.now,
      items: widget.items,
      now: widget.now,
    );
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text(
                'Ir para uma data',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
              ),
            ),
            AgendaMonthGrid(
              visibleMonth: _month,
              days: days,
              onMonthChanged: (m) => setState(() => _month = startOfMonth(m)),
              onDaySelected: (day) => Navigator.of(context).pop(dateOnly(day)),
            ),
            const AgendaMonthLegend(),
          ],
        ),
      ),
    );
  }
}
