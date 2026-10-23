import 'package:flutter/widgets.dart';

import '../../../professor_mode/presentation/professor_shell_page.dart'
    show professorShellBottomPadding;

/// Marca uma tela montada como aba do modo Centro (`/centro`): sem o voltar e
/// com espaço no fim da lista para a barra flutuante.
class CenterModeTabScope extends InheritedWidget {
  const CenterModeTabScope({super.key, required super.child});

  static bool of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<CenterModeTabScope>() != null;

  @override
  bool updateShouldNotify(CenterModeTabScope oldWidget) => false;
}

/// Padding das listas das telas do centro (aba ou tela empilhada).
EdgeInsets centerListPadding(BuildContext context) => EdgeInsets.fromLTRB(
  20,
  8,
  20,
  CenterModeTabScope.of(context) ? professorShellBottomPadding(context) : 40,
);
