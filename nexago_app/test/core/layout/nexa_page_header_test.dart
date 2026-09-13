import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/layout/nexa_page_header.dart';

Widget _page(VoidCallback onHeaderTap) => MaterialApp(
      home: Scaffold(
        body: NexaPageHeader(
          topGap: 0,
          header: SizedBox(
            height: 64,
            child: Row(
              children: [
                IconButton(
                  key: const Key('header-action'),
                  icon: const Icon(Icons.arrow_back),
                  onPressed: onHeaderTap,
                ),
                const Text('Header'),
              ],
            ),
          ),
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(
              parent: BouncingScrollPhysics(),
            ),
            slivers: [
              SliverList.builder(
                itemCount: 120,
                itemBuilder: (_, i) =>
                    SizedBox(height: 80, child: Text('item $i')),
              ),
            ],
          ),
        ),
      ),
    );

void main() {
  testWidgets('o header não sai da tela ao rolar', (tester) async {
    await tester.pumpWidget(_page(() {}));

    final header = find.byKey(const Key('header-action'));
    final before = tester.getRect(header);

    await tester.drag(find.text('item 2'), const Offset(0, -1200));
    await tester.pumpAndSettle();

    expect(header, findsOneWidget);
    expect(tester.getRect(header), before);
  });

  testWidgets('o toque no header dispara a ação com a lista deslizando',
      (tester) async {
    // Regressão: como sliver, o header ficava dentro do `IgnorePointer` que o
    // `Scrollable` liga enquanto a lista é arrastada ou desliza por inércia —
    // o toque era engolido e a ação (voltar/filtros) nunca acontecia.
    var taps = 0;
    await tester.pumpWidget(_page(() => taps++));

    await tester.fling(
      find.byType(CustomScrollView),
      const Offset(0, -400),
      1200,
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 80));

    await tester.tap(find.byKey(const Key('header-action')));
    await tester.pumpAndSettle();

    expect(taps, 1);
  });

  testWidgets('o toque no header funciona com a lista parada', (tester) async {
    var taps = 0;
    await tester.pumpWidget(_page(() => taps++));

    await tester.drag(find.text('item 2'), const Offset(0, -600));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('header-action')));
    await tester.pumpAndSettle();

    expect(taps, 1);
  });
}
