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

  group('cápsula sempre minimizada no Android', () {
    testWidgets(
      'Android: renderiza minimizada mesmo com collapseProgress=0 (topo do scroll)',
      (tester) async {
        // No Android a barra não expande/recolhe com o scroll como no iOS —
        // fica sempre no estado compacto (ícones, sem rótulos), mesmo recém
        // aberta ou logo após trocar de aba.
        await tester.pumpWidget(
          _buildShell(
            platform: TargetPlatform.android,
            bottomInset: 24,
            collapseProgress: 0,
          ),
        );

        expect(find.text('Início'), findsNothing);
        expect(
          _capsuleRect(tester).height,
          lessThan(ShellTabBarCollapseController.expandedHeight),
        );
      },
    );

    testWidgets(
      'iOS: continua expandindo/recolhendo conforme collapseProgress',
      (tester) async {
        // Guarda de regressão: só o Android deve ser forçado a minimizar.
        await tester.pumpWidget(
          _buildShell(
            platform: TargetPlatform.iOS,
            bottomInset: 34,
            collapseProgress: 0,
          ),
        );

        expect(find.text('Início'), findsOneWidget);
      },
    );

    testWidgets(
      'navegação de 3 botões: cápsula nunca fica menor que o alvo de toque',
      (tester) async {
        await tester.pumpWidget(
          _buildShell(platform: TargetPlatform.android, bottomInset: 48),
        );

        // 48dp é o piso de layout (ver visualBarHeight em
        // NexaLiquidGlassTabBar); o encolhimento cosmético de 0.94 do estado
        // "compacto" reduz um pouco o retângulo renderizado, então checamos
        // contra 44 (mínimo de alvo de toque também aceito pela HIG da Apple).
        expect(_capsuleRect(tester).height, greaterThanOrEqualTo(44));
      },
    );
  });
}
