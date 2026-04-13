import '../../../core/router/routes.dart';

/// Abas do shell inferior (ordem = índice do [StatefulNavigationShell]).
enum ArenaTab {
  dashboard,
  schedule,
  courts,
  bookings,
  settings,
}

extension ArenaTabX on ArenaTab {
  String get location => switch (this) {
        ArenaTab.dashboard => AppRoutes.arenaDashboard,
        ArenaTab.schedule => AppRoutes.arenaSchedule,
        ArenaTab.courts => AppRoutes.arenaCourts,
        ArenaTab.bookings => AppRoutes.arenaBookings,
        ArenaTab.settings => AppRoutes.arenaSettings,
      };

  String get label => switch (this) {
        ArenaTab.dashboard => 'Painel',
        ArenaTab.schedule => 'Agenda',
        ArenaTab.courts => 'Quadras',
        ArenaTab.bookings => 'Reservas',
        ArenaTab.settings => 'Ajustes',
      };
}
