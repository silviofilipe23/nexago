// Task 11 (RBAC arena/equipe): a diferença entre LER e ESCREVER em Comandas e
// Estoque. `financeiro` lê `comandas` mas não escreve — abre a tela e não
// encontra nenhuma ação que grave (abrir, lançar item, pagar, fechar).
// `recepcao` lê `estoque` mas não escreve — vê os alertas de estoque, mas não
// cria produto, repõe nem edita. `recepcao` (escreve `comandas`) e
// `manutencao` (escreve `estoque`) não podem perder botão nenhum.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_plan.dart';
import 'package:nexago_app/features/arena/domain/arena_plan_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_schedule_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda_item.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda_payment.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda_providers.dart';
import 'package:nexago_app/features/arena/domain/products/arena_product.dart';
import 'package:nexago_app/features/arena/domain/products/arena_product_category.dart';
import 'package:nexago_app/features/arena/domain/products/arena_product_providers.dart';
import 'package:nexago_app/features/arena/domain/products/arena_stock_movement.dart';
import 'package:nexago_app/features/arena/presentation/comandas/arena_comanda_detail_page.dart';
import 'package:nexago_app/features/arena/presentation/comandas/arena_comanda_payment_page.dart';
import 'package:nexago_app/features/arena/presentation/comandas/arena_comanda_quick_add_page.dart';
import 'package:nexago_app/features/arena/presentation/comandas/arena_comanda_review_page.dart';
import 'package:nexago_app/features/arena/presentation/comandas/arena_comandas_page.dart';
import 'package:nexago_app/features/arena/presentation/comandas/widgets/arena_comanda_items_section.dart';
import 'package:nexago_app/features/arena/presentation/products/arena_product_form_page.dart';
import 'package:nexago_app/features/arena/presentation/products/arena_products_list_page.dart';
import 'package:nexago_app/features/arena/presentation/products/arena_restock_page.dart';
import 'package:nexago_app/features/arena/presentation/products/arena_stock_alerts_page.dart';
import 'package:nexago_app/features/arena/presentation/products/widgets/arena_product_card.dart';

/// Overrides das duas fontes-folha: nenhuma ida ao Firestore.
///
/// Copiado de `arena_agenda_write_actions_test.dart` (Task 10) — mesmo
/// padrão, sem importar do outro arquivo de teste.
List<Override> overridesForRole(ArenaStaffRole? role, {bool owner = false}) {
  final membership = ArenaMembership(
    arenaId: 'a1',
    name: 'Vegeton',
    isOwner: owner,
    role: role,
  );
  return [
    ownedArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(owner ? [membership] : const <ArenaMembership>[]),
    ),
    staffArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(owner ? const <ArenaMembership>[] : [membership]),
    ),
    // As páginas de comandas/estoque checam titularidade do plano (paywall)
    // além do RBAC — não é o que este arquivo testa, então libera as duas
    // capacidades para nenhum teste cair no upsell em vez de exercitar o
    // gate de escrita. Evita também tocar `managedArenaPlanStatusProvider`
    // (Firestore) sem override.
    managedArenaCapabilitiesProvider.overrideWith(
      (ref) => const {ArenaCapability.pdvComandas, ArenaCapability.estoque},
    ),
    // Nome/logo da arena não fazem parte do que este arquivo testa.
    managedArenaDetailProvider.overrideWith((ref) => Stream.value(null)),
  ];
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  // --- Comandas ---

  final openComanda = ArenaComanda(
    id: 'c1',
    arenaId: 'a1',
    displayNumber: 42,
    type: ArenaComandaType.individual,
    status: ArenaComandaStatus.open,
    customerName: 'Cliente Teste',
    allowAppOrders: false,
    rentalCents: 0,
    itemsTotalCents: 500,
    totalCents: 500,
    itemsCount: 1,
    paidCents: 0,
    openedByUid: 'uid1',
  );

  Future<void> pumpComandasList(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          arenaComandasStreamProvider('a1').overrideWith(
            (ref) => Stream.value(const <ArenaComanda>[]),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaComandasPage(),
        ),
      ),
    );
    // Sem pumpAndSettle: telas do painel tem indicador "AO VIVO" cuja
    // animacao nunca assenta e trava o teste no timeout.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 500));
  }

  testWidgets('financeiro nao ve Nova comanda', (tester) async {
    await pumpComandasList(tester, overridesForRole(ArenaStaffRole.financeiro));
    expect(find.text('Nova'), findsNothing);
  });

  testWidgets('recepcao ve Nova comanda', (tester) async {
    await pumpComandasList(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Nova'), findsOneWidget);
  });

  // --- arena_comanda_detail_page.dart: "Adicionar" e "Fechar conta" ---
  // Idioma já usado na tela: desabilitar (callback nulo) por regra de
  // negócio (`canClose`/`canCloseEmpty`) — não esconder. `!canWrite ||`
  // segue o mesmo idioma local em vez de reestruturar o layout.

  Future<void> pumpComandaDetail(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          arenaComandaStreamProvider('c1').overrideWith(
            (ref) => Stream.value(openComanda),
          ),
          arenaComandaItemsStreamProvider('c1').overrideWith(
            (ref) => Stream.value(const <ArenaComandaItem>[]),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaComandaDetailPage(comandaId: 'c1'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('financeiro nao pode adicionar nem fechar comanda',
      (tester) async {
    await pumpComandaDetail(
      tester,
      overridesForRole(ArenaStaffRole.financeiro),
    );
    final adicionar = tester.widget<OutlinedButton>(
      find.widgetWithText(OutlinedButton, 'Adicionar'),
    );
    final fechar = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Fechar conta →'),
    );
    expect(adicionar.onPressed, isNull);
    expect(fechar.onPressed, isNull);
  });

  testWidgets('recepcao pode adicionar e fechar comanda', (tester) async {
    await pumpComandaDetail(tester, overridesForRole(ArenaStaffRole.recepcao));
    final adicionar = tester.widget<OutlinedButton>(
      find.widgetWithText(OutlinedButton, 'Adicionar'),
    );
    final fechar = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Fechar conta →'),
    );
    expect(adicionar.onPressed, isNotNull);
    expect(fechar.onPressed, isNotNull);
  });

  // --- widgets/arena_comanda_items_section.dart: estornar item (swipe) ---
  // Achado da varredura: gesto `Dismissible`, não um botão — nenhum grep de
  // texto/ícone pega isso, só a leitura do build(). Testamos o widget em
  // isolamento (ele só recebe `comanda`/`items` por parâmetro, nenhum
  // provider extra além do RBAC).

  final reversibleItem = ArenaComandaItem(
    id: 'item1',
    productId: 'p1',
    productName: 'Água',
    quantity: 1,
    unitPriceCents: 500,
    lineTotalCents: 500,
    source: ArenaComandaItemSource.counter,
    addedByName: 'Gestor',
    addedByUid: 'uid1',
  );

  Future<void> pumpItemsSection(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(
            body: ArenaComandaItemsSection(
              comanda: openComanda,
              items: [reversibleItem],
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('financeiro nao ve opcao de estornar item', (tester) async {
    await pumpItemsSection(
      tester,
      overridesForRole(ArenaStaffRole.financeiro),
    );
    expect(find.byType(Dismissible), findsNothing);
  });

  testWidgets('recepcao ve opcao de estornar item', (tester) async {
    await pumpItemsSection(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.byType(Dismissible), findsOneWidget);
  });

  // --- arena_comanda_quick_add_page.dart: tela inteira ---
  // Só existe para lançar item (grava `addItemsBatch`) — reachable direto
  // por rota (`/arena/comandas/:id/quick-add`) mesmo com "Adicionar" já
  // desabilitado no detalhe. Mesmo idioma de bloqueio de tela inteira que a
  // própria tela já usa para "Comanda não encontrada".

  Future<void> pumpQuickAdd(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          arenaComandaStreamProvider('c1').overrideWith(
            (ref) => Stream.value(openComanda),
          ),
          arenaProductsStreamProvider('a1').overrideWith(
            (ref) => Stream.value(const <ArenaProduct>[]),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaComandaQuickAddPage(comandaId: 'c1'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 500));
  }

  testWidgets('financeiro nao alcanca lancamento rapido', (tester) async {
    await pumpQuickAdd(tester, overridesForRole(ArenaStaffRole.financeiro));
    expect(find.text('Sem permissão'), findsOneWidget);
    expect(find.text('Lançamento rápido'), findsNothing);
  });

  testWidgets('recepcao alcanca lancamento rapido', (tester) async {
    await pumpQuickAdd(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Sem permissão'), findsNothing);
    expect(find.text('Lançamento rápido'), findsOneWidget);
  });

  // --- arena_comanda_payment_page.dart: tela inteira ---
  // Só existe para registrar pagamento (`registerPayment`) — mesma razão de
  // alcançabilidade direta por rota do quick-add.

  Future<void> pumpPayment(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          arenaComandaStreamProvider('c1').overrideWith(
            (ref) => Stream.value(openComanda),
          ),
          arenaComandaPaymentsStreamProvider('c1').overrideWith(
            (ref) => Stream.value(const <ArenaComandaPayment>[]),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaComandaPaymentPage(comandaId: 'c1'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('financeiro nao alcanca pagamento da comanda', (tester) async {
    await pumpPayment(tester, overridesForRole(ArenaStaffRole.financeiro));
    expect(find.text('Sem permissão'), findsOneWidget);
    expect(find.text('FORMA DE PAGAMENTO'), findsNothing);
  });

  testWidgets('recepcao alcanca pagamento da comanda', (tester) async {
    await pumpPayment(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Sem permissão'), findsNothing);
    expect(find.text('FORMA DE PAGAMENTO'), findsOneWidget);
  });

  // --- arena_comanda_review_page.dart: tela inteira (achado: único ponto de
  // escrita do wizard "Nova comanda" — as etapas anteriores só mexem no
  // rascunho em memória; a rota não exige `extra`, alcançável direto mesmo
  // com "Nova" já escondida na listagem) ---

  Future<void> pumpReview(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaComandaReviewPage(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('financeiro nao alcanca revisar comanda', (tester) async {
    await pumpReview(tester, overridesForRole(ArenaStaffRole.financeiro));
    expect(find.text('Sem permissão'), findsOneWidget);
    expect(find.text('Abrir comanda'), findsNothing);
  });

  testWidgets('recepcao alcanca revisar comanda', (tester) async {
    await pumpReview(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Sem permissão'), findsNothing);
    final abrir = tester.widget<FilledButton>(
      find.ancestor(
        of: find.text('Abrir comanda'),
        matching: find.byType(FilledButton),
      ),
    );
    expect(abrir.onPressed, isNotNull);
  });

  // --- Estoque ---

  final outOfStockProduct = ArenaProduct(
    id: 'p1',
    name: 'Isotônico',
    category: ArenaProductCategory.bebidas,
    active: true,
    priceCents: 800,
    stockQuantity: 0,
    minStockQuantity: 5,
  );

  // --- arena_products_list_page.dart: "Novo produto", atalho de estoque e
  // tocar num produto (edita — não há tela de leitura separada) ---

  Future<void> pumpProductsList(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          arenaProductsStreamProvider('a1').overrideWith(
            (ref) => Stream.value([outOfStockProduct]),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaProductsListPage(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('recepcao nao ve novo produto nem atalho de estoque',
      (tester) async {
    await pumpProductsList(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.byIcon(Icons.add_rounded), findsNothing);
    expect(find.byIcon(Icons.inventory_2_outlined), findsNothing);
  });

  testWidgets('manutencao ve novo produto e atalho de estoque', (tester) async {
    await pumpProductsList(
      tester,
      overridesForRole(ArenaStaffRole.manutencao),
    );
    expect(find.byIcon(Icons.add_rounded), findsOneWidget);
    expect(find.byIcon(Icons.inventory_2_outlined), findsOneWidget);
  });

  testWidgets('recepcao nao alcanca editar produto pela listagem',
      (tester) async {
    await pumpProductsList(tester, overridesForRole(ArenaStaffRole.recepcao));
    final card = tester.widget<ArenaProductCard>(
      find.byType(ArenaProductCard),
    );
    expect(card.onTap, isNull);
  });

  testWidgets('manutencao alcanca editar produto pela listagem',
      (tester) async {
    await pumpProductsList(
      tester,
      overridesForRole(ArenaStaffRole.manutencao),
    );
    final card = tester.widget<ArenaProductCard>(
      find.byType(ArenaProductCard),
    );
    expect(card.onTap, isNotNull);
  });

  // --- arena_stock_alerts_page.dart: botão "Repor" por item ---
  // A tela em si continua visível para quem só lê estoque (KPIs, listas de
  // alerta) — só o botão de escrita some.

  Future<void> pumpStockAlerts(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          arenaProductsStreamProvider('a1').overrideWith(
            (ref) => Stream.value([outOfStockProduct]),
          ),
          arenaStockTurnover7dProvider('a1').overrideWith((ref) async => 0),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaStockAlertsPage(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('recepcao ve alertas de estoque sem Repor', (tester) async {
    await pumpStockAlerts(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Esgotado'), findsOneWidget);
    expect(find.text('Repor'), findsNothing);
  });

  testWidgets('manutencao ve Repor nos alertas de estoque', (tester) async {
    await pumpStockAlerts(
      tester,
      overridesForRole(ArenaStaffRole.manutencao),
    );
    expect(find.text('Repor'), findsOneWidget);
  });

  // --- arena_product_form_page.dart: tela inteira (novo produto — evita a
  // ramificação de edição, que registra um `ref.listen` incondicional em
  // `arenaProductProvider` antes mesmo do gate; o "novo" já cobre o mesmo
  // bloqueio sem precisar desse override) ---

  Future<void> pumpProductForm(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaProductFormPage(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('recepcao nao alcanca formulario de produto', (tester) async {
    await pumpProductForm(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Sem permissão'), findsOneWidget);
    expect(find.text('Salvar produto'), findsNothing);
  });

  testWidgets('manutencao alcanca formulario de produto', (tester) async {
    await pumpProductForm(
      tester,
      overridesForRole(ArenaStaffRole.manutencao),
    );
    expect(find.text('Sem permissão'), findsNothing);
    expect(find.text('Salvar produto'), findsOneWidget);
  });

  // --- arena_restock_page.dart: tela inteira ---
  // Só existe para registrar movimentação (`registerStockMovement`) —
  // reachable direto por rota (`/arena/products/:id/restock`) mesmo com
  // "Repor" já escondido nos alertas.

  Future<void> pumpRestock(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          arenaProductProvider((arenaId: 'a1', productId: 'p1'))
              .overrideWith((ref) async => outOfStockProduct),
          arenaProductMovementsProvider((arenaId: 'a1', productId: 'p1'))
              .overrideWith(
                  (ref) => Stream.value(const <ArenaStockMovement>[])),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaRestockPage(productId: 'p1'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('recepcao nao alcanca reposicao de estoque', (tester) async {
    await pumpRestock(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Sem permissão'), findsOneWidget);
    expect(find.text('TIPO DE MOVIMENTAÇÃO'), findsNothing);
  });

  testWidgets('manutencao alcanca reposicao de estoque', (tester) async {
    await pumpRestock(tester, overridesForRole(ArenaStaffRole.manutencao));
    expect(find.text('Sem permissão'), findsNothing);
    expect(find.text('TIPO DE MOVIMENTAÇÃO'), findsOneWidget);
  });
}
