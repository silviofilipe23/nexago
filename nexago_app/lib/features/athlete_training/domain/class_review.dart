/// Avaliar aulas (canvas "Treinos v2", A1–A7): espelha `functions/src/class-review.ts`.
///
/// Depois de um treino com presença, o aluno dá estrelas separadas para a
/// AULA, o PROFESSOR e o LOCAL (arena ou centro). Particular só tem professor
/// (a particular não guarda onde aconteceu). Avalia até [kClassReviewWindowDays]
/// dias depois da aula e edita até [kClassReviewEditDays] dias depois do envio.
library;

import 'package:cloud_firestore/cloud_firestore.dart';

import 'athlete_training.dart';

const int kClassReviewWindowDays = 7;
const int kClassReviewEditDays = 7;
const int kClassReviewCommentMax = 600;

/// Parte avaliada — a ordem é a das telas.
enum ReviewPart { lesson, professor, place }

extension ReviewPartX on ReviewPart {
  /// Nome do campo no servidor.
  String get wire => switch (this) {
        ReviewPart.lesson => 'class',
        ReviewPart.professor => 'professor',
        ReviewPart.place => 'place',
      };
}

/// "Ruim" … "Excelente" (índice = estrelas).
const List<String> kReviewStarLabels = [
  '',
  'Ruim',
  'Fraca',
  'Ok',
  'Boa',
  'Excelente',
];

/// Tags do protótipo: (o que se destacou, o que pode melhorar). 1–3
/// estrelas mostram as de melhorar; 4–5, as de destaque.
const Map<ReviewPart, (List<String>, List<String>)> kReviewTags = {
  ReviewPart.professor: (
    [
      'Didática clara',
      'Pontual',
      'Feedback útil',
      'Atenção individual',
      'Motivador',
    ],
    ['Atrasou', 'Pouca atenção', 'Explicação confusa', 'Aula curta'],
  ),
  ReviewPart.lesson: (
    ['Bom ritmo', 'Nível certo', 'Exercícios variados', 'Muito tempo de bola'],
    [
      'Turma cheia',
      'Nível desigual',
      'Pouco tempo de bola',
      'Começou atrasada',
    ],
  ),
  ReviewPart.place: (
    ['Quadra boa', 'Limpo', 'Bom atendimento', 'Fácil de chegar'],
    ['Areia ruim', 'Iluminação', 'Vestiário', 'Atendimento', 'Rede/linhas'],
  ),
};

/// Tags que a nota mostra.
List<String> reviewTagsFor(ReviewPart part, int stars) {
  final (good, bad) = kReviewTags[part]!;
  return stars <= 0 ? const [] : (stars <= 3 ? bad : good);
}

class PartScore {
  const PartScore({this.stars = 0, this.tags = const []});

  factory PartScore.fromMap(Object? raw) {
    if (raw is! Map) return const PartScore();
    final stars = raw['stars'];
    final tags = raw['tags'];
    return PartScore(
      stars: stars is num ? stars.toInt() : 0,
      tags: tags is List ? tags.whereType<String>().toList() : const [],
    );
  }

  final int stars;
  final List<String> tags;

  bool get isSet => stars > 0;
  bool get isLow => stars > 0 && stars <= 2;

  /// Trocar de "bom" (4–5) para "melhorar" (1–3) limpa as tags do outro lado.
  PartScore withStars(int next) => PartScore(
        stars: next,
        tags: (next <= 3) == (stars <= 3) && stars > 0 ? tags : const [],
      );

  PartScore toggle(String tag) => PartScore(
        stars: stars,
        tags: tags.contains(tag)
            ? [
                for (final t in tags)
                  if (t != tag) t,
              ]
            : [...tags, tag],
      );

  Map<String, Object?> toMap() => {'stars': stars, 'tags': tags};
}

/// Chave do treino avaliado — igual a `reviewKey` do servidor.
String classReviewKey(TrainingSession t) => switch (t.origin) {
      TrainingOrigin.arena => 'a_${t.id}',
      TrainingOrigin.center => 'ct_${t.centerId}_${t.id}',
      TrainingOrigin.private => 'p_${t.id}',
    };

/// Partes que a origem avalia.
List<ReviewPart> reviewPartsFor(TrainingOrigin origin) =>
    origin == TrainingOrigin.private
        ? const [ReviewPart.professor]
        : const [ReviewPart.lesson, ReviewPart.professor, ReviewPart.place];

/// Resposta da gestão a um chamado de nota baixa.
class ReviewTicket {
  const ReviewTicket({
    required this.status,
    this.reply,
    this.repliedByName,
    this.repliedAt,
  });

  static ReviewTicket? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final reply = raw['reply'];
    final by = raw['repliedByName'];
    final at = raw['repliedAt'];
    return ReviewTicket(
      status: raw['status'] is String ? raw['status'] as String : 'open',
      reply: reply is String && reply.trim().isNotEmpty ? reply.trim() : null,
      repliedByName: by is String && by.trim().isNotEmpty ? by.trim() : null,
      repliedAt: at is Timestamp ? at.toDate() : null,
    );
  }

  /// `open`, `answered` ou `resolved`.
  final String status;
  final String? reply;
  final String? repliedByName;
  final DateTime? repliedAt;

  bool get isOpen => status == 'open';
}

/// Avaliação enviada (`classReviews/{key}_{uid}`).
class ClassReview {
  const ClassReview({
    required this.id,
    required this.key,
    required this.origin,
    required this.date,
    required this.title,
    required this.professorName,
    required this.placeName,
    required this.scores,
    this.startTime = '',
    this.comment = '',
    this.showName = true,
    this.wantsContact = false,
    this.ticket,
    this.createdAt,
    this.editableUntil,
  });

  factory ClassReview.fromMap(String id, Map<String, Object?> m) {
    final scores = m['scores'] is Map ? m['scores']! as Map : const {};
    DateTime? date(Object? v) => v is Timestamp ? v.toDate() : null;
    String s(Object? v) => v is String ? v.trim() : '';
    final origin = switch (m['origin']) {
      'center' => TrainingOrigin.center,
      'private' => TrainingOrigin.private,
      _ => TrainingOrigin.arena,
    };
    return ClassReview(
      id: id,
      key: s(m['key']),
      origin: origin,
      date: s(m['date']),
      startTime: s(m['startTime']),
      title: s(m['title']),
      professorName: s(m['professorName']),
      placeName: s(m['placeName']),
      scores: {
        for (final p in ReviewPart.values)
          if (scores[p.wire] is Map) p: PartScore.fromMap(scores[p.wire]),
      },
      comment: s(m['comment']),
      showName: m['showName'] != false,
      wantsContact: m['wantsContact'] == true,
      ticket: ReviewTicket.fromMap(m['ticket']),
      createdAt: date(m['createdAt']),
      editableUntil: date(m['editableUntil']),
    );
  }

  final String id;
  final String key;
  final TrainingOrigin origin;

  /// `YYYY-MM-DD`.
  final String date;
  final String startTime;
  final String title;
  final String professorName;
  final String placeName;
  final Map<ReviewPart, PartScore> scores;
  final String comment;
  final bool showName;
  final bool wantsContact;
  final ReviewTicket? ticket;
  final DateTime? createdAt;
  final DateTime? editableUntil;

  bool canEdit(DateTime now) =>
      editableUntil == null || now.isBefore(editableUntil!);
}

/// Treino que ainda dá para avaliar.
class PendingReview {
  const PendingReview({required this.training, required this.expiresAt});

  final TrainingSession training;
  final DateTime expiresAt;

  String get key => classReviewKey(training);
}

/// Contou para avaliar: turma e centro só com presença marcada; particular
/// confirmada que já terminou.
bool reviewableTraining(TrainingSession t) => switch (t.origin) {
      TrainingOrigin.private => t.state == TrainingState.done,
      _ => t.state == TrainingState.present,
    };

/// A7 "Para avaliar": treinos com presença que terminaram há menos de
/// [kClassReviewWindowDays] dias e ainda não foram avaliados — do mais
/// recente ao mais antigo.
List<PendingReview> pendingClassReviews(
  List<TrainingSession> trainings,
  Iterable<ClassReview> reviews,
  DateTime now,
) {
  final done = {for (final r in reviews) r.key};
  final out = <PendingReview>[];
  for (final t in trainings) {
    if (!reviewableTraining(t) || t.endAt.isAfter(now)) continue;
    final expires = t.endAt.add(const Duration(days: kClassReviewWindowDays));
    if (!expires.isAfter(now)) continue;
    if (done.contains(classReviewKey(t))) continue;
    out.add(PendingReview(training: t, expiresAt: expires));
  }
  out.sort((a, b) => b.training.endAt.compareTo(a.training.endAt));
  return out;
}

/// "3 dias", "1 dia", "hoje".
String reviewExpiryLabel(DateTime expiresAt, DateTime now) {
  final days = expiresAt.difference(now).inHours ~/ 24;
  if (days <= 0) return 'hoje';
  return days == 1 ? '1 dia' : '$days dias';
}
