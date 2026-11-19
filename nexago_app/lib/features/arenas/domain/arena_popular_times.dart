/// "Horários mais movimentados" do perfil da arena: o resumo que a agendada
/// `refreshArenaPopularTimes` grava em `arenaPopularTimes/{arenaId}` — por
/// dia da semana (1 = seg … 7 = dom), 24 valores relativos de 0 a 100 (100 =
/// a hora mais cheia da semana). Sem resumo, ou com pouca amostra
/// (`byWeekday: null`), o bloco não aparece.
class ArenaPopularTimes {
  const ArenaPopularTimes({required this.bookingsCount, this.byWeekday});

  static const int hoursPerDay = 24;

  final int bookingsCount;
  final Map<int, List<int>>? byWeekday;

  /// Valores do dia da semana ISO, ou `null` sem dado para ele.
  List<int>? hoursFor(int weekday) => byWeekday?[weekday];

  factory ArenaPopularTimes.fromMap(Map<String, dynamic> data) {
    final count = data['bookingsCount'];
    final raw = data['byWeekday'];
    Map<int, List<int>>? byWeekday;
    if (raw is Map) {
      byWeekday = {};
      raw.forEach((key, value) {
        final weekday = int.tryParse('$key');
        if (weekday == null || weekday < 1 || weekday > 7) return;
        if (value is! List || value.length != hoursPerDay) return;
        byWeekday![weekday] = List.unmodifiable([
          for (final v in value) v is num ? v.round().clamp(0, 100) : 0,
        ]);
      });
    }
    return ArenaPopularTimes(
      bookingsCount: count is num ? count.toInt() : 0,
      byWeekday: byWeekday == null ? null : Map.unmodifiable(byWeekday),
    );
  }
}

/// A partir de quanto (0–100) a hora conta como cheia.
const int kPopularBusyThreshold = 80;
const int _kPopularMediumThreshold = 50;

/// O que o bloco desenha para um dia: as horas com movimento (sem as vazias
/// das pontas), a frase do pico e, com um horário escolhido, como ele costuma
/// estar.
class PopularDayView {
  const PopularDayView({
    required this.firstHour,
    required this.lastHour,
    required this.values,
    required this.headline,
    this.selectedHour,
    this.selectedLabel,
  });

  final int firstHour;
  final int lastHour;

  /// Um valor por hora, de [firstHour] a [lastHour].
  final List<int> values;
  final String headline;
  final int? selectedHour;
  final String? selectedLabel;
}

/// Monta o bloco do dia da semana [weekday]; `null` quando não há o que
/// mostrar (sem resumo, sem desenho ou dia sem movimento).
PopularDayView? popularDayView(
  ArenaPopularTimes? data, {
  required int weekday,
  int? selectedHour,
}) {
  final hours = data?.hoursFor(weekday);
  if (hours == null) return null;
  final first = hours.indexWhere((v) => v > 0);
  if (first < 0) return null;
  final last = hours.lastIndexWhere((v) => v > 0);

  return PopularDayView(
    firstHour: first,
    lastHour: last,
    values: List.unmodifiable(hours.sublist(first, last + 1)),
    headline: _headline(hours),
    selectedHour: selectedHour,
    selectedLabel: selectedHour == null || selectedHour < 0 || selectedHour > 23
        ? null
        : _selectedLabel(selectedHour, hours[selectedHour]),
  );
}

/// Trecho contínuo em volta da hora mais cheia do dia acima do limite de
/// "cheio". Dia calmo (nenhuma hora chega lá) só diz a hora de mais movimento.
String _headline(List<int> hours) {
  var peak = 0;
  for (var h = 1; h < hours.length; h++) {
    if (hours[h] > hours[peak]) peak = h;
  }
  if (hours[peak] < kPopularBusyThreshold) {
    return 'Mais movimentado por volta das ${peak}h';
  }
  var start = peak;
  var end = peak;
  while (start > 0 && hours[start - 1] >= kPopularBusyThreshold) {
    start--;
  }
  while (end < hours.length - 1 && hours[end + 1] >= kPopularBusyThreshold) {
    end++;
  }
  return 'Costuma lotar das ${start}h às ${end + 1}h';
}

String _selectedLabel(int hour, int value) {
  if (value >= kPopularBusyThreshold) return 'Às ${hour}h costuma estar cheio';
  if (value >= _kPopularMediumThreshold) {
    return 'Às ${hour}h o movimento costuma ser médio';
  }
  if (value > 0) return 'Às ${hour}h costuma estar tranquilo';
  return 'Às ${hour}h costuma estar livre';
}
