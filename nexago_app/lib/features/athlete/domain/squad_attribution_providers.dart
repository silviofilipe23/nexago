import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/squad_attribution_service.dart';

final squadAttributionServiceProvider = Provider<SquadAttributionService>((
  ref,
) {
  return SquadAttributionService();
});

/// Link de embaixador aberto sem login: gravado quando o atleta entra.
final pendingSquadRefProvider = StateProvider<SquadRef?>((ref) => null);
