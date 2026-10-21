import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../arena/domain/payout_pix_key_type.dart';
import 'professor_wallet_logic.dart' show professorMonthName;

/// Ganhos do professor da EQUIPE da arena (fase 6): o repasse que a arena
/// paga "pelo nexaGO" cai num saldo nosso e o professor saca por PIX
/// (`functions/src/professor-earnings.ts`). A carteira do independente NÃO
/// entra aqui — o dinheiro dela vai direto para a conta Asaas dele.

/// Saque automático até este valor; acima, aguarda aprovação
/// (`ARENA_WITHDRAWAL_AUTO_MAX_REAIS`).
const double kProfessorWithdrawalAutoMaxReais = 500;
const double kProfessorWithdrawalMinReais = 1;

/// `professorEarningsWallets/{uid}`.
class ProfessorEarningsWallet {
  const ProfessorEarningsWallet({
    this.availableReais = 0,
    this.pendingReais = 0,
    this.exists = false,
  });

  factory ProfessorEarningsWallet.fromMap(Map<String, Object?>? map) =>
      ProfessorEarningsWallet(
        availableReais: _num(map?['availableReais']) ?? 0,
        pendingReais: _num(map?['pendingReais']) ?? 0,
        exists: map != null,
      );

  /// Sacável.
  final double availableReais;

  /// Reservado por saque em andamento.
  final double pendingReais;
  final bool exists;
}

/// `professorEarningsWallets/{uid}/ledger` — de onde veio o saldo.
class ProfessorEarningsEntry {
  const ProfessorEarningsEntry({
    required this.id,
    required this.amountReais,
    this.type = 'repasse',
    this.arenaName = 'Arena',
    this.month = '',
    this.payoutId,
    this.createdAt,
  });

  factory ProfessorEarningsEntry.fromMap(String id, Map<String, Object?> map) =>
      ProfessorEarningsEntry(
        id: id,
        type: _str(map['type'], 'repasse'),
        arenaName: _str(map['arenaName'], 'Arena'),
        month: _str(map['month']),
        payoutId: _strOrNull(map['payoutId']),
        amountReais: _num(map['amountReais']) ?? 0,
        createdAt: _date(map['createdAt']),
      );

  final String id;
  final String type;
  final String arenaName;

  /// `YYYY-MM`.
  final String month;
  final String? payoutId;
  final double amountReais;
  final DateTime? createdAt;
}

/// Repasse fechado que a arena ainda não pagou ("em liberação").
class ProfessorPendingPayout {
  const ProfessorPendingPayout({
    required this.payoutId,
    required this.arenaName,
    required this.month,
    required this.amountReais,
    this.arenaId = '',
    this.closedAt,
  });

  factory ProfessorPendingPayout.fromMap(Map<String, Object?> map) =>
      ProfessorPendingPayout(
        payoutId: _str(map['payoutId']),
        arenaId: _str(map['arenaId']),
        arenaName: _str(map['arenaName'], 'Arena'),
        month: _str(map['month']),
        amountReais: _num(map['amountReais']) ?? 0,
        closedAt: _date(map['closedAt']),
      );

  final String payoutId;
  final String arenaId;
  final String arenaName;
  final String month;
  final double amountReais;
  final DateTime? closedAt;
}

/// Situação do saque na tela (C8).
enum ProfessorWithdrawalStanding {
  done('Concluído'),
  sending('Enviando'),
  awaitingApproval('Aguardando aprovação'),
  review('Em revisão'),
  failed('Falhou — devolvido ao saldo'),
  manual('Manual');

  const ProfessorWithdrawalStanding(this.label);

  final String label;
}

/// `professorWithdrawals/{id}`.
class ProfessorWithdrawal {
  const ProfessorWithdrawal({
    required this.id,
    required this.amountReais,
    required this.status,
    this.netReais,
    this.feeReais = 0,
    this.pixKey = '',
    this.pixKeyType,
    this.payoutStatus,
    this.processingMode,
    this.payoutError,
    this.createdAt,
  });

  factory ProfessorWithdrawal.fromMap(String id, Map<String, Object?> map) =>
      ProfessorWithdrawal(
        id: id,
        amountReais: _num(map['amountReais']) ?? 0,
        netReais: _num(map['netReais']),
        feeReais: _num(map['feeReais']) ?? 0,
        pixKey: _str(map['pixKey']),
        pixKeyType: _strOrNull(map['pixKeyType']),
        status: _str(map['status'], 'pending').toLowerCase(),
        payoutStatus: _strOrNull(map['payoutStatus'])?.toLowerCase(),
        processingMode: _strOrNull(map['processingMode']),
        payoutError: _strOrNull(map['payoutError']),
        createdAt: _date(map['createdAt']),
      );

  final String id;
  final double amountReais;
  final double? netReais;
  final double feeReais;
  final String pixKey;
  final String? pixKeyType;

  /// `pending` | `approved` | `rejected`.
  final String status;

  /// `pending` | `sent` | `paid` | `failed` | `manual`.
  final String? payoutStatus;

  /// `auto` | `manual_review`.
  final String? processingMode;
  final String? payoutError;
  final DateTime? createdAt;

  /// Em andamento: o servidor aceita um saque por vez.
  bool get inProgress => status == 'pending';

  ProfessorWithdrawalStanding get standing {
    if (status == 'rejected') return ProfessorWithdrawalStanding.failed;
    switch (payoutStatus) {
      case 'paid':
        return ProfessorWithdrawalStanding.done;
      case 'manual':
        return ProfessorWithdrawalStanding.manual;
      case 'failed':
        return ProfessorWithdrawalStanding.review;
      case 'sent':
        return ProfessorWithdrawalStanding.sending;
    }
    if (status == 'approved') return ProfessorWithdrawalStanding.sending;
    return processingMode == 'manual_review'
        ? ProfessorWithdrawalStanding.awaitingApproval
        : ProfessorWithdrawalStanding.sending;
  }
}

/// Chave PIX de recebimento (`organizerPayoutProfiles/{uid}`) — a mesma do
/// perfil de organizador: o perfil de recebimento é da pessoa.
class ProfessorPayoutPixKey {
  const ProfessorPayoutPixKey({required this.pixKey, this.pixKeyType});

  static ProfessorPayoutPixKey? fromMap(Map<String, Object?>? map) {
    final key = _str(map?['payoutPixKey']);
    if (key.isEmpty) return null;
    return ProfessorPayoutPixKey(
      pixKey: key,
      pixKeyType: _strOrNull(map?['payoutPixKeyType']),
    );
  }

  final String pixKey;
  final String? pixKeyType;

  PayoutPixKeyType get type =>
      PayoutPixKeyType.initial(storedType: pixKeyType, pixKey: pixKey);
}

/// Resposta de `requestProfessorWithdrawal`.
class ProfessorWithdrawalResult {
  const ProfessorWithdrawalResult({
    required this.withdrawalId,
    required this.status,
    required this.payoutStatus,
    required this.autoProcessed,
    this.processingMode,
    this.message,
  });

  factory ProfessorWithdrawalResult.fromMap(Map<String, Object?> map) =>
      ProfessorWithdrawalResult(
        withdrawalId: _str(map['withdrawalId']),
        status: _str(map['status'], 'pending'),
        payoutStatus: _str(map['payoutStatus'], 'pending'),
        autoProcessed: map['autoProcessed'] == true,
        processingMode: _strOrNull(map['processingMode']),
        message: _strOrNull(map['message']),
      );

  final String withdrawalId;
  final String status;
  final String payoutStatus;
  final bool autoProcessed;
  final String? processingMode;
  final String? message;

  /// PIX enviado agora (C6 "Saque enviado"); senão ficou pendente.
  bool get sent =>
      autoProcessed && status == 'approved' && payoutStatus != 'failed';
}

// ── regras da tela ───────────────────────────────────────────────────────

/// Erro do valor do saque (ou `null`).
String? validateProfessorWithdrawal(double? amount, double available) {
  if (amount == null || amount < kProfessorWithdrawalMinReais) {
    return 'Saque mínimo de ${formatBRL(kProfessorWithdrawalMinReais)}.';
  }
  if (amount > available + 0.001) return 'Saldo insuficiente para este saque.';
  return null;
}

/// "Na hora" até R$ 500; acima, depois da aprovação da plataforma.
String professorWithdrawalDeadline(double amount) =>
    amount <= kProfessorWithdrawalAutoMaxReais ? 'Na hora' : 'Após aprovação';

/// Chave mascarada: "CPF ···.482.331-··", "E-mail ma···@gmail.com".
String professorMaskedPixKey(String key, PayoutPixKeyType type) {
  final k = key.trim();
  switch (type) {
    case PayoutPixKeyType.cpf:
      final d = k.replaceAll(RegExp(r'\D'), '');
      if (d.length != 11) return 'CPF $k';
      return 'CPF ···.${d.substring(3, 6)}.${d.substring(6, 9)}-··';
    case PayoutPixKeyType.cnpj:
      final d = k.replaceAll(RegExp(r'\D'), '');
      if (d.length != 14) return 'CNPJ $k';
      return 'CNPJ ··.${d.substring(2, 5)}.${d.substring(5, 8)}/····-··';
    case PayoutPixKeyType.email:
      final at = k.indexOf('@');
      if (at < 2) return 'E-mail $k';
      return 'E-mail ${k.substring(0, 2)}···${k.substring(at)}';
    case PayoutPixKeyType.phone:
      final d = k.replaceAll(RegExp(r'\D'), '');
      if (d.length < 4) return 'Celular $k';
      return 'Celular ···${d.substring(d.length - 4)}';
    case PayoutPixKeyType.evp:
      return 'Aleatória ${k.length > 8 ? '${k.substring(0, 8)}···' : k}';
  }
}

/// "Outubro/2026" de `YYYY-MM`.
String professorEarningsMonthLabel(String month) {
  if (month.length < 7) return month;
  final name = professorMonthName(month);
  return '${name[0].toUpperCase()}${name.substring(1)}/${month.substring(0, 4)}';
}

/// Sacado (concluído ou manual) no ano.
double professorWithdrawnInYear(List<ProfessorWithdrawal> list, int year) =>
    list
        .where((w) =>
            w.createdAt?.year == year &&
            (w.standing == ProfessorWithdrawalStanding.done ||
                w.standing == ProfessorWithdrawalStanding.manual ||
                w.standing == ProfessorWithdrawalStanding.sending))
        .fold(0.0, (s, w) => s + w.amountReais);

String _str(Object? v, [String fallback = '']) =>
    v is String && v.trim().isNotEmpty ? v.trim() : fallback;

String? _strOrNull(Object? v) =>
    v is String && v.trim().isNotEmpty ? v.trim() : null;

double? _num(Object? v) => v is num ? v.toDouble() : null;

DateTime? _date(Object? v) => switch (v) {
      Timestamp t => t.toDate(),
      DateTime d => d,
      String s => DateTime.tryParse(s),
      _ => null,
    };
