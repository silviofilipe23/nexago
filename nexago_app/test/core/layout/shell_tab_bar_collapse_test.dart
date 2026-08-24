import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/layout/shell_tab_bar_collapse.dart';

void main() {
  testWidgets(
    'isScrolling liga no início do gesto e desliga quando o scroll assenta',
    (tester) async {
      // BackdropFilter reamostra o conteúdo por trás a cada frame; a cápsula
      // usa esse flag pra suspender o blur enquanto a lista está se movendo
      // e evitar esse custo de raster contínuo durante o scroll.
      final controller = ShellTabBarCollapseController();
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        MaterialApp(
          home: ShellTabBarCollapseListener(
            controller: controller,
            child: ListView.builder(
              itemCount: 50,
              itemBuilder: (context, index) =>
                  SizedBox(height: 80, child: Text('item $index')),
            ),
          ),
        ),
      );

      expect(controller.isScrolling, isFalse);

      final gesture = await tester.startGesture(const Offset(200, 300));
      await gesture.moveBy(const Offset(0, -100));
      await tester.pump();

      expect(controller.isScrolling, isTrue);

      await gesture.up();
      await tester.pumpAndSettle();

      expect(controller.isScrolling, isFalse);
    },
  );

  testWidgets(
    'ignora scroll de um carrossel horizontal aninhado (depth != 0)',
    (tester) async {
      final controller = ShellTabBarCollapseController();
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        MaterialApp(
          home: ShellTabBarCollapseListener(
            controller: controller,
            child: ListView(
              children: [
                SizedBox(
                  height: 100,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: List.generate(
                      20,
                      (i) => SizedBox(width: 100, child: Text('h$i')),
                    ),
                  ),
                ),
                ...List.generate(
                  30,
                  (i) => SizedBox(height: 80, child: Text('v$i')),
                ),
              ],
            ),
          ),
        ),
      );

      final gesture = await tester.startGesture(const Offset(200, 50));
      await gesture.moveBy(const Offset(-80, 0));
      await tester.pump();

      expect(
        controller.isScrolling,
        isFalse,
        reason:
            'o scroll do carrossel horizontal interno não pode suspender '
            'o blur da tab bar — só o scroll do CustomScrollView principal '
            '(depth 0) conta',
      );

      await gesture.up();
      await tester.pumpAndSettle();
    },
  );
}
