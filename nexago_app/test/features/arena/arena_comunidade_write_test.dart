// Task 12 (RBAC arena/equipe) — ruling do controlador: a área `comunidade`
// não tinha task própria e tinha defeito nos dois sentidos.
//
// Defeito A (permissivo demais): responder avaliação é escrita de
// `comunidade`, mas aparecia em dois lugares sem checar cargo nenhum —
// `arena_dashboard_reputation_section.dart` (Painel, rota SEM área — todo
// cargo chega) e `arena_reviews_management_page.dart` (`/arena/reviews`,
// área `comunidade` de LEITURA — recepção e financeiro chegam). Os dois só
// checavam `arenaId.isNotEmpty && managerId.isNotEmpty`, sem RBAC nenhum.
//
// gestor escreve `comunidade`; recepção e financeiro só leem.
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/data/review_reply_service.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/review_reply_providers.dart';
import 'package:nexago_app/features/arena/presentation/arena_reviews_management_page.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_dashboard_reputation_section.dart';
import 'package:nexago_app/features/athlete/domain/arena_review.dart';

/// Fake mínimo de [FirebaseFirestore]: nenhum método é chamado nos testes
/// abaixo, ele só existe para `reviewReplyServiceProvider` poder ser
/// sobrescrito sem tocar Firestore de verdade — as duas telas montam um
/// `ReviewReplyService` incondicionalmente no build().
///
/// Copiado de `arena_dashboard_money_test.dart` — mesmo padrão, sem importar
/// do outro arquivo de teste.
class _FakeFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

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
    authProvider.overrideWith(
      (ref) => Stream.value(MockUser(uid: 'uid-manager')),
    ),
  ];
}

void main() {
  final pendingReview = ArenaReview(
    id: 'r1',
    arenaId: 'a1',
    userId: 'athlete1',
    bookingId: 'b1',
    rating: 4,
    comment: 'Muito boa!',
    createdAt: DateTime(2026, 9, 1),
    likesCount: 0,
    reported: false,
  );

  // --- Painel: seção de Reputação (arena_dashboard_reputation_section.dart) ---

  Future<void> pumpReputation(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          managedArenaReviewsProvider.overrideWith(
            (ref) => Stream.value([pendingReview]),
          ),
          reviewReplyServiceProvider.overrideWith(
            (ref) => ReviewReplyService(_FakeFirestore()),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const Scaffold(body: ArenaDashboardReputationSection()),
        ),
      ),
    );
    // Sem pumpAndSettle: telas do painel tem indicador "AO VIVO" cuja
    // animacao nunca assenta e trava o teste no timeout.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 500));
  }

  testWidgets('recepcao nao pode responder avaliacao no Painel',
      (tester) async {
    await pumpReputation(tester, overridesForRole(ArenaStaffRole.recepcao));
    final responder = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Responder'),
    );
    expect(responder.onPressed, isNull);
    final bolt = tester.widget<InkWell>(
      find.ancestor(
        of: find.byIcon(Icons.bolt_rounded),
        matching: find.byType(InkWell),
      ),
    );
    expect(bolt.onTap, isNull);
  });

  testWidgets('financeiro nao pode responder avaliacao no Painel',
      (tester) async {
    await pumpReputation(tester, overridesForRole(ArenaStaffRole.financeiro));
    final responder = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Responder'),
    );
    expect(responder.onPressed, isNull);
  });

  testWidgets('gestor pode responder avaliacao no Painel', (tester) async {
    await pumpReputation(tester, overridesForRole(ArenaStaffRole.gestor));
    final responder = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Responder'),
    );
    expect(responder.onPressed, isNotNull);
  });

  // --- /arena/reviews (arena_reviews_management_page.dart) ---

  Future<void> pumpReviewsManagement(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          managedArenaReviewsProvider.overrideWith(
            (ref) => Stream.value([pendingReview]),
          ),
          reviewReplyServiceProvider.overrideWith(
            (ref) => ReviewReplyService(_FakeFirestore()),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaReviewsManagementPage(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('recepcao nao pode responder avaliacao em /arena/reviews',
      (tester) async {
    await pumpReviewsManagement(
      tester,
      overridesForRole(ArenaStaffRole.recepcao),
    );
    final responder = tester.widget<OutlinedButton>(
      find.widgetWithText(OutlinedButton, 'Responder'),
    );
    expect(responder.onPressed, isNull);
  });

  testWidgets('financeiro nao pode responder avaliacao em /arena/reviews',
      (tester) async {
    await pumpReviewsManagement(
      tester,
      overridesForRole(ArenaStaffRole.financeiro),
    );
    final responder = tester.widget<OutlinedButton>(
      find.widgetWithText(OutlinedButton, 'Responder'),
    );
    expect(responder.onPressed, isNull);
  });

  testWidgets('gestor pode responder avaliacao em /arena/reviews',
      (tester) async {
    await pumpReviewsManagement(
      tester,
      overridesForRole(ArenaStaffRole.gestor),
    );
    final responder = tester.widget<OutlinedButton>(
      find.widgetWithText(OutlinedButton, 'Responder'),
    );
    expect(responder.onPressed, isNotNull);
  });
}
