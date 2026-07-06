import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:native_liquid_glass/native_liquid_glass.dart';

/// Quando `false`, o app usa a tab bar / app bar Flutter em vez da nativa.
///
/// O plugin `native_liquid_glass` chama `setSuppressed` ao empilhar rotas.
/// Após hot restart ou dispose da platform view, o canal nativo some e dispara
/// [MissingPluginException] — corrida benigna, sem impacto ao usuário.
final nexaNativeLiquidGlassEnabled = ValueNotifier(true);

bool isBenignLiquidGlassPluginError(Object error) {
  if (error is! MissingPluginException) return false;
  final message = error.message ?? '';
  return message.contains('setSuppressed') &&
      message.contains('liquid-glass');
}

/// Desliga o glass nativo e evita novas chamadas ao canal inválido.
void disableNativeLiquidGlassOnPluginError(Object error) {
  if (!isBenignLiquidGlassPluginError(error)) return;
  if (nexaNativeLiquidGlassEnabled.value) {
    nexaNativeLiquidGlassEnabled.value = false;
  }
}

bool get nexaUseNativeLiquidGlass =>
    NativeLiquidGlassUtils.supportsLiquidGlass &&
    nexaNativeLiquidGlassEnabled.value;
