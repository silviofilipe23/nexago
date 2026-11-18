import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../domain/booking_result.dart';
import '../domain/booking_result_json.dart';

/// O placar do "Lançar placar" (times e jogos digitados) guardado a cada
/// mudança: sair da tela ou fechar o app não perde os jogos. Fica só no
/// aparelho até o envio, que apaga o rascunho.
@immutable
class LancarPlacarDraft {
  const LancarPlacarDraft({required this.result, required this.baseVersion});

  final BookingResult result;

  /// Versão do placar salvo no servidor quando o rascunho começou (`0` =
  /// nenhum). Se outro celular enviou depois, o rascunho ficou velho.
  final int baseVersion;
}

abstract class LancarPlacarDraftStore {
  Future<LancarPlacarDraft?> load(String bookingId);
  Future<void> save(String bookingId, LancarPlacarDraft draft);
  Future<void> clear(String bookingId);
}

class SharedPrefsLancarPlacarDraftStore implements LancarPlacarDraftStore {
  SharedPrefsLancarPlacarDraftStore({DateTime Function()? clock})
      : _clock = clock ?? DateTime.now;

  final DateTime Function() _clock;

  /// Depois disso a pelada já passou de vez: o rascunho é lixo.
  static const Duration maxAge = Duration(days: 7);

  static String _key(String bookingId) => 'lancar_placar_draft_$bookingId';

  Future<SharedPreferences?> _prefs() async {
    try {
      return await SharedPreferences.getInstance();
    } catch (_) {
      return null;
    }
  }

  @override
  Future<LancarPlacarDraft?> load(String bookingId) async {
    final id = bookingId.trim();
    if (id.isEmpty) return null;
    final prefs = await _prefs();
    final raw = prefs?.getString(_key(id));
    if (raw == null) return null;
    try {
      final data = jsonDecode(raw);
      if (data is! Map || data['v'] != 1) return null;
      final saved = data['savedAt'];
      if (saved is! int ||
          _clock().difference(DateTime.fromMillisecondsSinceEpoch(saved)) >
              maxAge) {
        await clear(id);
        return null;
      }
      final result = data['result'];
      if (result is! Map) return null;
      final base = data['baseVersion'];
      return LancarPlacarDraft(
        result: bookingResultFromJson(result),
        baseVersion: base is int ? base : 0,
      );
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> save(String bookingId, LancarPlacarDraft draft) async {
    final id = bookingId.trim();
    if (id.isEmpty) return;
    final prefs = await _prefs();
    try {
      await prefs?.setString(
        _key(id),
        jsonEncode({
          'v': 1,
          'savedAt': _clock().millisecondsSinceEpoch,
          'baseVersion': draft.baseVersion,
          'result': bookingResultToJson(draft.result),
        }),
      );
    } catch (_) {
      // Sem disco: o placar continua na tela.
    }
  }

  @override
  Future<void> clear(String bookingId) async {
    final id = bookingId.trim();
    if (id.isEmpty) return;
    final prefs = await _prefs();
    try {
      await prefs?.remove(_key(id));
    } catch (_) {}
  }
}

final lancarPlacarDraftStoreProvider = Provider<LancarPlacarDraftStore>(
  (ref) => SharedPrefsLancarPlacarDraftStore(),
);

/// Rascunho do placar da reserva [bookingId] (só lido ao abrir a tela).
final lancarPlacarDraftProvider = FutureProvider.autoDispose
    .family<LancarPlacarDraft?, String>((ref, bookingId) {
  if (bookingId.trim().isEmpty) return Future.value();
  return ref.watch(lancarPlacarDraftStoreProvider).load(bookingId);
});

/// O rascunho vale enquanto ninguém enviou um placar novo depois dele.
BookingResult? lancarDraftToResume(
  LancarPlacarDraft? draft, {
  required int savedVersion,
}) {
  if (draft == null || draft.baseVersion != savedVersion) return null;
  if (draft.result.teams.length < 2) return null;
  return draft.result;
}
