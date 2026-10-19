import 'booking_invite_model.dart';

/// Jogadores por reserva: o dono + 3 convidados. Espelha `BOOKING_MAX_PLAYERS`
/// (functions/src/arena-booking-invite.ts) e `TEAM_SLOTS` do portal.
const kBookingMaxPlayers = 4;

/// Decide se um convite de reserva (`bookingInvites/{id}`) ainda pode ser
/// respondido, dado o estado atual do convite E da reserva original.
///
/// Cobre o que o convite sozinho não detecta: a reserva cancelada depois que
/// o convite foi gerado (o doc do convite guarda uma cópia dos dados) e as
/// respostas já dadas. O link multiuso fica `open` enquanto vale.
///
/// Retorna `null` quando está tudo certo para seguir o fluxo normal, ou a
/// mensagem PT a mostrar ao usuário quando bloqueado.
String? resolveBookingInviteBlockedReason({
  required String inviteStatus,
  required bool inviteExpired,
  required bool bookingExists,
  String? bookingStatus,
}) {
  if (inviteExpired) return 'Este convite expirou.';
  switch (inviteStatus) {
    case 'pending':
    case 'open':
      break;
    case 'accepted':
      return 'Este convite já foi aceito.';
    case 'declined':
      return 'Você recusou este convite.';
    case 'canceled':
      return 'Este convite foi cancelado.';
    case 'left':
      return 'Você saiu deste jogo.';
    case 'removed':
      return 'Você não está mais neste jogo.';
    default:
      return 'Este convite não está mais disponível.';
  }
  if (!bookingExists ||
      bookingStatus == 'canceled' ||
      bookingStatus == 'cancelled') {
    return 'Esta reserva foi cancelada.';
  }
  return null;
}

/// O que a tela `/convite/:inviteId` mostra para quem abriu.
enum BookingInviteGate {
  /// Sem sessão: mostra o convite e pede login para responder.
  signIn,

  /// Quem abriu é o dono da reserva (abriu o próprio link).
  owner,

  /// Já está na lista do jogo.
  joined,

  /// Pode aceitar (e recusar, se o convite é direto).
  respond,

  /// Não dá mais — [BookingInviteGateResult.message] explica.
  blocked,
}

class BookingInviteGateResult {
  const BookingInviteGateResult(this.gate, [this.message]);

  final BookingInviteGate gate;
  final String? message;
}

/// Dono: `athleteId`, ou `bookingAthleteId` nas reservas antigas.
String? bookingOwnerUidOf(Map<String, dynamic> booking) {
  for (final key in const ['athleteId', 'bookingAthleteId']) {
    final value = booking[key];
    if (value is String && value.trim().isNotEmpty) return value.trim();
  }
  return null;
}

/// Uids dos convidados que entraram (`participantUids`, gravado pelo servidor).
List<String> bookingParticipantUidsOf(Map<String, dynamic> booking) {
  final raw = booking['participantUids'];
  if (raw is! List) return const [];
  return raw
      .whereType<String>()
      .map((uid) => uid.trim())
      .where((uid) => uid.isNotEmpty)
      .toSet()
      .toList();
}

/// Estado da tela do convite. [booking] `null` = a reserva não existe mais.
/// [viewerUid] `null` = sem sessão. Bloqueios que valem para qualquer um
/// (reserva cancelada, convite encerrado) vêm antes de pedir login.
BookingInviteGateResult resolveBookingInviteGate({
  required BookingInvite invite,
  required Map<String, dynamic>? booking,
  required String? viewerUid,
  DateTime? now,
}) {
  if (booking == null) {
    return const BookingInviteGateResult(
      BookingInviteGate.blocked,
      'Esta reserva foi cancelada.',
    );
  }
  final status = (booking['status'] as String?)?.trim().toLowerCase();
  if (status == 'canceled' || status == 'cancelled') {
    return const BookingInviteGateResult(
      BookingInviteGate.blocked,
      'Esta reserva foi cancelada.',
    );
  }

  final viewer = viewerUid?.trim() ?? '';
  final participants = bookingParticipantUidsOf(booking);
  if (viewer.isNotEmpty) {
    if (viewer == bookingOwnerUidOf(booking)) {
      return const BookingInviteGateResult(BookingInviteGate.owner);
    }
    if (participants.contains(viewer)) {
      return const BookingInviteGateResult(BookingInviteGate.joined);
    }
  }

  final clock = now ?? DateTime.now();
  final reason = resolveBookingInviteBlockedReason(
    inviteStatus: invite.status,
    inviteExpired: clock.isAfter(invite.expiresAt),
    bookingExists: true,
    bookingStatus: status,
  );
  if (reason != null) {
    return BookingInviteGateResult(BookingInviteGate.blocked, reason);
  }

  final invitee = invite.inviteeUid ?? '';
  if (viewer.isNotEmpty &&
      !invite.isShareLink &&
      invitee.isNotEmpty &&
      invitee != viewer) {
    return const BookingInviteGateResult(
      BookingInviteGate.blocked,
      'Este convite é para outro atleta.',
    );
  }
  if (participants.length + 1 >= kBookingMaxPlayers) {
    return const BookingInviteGateResult(
      BookingInviteGate.blocked,
      'A quadra já está completa.',
    );
  }
  if (viewer.isEmpty) {
    return const BookingInviteGateResult(BookingInviteGate.signIn);
  }
  return const BookingInviteGateResult(BookingInviteGate.respond);
}
