import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_grouping.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_date_utils.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/domain/arena_plan.dart';
import 'package:nexago_app/features/arena/domain/arena_plan_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_schedule_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda_closed_args.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda_draft.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda_logic.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda_payment.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda_providers.dart';
import 'package:nexago_app/features/arena/domain/products/arena_product.dart';
import 'package:nexago_app/features/arena/domain/products/arena_product_category.dart';
import 'package:nexago_app/features/arena/domain/products/arena_product_logic.dart';
import 'package:nexago_app/features/arena/domain/products/arena_product_providers.dart';
import 'package:nexago_app/features/arena/domain/products/arena_stock_movement.dart';
import 'package:nexago_app/features/arena/domain/products/arena_stock_movement_registered_args.dart';
import 'package:nexago_app/features/arena/presentation/comandas/arena_comanda_closed_page.dart';
import 'package:nexago_app/features/arena/presentation/comandas/arena_comanda_link_booking_page.dart';
import 'package:nexago_app/features/arena/presentation/comandas/arena_comanda_payment_page.dart';
import 'package:nexago_app/features/arena/presentation/comandas/arena_comanda_review_page.dart';
import 'package:nexago_app/features/arena/presentation/comandas/widgets/arena_comanda_card.dart';
import 'package:nexago_app/features/arena/presentation/comandas/widgets/arena_comanda_product_tile.dart';
import 'package:nexago_app/features/arena/presentation/comandas/widgets/arena_comanda_summary_card.dart';
import 'package:nexago_app/features/arena/presentation/products/arena_product_delete_sheet.dart';
import 'package:nexago_app/features/arena/presentation/products/arena_product_form_page.dart';
import 'package:nexago_app/features/arena/presentation/products/arena_restock_page.dart';
import 'package:nexago_app/features/arena/presentation/products/arena_stock_alerts_page.dart';
import 'package:nexago_app/features/arena/presentation/products/arena_stock_movement_registered_page.dart';
import 'package:nexago_app/features/arena/presentation/products/widgets/arena_product_card.dart';
import 'package:nexago_app/features/arena/presentation/products/widgets/arena_product_summary_row.dart';
import 'package:nexago_app/features/arena/presentation/products/widgets/arena_stock_status_badge.dart';

import '../../core/theme/state_tone_screens.dart';

// Verde, vermelho e âmbar nas telas de Produtos/estoque e Comandas do gestor
// da arena, conferidos contra o fundo real nos dois temas. No claro os crus
// do AppColors reprovam: são ~1,6–3,5:1 no branco.

// ── Fixtures ────────────────────────────────────────────────────────────

/// RBAC sem Firestore: arena 'a1' com o cargo dado. Mesmo padrão de
/// `arena_comandas_estoque_write_test.dart`.
List<Override> _overridesForRole(ArenaStaffRole role) {
  final membership = ArenaMembership(
    arenaId: 'a1',
    name: 'Arena Sol',
    isOwner: false,
    role: role,
  );
  return [
    ownedArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(const <ArenaMembership>[]),
    ),
    staffArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value([membership]),
    ),
    managedArenaCapabilitiesProvider.overrideWith(
      (ref) => const {ArenaCapability.pdvComandas, ArenaCapability.estoque},
    ),
    managedArenaDetailProvider.overrideWith((ref) => Stream.value(null)),
  ];
}

ArenaComanda _comanda({
  ArenaComandaStatus status = ArenaComandaStatus.open,
  int totalCents = 4500,
  int paidCents = 0,
  String? bookingDisplayCode,
}) {
  return ArenaComanda(
    id: 'c1',
    arenaId: 'a1',
    displayNumber: 42,
    type: ArenaComandaType.individual,
    status: status,
    customerName: 'Ana Souza',
    allowAppOrders: false,
    rentalCents: 0,
    itemsTotalCents: totalCents,
    totalCents: totalCents,
    itemsCount: 3,
    paidCents: paidCents,
    openedByUid: 'u1',
    bookingDisplayCode: bookingDisplayCode,
    locationLabel: 'Quadra 1',
  );
}

const _bookingId = 'bk-ab123';
final _bookingCode = ArenaBookingsGrouping.displayCode(_bookingId);

/// Reserva de hoje que vale o dia inteiro: está "ativa agora" a qualquer
/// hora em que o teste rodar, e o texto não muda.
final _bookingNow = ArenaManagerBooking(
  id: _bookingId,
  athleteId: 'u2',
  courtId: 'q1',
  courtName: 'Quadra 1',
  dateKey: arenaDateKey(DateTime.now()),
  startTime: '00:00',
  endTime: '24:00',
  data: const {
    'status': 'active',
    'amountReais': 120,
    'confirmedAthletes': [
      {'name': 'Ana'},
      {'name': 'Bia'},
    ],
  },
);

class _DraftWithBooking extends ArenaComandaDraftNotifier {
  @override
  ArenaComandaDraft build() => ArenaComandaDraft(
        linkedBooking: _bookingNow,
        customerName: 'Ana Souza',
      );
}

ArenaProduct _product({
  String id = 'p1',
  String name = 'Isotônico',
  int stock = 3,
  int min = 5,
}) {
  return ArenaProduct(
    id: id,
    name: name,
    category: ArenaProductCategory.bebidas,
    active: true,
    priceCents: 450,
    stockQuantity: stock,
    minStockQuantity: min,
    emoji: '🥤',
  );
}

final _movements = [
  ArenaStockMovement(
    id: 'm1',
    productId: 'p1',
    productName: 'Isotônico',
    type: ArenaStockMovementType.purchase,
    quantityDelta: 12,
    quantityBefore: 0,
    quantityAfter: 12,
    createdByUid: 'u1',
    note: 'compra fornecedor',
    createdAt: DateTime(2026, 3, 5, 10, 30),
  ),
  ArenaStockMovement(
    id: 'm2',
    productId: 'p1',
    productName: 'Isotônico',
    type: ArenaStockMovementType.loss,
    quantityDelta: -2,
    quantityBefore: 12,
    quantityAfter: 10,
    createdByUid: 'u1',
    createdAt: DateTime(2026, 3, 6, 18, 0),
  ),
];

Future<void> _pumpRestock(
  WidgetTester tester,
  ThemeData theme,
  ArenaProduct product,
  List<ArenaStockMovement> movements,
) {
  return pumpTonePage(
    tester,
    theme,
    ArenaRestockPage(productId: product.id),
    overrides: [
      ..._overridesForRole(ArenaStaffRole.manutencao),
      arenaProductProvider((arenaId: 'a1', productId: product.id))
          .overrideWith((ref) async => product),
      arenaProductMovementsProvider((arenaId: 'a1', productId: product.id))
          .overrideWith((ref) => Stream.value(movements)),
    ],
  );
}

ArenaStockMovementRegisteredArgs _registered(
  ArenaStockMovementType type,
  int delta,
) {
  return ArenaStockMovementRegisteredArgs(
    productName: 'Isotônico',
    productEmoji: '🥤',
    type: type,
    quantityDelta: delta,
    quantityBefore: 5,
    quantityAfter: 5 + delta,
    priceCents: 450,
    registeredAt: DateTime(2026, 10, 1, 9, 30),
  );
}

/// Mais largo que o telefone: na fonte de teste (glifo quadrado) a linha do
/// selo do card da comanda e a de "Pago/Total" do pagamento não cabem em
/// 402 px e o overflow derruba o teste.
Widget _wide(Widget child) => SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: SizedBox(width: 560, child: child),
    );

/// A linha "N un · mín M" do card de produto, sem a barra de nível: a
/// barra (8 px de altura) é barra de progresso e fica no cru.
Finder _stockLine(String text) =>
    find.ancestor(of: find.text(text), matching: find.byType(Row)).first;

// ── Telas ───────────────────────────────────────────────────────────────

final List<ToneScreen> arenaProductsComandasToneScreens = [
  // Comandas
  ToneScreen(
    'Card da comanda: aberta',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      _wide(ArenaComandaCard(comanda: _comanda(), onTap: () {})),
    ),
    tonePiece,
    ['ABERTA', 'marca'],
  ),
  ToneScreen(
    'Card da comanda: em fechamento',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      _wide(
        ArenaComandaCard(
          comanda: _comanda(status: ArenaComandaStatus.closing),
          onTap: () {},
        ),
      ),
    ),
    tonePiece,
    ['EM FECHAMENTO', 'marca'],
  ),
  ToneScreen(
    'Card da comanda: parcialmente paga',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      _wide(
        ArenaComandaCard(
          comanda: _comanda(
            status: ArenaComandaStatus.partiallyPaid,
            totalCents: 9000,
          ),
          onTap: () {},
        ),
      ),
    ),
    tonePiece,
    [formatComandaReais(4500)],
  ),
  ToneScreen(
    'Resumo da comanda: aberta com reserva',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      ArenaComandaSummaryCard(
        comanda: _comanda(bookingDisplayCode: _bookingCode),
      ),
    ),
    tonePiece,
    ['ABERTA', 'marca', _bookingCode],
  ),
  ToneScreen(
    'Resumo da comanda: em fechamento',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      ArenaComandaSummaryCard(
        comanda: _comanda(status: ArenaComandaStatus.closing),
      ),
    ),
    tonePiece,
    ['EM FECHAMENTO', 'marca'],
  ),
  ToneScreen(
    'Produto do lançamento: esgotado',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      SizedBox(
        width: 180,
        height: 260,
        child: ArenaComandaProductTile(
          product: _product(stock: 0),
          quantity: 0,
          onIncrement: () {},
        ),
      ),
    ),
    tonePiece,
    ['ESGOTADO'],
  ),
  ToneScreen(
    'Comanda fechada',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      ArenaComandaClosedPage(
        args: ArenaComandaClosedArgs(
          comanda: _comanda(
            status: ArenaComandaStatus.closed,
            totalCents: 10000,
            paidCents: 10000,
            bookingDisplayCode: _bookingCode,
          ),
          payments: const [
            ArenaComandaPayment(
              id: 'p1',
              method: ArenaComandaPaymentMethod.pix,
              amountCents: 6000,
              payerName: 'Ana Souza',
              receivedByUid: 'u1',
            ),
            ArenaComandaPayment(
              id: 'p2',
              method: ArenaComandaPaymentMethod.cash,
              amountCents: 4000,
              payerName: 'Bia Lima',
              receivedByUid: 'u1',
            ),
          ],
        ),
      ),
    ),
    find.byType(ArenaComandaClosedPage),
    [
      Icons.check_rounded,
      formatComandaReais(6000),
      formatComandaReais(4000),
      Icons.sports_tennis_rounded,
    ],
  ),
  ToneScreen(
    'Nova comanda: vincular reserva',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const ArenaComandaLinkBookingPage(),
      overrides: [
        arenaBookingsTodayProvider.overrideWith(
          (ref) => AsyncValue.data([_bookingNow]),
        ),
      ],
    ),
    find.byType(ArenaComandaLinkBookingPage),
    ['+ ${formatComandaReais(12000)} locação · $_bookingCode'],
  ),
  ToneScreen(
    'Nova comanda: revisar e abrir',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const ArenaComandaReviewPage(),
      overrides: [
        ..._overridesForRole(ArenaStaffRole.recepcao),
        arenaComandaDraftProvider.overrideWith(_DraftWithBooking.new),
      ],
    ),
    find.byType(ArenaComandaReviewPage),
    [_bookingCode],
  ),
  ToneScreen(
    'Pagamento da comanda',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const ArenaComandaPaymentPage(comandaId: 'c1'),
      size: const Size(600, 1400),
      overrides: [
        ..._overridesForRole(ArenaStaffRole.recepcao),
        arenaComandaStreamProvider('c1').overrideWith(
          (ref) => Stream.value(
            _comanda(
              status: ArenaComandaStatus.partiallyPaid,
              totalCents: 12000,
              paidCents: 5000,
            ),
          ),
        ),
        arenaComandaPaymentsStreamProvider('c1').overrideWith(
          (ref) => Stream.value([
            ArenaComandaPayment(
              id: 'p1',
              method: ArenaComandaPaymentMethod.pix,
              amountCents: 5000,
              payerName: 'Ana Souza',
              receivedByUid: 'u1',
              createdAt: DateTime(2026, 10, 1, 19, 5),
            ),
          ]),
        ),
      ],
    ),
    find.byType(ArenaComandaPaymentPage),
    [
      'Pago ${formatComandaReais(5000)}',
      Icons.check_rounded,
      formatComandaReais(5000),
    ],
  ),

  // Produtos e estoque
  ToneScreen(
    'Card de produto: estoque ok',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      ArenaProductCard(product: _product(stock: 20), onTap: () {}),
    ),
    _stockLine('20 un'),
    ['20 un'],
  ),
  ToneScreen(
    'Card de produto: estoque baixo',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      ArenaProductCard(product: _product(stock: 3), onTap: () {}),
    ),
    _stockLine('3 un'),
    ['3 un'],
  ),
  ToneScreen(
    'Card de produto: esgotado',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      ArenaProductCard(product: _product(stock: 0), onTap: () {}),
    ),
    _stockLine('0 un'),
    ['0 un'],
  ),
  ToneScreen(
    'Resumo de produtos: baixo e esgotado',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const ArenaProductSummaryRow(
        summary: ArenaProductSummary(
          activeCount: 7,
          lowCount: 2,
          outCount: 1,
          inventoryValueCents: 123450,
        ),
      ),
    ),
    tonePiece,
    ['2', '1'],
  ),
  ToneScreen(
    'Selo de estoque: esgotado e baixo',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ArenaStockStatusBadge.outOfStock(),
          SizedBox(height: 8),
          ArenaStockStatusBadge.lowStock(),
        ],
      ),
      onCard: true,
    ),
    tonePiece,
    ['Esgotado', 'Estoque baixo'],
  ),
  ToneScreen(
    'Excluir produto (folha)',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      ArenaProductDeleteSheet(arenaId: 'a1', product: _product(stock: 3)),
      onSheet: true,
    ),
    tonePiece,
    [
      Icons.delete_outline_rounded,
      'Não dá pra reverter.',
      Icons.close_rounded,
      Icons.warning_amber_rounded,
      Icons.history_rounded,
      '3 un em estoque',
    ],
  ),
  ToneScreen(
    'Editar produto: botão excluir',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const ArenaProductFormPage(productId: 'p1'),
      overrides: [
        ..._overridesForRole(ArenaStaffRole.manutencao),
        arenaProductProvider((arenaId: 'a1', productId: 'p1'))
            .overrideWith((ref) async => _product()),
      ],
    ),
    find.byType(ArenaProductFormPage),
    [Icons.delete_outline_rounded],
  ),
  ToneScreen(
    'Repor estoque: compra, estoque baixo e histórico',
    (tester, theme) => _pumpRestock(tester, theme, _product(), _movements),
    find.byType(ArenaRestockPage),
    ['ESTOQUE BAIXO', 'Compra', 'novo total: 4 un', '+12', '-2'],
  ),
  ToneScreen(
    'Repor estoque: perda maior que o estoque',
    (tester, theme) async {
      await _pumpRestock(tester, theme, _product(stock: 0), const []);
      await tester.tap(find.text('Perda'));
      await tester.pump();
    },
    find.byType(ArenaRestockPage),
    ['ESGOTADO', 'Perda', 'novo total: -1 un'],
  ),
  ToneScreen(
    'Alertas de estoque',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const ArenaStockAlertsPage(),
      overrides: [
        ..._overridesForRole(ArenaStaffRole.manutencao),
        arenaProductsStreamProvider('a1').overrideWith(
          (ref) => Stream.value([
            _product(stock: 0),
            _product(id: 'p2', name: 'Água', stock: 3),
            _product(id: 'p3', name: 'Barra', stock: 1, min: 4),
          ]),
        ),
        arenaStockTurnover7dProvider('a1').overrideWith((ref) async => 9),
      ],
    ),
    find.byType(ArenaStockAlertsPage),
    [
      '▲ 9 un',
      'bloqueia venda',
      '2',
      '● 0 un • mín 5',
      '● 3 un • mín 5',
      '● 1 un • mín 4',
    ],
  ),
  ToneScreen(
    'Movimentação registrada: entrada',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      ArenaStockMovementRegisteredPage(
        args: _registered(ArenaStockMovementType.purchase, 12),
      ),
    ),
    find.byType(ArenaStockMovementRegisteredPage),
    [Icons.arrow_forward_rounded, 'AGORA', 'Entrada · Compra', '+12 un'],
  ),
  ToneScreen(
    'Movimentação registrada: perda',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      ArenaStockMovementRegisteredPage(
        args: _registered(ArenaStockMovementType.loss, -2),
      ),
    ),
    find.byType(ArenaStockMovementRegisteredPage),
    [Icons.arrow_forward_rounded, 'AGORA', 'Saída · Perda', '-2 un'],
  ),
];

void main() => stateToneScreensTests(arenaProductsComandasToneScreens);
