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
    AppRoutes.arenaAvailabilitySettings,
    AppRoutes.arenaAvailabilitySlotsSuccess,
    AppRoutes.arenaProfile,
    AppRoutes.arenaProfileEdit,
    AppRoutes.arenaProfileUpdateSuccess,
  ];
  for (final r in roots) {
    if (path == r || path.startsWith('$r/')) {
      return true;
    }
  }
  return false;
}
