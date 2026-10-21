import 'package:cloud_firestore/cloud_firestore.dart';

/// Avaliação do aluno pelo professor (fase 8, canvas A6): uma por aluno por
/// mês, notas 0–10 (meio ponto) por fundamento do esporte, nota geral
/// (média), comentário, até 3 focos e nível sugerido. Só a callable grava
/// (`functions/src/professor-evaluations.ts`).

/// Fundamentos por esporte — as MESMAS chaves de `EVALUATION_FUNDAMENTALS`.
const Map<String, List<(String, String)>> kEvaluationFundamentals = {
  'beachTennis': [
    ('saque', 'Saque'),
    ('forehand', 'Forehand'),
    ('backhand', 'Backhand'),
    ('voleio', 'Voleio'),
    ('smash', 'Smash'),
    ('posicionamento', 'Posicionamento'),
  ],
  'beachVolleyball': [
    ('saque', 'Saque'),
    ('recepcao', 'Recepção'),
    ('levantamento', 'Levantamento'),
    ('ataque', 'Ataque'),
    ('bloqueio', 'Bloqueio'),
    ('defesa', 'Defesa'),
  ],
  'indoorVolleyball': [
    ('saque', 'Saque'),
    ('recepcao', 'Recepção'),
    ('levantamento', 'Levantamento'),
    ('ataque', 'Ataque'),
    ('bloqueio', 'Bloqueio'),
    ('defesa', 'Defesa'),
  ],
  'footvolley': [
    ('saque', 'Saque'),
    ('recepcao', 'Recepção'),
    ('levantamento', 'Levantamento'),
    ('ataque', 'Ataque'),
    ('defesa', 'Defesa'),
    ('posicionamento', 'Posicionamento'),
  ],
  'tennis': [
    ('saque', 'Saque'),
    ('forehand', 'Forehand'),
    ('backhand', 'Backhand'),
    ('voleio', 'Voleio'),
    ('devolucao', 'Devolução'),
    ('posicionamento', 'Posicionamento'),
  ],
  'padel': [
    ('saque', 'Saque'),
    ('forehand', 'Forehand'),
    ('backhand', 'Backhand'),
    ('voleio', 'Voleio'),
    ('bandeja', 'Bandeja'),
    ('posicionamento', 'Posicionamento'),
  ],
  'other': [
    ('tecnica', 'Técnica'),
    ('tatica', 'Tática'),
    ('fisico', 'Físico'),
    ('mental', 'Mental'),
  ],
};

const Map<String, String> kEvaluationSportLabels = {
  'beachTennis': 'Beach tennis',
  'beachVolleyball': 'Vôlei de praia',
  'indoorVolleyball': 'Vôlei de quadra',
  'footvolley': 'Futevôlei',
  'tennis': 'Tênis',
  'padel': 'Padel',
  'other': 'Outro',
};

const String kEvaluationDefaultSport = 'beachTennis';

/// Nível sugerido (`EVALUATION_LEVELS`).
const Map<String, String> kEvaluationLevels = {
  'iniciante': 'Iniciante',
  'intermediario': 'Intermediário',
  'avancado': 'Avançado',
};

const int kEvaluationCommentMax = 1000;
const int kEvaluationFocusMax = 3;
const int kEvaluationFocusLength = 60;

List<(String, String)> evaluationFundamentals(String sport) =>
    kEvaluationFundamentals[sport] ?? kEvaluationFundamentals['other']!;

String evaluationSportLabel(String sport) =>
    kEvaluationSportLabels[sport] ?? 'Outro';

enum ProfessorEvaluationStatus { draft, sent }

/// `professorEvaluations/{professorUid}_{athleteId}_{YYYY-MM}`.
class ProfessorEvaluation {
  const ProfessorEvaluation({
    required this.id,
    required this.professorUid,
    required this.athleteId,
    required this.period,
    required this.sport,
    required this.scores,
    required this.overall,
    required this.status,
    this.professorName = 'Seu professor',
    this.athleteName = 'Aluno',
    this.previousScores,
    this.previousOverall,
    this.comment = '',
    this.focus = const [],
    this.suggestedLevel,
    this.sentAt,
    this.updatedAt,
  });

  factory ProfessorEvaluation.fromMap(String id, Map<String, Object?> map) {
    Map<String, double>? scoresOf(Object? raw) {
      if (raw is! Map) return null;
      return {
        for (final e in raw.entries)
          if (e.value is num) e.key.toString(): (e.value as num).toDouble(),
      };
    }

    final focus = map['focus'];
    final level = map['suggestedLevel'];
    return ProfessorEvaluation(
      id: id,
      professorUid: _str(map['professorUid']),
      professorName: _str(map['professorName'], 'Seu professor'),
      athleteId: _str(map['athleteId']),
      athleteName: _str(map['athleteName'], 'Aluno'),
      period: _str(map['period']),
      sport: _str(map['sport'], kEvaluationDefaultSport),
      scores: scoresOf(map['scores']) ?? const {},
      previousScores: scoresOf(map['previousScores']),
      overall: map['overall'] is num ? (map['overall'] as num).toDouble() : 0,
      previousOverall: map['previousOverall'] is num
          ? (map['previousOverall'] as num).toDouble()
          : null,
      comment: _str(map['comment']),
      focus: focus is List ? focus.whereType<String>().toList() : const [],
      suggestedLevel: level is String && kEvaluationLevels.containsKey(level)
          ? level
          : null,
      status: map['status'] == 'sent'
          ? ProfessorEvaluationStatus.sent
          : ProfessorEvaluationStatus.draft,
      sentAt: _date(map['sentAt']),
      updatedAt: _date(map['updatedAt']),
    );
  }

  final String id;
  final String professorUid;
  final String professorName;
  final String athleteId;
  final String athleteName;

  /// `YYYY-MM`.
  final String period;
  final String sport;
  final Map<String, double> scores;

  /// Do mês anterior ENVIADO (ou `null`).
  final Map<String, double>? previousScores;
  final double overall;
  final double? previousOverall;
  final String comment;
  final List<String> focus;
  final String? suggestedLevel;
  final ProfessorEvaluationStatus status;
  final DateTime? sentAt;
  final DateTime? updatedAt;

  bool get isSent => status == ProfessorEvaluationStatus.sent;

  double? get delta =>
      previousOverall == null ? null : _round1(overall - previousOverall!);
}

/// O que vai para `saveProfessorEvaluation` (o formulário INTEIRO).
class ProfessorEvaluationInput {
  const ProfessorEvaluationInput({
    required this.athleteId,
    required this.period,
    required this.sport,
    required this.scores,
    this.comment = '',
    this.focus = const [],
    this.suggestedLevel,
    this.send = false,
  });

  final String athleteId;
  final String period;
  final String sport;
  final Map<String, double> scores;
  final String comment;
  final List<String> focus;
  final String? suggestedLevel;
  final bool send;

  Map<String, Object?> toPayload() {
    final keys = evaluationFundamentals(sport).map((f) => f.$1);
    final comment = this.comment.trim();
    return {
      'athleteId': athleteId,
      'period': period,
      'sport': sport,
      // Só os fundamentos do esporte, em meio ponto.
      'scores': {for (final k in keys) k: roundHalf(scores[k] ?? 0)},
      'comment': comment.length > kEvaluationCommentMax
          ? comment.substring(0, kEvaluationCommentMax)
          : comment,
      'focus': cleanFocus(focus),
      'suggestedLevel': suggestedLevel,
      'send': send,
    };
  }
}

/// Resposta de `saveProfessorEvaluation`.
typedef ProfessorEvaluationSaved = ({
  String evaluationId,
  ProfessorEvaluationStatus status,
  double overall,
  double? previousOverall,
});

// ── regras ───────────────────────────────────────────────────────────────

/// Meio ponto entre 0 e 10.
double roundHalf(double v) => (v.clamp(0, 10) * 2).round() / 2;

double _round1(double v) => (v * 10).round() / 10;

/// Nota geral = média dos fundamentos do esporte (uma casa).
double evaluationOverall(String sport, Map<String, double> scores) {
  final keys = evaluationFundamentals(sport).map((f) => f.$1).toList();
  if (keys.isEmpty) return 0;
  final sum = keys.fold(0.0, (s, k) => s + roundHalf(scores[k] ?? 0));
  return _round1(sum / keys.length);
}

/// "+0.8" / "−0.3" / "0.0".
String evaluationDeltaLabel(double delta) {
  final d = _round1(delta);
  if (d > 0) return '+${d.toStringAsFixed(1)}';
  if (d < 0) return '−${d.abs().toStringAsFixed(1)}';
  return '0.0';
}

/// "7.2".
String evaluationScoreLabel(double v) => v.toStringAsFixed(1);

/// Focos limpos (até 3, 60 caracteres cada, sem vazios).
List<String> cleanFocus(List<String> focus) => [
      for (final f in focus)
        if (f.trim().isNotEmpty)
          f.trim().length > kEvaluationFocusLength
              ? f.trim().substring(0, kEvaluationFocusLength)
              : f.trim(),
    ].take(kEvaluationFocusMax).toList();

String evaluationId(String professorUid, String athleteId, String period) =>
    '${professorUid}_${athleteId}_$period';

/// `YYYY-MM` de hoje.
String evaluationCurrentPeriod(String todayKey) => todayKey.substring(0, 7);

/// Mês anterior.
String evaluationPreviousPeriod(String period) {
  final y = int.parse(period.substring(0, 4));
  final m = int.parse(period.substring(5, 7));
  return m == 1 ? '${y - 1}-12' : '$y-${(m - 1).toString().padLeft(2, '0')}';
}

/// "Outubro/2026".
String evaluationPeriodLabel(String period) {
  const months = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];
  final m = period.length >= 7 ? int.tryParse(period.substring(5, 7)) : null;
  if (m == null || m < 1 || m > 12) return period;
  return '${months[m - 1]}/${period.substring(0, 4)}';
}

/// Aluno avaliável (turmas liberadas + carteira ativa).
typedef EvaluableStudent = ({String athleteId, String name, String? photoUrl});

/// Alunos sem avaliação ENVIADA no mês (rascunho ainda é pendente).
List<EvaluableStudent> evaluationPending(
  List<EvaluableStudent> students,
  List<ProfessorEvaluation> mine,
  String period,
) {
  final done = {
    for (final e in mine)
      if (e.period == period && e.isSent) e.athleteId,
  };
  return [
    for (final s in students)
      if (!done.contains(s.athleteId)) s,
  ]..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
}

/// Mais recentes primeiro (mês, depois atualização).
List<ProfessorEvaluation> sortEvaluations(List<ProfessorEvaluation> list) =>
    [...list]..sort((a, b) {
        final p = b.period.compareTo(a.period);
        if (p != 0) return p;
        final x = a.updatedAt, y = b.updatedAt;
        if (x == null || y == null) return 0;
        return y.compareTo(x);
      });

/// Última avaliação ENVIADA do aluno (a nota do cabeçalho de B3).
ProfessorEvaluation? latestSentFor(
  List<ProfessorEvaluation> list,
  String athleteId,
) {
  ProfessorEvaluation? best;
  for (final e in list) {
    if (e.athleteId != athleteId || !e.isSent) continue;
    if (best == null || e.period.compareTo(best.period) > 0) best = e;
  }
  return best;
}

/// Avaliação do aluno num mês (rascunho ou enviada).
ProfessorEvaluation? evaluationFor(
  List<ProfessorEvaluation> list,
  String athleteId,
  String period,
) {
  for (final e in list) {
    if (e.athleteId == athleteId && e.period == period) return e;
  }
  return null;
}

/// Notas iniciais do formulário: as da avaliação existente, senão as do mês
/// anterior enviado, senão 5.0 (o servidor exige nota em TODOS os
/// fundamentos, até no rascunho).
Map<String, double> evaluationInitialScores(
  String sport, {
  ProfessorEvaluation? current,
  ProfessorEvaluation? previous,
}) {
  final base = current?.scores ?? previous?.scores ?? const {};
  return {
    for (final f in evaluationFundamentals(sport))
      f.$1: roundHalf(base[f.$1] ?? 5),
  };
}

String _str(Object? v, [String fallback = '']) =>
    v is String && v.trim().isNotEmpty ? v.trim() : fallback;

DateTime? _date(Object? v) => switch (v) {
      Timestamp t => t.toDate(),
      DateTime d => d,
      String s => DateTime.tryParse(s),
      _ => null,
    };
