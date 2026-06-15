import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Rota interna pendente enquanto o usuário faz login após abrir um deep link.
final pendingDeepLinkPathProvider = StateProvider<String?>((ref) => null);
