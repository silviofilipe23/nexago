import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/auth/auth_providers.dart';

const settledSessionTimeout = Duration(seconds: 8);

/// Espera a primeira resolução do estado de auth (sessão restaurada ou não).
///
/// Toque com o app fechado (push, Quick Action) chega antes do Firebase Auth
/// restaurar a sessão. Navegar nesse instante e deixar o redirect decidir
/// mandava o atleta para o login e o destino se perdia.
Future<bool> awaitSettledSession(WidgetRef ref) async {
  final current = ref.read(authProvider);
  if (!current.isLoading) return current.valueOrNull != null;
  try {
    final user = await ref.read(authProvider.future).timeout(
          settledSessionTimeout,
        );
    return user != null;
  } catch (_) {
    return ref.read(authProvider).valueOrNull != null;
  }
}
