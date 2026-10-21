import 'package:cloud_firestore/cloud_firestore.dart';

import '../../arena/domain/aulas/arena_class_logic.dart'
    show arenaClassWeekdayShort;
import '../../professor_links/domain/arena_professor_link.dart';
import '../../professor_links/domain/professor_link_rules.dart';
import 'professor_actions_logic.dart' show professorAddMinutes;
import 'professor_agenda.dart' show professorParseMinutes;
import 'professor_lessons.dart' show ProfessorCourtBooking;

/// Turma própria do professor independente com horário fixo de quadra (B10).
///
/// `professors/{uid}/ownClasses/{classId}` — só functions escrevem
/// (`functions/src/professor-own-classes.ts`). A quadra é reservada pela
/// máquina de horário fixo da arena (uma série por dia da semana); as
/// ocorrências entram no custo de quadra do professor.

enum ProfessorOwnClassStatus {
  active,
  ended;

  static ProfessorOwnClassStatus parse(Object? raw) =>
      raw == 'ended' ? ended : active;
}

/// Situação da série (horário fixo) de um dia da semana, espelhada pelo
/// gatilho quando a arena cancela, pausa ou retoma (`seriesStatus`).
enum ProfessorOwnClassSeriesStatus {
  active,
  paused,
  canceled;

  static ProfessorOwnClassSeriesStatus parse(Object? raw) => switch (raw) {
        'paused' => paused,
        'canceled' || 'cancelled' => canceled,
        _ => active,
      };
}

/// `professors/{uid}/ownClasses/{classId}`.
class ProfessorOwnClass {
  const ProfessorOwnClass({
    required this.id,
    required this.name,
    required this.arenaId,
    required this.arenaName,
    required this.courtId,
    required this.courtName,
    required this.weekdays,
    required this.startTime,
    required this.endTime,
    required this.capacity,
    required this.monthlyPriceReais,
    this.pricePerOccurrenceReais = 0,
    this.startDate = '',
    this.studentIds = const [],
    this.status = ProfessorOwnClassStatus.active,
    this.endedReason,
    this.createdAt,
    this.seriesStatus = const {},
  });

  factory ProfessorOwnClass.fromMap(String id, Map<String, Object?> map) =>
      ProfessorOwnClass(
        id: id,
        name: _str(map['name'], 'Turma'),
        arenaId: _str(map['arenaId']),
        arenaName: _str(map['arenaName'], 'Arena'),
        courtId: _str(map['courtId']),
        courtName: _str(map['courtName'], 'Quadra'),
        weekdays: _weekdays(map['weekdays']),
        startTime: _str(map['startTime']),
        endTime: _str(map['endTime']),
        capacity: _num(map['capacity'])?.toInt() ?? 0,
        monthlyPriceReais: _num(map['monthlyPriceReais']) ?? 0,
        pricePerOccurrenceReais: _num(map['pricePerOccurrenceReais']) ?? 0,
        startDate: _str(map['startDate']),
        studentIds: [
          if (map['studentIds'] is List)
            for (final s in map['studentIds']! as List)
              if (s is String && s.trim().isNotEmpty) s.trim(),
        ],
        status: ProfessorOwnClassStatus.parse(map['status']),
        endedReason: _strOrNull(map['endedReason']),
        createdAt: _date(map['createdAt']),
        seriesStatus: _seriesStatus(map['seriesStatus']),
      );

  final String id;
  final String name;
  final String arenaId;
  final String arenaName;
  final String courtId;
  final String courtName;

  /// ISO 1 (seg) .. 7 (dom), em ordem.
  final List<int> weekdays;
  final String startTime;
  final String endTime;
  final int capacity;

  /// Mensalidade por aluno — o preço DO PROFESSOR.
  final double monthlyPriceReais;

  /// Preço da quadra por aula (tabela da arena).
  final double pricePerOccurrenceReais;

  /// `YYYY-MM-DD`.
  final String startDate;
  final List<String> studentIds;
  final ProfessorOwnClassStatus status;

  /// `professor_ended`, `link_or_permission` (o agendador encerrou) ou
  /// `arena_canceled` (a arena cancelou todas as séries).
  final String? endedReason;
  final DateTime? createdAt;

  /// Dia da semana (ISO) → situação da série. Dia ausente = ativa.
  final Map<int, ProfessorOwnClassSeriesStatus> seriesStatus;

  bool get isActive => status == ProfessorOwnClassStatus.active;

  ProfessorOwnClassSeriesStatus seriesStatusOf(int weekday) =>
      seriesStatus[weekday] ?? ProfessorOwnClassSeriesStatus.active;
  int get studentCount => studentIds.length;
}

/// Corpo de `previewProfessorOwnClass` / `createProfessorOwnClass`.
class ProfessorOwnClassInput {
  const ProfessorOwnClassInput({
    required this.arenaId,
    required this.courtId,
    required this.name,
    required this.weekdays,
    required this.startTime,
    required this.endTime,
    required this.capacity,
    required this.monthlyPriceReais,
    this.startDate,
  });

  final String arenaId;
  final String courtId;
  final String name;
  final List<int> weekdays;
  final String startTime;
  final String endTime;
  final int capacity;
  final double monthlyPriceReais;
  final String? startDate;

  Map<String, Object?> toPayload() => {
        'arenaId': arenaId,
        'courtId': courtId,
        'name': name.trim(),
        'weekdays': [...weekdays]..sort(),
        'startTime': startTime,
        'endTime': endTime,
        'capacity': capacity,
        'monthlyPriceReais': monthlyPriceReais,
        if (startDate != null) 'startDate': startDate,
      };

  @override
  bool operator ==(Object other) =>
      other is ProfessorOwnClassInput &&
      other.arenaId == arenaId &&
      other.courtId == courtId &&
      other.name.trim() == name.trim() &&
      _sameList(other.weekdays, weekdays) &&
      other.startTime == startTime &&
      other.endTime == endTime &&
      other.capacity == capacity &&
      other.monthlyPriceReais == monthlyPriceReais &&
      other.startDate == startDate;

  @override
  int get hashCode => Object.hash(
        arenaId,
        courtId,
        name.trim(),
        Object.hashAll(weekdays),
        startTime,
        endTime,
        capacity,
        monthlyPriceReais,
        startDate,
      );
}

/// Resposta de `previewProfessorOwnClass`.
class ProfessorOwnClassPreview {
  const ProfessorOwnClassPreview({
    required this.arenaName,
    required this.courtName,
    required this.hourlyReais,
    required this.pricePerOccurrenceReais,
    required this.occurrencesPerMonth,
    required this.courtMonthlyReais,
    required this.revenueFullReais,
    required this.netEstimateReais,
    this.conflicts = const [],
  });

  factory ProfessorOwnClassPreview.fromMap(Map<String, Object?> map) =>
      ProfessorOwnClassPreview(
        arenaName: _str(map['arenaName'], 'Arena'),
        courtName: _str(map['courtName'], 'Quadra'),
        hourlyReais: _num(map['hourlyReais']) ?? 0,
        pricePerOccurrenceReais: _num(map['pricePerOccurrenceReais']) ?? 0,
        occurrencesPerMonth: _num(map['occurrencesPerMonth']) ?? 0,
        courtMonthlyReais: _num(map['courtMonthlyReais']) ?? 0,
        revenueFullReais: _num(map['revenueFullReais']) ?? 0,
        netEstimateReais: _num(map['netEstimateReais']) ?? 0,
        conflicts: [
          if (map['conflicts'] is List)
            for (final d in map['conflicts']! as List)
              if (d is String && d.length >= 10) d.substring(0, 10),
        ]..sort(),
      );

  final String arenaName;
  final String courtName;
  final double hourlyReais;
  final double pricePerOccurrenceReais;

  /// Média (4,33 semanas): pode vir quebrado (8,7).
  final double occurrencesPerMonth;
  final double courtMonthlyReais;
  final double revenueFullReais;
  final double netEstimateReais;

  /// Datas (`YYYY-MM-DD`) já ocupadas ou bloqueadas — não serão reservadas.
  final List<String> conflicts;
}

/// Resposta de `createProfessorOwnClass`.
class ProfessorOwnClassCreated {
  const ProfessorOwnClassCreated({
    required this.classId,
    this.createdDates = const [],
    this.skippedDates = const [],
  });

  factory ProfessorOwnClassCreated.fromMap(Map<String, Object?> map) =>
      ProfessorOwnClassCreated(
        classId: _str(map['classId']),
        createdDates: _strings(map['createdDates']),
        skippedDates: _strings(map['skippedDates']),
      );

  final String classId;
  final List<String> createdDates;
  final List<String> skippedDates;
}

// ── regras da tela ───────────────────────────────────────────────────────

/// Limites do servidor (`parseOwnClassInput`).
const int kProfessorOwnClassMaxCapacity = 30;
const int kProfessorOwnClassMaxMinutes = 240;
const int kProfessorOwnClassNameMax = 60;

/// Arenas onde dá para criar turma própria: vínculo independente ATIVO com
/// "Horário fixo (turma própria)" ligado.
List<ArenaProfessorLink> professorOwnClassArenas(
  List<ArenaProfessorLink> links,
) =>
    [
      for (final l in links)
        if (l.type == ArenaProfessorLinkType.independent &&
            effectiveProfessorPermissions(l).canBookRecurring)
          l,
    ];

/// Vínculos independentes ativos SEM a chave — a tela sugere pedir à arena.
List<ArenaProfessorLink> professorOwnClassLockedArenas(
  List<ArenaProfessorLink> links,
) =>
    [
      for (final l in links)
        if (l.type == ArenaProfessorLinkType.independent &&
            l.status == ArenaProfessorLinkStatus.active &&
            !effectiveProfessorPermissions(l).canBookRecurring)
          l,
    ];

/// "Peça à Arena Norte para liberar horário fixo" (ou "à arena", com várias).
String professorOwnClassLockedHint(List<ArenaProfessorLink> locked) {
  final who = locked.length == 1 ? locked.first.arenaName : 'arena';
  return 'Peça à $who para liberar horário fixo e criar uma turma própria.';
}

/// Inícios oferecidos: de 05:00 a 22:00, de meia em meia hora.
final List<String> kProfessorOwnClassStartTimes = [
  for (var m = 5 * 60; m <= 22 * 60; m += 30) _hhmm(m),
];

/// Fins possíveis para [start]: de 1 h a 4 h depois, de meia em meia hora,
/// sem passar da meia-noite.
List<String> professorOwnClassEndTimes(String start) {
  final from = _minutes(start);
  if (from == null) return const [];
  return [
    for (var d = 60; d <= kProfessorOwnClassMaxMinutes; d += 30)
      if (from + d <= 24 * 60) professorAddMinutes(start, d),
  ];
}

/// O que falta para pedir a prévia; `null` = completo.
String? professorOwnClassBlocker({
  required String? arenaId,
  required String name,
  required List<int> weekdays,
  required String? startTime,
  required String? endTime,
  required int capacity,
  required String? courtId,
  required double? monthlyPriceReais,
  required double minPrice,
  required double maxPrice,
}) {
  if (arenaId == null || arenaId.isEmpty) return 'Escolha a arena.';
  final n = name.trim();
  if (n.isEmpty) return 'Dê um nome à turma.';
  if (n.length > kProfessorOwnClassNameMax) {
    return 'Nome de até $kProfessorOwnClassNameMax caracteres.';
  }
  if (weekdays.isEmpty) return 'Escolha os dias da turma.';
  if (startTime == null || endTime == null) return 'Escolha o horário.';
  final a = _minutes(startTime);
  final b = _minutes(endTime);
  if (a == null ||
      b == null ||
      b <= a ||
      b - a > kProfessorOwnClassMaxMinutes) {
    return 'Horário da turma inválido (até 4 h).';
  }
  if (capacity < 1 || capacity > kProfessorOwnClassMaxCapacity) {
    return 'Vagas de 1 a $kProfessorOwnClassMaxCapacity.';
  }
  if (courtId == null || courtId.isEmpty) return 'Escolha a quadra.';
  final p = monthlyPriceReais;
  if (p == null) return 'Informe a mensalidade por aluno.';
  if (p < minPrice || p > maxPrice) {
    return 'Mensalidade de R\$ ${minPrice.round()} a R\$ ${maxPrice.round()}.';
  }
  return null;
}

/// "8 aulas/mês" / "8,7 aulas/mês".
String professorOwnClassOccurrencesLabel(double n) {
  final text = n == n.roundToDouble()
      ? n.round().toString()
      : n.toStringAsFixed(1).replaceAll('.', ',');
  return '$text aula${n == 1 ? '' : 's'}/mês';
}

/// "dd/MM" de `YYYY-MM-DD`.
String professorOwnClassDayMonth(String dateKey) {
  if (dateKey.length < 10) return dateKey;
  return '${dateKey.substring(8, 10)}/${dateKey.substring(5, 7)}';
}

/// "22/10, 29/10" — em ordem de data.
String professorOwnClassConflictsLabel(List<String> dates) =>
    ([...dates]..sort()).map(professorOwnClassDayMonth).join(', ');

/// "Seg e Qua · 07:00–08:00".
String professorOwnClassScheduleLabel(ProfessorOwnClass c) {
  final days = c.weekdays.map(arenaClassWeekdayShort).toList();
  final when = switch (days.length) {
    0 => '—',
    1 => days.first,
    _ => '${days.sublist(0, days.length - 1).join(', ')} e ${days.last}',
  };
  return '$when · ${c.startTime}–${c.endTime}';
}

/// Ativas primeiro (mais antigas no topo, como o servidor ordena), depois as
/// encerradas.
({List<ProfessorOwnClass> active, List<ProfessorOwnClass> ended})
    professorSplitOwnClasses(List<ProfessorOwnClass> all) => (
          active: [
            for (final c in all)
              if (c.isActive) c,
          ],
          ended: [
            for (final c in all)
              if (!c.isActive) c,
          ],
        );

/// Por que a turma acabou (detalhe da encerrada).
String professorOwnClassEndedLabel(String? reason) => switch (reason) {
      'link_or_permission' =>
        'Encerrada: o vínculo ou o horário fixo deixaram de valer.',
      kProfessorOwnClassArenaCanceled =>
        'A arena cancelou o horário fixo desta turma.',
      _ => 'Turma encerrada. As datas futuras foram liberadas na arena.',
    };

/// `endedReason` quando a arena cancelou todas as séries.
const String kProfessorOwnClassArenaCanceled = 'arena_canceled';

/// "Ter · ativo" / "Ter · pausado pela arena" / "Ter · cancelado pela arena".
String professorOwnClassSeriesLabel(
  int weekday,
  ProfessorOwnClassSeriesStatus status,
) {
  final day = arenaClassWeekdayShort(weekday);
  return switch (status) {
    ProfessorOwnClassSeriesStatus.active => '$day · ativo',
    ProfessorOwnClassSeriesStatus.paused => '$day · pausado pela arena',
    ProfessorOwnClassSeriesStatus.canceled => '$day · cancelado pela arena',
  };
}

/// Selo do cartão da turma ativa quando a arena mexeu em alguma série:
/// "PAUSADA" (nenhum dia ativo) ou "PARCIAL" (só alguns). `null` = tudo
/// ativo, ou turma encerrada (já tem o selo dela).
String? professorOwnClassSeriesTag(ProfessorOwnClass c) {
  if (!c.isActive || c.weekdays.isEmpty) return null;
  final active = c.weekdays
      .where((d) => c.seriesStatusOf(d) == ProfessorOwnClassSeriesStatus.active)
      .length;
  if (active == c.weekdays.length) return null;
  return active == 0 ? 'PAUSADA' : 'PARCIAL';
}

/// A próxima ocorrência da turma (a que ainda não terminou): reservas
/// canceladas ficam de fora. `null` = nenhuma no que foi carregado.
ProfessorCourtBooking? professorOwnClassNextBooking(
  Iterable<ProfessorCourtBooking> bookings, {
  required String classId,
  required String todayKey,
  required int nowMin,
}) {
  ProfessorCourtBooking? best;
  for (final b in bookings) {
    if (b.professorClassId != classId || b.isVoid || b.date.length != 10) {
      continue;
    }
    final cmp = b.date.compareTo(todayKey);
    if (cmp < 0) continue;
    if (cmp == 0) {
      final start = professorParseMinutes(b.startTime) ?? 0;
      final end = professorParseMinutes(b.endTime) ?? start + 60;
      if (end <= nowMin) continue;
    }
    if (best == null ||
        b.date.compareTo(best.date) < 0 ||
        (b.date == best.date && b.startTime.compareTo(best.startTime) < 0)) {
      best = b;
    }
  }
  return best;
}

/// Snackbar do sucesso ao criar.
String professorOwnClassCreatedMessage(ProfessorOwnClassCreated r) {
  final n = r.createdDates.length;
  final base = 'Turma criada · $n aula${n == 1 ? '' : 's'} '
      'reservada${n == 1 ? '' : 's'}';
  final s = r.skippedDates.length;
  if (s == 0) return base;
  return '$base · $s data${s == 1 ? '' : 's'} sem quadra';
}

// ── leitura defensiva ────────────────────────────────────────────────────

String _hhmm(int minutes) => '${(minutes ~/ 60).toString().padLeft(2, '0')}:'
    '${(minutes % 60).toString().padLeft(2, '0')}';

int? _minutes(String time) {
  final m = RegExp(r'^(\d{2}):(\d{2})$').firstMatch(time);
  if (m == null) return null;
  return int.parse(m.group(1)!) * 60 + int.parse(m.group(2)!);
}

bool _sameList(List<int> a, List<int> b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

List<int> _weekdays(Object? v) {
  if (v is! List) return const [];
  final out = <int>{
    for (final d in v)
      if (d is num && d.toInt() >= 1 && d.toInt() <= 7) d.toInt(),
  }.toList()
    ..sort();
  return out;
}

Map<int, ProfessorOwnClassSeriesStatus> _seriesStatus(Object? v) {
  if (v is! Map) return const {};
  return {
    for (final e in v.entries)
      if (int.tryParse('${e.key}') case final d? when d >= 1 && d <= 7)
        d: ProfessorOwnClassSeriesStatus.parse(e.value),
  };
}

List<String> _strings(Object? v) => [
      if (v is List)
        for (final s in v)
          if (s is String && s.isNotEmpty) s,
    ]..sort();

String _str(Object? v, [String fallback = '']) =>
    v is String && v.trim().isNotEmpty ? v.trim() : fallback;

String? _strOrNull(Object? v) =>
    v is String && v.trim().isNotEmpty ? v.trim() : null;

double? _num(Object? v) => v is num ? v.toDouble() : null;

DateTime? _date(Object? v) {
  if (v is Timestamp) return v.toDate();
  if (v is DateTime) return v;
  return null;
}
