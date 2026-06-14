import 'package:flutter/foundation.dart';

import 'arena_comanda.dart';

@immutable
class ArenaComandaCreatedArgs {
  const ArenaComandaCreatedArgs({
    required this.comanda,
  });

  final ArenaComanda comanda;
}
