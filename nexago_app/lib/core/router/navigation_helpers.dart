import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

/// Volta uma tela ou navega para [fallbackLocation].
///
/// Ignora [StateError] quando o pop já está em andamento (duplo toque ou gesto
/// do sistema + botão), evitando "Future already completed" do go_router.
void popOrGo(BuildContext context, String fallbackLocation) {
  final router = GoRouter.of(context);
  if (!router.canPop()) {
    router.go(fallbackLocation);
    return;
  }
  try {
    router.pop();
  } on StateError {
    // Route match já completado — pop redundante.
  }
}
