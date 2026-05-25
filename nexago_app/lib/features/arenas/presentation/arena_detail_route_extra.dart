import '../domain/arena_list_item.dart';

/// Parâmetros opcionais ao abrir o detalhe da arena.
class ArenaDetailRouteExtra {
  const ArenaDetailRouteExtra({
    this.arena,
    this.isBestPrice = false,
  });

  final ArenaListItem? arena;
  final bool isBestPrice;
}
