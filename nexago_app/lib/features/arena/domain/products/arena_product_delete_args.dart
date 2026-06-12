import 'package:flutter/foundation.dart';

import 'arena_product.dart';

/// Argumentos para a tela pós-exclusão (desfazer).
@immutable
class ArenaProductDeleteArgs {
  const ArenaProductDeleteArgs({
    required this.arenaId,
    required this.product,
  });

  final String arenaId;
  final ArenaProduct product;
}
