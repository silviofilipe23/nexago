import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/nexa_skeleton.dart';

Widget _wrap(Widget child) => MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(body: child),
    );

void main() {
  testWidgets('linhas com avatar e texto, no número pedido', (tester) async {
    await tester.pumpWidget(
      _wrap(const NexaListSkeleton(count: 4, avatarSize: 40, lines: 2)),
    );

    // 4 avatares + 2 linhas de texto por item.
    expect(find.byType(NexaSkeleton), findsNWidgets(4 * 3));
  });

  testWidgets('cards: um bloco por item, na altura pedida', (tester) async {
    await tester.pumpWidget(
      _wrap(const NexaListSkeleton.cards(count: 3, cardHeight: 100)),
    );

    expect(find.byType(NexaSkeleton), findsNWidgets(3));
    expect(tester.getSize(find.byType(NexaSkeleton).first).height, 100);
  });

  testWidgets('em área menor que o conteúdo corta, sem estourar',
      (tester) async {
    await tester.pumpWidget(
      _wrap(
        const SizedBox(
          height: 120,
          child: NexaListSkeleton(count: 10),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
  });

  testWidgets('cabe num sliver, como nas listas com CustomScrollView',
      (tester) async {
    await tester.pumpWidget(
      _wrap(
        const CustomScrollView(
          slivers: [SliverToBoxAdapter(child: NexaListSkeleton(count: 12))],
        ),
      ),
    );

    expect(tester.takeException(), isNull);
  });

  testWidgets('o leitor de tela ouve "Carregando", não blocos soltos',
      (tester) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(_wrap(const NexaListSkeleton(count: 3)));

    expect(find.bySemanticsLabel('Carregando'), findsOneWidget);
    semantics.dispose();
  });
}
