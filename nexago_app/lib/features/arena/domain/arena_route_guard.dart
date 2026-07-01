import '../../../core/router/routes.dart';

/// Rotas do painel gestor (`StatefulShell` em `/arena/...`), **não** confundir com
/// `/arena/:arenaId` (atleta).
bool isArenaManagerPanelPath(String path) {
  if (path == '/arena') return true;
  const roots = <String>[
    AppRoutes.arenaDashboard,
    AppRoutes.arenaSchedule,
    AppRoutes.arenaCourts,
    AppRoutes.arenaBookings,
    AppRoutes.arenaSettings,
    AppRoutes.arenaPayments,
    AppRoutes.arenaPlan,
    AppRoutes.arenaPlanActivated,
    AppRoutes.arenaSubscriptionPending,
    AppRoutes.arenaProducts,
    AppRoutes.arenaComandas,
    AppRoutes.arenaProductNew,
    AppRoutes.arenaProductStock,
    AppRoutes.arenaAvailabilitySettings,
    AppRoutes.arenaAvailabilitySlotsSuccess,
    AppRoutes.arenaProfile,
    AppRoutes.arenaProfileEdit,
    AppRoutes.arenaProfileUpdateSuccess,
    AppRoutes.arenaManagerReviews,
    AppRoutes.arenaFollowers,
  ];
  for (final r in roots) {
    if (path == r || path.startsWith('$r/')) {
      return true;
    }
  }
  return false;
}

/// Sub-rotas de comandas (wizard, sucesso, detalhe) ocupam tela cheia sem tab bar.
bool shouldHideArenaShellBottomNav(String path) {
  if (path == AppRoutes.arenaComandas) return false;
  return path.startsWith('${AppRoutes.arenaComandas}/');
}
