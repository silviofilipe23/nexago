/// Jornada do convite de substituição — lógica pura do lado do app: motivo,
/// contagem regressiva, barra de TTL, "visto há" e o desfecho exibido.
///
/// Puro, sem Flutter/Firestore: `DateTime` entra por parâmetro (nunca
/// `DateTime.now()` interno) para os testes controlarem o relógio.
library;

/// Rótulo PT do motivo declarado — espelha `SUBSTITUTION_REASON_LABELS`
/// (functions/src/tournament-substitution.ts). Mudou lá, mude aqui.
const substitutionReasonLabels = <String, String>{
  'lesao': 'Lesão',
  'imprevisto': 'Imprevisto pessoal',
  'trabalho': 'Trabalho',
  'viagem': 'Viagem',
  'outro': 'Outro',
};

/// Tempo restante até [expiresAt] formatado para a UI:
/// - `"1d 04h"` — um dia ou mais.
/// - `"05h 12min"` — uma hora ou mais, menos de um dia.
/// - `"12min"` — menos de uma hora.
/// - `null` — já venceu ([now] alcançou ou passou [expiresAt]).
String? substitutionCountdownLabel(DateTime expiresAt, DateTime now) {
  final remaining = expiresAt.difference(now);
  if (remaining <= Duration.zero) return null;

  final days = remaining.inDays;
  if (days >= 1) {
    final hours = remaining.inHours - days * 24;
    return '${days}d ${hours.toString().padLeft(2, '0')}h';
  }

  final hours = remaining.inHours;
  if (hours >= 1) {
    final minutes = remaining.inMinutes - hours * 60;
    return '${hours.toString().padLeft(2, '0')}h ${minutes.toString().padLeft(2, '0')}min';
  }

  return '${remaining.inMinutes}min';
}

/// Fração 0..1 do TTL já consumido entre [createdAt] e [expiresAt] — alimenta
/// a barra de progresso. Clampada nos extremos (relógio do cliente pode
/// derivar um pouco do servidor).
double substitutionTtlProgress(
  DateTime createdAt,
  DateTime expiresAt,
  DateTime now,
) {
  final totalMs = expiresAt.difference(createdAt).inMilliseconds;
  if (totalMs <= 0) return 1.0;
  final elapsedMs = now.difference(createdAt).inMilliseconds;
  final fraction = elapsedMs / totalMs;
  if (fraction < 0) return 0.0;
  if (fraction > 1) return 1.0;
  return fraction;
}

/// "Visto há" relativo a [viewedAt]; `null` quando o convite ainda não foi
/// aberto pelo convidado.
String? substitutionViewedLabel(DateTime? viewedAt, DateTime now) {
  if (viewedAt == null) return null;
  final elapsed = now.difference(viewedAt);
  final minutes = elapsed.isNegative ? 0 : elapsed.inMinutes;
  if (minutes < 1) return 'visualizado agora';
  if (minutes < 60) return 'visualizado há $minutes min';
  final hours = elapsed.inHours;
  return 'visualizado há $hours h';
}

/// Desfecho do convite de substituição exibido na jornada.
enum SubstitutionInviteOutcome {
  pending,
  accepted,
  declined,
  expired,
  cancelled,

  /// Status que o app não reconhece (dado antigo/inesperado) — trata como
  /// encerrado sem inventar um rótulo de sucesso ou falha.
  stale,
}

/// Deriva o desfecho a partir do `status` gravado + do prazo. Pendente que já
/// venceu vira `expired` mesmo antes do backend flipar o campo (lazy expiry);
/// para os demais status, [status] manda sozinho.
SubstitutionInviteOutcome substitutionOutcomeOf(
  String status,
  DateTime expiresAt,
  DateTime now,
) {
  if (status == 'pending' && now.isAfter(expiresAt)) {
    return SubstitutionInviteOutcome.expired;
  }
  switch (status) {
    case 'pending':
      return SubstitutionInviteOutcome.pending;
    case 'accepted':
      return SubstitutionInviteOutcome.accepted;
    case 'declined':
      return SubstitutionInviteOutcome.declined;
    case 'expired':
      return SubstitutionInviteOutcome.expired;
    case 'cancelled':
      return SubstitutionInviteOutcome.cancelled;
    default:
      return SubstitutionInviteOutcome.stale;
  }
}
