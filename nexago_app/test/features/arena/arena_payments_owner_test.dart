// Task 12 (RBAC arena/equipe): Pagamentos e Perfil.
//
// Pagamentos mistura leitura permitida (saldo, extrato — gestor e financeiro
// leem `financeiro`) com escrita que SÓ O DONO faz: chave PIX e saque estão
// congelados para não-donos em `firestore.rules:996` e a callable
// `requestArenaWithdrawal` recusa membro. `isOwner` vem de
// `arenaAccessProvider`, não da matriz de cargo.
//
// Perfil: só `gestor` (e o dono) leem `perfil` — o guard de rota já barra os
// outros antes de chegar aqui. O botão "Editar perfil" ainda checa
// `arenaCanWriteProvider(ArenaArea.perfil)` como segunda camada. A varredura
// do build() achou mais dois pontos de escrita no mesmo raio: o atalho
// "EDITAR CAPA" (mesmo destino do botão principal) e, dentro do formulário
// completo de edição, o card de chave PIX da arena — que reusa o mesmo campo
// congelado para não-donos que a tela de Pagamentos já trata.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/data/arena_wallet_repository.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_schedule_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/arena_wallet_providers.dart';
import 'package:nexago_app/features/arena/presentation/arena_edit_profile_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_payments_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_profile_page.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/athlete/domain/favorites_providers.dart';

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
  ];
}

void main() {
  // --- Pagamentos: chave PIX e saque só para o dono ---

  final wallet = const ArenaWalletSummary(availableReais: 250, pendingReais: 0);

  Future<void> pumpPayments(
      WidgetTester tester, List<Override> overrides) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          managedArenaDetailProvider.overrideWith((ref) => Stream.value(null)),
          managedArenaWalletProvider
              .overrideWith((ref) => Stream.value(wallet)),
          arenaWalletLedgerProvider('a1').overrideWith(
            (ref) => Stream.value(const <ArenaLedgerEntry>[]),
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
    // Sem pumpAndSettle: telas do painel tem indicador "AO VIVO" cuja
    // animacao nunca assenta e trava o teste no timeout.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 500));
  }

  testWidgets('gestor ve saldo e extrato, sem chave PIX nem saque',
      (tester) async {
    await pumpPayments(tester, overridesForRole(ArenaStaffRole.gestor));
    expect(find.textContaining('Sacar'), findsNothing);
    expect(find.textContaining('Chave PIX'), findsNothing);
    expect(find.textContaining('CHAVE PIX'), findsNothing);
    // Saldo e extrato continuam visiveis.
    expect(find.text('Financeiro'), findsOneWidget);
  });

  testWidgets('financeiro ve saldo e extrato, sem chave PIX nem saque',
      (tester) async {
    await pumpPayments(tester, overridesForRole(ArenaStaffRole.financeiro));
    expect(find.textContaining('Sacar'), findsNothing);
    expect(find.textContaining('CHAVE PIX'), findsNothing);
  });

  testWidgets('dono ve chave PIX e saque', (tester) async {
    await pumpPayments(tester, overridesForRole(null, owner: true));
    expect(find.textContaining('Sacar'), findsWidgets);
    expect(find.textContaining('CHAVE PIX'), findsWidgets);
  });

  // --- Perfil: botão de editar perfil e atalho "EDITAR CAPA" ---

  const arena = ArenaListItem(
    id: 'a1',
    name: 'Vegeton Beach',
    locationLabel: 'Local a confirmar',
    pricePerHourReais: 0,
  );

  Future<void> pumpProfile(
      WidgetTester tester, List<Override> overrides) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          managedArenaDetailProvider.overrideWith((ref) => Stream.value(arena)),
          arenaFollowersCountProvider('a1')
              .overrideWith((ref) => Stream.value(0)),
          arenaFollowersPreviewProvider('a1').overrideWith(
            (ref) => Stream.value(const <ArenaFollowerItem>[]),
          ),
          arenaFollowersInsightsProvider('a1').overrideWith(
            (ref) => Stream.value(const ArenaFollowersInsights(
              totalFollowers: 0,
              growthLastWeek: 0,
              qualityBookedPercent: 0,
              activeRecentlyPercent: 0,
            )),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaProfilePage(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets(
      'recepcao nao alcancaria escrita, mas se chegasse nao veria os botoes de editar',
      (tester) async {
    // recepcao nem le `perfil` (o guard de rota do Task 6 barra antes) — este
    // teste prova a segunda camada em isolamento, sobrepondo o vinculo direto.
    await pumpProfile(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Editar perfil'), findsNothing);
    expect(find.text('EDITAR CAPA'), findsNothing);
  });

  testWidgets('gestor ve os dois atalhos de editar perfil', (tester) async {
    await pumpProfile(tester, overridesForRole(ArenaStaffRole.gestor));
    expect(find.text('Editar perfil'), findsOneWidget);
    expect(find.text('EDITAR CAPA'), findsOneWidget);
  });

  testWidgets('dono ve os dois atalhos de editar perfil', (tester) async {
    await pumpProfile(tester, overridesForRole(null, owner: true));
    expect(find.text('Editar perfil'), findsOneWidget);
    expect(find.text('EDITAR CAPA'), findsOneWidget);
  });

  // --- Perfil: formulario completo (arena_edit_profile_page.dart) ---
  // Achado da varredura: o card "Recebimento PIX online" reusa
  // `payoutPixKey`/`payoutPixKeyType` — os mesmos campos que
  // `firestore.rules:996` congela para nao-donos. `gestor` alcanca esta tela
  // (escreve `perfil`), mas editar a chave aqui derrubaria o salvamento
  // inteiro do perfil contra as rules. Só o dono deve ver o card.

  Future<void> pumpEditProfile(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          managedArenaDetailProvider.overrideWith((ref) => Stream.value(arena)),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaEditProfilePage(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('gestor nao ve o card de chave PIX no formulario de perfil',
      (tester) async {
    await pumpEditProfile(tester, overridesForRole(ArenaStaffRole.gestor));
    expect(find.text('Recebimento PIX online'), findsNothing);
    expect(find.text('CHAVE PIX DA ARENA'), findsNothing);
  });

  testWidgets('dono ve o card de chave PIX no formulario de perfil',
      (tester) async {
    await pumpEditProfile(tester, overridesForRole(null, owner: true));
    expect(find.text('Recebimento PIX online'), findsOneWidget);
  });
}
