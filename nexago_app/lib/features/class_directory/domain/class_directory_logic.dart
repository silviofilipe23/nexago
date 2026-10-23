import '../../arena/domain/aulas/arena_class.dart';
import 'class_directory.dart';

/// Faixa de horário do filtro (H3). Pelo horário de início da turma.
enum DirectoryPeriod { morning, afternoon, evening, weekend }

extension DirectoryPeriodX on DirectoryPeriod {
  String get label => switch (this) {
        DirectoryPeriod.morning => 'Manhã',
        DirectoryPeriod.afternoon => 'Tarde',
        DirectoryPeriod.evening => 'Noite',
        DirectoryPeriod.weekend => 'Fim de semana',
      };
}

/// Filtros da lista (chips rápidos + sheet H3).
class DirectoryFilters {
  const DirectoryFilters({
    this.kind,
    this.sport,
    this.levels = const {},
    this.maxKm,
    this.periods = const {},
    this.withOpening = false,
    this.freeTrial = false,
  });

  /// `null` = Todos.
  final ClassProviderKind? kind;
  final String? sport;

  /// Códigos de nível da turma (`iniciante`, `intermediario`…).
  final Set<String> levels;
  final double? maxKm;
  final Set<DirectoryPeriod> periods;
  final bool withOpening;

  /// Só quem oferece aula experimental grátis (arena/CT pela vitrine).
  final bool freeTrial;

  /// Quantos filtros do sheet estão ligados (o número no chip "Filtros").
  int get sheetCount =>
      levels.length + periods.length + (maxKm == null ? 0 : 1);

  DirectoryFilters copyWith({
    ClassProviderKind? Function()? kind,
    String? Function()? sport,
    Set<String>? levels,
    double? Function()? maxKm,
    Set<DirectoryPeriod>? periods,
    bool? withOpening,
    bool? freeTrial,
  }) =>
      DirectoryFilters(
        kind: kind == null ? this.kind : kind(),
        sport: sport == null ? this.sport : sport(),
        levels: levels ?? this.levels,
        maxKm: maxKm == null ? this.maxKm : maxKm(),
        periods: periods ?? this.periods,
        withOpening: withOpening ?? this.withOpening,
        freeTrial: freeTrial ?? this.freeTrial,
      );
}

/// Distâncias do filtro, em km (`null` = qualquer).
const List<double?> kDirectoryDistances = [3, 7, 15, null];

/// Níveis do filtro — os da turma da arena (o CT usa texto livre, casado por
/// nome).
const List<ArenaClassLevel> kDirectoryLevels = [
  ArenaClassLevel.iniciante,
  ArenaClassLevel.intermediario,
  ArenaClassLevel.avancado,
  ArenaClassLevel.kids,
];

/// Nível do perfil do atleta (`levelsBySport`) → nível de turma. `null` sem
/// correspondência (ex.: código desconhecido).
String? classLevelForAthlete(String? athleteLevel) {
  final code = athleteLevel?.trim().toLowerCase() ?? '';
  if (code.isEmpty) return null;
  if (code.startsWith('iniciante') || code == 'basico') return 'iniciante';
  if (code.startsWith('intermediario')) return 'intermediario';
  if (code.startsWith('avancado') || code == 'open') return 'avancado';
  return null;
}

/// "Intermediário" para o código da arena; texto livre do CT passa direto.
String directoryLevelLabel(String level) {
  for (final l in ArenaClassLevel.values) {
    if (l.id == level) return l.label;
  }
  return level;
}

String _fold(String s) {
  const from = 'áàâãäéèêëíìîïóòôõöúùûüç';
  const to = 'aaaaaeeeeiiiiooooouuuuc';
  final lower = s.toLowerCase().trim();
  final b = StringBuffer();
  for (final ch in lower.split('')) {
    final i = from.indexOf(ch);
    b.write(i < 0 ? ch : to[i]);
  }
  return b.toString();
}

/// O nível da turma/programa casa com algum dos códigos? O CT grava texto
/// livre ("Avançado", "Intermediário A"), então compara sem acento e pelo
/// começo.
bool directoryLevelMatches(String level, Set<String> codes) {
  if (codes.isEmpty) return true;
  final folded = _fold(level);
  return codes.any((c) => folded == c || folded.startsWith(c));
}

/// Esporte da turma casa com o chip? Compara sem acento (a arena grava o
/// rótulo, o CT às vezes o código).
bool directorySportMatches(List<String> sports, String? sport) {
  if (sport == null || sport.isEmpty) return true;
  final want = _fold(sport);
  return sports.any((s) => _fold(s) == want);
}

/// A turma (pelo início e pelos dias) cai em alguma das faixas?
/// Manhã < 12h, tarde 12–18h, noite ≥ 18h; fim de semana = sáb/dom.
bool directoryTimeInPeriods(
  String startTime,
  List<int> weekdays,
  Set<DirectoryPeriod> periods,
) {
  if (periods.isEmpty) return true;
  final hour = int.tryParse(startTime.split(':').first) ?? -1;
  for (final p in periods) {
    final ok = switch (p) {
      DirectoryPeriod.morning => hour >= 0 && hour < 12,
      DirectoryPeriod.afternoon => hour >= 12 && hour < 18,
      DirectoryPeriod.evening => hour >= 18,
      DirectoryPeriod.weekend => weekdays.any((d) => d >= 6),
    };
    if (ok) return true;
  }
  return false;
}

/// Turmas da grade do local que passam nos filtros de turma (nível, período
/// e vaga).
List<DirectorySlot> directoryMatchingSlots(
  ClassProvider item,
  DirectoryFilters f,
) =>
    [
      for (final s in item.schedule)
        if (directoryLevelMatches(s.level, f.levels) &&
            directoryTimeInPeriods(s.startTime, s.weekdays, f.periods) &&
            (!f.withOpening || s.openSpots > 0))
          s,
    ];

/// Algum filtro que olha a turma está ligado?
bool _filtersClasses(DirectoryFilters f) =>
    f.levels.isNotEmpty || f.periods.isNotEmpty || f.withOpening;

/// Turma que o card mostra: a do servidor (com vaga, do nível do atleta) ou,
/// com filtro de turma ligado, a primeira que passa nele — com vaga antes.
DirectorySlot? directoryCardSlot(ClassProvider item, DirectoryFilters f) {
  if (!_filtersClasses(f)) return item.highlight;
  final slots = directoryMatchingSlots(item, f)
    ..sort((a, b) => (b.openSpots > 0 ? 1 : 0) - (a.openSpots > 0 ? 1 : 0));
  return slots.isEmpty ? null : slots.first;
}

/// Lista H2: aplica os filtros e ordena do mais perto ao mais longe; quem não
/// tem distância (CT, professor sem GPS) vai para o fim, pelo nome.
///
/// Nível e período olham a grade de turmas; o professor não tem grade na
/// vitrine, então esses filtros não o tiram da lista ("Com vaga" sim: só
/// quem publicou horário de particular).
List<ClassProvider> filterDirectory(
  List<ClassProvider> items,
  DirectoryFilters f,
) {
  final out = items.where((i) {
    if (f.kind != null && i.kind != f.kind) return false;
    if (!directorySportMatches(i.sports, f.sport)) return false;
    if (f.maxKm != null && (i.distanceKm == null || i.distanceKm! > f.maxKm!)) {
      return false;
    }
    if (i.kind == ClassProviderKind.professor) {
      // A vitrine do professor não tem experimental: o filtro o tira da lista.
      return !f.freeTrial && (!f.withOpening || i.hasOpening);
    }
    if (f.freeTrial && i.trial?.isFree != true) return false;
    if (_filtersClasses(f) && directoryMatchingSlots(i, f).isEmpty) {
      return false;
    }
    return true;
  }).toList();
  out.sort((a, b) {
    final da = a.distanceKm;
    final db = b.distanceKm;
    if (da != null && db != null) return da.compareTo(db);
    if (da != null) return -1;
    if (db != null) return 1;
    return a.name.toLowerCase().compareTo(b.name.toLowerCase());
  });
  return out;
}

/// Turmas do dia [weekday] (ISO) que passam no filtro de período, por horário.
List<DirectoryClass> directoryClassesOn(
  List<DirectoryClass> classes,
  int weekday,
) =>
    [
      for (final c in classes)
        if (c.weekdays.contains(weekday)) c,
    ]..sort((a, b) => a.startTime.compareTo(b.startTime));

/// Dias da semana com turma (para as abas do detalhe), seg→dom.
List<int> directoryWeekdays(List<DirectoryClass> classes) =>
    {for (final c in classes) ...c.weekdays}.toList()..sort();

/// Dia que a aba abre: hoje, se tiver turma; senão o próximo com turma.
int directoryInitialWeekday(List<int> days, int todayWeekday) {
  if (days.isEmpty) return todayWeekday;
  for (var i = 0; i < 7; i++) {
    final d = (todayWeekday - 1 + i) % 7 + 1;
    if (days.contains(d)) return d;
  }
  return days.first;
}

/// "2 vagas", "1 vaga" ou "Lotada".
String directorySpotsLabel(int spots) => spots <= 0
    ? 'Lotada'
    : spots == 1
        ? '1 vaga'
        : '$spots vagas';

/// "Experimental grátis" / "Experimental R$ 50" — o mesmo texto dos portais.
String directoryTrialLabel(DirectoryTrial t) => t.isFree
    ? 'Experimental grátis'
    : 'Experimental ${directoryPrice(t.priceReais)}';

/// "R$ 220" sem centavos quando inteiro, "R$ 99,90" quando não.
String directoryPrice(double reais) {
  if (reais == reais.roundToDouble()) return 'R\$ ${reais.toInt()}';
  return 'R\$ ${reais.toStringAsFixed(2).replaceAll('.', ',')}';
}

/// "3,1 km" (ou "800 m").
String directoryDistance(double km) {
  if (km < 1) return '${(km * 1000).round()} m';
  return '${km.toStringAsFixed(1).replaceAll('.', ',')} km';
}
