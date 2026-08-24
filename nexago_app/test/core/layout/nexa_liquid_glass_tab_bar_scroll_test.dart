import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/layout/nexa_bottom_nav_models.dart';
import 'package:nexago_app/core/layout/nexa_liquid_glass_tab_bar.dart';

const _items = <NexaBottomNavItem>[
  NexaBottomNavItem(label: 'Início', icon: Icons.home_outlined),
  NexaBottomNavItem(label: 'Agenda', icon: Icons.calendar_today_outlined),
];

Widget _buildBar({required bool isScrolling}) {
  return MaterialApp(
    home: Scaffold(
      body: NexaLiquidGlassTabBar(
        items: _items,
        currentIndex: 0,
        onTap: (_) {},
        isScrolling: isScrolling,
      ),
    ),
  );
}

Finder _backdropFilterInBar() => find.descendant(
  of: find.byType(NexaLiquidGlassTabBar),
  matching: find.byType(BackdropFilter),
);

void main() {
  group('NexaLiquidGlassTabBar — blur ao vivo x custo de scroll', () {
    testWidgets(
      'some enquanto o conteúdo por trás está rolando (isScrolling: true)',
      (tester) async {
        // BackdropFilter reamostra o que está atrás a cada frame; com a
        // lista rolando por baixo da cápsula flutuante isso vira um custo
        // de raster contínuo. Suspender o blur durante o gesto evita esse
        // custo sem mudar a aparência da cápsula em repouso.
        await tester.pumpWidget(_buildBar(isScrolling: true));

        expect(_backdropFilterInBar(), findsNothing);
      },
    );

    testWidgets(
      'volta assim que o scroll assenta (isScrolling: false)',
      (tester) async {
        await tester.pumpWidget(_buildBar(isScrolling: false));

        expect(_backdropFilterInBar(), findsOneWidget);
      },
    );
  });
}
