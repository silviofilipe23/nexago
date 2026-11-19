import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Quantas dispensas guardar por conta: o convite só olha reservas de até 30
/// dias, então as mais antigas não fazem falta.
const int arenaReviewPromptStoreLimit = 40;

/// Reservas cujo convite "Como foi?" o atleta dispensou ("Agora não"). Fica no
/// aparelho, por conta: dispensar vale para aquela reserva, e a próxima reserva
/// concluída volta a perguntar.
abstract interface class ArenaReviewPromptStore {
  Future<Set<String>> dismissed(String uid);
  Future<void> dismiss(String uid, String bookingId);
}

/// [ArenaReviewPromptStore] no `SharedPreferences`. Sem o canal nativo (hot
/// restart, teste sem mock), guarda em memória até o app fechar.
class SharedPrefsArenaReviewPromptStore implements ArenaReviewPromptStore {
  Future<SharedPreferences?>? _prefs;
  final _memory = <String, List<String>>{};

  Future<SharedPreferences?> _load() => _prefs ??= () async {
        try {
          return await SharedPreferences.getInstance();
        } on PlatformException {
          return null;
        } on MissingPluginException {
          return null;
        }
      }();

  static String _key(String uid) => 'arena_review_prompt_dismissed_$uid';

  Future<List<String>> _ids(String uid) async {
    final memory = _memory[uid];
    if (memory != null) return memory;
    final prefs = await _load();
    return [...?prefs?.getStringList(_key(uid))];
  }

  @override
  Future<Set<String>> dismissed(String uid) async => {...await _ids(uid)};

  @override
  Future<void> dismiss(String uid, String bookingId) async {
    final current = await _ids(uid);
    final next = [...current.where((id) => id != bookingId), bookingId];
    final kept = next.length > arenaReviewPromptStoreLimit
        ? next.sublist(next.length - arenaReviewPromptStoreLimit)
        : next;
    _memory[uid] = kept;
    final prefs = await _load();
    try {
      await prefs?.setStringList(_key(uid), kept);
    } on PlatformException {
      // Fica a memória.
    }
  }
}
