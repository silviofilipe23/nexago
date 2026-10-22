import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/ui/trailing_gap_if_visible.dart';

Future<double> _height(WidgetTester tester, List<Widget> children) async {
  await tester.pumpWidget(
    Directionality(
      textDirection: TextDirection.ltr,
      child: ListView(
        children: [
          TrailingGapIfVisible(
            key: const Key('group'),
            gap: 16,
            child: Column(children: children),
          ),
        ],
      ),
    ),
  );
  return tester
      .getSize(find.byKey(const Key('group'), skipOffstage: false))
      .height;
}

void main() {
  testWidgets('tudo vazio: não ocupa nada (nem o respiro)', (tester) async {
    expect(
      await _height(tester, const [SizedBox.shrink(), SizedBox.shrink()]),
      0,
    );
  });

  testWidgets('algum visível: altura do conteúdo + respiro', (tester) async {
    expect(
      await _height(tester, const [SizedBox.shrink(), SizedBox(height: 40)]),
      56,
    );
  });

  testWidgets('mantém a largura do pai', (tester) async {
    await _height(tester, const [SizedBox(height: 10)]);
    expect(
      tester.getSize(find.byKey(const Key('group'), skipOffstage: false)).width,
      tester.getSize(find.byType(ListView)).width,
    );
  });
}
