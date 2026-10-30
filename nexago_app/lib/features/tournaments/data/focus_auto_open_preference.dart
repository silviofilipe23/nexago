import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Se o app entra sozinho no Modo Focus no dia do torneio — escolha do
/// atleta, nas Configurações. Desligado por padrão: o Focus deixou de abrir
/// sempre, e o card na Início é a porta de entrada.
///
/// Fica no aparelho, como o tema: é jeito de usar o app, não dado da conta.
/// Sem o canal nativo (hot restart, testes), vale o padrão e a escolha da
/// sessão fica em memória.
class FocusAutoOpenPreferenceNotifier extends AsyncNotifier<bool> {
  static const prefsKey = 'focus_auto_open_v1';

  @override
  Future<bool> build() async {
    final prefs = await _prefs();
    return prefs?.getBool(prefsKey) ?? false;
  }

  Future<void> set(bool enabled) async {
    state = AsyncData(enabled);
    final prefs = await _prefs();
    try {
      await prefs?.setBool(prefsKey, enabled);
    } on PlatformException {
      // Fica a memória.
    }
  }

  static Future<SharedPreferences?> _prefs() async {
    try {
      return await SharedPreferences.getInstance();
    } catch (_) {
      return null;
    }
  }
}

final focusAutoOpenPreferenceProvider =
    AsyncNotifierProvider<FocusAutoOpenPreferenceNotifier, bool>(
  FocusAutoOpenPreferenceNotifier.new,
);
