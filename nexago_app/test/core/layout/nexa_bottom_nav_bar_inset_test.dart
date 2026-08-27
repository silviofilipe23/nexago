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

  group('altura da cápsula no Android (compensação do inset reservado)', () {
    testWidgets(
      'navegação por gestos: espaço total ocupado fica igual ao do iOS',
      (tester) async {
        // Inset típico de navegação por gestos (~24dp): a cápsula deve
        // encolher o suficiente pra o espaço total (cápsula + inset) ficar
        // igual ao da versão iOS (altura cheia de 100, sem inset extra), em
        // vez de simplesmente empilhar o inset por cima de uma cápsula de
        // altura cheia.
        await tester.pumpWidget(
          _buildShell(platform: TargetPlatform.android, bottomInset: 24),
        );
        final screen = tester.getRect(find.byType(Scaffold));
        final androidFootprint = screen.bottom - _capsuleRect(tester).top;

        expect(androidFootprint, closeTo(100, 1));
      },
    );

    testWidgets(
      'navegação de 3 botões: cápsula nunca fica menor que o alvo de toque',
      (tester) async {
        await tester.pumpWidget(
          _buildShell(platform: TargetPlatform.android, bottomInset: 48),
        );

        expect(_capsuleRect(tester).height, greaterThanOrEqualTo(48));
      },
    );

    testWidgets(
      'navegação de 3 botões: espaço total ocupado fica bem abaixo da soma ingênua',
      (tester) async {
        // Antes da compensação, o espaço total era altura-cheia (100) + inset
        // (48) = 148. Com a cápsula emprestando altura do inset, deve sobrar
        // bem menos que isso, mesmo reservando o inset inteiro pro gap.
        await tester.pumpWidget(
          _buildShell(platform: TargetPlatform.android, bottomInset: 48),
        );
        final screen = tester.getRect(find.byType(Scaffold));
        final footprint = screen.bottom - _capsuleRect(tester).top;

        expect(footprint, lessThan(120));
      },
    );
  });
}
