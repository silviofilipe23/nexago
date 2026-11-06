import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';
import 'package:nexago_app/features/store/domain/store_product_rules.dart';
import 'package:nexago_app/features/store/presentation/widgets/store_product_options.dart';

// Seletor do eixo de estampa: miniatura da 1ª foto ligada ao valor, botão de
// texto sem foto, borda de destaque no escolhido.

const _estampa = StoreAxis(
  id: 'est',
  label: 'Estampa',
  kind: StoreAxisKind.pattern,
  values: [
    StoreAxisValue(id: 'folhas', label: 'Folhas'),
    StoreAxisValue(id: 'ondas', label: 'Ondas'),
    StoreAxisValue(id: 'liso', label: 'Liso'),
  ],
);

StoreVariant _sku(String est, bool inStock) => StoreVariant(
  id: est,
  values: {'est': est},
  priceCents: 8990,
  inStock: inStock,
);

final _toalha = StoreProduct(
  id: 'toalha',
  name: 'Toalha de praia',
  priceCents: 8990,
  minPriceCents: 8990,
  maxPriceCents: 8990,
  axes: const [_estampa],
  variants: [_sku('folhas', false), _sku('ondas', true), _sku('liso', true)],
  photos: const [
    StorePhoto(url: 'https://cdn/geral.jpg'),
    StorePhoto(url: 'https://cdn/folhas-1.jpg', colorValueId: 'folhas'),
    StorePhoto(url: 'https://cdn/ondas-1.jpg', colorValueId: 'ondas'),
    StorePhoto(url: 'https://cdn/ondas-2.jpg', colorValueId: 'ondas'),
  ],
);

/// Monta o seletor com estado próprio, como a página faz.
Future<List<String>> _pump(WidgetTester tester, {String? missing}) async {
  final picked = <String>[];
  var selected = storeProductInitialSelection(_toalha);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(
        body: StatefulBuilder(
          builder: (context, setState) => StoreProductOptions(
            product: _toalha,
            selected: selected,
            missingAxisId: missing,
            onSelect: (axis, value) {
              picked.add(value.id);
              setState(() {
                selected = selectStoreAxisValue(
                  _toalha,
                  selected,
                  axis.id,
                  value.id,
                );
              });
            },
            onUnavailable: (_, value) => picked.add('x:${value.id}'),
          ),
        ),
      ),
    ),
  );
  return picked;
}

Finder _value(String id) => find.byKey(ValueKey('store-axis-est-$id'));

/// Borda do quadro da miniatura (o primeiro Container com borda arredondada).
Color _frameColor(WidgetTester tester, String id) {
  final frame = tester.widget<Container>(
    find.descendant(of: _value(id), matching: find.byType(Container)).first,
  );
  final border = (frame.decoration! as BoxDecoration).border! as Border;
  return border.top.color;
}

void main() {
  testWidgets('valor com foto vira miniatura da 1ª foto ligada a ele', (
    tester,
  ) async {
    await _pump(tester);

    final ondas = tester.widget<CachedNetworkImage>(
      find.descendant(
        of: _value('ondas'),
        matching: find.byType(CachedNetworkImage),
      ),
    );
    expect(ondas.imageUrl, 'https://cdn/ondas-1.jpg');
    expect(
      find.descendant(
        of: _value('folhas'),
        matching: find.byType(CachedNetworkImage),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(of: _value('ondas'), matching: find.text('Ondas')),
      findsOneWidget,
    );
  });

  testWidgets('valor sem foto ligada vira o botão de texto', (tester) async {
    await _pump(tester);

    expect(
      find.descendant(
        of: _value('liso'),
        matching: find.byType(CachedNetworkImage),
      ),
      findsNothing,
    );
    expect(
      find.descendant(of: _value('liso'), matching: find.byType(InkWell)),
      findsOneWidget,
    );
    expect(find.text('Liso'), findsOneWidget);
  });

  testWidgets('pré-escolhe a 1ª com saldo e troca a seleção no toque', (
    tester,
  ) async {
    final picked = await _pump(tester);

    // Folhas está esgotada: a pré-seleção é Ondas.
    expect(find.text('ESTAMPA · ONDAS'), findsOneWidget);
    expect(_frameColor(tester, 'ondas'), AppColors.brand);
    expect(_frameColor(tester, 'folhas'), Colors.transparent);

    // Estampa esgotada continua tocável (para ver as fotos dela).
    await tester.tap(_value('folhas'));
    await tester.pump();
    expect(picked, ['folhas']);
    expect(find.text('ESTAMPA · FOLHAS'), findsOneWidget);
    expect(_frameColor(tester, 'folhas'), AppColors.brand);
    expect(_frameColor(tester, 'ondas'), Colors.transparent);

    await tester.tap(_value('liso'));
    await tester.pump();
    expect(picked, ['folhas', 'liso']);
    expect(find.text('ESTAMPA · LISO'), findsOneWidget);
  });

  testWidgets('estampa que falta no "Adicionar" pede "Escolha uma estampa"', (
    tester,
  ) async {
    await _pump(tester, missing: 'est');
    expect(find.text('Escolha uma estampa'), findsOneWidget);
  });
}
