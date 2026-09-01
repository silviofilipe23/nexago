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

  /// Home do organizador de torneio.
  static const String organizerHome = '/organizer';
  static const String organizerWallet = '/organizer/wallet';
  static const String organizerCreate = '/organizer/create';
  static const String organizerTournamentCreateExpress =
      '/organizer/tournaments/new/express';
  static const String organizerTournamentCreateIdentity =
      '/organizer/tournaments/new/identity';
  static const String organizerTournamentCreateLocation =
      '/organizer/tournaments/new/location';
  static const String organizerTournamentCreateCategories =
      '/organizer/tournaments/new/categories';
  static const String organizerTournamentCreateFormat =
      '/organizer/tournaments/new/format';
  static const String organizerTournamentCreateRegistration =
      '/organizer/tournaments/new/registration';
  static const String organizerTournamentCreatePrizes =
      '/organizer/tournaments/new/prizes';
  static const String organizerTournamentCreateRules =
      '/organizer/tournaments/new/rules';
  static const String organizerTournamentCreateReview =
      '/organizer/tournaments/new/review';
  static const String organizerTournamentPublished =
      '/organizer/tournaments/published';
  static const String organizerLeagueCreateIdentity =
      '/organizer/leagues/new/identity';
  static const String organizerLeagueCreateSeason =
      '/organizer/leagues/new/season';
  static const String organizerLeagueCreateCategories =
      '/organizer/leagues/new/categories';
  static const String organizerLeagueCreateRanking =
      '/organizer/leagues/new/ranking';
  static const String organizerLeagueCreateStages =
      '/organizer/leagues/new/stages';
  static const String organizerLeagueCreateReview =
      '/organizer/leagues/new/review';
  static const String organizerLeaguePublished = '/organizer/leagues/published';
  static const String organizerLeagueStageCreateLocation =
      '/organizer/leagues/:leagueId/stages/new/location';
  static const String organizerLeagueStageCreateCategories =
      '/organizer/leagues/:leagueId/stages/new/categories';
  static const String organizerLeagueStageCreateReview =
      '/organizer/leagues/:leagueId/stages/new/review';
  static const String organizerLeagueStagePublished =
      '/organizer/leagues/:leagueId/stages/published';

  /// Detalhe operacional do torneio (A3).
  static const String organizerTournamentDetail =
      '/organizer/tournaments/:tournamentId';

  static const String organizerTournamentUniforms =
      '/organizer/tournaments/:tournamentId/uniforms';

  static const String organizerTournamentCategories =
      '/organizer/tournaments/:tournamentId/categories';

  static const String organizerTournamentOverview =
      '/organizer/tournaments/:tournamentId/overview';

  static const String organizerTournamentFinancial =
      '/organizer/tournaments/:tournamentId/financial';

  static const String organizerTournamentOperations =
      '/organizer/tournaments/:tournamentId/operations';

  static const String organizerTournamentStaff =
      '/organizer/tournaments/:tournamentId/staff';

  static const String organizerTournamentAnnounce =
      '/organizer/tournaments/:tournamentId/announce';

  /// Shell da categoria (E1).
  static const String organizerCategoryShell =
      '/organizer/tournaments/:tournamentId/categories/:categoryId';

  static const String organizerCategorySeeding =
      '/organizer/tournaments/:tournamentId/categories/:categoryId/seeding';

  static const String organizerCategoryGenerateBracket =
      '/organizer/tournaments/:tournamentId/categories/:categoryId/generate-bracket';

  static const String organizerCategoryFormat =
      '/organizer/tournaments/:tournamentId/categories/:categoryId/format';

  static const String organizerCategoryCommunicate =
      '/organizer/tournaments/:tournamentId/categories/:categoryId/communicate';

  static const String organizerCategoryBracket =
      '/organizer/tournaments/:tournamentId/categories/:categoryId/bracket';

  static const String organizerCategoryTeams =
      '/organizer/tournaments/:tournamentId/categories/:categoryId/teams';

  static const String organizerCategoryPayments =
      '/organizer/tournaments/:tournamentId/categories/:categoryId/payments';

  /// Central de partidas (G1).
  static const String organizerMatchCenter =
      '/organizer/tournaments/:tournamentId/matches';

  static const String organizerMatchQueue =
      '/organizer/tournaments/:tournamentId/matches/queue';

  static const String organizerMatchCourts =
      '/organizer/tournaments/:tournamentId/matches/courts';

  static const String organizerMatchSchedule =
      '/organizer/tournaments/:tournamentId/matches/schedule';

  static const String organizerMatchSchedulePick =
      '/organizer/tournaments/:tournamentId/matches/schedule/pick';

  static const String organizerMatchScheduleTime =
      '/organizer/tournaments/:tournamentId/matches/schedule/pick/:matchId/time';

  static const String organizerMatchAutoSchedule =
      '/organizer/tournaments/:tournamentId/matches/auto-schedule';

  static const String organizerMatchInsights =
      '/organizer/tournaments/:tournamentId/matches/insights';

  static const String organizerMatchCheckIn =
      '/organizer/tournaments/:tournamentId/matches/:matchId/check-in';

  static const String organizerMatchLive =
      '/organizer/tournaments/:tournamentId/matches/:matchId/live';

  static const String organizerMatchQuickScore =
      '/organizer/tournaments/:tournamentId/matches/:matchId/quick-score';

  static const String organizerMatchValidate =
      '/organizer/tournaments/:tournamentId/matches/:matchId/validate';

  static const String organizerMatchSummary =
      '/organizer/tournaments/:tournamentId/matches/:matchId/summary';

  /// Transmissão pública (J2).
  static const String publicMatchLive =
      '/torneios/:tournamentId/ao-vivo/:matchId';

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

  /// Convide um amigo (programa de indicação).
  static const String athleteReferral = '/athlete/referral';

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

  /// Trilha de elos (sistema de elos da gamificação).
  static const String athleteRankTrack = '/athlete/rank';

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
  static const String athleteOnboardingLevel = '/athlete/onboarding/level';
  static const String athleteOnboardingProfile = '/athlete/onboarding/profile';

  // --- Painel da arena (gestor) — literais antes de [arenaDetail] no router ---

  static const String arenaDashboard = '/arena/dashboard';
  static const String arenaSchedule = '/arena/schedule';
  static const String arenaComandas = '/arena/comandas';
  static const String arenaCourts = '/arena/courts';
  static const String arenaBookings = '/arena/bookings';

  /// Detalhe de reserva (gestor): `/arena/bookings/detail/:bookingId`
  static const String arenaBookingDetail = '/arena/bookings/detail/:bookingId';

  /// Horários fixos / mensalistas (gestor).
  static const String arenaRecurring = '/arena/bookings/recurring';
  static const String arenaRecurringNew = '/arena/bookings/recurring/new';
  static const String arenaRecurringCreated = '/arena/bookings/recurring/created';
  static const String arenaRecurringDetail =
      '/arena/bookings/recurring/series/:seriesId';

  /// Pós-cancelamento com undo: `/arena/bookings/canceled`
  static const String arenaBookingCanceled = '/arena/bookings/canceled';

  // --- Clubinho (gestor) — literais antes de [arenaDetail] no router ---
  static const String arenaClubs = '/arena/clubs';
  static const String arenaClubNew = '/arena/clubs/new';

  /// Sessão do clubinho (gestor): `/arena/clubs/session/:sessionId`
  static const String arenaClubSession = '/arena/clubs/session/:sessionId';
  static const String arenaClubDetail = '/arena/clubs/:clubId';
  static const String arenaClubEdit = '/arena/clubs/:clubId/edit';

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

  /// Relatórios de ocupação de quadra (gestor). Literal antes de [arenaDetail].
  static const String arenaOccupancyReport = '/arena/relatorios';

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

  /// Clubinho (atleta): sessão com lista pública e PIX por vaga.
  static const String clubSession = '/clubinho/:sessionId';
  static const String clubSessionPix = '/clubinho/:sessionId/pix';

  /// Pagamentos / saldo (gestor). Filha de [arenaSettings] — evita conflito com `/arena/:arenaId`.
  static const String arenaPayments = '/arena/settings/payments';

  /// Plano/assinatura da arena (gestor). Filha de [arenaSettings].
  static const String arenaPlan = '/arena/settings/plan';

  /// Celebração pós-ativação do plano pago.
  static const String arenaPlanActivated = '/arena/settings/plan/activated';

  /// Aguardando confirmação PIX/cartão da assinatura.
  static const String arenaSubscriptionPending =
      '/arena/settings/plan/pending';

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

  /// Pós-registro de movimentação de estoque.
  static const String arenaStockMovementRegistered =
      '/arena/products/movement-registered';

  /// Nova comanda — wizard (gestor).
  static const String arenaComandaNewType = '/arena/comandas/new/type';
  static const String arenaComandaNewLink = '/arena/comandas/new/link';
  static const String arenaComandaNewCustomer = '/arena/comandas/new/customer';
  static const String arenaComandaNewReview = '/arena/comandas/new/review';
  static const String arenaComandaOpened = '/arena/comandas/opened';
  static const String arenaComandaDetail = '/arena/comandas/:comandaId';
  static const String arenaComandaQuickAdd =
      '/arena/comandas/:comandaId/quick-add';
  static const String arenaComandaPayment =
      '/arena/comandas/:comandaId/payment';
  static const String arenaComandaClosed =
      '/arena/comandas/:comandaId/closed';

  /// Bloqueio do atleta ao tentar reservar.
  static const String arenaBookingBlocked = '/arena/:arenaId/book/blocked';

  /// Legado: manter rota simples se necessário.
  static const String bookingSuccess = '/booking/success';

  /// Convite para jogar: `/convite/:inviteId`
  static const String bookingInvite = '/convite/:inviteId';

  /// Bora Jogar (match finder): hub, builder e detalhe.
  /// `friendlyMatchNew` é literal e deve vir ANTES de [friendlyMatchDetail]
  /// no router (senão "novo" casa como :matchId).
  static const String friendlyMatchHub = '/bora-jogar';
  static const String friendlyMatchNew = '/bora-jogar/novo';
  static const String friendlyMatchDetail = '/bora-jogar/:matchId';

  /// Detalhe de torneio: `/torneios/:tournamentId`
  static const String tournamentDetail = '/torneios/:tournamentId';

  /// Categorias do torneio: `/torneios/:tournamentId/categorias`
  static const String tournamentCategories =
      '/torneios/:tournamentId/categorias';

  /// "Hoje" do torneio: `/torneios/:tournamentId/hoje`
  static const String tournamentToday = '/torneios/:tournamentId/hoje';

  /// Modo Focus:
  /// `/torneios/:tournamentId/focus?secao=agora|trajetoria|grupo|chave|arena`
  static const String tournamentFocus = '/torneios/:tournamentId/focus';

  /// Query que escolhe a seção de entrada do Modo Focus.
  static const String focusSectionQuery = 'secao';

  /// "Minha inscrição": `/torneios/:tournamentId/minha-inscricao`
  static const String tournamentMyRegistration =
      '/torneios/:tournamentId/minha-inscricao';

  /// Visão da categoria (Partidas/Grupos/Chave):
  /// `/torneios/:tournamentId/categorias/:categoryId`
  static const String tournamentCategoryView =
      '/torneios/:tournamentId/categorias/:categoryId';

  /// Visão do grupo (cascata Torneio → Categoria → Grupo):
  /// `/torneios/:tournamentId/categorias/:categoryId/grupos/:poolId`
  static const String tournamentGroupView =
      '/torneios/:tournamentId/categorias/:categoryId/grupos/:poolId';

  /// Chave do torneio: `/torneios/:tournamentId/chave`
  static const String tournamentBracket = '/torneios/:tournamentId/chave';

  /// Grupos do torneio: `/torneios/:tournamentId/grupos`
  static const String tournamentGroups = '/torneios/:tournamentId/grupos';

  /// Premiação do torneio: `/torneios/:tournamentId/premiacao`
  static const String tournamentPrizes = '/torneios/:tournamentId/premiacao';

  /// Palpites da torcida no chaveamento: `/torneios/:tournamentId/palpites`
  static const String tournamentPredictions =
      '/torneios/:tournamentId/palpites';

  /// Chave interativa (dupla eliminatória): `/torneios/:tournamentId/chave/:categoryId`
  static const String tournamentDoubleEliminationBracket =
      '/torneios/:tournamentId/chave/:categoryId';

  /// Inscrição: `/torneios/:tournamentId/inscricao`
  static const String tournamentRegistration =
      '/torneios/:tournamentId/inscricao';

  /// Pagamento da inscrição: `/torneios/:tournamentId/inscricao/pagamento`
  static const String tournamentRegistrationPayment =
      '/torneios/:tournamentId/inscricao/pagamento';

  /// PIX da inscrição: `/torneios/:tournamentId/inscricao/pix`
  static const String tournamentRegistrationPix =
      '/torneios/:tournamentId/inscricao/pix';

  /// Sucesso da inscrição: `/torneios/:tournamentId/inscricao/sucesso`
  static const String tournamentRegistrationSuccess =
      '/torneios/:tournamentId/inscricao/sucesso';

  /// Detalhe da inscrição confirmada (mockup 1 da jornada de substituição):
  /// `/torneios/:tournamentId/inscricao/:registrationId/detalhe`
  static const String tournamentRegistrationDetail =
      '/torneios/:tournamentId/inscricao/:registrationId/detalhe';

  /// Wizard de substituição (Task 5):
  /// `/torneios/:tournamentId/inscricao/:registrationId/substituir`
  static const String tournamentSubstitutionWizard =
      '/torneios/:tournamentId/inscricao/:registrationId/substituir';

  /// Passo 1 do wizard: `/torneios/:tournamentId/inscricao/categoria`
  static const String tournamentRegistrationCategory =
      '/torneios/:tournamentId/inscricao/categoria';

  /// Consentimento LGPD: `/torneios/:tournamentId/inscricao/consentimento`
  static const String tournamentRegistrationConsent =
      '/torneios/:tournamentId/inscricao/consentimento';

  /// Condições da inscrição: `/torneios/:tournamentId/inscricao/condicoes`
  static const String tournamentRegistrationTerms =
      '/torneios/:tournamentId/inscricao/condicoes';

  /// Parceiro/elenco: `/torneios/:tournamentId/inscricao/parceiro`
  static const String tournamentRegistrationPartner =
      '/torneios/:tournamentId/inscricao/parceiro';

  /// Uniforme: `/torneios/:tournamentId/inscricao/uniforme`
  static const String tournamentRegistrationUniform =
      '/torneios/:tournamentId/inscricao/uniforme';

  /// Acompanhamento da substituição (Task 6):
  /// `/torneios/:tournamentId/substituicao/:inviteId`
  static const String tournamentSubstitutionStatus =
      '/torneios/:tournamentId/substituicao/:inviteId';

  /// Convite de dupla por LINK (parceiro sem conta): `/convite-dupla/:externalInviteId`
  static const String tournamentExternalInvite =
      '/convite-dupla/:externalInviteId';

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
  static const String organizerWallet = 'organizerWallet';
  static const String organizerCreate = 'organizerCreate';
  static const String organizerTournamentCreateExpress =
      'organizerTournamentCreateExpress';
  static const String organizerTournamentCreateIdentity =
      'organizerTournamentCreateIdentity';
  static const String organizerTournamentCreateLocation =
      'organizerTournamentCreateLocation';
  static const String organizerTournamentCreateCategories =
      'organizerTournamentCreateCategories';
  static const String organizerTournamentCreateFormat =
      'organizerTournamentCreateFormat';
  static const String organizerTournamentCreateRegistration =
      'organizerTournamentCreateRegistration';
  static const String organizerTournamentCreatePrizes =
      'organizerTournamentCreatePrizes';
  static const String organizerTournamentCreateRules =
      'organizerTournamentCreateRules';
  static const String organizerTournamentCreateReview =
      'organizerTournamentCreateReview';
  static const String organizerTournamentPublished =
      'organizerTournamentPublished';
  static const String organizerLeagueCreateIdentity =
      'organizerLeagueCreateIdentity';
  static const String organizerLeagueCreateSeason = 'organizerLeagueCreateSeason';
  static const String organizerLeagueCreateCategories =
      'organizerLeagueCreateCategories';
  static const String organizerLeagueCreateRanking =
      'organizerLeagueCreateRanking';
  static const String organizerLeagueCreateStages =
      'organizerLeagueCreateStages';
  static const String organizerLeagueCreateReview = 'organizerLeagueCreateReview';
  static const String organizerLeaguePublished = 'organizerLeaguePublished';
  static const String organizerLeagueStageCreateLocation =
      'organizerLeagueStageCreateLocation';
  static const String organizerLeagueStageCreateCategories =
      'organizerLeagueStageCreateCategories';
  static const String organizerLeagueStageCreateReview =
      'organizerLeagueStageCreateReview';
  static const String organizerLeagueStagePublished =
      'organizerLeagueStagePublished';
  static const String organizerTournamentDetail = 'organizerTournamentDetail';
  static const String organizerTournamentUniforms = 'organizerTournamentUniforms';
  static const String organizerTournamentCategories =
      'organizerTournamentCategories';
  static const String organizerTournamentOverview = 'organizerTournamentOverview';
  static const String organizerTournamentFinancial = 'organizerTournamentFinancial';
  static const String organizerTournamentOperations =
      'organizerTournamentOperations';
  static const String organizerTournamentStaff = 'organizerTournamentStaff';
  static const String organizerTournamentAnnounce =
      'organizerTournamentAnnounce';
  static const String organizerCategoryShell = 'organizerCategoryShell';
  static const String organizerCategorySeeding = 'organizerCategorySeeding';
  static const String organizerCategoryGenerateBracket =
      'organizerCategoryGenerateBracket';
  static const String organizerCategoryFormat = 'organizerCategoryFormat';
  static const String organizerCategoryCommunicate =
      'organizerCategoryCommunicate';
  static const String organizerCategoryBracket = 'organizerCategoryBracket';
  static const String organizerCategoryTeams = 'organizerCategoryTeams';
  static const String organizerCategoryPayments = 'organizerCategoryPayments';
  static const String organizerMatchCenter = 'organizerMatchCenter';
  static const String organizerMatchQueue = 'organizerMatchQueue';
  static const String organizerMatchCourts = 'organizerMatchCourts';
  static const String organizerMatchSchedule = 'organizerMatchSchedule';
  static const String organizerMatchSchedulePick = 'organizerMatchSchedulePick';
  static const String organizerMatchScheduleTime = 'organizerMatchScheduleTime';
  static const String organizerMatchAutoSchedule = 'organizerMatchAutoSchedule';
  static const String organizerMatchInsights = 'organizerMatchInsights';
  static const String organizerMatchCheckIn = 'organizerMatchCheckIn';
  static const String organizerMatchLive = 'organizerMatchLive';
  static const String organizerMatchQuickScore = 'organizerMatchQuickScore';
  static const String organizerMatchValidate = 'organizerMatchValidate';
  static const String organizerMatchSummary = 'organizerMatchSummary';
  static const String publicMatchLive = 'publicMatchLive';
  static const String myBookings = 'myBookings';
  static const String favoriteArenas = 'favoriteArenas';
  static const String athleteProfile = 'athleteProfile';
  static const String athleteProfileEdit = 'athleteProfileEdit';
  static const String athleteCompleteProfile = 'athleteCompleteProfile';
  static const String athleteProfileGoals = 'athleteProfileGoals';
  static const String athleteAchievements = 'athleteAchievements';
  static const String athleteSettings = 'athleteSettings';
  static const String athleteReferral = 'athleteReferral';
  static const String athleteSportsLevels = 'athleteSportsLevels';
  static const String athleteNotificationSettings =
      'athleteNotificationSettings';
  static const String athleteNotifications = 'athleteNotifications';
  static const String athletePrivacySecurity = 'athletePrivacySecurity';
  static const String athleteChangePassword = 'athleteChangePassword';
  static const String athleteActiveSessions = 'athleteActiveSessions';
  static const String athleteQuest = 'athleteQuest';
  static const String athleteRankTrack = 'athleteRankTrack';
  static const String athleteMatchHistory = 'athleteMatchHistory';
  static const String athleteMatchDetail = 'athleteMatchDetail';
  static const String athleteMatchPlayByPlay = 'athleteMatchPlayByPlay';
  static const String athleteTournamentDetail = 'athleteTournamentDetail';
  static const String athleteProfileUpdateSuccess =
      'athleteProfileUpdateSuccess';
  static const String athleteOnboardingWelcome = 'athleteOnboardingWelcome';
  static const String athleteOnboardingPrimarySport =
      'athleteOnboardingPrimarySport';
  static const String athleteOnboardingLevel = 'athleteOnboardingLevel';
  static const String athleteOnboardingProfile = 'athleteOnboardingProfile';

  static const String arenaDashboard = 'arenaDashboard';
  static const String arenaSchedule = 'arenaSchedule';
  static const String arenaComandas = 'arenaComandas';
  static const String arenaCourts = 'arenaCourts';
  static const String arenaBookings = 'arenaBookings';
  static const String arenaBookingDetail = 'arenaBookingDetail';
  static const String arenaBookingCanceled = 'arenaBookingCanceled';
  static const String arenaRecurring = 'arenaRecurring';
  static const String arenaRecurringNew = 'arenaRecurringNew';
  static const String arenaRecurringCreated = 'arenaRecurringCreated';
  static const String arenaRecurringDetail = 'arenaRecurringDetail';
  static const String arenaClubs = 'arenaClubs';
  static const String arenaClubNew = 'arenaClubNew';
  static const String arenaClubDetail = 'arenaClubDetail';
  static const String arenaClubEdit = 'arenaClubEdit';
  static const String arenaClubSession = 'arenaClubSession';
  static const String clubSession = 'clubSession';
  static const String clubSessionPix = 'clubSessionPix';
  static const String arenaSettings = 'arenaSettings';
  static const String arenaAvailabilitySettings = 'arenaAvailabilitySettings';
  static const String arenaAvailabilitySlotsSuccess =
      'arenaAvailabilitySlotsSuccess';
  static const String arenaProfile = 'arenaProfile';
  static const String arenaFollowers = 'arenaFollowers';
  static const String arenaManagerReviews = 'arenaManagerReviews';
  static const String arenaOccupancyReport = 'arenaOccupancyReport';
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
  static const String arenaPlan = 'arenaPlan';
  static const String arenaPlanActivated = 'arenaPlanActivated';
  static const String arenaSubscriptionPending = 'arenaSubscriptionPending';
  static const String arenaProducts = 'arenaProducts';
  static const String arenaProductNew = 'arenaProductNew';
  static const String arenaProductEdit = 'arenaProductEdit';
  static const String arenaProductStock = 'arenaProductStock';
  static const String arenaProductRestock = 'arenaProductRestock';
  static const String arenaProductDeleted = 'arenaProductDeleted';
  static const String arenaStockMovementRegistered =
      'arenaStockMovementRegistered';
  static const String arenaComandaNewType = 'arenaComandaNewType';
  static const String arenaComandaNewLink = 'arenaComandaNewLink';
  static const String arenaComandaNewCustomer = 'arenaComandaNewCustomer';
  static const String arenaComandaNewReview = 'arenaComandaNewReview';
  static const String arenaComandaOpened = 'arenaComandaOpened';
  static const String arenaComandaDetail = 'arenaComandaDetail';
  static const String arenaComandaQuickAdd = 'arenaComandaQuickAdd';
  static const String arenaComandaPayment = 'arenaComandaPayment';
  static const String arenaComandaClosed = 'arenaComandaClosed';
  static const String arenaBookingBlocked = 'arenaBookingBlocked';
  static const String bookingSuccess = 'bookingSuccess';
  static const String bookingInvite = 'bookingInvite';
  static const String friendlyMatchHub = 'friendlyMatchHub';
  static const String friendlyMatchNew = 'friendlyMatchNew';
  static const String friendlyMatchDetail = 'friendlyMatchDetail';
  static const String tournamentDetail = 'tournamentDetail';
  static const String tournamentCategories = 'tournamentCategories';
  static const String tournamentCategoryView = 'tournamentCategoryView';
  static const String tournamentGroupView = 'tournamentGroupView';
  static const String tournamentToday = 'tournamentToday';
  static const String tournamentFocus = 'tournamentFocus';
  static const String tournamentMyRegistration = 'tournamentMyRegistration';
  static const String tournamentBracket = 'tournamentBracket';
  static const String tournamentGroups = 'tournamentGroups';
  static const String tournamentPrizes = 'tournamentPrizes';
  static const String tournamentPredictions = 'tournamentPredictions';
  static const String tournamentDoubleEliminationBracket =
      'tournamentDoubleEliminationBracket';
  static const String tournamentRegistration = 'tournamentRegistration';
  static const String tournamentRegistrationPayment =
      'tournamentRegistrationPayment';
  static const String tournamentRegistrationPix = 'tournamentRegistrationPix';
  static const String tournamentRegistrationSuccess =
      'tournamentRegistrationSuccess';
  static const String tournamentRegistrationDetail =
      'tournamentRegistrationDetail';
  static const String tournamentSubstitutionWizard =
      'tournamentSubstitutionWizard';
  static const String tournamentSubstitutionStatus =
      'tournamentSubstitutionStatus';
  static const String tournamentRegistrationCategory =
      'tournamentRegistrationCategory';
  static const String tournamentRegistrationConsent =
      'tournamentRegistrationConsent';
  static const String tournamentRegistrationTerms =
      'tournamentRegistrationTerms';
  static const String tournamentRegistrationPartner =
      'tournamentRegistrationPartner';
  static const String tournamentRegistrationUniform =
      'tournamentRegistrationUniform';
  static const String tournamentPartnerInvite = 'tournamentPartnerInvite';
  static const String tournamentExternalInvite =
      'tournamentExternalInvite';
  static const String leagueDetail = 'leagueDetail';
  static const String tournamentDiscoveryList = 'tournamentDiscoveryList';
  static const String athleteRanking = 'athleteRanking';
  static const String athleteDiscover = 'athleteDiscover';
  static const String teamDiscover = 'teamDiscover';
  static const String teamProfile = 'teamProfile';
  static const String myTournaments = 'myTournaments';
}

/// Tela de acompanhamento da substituição (`AppRoutes.tournamentSubstitutionStatus`)
/// já está registrada no GoRouter (Task 6) — o passo 2 do wizard
/// (`tournament_substitution_pick_page.dart`) navega pra ela depois do envio.
const bool kSubstitutionStatusRouteReady = true;
