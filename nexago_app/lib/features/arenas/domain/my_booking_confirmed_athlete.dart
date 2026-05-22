/// Atleta com presença confirmada em uma reserva (dono ou convidado).
class MyBookingConfirmedAthlete {
  const MyBookingConfirmedAthlete({
    this.userId,
    this.displayName,
    this.avatarUrl,
  });

  final String? userId;
  final String? displayName;
  final String? avatarUrl;

  bool get hasDisplayName => displayName?.trim().isNotEmpty == true;
}
