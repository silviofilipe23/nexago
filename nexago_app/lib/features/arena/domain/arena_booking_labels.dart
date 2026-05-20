import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';

/// Situação de recebimento da reserva (PIX integral, sinal, pendente…).
enum ArenaBookingPaymentSettlement {
  unknown,
  pendingPix,
  paidFullPix,
  paidDepositPix,
  pendingOnsite,
  paidMp,
  pendingMp,
  failed,
  notOnline,
}

/// Resumo estruturado do pagamento para UI da arena.
class ArenaBookingPaymentInfo {
  const ArenaBookingPaymentInfo({
    required this.settlement,
    required this.channel,
    required this.statusBadge,
    required this.headline,
    this.subheadline,
    this.paidOnlineReais,
    this.dueOnsiteReais,
    this.totalReais,
  });

  final ArenaBookingPaymentSettlement settlement;
  final String channel;
  final String statusBadge;
  final String headline;
  final String? subheadline;
  final double? paidOnlineReais;
  final double? dueOnsiteReais;
  final double? totalReais;

  bool get isPaidOnline =>
      settlement == ArenaBookingPaymentSettlement.paidFullPix ||
      settlement == ArenaBookingPaymentSettlement.paidDepositPix;

  bool get isPaidInFull =>
      settlement == ArenaBookingPaymentSettlement.paidFullPix;

  bool get isDepositOnly =>
      settlement == ArenaBookingPaymentSettlement.paidDepositPix;

  bool get isPendingPayment =>
      settlement == ArenaBookingPaymentSettlement.pendingPix ||
      settlement == ArenaBookingPaymentSettlement.pendingMp;

  Color get accentColor {
    if (isPaidInFull) return AppColors.win;
    if (isDepositOnly) return AppColors.brand;
    if (isPendingPayment) return AppColors.pending;
    if (settlement == ArenaBookingPaymentSettlement.failed) {
      return AppColors.live;
    }
    return AppColors.onSurfaceMuted;
  }

  IconData get statusIcon {
    if (isPaidInFull) return Icons.check_circle_rounded;
    if (isDepositOnly) return Icons.payments_rounded;
    if (isPendingPayment) return Icons.schedule_rounded;
    if (settlement == ArenaBookingPaymentSettlement.failed) {
      return Icons.error_outline_rounded;
    }
    return Icons.account_balance_wallet_outlined;
  }
}

double? _amountFromData(Map<String, dynamic> data, String key) {
  final v = data[key];
  if (v is num) return v.toDouble();
  return null;
}

double? _bookingTotalReais(Map<String, dynamic> data) {
  return _amountFromData(data, 'amountReais') ??
      _amountFromData(data, 'priceReais') ??
      _amountFromData(data, 'price');
}

/// Interpreta `paymentStatus`, `paymentChannel` e valores pagos no documento.
ArenaBookingPaymentInfo arenaBookingPaymentInfo(Map<String, dynamic>? data) {
  if (data == null) {
    return const ArenaBookingPaymentInfo(
      settlement: ArenaBookingPaymentSettlement.unknown,
      channel: '—',
      statusBadge: '—',
      headline: 'Pagamento não informado',
    );
  }

  final channel = (data['paymentChannel'] as String?)?.toLowerCase().trim() ?? '';
  final ps = (data['paymentStatus'] as String?)?.toLowerCase().trim() ?? '';
  final paidOnline = _amountFromData(data, 'amountPaidOnlineReais');
  final dueOnsite = _amountFromData(data, 'amountDueOnsiteReais');
  final total = _bookingTotalReais(data);

  if (channel == 'pix') {
    if (ps == 'paid') {
      return ArenaBookingPaymentInfo(
        settlement: ArenaBookingPaymentSettlement.paidFullPix,
        channel: 'PIX',
        statusBadge: 'PAGO INTEGRAL',
        headline: 'Cliente pagou o valor integral via PIX',
        subheadline: paidOnline != null && paidOnline > 0
            ? 'Recebido online: ${_formatBrl(paidOnline)}'
            : null,
        paidOnlineReais: paidOnline ?? total,
        dueOnsiteReais: 0,
        totalReais: total,
      );
    }
    if (ps == 'partial') {
      final paid = paidOnline ?? 0;
      final due = dueOnsite ?? (total != null ? (total - paid).clamp(0, double.infinity) : null);
      return ArenaBookingPaymentInfo(
        settlement: ArenaBookingPaymentSettlement.paidDepositPix,
        channel: 'PIX',
        statusBadge: 'SINAL PAGO',
        headline: 'Cliente pagou o sinal via PIX',
        subheadline: due != null && due > 0.02
            ? 'Cobrar na chegada: ${_formatBrl(due)}'
            : 'Restante a combinar na arena',
        paidOnlineReais: paid > 0 ? paid : null,
        dueOnsiteReais: due != null && due > 0.02 ? due : null,
        totalReais: total,
      );
    }
    if (ps == 'pending') {
      return ArenaBookingPaymentInfo(
        settlement: ArenaBookingPaymentSettlement.pendingPix,
        channel: 'PIX',
        statusBadge: 'AGUARDANDO PIX',
        headline: 'PIX ainda não foi pago pelo cliente',
        subheadline: 'A reserva aguarda confirmação do pagamento online',
        totalReais: total,
      );
    }
    if (ps == 'rejected' || ps == 'expired') {
      return ArenaBookingPaymentInfo(
        settlement: ArenaBookingPaymentSettlement.failed,
        channel: 'PIX',
        statusBadge: 'PIX NÃO PAGO',
        headline: 'Pagamento PIX não concluído',
        subheadline: ps == 'expired' ? 'Cobrança expirada' : 'Pagamento recusado ou cancelado',
        totalReais: total,
      );
    }
    return ArenaBookingPaymentInfo(
      settlement: ArenaBookingPaymentSettlement.pendingPix,
      channel: 'PIX',
      statusBadge: 'PIX',
      headline: 'Pagamento via PIX',
      totalReais: total,
    );
  }

  if (channel == 'onsite') {
    return ArenaBookingPaymentInfo(
      settlement: ArenaBookingPaymentSettlement.pendingOnsite,
      channel: 'Na arena',
      statusBadge: 'NO LOCAL',
      headline: 'Pagamento previsto na chegada',
      subheadline: 'Sem cobrança PIX online nesta reserva',
      totalReais: total,
      dueOnsiteReais: total,
    );
  }

  final paymentId = data['paymentId'];
  final hasMp = paymentId != null && paymentId.toString().trim().isNotEmpty;
  if (hasMp) {
    if (ps == 'paid' || ps == 'approved') {
      return ArenaBookingPaymentInfo(
        settlement: ArenaBookingPaymentSettlement.paidMp,
        channel: 'Mercado Pago',
        statusBadge: 'PAGO',
        headline: 'Pago via Mercado Pago',
        paidOnlineReais: paidOnline ?? total,
        totalReais: total,
      );
    }
    if (ps == 'pending') {
      return const ArenaBookingPaymentInfo(
        settlement: ArenaBookingPaymentSettlement.pendingMp,
        channel: 'Mercado Pago',
        statusBadge: 'PENDENTE',
        headline: 'Aguardando pagamento no Mercado Pago',
      );
    }
    return ArenaBookingPaymentInfo(
      settlement: ArenaBookingPaymentSettlement.failed,
      channel: 'Mercado Pago',
      statusBadge: 'NÃO PAGO',
      headline: 'Mercado Pago não concluído',
      totalReais: total,
    );
  }

  final source = (data['source'] as String?)?.toLowerCase();
  if (source == 'platform') {
    return ArenaBookingPaymentInfo(
      settlement: ArenaBookingPaymentSettlement.notOnline,
      channel: 'App',
      statusBadge: 'APP',
      headline: 'Reserva pelo app',
      subheadline: 'Sem registro de pagamento online',
      totalReais: total,
    );
  }

  return ArenaBookingPaymentInfo(
    settlement: ArenaBookingPaymentSettlement.notOnline,
    channel: 'Direto',
    statusBadge: 'DIRETO',
    headline: 'Reserva sem link de pagamento online',
    totalReais: total,
  );
}

String _formatBrl(double value) {
  return 'R\$ ${value.toStringAsFixed(2).replaceAll('.', ',')}';
}

/// Rótulo curto para listas e chips (compatível com código existente).
String arenaBookingPaymentLabel(Map<String, dynamic>? data) {
  final info = arenaBookingPaymentInfo(data);
  switch (info.settlement) {
    case ArenaBookingPaymentSettlement.paidFullPix:
      return 'PIX · Pago integral';
    case ArenaBookingPaymentSettlement.paidDepositPix:
      return 'PIX · Sinal pago';
    case ArenaBookingPaymentSettlement.pendingPix:
      return 'PIX · Aguardando pagamento';
    case ArenaBookingPaymentSettlement.failed:
      return 'PIX · Não concluído';
    case ArenaBookingPaymentSettlement.pendingOnsite:
      return 'Pagamento na arena';
    case ArenaBookingPaymentSettlement.paidMp:
      return 'Mercado Pago · Pago';
    case ArenaBookingPaymentSettlement.pendingMp:
      return 'Mercado Pago · Pendente';
    case ArenaBookingPaymentSettlement.notOnline:
      if (info.channel == 'App') return 'App / plataforma';
      return 'Direto / sem link online';
    case ArenaBookingPaymentSettlement.unknown:
      return '—';
  }
}

/// Status da reserva apenas no âmbito do negócio (ativa, cancelada…).
String arenaBookingBusinessStatusLabel(Map<String, dynamic>? data) {
  if (data == null) return '—';
  final status = (data['status'] as String?)?.trim();
  if (status == null || status.isEmpty) return '—';
  return _mapBookingStatus(status);
}

/// Status da reserva (negócio + pagamento quando relevante).
String arenaBookingStatusLabel(Map<String, dynamic>? data) {
  if (data == null) return '—';
  final status = (data['status'] as String?)?.trim();
  final info = arenaBookingPaymentInfo(data);

  final parts = <String>[];
  if (status != null && status.isNotEmpty) {
    parts.add(_mapBookingStatus(status));
  }
  if (info.isPaidInFull) {
    parts.add('Pagamento integral recebido');
  } else if (info.isDepositOnly) {
    parts.add('Sinal recebido');
  } else if (info.isPendingPayment) {
    parts.add('Pagamento pendente');
  } else if (info.settlement == ArenaBookingPaymentSettlement.failed) {
    parts.add('Pagamento não concluído');
  }
  if (parts.isEmpty) return '—';
  return parts.join(' · ');
}

String _mapBookingStatus(String raw) {
  switch (raw.toLowerCase()) {
    case 'active':
    case 'confirmed':
      return 'Ativa';
    case 'cancelled':
    case 'canceled':
      return 'Cancelada';
    case 'completed':
      return 'Concluída';
    default:
      return raw;
  }
}
