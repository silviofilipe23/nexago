import '../../athlete_training/domain/athlete_training.dart'
    show trainingWeekdayDay;
import 'class_directory.dart';

/// Aula onde dá para fazer a experimental (`getClassTrialOptions`).
class ClassTrialOption {
  const ClassTrialOption({
    required this.sessionId,
    required this.classId,
    required this.className,
    required this.date,
    required this.startTime,
    this.endTime = '',
    this.level = '',
    this.teacherName = '',
    this.place = '',
    this.spotsLeft = 0,
  });

  factory ClassTrialOption.fromMap(Map<String, Object?> m) {
    String s(String key, [String fallback = '']) {
      final v = m[key];
      return v is String && v.trim().isNotEmpty ? v.trim() : fallback;
    }

    final spots = m['spotsLeft'];
    return ClassTrialOption(
      sessionId: s('sessionId'),
      classId: s('classId'),
      className: s('className', 'Turma'),
      date: s('date'),
      startTime: s('startTime'),
      endTime: s('endTime'),
      level: s('level'),
      teacherName: s('teacherName'),
      place: s('place'),
      spotsLeft: spots is num ? spots.toInt() : 0,
    );
  }

  final String sessionId;
  final String classId;
  final String className;

  /// `YYYY-MM-DD`.
  final String date;
  final String startTime;
  final String endTime;

  /// Código da arena (`iniciante`) ou texto livre do CT.
  final String level;
  final String teacherName;

  /// Quadra (arena) ou local (CT).
  final String place;
  final int spotsLeft;
}

/// Calendário da experimental de um local.
class ClassTrialOptions {
  const ClassTrialOptions({
    required this.bookInApp,
    this.options = const [],
    this.booked,
    this.bookedStatus,
    this.bookingId,
  });

  factory ClassTrialOptions.fromMap(Map<String, Object?> m) {
    ClassTrialOption? one(Object? raw) => raw is Map
        ? ClassTrialOption.fromMap(raw.map((k, v) => MapEntry('$k', v)))
        : null;
    final list = m['options'];
    return ClassTrialOptions(
      bookInApp: m['booking'] == 'app',
      options: list is List
          ? [
              for (final e in list)
                if (one(e) case final o?) o,
            ]
          : const [],
      booked: one(m['booked']),
      bookedStatus:
          m['bookedStatus'] is String ? m['bookedStatus'] as String : null,
      bookingId:
          m['bookingId'] is String && (m['bookingId'] as String).isNotEmpty
              ? m['bookingId'] as String
              : null,
    );
  }

  /// Marca pelo app (o CT confirma depois). `false` = servidor antigo: WhatsApp.
  final bool bookInApp;

  /// Da mais cedo para a mais tarde.
  final List<ClassTrialOption> options;

  /// Experimental já marcada neste local (ainda por acontecer).
  final ClassTrialOption? booked;

  /// `pending` (CT ainda não confirmou) ou `confirmed`.
  final String? bookedStatus;

  /// CT: id do pedido, para desmarcar.
  final String? bookingId;

  /// O centro ainda vai confirmar.
  bool get awaitingConfirmation => bookedStatus == 'pending';
}

/// Dias com aula disponível, na ordem.
List<String> trialDays(List<ClassTrialOption> options) {
  final out = <String>[];
  for (final o in options) {
    if (!out.contains(o.date)) out.add(o.date);
  }
  return out;
}

/// Aulas do dia, pela hora.
List<ClassTrialOption> trialOptionsOn(
  List<ClassTrialOption> options,
  String day,
) =>
    [
      for (final o in options)
        if (o.date == day) o,
    ]..sort((a, b) => a.startTime.compareTo(b.startTime));

/// Primeira aula da turma escolhida no detalhe; sem ela, a primeira de todas.
ClassTrialOption? initialTrialOption(
  List<ClassTrialOption> options,
  String? classId,
) {
  if (options.isEmpty) return null;
  if (classId != null) {
    for (final o in options) {
      if (o.classId == classId) return o;
    }
  }
  return options.first;
}

/// "Qui 23 · 19:00".
String trialOptionWhen(ClassTrialOption o) {
  final day = trainingWeekdayDay(o.date);
  final pretty = day.isEmpty || day == o.date
      ? o.date
      : '${day[0]}${day.substring(1).toLowerCase()}';
  return '$pretty · ${o.startTime}';
}

/// Mensagem do WhatsApp ao CT com a aula escolhida no calendário.
String classTrialContactMessage(ClassProviderDetail d, ClassTrialOption o) {
  final d0 = DateTime.tryParse(o.date);
  final date = d0 == null
      ? o.date
      : '${d0.day.toString().padLeft(2, '0')}/'
          '${d0.month.toString().padLeft(2, '0')}';
  return 'Olá! Vi as aulas de ${d.name} no NexaGO e quero agendar uma aula '
      'experimental na turma ${o.className}, dia $date às ${o.startTime}.';
}
