import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/observability/analytics_service.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/store/application/store_providers.dart';
import 'package:nexago_app/features/store/domain/store_customize_rules.dart';
import 'package:nexago_app/features/store/domain/store_customize_service.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';
import 'package:nexago_app/features/store/domain/store_repository.dart';
import 'package:nexago_app/features/store/presentation/store_copy.dart';
import 'package:nexago_app/features/store/presentation/store_customize_page.dart';
import 'package:nexago_app/features/store/presentation/widgets/store_style.dart';

/// Repositório em memória: nada de Firestore no teste.
class _FakeStoreRepository implements StoreRepository {
  _FakeStoreRepository(this.catalog);

  final StoreCatalog catalog;

  @override
  Stream<bool> watchEnabled() => Stream.value(true);

  @override
  Stream<StoreCatalog> watchCatalog() => Stream.value(catalog);

  @override
  Stream<StoreShowcaseConfig> watchShowcaseConfig() =>
      Stream.value(StoreShowcaseConfig.empty);

  @override
  Stream<StoreShopper> watchShopper(String uid) =>
      Stream.value(StoreShopper.empty);

  @override
  Stream<List<StoreCartItem>> watchCart(String uid) =>
      Stream.value(const <StoreCartItem>[]);

  @override
  Future<bool> addToCart(
    String uid, {
    required String productId,
    required String skuId,
    int qty = 1,
    int? maxQty,
  }) async =>
      true;

  @override
  Future<void> setPickupArena(String uid, String arenaId) async {}

  @override
  Future<void> setRecentSearches(String uid, List<String> searches) async {}

  @override
  Future<void> setFavorite(String uid, String productId, bool on) async {}
}

/// Callables e upload em memória.
class _FakeCustomizeService implements StoreCustomizeService {
  _FakeCustomizeService({this.blocked = const {}, this.addError});

  /// Nomes que a "lista de bloqueio" recusa.
  final Set<String> blocked;
  final StoreCustomizeException? addError;

  final List<String> checked = [];
  final List<StoreCustomCartRequest> added = [];
  final List<String> uploads = [];

  @override
  Future<StoreNameCheck> checkName({
    required String productId,
    required String text,
  }) async {
    checked.add(text);
    return blocked.contains(text)
        ? const StoreNameCheck.problem(StoreNameProblem.blocked)
        : const StoreNameCheck.ok();
  }

  @override
  Future<StoreCustomCartResult> addToCart(
    StoreCustomCartRequest request,
  ) async {
    final error = addError;
    if (error != null) throw error;
    added.add(request);
    return const StoreCustomCartResult(
      lineId: 'l-1',
      extraPriceCents: 1490,
      unitPriceCents: 14480,
    );
  }

  @override
  Future<String> uploadImage({
    required String uid,
    required Uint8List bytes,
    required String format,
    required void Function(double progress) onProgress,
  }) async {
    onProgress(0.5);
    final path = 'store/custom-uploads/$uid/img-${uploads.length}.$format';
    uploads.add(path);
    return path;
  }
}

/// "Galeria" que devolve um PNG de 2400 × 2400 (só o cabeçalho: o app mede
/// pelo IHDR, como o servidor).
class _FakePicker implements StoreCustomImagePicker {
  final List<StoreImageSource> sources = [];

  @override
  Future<StorePickedImage?> pick(
    StoreImageSource source, {
    required List<String> formats,
  }) async {
    sources.add(source);
    final bytes = Uint8List(33);
    bytes.setAll(0, const [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    final data = ByteData.sublistView(bytes);
    data.setUint32(8, 13);
    bytes.setAll(12, ascii.encode('IHDR'));
    data.setUint32(16, 2400);
    data.setUint32(20, 2400);
    return StorePickedImage(bytes: bytes, fileName: 'logo-dupla.png');
  }
}

class _RecordingAnalytics implements AnalyticsService {
  final List<Invocation> calls = [];

  bool logged(Symbol method, [Map<Symbol, Object?> args = const {}]) =>
      calls.any(
        (c) =>
            c.memberName == method &&
            args.entries.every((e) => c.namedArguments[e.key] == e.value),
      );

  @override
  dynamic noSuchMethod(Invocation invocation) {
    calls.add(invocation);
    return Future<void>.value();
  }
}

StoreVariant _sku(String cor, String tam) => StoreVariant(
      id: '${cor}_$tam',
      values: {'cor': cor, 'tam': tam},
      priceCents: 12990,
      inStock: true,
    );

const _customization = StoreCustomization(
  fromCents: 1490,
  leadDays: 5,
  defectOnlyReturns: true,
  version: 1760000000000,
  name: StoreCustomNameOptions(
    enabled: true,
    maxChars: 12,
    placement: StoreNamePlacement.backUpper,
    fonts: [
      StoreCustomFont.bloco,
      StoreCustomFont.classica,
      StoreCustomFont.mono
    ],
    colors: ['#ffffff', '#111111', '#ff6a1a'],
  ),
  image: StoreCustomImageOptions(
    enabled: true,
    formats: ['png', 'jpg', 'svg'],
    maxSizeMb: 10,
    minWidthPx: 1000,
    minHeightPx: 1000,
    areas: [
      StoreCustomArea(
        id: 'peito_esquerdo',
        name: 'Peito esquerdo',
        widthCm: 9,
        heightCm: 9,
      ),
      StoreCustomArea(
        id: 'centro_frente',
        name: 'Centro da frente',
        widthCm: 25,
        heightCm: 30,
      ),
    ],
  ),
  price: StoreCustomPrice(
    nameOnlyCents: 1490,
    imageOnlyCents: 1990,
    bothCents: 2490,
  ),
);

/// A mesma config com as costas (abaixo do nome) e `backCents`.
StoreCustomization _withBack(StoreCustomBackOptions back) => StoreCustomization(
      fromCents: _customization.fromCents,
      leadDays: _customization.leadDays,
      defectOnlyReturns: _customization.defectOnlyReturns,
      version: _customization.version,
      name: _customization.name,
      image: _customization.image,
      back: back,
      price: const StoreCustomPrice(
        nameOnlyCents: 1490,
        imageOnlyCents: 1990,
        bothCents: 2490,
        backCents: 990,
      ),
    );

const _bothBack = StoreCustomBackOptions(
  enabled: true,
  allowNumber: true,
  allowImage: true,
  numberMaxDigits: 2,
  widthCm: 25,
  heightCm: 25,
);

final _camiseta = _camisetaWith(_customization);

StoreProduct _camisetaWith(StoreCustomization customization) => StoreProduct(
      id: 'camiseta',
      name: 'Camiseta Dry UV50',
      category: 'vestuario',
      priceCents: 12990,
      minPriceCents: 12990,
      maxPriceCents: 12990,
      customizable: true,
      customization: customization,
      axes: const [
        StoreAxis(
          id: 'cor',
          label: 'Cor',
          values: [
            StoreAxisValue(id: 'preto', label: 'Preta', hex: '#111111'),
            StoreAxisValue(id: 'branco', label: 'Branca', hex: '#F1ECE2'),
          ],
        ),
        StoreAxis(
          id: 'tam',
          label: 'Tamanho',
          values: [
            StoreAxisValue(id: 'p', label: 'P'),
            StoreAxisValue(id: 'm', label: 'M'),
          ],
        ),
      ],
      variants: [
        _sku('preto', 'p'),
        _sku('preto', 'm'),
        _sku('branco', 'p'),
        _sku('branco', 'm'),
      ],
    );

class _Harness {
  _Harness({
    required this.service,
    required this.picker,
    required this.analytics,
  });

  final _FakeCustomizeService service;
  final _FakePicker picker;
  final _RecordingAnalytics analytics;

  /// O que a página devolveu ao fechar (o host empilha a página).
  Object? popped = 'aberta';
}

Future<_Harness> _open(
  WidgetTester tester, {
  String? skuId = 'preto_m',
  _FakeCustomizeService? service,
  StoreProduct? product,
}) async {
  // Tela alta: prévia, abas e o painel cabem sem rolar.
  tester.view.physicalSize = const Size(390, 1500);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final harness = _Harness(
    service: service ?? _FakeCustomizeService(),
    picker: _FakePicker(),
    analytics: _RecordingAnalytics(),
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        storeRepositoryProvider.overrideWithValue(
          _FakeStoreRepository(StoreCatalog(products: [product ?? _camiseta])),
        ),
        storeUidProvider.overrideWith((ref) => 'u1'),
        storeCustomizeServiceProvider.overrideWithValue(harness.service),
        storeCustomImagePickerProvider.overrideWithValue(harness.picker),
        analyticsServiceProvider.overrideWithValue(harness.analytics),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: MediaQuery(
          data: const MediaQueryData(
            size: Size(390, 1500),
            disableAnimations: true,
          ),
          child: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () async {
                    harness.popped = null;
                    harness.popped = await Navigator.of(context).push<Object?>(
                      MaterialPageRoute(
                        builder: (_) => StoreCustomizePage(
                          productId: 'camiseta',
                          skuId: skuId,
                        ),
                      ),
                    );
                  },
                  child: const Text('abrir'),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.tap(find.text('abrir'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 600));
  return harness;
}

Finder _nameField() => find.byKey(const ValueKey('store-customize-name-field'));

Finder _addButton() => find.byKey(const ValueKey('store-customize-add'));

String _hint(WidgetTester tester) => tester
    .widget<Text>(find.byKey(const ValueKey('store-customize-name-hint')))
    .data!;

String _total(WidgetTester tester) => tester
    .widget<Text>(find.byKey(const ValueKey('store-customize-total')))
    .data!;

bool _addEnabled(WidgetTester tester) =>
    tester.widget<FilledButton>(_addButton()).onPressed != null;

/// Folha/rota: o 1º quadro liga a animação, o 2º leva até o fim (sem
/// `pumpAndSettle`, que trava com animação infinita).
Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 600));
}

/// Sai do campo (o "OK" do teclado): dispara o `checkStoreCustomName`.
Future<void> _blur(WidgetTester tester) async {
  await tester.testTextInput.receiveAction(TextInputAction.done);
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets('abre com header, prévia das costas e a aba Nome', (
    tester,
  ) async {
    final h = await _open(tester);

    expect(find.text(StoreCopy.customizePageTitle), findsOneWidget);
    expect(find.text('Camiseta Dry UV50 · Preta M'), findsOneWidget);
    expect(find.text('MOCKUP · COSTAS'), findsOneWidget);
    expect(find.text('NOME NAS COSTAS'), findsOneWidget);
    expect(find.text('+ ${formatBRLFromCents(1490)} sozinho'), findsOneWidget);
    expect(_hint(tester), '0 de 12 · letras, números e espaço');
    // Sem nome nem imagem: só o preço do SKU e o Adicionar desligado.
    expect(_total(tester), formatBRLFromCents(12990));
    expect(find.text(StoreCopy.customizeWithout), findsOneWidget);
    expect(_addEnabled(tester), isFalse);
    expect(
      h.analytics.logged(#logStoreCustomizeOpen, {#productId: 'camiseta'}),
      isTrue,
    );
  });

  testWidgets('nome é sanitizado e o contador atualiza', (tester) async {
    await _open(tester);

    await tester.enterText(_nameField(), '  antunes');
    await tester.pump();

    expect(
      tester.widget<TextField>(_nameField()).controller!.text,
      'ANTUNES',
    );
    expect(_hint(tester), '7 de 12 · letras, números e espaço');
    // A prévia mostra o nome nas costas.
    expect(
      tester
          .widget<Text>(
            find.byKey(const ValueKey('store-customize-preview-name')),
          )
          .data,
      'ANTUNES',
    );

    await tester.enterText(_nameField(), 'joão da silva');
    await tester.pump();
    expect(
      tester.widget<TextField>(_nameField()).controller!.text,
      'JOÃO DA SILV',
    );
    expect(_hint(tester), '12 de 12 · letras, números e espaço');
  });

  testWidgets('caractere inválido não entra e o hint avisa', (tester) async {
    await _open(tester);

    await tester.enterText(_nameField(), 'ana');
    await tester.pump();
    await tester.enterText(_nameField(), 'ana@');
    await _settle(tester);

    expect(tester.widget<TextField>(_nameField()).controller!.text, 'ANA');
    expect(_hint(tester), StoreCopy.customizeNameInvalidChar);

    // A próxima tecla válida volta o contador.
    await tester.enterText(_nameField(), 'anab');
    await tester.pump();
    expect(_hint(tester), '4 de 12 · letras, números e espaço');
  });

  testWidgets('total muda com nome (nameOnly) e com nome + imagem (both)', (
    tester,
  ) async {
    final h = await _open(tester);

    await tester.enterText(_nameField(), 'antunes');
    await tester.pump();
    expect(_total(tester), formatBRLFromCents(12990 + 1490));
    expect(find.text(StoreCopy.customizeWith), findsOneWidget);
    expect(_addEnabled(tester), isTrue);

    // Aba Imagem → folha Fotos · Arquivos · Câmera → Fotos.
    await tester.tap(find.byKey(const ValueKey('store-customize-tab-image')));
    await tester.pump();
    expect(find.text('IMAGEM NA FRENTE'), findsOneWidget);
    expect(find.text('MOCKUP · FRENTE'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('store-customize-upload')));
    await _settle(tester);
    expect(find.text(StoreCopy.customizeSourceCamera), findsOneWidget);
    await tester.tap(find.text(StoreCopy.customizeSourcePhotos));
    await _settle(tester);
    await tester.pump();

    expect(h.picker.sources, [StoreImageSource.photos]);
    expect(h.service.uploads, ['store/custom-uploads/u1/img-0.png']);
    expect(find.text('logo-dupla.png'), findsOneWidget);
    expect(find.text('Boa qualidade · 2400 × 2400 px'), findsOneWidget);
    expect(_total(tester), formatBRLFromCents(12990 + 2490));
    expect(
      h.analytics.logged(#logStoreCustomizeImage, {
        #area: 'peito_esquerdo',
        #quality: 'good',
      }),
      isTrue,
    );

    // Centro da frente (25 × 30 cm): 2400 px já não chega a 300 dpi.
    await tester.tap(
      find.byKey(const ValueKey('store-customize-area-centro_frente')),
    );
    await tester.pump();
    expect(
      find.text('Pode ficar levemente borrada no tamanho Centro da frente'),
      findsOneWidget,
    );

    // Sem nome, só a imagem.
    await tester.tap(find.byKey(const ValueKey('store-customize-tab-name')));
    await tester.pump();
    await tester.enterText(_nameField(), '');
    await tester.pump();
    expect(_total(tester), formatBRLFromCents(12990 + 1990));
  });

  testWidgets('nome bloqueado desabilita o Adicionar até mudar', (
    tester,
  ) async {
    final service = _FakeCustomizeService(blocked: {'PALAVRAO'});
    await _open(tester, service: service);

    await tester.enterText(_nameField(), 'palavrao');
    await tester.pump();
    expect(_addEnabled(tester), isTrue);

    await _blur(tester);

    expect(service.checked, ['PALAVRAO']);
    expect(_hint(tester), StoreCopy.customizeNameBlocked);
    expect(_addEnabled(tester), isFalse);

    // Mudou o nome: volta a valer.
    await tester.enterText(_nameField(), 'palavra');
    await tester.pump();
    expect(_hint(tester), '7 de 12 · letras, números e espaço');
    expect(_addEnabled(tester), isTrue);
  });

  testWidgets('Adicionar chama a callable com sku, qty, nome, fonte e cor', (
    tester,
  ) async {
    final h = await _open(tester);

    await tester.enterText(_nameField(), 'antunes');
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('store-customize-font-mono')));
    await tester.pump();
    await tester.tap(_addButton());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    final request = h.service.added.single;
    expect(request.productId, 'camiseta');
    expect(request.skuId, 'preto_m');
    expect(request.qty, 1);
    expect(request.image, isNull);
    expect(request.toMap()['name'], {
      'text': 'ANTUNES',
      'fontId': 'mono',
      // Camiseta preta: a cor de maior contraste é o branco.
      'color': '#ffffff',
    });
    expect(
      h.analytics.logged(#logStoreAddToCart, {
        #sku: 'preto_m',
        #qty: 1,
        #priceCents: 14480,
        #customized: true,
      }),
      isTrue,
    );
    // Volta para a página do produto avisando que entrou no carrinho.
    expect(h.popped, isTrue);
  });

  testWidgets('erro da callable vai direto pro snackbar', (tester) async {
    final service = _FakeCustomizeService(
      addError: const StoreCustomizeException(
        'Acabou o estoque dessa variação.',
        code: 'failed-precondition',
      ),
    );
    final h = await _open(tester, service: service);

    await tester.enterText(_nameField(), 'antunes');
    await tester.pump();
    await tester.tap(_addButton());
    await tester.pump();
    await tester.pump();

    expect(find.text('Acabou o estoque dessa variação.'), findsOneWidget);
    expect(h.popped, isNull, reason: 'continua na personalização');
  });

  testWidgets('mockup sem foto na cor da peça; trocar a cor mantém o nome', (
    tester,
  ) async {
    await _open(tester);

    Color mockup() => tester
        .widget<StoreStripedBox>(
          find.byKey(const ValueKey('store-customize-mockup')),
        )
        .color;
    expect(mockup(), const Color(0xFF111111));

    await tester.enterText(_nameField(), 'antunes');
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('store-customize-tab-variant')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('store-axis-cor-branco')));
    await tester.pump();

    expect(mockup(), const Color(0xFFF1ECE2));
    expect(find.text('Camiseta Dry UV50 · Branca M'), findsOneWidget);
    // Rótulo escuro sobre a peça clara.
    expect(
      tester.widget<Text>(find.text('MOCKUP · COSTAS')).style?.color,
      Colors.black.withValues(alpha: 0.4),
    );
    expect(_total(tester), formatBRLFromCents(12990 + 1490));
  });

  testWidgets('aba sem conteúdo mostra "Pular"', (tester) async {
    await _open(tester);

    final skip = find.byKey(const ValueKey('store-customize-skip'));
    expect(skip, findsOneWidget);
    await tester.enterText(_nameField(), 'ana');
    await tester.pump();
    expect(skip, findsNothing);
    await tester.enterText(_nameField(), '');
    await tester.pump();

    // Pular leva à próxima aba (Imagem), também vazia.
    await tester.tap(skip);
    await tester.pump();
    expect(
        find.byKey(const ValueKey('store-customize-upload')), findsOneWidget);
    expect(skip, findsOneWidget);
  });

  testWidgets('sem tamanho, Adicionar leva à aba Cor e tam. e pede o tamanho',
      (tester) async {
    final h = await _open(tester, skuId: null);

    expect(find.text('Camiseta Dry UV50 · Preta'), findsOneWidget);
    await tester.enterText(_nameField(), 'antunes');
    await tester.pump();
    await tester.tap(_addButton());
    await _settle(tester);

    expect(find.text('Escolha um tamanho'), findsOneWidget);
    expect(h.service.added, isEmpty);

    // Escolher o tamanho troca o SKU sem perder o nome.
    await tester.tap(find.byKey(const ValueKey('store-axis-tam-m')));
    await tester.pump();
    expect(find.text('Camiseta Dry UV50 · Preta M'), findsOneWidget);
    await tester.tap(_addButton());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(h.service.added.single.skuId, 'preto_m');
    expect(h.service.added.single.name?.text, 'ANTUNES');
  });

  testWidgets('voltar com alteração pergunta antes de descartar', (
    tester,
  ) async {
    final h = await _open(tester);

    await tester.enterText(_nameField(), 'antunes');
    await tester.pump();
    await tester.tap(find.byTooltip(StoreCopy.back));
    await _settle(tester);

    expect(find.text(StoreCopy.customizeDiscardTitle), findsOneWidget);
    await tester
        .tap(find.byKey(const ValueKey('store-customize-keep-editing')));
    await _settle(tester);
    expect(find.text(StoreCopy.customizeDiscardTitle), findsNothing);
    expect(h.popped, isNull);

    await tester.tap(find.byTooltip(StoreCopy.back));
    await _settle(tester);
    await tester.tap(find.byKey(const ValueKey('store-customize-discard')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(h.popped, isFalse);
    expect(find.text('abrir'), findsOneWidget);
  });

  group('aba Costas', () {
    Finder backTab() =>
        find.byKey(const ValueKey('store-customize-tab-back'));
    Finder numberField() =>
        find.byKey(const ValueKey('store-customize-back-number-field'));
    String numberText(WidgetTester tester) =>
        tester.widget<TextField>(numberField()).controller!.text;
    bool backDone(WidgetTester tester) => find
        .descendant(of: backTab(), matching: find.byIcon(Icons.check_rounded))
        .evaluate()
        .isNotEmpty;

    testWidgets('sem back.enabled não aparece', (tester) async {
      await _open(tester);

      expect(backTab(), findsNothing);
      expect(
        find.byKey(const ValueKey('store-customize-tab-variant')),
        findsOneWidget,
      );
    });

    testWidgets('com 4 abas, todos os rótulos no mesmo tamanho',
        (tester) async {
      await _open(tester, product: _camisetaWith(_withBack(_bothBack)));

      const tabs = ['name', 'image', 'back', 'variant'];
      Finder label(String tab) => find.descendant(
            of: find.byKey(ValueKey('store-customize-tab-$tab')),
            matching: find.byType(Text),
          );
      final sizes = {
        for (final tab in tabs)
          tester.widget<Text>(label(tab)).style!.fontSize,
      };
      expect(sizes, hasLength(1));
      expect(sizes.single, lessThan(14.5));
      // E nenhuma aba encolhe de novo sozinha (o FittedBox não entra).
      for (final tab in tabs) {
        final laidOut = tester.renderObject<RenderBox>(label(tab)).size.width;
        expect(tester.getRect(label(tab)).width, closeTo(laidOut, 0.5));
      }
    });

    testWidgets(
        'entre Imagem e Cor e tam.; título, preço, hint e prévia das costas',
        (tester) async {
      await _open(tester, product: _camisetaWith(_withBack(_bothBack)));

      double left(String tab) => tester
          .getTopLeft(find.byKey(ValueKey('store-customize-tab-$tab')))
          .dx;
      expect(left('image'), lessThan(left('back')));
      expect(left('back'), lessThan(left('variant')));

      await tester.tap(backTab());
      await tester.pump();

      expect(find.text('COSTAS · ABAIXO DO NOME'), findsOneWidget);
      expect(find.text('+ ${formatBRLFromCents(990)}'), findsOneWidget);
      expect(find.text('MOCKUP · COSTAS'), findsOneWidget);
      // Dois tipos liberados: seletor, com Número por padrão.
      expect(
        find.byKey(const ValueKey('store-customize-back-type-numero')),
        findsOneWidget,
      );
      expect(numberField(), findsOneWidget);
      expect(
        tester.widget<TextField>(numberField()).keyboardType,
        TextInputType.number,
      );
      expect(find.text('Até 2 dígitos · 0 a 99'), findsOneWidget);
      // Vazia: "Pular" e a caixa das costas reservada na prévia.
      expect(find.byKey(const ValueKey('store-customize-skip')), findsOneWidget);
      expect(
        find.byKey(const ValueKey('store-customize-preview-back')),
        findsOneWidget,
      );
    });

    testWidgets('número inválido não entra nem habilita o Adicionar', (
      tester,
    ) async {
      await _open(tester, product: _camisetaWith(_withBack(_bothBack)));
      await tester.tap(backTab());
      await tester.pump();

      await tester.enterText(numberField(), 'ab');
      await tester.pump();
      expect(numberText(tester), '');
      expect(_addEnabled(tester), isFalse);
      expect(_total(tester), formatBRLFromCents(12990));
      expect(backDone(tester), isFalse);

      // Passa do numberMaxDigits: fica nos 2 primeiros dígitos.
      await tester.enterText(numberField(), '123');
      await tester.pump();
      expect(numberText(tester), '12');
      expect(_addEnabled(tester), isTrue);
      expect(backDone(tester), isTrue);
    });

    testWidgets('com número, Adicionar manda back numero e soma backCents', (
      tester,
    ) async {
      final h = await _open(
        tester,
        product: _camisetaWith(_withBack(_bothBack)),
      );
      await tester.tap(backTab());
      await tester.pump();

      await tester.enterText(numberField(), '10');
      await tester.pump();
      expect(_total(tester), formatBRLFromCents(12990 + 990));
      expect(find.text(StoreCopy.customizeWith), findsOneWidget);
      // A prévia desenha o número na fonte e na cor do nome (camiseta
      // preta: branco).
      final preview = tester.widget<Text>(
        find.byKey(const ValueKey('store-customize-preview-back-number')),
      );
      expect(preview.data, '10');
      expect(preview.style?.color, const Color(0xFFFFFFFF));

      // Saiu do campo: loja_personalizar_costas {tipo: numero}.
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pump();
      expect(
        h.analytics.logged(#logStoreCustomizeBack, {#type: 'numero'}),
        isTrue,
      );

      // Com nome também: nameOnly + backCents.
      await tester.tap(find.byKey(const ValueKey('store-customize-tab-name')));
      await tester.pump();
      expect(find.text('MOCKUP · COSTAS'), findsOneWidget);
      await tester.enterText(_nameField(), 'antunes');
      await tester.pump();
      expect(_total(tester), formatBRLFromCents(12990 + 1490 + 990));

      await tester.tap(_addButton());
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));

      final request = h.service.added.single;
      expect(request.toMap()['back'], {'type': 'numero', 'number': '10'});
      expect(request.name?.text, 'ANTUNES');
      expect(request.image, isNull);
      expect(h.popped, isTrue);
    });

    testWidgets('seletor Número · Imagem: imagem pelo mesmo fluxo da frente', (
      tester,
    ) async {
      final h = await _open(
        tester,
        product: _camisetaWith(_withBack(_bothBack)),
      );
      await tester.tap(backTab());
      await tester.pump();

      await tester.tap(
        find.byKey(const ValueKey('store-customize-back-type-imagem')),
      );
      await tester.pump();
      expect(numberField(), findsNothing);
      expect(find.text('Sai centralizada · 25 × 25 cm'), findsOneWidget);

      // Folha Fotos · Arquivos · Câmera → Fotos.
      await tester.tap(find.byKey(const ValueKey('store-customize-upload')));
      await _settle(tester);
      expect(find.text(StoreCopy.customizeSourceCamera), findsOneWidget);
      await tester.tap(find.text(StoreCopy.customizeSourcePhotos));
      await _settle(tester);
      await tester.pump();

      expect(h.picker.sources, [StoreImageSource.photos]);
      expect(h.service.uploads, ['store/custom-uploads/u1/img-0.png']);
      expect(find.text('logo-dupla.png'), findsOneWidget);
      // 2400 px em 25 × 25 cm = 243 dpi: aviso pela área das costas.
      expect(find.text(StoreCopy.customizeBackQualityWarn), findsOneWidget);
      expect(_total(tester), formatBRLFromCents(12990 + 990));
      expect(backDone(tester), isTrue);
      expect(
        find.byKey(const ValueKey('store-customize-preview-back-image')),
        findsOneWidget,
      );
      expect(
        h.analytics.logged(#logStoreCustomizeBack, {#type: 'imagem'}),
        isTrue,
      );
      // A imagem das costas não é a da frente.
      await tester.tap(find.byKey(const ValueKey('store-customize-tab-image')));
      await tester.pump();
      expect(find.byKey(const ValueKey('store-customize-upload')), findsOneWidget);

      // Voltar pro Número: a imagem não conta; vazio não habilita.
      await tester.tap(backTab());
      await tester.pump();
      await tester.tap(
        find.byKey(const ValueKey('store-customize-back-type-numero')),
      );
      await tester.pump();
      expect(numberField(), findsOneWidget);
      expect(_addEnabled(tester), isFalse);
      expect(_total(tester), formatBRLFromCents(12990));

      // De novo Imagem: a escolhida continua lá e vai na callable.
      await tester.tap(
        find.byKey(const ValueKey('store-customize-back-type-imagem')),
      );
      await tester.pump();
      expect(_addEnabled(tester), isTrue);
      await tester.tap(_addButton());
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));

      final request = h.service.added.single;
      expect(request.name, isNull);
      expect(request.image, isNull);
      expect(request.toMap()['back'], {
        'type': 'imagem',
        'path': 'store/custom-uploads/u1/img-0.png',
        // Sem ajuste fino: centralizada e inteira na área.
        'transform': {'x': 0.5, 'y': 0.5, 'scale': 1.0},
      });
    });

    testWidgets('um tipo só: sem seletor; hint pelo numberMaxDigits', (
      tester,
    ) async {
      await _open(
        tester,
        product: _camisetaWith(
          _withBack(
            const StoreCustomBackOptions(
              enabled: true,
              allowNumber: true,
              numberMaxDigits: 1,
            ),
          ),
        ),
      );
      await tester.tap(backTab());
      await tester.pump();

      expect(
        find.byKey(const ValueKey('store-customize-back-type-numero')),
        findsNothing,
      );
      expect(find.text('Até 1 dígito · 0 a 9'), findsOneWidget);
      await tester.enterText(numberField(), '77');
      await tester.pump();
      expect(numberText(tester), '7');
      expect(_addEnabled(tester), isTrue);
    });
  });
}
