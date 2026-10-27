import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../domain/app_news.dart';

/// [AppNewsLocalStore] no `SharedPreferences`, por uid (outra conta no mesmo
/// aparelho tem os próprios stories e o próprio "Já usou"). Sem o canal
/// nativo (hot restart), guarda em memória até o app fechar.
class SharedPrefsAppNewsLocalStore implements AppNewsLocalStore {
  Future<SharedPreferences?>? _prefs;
  final _memory = <String, Object>{};

  Future<SharedPreferences?> _load() => _prefs ??= () async {
    try {
      return await SharedPreferences.getInstance();
    } on PlatformException {
      return null;
    } catch (_) {
      return null;
    }
  }();

  static String _usedKey(String uid) => 'app_news_used_$uid';
  static String _storiesKey(String uid) => 'app_news_stories_seen_$uid';

  @override
  Future<Set<String>> usedFeatures(String uid) async {
    final key = _usedKey(uid);
    final memory = _memory[key];
    if (memory is Set<String>) return memory;
    final prefs = await _load();
    return {...?prefs?.getStringList(key)};
  }

  @override
  Future<void> markUsed(String uid, String featureId) async {
    final key = _usedKey(uid);
    final used = {...await usedFeatures(uid), featureId};
    _memory[key] = used;
    final prefs = await _load();
    try {
      await prefs?.setStringList(key, used.toList(growable: false));
    } on PlatformException {
      // Fica a memória.
    }
  }

  @override
  Future<String?> storiesSeenVersion(String uid) async {
    final key = _storiesKey(uid);
    final memory = _memory[key];
    if (memory is String) return memory;
    final prefs = await _load();
    return prefs?.getString(key);
  }

  @override
  Future<void> markStoriesSeen(String uid, String version) async {
    final key = _storiesKey(uid);
    _memory[key] = version;
    final prefs = await _load();
    try {
      await prefs?.setString(key, version);
    } on PlatformException {
      // Fica a memória.
    }
  }
}
