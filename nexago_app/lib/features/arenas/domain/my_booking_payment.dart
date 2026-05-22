import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';

/// Rótulo de pagamento para o atleta (lista Minhas reservas).
class MyBookingPaymentDisplay {
  const MyBookingPaymentDisplay({
    required this.label,
    this.accentColor = AppColors.onSurfaceMuted,
  });

  final String label;
  final Color accentColor;
}

MyBookingPaymentDisplay myBookingPaymentDisplayFromData(
  Map<String, dynamic> data,
) {
  final bookingStatus = (data['status'] as String?)?.toLowerCase().trim() ?? '';
  final channel =
      (data['paymentChannel'] as String?)?.toLowerCase().trim() ??
      (data['paymentMode'] as String?)?.toLowerCase().trim() ??
      '';
  final paymentStatus =
      (data['paymentStatus'] as String?)?.toLowerCase().trim() ?? '';
  final fraction = (data['paymentFraction'] as num?)?.toDouble() ?? 1.0;
  final dueOnsite = (data['amountDueOnsiteReais'] as num?)?.toDouble() ?? 0;
  final paidOnline = (data['amountPaidOnlineReais'] as num?)?.toDouble() ?? 0;

  if (bookingStatus == 'pending_payment') {
    return const MyBookingPaymentDisplay(
      label: 'PIX · Aguardando pagamento',
      accentColor: AppColors.pending,
    );
  }

  if (channel == 'pix') {
    if (paymentStatus == 'paid') {
      final isFull = fraction >= 0.99 || dueOnsite <= 0.02;
      if (isFull) {
        return const MyBookingPaymentDisplay(
          label: 'PIX · 100% pago',
          accentColor: AppColors.win,
        );
      }
      return const MyBookingPaymentDisplay(
        label: 'PIX · 50% pago · restante na arena',
        accentColor: AppColors.brand,
      );
    }
    if (paymentStatus == 'partial' || (paidOnline > 0 && dueOnsite > 0.02)) {
      return const MyBookingPaymentDisplay(
        label: 'PIX · 50% pago · restante na arena',
        accentColor: AppColors.brand,
      );
    }
    if (paymentStatus == 'pending') {
      return const MyBookingPaymentDisplay(
        label: 'PIX · Aguardando pagamento',
        accentColor: AppColors.pending,
      );
    }
    if (paymentStatus == 'rejected' || paymentStatus == 'expired') {
      return const MyBookingPaymentDisplay(
        label: 'PIX · Não concluído',
        accentColor: AppColors.live,
      );
    }
    if (fraction <= 0.51) {
      return const MyBookingPaymentDisplay(
        label: 'PIX · 50%',
        accentColor: AppColors.brand,
      );
    }
    return const MyBookingPaymentDisplay(
      label: 'PIX · 100%',
      accentColor: AppColors.onSurfaceMuted,
    );
  }

  if (channel == 'onsite') {
    return const MyBookingPaymentDisplay(
      label: 'Pagar na arena',
      accentColor: AppColors.onSurfaceMuted,
    );
  }

  final legacyType = (data['paymentType'] ?? data['paymentMethod']) as String?;
  if (legacyType != null && legacyType.trim().isNotEmpty) {
    return MyBookingPaymentDisplay(
      label: _legacyPaymentLabel(legacyType),
      accentColor: AppColors.onSurfaceMuted,
    );
  }

  return const MyBookingPaymentDisplay(
    label: 'Pagar na arena',
    accentColor: AppColors.onSurfaceMuted,
  );
}

String _legacyPaymentLabel(String raw) {
  final v = raw.trim().toLowerCase();
  if (v.contains('pix')) return 'PIX';
  if (v.contains('50')) return 'PIX · 50%';
  if (v.contains('100') || v.contains('integral')) return 'PIX · 100%';
  if (v.contains('arena') || v.contains('local') || v.contains('venue')) {
    return 'Pagar na arena';
  }
  return raw.trim();
}
