import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/arena_mercadopago_service.dart';

final arenaMercadoPagoServiceProvider = Provider<ArenaMercadoPagoService>((ref) {
  return ArenaMercadoPagoService();
});

/// `true` se o usuário logado tem credenciais MP em `users/{uid}/mercadopago/credentials`.
final mercadoPagoLinkedProvider = FutureProvider.autoDispose<bool>((ref) async {
  return ref.watch(arenaMercadoPagoServiceProvider).isLinked();
});

/// Feedback one-shot após deep link `nexago://mercadopago?mp=...`.
final mercadoPagoOAuthFeedbackProvider = StateProvider<String?>((ref) => null);
