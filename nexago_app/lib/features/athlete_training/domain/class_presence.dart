import '../../../core/time/nexago_event_timezone.dart';
import 'athlete_training.dart';

/// Presença do aluno nas aulas da turma (canvas "Atleta — Treinos" T1, T3,
/// T5–T7): "Vou"/"Não vou", crédito de reposição por aviso antecipado,
/// reposição e check-in. Espelha `functions/src/arena-class-athlete-actions.ts`.
///
/// Tudo puro — as telas e os testes usam direto.

/// Antecedência padrão do "Não vou" com crédito (servidor antigo sem o campo).
const int kDefaultMakeupNoticeHours = 4;

/// O check-in abre 60 min antes da aula e vai até o fim dela.
const Duration kCheckInOpensBefore = Duration(minutes: 60);

/// Motivos do "Não vou" (id do servidor → rótulo). O professor vê o rótulo.
const List<(String, String)> kNotGoingReasons = [
  ('work', 'Trabalho'),
  ('health', 'Saúde / lesão'),
  ('travel', 'Viagem'),
  ('other', 'Outro'),
];

enum ClassRsvp { going, notGoing }

/// O que o aluno respondeu pelo app (só aula da arena).
ClassRsvp? trainingRsvp(TrainingSession t) => switch (t.classEntry?.myRsvp) {
      'going' => ClassRsvp.going,
      'not_going' => ClassRsvp.notGoing,
      _ => null,
    };

bool trainingCheckedIn(TrainingSession t) => t.classEntry?.checkedIn ?? false;

/// Aula da arena em que dá para responder "Vou"/"Não vou": marcada, sem
/// check-in e antes de começar. Particular segue o fluxo do professor.
bool trainingCanRespond(TrainingSession t, DateTime now) {
  final e = t.classEntry;
  if (e == null || e.isTeacher || e.status != 'scheduled') return false;
  if (e.checkedIn || t.isCanceled) return false;
  if (e.myMark == 'present' || e.myMark == 'absent') return false;
  return t.startAt.isAfter(now);
}

/// Ainda sem resposta — mostra "Vou" / "Não vou".
bool trainingAwaitsResponse(TrainingSession t, DateTime now) =>
    trainingCanRespond(t, now) && trainingRsvp(t) == null;

int trainingNoticeHours(TrainingSession t) =>
    t.classEntry?.makeupNoticeHours ?? kDefaultMakeupNoticeHours;

/// "Não vou" agora ainda dá crédito? (antecedência da arena)
bool trainingNoticeGivesCredit(TrainingSession t, DateTime now) =>
    t.startAt.difference(now) >= Duration(hours: trainingNoticeHours(t));

/// Janela do check-in: 60 min antes até o fim da aula, sem marca do
/// professor e sem check-in feito.
bool trainingCanCheckIn(TrainingSession t, DateTime now) {
  final e = t.classEntry;
  if (e == null || e.isTeacher || e.status != 'scheduled' || e.checkedIn) {
    return false;
  }
  if (e.myMark == 'present' || e.myMark == 'absent') return false;
  if (now.isBefore(t.startAt.subtract(kCheckInOpensBefore))) return false;
  return !now.isAfter(t.endAt);
}

/// Prefixo do QR de check-in impresso por quadra (`arena-court-checkin-qr.ts`).
/// O resto é um token aleatório que só o servidor conhece.
const String kCourtQrPrefix = 'nexago-checkin:v1:';

/// O QR lido é de check-in do nexaGO? Só filtra QR alheio (cardápio, Pix…)
/// antes de chamar o servidor — quem decide se o token vale é a callable.
bool isCourtCheckinQr(String raw) {
  final text = raw.trim();
  return text.startsWith(kCourtQrPrefix) &&
      text.length > kCourtQrPrefix.length;
}

String notGoingReasonLabel(String id) => kNotGoingReasons
    .firstWhere((r) => r.$1 == id, orElse: () => kNotGoingReasons.last)
    .$2;

/// "Qui 22 · 19:00 · Intermediário B · Arena CFC" (subtítulo da folha).
String trainingSheetSubtitle(TrainingSession t) {
  final day = trainingWeekdayDay(t.dateKey);
  final pretty =
      day.isEmpty ? t.dateKey : '${day[0]}${day.substring(1).toLowerCase()}';
  return [pretty, t.startTime, t.title, t.arenaName]
      .where((s) => s.trim().isNotEmpty)
      .join(' · ');
}

// ── crédito de reposição ─────────────────────────────────────────────────

/// Crédito de reposição disponível (`getMyClassCredits`).
class ClassMakeupCredit {
  const ClassMakeupCredit({
    required this.creditId,
    required this.arenaId,
    required this.arenaName,
    required this.classId,
    required this.className,
    required this.level,
    required this.sourceDate,
    required this.expiresOn,
  });

  factory ClassMakeupCredit.fromMap(Map<String, Object?> map) {
    String s(String key, [String fallback = '']) {
      final v = map[key];
      return v is String && v.trim().isNotEmpty ? v.trim() : fallback;
    }

    return ClassMakeupCredit(
      creditId: s('creditId'),
      arenaId: s('arenaId'),
      arenaName: s('arenaName', 'Arena'),
      classId: s('classId'),
      className: s('className', 'Turma'),
      level: s('level'),
      sourceDate: s('sourceDate'),
      expiresOn: s('expiresOn'),
    );
  }

  final String creditId;
  final String arenaId;
  final String arenaName;
  final String classId;
  final String className;

  /// Nível da turma de origem (`iniciante`, `intermediario`…).
  final String level;
  final String sourceDate;

  /// `YYYY-MM-DD` (inclusivo).
  final String expiresOn;
}

/// Crédito gerado pela falta nesta aula (mesma turma e data), se ainda livre.
ClassMakeupCredit? creditForTraining(
  Iterable<ClassMakeupCredit> credits,
  TrainingSession t,
) {
  final classId = t.classEntry?.classId;
  if (classId == null) return null;
  for (final c in credits) {
    if (c.classId == classId && c.sourceDate == t.dateKey) return c;
  }
  return null;
}

/// Aula onde o crédito pode ser usado (`getMyClassMakeupOptions`).
class ClassMakeupOption {
  const ClassMakeupOption({
    required this.sessionId,
    required this.classId,
    required this.className,
    required this.teacherName,
    required this.courtName,
    required this.date,
    required this.startTime,
    required this.endTime,
    required this.spotsLeft,
    required this.full,
    required this.sameTeacher,
  });

  factory ClassMakeupOption.fromMap(Map<String, Object?> map) {
    String s(String key, [String fallback = '']) {
      final v = map[key];
      return v is String && v.trim().isNotEmpty ? v.trim() : fallback;
    }

    final spots = map['spotsLeft'];
    final left = spots is num ? spots.toInt() : 0;
    return ClassMakeupOption(
      sessionId: s('sessionId'),
      classId: s('classId'),
      className: s('className', 'Turma'),
      teacherName: s('teacherName'),
      courtName: s('courtName'),
      date: s('date'),
      startTime: s('startTime'),
      endTime: s('endTime'),
      spotsLeft: left,
      full: map['full'] == true || left <= 0,
      sameTeacher: map['sameTeacher'] == true,
    );
  }

  final String sessionId;
  final String classId;
  final String className;
  final String teacherName;
  final String courtName;
  final String date;
  final String startTime;
  final String endTime;
  final int spotsLeft;

  /// Lotada: só a fila de espera.
  final bool full;

  /// Mesmo professor da turma de origem do crédito.
  final bool sameTeacher;
}

/// Resposta de `respondArenaClassSession`.
class ClassRsvpResult {
  const ClassRsvpResult({
    required this.credit,
    this.creditId,
    this.expiresOn,
  });

  factory ClassRsvpResult.fromMap(Map<String, Object?> map) {
    final credit = map['credit'];
    final id = map['creditId'];
    final exp = map['expiresOn'];
    return ClassRsvpResult(
      credit: credit is String ? credit : null,
      creditId: id is String && id.isNotEmpty ? id : null,
      expiresOn: exp is String && exp.isNotEmpty ? exp : null,
    );
  }

  /// `granted`, `late`, `limit`, `disabled`, `returned` ou `null`.
  final String? credit;
  final String? creditId;
  final String? expiresOn;

  bool get granted => credit == 'granted' && creditId != null;
}

/// Mensagem depois do "Não vou".
String notGoingResultMessage(ClassRsvpResult r) => switch (r.credit) {
      'granted' => 'Aviso enviado. Você ganhou 1 crédito de reposição.',
      'late' => 'Aviso enviado ao professor. Em cima da hora não gera crédito.',
      'limit' => 'Aviso enviado. Seu plano já usou as reposições deste mês.',
      'returned' => 'Reposição desmarcada. O crédito voltou para você.',
      _ => 'Aviso enviado ao professor.',
    };

const _monthsShort = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', //
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

/// "21 nov" de um `YYYY-MM-DD`.
String classDayMonthLabel(String dateKey) {
  final d = DateTime.tryParse(dateKey);
  if (d == null) return dateKey;
  return '${d.day} ${_monthsShort[d.month - 1]}';
}

/// "Sáb 25 · 08:00" (botão de repor).
String makeupOptionWhen(ClassMakeupOption o) {
  final day = trainingWeekdayDay(o.date);
  final pretty =
      day.isEmpty ? o.date : '${day[0]}${day.substring(1).toLowerCase()}';
  return '$pretty · ${o.startTime}';
}

/// Rótulo do nível da turma ("Intermediário").
String classLevelLabel(String level) => switch (level) {
      'iniciante' => 'Iniciante',
      'intermediario' => 'Intermediário',
      'avancado' => 'Avançado',
      'kids' => 'Kids',
      'livre' => 'Livre',
      _ => '',
    };

/// Minutos até a aula (para "Aula começa em 12 min"); negativo = começou.
int trainingMinutesToStart(TrainingSession t, DateTime now) =>
    t.startAt.difference(now).inMinutes;

/// "18:48" — hora de parede do instante.
String wallClockLabel(DateTime instant) {
  final local = toNexagoEventLocal(instant);
  String two(int v) => v.toString().padLeft(2, '0');
  return '${two(local.hour)}:${two(local.minute)}';
}
