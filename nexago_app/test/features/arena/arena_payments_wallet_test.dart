// Financeiro da arena (app): "a liberar" do cartão e origem das linhas do
// extrato — a mesma leitura que o PR #794 levou ao portal. Teste de tela, não
// só da lógica: a fiação (provider → card → tile) é o que tinha ficado de fora.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/data/arena_wallet_repository.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_schedule_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_wallet_providers.dart';
import 'package:nexago_app/features/arena/presentation/arena_payments_page.dart';

/// Dono da arena `a1` sem ida ao Firestore (mesmo padrão de
/// `arena_payments_owner_test.dart`).
List<Override> _ownerOverrides() {
  const membership = ArenaMembership(
    arenaId: 'a1',
    name: 'Vegeton',
    isOwner: true,
    role: null,
  );
  return [
    ownedArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(const [membership]),
    ),
    staffArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(const <ArenaMembership>[]),
    ),
  ];
}

void main() {
  Future<void> pumpPayments(
    WidgetTester tester, {
    required ArenaWalletSummary wallet,
    List<ArenaLedgerEntry> ledger = const [],
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ..._ownerOverrides(),
          managedArenaDetailProvider.overrideWith((ref) => Stream.value(null)),
          managedArenaWalletProvider
              .overrideWith((ref) => Stream.value(wallet)),
          arenaWalletLedgerProvider('a1').overrideWith(
            (ref) => Stream.value(ledger),
          ),
          arenaWithdrawalsProvider('a1').overrideWith(
            (ref) => Stream.value(const <ArenaWithdrawalItem>[]),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaPaymentsPage(),
        ),
      ),
    );
    // Sem pumpAndSettle: o painel tem animações que não assentam.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 500));
  }

  testWidgets('cartão a liquidar aparece como "A liberar" no card do saldo', (
    tester,
  ) async {
    await pumpPayments(
      tester,
      wallet: const ArenaWalletSummary(
        availableReais: 0,
        pendingReais: 0,
        awaitingSettlementReais: 6.64,
      ),
    );

    expect(find.text('A liberar: ${formatBRL(6.64)}'), findsOneWidget);
    expect(find.textContaining('cerca de 32 dias'), findsOneWidget);
  });

  testWidgets('sem nada a liberar, o card não mostra a linha', (tester) async {
    await pumpPayments(
      tester,
      wallet: const ArenaWalletSummary(availableReais: 250, pendingReais: 0),
    );

    expect(find.textContaining('A liberar'), findsNothing);
  });

  testWidgets('extrato nomeia a origem e mostra o estorno como débito', (
    tester,
  ) async {
    final at = DateTime.now();
    await pumpPayments(
      tester,
      wallet: const ArenaWalletSummary(availableReais: 0, pendingReais: 0),
      ledger: [
        ArenaLedgerEntry(
          id: 'a',
          netReais: 6.64,
          grossReais: 8.89,
          bookingId: 'g1',
          createdAt: at,
          source: ArenaLedgerSource.classFee,
        ),
        ArenaLedgerEntry(
          id: 'r',
          netReais: -28.2,
          grossReais: -28.2,
          bookingId: null,
          createdAt: at,
          type: 'refund',
          source: ArenaLedgerSource.club,
        ),
      ],
    );

    expect(find.text('Mensalidade de aula'), findsOneWidget);
    expect(find.text('+${formatBRL(6.64)}'), findsOneWidget);
    expect(
      find.text('Bruto ${formatBRL(8.89)} · taxas ${formatBRL(2.25)}'),
      findsOneWidget,
    );
    expect(find.text('Estorno · Clubinho'), findsOneWidget);
    expect(find.text('-${formatBRL(28.2)}'), findsOneWidget);
    expect(find.text('ESTORNADO'), findsOneWidget);
  });
}
