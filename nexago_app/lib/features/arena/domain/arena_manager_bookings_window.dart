import 'arena_date_utils.dart';

/// Intervalo de `dateKey` (inclusivo) da consulta de reservas do gestor.
typedef ArenaBookingsWindow = ({String fromKey, String toKey});

/// Quanto a lista do gestor enxerga para trás (aba Passadas, painel do mês).
const int arenaBookingsDaysBack = 30;

/// Quanto enxerga à frente: cobre os 35 dias de ocorrências do mensalista.
const int arenaBookingsDaysAhead = 60;

/// Folga em volta do dia escolhido na grade quando ele cai fora da janela.
const int _focusMarginDays = 7;

DateTime _addDays(DateTime d, int days) => DateTime(d.year, d.month, d.day + days);

/// Janela das reservas do gestor: de [arenaBookingsDaysBack] dias atrás até
/// [arenaBookingsDaysAhead] à frente de [today], esticada para incluir
/// [focus] (dia escolhido na grade) com uma semana de folga.
///
/// Substitui o `where(arenaId).limit(256)` sem data: a partir de 256 reservas,
/// as de hoje podiam sumir da tela.
ArenaBookingsWindow arenaManagerBookingsWindow(DateTime today, {DateTime? focus}) {
  var from = _addDays(today, -arenaBookingsDaysBack);
  var to = _addDays(today, arenaBookingsDaysAhead);
  if (focus != null) {
    final focusFrom = _addDays(focus, -_focusMarginDays);
    final focusTo = _addDays(focus, _focusMarginDays);
    if (focusFrom.isBefore(from)) from = focusFrom;
    if (focusTo.isAfter(to)) to = focusTo;
  }
  return (fromKey: arenaDateKey(from), toKey: arenaDateKey(to));
}
