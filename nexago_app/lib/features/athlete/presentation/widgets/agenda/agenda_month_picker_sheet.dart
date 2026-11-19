import 'package:flutter/material.dart';

import '../../../../../core/theme/app_theme_colors.dart';
import '../../../domain/agenda/athlete_agenda_logic.dart';
import '../../../domain/agenda/athlete_agenda_models.dart';
import 'agenda_month_grid.dart';
import 'agenda_month_legend.dart';

/// Seletor de data da Agenda: o mês com os pontos dos compromissos. Devolve o
/// dia tocado (ou `null` se o atleta fechar a folha). [onSubscribeCalendar]
/// mostra no rodapé o atalho para assinar a Agenda no calendário do celular.
Future<DateTime?> showAgendaMonthPicker(
  BuildContext context, {
  required List<AthleteAgendaItem> items,
  required DateTime now,
  VoidCallback? onSubscribeCalendar,
}) {
  return showModalBottomSheet<DateTime>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: context.themeColors.surfaceSheet,
    builder: (_) => _AgendaMonthPickerSheet(
      items: items,
      now: now,
      onSubscribeCalendar: onSubscribeCalendar,
    ),
  );
}

class _AgendaMonthPickerSheet extends StatefulWidget {
  const _AgendaMonthPickerSheet({
    required this.items,
    required this.now,
    this.onSubscribeCalendar,
  });

  final List<AthleteAgendaItem> items;
  final DateTime now;
  final VoidCallback? onSubscribeCalendar;

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
      // Rola em tela baixa: o mês, a legenda e o atalho não cabem em todo celular.
      child: SingleChildScrollView(
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
            if (widget.onSubscribeCalendar case final subscribe?)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: TextButton.icon(
                  key: const Key('agenda-subscribe-calendar'),
                  onPressed: () {
                    Navigator.of(context).pop();
                    subscribe();
                  },
                  icon: const Icon(Icons.event_repeat_outlined, size: 18),
                  label: const Text('Assinar no calendário do celular'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
