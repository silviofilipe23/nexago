/// Rótulo amigável para tipo de pagamento a partir de `arenaBookings`.
String arenaBookingPaymentLabel(Map<String, dynamic>? data) {
  if (data == null) return '—';
  final paymentId = data['paymentId'];
  final hasMp = paymentId != null && paymentId.toString().trim().isNotEmpty;
  final ps = (data['paymentStatus'] as String?)?.toLowerCase().trim();

  if (hasMp) {
    if (ps == 'paid' || ps == 'approved') {
      return 'Mercado Pago (pago)';
    }
    if (ps == 'pending') {
      return 'Mercado Pago (pendente)';
    }
    if (ps == 'rejected' || ps == 'cancelled') {
      return 'Mercado Pago (não concluído)';
    }
    return 'Mercado Pago';
  }

  final source = (data['source'] as String?)?.toLowerCase();
  if (source == 'platform') {
    return 'App / plataforma';
  }
  return 'Direto / sem link online';
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
  final ps = (data['paymentStatus'] as String?)?.toLowerCase().trim();

  final parts = <String>[];
  if (status != null && status.isNotEmpty) {
    parts.add(_mapBookingStatus(status));
  }
  if (ps != null && ps.isNotEmpty && ps != 'paid' && ps != 'approved') {
    parts.add('Pagamento: ${_mapPaymentStatus(ps)}');
  }
  if (parts.isEmpty) return '—';
  return parts.join(' · ');
}

String _mapBookingStatus(String raw) {
  switch (raw.toLowerCase()) {
    case 'active':
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

String _mapPaymentStatus(String raw) {
  switch (raw) {
    case 'pending':
      return 'pendente';
    case 'paid':
    case 'approved':
      return 'pago';
    case 'rejected':
      return 'recusado';
    default:
      return raw;
  }
}
