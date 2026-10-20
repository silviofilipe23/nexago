import 'package:cloud_firestore/cloud_firestore.dart';

/// Comunicados do professor para os alunos (F1–F5, F7): aviso, enquete,
/// cancelamento ou financeiro; rascunho, agendado ou enviado; leitura e
/// respostas. Escrita só por callable (`functions/src/professor-notices.ts`);
/// o servidor resolve os destinatários no envio — o app só escolhe turmas e a
/// carteira.

enum ProfessorNoticeKind {
  aviso('Aviso'),
  enquete('Enquete'),
  cancelamento('Cancelamento'),
  financeiro('Financeiro');

  const ProfessorNoticeKind(this.label);

  final String label;

  static ProfessorNoticeKind parse(Object? raw) {
    for (final k in values) {
      if (k.name == raw) return k;
    }
    return aviso;
  }
}

enum ProfessorNoticeStatus {
  draft,
  scheduled,
  sent;

  static ProfessorNoticeStatus parse(Object? raw) => switch (raw) {
        'sent' => sent,
        'scheduled' => scheduled,
        _ => draft,
      };
}

/// Limites do servidor (`parseNoticeDraft`).
const int kProfessorNoticeTitleMax = 80;
const int kProfessorNoticeBodyMax = 2000;
const int kProfessorNoticeOptionMax = 40;
const int kProfessorNoticeMinOptions = 2;
const int kProfessorNoticeMaxOptions = 5;
const Duration kProfessorNoticeMaxSchedule = Duration(days: 60);

class ProfessorNoticeAudience {
  const ProfessorNoticeAudience({
    this.classIds = const [],
    this.wallet = false,
  });

  factory ProfessorNoticeAudience.fromMap(Object? raw) {
    if (raw is! Map) return const ProfessorNoticeAudience();
    final ids = raw['classIds'];
    return ProfessorNoticeAudience(
      classIds: ids is List ? ids.whereType<String>().toList() : const [],
      wallet: raw['wallet'] == true,
    );
  }

  final List<String> classIds;
  final bool wallet;

  bool get isEmpty => classIds.isEmpty && !wallet;

  Map<String, Object?> toMap() => {'classIds': classIds, 'wallet': wallet};

  ProfessorNoticeAudience copyWith({
    List<String>? classIds,
    bool? wallet,
  }) =>
      ProfessorNoticeAudience(
        classIds: classIds ?? this.classIds,
        wallet: wallet ?? this.wallet,
      );
}

/// `professorNotices/{id}`.
class ProfessorNotice {
  const ProfessorNotice({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.status,
    this.pollOptions = const [],
    this.audience = const ProfessorNoticeAudience(),
    this.professorName = 'Seu professor',
    this.scheduledAt,
    this.remindAt,
    this.sentAt,
    this.updatedAt,
    this.recipientIds = const [],
    this.recipientCount = 0,
    this.readCount = 0,
    this.answers = const {},
  });

  factory ProfessorNotice.fromMap(String id, Map<String, Object?> map) {
    final answersRaw = map['answers'];
    final answers = <int, int>{};
    if (answersRaw is Map) {
      answersRaw.forEach((k, v) {
        final i = int.tryParse(k.toString());
        if (i != null && v is num) answers[i] = v.toInt();
      });
    }
    final options = map['pollOptions'];
    final recipients = map['recipientIds'];
    final name = map['professorName'];
    return ProfessorNotice(
      id: id,
      kind: ProfessorNoticeKind.parse(map['kind']),
      title: _str(map['title']),
      body: _str(map['body']),
      status: ProfessorNoticeStatus.parse(map['status']),
      pollOptions:
          options is List ? options.whereType<String>().toList() : const [],
      audience: ProfessorNoticeAudience.fromMap(map['audience']),
      professorName:
          name is String && name.trim().isNotEmpty ? name.trim() : 'Seu professor',
      scheduledAt: _instant(map['scheduledAt']),
      remindAt: _instant(map['remindAt']),
      sentAt: _instant(map['sentAt']),
      updatedAt: _instant(map['updatedAt']),
      recipientIds:
          recipients is List ? recipients.whereType<String>().toList() : const [],
      recipientCount: map['recipientCount'] is num
          ? (map['recipientCount'] as num).toInt()
          : 0,
      readCount:
          map['readCount'] is num ? (map['readCount'] as num).toInt() : 0,
      answers: answers,
    );
  }

  final String id;
  final ProfessorNoticeKind kind;
  final String title;
  final String body;
  final ProfessorNoticeStatus status;
  final List<String> pollOptions;
  final ProfessorNoticeAudience audience;
  final String professorName;
  final DateTime? scheduledAt;
  final DateTime? remindAt;
  final DateTime? sentAt;
  final DateTime? updatedAt;
  final List<String> recipientIds;
  final int recipientCount;
  final int readCount;

  /// Respostas por ÍNDICE da opção.
  final Map<int, int> answers;

  bool get isPoll => kind == ProfessorNoticeKind.enquete;

  int answersFor(int optionIndex) => answers[optionIndex] ?? 0;

  /// Quando mostrar na lista: enviado, agendado ou editado.
  DateTime? get when => switch (status) {
        ProfessorNoticeStatus.sent => sentAt ?? updatedAt,
        ProfessorNoticeStatus.scheduled => scheduledAt ?? updatedAt,
        ProfessorNoticeStatus.draft => updatedAt,
      };
}

/// `professorNotices/{id}/recipients/{athleteId}`.
class ProfessorNoticeRecipient {
  const ProfessorNoticeRecipient({
    required this.athleteId,
    this.readAt,
    this.answer,
  });

  factory ProfessorNoticeRecipient.fromMap(
    String id,
    Map<String, Object?> map,
  ) {
    final answer = map['answer'];
    return ProfessorNoticeRecipient(
      athleteId: _str(map['athleteId']).isEmpty ? id : _str(map['athleteId']),
      readAt: _instant(map['readAt']),
      answer: answer is String && answer.trim().isNotEmpty ? answer : null,
    );
  }

  final String athleteId;
  final DateTime? readAt;
  final String? answer;

  bool get read => readAt != null;
}

/// O que vai para `saveProfessorNotice`/`sendProfessorNotice`.
class ProfessorNoticeInput {
  const ProfessorNoticeInput({
    required this.kind,
    required this.title,
    required this.body,
    required this.audience,
    this.noticeId,
    this.pollOptions = const [],
    this.scheduledAt,
    this.remindAt,
  });

  final String? noticeId;
  final ProfessorNoticeKind kind;
  final String title;
  final String body;
  final List<String> pollOptions;
  final ProfessorNoticeAudience audience;

  /// `null` = agora.
  final DateTime? scheduledAt;
  final DateTime? remindAt;

  /// Opções sem vazias nem repetidas (como o servidor guarda).
  List<String> get cleanOptions => kind == ProfessorNoticeKind.enquete
      ? [
          ...{
            for (final o in pollOptions)
              if (o.trim().isNotEmpty) o.trim(),
          },
        ]
      : const [];

  Map<String, Object?> toPayload() => {
        if (noticeId != null) 'noticeId': noticeId,
        'kind': kind.name,
        'title': title.trim(),
        'body': body.trim(),
        'pollOptions': cleanOptions,
        'audience': audience.toMap(),
        if (scheduledAt != null)
          'scheduledAt': scheduledAt!.toUtc().toIso8601String(),
        if (remindAt != null) 'remindAt': remindAt!.toUtc().toIso8601String(),
      };
}

/// Erro do conteúdo (título, mensagem, enquete) com as mensagens do servidor.
String? validateProfessorNoticeContent(ProfessorNoticeInput i) {
  final title = i.title.trim();
  if (title.isEmpty || title.length > kProfessorNoticeTitleMax) {
    return 'Dê um título (até $kProfessorNoticeTitleMax caracteres).';
  }
  final body = i.body.trim();
  if (body.isEmpty || body.length > kProfessorNoticeBodyMax) {
    return 'Escreva a mensagem (até $kProfessorNoticeBodyMax caracteres).';
  }
  if (i.kind == ProfessorNoticeKind.enquete) {
    final options = i.cleanOptions;
    if (options.length < kProfessorNoticeMinOptions) {
      return 'A enquete precisa de pelo menos 2 opções.';
    }
    if (options.any((o) => o.length > kProfessorNoticeOptionMax)) {
      return 'Cada opção tem até $kProfessorNoticeOptionMax caracteres.';
    }
  }
  return null;
}

/// Erro do envio (destinatários e horários), além do conteúdo.
String? validateProfessorNoticeSend(ProfessorNoticeInput i, DateTime now) {
  final content = validateProfessorNoticeContent(i);
  if (content != null) return content;
  if (i.audience.isEmpty) return 'Escolha para quem enviar.';
  final at = i.scheduledAt;
  if (at != null) {
    if (at.isBefore(now)) return 'O agendamento não pode estar no passado.';
    if (at.isAfter(now.add(kProfessorNoticeMaxSchedule))) {
      return 'Agende para no máximo 60 dias.';
    }
  }
  final remind = i.remindAt;
  if (remind != null && !remind.isAfter(at ?? now)) {
    return 'O lembrete tem de ser depois do envio.';
  }
  return null;
}

// ── lista (F1) ───────────────────────────────────────────────────────────

/// Os da aba (enviados, agendados ou rascunhos), o mais relevante primeiro:
/// enviados do mais novo, agendados do mais próximo, rascunhos do editado
/// por último.
List<ProfessorNotice> professorNoticesOf(
  List<ProfessorNotice> all,
  ProfessorNoticeStatus status,
) {
  final out = [
    for (final n in all)
      if (n.status == status) n,
  ];
  final epoch = DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
  out.sort((a, b) {
    final x = a.when ?? epoch, y = b.when ?? epoch;
    return status == ProfessorNoticeStatus.scheduled
        ? x.compareTo(y)
        : y.compareTo(x);
  });
  return out;
}

/// Turma do professor para "Para quem" (F3).
typedef ProfessorNoticeClass = ({
  String classId,
  String name,
  String arenaId,
  String arenaName,
  int students,
});

/// "Todos os alunos" / "Carteira" / "Iniciante A, Avançado" / "3 turmas +
/// carteira".
String professorNoticeAudienceLabel(
  ProfessorNoticeAudience a,
  List<ProfessorNoticeClass> classes, {
  bool hasWallet = false,
}) {
  if (a.isEmpty) return 'Ninguém escolhido';
  final all = classes.isNotEmpty &&
      classes.every((c) => a.classIds.contains(c.classId)) &&
      (a.wallet || !hasWallet);
  if (all) return 'Todos os alunos';
  final names = [
    for (final c in classes)
      if (a.classIds.contains(c.classId)) c.name,
  ];
  final n = a.classIds.length;
  return [
    if (n > 0)
      if (names.length == n && n <= 2)
        ...names
      else
        '$n turma${n == 1 ? '' : 's'}',
    if (a.wallet) 'Carteira',
  ].join(', ');
}

// ── relatório (F5) ───────────────────────────────────────────────────────

enum ProfessorNoticeReply { answered, readOnly, unread }

class ProfessorNoticeRow {
  const ProfessorNoticeRow({
    required this.athleteId,
    required this.reply,
    this.answer,
  });

  final String athleteId;
  final ProfessorNoticeReply reply;
  final String? answer;
}

/// Uma linha por destinatário, com a resposta (enquete), "leu" ou "não leu".
List<ProfessorNoticeRow> professorNoticeRows(
  ProfessorNotice n,
  List<ProfessorNoticeRecipient> recipients,
) {
  final byId = {for (final r in recipients) r.athleteId: r};
  return [
    for (final id in n.recipientIds)
      () {
        final r = byId[id];
        if (r?.answer != null && n.isPoll) {
          return ProfessorNoticeRow(
            athleteId: id,
            reply: ProfessorNoticeReply.answered,
            answer: r!.answer,
          );
        }
        return ProfessorNoticeRow(
          athleteId: id,
          reply: (r?.read ?? false)
              ? ProfessorNoticeReply.readOnly
              : ProfessorNoticeReply.unread,
        );
      }(),
  ];
}

/// Quem o "Lembrar" alcança: enquete = sem resposta; aviso = não leu (a
/// mesma régua do servidor).
int professorNoticePending(ProfessorNotice n, List<ProfessorNoticeRow> rows) =>
    rows
        .where((r) => n.isPoll
            ? r.reply != ProfessorNoticeReply.answered
            : r.reply == ProfessorNoticeReply.unread)
        .length;

/// Filtro do relatório: todos, uma opção, leu sem responder, não leu.
sealed class ProfessorNoticeFilter {
  const ProfessorNoticeFilter();
}

class ProfessorNoticeFilterAll extends ProfessorNoticeFilter {
  const ProfessorNoticeFilterAll();
}

class ProfessorNoticeFilterOption extends ProfessorNoticeFilter {
  const ProfessorNoticeFilterOption(this.option);

  final String option;

  @override
  bool operator ==(Object other) =>
      other is ProfessorNoticeFilterOption && other.option == option;

  @override
  int get hashCode => option.hashCode;
}

class ProfessorNoticeFilterReply extends ProfessorNoticeFilter {
  const ProfessorNoticeFilterReply(this.reply);

  final ProfessorNoticeReply reply;

  @override
  bool operator ==(Object other) =>
      other is ProfessorNoticeFilterReply && other.reply == reply;

  @override
  int get hashCode => reply.hashCode;
}

List<ProfessorNoticeRow> professorNoticeFilter(
  List<ProfessorNoticeRow> rows,
  ProfessorNoticeFilter f,
) =>
    switch (f) {
      ProfessorNoticeFilterAll() => rows,
      ProfessorNoticeFilterOption(:final option) =>
        rows.where((r) => r.answer == option).toList(),
      ProfessorNoticeFilterReply(:final reply) =>
        rows.where((r) => r.reply == reply).toList(),
    };

String _str(Object? v) => v is String ? v.trim() : '';

DateTime? _instant(Object? v) => switch (v) {
      Timestamp t => t.toDate().toUtc(),
      DateTime d => d.toUtc(),
      String s => DateTime.tryParse(s)?.toUtc(),
      _ => null,
    };
