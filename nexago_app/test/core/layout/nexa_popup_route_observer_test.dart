import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/layout/nexa_native_liquid_glass.dart';

void main() {
  setUp(() => nexaPopupRouteDepth.value = 0);

  Future<BuildContext> pumpApp(WidgetTester tester) async {
    late BuildContext ctx;
    await tester.pumpWidget(MaterialApp(
      navigatorObservers: [NexaPopupRouteObserver()],
      home: Builder(builder: (context) {
        ctx = context;
        return const Scaffold();
      }),
    ));
    return ctx;
  }

  testWidgets('modal aberto conta como popup até fechar', (tester) async {
    final context = await pumpApp(tester);

    showModalBottomSheet<void>(
      context: context,
      builder: (_) => const SizedBox(height: 100),
    );
    await tester.pump();
    expect(nexaPopupRouteDepth.value, 1);

    Navigator.of(context).pop();
    await tester.pumpAndSettle();
    expect(nexaPopupRouteDepth.value, 0);
  });

  testWidgets('diálogo sobre modal empilha e desempilha', (tester) async {
    final context = await pumpApp(tester);

    showModalBottomSheet<void>(
      context: context,
      builder: (_) => const SizedBox(height: 100),
    );
    await tester.pump();
    showDialog<void>(context: context, builder: (_) => const SizedBox());
    await tester.pump();
    expect(nexaPopupRouteDepth.value, 2);

    Navigator.of(context).pop();
    await tester.pumpAndSettle();
    expect(nexaPopupRouteDepth.value, 1);
  });

  testWidgets('tela cheia empilhada não conta', (tester) async {
    final context = await pumpApp(tester);

    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const Scaffold()),
    );
    await tester.pumpAndSettle();
    expect(nexaPopupRouteDepth.value, 0);
  });
}
