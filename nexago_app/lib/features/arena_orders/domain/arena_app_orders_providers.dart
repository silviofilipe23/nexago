import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/arena_app_orders_service.dart';

/// Peça na quadra (lado atleta) — provider do fluxo de pedido de consumo
/// pelo app. A tela reaproveita direto os providers já existentes do lado
/// gestor para ler catálogo (`arenaProductsStreamProvider`) e a comanda em
/// si (`arenaComandaByBookingIdStreamProvider`, em
/// `arena_comanda_providers.dart`); a única peça nova é o serviço que chama
/// a Cloud Function `addAppOrderItem`.
final arenaAppOrdersServiceProvider = Provider<ArenaAppOrdersService>((ref) {
  return ArenaAppOrdersService();
});
