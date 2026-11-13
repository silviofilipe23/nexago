import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Leva o tema do app para as views nativas do iOS.
///
/// A barra e a tab bar Liquid Glass são `UINavigationBar`/`UITabBar` de
/// verdade: a cor do título segue a aparência da janela, não o `Theme` do
/// Flutter. Com o iPhone claro e o app escuro o título saía preto sobre o
/// fundo escuro. Aqui a janela recebe `overrideUserInterfaceStyle` igual ao
/// tema escolhido (`system` devolve o controle ao aparelho).
///
/// Efeito colateral desejado: o Flutter passa a ler
/// `MediaQuery.platformBrightness` igual ao tema do app, e é isso que o
/// `NexaAppBar` confere antes de usar a barra nativa.
const nativeInterfaceStyleChannel = MethodChannel('nexago/interface_style');

String nativeInterfaceStyleFor(ThemeMode mode) => switch (mode) {
      ThemeMode.light => 'light',
      ThemeMode.dark => 'dark',
      ThemeMode.system => 'unspecified',
    };

ThemeMode? _lastSynced;

/// Idempotente: só chama o canal quando o modo muda.
Future<void> syncNativeInterfaceStyle(ThemeMode mode) async {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.iOS) return;
  if (_lastSynced == mode) return;
  _lastSynced = mode;
  try {
    await nativeInterfaceStyleChannel.invokeMethod<void>(
      'setInterfaceStyle',
      nativeInterfaceStyleFor(mode),
    );
  } on MissingPluginException {
    // Build sem o canal (ex.: testes): o NexaAppBar cai na AppBar Flutter.
  } on PlatformException {
    _lastSynced = null;
  }
}

@visibleForTesting
void resetNativeInterfaceStyleSync() => _lastSynced = null;
