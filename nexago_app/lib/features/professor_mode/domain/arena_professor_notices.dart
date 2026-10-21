import 'package:cloud_firestore/cloud_firestore.dart';

import 'professor_notices.dart';
import 'professor_students.dart';

/// Comunicados da gestão da arena para os professores (F6). A arena manda
/// (`sendArenaProfessorNotice` em `functions/src/arena-professor-channel.ts`);
/// o professor lê, marca como lido e pode repassar aos alunos DAQUELA arena
/// pelo fluxo normal de comunicado (o editor abre preenchido).

enum ArenaProfessorNoticeKind {
  aviso('Aviso'),
  agenda('Agenda'),
  evento('Evento');

  const ArenaProfessorNoticeKind(this.label);

  final String label;

  static ArenaProfessorNoticeKind parse(Object? raw) {
    for (final k in values) {
      if (k.name == raw) return k;
    }
    return aviso;
  }
}

/// `arenaProfessorNotices/{id}`.
class ArenaProfessorNotice {
  const ArenaProfessorNotice({
    required this.id,
    required this.arenaId,
    required this.arenaName,
    required this.kind,
    required this.title,
    required this.body,
    this.authorUid = '',
    this.authorName = 'Gestão',
    this.recipientIds = const [],
    this.recipientCount = 0,
    this.readCount = 0,
    this.sentAt,
  });

  factory ArenaProfessorNotice.fromMap(String id, Map<String, Object?> map) {
    final recipients = map['recipientIds'];
    return ArenaProfessorNotice(
      id: id,
      arenaId: _str(map['arenaId']),
      arenaName:
          _str(map['arenaName']).isEmpty ? 'Arena' : _str(map['arenaName']),
      kind: ArenaProfessorNoticeKind.parse(map['kind']),
      title: _str(map['title']),
      body: _str(map['body']),
      authorUid: _str(map['authorUid']),
      authorName:
          _str(map['authorName']).isEmpty ? 'Gestão' : _str(map['authorName']),
      recipientIds: recipients is List
          ? recipients.whereType<String>().toList()
          : const [],
      recipientCount: map['recipientCount'] is num
          ? (map['recipientCount'] as num).toInt()
          : 0,
      readCount:
          map['readCount'] is num ? (map['readCount'] as num).toInt() : 0,
      sentAt: _instant(map['sentAt']),
    );
  }

  final String id;
  final String arenaId;
  final String arenaName;
  final ArenaProfessorNoticeKind kind;
  final String title;
  final String body;
  final String authorUid;
  final String authorName;
  final List<String> recipientIds;
  final int recipientCount;
  final int readCount;
  final DateTime? sentAt;
}

/// Mais novos primeiro (a consulta já ordena; o dublê e o cache, não).
List<ArenaProfessorNotice> sortArenaProfessorNotices(
  List<ArenaProfessorNotice> list,
) {
  final epoch = DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
  return [...list]
    ..sort((a, b) => (b.sentAt ?? epoch).compareTo(a.sentAt ?? epoch));
}

/// Turmas do professor naquela arena (as que podem receber o repasse).
List<ProfessorNoticeClass> arenaNoticeClasses(
  List<ProfessorNoticeClass> classes,
  String arenaId,
) =>
    [
      for (final c in classes)
        if (c.arenaId == arenaId) c,
    ];

/// "Seus alunos elegíveis": alunos do professor em turmas daquela arena
/// (um por atleta — quem está em duas turmas conta uma vez).
int arenaNoticeEligibleStudents(
  ProfessorStudentsSnapshot snapshot,
  String arenaId,
) {
  final arena = snapshot.arena(arenaId);
  if (arena == null || !arena.canSeeStudents) return 0;
  final seen = <String>{};
  for (final s in snapshot.students) {
    if (s.arenaId != arenaId || s.classes.isEmpty) continue;
    final id = s.athleteId;
    seen.add(id == null || id.isEmpty ? 's:${s.studentId}' : id);
  }
  return seen.length;
}

/// Rascunho do repasse: mesmo título e texto, para as turmas daquela arena —
/// a carteira independente fica de fora.
ProfessorNoticePrefill arenaNoticeForwardPrefill(
  ArenaProfessorNotice notice,
  List<ProfessorNoticeClass> arenaClasses,
) =>
    ProfessorNoticePrefill(
      title: notice.title.length > kProfessorNoticeTitleMax
          ? notice.title.substring(0, kProfessorNoticeTitleMax)
          : notice.title,
      body: notice.body.length > kProfessorNoticeBodyMax
          ? notice.body.substring(0, kProfessorNoticeBodyMax)
          : notice.body,
      audience: ProfessorNoticeAudience(
        classIds: [for (final c in arenaClasses) c.classId],
      ),
    );

String _str(Object? v) => v is String ? v.trim() : '';

DateTime? _instant(Object? v) => switch (v) {
      Timestamp t => t.toDate().toUtc(),
      DateTime d => d.toUtc(),
      String s => DateTime.tryParse(s)?.toUtc(),
      _ => null,
    };
