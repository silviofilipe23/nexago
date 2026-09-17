import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_staff/my_tournament_staff_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_staff/tournament_staff_models.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/tabs/organizer_category_payments_tab.dart';

/// A aba de pagamentos fica em `/organizer/tournaments/:id/categories/:cid/payments`,
/// prefixo que `isOrganizerStaffOperablePath` abre para staff. O papel
/// "administrador" existe para operar o evento SEM ver dinheiro, então os
/// totais (arrecadado e repasse líquido) não podem aparecer para ele — e
/// precisam continuar aparecendo para o gestor, que saca desse caixa.
const _tournamentId = 't1';
const _categoryId = 'masc-a';

const _key = OrganizerCategoryKey(
  tournamentId: _tournamentId,
  categoryId: _categoryId,
);

/// Categoria com dinheiro pelo app: é o que faz o card de repasse aparecer
/// (`netTransferCents`, `totalCollectedCents` e `outstandingCents` são
/// derivados).
const _summary = OrganizerCategoryPaymentsSummary(
  paidCount: 3,
  pendingCount: 0,
  totalSlots: 8,
  viaAppCents: 36000,
  expectedCents: 96000,
);

/// `roleLoaded: false` reproduz o que abriu esta rodada: o espelho de staff
/// ainda não emitiu (stream que não entrega nada), que é o estado dos
/// primeiros frames de um link direto ou de um push.
Future<void> abrirAba(
  WidgetTester tester, {
  required TournamentStaffRole? role,
  bool isOwner = false,
  bool roleLoaded = true,
}) async {
  final espelho = StreamController<List<MyTournamentStaffEntry>>();
  addTearDown(espelho.close);
  if (roleLoaded) espelho.add(const []);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        isOrganizerTournamentOwnerProvider(_tournamentId)
            .overrideWithValue(isOwner),
        myTournamentStaffEntriesProvider.overrideWith((ref) => espelho.stream),
        myStaffRoleForTournamentProvider(_tournamentId).overrideWithValue(role),
        organizerCategoryPaymentsProvider(_key).overrideWithValue(_summary),
        organizerCategoryVisibleTeamsProvider(_key).overrideWithValue(
          const AsyncValue<List<OrganizerCategoryTeamRow>>.data([]),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const Scaffold(
          body: OrganizerCategoryPaymentsTab(
            tournamentId: _tournamentId,
            categoryId: _categoryId,
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('administrador do evento não vê repasse nem arrecadação',
      (tester) async {
    await abrirAba(tester, role: TournamentStaffRole.eventAdmin);

    expect(find.textContaining('Repasse líquido'), findsNothing);
    expect(find.textContaining('Líquido após taxa'), findsNothing);
    expect(find.text('ARRECADADO NESTA CATEGORIA'), findsNothing);
    // A tela segue coerente: sem card vazio e sem número de dinheiro nenhum.
    expect(find.textContaining(r'R$'), findsNothing);
  });

  testWidgets('gestor da equipe continua vendo repasse e arrecadação',
      (tester) async {
    await abrirAba(tester, role: TournamentStaffRole.manager);

    expect(find.textContaining('Repasse líquido'), findsOneWidget);
    expect(find.text('ARRECADADO NESTA CATEGORIA'), findsOneWidget);
  });

  testWidgets('dono do evento (sem papel de staff) vê os dois',
      (tester) async {
    // Dono não é staff de si mesmo: o papel é `null` e quem responde é o
    // `managerId`.
    await abrirAba(tester, role: null, isOwner: true);

    expect(find.textContaining('Repasse líquido'), findsOneWidget);
    expect(find.text('ARRECADADO NESTA CATEGORIA'), findsOneWidget);
  });

  testWidgets('dono vê o dinheiro mesmo com o papel ainda carregando',
      (tester) async {
    // O dono não depende do espelho de staff: quem responde é o `managerId`,
    // que chega junto com os dados sem os quais não haveria número na tela.
    await abrirAba(tester, role: null, isOwner: true, roleLoaded: false);

    expect(find.textContaining('Repasse líquido'), findsOneWidget);
    expect(find.text('ARRECADADO NESTA CATEGORIA'), findsOneWidget);
  });

  testWidgets('papel ainda carregando e sem ser dono NÃO mostra dinheiro',
      (tester) async {
    // A janela real: quem atua como organizador nos próprios eventos e é
    // administrador no evento de outra pessoa não passa pelo pré-carregamento
    // do login. Caindo aqui por link direto, os primeiros frames mostravam
    // arrecadação e repasse até o primeiro snapshot do espelho chegar.
    await abrirAba(tester, role: null, roleLoaded: false);

    expect(find.textContaining('Repasse líquido'), findsNothing);
    expect(find.text('ARRECADADO NESTA CATEGORIA'), findsNothing);
    expect(find.textContaining(r'R$'), findsNothing);
  });

  group('tournamentStaffSeesMoney', () {
    test('administrador e mesário não alcançam dinheiro', () {
      expect(
        tournamentStaffSeesMoney(
          isOwner: false,
          roleLoaded: true,
          role: TournamentStaffRole.eventAdmin,
        ),
        isFalse,
      );
      expect(
        tournamentStaffSeesMoney(
          isOwner: false,
          roleLoaded: true,
          role: TournamentStaffRole.scorer,
        ),
        isFalse,
      );
    });

    test('gestor alcança — é dele que sai o saque', () {
      expect(
        tournamentStaffSeesMoney(
          isOwner: false,
          roleLoaded: true,
          role: TournamentStaffRole.manager,
        ),
        isTrue,
      );
    });

    test('dono alcança mesmo com o papel desconhecido', () {
      expect(
        tournamentStaffSeesMoney(isOwner: true, roleLoaded: false, role: null),
        isTrue,
      );
    });

    test('papel desconhecido sem ser dono não alcança', () {
      expect(
        tournamentStaffSeesMoney(isOwner: false, roleLoaded: false, role: null),
        isFalse,
      );
      // Administrador com o espelho ainda carregando: o papel nem precisa ser
      // conhecido para o número ficar fora da tela.
      expect(
        tournamentStaffSeesMoney(
          isOwner: false,
          roleLoaded: false,
          role: TournamentStaffRole.eventAdmin,
        ),
        isFalse,
      );
    });

    test('sem papel, carregado e sem ser dono: também não alcança', () {
      expect(
        tournamentStaffSeesMoney(isOwner: false, roleLoaded: true, role: null),
        isFalse,
      );
    });
  });
}
