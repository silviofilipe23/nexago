import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/arenas_providers.dart';

/// Capa e logo da arena já baixados, para entrar na arte do pós-jogo. A arte
/// vira PNG pela captura da tela: imagem de rede que ainda não carregou sairia
/// em branco, então a arte só recebe bytes prontos.
@immutable
class BookingArenaArt {
  const BookingArenaArt({this.cover, this.logo});

  static const none = BookingArenaArt();

  /// `coverUrl` do perfil da arena.
  final Uint8List? cover;

  /// `logoUrl` do perfil da arena.
  final Uint8List? logo;
}

/// Baixa uma imagem; `null` se falhar ou demorar (a arte segue sem ela).
typedef BookingImageBytesLoader = Future<Uint8List?> Function(String url);

final bookingImageBytesLoaderProvider = Provider<BookingImageBytesLoader>(
  (ref) => (url) async {
    try {
      final data = await NetworkAssetBundle(Uri.parse(url))
          .load(url)
          .timeout(const Duration(seconds: 12));
      final bytes = data.buffer.asUint8List();
      return bytes.isEmpty ? null : bytes;
    } catch (_) {
      return null;
    }
  },
);

/// Capa e logo da arena da reserva. Sem arena ou sem imagem: [BookingArenaArt.none].
final bookingArenaArtProvider = FutureProvider.autoDispose
    .family<BookingArenaArt, String>((ref, arenaId) async {
  final id = arenaId.trim();
  if (id.isEmpty) return BookingArenaArt.none;
  final arena = await ref.watch(arenaByIdProvider(id).future);
  if (arena == null) return BookingArenaArt.none;
  final load = ref.watch(bookingImageBytesLoaderProvider);
  final cover = arena.coverUrl;
  final logo = arena.logoUrl;
  final results = await Future.wait([
    cover == null ? Future<Uint8List?>.value() : load(cover),
    logo == null ? Future<Uint8List?>.value() : load(logo),
  ]);
  return BookingArenaArt(cover: results[0], logo: results[1]);
});
