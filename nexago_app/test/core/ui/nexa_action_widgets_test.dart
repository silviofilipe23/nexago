import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/nexa_bottom_action_bar.dart';
import 'package:nexago_app/core/ui/nexa_icon_square_button.dart';

void main() {
  Widget wrap(Widget child) =>
      MaterialApp(theme: AppTheme.dark, home: Scaffold(body: child));

  testWidgets('NexaBottomActionBar renderiza leading, action e hint',
      (tester) async {
    await tester.pumpWidget(wrap(Column(children: [
      const Spacer(),
      NexaBottomActionBar(
        leading: const Text('R\$ 90,00'),
        hint: 'Pagamento seguro via PIX',
        action: FilledButton(onPressed: () {}, child: const Text('Inscrever')),
      ),
    ])));
    expect(find.text('R\$ 90,00'), findsOneWidget);
    expect(find.text('Inscrever'), findsOneWidget);
    expect(find.text('Pagamento seguro via PIX'), findsOneWidget);
  });

  testWidgets('NexaIconSquareButton tem o tamanho pedido e dispara onTap',
      (tester) async {
    var tapped = false;
    await tester.pumpWidget(wrap(NexaIconSquareButton(
      icon: Icons.close_rounded,
      onTap: () => tapped = true,
    )));
    final size = tester.getSize(find.byType(NexaIconSquareButton));
    expect(size.width, 40);
    expect(size.height, 40);
    await tester.tap(find.byType(NexaIconSquareButton));
    expect(tapped, isTrue);
  });

  testWidgets('NexaIconSquareButton usa a borda sutil por padrão',
      (tester) async {
    await tester.pumpWidget(wrap(NexaIconSquareButton(
      icon: Icons.close_rounded,
      onTap: () {},
    )));
    final shape = tester
        .widget<Material>(find.descendant(
          of: find.byType(NexaIconSquareButton),
          matching: find.byType(Material),
        ))
        .shape;
    expect(shape, isA<RoundedRectangleBorder>());
    expect((shape! as RoundedRectangleBorder).side, isNot(BorderSide.none));
  });

  testWidgets('NexaIconSquareButton propaga o side para o shape do Material',
      (tester) async {
    await tester.pumpWidget(wrap(NexaIconSquareButton(
      icon: Icons.close_rounded,
      onTap: () {},
      side: BorderSide.none,
    )));
    final shape = tester
        .widget<Material>(find.descendant(
          of: find.byType(NexaIconSquareButton),
          matching: find.byType(Material),
        ))
        .shape;
    expect(shape, isA<RoundedRectangleBorder>());
    expect((shape! as RoundedRectangleBorder).side, BorderSide.none);
  });
}
