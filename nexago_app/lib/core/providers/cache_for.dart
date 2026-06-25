import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Mantém um provider `autoDispose` vivo por [ttl] após o último ouvinte sair,
/// em vez de descartá-lo imediatamente.
///
/// Use em providers de dados lidos no caminho de navegação (perfil, listas,
/// detalhe): ao sair e reentrar na tela dentro da janela, o dado já está em
/// cache (e, para StreamProviders, o listener segue vivo e atualizado), tornando
/// a troca de telas instantânea. O TTL limita memória/listeners.
///
/// Padrão Riverpod (keepAlive + Timer). Chame como primeira linha do provider:
/// ```dart
/// final fooProvider = StreamProvider.autoDispose((ref) {
///   cacheFor(ref);
///   return ...;
/// });
/// ```
void cacheFor(Ref ref, [Duration ttl = const Duration(seconds: 90)]) {
  final link = ref.keepAlive();
  final timer = Timer(ttl, link.close);
  ref.onDispose(timer.cancel);
}
