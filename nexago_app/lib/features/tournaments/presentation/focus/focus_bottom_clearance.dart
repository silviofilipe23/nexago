import 'package:flutter/widgets.dart';

import '../../../../core/layout/nexa_bottom_nav_bar.dart';

/// Folga inferior das seções do Modo Focus.
///
/// A casca usa `extendBody: true`, então a nav flutuante SOBREPÕE o corpo: com
/// um padding fixo o último card de cada seção termina atrás do vidro. A conta
/// é a mesma das outras telas com nav (início do atleta, competir, comunidade,
/// painel do organizador) — barra + inset da home indicator + respiro.
double focusBottomClearance(BuildContext context) =>
    nexaBottomNavBarHeight(context) +
    MediaQuery.viewPaddingOf(context).bottom +
    16;
