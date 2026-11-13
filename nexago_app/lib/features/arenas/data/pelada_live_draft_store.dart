import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../domain/pelada_live/pelada_live_rules.dart';
import '../domain/pelada_live/pelada_live_session.dart';

/// Onde a marcação ao vivo fica enquanto o jogo rola: fechar o app (ou o
/// celular desligar) não perde a pelada. Só no aparelho — o placar vai para o
/// servidor pelo "Salvar placar" de sempre.
abstract class PeladaLiveDraftStore {
  Future<PeladaLiveSession?> load(String key);
  Future<void> save(String key, PeladaLiveSession session);
  Future<void> clear(String key);

  /// Últimas regras usadas no esporte (a tela de regras abre com elas).
  Future<PeladaLiveRules?> lastRules(String sportKey);
  Future<void> saveRules(String sportKey, PeladaLiveRules rules);
}

/// Chave do rascunho: a reserva; sem reserva (story avulso), uma só.
String peladaLiveDraftKey(String bookingId) {
  final id = bookingId.trim();
  return id.isEmpty ? 'local' : id;
}

class SharedPrefsPeladaLiveDraftStore implements PeladaLiveDraftStore {
  SharedPrefsPeladaLiveDraftStore({DateTime Function()? clock})
      : _clock = clock ?? DateTime.now;

  final DateTime Function() _clock;

  /// Rascunho mais velho que isso é de outra pelada: ignora.
  static const Duration maxAge = Duration(hours: 36);

  static String _draftKey(String key) => 'pelada_live_draft_$key';
  static String _rulesKey(String sport) => 'pelada_live_rules_$sport';

  Future<SharedPreferences?> _prefs() async {
    try {
      return await SharedPreferences.getInstance();
    } catch (_) {
      return null;
    }
  }

  @override
  Future<PeladaLiveSession?> load(String key) async {
    final prefs = await _prefs();
    final raw = prefs?.getString(_draftKey(key));
    if (raw == null) return null;
    try {
      final data = jsonDecode(raw);
      if (data is! Map) return null;
      final saved = data['savedAt'];
      if (saved is! int ||
          _clock().difference(DateTime.fromMillisecondsSinceEpoch(saved)) >
              maxAge) {
        await clear(key);
        return null;
      }
      return PeladaLiveSession.fromJson(data['session']);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> save(String key, PeladaLiveSession session) async {
    final prefs = await _prefs();
    try {
      await prefs?.setString(
        _draftKey(key),
        jsonEncode({
          'savedAt': _clock().millisecondsSinceEpoch,
          'session': session.toJson(),
        }),
      );
    } catch (_) {
      // Sem disco: a marcação continua na tela.
    }
  }

  @override
  Future<void> clear(String key) async {
    final prefs = await _prefs();
    try {
      await prefs?.remove(_draftKey(key));
    } catch (_) {}
  }

  @override
  Future<PeladaLiveRules?> lastRules(String sportKey) async {
    final prefs = await _prefs();
    final raw = prefs?.getString(_rulesKey(sportKey));
    if (raw == null) return null;
    try {
      return PeladaLiveRules.fromJson(jsonDecode(raw));
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> saveRules(String sportKey, PeladaLiveRules rules) async {
    final prefs = await _prefs();
    try {
      await prefs?.setString(_rulesKey(sportKey), jsonEncode(rules.toJson()));
    } catch (_) {}
  }
}

final peladaLiveDraftStoreProvider = Provider<PeladaLiveDraftStore>(
  (ref) => SharedPrefsPeladaLiveDraftStore(),
);

/// Marcação ao vivo guardada no aparelho para a reserva [bookingId] (a Agenda
/// troca "Marcar ao vivo" por "Continuar marcação"). Invalidar depois do fluxo.
final peladaLiveDraftProvider = FutureProvider.autoDispose
    .family<PeladaLiveSession?, String>((ref, bookingId) {
  if (bookingId.trim().isEmpty) return Future.value();
  return ref.watch(peladaLiveDraftStoreProvider).load(
        peladaLiveDraftKey(bookingId),
      );
});
