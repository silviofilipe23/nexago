/// Caminhos e nomes de rotas (uso com [GoRouter]).
abstract final class AppRoutes {
  AppRoutes._();

  /// Raiz `/` redireciona para [discover] (ver [GoRouter]).
  static const String home = '/';

  /// Atleta: quadras disponíveis (lista / descoberta).
  static const String discover = '/discover';

  static const String login = '/login';
  static const String register = '/register';

  /// Reservas do atleta (`arenaBookings`).
  static const String myBookings = '/my-bookings';

  // --- Painel da arena (gestor) — literais antes de [arenaDetail] no router ---

  static const String arenaDashboard = '/arena/dashboard';
  static const String arenaSchedule = '/arena/schedule';
  static const String arenaCourts = '/arena/courts';
  static const String arenaBookings = '/arena/bookings';
  static const String arenaSettings = '/arena/settings';

  /// Detalhe de horário (gestor): `/arena/schedule/slot/:slotId`
  static const String arenaSlotDetail = '/arena/schedule/slot/:slotId';

  /// Detalhe (atleta): `/arena/:arenaId`
  static const String arenaDetail = '/arena/:arenaId';

  /// Horários: `/arena/:arenaId/slots`
  static const String arenaSlots = '/arena/:arenaId/slots';

  /// Confirmação (paridade com web `/arenas/:id/book`).
  static const String arenaBookingConfirm = '/arena/:arenaId/book/confirm';

  /// Sucesso após confirmação.
  static const String arenaBookingSuccess = '/arena/:arenaId/book/success';

  /// Legado: manter rota simples se necessário.
  static const String bookingSuccess = '/booking/success';
}

abstract final class AppRouteNames {
  AppRouteNames._();

  static const String home = 'home';
  static const String discover = 'discover';
  static const String login = 'login';
  static const String register = 'register';
  static const String myBookings = 'myBookings';

  static const String arenaDashboard = 'arenaDashboard';
  static const String arenaSchedule = 'arenaSchedule';
  static const String arenaCourts = 'arenaCourts';
  static const String arenaBookings = 'arenaBookings';
  static const String arenaSettings = 'arenaSettings';

  static const String arenaSlotDetail = 'arenaSlotDetail';

  static const String arenaDetail = 'arenaDetail';
  static const String arenaSlots = 'arenaSlots';
  static const String arenaBookingConfirm = 'arenaBookingConfirm';
  static const String arenaBookingSuccess = 'arenaBookingSuccess';
  static const String bookingSuccess = 'bookingSuccess';
}
