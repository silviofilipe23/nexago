import 'package:cloud_firestore/cloud_firestore.dart';

import 'arena_class_parse.dart';
import 'arena_class_teacher.dart';

// Aulas — fase 2b: repasse do professor. Espelha `functions/src/
// arena-class-payout.ts`. A conta do mês é só do servidor
// (`previewArenaClassPayouts`); o app lê a prévia e os fechamentos gravados
// em `arenaClassPayouts` e manda fechar/pagar por callable. Pagamento manual,
// direto da arena ao professor, ou pelo nexaGO (sai do caixa da arena e cai
// no saldo de ganhos do professor — `payArenaClassPayoutViaNexago`).

/// Forma do pagamento ao professor (sem maquininha). Espelha `PAYOUT_METHODS`.
enum ArenaClassPayoutMethod { pix, transfer, cash }

extension ArenaClassPayoutMethodX on ArenaClassPayoutMethod {
  String get id => name;

  String get label => switch (this) {
        ArenaClassPayoutMethod.pix => 'PIX',
        ArenaClassPayoutMethod.transfer => 'Transferência',
        ArenaClassPayoutMethod.cash => 'Dinheiro',
      };

  static ArenaClassPayoutMethod? fromId(Object? raw) {
    for (final m in ArenaClassPayoutMethod.values) {
      if (m.id == raw) return m;
    }
    return null;
  }
}

/// Uma linha da composição: turma recorrente, ou as avulsas do mesmo tipo.
class ArenaClassPayoutLine {
  const ArenaClassPayoutLine({
    required this.key,
    required this.label,
    required this.detail,
    required this.classes,
    required this.presences,
    required this.payingStudents,
    required this.revenueReais,
    required this.amountReais,
  });

  final String key;
  final String label;
  final String detail;
  final int classes;
  final int presences;
  final int payingStudents;
  final double revenueReais;
  final double amountReais;

  static List<ArenaClassPayoutLine> listFrom(Object? raw) {
    if (raw is! List) return const [];
    return [
      for (final l in raw)
        if (l is Map)
          ArenaClassPayoutLine(
            key: parseString(l['key'], ''),
            label: parseString(l['label'], 'Aulas'),
            detail: parseString(l['detail'], ''),
            classes: parseInt(l['classes'], 0),
            presences: parseInt(l['presences'], 0),
            payingStudents: parseInt(l['payingStudents'], 0),
            revenueReais: parseDouble(l['revenueReais'], 0),
            amountReais: parseDouble(l['amountReais'], 0),
          ),
    ];
  }
}

/// Conta do mês de um professor — igual na prévia e no retrato do fechamento.
class ArenaClassPayoutFigures {
  const ArenaClassPayoutFigures({
    required this.teacherId,
    required this.teacherName,
    required this.teacherColor,
    required this.model,
    this.classesGiven = 0,
    this.presences = 0,
    this.students = 0,
    this.pendingSessions = 0,
    this.revenueReais = 0,
    this.amountReais = 0,
    this.lines = const [],
  });

  final String teacherId;
  final String teacherName;
  final String teacherColor;
  final ArenaClassTeacherPayoutModel? model;

  /// Aulas com a chamada fechada.
  final int classesGiven;
  final int presences;

  /// Alunos distintos presentes no mês.
  final int students;

  /// Aulas do mês até hoje com a chamada aberta — não entram no repasse.
  final int pendingSessions;

  /// Mensalidades pagas no mês, rateadas pelos horários (sem taxa de
  /// matrícula).
  final double revenueReais;
  final double amountReais;
  final List<ArenaClassPayoutLine> lines;
}

/// Professor na prévia do mês (`previewArenaClassPayouts`).
class ArenaClassTeacherPayoutPreview extends ArenaClassPayoutFigures {
  const ArenaClassTeacherPayoutPreview({
    required super.teacherId,
    required super.teacherName,
    required super.teacherColor,
    required super.model,
    super.classesGiven,
    super.presences,
    super.students,
    super.pendingSessions,
    super.revenueReais,
    super.amountReais,
    super.lines,
    this.teacherStatus = 'active',
    this.canceledSessions = 0,
  });

  final String teacherStatus;
  final int canceledSessions;

  factory ArenaClassTeacherPayoutPreview.fromMap(Map<Object?, Object?> t) {
    return ArenaClassTeacherPayoutPreview(
      teacherId: parseString(t['teacherId'], ''),
      teacherName: parseString(t['teacherName'], 'Professor'),
      teacherColor: parseString(t['teacherColor'], '#FF6A1A'),
      teacherStatus: parseString(t['teacherStatus'], 'active'),
      model: ArenaClassTeacherPayoutModel.fromMap(t['model']),
      classesGiven: parseInt(t['classesGiven'], 0),
      presences: parseInt(t['presences'], 0),
      students: parseInt(t['students'], 0),
      pendingSessions: parseInt(t['pendingSessions'], 0),
      canceledSessions: parseInt(t['canceledSessions'], 0),
      revenueReais: parseDouble(t['revenueReais'], 0),
      amountReais: parseDouble(t['amountReais'], 0),
      lines: ArenaClassPayoutLine.listFrom(t['lines']),
    );
  }
}

/// Prévia do mês para a arena inteira.
class ArenaClassPayoutPreview {
  const ArenaClassPayoutPreview({
    required this.month,
    this.revenueReais = 0,
    this.feesReais = 0,
    this.unassignedReais = 0,
    this.teachers = const [],
  });

  /// `YYYY-MM`.
  final String month;

  /// Receita de aulas paga no mês, sem taxa de matrícula.
  final double revenueReais;
  final double feesReais;

  /// Receita de matrícula sem horário (não entra em repasse).
  final double unassignedReais;
  final List<ArenaClassTeacherPayoutPreview> teachers;

  ArenaClassTeacherPayoutPreview? teacher(String teacherId) {
    for (final t in teachers) {
      if (t.teacherId == teacherId) return t;
    }
    return null;
  }

  /// Resposta da callable (mapas aninhados chegam como `Map<Object?, Object?>`).
  factory ArenaClassPayoutPreview.fromMap(Map<Object?, Object?> map) {
    final raw = map['teachers'];
    return ArenaClassPayoutPreview(
      month: parseString(map['month'], ''),
      revenueReais: parseDouble(map['revenueReais'], 0),
      feesReais: parseDouble(map['feesReais'], 0),
      unassignedReais: parseDouble(map['unassignedReais'], 0),
      teachers: [
        if (raw is List)
          for (final t in raw)
            if (t is Map) ArenaClassTeacherPayoutPreview.fromMap(t),
      ],
    );
  }
}

/// Fechamento em `arenaClassPayouts/{arena}_{professor}_{AAAA-MM}`. Escrita
/// só pelas functions (gate de gestor); lê quem lê o financeiro.
class ArenaClassPayout extends ArenaClassPayoutFigures {
  const ArenaClassPayout({
    required this.id,
    required this.arenaId,
    required this.month,
    required super.teacherId,
    required super.teacherName,
    required super.teacherColor,
    required super.model,
    super.classesGiven,
    super.presences,
    super.students,
    super.pendingSessions,
    super.revenueReais,
    super.amountReais,
    super.lines,
    this.computedReais = 0,
    this.adjustmentReais = 0,
    this.adjustmentNote,
    this.status = 'closed',
    this.closedAt,
    this.paidOn,
    this.paymentMethod,
    this.teacherUserId,
    this.paidViaNexago = false,
  });

  final String id;
  final String arenaId;

  /// `YYYY-MM`.
  final String month;

  /// Conta do servidor no fechamento, antes do ajuste.
  final double computedReais;

  /// Negativo desconta; diferente de zero sempre vem com [adjustmentNote].
  final double adjustmentReais;
  final String? adjustmentNote;

  /// `closed` (a pagar) | `paid`.
  final String status;
  final DateTime? closedAt;

  /// `YYYY-MM-DD` informado pelo gestor.
  final String? paidOn;
  final ArenaClassPayoutMethod? paymentMethod;

  /// Conta nexaGO do professor (`teacherUserId`): sem ela, só pagamento por
  /// fora. Com ela, a arena pode pagar pelo nexaGO (sai do caixa).
  final String? teacherUserId;

  /// Pago pelo nexaGO (`paymentMethod: nexago`): saiu do caixa e caiu no
  /// saldo de ganhos do professor — não dá para desfazer.
  final bool paidViaNexago;

  bool get isPaid => status == 'paid';

  /// Dá para oferecer "Pagar pelo nexaGO".
  bool get canPayViaNexago =>
      !isPaid && (teacherUserId?.isNotEmpty ?? false) && amountReais > 0;

  factory ArenaClassPayout.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) =>
      ArenaClassPayout.fromMap(doc.id, doc.data() ?? const {});

  factory ArenaClassPayout.fromMap(String id, Map<String, dynamic> d) {
    return ArenaClassPayout(
      id: id,
      arenaId: parseString(d['arenaId'], ''),
      month: parseString(d['month'], ''),
      teacherId: parseString(d['teacherId'], ''),
      teacherName: parseString(d['teacherName'], 'Professor'),
      teacherColor: parseString(d['teacherColor'], '#FF6A1A'),
      model: ArenaClassTeacherPayoutModel.fromMap(d['model']),
      classesGiven: parseInt(d['classesGiven'], 0),
      presences: parseInt(d['presences'], 0),
      students: parseInt(d['students'], 0),
      pendingSessions: parseInt(d['pendingSessions'], 0),
      revenueReais: parseDouble(d['revenueReais'], 0),
      computedReais: parseDouble(d['computedReais'], 0),
      adjustmentReais: parseDouble(d['adjustmentReais'], 0),
      adjustmentNote: parseStringOrNull(d['adjustmentNote']),
      amountReais: parseDouble(d['amountReais'], 0),
      lines: ArenaClassPayoutLine.listFrom(d['lines']),
      status: d['status'] == 'paid' ? 'paid' : 'closed',
      closedAt: parseTimestamp(d['closedAt']),
      paidOn: parseStringOrNull(d['paidOn']),
      paymentMethod: ArenaClassPayoutMethodX.fromId(d['paymentMethod']),
      teacherUserId: parseStringOrNull(d['teacherUserId']),
      paidViaNexago: d['paymentMethod'] == 'nexago',
    );
  }
}
