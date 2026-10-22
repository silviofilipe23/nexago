import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/professor_links/presentation/widgets/professor_links_ui.dart';

Widget _box(String key) =>
    Container(key: Key(key), height: 40, color: Colors.red);

Future<double> _gap(WidgetTester tester, List<Widget> children) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(
        body: ProfessorLinksSheetBody(title: 'Folha', children: children),
      ),
    ),
  );
  final a = tester.getRect(find.byKey(const Key('a')));
  final b = tester.getRect(find.byKey(const Key('b')));
  return b.top - a.bottom;
}

void main() {
  testWidgets('sem espaçador: 12 automático entre os filhos', (tester) async {
    expect(await _gap(tester, [_box('a'), _box('b')]), 12);
  });

  testWidgets('com espaçador explícito: vale o espaçador, sem somar 12', (
    tester,
  ) async {
    expect(
      await _gap(tester, [_box('a'), const SizedBox(height: 4), _box('b')]),
      4,
    );
  });

  testWidgets('espaçador dentro de if/spread também vale', (tester) async {
    const show = true;
    expect(
      await _gap(tester, [
        _box('a'),
        if (show) ...[const SizedBox(height: 8), _box('b')],
      ]),
      8,
    );
  });

  testWidgets('SizedBox com filho não conta como espaçador', (tester) async {
    expect(
      await _gap(tester, [
        _box('a'),
        const SizedBox(key: Key('b'), height: 40, child: Text('x')),
      ]),
      12,
    );
  });
}
