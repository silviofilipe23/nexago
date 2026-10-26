import 'package:flutter/widgets.dart';
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

/// Quantos popups (sheet, diálogo, menu) estão abertos no navegador raiz.
///
/// Enquanto houver algum, a tab bar sai da view nativa e vira a cápsula
/// Flutter. Com duas views nativas na tela — o mapa do Reservar e a barra —
/// o iOS só compunha o modal dentro do retângulo da barra: do filtro de
/// arenas aparecia apenas o botão, recortado no formato da cápsula, e o
/// resto ficava invisível por cima do mapa, ainda recebendo toque.
final nexaPopupRouteDepth = ValueNotifier(0);

/// Mantém [nexaPopupRouteDepth] em dia. Vai no navegador raiz, que é onde a
/// shell do atleta (um `IndexedStack`, sem navegador próprio) abre os modais.
class NexaPopupRouteObserver extends NavigatorObserver {
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (route is PopupRoute) nexaPopupRouteDepth.value++;
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (route is PopupRoute) _leave();
  }

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (route is PopupRoute) _leave();
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    if (oldRoute is PopupRoute) _leave();
    if (newRoute is PopupRoute) nexaPopupRouteDepth.value++;
  }

  void _leave() {
    if (nexaPopupRouteDepth.value > 0) nexaPopupRouteDepth.value--;
  }
}
