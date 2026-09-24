import 'arena_access_providers.dart';
import 'arena_staff_role.dart';
import 'arena_tab.dart';

/// Abas que o cargo alcanca, na ordem do shell.
///
/// `accessLoaded: false` devolve TODAS as abas de proposito. A barra nao e
/// fronteira de seguranca — o guard de rota (fail-closed) e as rules sao — e
/// esconder abas no primeiro frame faria o dono ver duas abas piscarem antes
/// das cinco. O inverso vale para dado na tela: numero de dinheiro nega
/// enquanto carrega (ver `arenaCanReadProvider`).
List<ArenaTab> visibleArenaTabs(
  ArenaAccess access, {
  required bool accessLoaded,
}) {
  if (!accessLoaded) return ArenaTab.values;
  return [
    for (final tab in ArenaTab.values)
      if (_isVisible(tab, access)) tab,
  ];
}

bool _isVisible(ArenaTab tab, ArenaAccess access) => switch (tab) {
      ArenaTab.dashboard => true,
      ArenaTab.settings => true,
      ArenaTab.schedule => access.canRead(ArenaArea.agenda),
      ArenaTab.bookings => access.canRead(ArenaArea.agenda),
      ArenaTab.comandas => access.canRead(ArenaArea.comandas),
    };
