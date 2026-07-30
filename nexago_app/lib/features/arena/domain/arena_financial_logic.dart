import 'package:intl/intl.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../data/arena_wallet_repository.dart';

const double arenaMinWithdrawalReais = 20;

enum ArenaFinancialPeriod {
  d7,
  d30,
  d90,
}

extension ArenaFinancialPeriodX on ArenaFinancialPeriod {
  String get label => switch (this) {
        ArenaFinancialPeriod.d7 => '7d',
        ArenaFinancialPeriod.d30 => '30d',
        ArenaFinancialPeriod.d90 => '90d',
      };

  int get days => switch (this) {
        ArenaFinancialPeriod.d7 => 7,
        ArenaFinancialPeriod.d30 => 30,
        ArenaFinancialPeriod.d90 => 90,
      };
}

enum ArenaFinancialHistoryFilter {
  all,
  receipts,
  withdrawals,
}

enum ArenaFinancialMovementKind {
  receipt,
  withdrawal,
}

class ArenaFinancialMovement {
  const ArenaFinancialMovement({
    required this.id,
    required this.kind,
    required this.title,
    required this.at,
    required this.amountReais,
    required this.statusLabel,
    required this.isPositive,
    required this.isFailed,
    this.note,
  });

  final String id;
  final ArenaFinancialMovementKind kind;
  final String title;
  final DateTime? at;

  /// Valor exibido: no saque é o LÍQUIDO recebido quando o doc tem `netReais`.
  final double amountReais;

  final String statusLabel;
  final bool isPositive;
  final bool isFailed;

  /// Detalhe do saque ("bruto · tarifa"); `null` em docs antigos, sem tarifa.
  final String? note;
}

/// Extrato do saque: mostra o líquido que caiu na conta e de onde saiu a
/// diferença. Docs anteriores à tarifa (sem `feeReais`/`netReais`) seguem
/// exibindo só o valor. Espelha `withdrawalMovementAmounts` no painel Angular.
({double amountReais, String? note}) withdrawalMovementAmounts(
  ArenaWithdrawalItem w,
) {
  final fee = w.feeReais;
  final net = w.netReais;
  if (net == null || fee == null || fee <= 0) {
    return (amountReais: net ?? w.amountReais, note: null);
  }
  return (
    amountReais: net,
    note: 'Bruto ${formatBRL(w.amountReais)} · tarifa ${formatBRL(fee)}',
  );
}

class ArenaFinancialPeriodStats {
  const ArenaFinancialPeriodStats({
    required this.receivedReais,
    required this.withdrawnReais,
  });

  final double receivedReais;
  final double withdrawnReais;
}

bool _isWithinPeriod(DateTime? at, ArenaFinancialPeriod period, {DateTime? now}) {
  if (at == null) return false;
  final cutoff = (now ?? DateTime.now()).subtract(Duration(days: period.days));
  return !at.isBefore(cutoff);
}

String withdrawalStatusLabel(ArenaWithdrawalItem item) {
  final payout = item.payoutStatus?.trim().toLowerCase() ?? '';
  if (payout == 'failed') return 'FALHOU';
  if (payout == 'sent' || item.status.trim().toLowerCase() == 'approved') {
    return 'ENVIADO';
  }
  if (item.status.trim().toLowerCase() == 'rejected') return 'FALHOU';
  return 'PENDENTE';
}

bool withdrawalIsFailed(ArenaWithdrawalItem item) {
  final payout = item.payoutStatus?.trim().toLowerCase() ?? '';
  final status = item.status.trim().toLowerCase();
  return payout == 'failed' || status == 'rejected';
}

List<ArenaFinancialMovement> buildFinancialMovements({
  required List<ArenaLedgerEntry> ledger,
  required List<ArenaWithdrawalItem> withdrawals,
  required String arenaName,
}) {
  final arenaLabel = arenaName.trim().isEmpty ? 'Arena' : arenaName.trim();
  final items = <ArenaFinancialMovement>[];

  for (final entry in ledger) {
    items.add(
      ArenaFinancialMovement(
        id: 'ledger-${entry.id}',
        kind: ArenaFinancialMovementKind.receipt,
        title: 'Reserva · $arenaLabel',
        at: entry.createdAt,
        amountReais: entry.netReais,
        statusLabel: 'RECEBIDO',
        isPositive: true,
        isFailed: false,
      ),
    );
  }

  for (final w in withdrawals) {
    final failed = withdrawalIsFailed(w);
    final amounts = withdrawalMovementAmounts(w);
    items.add(
      ArenaFinancialMovement(
        id: 'withdrawal-${w.id}',
        kind: ArenaFinancialMovementKind.withdrawal,
        title: 'Saque PIX',
        at: w.createdAt,
        amountReais: amounts.amountReais,
        note: amounts.note,
        statusLabel: withdrawalStatusLabel(w),
        isPositive: false,
        isFailed: failed,
      ),
    );
  }

  items.sort((a, b) {
    final ta = a.at;
    final tb = b.at;
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return tb.compareTo(ta);
  });

  return items;
}

List<ArenaFinancialMovement> filterFinancialMovements(
  List<ArenaFinancialMovement> items,
  ArenaFinancialHistoryFilter filter,
) {
  return switch (filter) {
    ArenaFinancialHistoryFilter.all => items,
    ArenaFinancialHistoryFilter.receipts => items
        .where((m) => m.kind == ArenaFinancialMovementKind.receipt)
        .toList(),
    ArenaFinancialHistoryFilter.withdrawals => items
        .where((m) => m.kind == ArenaFinancialMovementKind.withdrawal)
        .toList(),
  };
}

ArenaFinancialPeriodStats computeFinancialPeriodStats({
  required List<ArenaLedgerEntry> ledger,
  required List<ArenaWithdrawalItem> withdrawals,
  required ArenaFinancialPeriod period,
  DateTime? now,
}) {
  var received = 0.0;
  var withdrawn = 0.0;

  for (final entry in ledger) {
    if (_isWithinPeriod(entry.createdAt, period, now: now)) {
      received += entry.netReais;
    }
  }

  for (final w in withdrawals) {
    if (!_isWithinPeriod(w.createdAt, period, now: now)) continue;
    if (withdrawalIsFailed(w)) continue;
    withdrawn += w.amountReais;
  }

  return ArenaFinancialPeriodStats(
    receivedReais: received,
    withdrawnReais: withdrawn,
  );
}

String formatFinancialMovementTimestamp(DateTime? at) {
  if (at == null) return 'Data indisponível';
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(at.year, at.month, at.day);
  final time = DateFormat('HH:mm').format(at);

  if (day == today) return 'Hoje, $time';
  final yesterday = today.subtract(const Duration(days: 1));
  if (day == yesterday) return 'Ontem, $time';

  return DateFormat("d MMM, HH:mm", 'pt_BR').format(at);
}

String formatNextPayoutLabel(double pendingReais) {
  if (pendingReais > 0.001) {
    return DateFormat('d MMM', 'pt_BR').format(
      DateTime.now().add(const Duration(days: 7)),
    );
  }
  return '—';
}

String maskPixKey(String key) {
  final trimmed = key.trim();
  if (trimmed.length <= 12) return trimmed;
  return '${trimmed.substring(0, 8)}…';
}
