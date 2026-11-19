import 'package:intl/intl.dart';

import 'athlete_agenda_logic.dart';
import 'athlete_agenda_models.dart';

/// Lista contínua da Agenda (modelo A da análise de UI/UX): "Próximos" abre
/// no agora com um bloco por dia que tem compromisso; "Histórico" agrupa o
/// que passou por mês. Dia sem compromisso não aparece.

/// Um bloco da lista: um dia (Próximos) ou um mês (Histórico, [day] no dia 1).
class AgendaListSection {
  const AgendaListSection({
    required this.day,
    required this.title,
    required this.subtitle,
    required this.items,
  });

  final DateTime day;
  final String title;
  final String subtitle;
  final List<AthleteAgendaItem> items;
}

/// Próximos: o que ainda não acabou e tudo de hoje (o jogo das 10h que já
/// passou continua em "Hoje" com o pós-jogo à mão). Reserva cancelada fica de
/// fora.
List<AthleteAgendaItem> agendaUpcomingScope(
  List<AthleteAgendaItem> items, {
  required DateTime now,
}) =>
    [
      for (final i in items)
        if (!i.isCanceled &&
            (!isAgendaItemPast(i, now: now) || agendaItemOccursOn(i, now)))
          i,
    ];

/// Histórico: o que já passou antes de hoje, cancelado incluído. O que acabou
/// hoje segue em Próximos, para não aparecer nas duas abas.
List<AthleteAgendaItem> agendaHistoryScope(
  List<AthleteAgendaItem> items, {
  required DateTime now,
}) =>
    [
      for (final i in items)
        if (isAgendaItemPast(i, now: now) &&
            (i.isCanceled || !agendaItemOccursOn(i, now)))
          i,
    ];

/// Blocos de Próximos, em ordem do relógio. Torneio que começou antes de hoje
/// e continua rolando entra em "Hoje".
List<AgendaListSection> buildUpcomingAgendaSections(
  List<AthleteAgendaItem> items, {
  required DateTime now,
}) {
  final today = dateOnly(now);
  final byDay = <DateTime, List<AthleteAgendaItem>>{};
  for (final item in agendaUpcomingScope(items, now: now)) {
    final start = dateOnly(item.startsAt);
    final day = start.isBefore(today) ? today : start;
    byDay.putIfAbsent(day, () => []).add(item);
  }
  final days = byDay.keys.toList()..sort();
  return [
    for (final day in days)
      _section(
        day: day,
        title: formatSectionTitle(day, now: now),
        items: byDay[day]!..sort((a, b) => a.startsAt.compareTo(b.startsAt)),
        subtitleOf: (list) => formatSectionSubtitle(list, now: now),
      ),
  ];
}

/// Blocos do Histórico: um por mês, do mais recente para o mais antigo.
List<AgendaListSection> buildHistoryAgendaSections(
  List<AthleteAgendaItem> items, {
  required DateTime now,
}) {
  final byMonth = <DateTime, List<AthleteAgendaItem>>{};
  for (final item in agendaHistoryScope(items, now: now)) {
    byMonth.putIfAbsent(startOfMonth(item.startsAt), () => []).add(item);
  }
  final months = byMonth.keys.toList()..sort((a, b) => b.compareTo(a));
  return [
    for (final month in months)
      _section(
        day: month,
        title: formatHistoryMonthTitle(month),
        items: byMonth[month]!
          ..sort((a, b) => b.startsAt.compareTo(a.startsAt)),
        subtitleOf: formatHistoryMonthSubtitle,
      ),
  ];
}

AgendaListSection _section({
  required DateTime day,
  required String title,
  required List<AthleteAgendaItem> items,
  required String Function(List<AthleteAgendaItem>) subtitleOf,
}) =>
    AgendaListSection(
      day: day,
      title: title,
      subtitle: subtitleOf(items),
      items: List.unmodifiable(items),
    );

final _historyMonthFmt = DateFormat("MMMM 'de' y", 'pt_BR');

/// "Novembro de 2026".
String formatHistoryMonthTitle(DateTime month) {
  final raw = _historyMonthFmt.format(startOfMonth(month));
  return raw.isEmpty ? raw : '${raw[0].toUpperCase()}${raw.substring(1)}';
}

/// "3 jogos", "1 jogo · 1 cancelada".
String formatHistoryMonthSubtitle(List<AthleteAgendaItem> items) {
  final canceled = items.where((i) => i.isCanceled).length;
  final played = items.length - canceled;
  return [
    if (played > 0) played == 1 ? '1 jogo' : '$played jogos',
    if (canceled > 0) canceled == 1 ? '1 cancelada' : '$canceled canceladas',
  ].join(' · ');
}

/// Para onde o seletor de data leva: a aba e o bloco ([sectionDay] `null`
/// quando não há nada a mostrar). [exact] é falso quando o dia escolhido não
/// tem compromisso e a lista cai no bloco mais perto.
class AgendaJumpTarget {
  const AgendaJumpTarget({
    required this.tab,
    required this.sectionDay,
    required this.exact,
  });

  final AthleteAgendaTimeTab tab;
  final DateTime? sectionDay;
  final bool exact;
}

/// Dia de hoje em diante: o bloco desse dia ou o próximo com compromisso.
/// Dia que já passou: o mês dele no Histórico, ou o mês anterior mais perto.
AgendaJumpTarget agendaJumpTarget(
  DateTime day, {
  required List<AgendaListSection> upcoming,
  required List<AgendaListSection> history,
  required DateTime now,
}) {
  final target = dateOnly(day);
  if (!target.isBefore(dateOnly(now))) {
    for (final s in upcoming) {
      if (!s.day.isBefore(target)) {
        return AgendaJumpTarget(
          tab: AthleteAgendaTimeTab.upcoming,
          sectionDay: s.day,
          exact: s.day == target,
        );
      }
    }
    return const AgendaJumpTarget(
      tab: AthleteAgendaTimeTab.upcoming,
      sectionDay: null,
      exact: false,
    );
  }
  final month = startOfMonth(target);
  for (final s in history) {
    if (!s.day.isAfter(month)) {
      final exact =
          s.day == month && s.items.any((i) => agendaItemOccursOn(i, target));
      return AgendaJumpTarget(
        tab: AthleteAgendaTimeTab.past,
        sectionDay: s.day,
        exact: exact,
      );
    }
  }
  return const AgendaJumpTarget(
    tab: AthleteAgendaTimeTab.past,
    sectionDay: null,
    exact: false,
  );
}
