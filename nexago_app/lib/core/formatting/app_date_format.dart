/// Formatação canônica de **data-calendário** (sem conversão de fuso).
///
/// Use [calendarDateKey] para a chave `YYYY-MM-DD` de uma data já no calendário
/// pretendido — um dia selecionado pelo usuário, a data de uma reserva, um
/// `Timestamp.toDate()` local. Os campos de calendário (`year/month/day`) são
/// usados como estão, sem reinterpretar o [date] como instante.
///
/// Para chaves derivadas de um **instante** de evento/partida (que precisam ser
/// ancoradas no fuso de São Paulo), use `nexagoEventDayKey` em `core/time`.
String calendarDateKey(DateTime date) {
  final y = date.year.toString().padLeft(4, '0');
  final m = date.month.toString().padLeft(2, '0');
  final d = date.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}
