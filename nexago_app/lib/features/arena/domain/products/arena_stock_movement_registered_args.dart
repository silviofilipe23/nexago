import 'package:flutter/foundation.dart';

import 'arena_stock_movement.dart';

/// Argumentos da tela pós-registro de movimentação de estoque.
@immutable
class ArenaStockMovementRegisteredArgs {
  const ArenaStockMovementRegisteredArgs({
    required this.productName,
    this.productEmoji,
    this.productImageUrl,
    required this.type,
    required this.quantityDelta,
    required this.quantityBefore,
    required this.quantityAfter,
    required this.priceCents,
    required this.registeredAt,
  });

  final String productName;
  final String? productEmoji;
  final String? productImageUrl;
  final ArenaStockMovementType type;
  final int quantityDelta;
  final int quantityBefore;
  final int quantityAfter;
  final int priceCents;
  final DateTime registeredAt;

  int get totalNoteCents => priceCents * quantityDelta.abs();
}
