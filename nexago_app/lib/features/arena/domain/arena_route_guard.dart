import '../../../core/router/routes.dart';
import 'arena_staff_role.dart';

/// Rotas do painel gestor (`StatefulShell` em `/arena/...`), **não** confundir com
/// `/arena/:arenaId` (atleta).
bool isArenaManagerPanelPath(String path) {
  if (path == '/arena') return true;
  const roots = <String>[
    AppRoutes.arenaDashboard,
    AppRoutes.arenaSchedule,
    AppRoutes.arenaCourts,
    AppRoutes.arenaBookings,
    AppRoutes.arenaClubs,
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
    AppRoutes.arenaOccupancyReport,
  ];
  for (final r in roots) {
    if (path == r || path.startsWith('$r/')) {
      return true;
    }
  }
  return false;
}

/// Sub-rotas de comandas ou reservas (detalhe, wizard, sucesso) ocupam tela
/// cheia sem tab bar.
bool shouldHideArenaShellBottomNav(String path) {
  if (path == AppRoutes.arenaComandas) return false;
  if (path.startsWith('${AppRoutes.arenaComandas}/')) return true;

  if (path == AppRoutes.arenaBookings) return false;
  if (path.startsWith('${AppRoutes.arenaBookings}/')) return true;

  return false;
}

/// Rota do painel -> area do RBAC. Espelha os guards do portal
/// (`frontend/projects/arena/src/app/app.routes.ts`), que e a referencia.
///
/// A ORDEM IMPORTA: o casamento vai do mais especifico para o mais generico.
/// `/arena/profile/followers` e comunidade, nao perfil; `/arena/settings/payments`
/// e financeiro, nao "sem area". Inverter a ordem entrega a tela ao cargo errado
/// sem erro nenhum na tela.
const List<MapEntry<String, ArenaArea>> _arenaAreaByPrefix = [
  MapEntry('/arena/profile/followers', ArenaArea.comunidade),
  MapEntry('/arena/settings/payments', ArenaArea.financeiro),
  MapEntry('/arena/settings/availability', ArenaArea.agenda),
  MapEntry('/arena/profile', ArenaArea.perfil),
  MapEntry('/arena/reviews', ArenaArea.comunidade),
  MapEntry('/arena/relatorios', ArenaArea.financeiro),
  MapEntry('/arena/schedule', ArenaArea.agenda),
  MapEntry('/arena/bookings', ArenaArea.agenda),
  MapEntry('/arena/clubs', ArenaArea.agenda),
  MapEntry('/arena/comandas', ArenaArea.comandas),
  MapEntry('/arena/products', ArenaArea.estoque),
  MapEntry('/arena/courts', ArenaArea.quadras),
];

const List<String> _arenaOwnerOnlyPrefixes = [
  AppRoutes.arenaPlan,
  AppRoutes.arenaSubscriptionPending,
];

bool _matches(String path, String prefix) {
  return path == prefix || path.startsWith('$prefix/');
}

/// Area exigida pela rota; `null` quando a rota nao tem area (Painel, Ajustes)
/// ou quando nao e rota do painel.
ArenaArea? arenaAreaForPath(String path) {
  if (!isArenaManagerPanelPath(path)) return null;
  for (final entry in _arenaAreaByPrefix) {
    if (_matches(path, entry.key)) return entry.value;
  }
  return null;
}

/// Plano e assinatura: so o dono. Mesma fronteira do `arenaOwnerGuard` do portal.
bool isArenaOwnerOnlyPath(String path) {
  for (final prefix in _arenaOwnerOnlyPrefixes) {
    if (_matches(path, prefix)) return true;
  }
  return false;
}
