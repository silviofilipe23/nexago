import 'dart:convert';
import 'dart:ui' show Color;

import 'agenda_list_logic.dart';
import 'athlete_agenda_logic.dart';
import 'athlete_agenda_models.dart';

/// Widget "Próximo jogo" (W1, Fase 3 da análise da Agenda): o app grava aqui
/// os próximos compromissos e o widget nativo desenha sozinho, sem o app
/// aberto. Só entra o que tem hora marcada, então o widget nunca mostra algo
/// errado entre uma gravação e outra; a contagem é do relógio nativo.

/// Quantos compromissos o widget guarda: o primeiro em destaque, os dois
/// seguintes no tamanho médio e folga para ele seguir sozinho quando o
/// primeiro acabar.
const kAgendaWidgetMaxEntries = 5;

/// Um compromisso como o widget nativo lê.
class AgendaWidgetEntry {
  const AgendaWidgetEntry({
    required this.id,
    required this.label,
    required this.title,
    required this.detail,
    required this.startsAt,
    required this.endsAt,
    required this.allDay,
    required this.color,
  });

  final String id;

  /// "Reserva", "Aula", "Torneio"…
  final String label;
  final String title;
  final String detail;
  final DateTime startsAt;
  final DateTime endsAt;

  /// Torneio sem horário: o widget mostra o dia ("Sáb–Dom"), sem contagem.
  final bool allDay;
  final Color color;

  Map<String, Object> toJson() => {
        'id': id,
        'label': label,
        'title': title,
        'detail': detail,
        'startsAt': startsAt.millisecondsSinceEpoch,
        'endsAt': endsAt.millisecondsSinceEpoch,
        'allDay': allDay,
        'color': color.toARGB32(),
      };
}

String _labelOf(AthleteAgendaItemKind kind) => switch (kind) {
      AthleteAgendaItemKind.rental => 'Reserva',
      AthleteAgendaItemKind.classSession => 'Aula',
      AthleteAgendaItemKind.tournament => 'Torneio',
      AthleteAgendaItemKind.clubSession => 'Clubinho',
      AthleteAgendaItemKind.friendlyMatch => 'Bora Jogar',
      AthleteAgendaItemKind.challenge => 'Desafio',
    };

Color _colorOf(AthleteAgendaItemKind kind) => switch (kind) {
      AthleteAgendaItemKind.rental => athleteAgendaRentalAccent,
      AthleteAgendaItemKind.classSession => athleteAgendaClassSessionAccent,
      AthleteAgendaItemKind.tournament => athleteAgendaTournamentAccent,
      AthleteAgendaItemKind.clubSession => athleteAgendaClubSessionAccent,
      AthleteAgendaItemKind.friendlyMatch => athleteAgendaFriendlyMatchAccent,
      AthleteAgendaItemKind.challenge => athleteAgendaChallengeAccent,
    };

/// Sem fim informado, o compromisso ocupa 2h (a mesma regra de
/// [isAgendaItemPast]).
const _defaultDuration = Duration(hours: 2);

/// Os próximos compromissos para o widget: o que ainda não acabou (o jogo em
/// andamento continua até o fim), sem cancelado, na ordem do relógio.
List<AgendaWidgetEntry> buildAgendaWidgetEntries(
  List<AthleteAgendaItem> items, {
  required DateTime now,
  int limit = kAgendaWidgetMaxEntries,
}) {
  final upcoming = [
    for (final i in agendaUpcomingScope(items, now: now))
      if (!isAgendaItemPast(i, now: now)) i,
  ]..sort((a, b) => a.startsAt.compareTo(b.startsAt));
  return [
    for (final i in upcoming.take(limit))
      AgendaWidgetEntry(
        id: i.id,
        label: _labelOf(i.kind),
        title: i.title,
        detail: i.subtitle,
        startsAt: i.startsAt,
        endsAt: i.endsAt ?? i.startsAt.add(_defaultDuration),
        allDay: i.kind == AthleteAgendaItemKind.tournament &&
            isAgendaTournamentAllDayStart(i.startsAt),
        color: _colorOf(i.kind),
      ),
  ];
}

/// O JSON que o lado nativo lê (`v` muda se o formato mudar). Sem sessão, sem
/// itens: o widget pede para entrar no app e não mostra agenda de ninguém.
String encodeAgendaWidgetSnapshot({
  required bool signedIn,
  required List<AgendaWidgetEntry> entries,
  required DateTime now,
}) =>
    jsonEncode({
      'v': 1,
      'signedIn': signedIn,
      'generatedAt': now.millisecondsSinceEpoch,
      'items': [
        if (signedIn)
          for (final e in entries) e.toJson(),
      ],
    });
