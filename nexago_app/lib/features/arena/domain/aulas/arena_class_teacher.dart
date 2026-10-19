import 'package:cloud_firestore/cloud_firestore.dart';

import 'arena_class_parse.dart';

/// Modelo de repasse do professor (fase 2b). Espelha `PAYOUT_MODELS` em
/// `functions/src/arena-class-payout-model.ts`.
enum ArenaClassPayoutModelKind { revenueShare, perClass, perStudent }

extension ArenaClassPayoutModelKindX on ArenaClassPayoutModelKind {
  String get id => switch (this) {
        ArenaClassPayoutModelKind.revenueShare => 'revenue_share',
        ArenaClassPayoutModelKind.perClass => 'per_class',
        ArenaClassPayoutModelKind.perStudent => 'per_student',
      };

  String get label => switch (this) {
        ArenaClassPayoutModelKind.revenueShare => '% da receita',
        ArenaClassPayoutModelKind.perClass => 'Valor por aula',
        ArenaClassPayoutModelKind.perStudent => 'Valor por aluno presente',
      };

  static ArenaClassPayoutModelKind? fromId(Object? raw) {
    for (final k in ArenaClassPayoutModelKind.values) {
      if (k.id == raw) return k;
    }
    return null;
  }
}

/// `classTeachers.payout`:
/// - `revenueShare`: [percent]% das mensalidades pagas no mês (rateadas
///   pelos horários da matrícula);
/// - `perClass`: [amountReais] por aula dada (chamada fechada);
/// - `perStudent`: [amountReais] por aluno presente.
class ArenaClassTeacherPayoutModel {
  const ArenaClassTeacherPayoutModel({
    required this.kind,
    this.percent,
    this.amountReais,
  });

  final ArenaClassPayoutModelKind kind;
  final double? percent;
  final double? amountReais;

  /// Padrão do cadastro: 50% da receita (como no protótipo e no portal).
  static const ArenaClassTeacherPayoutModel defaults =
      ArenaClassTeacherPayoutModel(
    kind: ArenaClassPayoutModelKind.revenueShare,
    percent: 50,
  );

  /// Ausente ou inválido = sem modelo (o fechamento pede para definir).
  static ArenaClassTeacherPayoutModel? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final kind = ArenaClassPayoutModelKindX.fromId(raw['model']);
    if (kind == null) return null;
    if (kind == ArenaClassPayoutModelKind.revenueShare) {
      final percent = parseDouble(raw['percent'], 0);
      return percent > 0
          ? ArenaClassTeacherPayoutModel(kind: kind, percent: percent)
          : null;
    }
    final amount = parseDouble(raw['amountReais'], 0);
    return amount > 0
        ? ArenaClassTeacherPayoutModel(kind: kind, amountReais: amount)
        : null;
  }

  /// Payload de `upsertArenaClassTeacher` (`payout`).
  Map<String, Object?> toPayload() => {
        'model': kind.id,
        'percent':
            kind == ArenaClassPayoutModelKind.revenueShare ? percent : null,
        'amountReais':
            kind == ArenaClassPayoutModelKind.revenueShare ? null : amountReais,
      };

  @override
  bool operator ==(Object other) =>
      other is ArenaClassTeacherPayoutModel &&
      other.kind == kind &&
      other.percent == percent &&
      other.amountReais == amountReais;

  @override
  int get hashCode => Object.hash(kind, percent, amountReais);
}

/// Professor em `arenas/{arenaId}/classTeachers/{teacherId}`. Cadastro no
/// portal; o app só lê e, para o gestor, troca o modelo de repasse.
class ArenaClassTeacher {
  const ArenaClassTeacher({
    required this.id,
    required this.name,
    required this.color,
    required this.status,
    this.userId,
    this.photoUrl,
    this.specialty,
    this.phone,
    this.payout,
  });

  final String id;

  /// Conta NexaGO do professor (null em cadastro antigo).
  final String? userId;
  final String name;
  final String? photoUrl;
  final String? specialty;
  final String? phone;

  /// `#RRGGBB`.
  final String color;

  /// `active` | `archived`.
  final String status;

  /// null = o gestor ainda não definiu.
  final ArenaClassTeacherPayoutModel? payout;

  bool get isActive => status != 'archived';

  factory ArenaClassTeacher.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) =>
      ArenaClassTeacher.fromMap(doc.id, doc.data() ?? const {});

  factory ArenaClassTeacher.fromMap(String id, Map<String, dynamic> data) {
    return ArenaClassTeacher(
      id: id,
      userId: parseStringOrNull(data['userId']),
      name: parseString(data['name'], 'Professor'),
      photoUrl: parseStringOrNull(data['photoUrl']),
      specialty: parseStringOrNull(data['specialty']),
      phone: parseStringOrNull(data['phone']),
      color: parseString(data['color'], '#FF6A1A'),
      status: data['status'] == 'archived' ? 'archived' : 'active',
      payout: ArenaClassTeacherPayoutModel.fromMap(data['payout']),
    );
  }
}
