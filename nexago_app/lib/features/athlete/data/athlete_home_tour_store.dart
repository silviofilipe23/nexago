import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Guarda até que versão do tour da Início o atleta já viu, por uid (outra
/// conta no mesmo aparelho vê o tour de novo). Sem o canal nativo (hot
/// restart), lembra em memória até o app fechar — mesmo desenho do store das
/// novidades.
///
/// É a versão, e não um "viu ou não", porque passo novo não deveria reabrir o
/// tour inteiro: quem viu a v3 vê só o que entrou depois (ver
/// `AthleteHomeTourStep.since`).
class AthleteHomeTourStore {
  Future<SharedPreferences?>? _prefs;
  final _memory = <String, int>{};

  /// Sobe a versão quando o tour ganhar passos novos ou mudar o bastante.
  /// v2: entraram alugar quadra, torneios e ranking — quem viu a v1 vê de novo.
  /// v3: a barra do iPhone fica nativa no tour e a quadra vira o botão Reservar.
  /// v4: entrou o Modo Focus — quem viu a v3 vê só esse passo.
  static const version = 4;

  static String _key(String uid) => 'athlete_home_tour_seen_$uid';

  /// Chave de antes da v4: um booleano por versão.
  static String _legacyKey(int version, String uid) =>
      'athlete_home_tour_v${version}_$uid';

  Future<SharedPreferences?> _load() => _prefs ??= () async {
        try {
          return await SharedPreferences.getInstance();
        } on PlatformException {
          return null;
        } catch (_) {
          return null;
        }
      }();

  /// Última versão vista; 0 para quem nunca viu o tour.
  Future<int> seenVersion(String uid) async {
    final inMemory = _memory[uid];
    if (inMemory != null) return inMemory;
    final prefs = await _load();
    if (prefs == null) return 0;
    final stored = prefs.getInt(_key(uid));
    if (stored != null) return stored;
    for (var v = 3; v >= 1; v--) {
      if (prefs.getBool(_legacyKey(v, uid)) ?? false) return v;
    }
    return 0;
  }

  Future<void> markSeen(String uid) async {
    _memory[uid] = version;
    final prefs = await _load();
    try {
      await prefs?.setInt(_key(uid), version);
    } on PlatformException {
      // Fica a memória.
    }
  }
}

final athleteHomeTourStoreProvider =
    Provider<AthleteHomeTourStore>((ref) => AthleteHomeTourStore());
