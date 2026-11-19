import 'package:flutter/material.dart';

import '../../../domain/agenda/agenda_list_logic.dart';
import '../../../domain/agenda/athlete_agenda_logic.dart';
import '../../../domain/agenda/athlete_agenda_models.dart';
import 'agenda_timeline_widgets.dart';

/// Os blocos da lista (um por dia em Próximos, um por mês no Histórico), cada
/// um com o cabeçalho e a linha do tempo dos seus compromissos.
///
/// Monta tudo de uma vez (não é lazy) para o seletor de data conseguir rolar
/// até qualquer bloco pela [sectionKey].
class AgendaListSections extends StatelessWidget {
  const AgendaListSections({
    super.key,
    required this.sections,
    required this.sectionKey,
    required this.highlightNextId,
    required this.onCancelBooking,
  });

  final List<AgendaListSection> sections;
  final GlobalKey Function(DateTime day) sectionKey;
  final String? highlightNextId;
  final Future<void> Function(AthleteAgendaRentalPayload rental)
      onCancelBooking;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final section in sections) ...[
          AgendaTimelineSectionHeader(
            key: sectionKey(section.day),
            title: section.title,
            subtitle: section.subtitle,
          ),
          for (final row in buildAgendaTimelineRows(items: section.items))
            AgendaTimelineRow(
              key: ValueKey('agenda-row-${row.item.id}'),
              row: row,
              highlightNextId: highlightNextId,
              onCancelBooking: onCancelBooking,
            ),
        ],
      ],
    );
  }
}
