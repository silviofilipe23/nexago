/// Caminhos e nomes de rotas (uso com [GoRouter]).
abstract final class AppRoutes {
  AppRoutes._();

  /// Raiz `/` redireciona para [discover] (ver [GoRouter]).
  static const String home = '/';

  /// Atleta: quadras disponíveis (lista / descoberta).
  static const String discover = '/discover';

  static const String login = '/login';
  static const String register = '/register';
  static const String forgotPassword = '/forgot-password';

  /// Seleção de papel após login (multi-role).
  static const String roleSelection = '/auth/role-selection';

  /// Loading pós-login / cold start autenticado.
  static const String authLoading = '/auth/loading';

  /// Home do organizador de torneio (v1 — em breve).
  static const String organizerHome = '/organizer';

  /// Reservas do atleta (`arenaBookings`).
  static const String myBookings = '/my-bookings';

  /// Arenas favoritas do atleta (fluxo Reservar).
  static const String favoriteArenas = '/reservar/favoritas';

  /// Perfil do atleta (Firestore `athletes/{uid}`).
  static const String athleteProfile = '/athlete/profile';

  /// Edição do perfil do atleta.
  static const String athleteProfileEdit = '/athlete/profile/edit';

  /// Completar perfil (passos + XP).
  static const String athleteCompleteProfile = '/athlete/profile/complete';

  /// Objetivos do perfil (passo de completar perfil).
  static const String athleteProfileGoals = '/athlete/profile/goals';

  /// Conquistas / badges do atleta.
  static const String athleteAchievements = '/athlete/achievements';

  static const String athleteSettings = '/athlete/settings';

  /// Esportes e níveis do atleta.
  static const String athleteSportsLevels = '/athlete/profile/sports-levels';

  /// Preferências de notificação do atleta.
  static const String athleteNotificationSettings =
      '/athlete/settings/notifications';

  /// Caixa de entrada de notificações do atleta.
  static const String athleteNotifications = '/athlete/notifications';

  /// Privacidade e segurança do atleta.
  static const String athletePrivacySecurity = '/athlete/settings/privacy';

  static const String athleteChangePassword =
      '/athlete/settings/privacy/change-password';

  static const String athleteActiveSessions =
      '/athlete/settings/privacy/sessions';

  /// Gamificação amplificada (protótipo Quest).
  static const String athleteQuest = '/athlete/quest';

  /// Histórico de partidas e torneios do atleta.
  static const String athleteMatchHistory = '/athlete/history';

  /// Detalhe de partida: `/athlete/history/match/:matchId`
  static const String athleteMatchDetail = '/athlete/history/match/:matchId';

  /// Análise ponto a ponto: `/athlete/history/match/:matchId/play-by-play`
  static const String athleteMatchPlayByPlay =
      '/athlete/history/match/:matchId/play-by-play';

  /// Query em [athleteMatchDetail]: `1` oculta «Ir ao torneio» (já está no torneio).
  static const String matchDetailFromTournamentQuery = 'fromTournament';

  /// Detalhe do torneio (campanha): `/athlete/history/tournament/:tournamentId`
  static const String athleteTournamentDetail =
      '/athlete/history/tournament/:tournamentId';

  /// Sucesso após salvar perfil do atleta.
  static const String athleteProfileUpdateSuccess = '/athlete/profile/updated';

  /// Onboarding pós-cadastro do atleta.
  static const String athleteOnboarding = '/athlete/onboarding';
  static const String athleteOnboardingWelcome = '/athlete/onboarding/welcome';
  static const String athleteOnboardingPrimarySport =
      '/athlete/onboarding/primary-sport';
  static const String athleteOnboardingOtherSports =
      '/athlete/onboarding/other-sports';
  static const String athleteOnboardingLevel = '/athlete/onboarding/level';
  static const String athleteOnboardingGoals = '/athlete/onboarding/goals';
  static const String athleteOnboardingProfile = '/athlete/onboarding/profile';

  // --- Painel da arena (gestor) — literais antes de [arenaDetail] no router ---

  static const String arenaDashboard = '/arena/dashboard';
  static const String arenaSchedule = '/arena/schedule';
  static const String arenaCourts = '/arena/courts';
  static const String arenaBookings = '/arena/bookings';

  /// Detalhe de reserva (gestor): `/arena/bookings/detail/:bookingId`
  static const String arenaBookingDetail = '/arena/bookings/detail/:bookingId';

  /// Pós-cancelamento com undo: `/arena/bookings/canceled`
  static const String arenaBookingCanceled = '/arena/bookings/canceled';

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

  /// Pagamento PIX in-app.
  static const String arenaBookingPix = '/arena/:arenaId/book/pix';

  /// Sucesso após confirmação.
  static const String arenaBookingSuccess = '/arena/:arenaId/book/success';

  /// Pagamentos / saldo (gestor). Filha de [arenaSettings] — evita conflito com `/arena/:arenaId`.
  static const String arenaPayments = '/arena/settings/payments';

  /// Catálogo de produtos (gestor).
  static const String arenaProducts = '/arena/products';

  /// Novo produto (gestor).
  static const String arenaProductNew = '/arena/products/new';

  /// Editar produto: `/arena/products/:productId/edit`
  static const String arenaProductEdit = '/arena/products/:productId/edit';

  /// Alertas de estoque (gestor).
  static const String arenaProductStock = '/arena/products/stock';

  /// Repor estoque: `/arena/products/:productId/restock`
  static const String arenaProductRestock = '/arena/products/:productId/restock';

  /// Pós-exclusão de produto (desfazer).
  static const String arenaProductDeleted = '/arena/products/deleted';

  /// Bloqueio do atleta ao tentar reservar.
  static const String arenaBookingBlocked = '/arena/:arenaId/book/blocked';

  /// Legado: manter rota simples se necessário.
  static const String bookingSuccess = '/booking/success';

  /// Convite para jogar: `/convite/:inviteId`
  static const String bookingInvite = '/convite/:inviteId';

  /// Detalhe de torneio: `/torneios/:tournamentId`
  static const String tournamentDetail = '/torneios/:tournamentId';

  /// Chave interativa (dupla eliminatória): `/torneios/:tournamentId/chave/:categoryId`
  static const String tournamentDoubleEliminationBracket =
      '/torneios/:tournamentId/chave/:categoryId';

  /// Inscrição: `/torneios/:tournamentId/inscricao`
  static const String tournamentRegistration =
      '/torneios/:tournamentId/inscricao';

  /// PIX da inscrição: `/torneios/:tournamentId/inscricao/pix`
  static const String tournamentRegistrationPix =
      '/torneios/:tournamentId/inscricao/pix';

  /// Sucesso da inscrição: `/torneios/:tournamentId/inscricao/sucesso`
  static const String tournamentRegistrationSuccess =
      '/torneios/:tournamentId/inscricao/sucesso';

  /// Convite de parceiro para torneio: `/torneios-convite/:inviteId`
  static const String tournamentPartnerInvite =
      '/torneios-convite/:inviteId';

  /// Detalhe de liga: `/ligas/:leagueId`
  static const String leagueDetail = '/ligas/:leagueId';

  /// Listagem completa de torneios/ligas no hub Competir.
  static const String tournamentDiscoveryList = '/competir/torneios';

  /// Ranking de atletas (temporada).
  static const String athleteRanking = '/competir/ranking';

  /// Descobrir atletas (catálogo público).
  static const String athleteDiscover = '/competir/descobrir';

  /// Listagem de duplas (catálogo público).
  static const String teamDiscover = '/competir/duplas';

  /// Perfil público da dupla: `/competir/duplas/:teamId`
  static const String teamProfile = '/competir/duplas/:teamId';

  /// Torneios inscritos do atleta (em andamento e concluídos).
  static const String myTournaments = '/competir/meus-torneios';
}

abstract final class AppRouteNames {
  AppRouteNames._();

  static const String home = 'home';
  static const String discover = 'discover';
  static const String login = 'login';
  static const String register = 'register';
  static const String forgotPassword = 'forgotPassword';
  static const String roleSelection = 'roleSelection';
  static const String authLoading = 'authLoading';
  static const String organizerHome = 'organizerHome';
  static const String myBookings = 'myBookings';
  static const String favoriteArenas = 'favoriteArenas';
  static const String athleteProfile = 'athleteProfile';
  static const String athleteProfileEdit = 'athleteProfileEdit';
  static const String athleteCompleteProfile = 'athleteCompleteProfile';
  static const String athleteProfileGoals = 'athleteProfileGoals';
  static const String athleteAchievements = 'athleteAchievements';
  static const String athleteSettings = 'athleteSettings';
  static const String athleteSportsLevels = 'athleteSportsLevels';
  static const String athleteNotificationSettings =
      'athleteNotificationSettings';
  static const String athleteNotifications = 'athleteNotifications';
  static const String athletePrivacySecurity = 'athletePrivacySecurity';
  static const String athleteChangePassword = 'athleteChangePassword';
  static const String athleteActiveSessions = 'athleteActiveSessions';
  static const String athleteQuest = 'athleteQuest';
  static const String athleteMatchHistory = 'athleteMatchHistory';
  static const String athleteMatchDetail = 'athleteMatchDetail';
  static const String athleteMatchPlayByPlay = 'athleteMatchPlayByPlay';
  static const String athleteTournamentDetail = 'athleteTournamentDetail';
  static const String athleteProfileUpdateSuccess =
      'athleteProfileUpdateSuccess';
  static const String athleteOnboardingWelcome = 'athleteOnboardingWelcome';
  static const String athleteOnboardingPrimarySport =
      'athleteOnboardingPrimarySport';
  static const String athleteOnboardingOtherSports =
      'athleteOnboardingOtherSports';
  static const String athleteOnboardingLevel = 'athleteOnboardingLevel';
  static const String athleteOnboardingGoals = 'athleteOnboardingGoals';
  static const String athleteOnboardingProfile = 'athleteOnboardingProfile';

  static const String arenaDashboard = 'arenaDashboard';
  static const String arenaSchedule = 'arenaSchedule';
  static const String arenaCourts = 'arenaCourts';
  static const String arenaBookings = 'arenaBookings';
  static const String arenaBookingDetail = 'arenaBookingDetail';
  static const String arenaBookingCanceled = 'arenaBookingCanceled';
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
  static const String arenaBookingPix = 'arenaBookingPix';
  static const String arenaBookingSuccess = 'arenaBookingSuccess';
  static const String arenaPayments = 'arenaPayments';
  static const String arenaProducts = 'arenaProducts';
  static const String arenaProductNew = 'arenaProductNew';
  static const String arenaProductEdit = 'arenaProductEdit';
  static const String arenaProductStock = 'arenaProductStock';
  static const String arenaProductRestock = 'arenaProductRestock';
  static const String arenaProductDeleted = 'arenaProductDeleted';
  static const String arenaBookingBlocked = 'arenaBookingBlocked';
  static const String bookingSuccess = 'bookingSuccess';
  static const String bookingInvite = 'bookingInvite';
  static const String tournamentDetail = 'tournamentDetail';
  static const String tournamentDoubleEliminationBracket =
      'tournamentDoubleEliminationBracket';
  static const String tournamentRegistration = 'tournamentRegistration';
  static const String tournamentRegistrationPix = 'tournamentRegistrationPix';
  static const String tournamentRegistrationSuccess =
      'tournamentRegistrationSuccess';
  static const String tournamentPartnerInvite = 'tournamentPartnerInvite';
  static const String leagueDetail = 'leagueDetail';
  static const String tournamentDiscoveryList = 'tournamentDiscoveryList';
  static const String athleteRanking = 'athleteRanking';
  static const String athleteDiscover = 'athleteDiscover';
  static const String teamDiscover = 'teamDiscover';
  static const String teamProfile = 'teamProfile';
  static const String myTournaments = 'myTournaments';
}
