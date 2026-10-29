import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/layout/nexa_bottom_nav_bar.dart';
import 'package:nexago_app/core/layout/nexa_liquid_glass_tab_bar.dart';
import 'package:nexago_app/core/layout/shell_tab_bar_collapse.dart';

const _items = <NexaBottomNavItem>[
  NexaBottomNavItem(label: 'Início', icon: Icons.home_outlined),
  NexaBottomNavItem(label: 'Agenda', icon: Icons.calendar_today_outlined),
  NexaBottomNavItem(label: 'Competir', icon: Icons.emoji_events_outlined),
];

Widget _buildShell({
  required TargetPlatform platform,
  required double bottomInset,
  double collapseProgress = 0,
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
          collapseProgress: collapseProgress,
        ),
      ),
    ),
  );
}

Rect _capsuleRect(WidgetTester tester) {
  return tester.getRect(
    find.descendant(
      of: find.byType(NexaLiquidGlassTabBar),
      matching: find.byType(BackdropFilter),
    ),
  );
}

double _gapBelowCapsule(WidgetTester tester) {
  final screen = tester.getRect(find.byType(Scaffold));
  return screen.bottom - _capsuleRect(tester).bottom;
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


  group('rótulos sempre visíveis', () {
    // Atletas não sabiam o que cada aba era com a barra minimizada (só
    // ícones). Ela agora fica expandida, com rótulos, em qualquer plataforma
    // e em qualquer ponto do scroll.
    for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
      testWidgets('${platform.name}: rótulos no topo do scroll',
          (tester) async {
        await tester.pumpWidget(
          _buildShell(platform: platform, bottomInset: 24),
        );

        expect(find.text('Início'), findsOneWidget);
        expect(find.text('Agenda'), findsOneWidget);
      });

      testWidgets('${platform.name}: rótulos continuam depois de rolar',
          (tester) async {
        await tester.pumpWidget(
          _buildShell(platform: platform, bottomInset: 24, collapseProgress: 1),
        );

        expect(find.text('Início'), findsOneWidget);
        expect(
          _capsuleRect(tester).height,
          greaterThanOrEqualTo(ShellTabBarCollapseController.expandedHeight),
        );
      });
    }

    testWidgets('rótulo com 11 de corpo, legível', (tester) async {
      await tester.pumpWidget(
        _buildShell(platform: TargetPlatform.android, bottomInset: 24),
      );

      final label = tester.widget<Text>(find.text('Agenda'));
      expect(label.style?.fontSize, greaterThanOrEqualTo(11));
    });
  });

  group('nexaBottomNavBarHeight', () {
    for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
      testWidgets('${platform.name}: folga da barra expandida',
          (tester) async {
        late double height;
        await tester.pumpWidget(
          MaterialApp(
            theme: ThemeData(platform: platform),
            home: Builder(
              builder: (context) {
                height = nexaBottomNavBarHeight(context);
                return const SizedBox();
              },
            ),
          ),
        );

        expect(height, 105);
      });
    }
  });
}
