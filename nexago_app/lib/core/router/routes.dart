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

  /// Perfil do atleta (Firestore `athletes/{uid}`).
  static const String athleteProfile = '/athlete/profile';

  /// Edição do perfil do atleta.
  static const String athleteProfileEdit = '/athlete/profile/edit';

  /// Sucesso após salvar perfil do atleta.
  static const String athleteProfileUpdateSuccess = '/athlete/profile/updated';

  // --- Painel da arena (gestor) — literais antes de [arenaDetail] no router ---

  static const String arenaDashboard = '/arena/dashboard';
  static const String arenaSchedule = '/arena/schedule';
  static const String arenaCourts = '/arena/courts';
  static const String arenaBookings = '/arena/bookings';

  /// Detalhe de reserva (gestor): `/arena/bookings/detail/:bookingId`
  static const String arenaBookingDetail = '/arena/bookings/detail/:bookingId';

  static const String arenaSettings = '/arena/settings';

  /// Disponibilidade / horários na agenda (gestor). Antes de [arenaDetail].
  static const String arenaAvailabilitySettings =
      '/arena/settings/availability';

  /// Sucesso após gerar horários (gestor). Antes de [arenaDetail].
  static const String arenaAvailabilitySlotsSuccess =
      '/arena/settings/availability/done';

  /// Perfil da arena (gestor). Deve ficar **antes** de [arenaDetail] no router.
  static const String arenaProfile = '/arena/profile';
  static const String arenaFollowers = '/arena/profile/followers';
  static const String arenaManagerReviews = '/arena/reviews';

  /// Edição de perfil (gestor). Literal antes de [arenaDetail].
  static const String arenaProfileEdit = '/arena/profile/edit';

  /// Sucesso após salvar perfil (gestor). Literal antes de [arenaDetail].
  static const String arenaProfileUpdateSuccess = '/arena/profile/updated';

  /// Detalhe de horário (gestor): `/arena/schedule/slot/:slotId`
  static const String arenaSlotDetail = '/arena/schedule/slot/:slotId';

  /// Detalhe (atleta): `/arena/:arenaId`
  static const String arenaDetail = '/arena/:arenaId';

  /// Horários: `/arena/:arenaId/slots`
  static const String arenaSlots = '/arena/:arenaId/slots';
  static const String arenaReviews = '/arena/:arenaId/reviews';

  /// Confirmação (paridade com web `/arenas/:id/book`).
  static const String arenaBookingConfirm = '/arena/:arenaId/book/confirm';

  /// Sucesso após confirmação.
  static const String arenaBookingSuccess = '/arena/:arenaId/book/success';

  /// Bloqueio do atleta ao tentar reservar.
  static const String arenaBookingBlocked = '/arena/:arenaId/book/blocked';

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
  static const String athleteProfile = 'athleteProfile';
  static const String athleteProfileEdit = 'athleteProfileEdit';
  static const String athleteProfileUpdateSuccess =
      'athleteProfileUpdateSuccess';

  static const String arenaDashboard = 'arenaDashboard';
  static const String arenaSchedule = 'arenaSchedule';
  static const String arenaCourts = 'arenaCourts';
  static const String arenaBookings = 'arenaBookings';
  static const String arenaBookingDetail = 'arenaBookingDetail';
  static const String arenaSettings = 'arenaSettings';
  static const String arenaAvailabilitySettings = 'arenaAvailabilitySettings';
  static const String arenaAvailabilitySlotsSuccess =
      'arenaAvailabilitySlotsSuccess';
  static const String arenaProfile = 'arenaProfile';
  static const String arenaFollowers = 'arenaFollowers';
  static const String arenaManagerReviews = 'arenaManagerReviews';
  static const String arenaProfileEdit = 'arenaProfileEdit';
  static const String arenaProfileUpdateSuccess = 'arenaProfileUpdateSuccess';

  static const String arenaSlotDetail = 'arenaSlotDetail';

  static const String arenaDetail = 'arenaDetail';
  static const String arenaSlots = 'arenaSlots';
  static const String arenaReviews = 'arenaReviews';
  static const String arenaBookingConfirm = 'arenaBookingConfirm';
  static const String arenaBookingSuccess = 'arenaBookingSuccess';
  static const String arenaBookingBlocked = 'arenaBookingBlocked';
  static const String bookingSuccess = 'bookingSuccess';
}
