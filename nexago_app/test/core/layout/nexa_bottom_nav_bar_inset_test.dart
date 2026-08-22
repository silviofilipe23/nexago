import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/layout/nexa_bottom_nav_bar.dart';
import 'package:nexago_app/core/layout/nexa_liquid_glass_tab_bar.dart';

const _items = <NexaBottomNavItem>[
  NexaBottomNavItem(label: 'Início', icon: Icons.home_outlined),
  NexaBottomNavItem(label: 'Agenda', icon: Icons.calendar_today_outlined),
  NexaBottomNavItem(label: 'Competir', icon: Icons.emoji_events_outlined),
];

Widget _buildShell({
  required TargetPlatform platform,
  required double bottomInset,
}) {
  return MaterialApp(
    theme: ThemeData(platform: platform),
    home: MediaQuery(
      data: MediaQueryData(viewPadding: EdgeInsets.only(bottom: bottomInset)),
      child: Scaffold(
        extendBody: true,
        body: const SizedBox.expand(),
        bottomNavigationBar: NexaBottomNavBar(
          items: _items,
          currentIndex: 0,
          onTap: (_) {},
        ),
      ),
    ),
  );
}

double _gapBelowCapsule(WidgetTester tester) {
  final capsule = tester.getRect(
    find.descendant(
      of: find.byType(NexaLiquidGlassTabBar),
      matching: find.byType(BackdropFilter),
    ),
  );
  final screen = tester.getRect(find.byType(Scaffold));
  return screen.bottom - capsule.bottom;
}

void main() {
  group('inset inferior da NexaBottomNavBar', () {
    testWidgets(
      'Android: cápsula fica acima da barra de navegação do sistema',
      (tester) async {
        // Navegação de 3 botões do Android: inset opaco de 48dp. Sem reservar
        // o inset, a cápsula é desenhada atrás dos botões e fica cortada.
        await tester.pumpWidget(
          _buildShell(platform: TargetPlatform.android, bottomInset: 48),
        );

        expect(
          _gapBelowCapsule(tester),
          greaterThanOrEqualTo(48),
          reason: 'a cápsula não pode ficar atrás da barra do sistema Android',
        );
      },
    );

    testWidgets(
      'iOS: cápsula continua assentada sobre a home indicator',
      (tester) async {
        // Design "grounded" deliberado: a home indicator é translúcida e por
        // gesto, então a cápsula encosta na borda inferior em vez de flutuar.
        await tester.pumpWidget(
          _buildShell(platform: TargetPlatform.iOS, bottomInset: 34),
        );

        expect(_gapBelowCapsule(tester), 0);
      },
    );
  });
}
