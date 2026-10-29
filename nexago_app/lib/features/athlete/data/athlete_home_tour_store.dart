import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Guarda se o atleta já viu o tour da Início, por uid (outra conta no mesmo
/// aparelho vê o tour de novo). Sem o canal nativo (hot restart), lembra em
/// memória até o app fechar — mesmo desenho do store das novidades.
class AthleteHomeTourStore {
  Future<SharedPreferences?>? _prefs;
  final _memory = <String>{};

  /// Sobe a versão quando o tour mudar o bastante para valer mostrar de novo.
  /// v2: entraram alugar quadra, torneios e ranking — quem viu a v1 vê de novo.
  static const version = 2;

  static String _key(String uid) => 'athlete_home_tour_v${version}_$uid';

  Future<SharedPreferences?> _load() => _prefs ??= () async {
        try {
          return await SharedPreferences.getInstance();
        } on PlatformException {
          return null;
        } catch (_) {
          return null;
        }
      }();

  Future<bool> seen(String uid) async {
    if (_memory.contains(uid)) return true;
    final prefs = await _load();
    return prefs?.getBool(_key(uid)) ?? false;
  }

  Future<void> markSeen(String uid) async {
    _memory.add(uid);
    final prefs = await _load();
    try {
      await prefs?.setBool(_key(uid), true);
    } on PlatformException {
      // Fica a memória.
    }
  }
}

final athleteHomeTourStoreProvider =
    Provider<AthleteHomeTourStore>((ref) => AthleteHomeTourStore());
