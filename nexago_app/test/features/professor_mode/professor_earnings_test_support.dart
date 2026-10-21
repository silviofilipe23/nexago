import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_earnings.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_earnings_repository.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_students_repository.dart';
import 'package:nexago_app/features/professor_mode/presentation/earnings/professor_earnings_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/earnings/professor_withdraw_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/earnings/professor_withdrawals_page.dart';

import 'professor_students_test_support.dart';
import 'professor_wallet_test_support.dart';

/// Apoio dos testes de Ganhos/Saque (fase 6).

ProfessorWithdrawal withdrawal({
  String id = 'w1',
  double amount = 300,
  String status = 'approved',
  String? payoutStatus = 'paid',
  String? mode = 'auto',
  DateTime? at,
  String? error,
}) =>
    ProfessorWithdrawal(
      id: id,
      amountReais: amount,
      status: status,
      payoutStatus: payoutStatus,
      processingMode: mode,
      pixKey: '52998224725',
      payoutError: error,
      createdAt: at ?? DateTime(2026, 10, 12, 20),
    );

class FakeProfessorEarningsRepository implements ProfessorEarningsRepository {
  FakeProfessorEarningsRepository({
    this.wallet,
    List<ProfessorEarningsEntry>? ledger,
    List<ProfessorWithdrawal>? withdrawals,
    List<ProfessorPendingPayout>? pending,
    this.pixKey,
    this.result,
    this.error,
  })  : ledger = ledger ?? [],
        withdrawals = withdrawals ?? [],
        pending = pending ?? [];

  /// `null` = doc ainda não existe.
  ProfessorEarningsWallet? wallet;
  List<ProfessorEarningsEntry> ledger;
  List<ProfessorWithdrawal> withdrawals;
  List<ProfessorPendingPayout> pending;
  ProfessorPayoutPixKey? pixKey;
  ProfessorWithdrawalResult? result;
  String? error;
  final requested = <double>[];
  final savedKeys = <({String key, String type})>[];
  final _changes = StreamController<void>.broadcast();

  Stream<T> _watch<T>(T Function() read) async* {
    yield read();
    await for (final _ in _changes.stream) {
      yield read();
    }
  }

  @override
  Stream<ProfessorEarningsWallet> watchWallet(String uid) =>
      _watch(() => wallet ?? const ProfessorEarningsWallet());

  @override
  Stream<List<ProfessorEarningsEntry>> watchLedger(String uid) =>
      _watch(() => List.of(ledger));

  @override
  Stream<List<ProfessorWithdrawal>> watchWithdrawals(String uid) =>
      _watch(() => List.of(withdrawals));

  @override
  Stream<ProfessorPayoutPixKey?> watchPixKey(String uid) =>
      _watch(() => pixKey);

  @override
  Future<List<ProfessorPendingPayout>> fetchPendingPayouts() async => pending;

  @override
  Future<void> setPixKey({
    required String pixKey,
    required String pixKeyType,
  }) async {
    final e = error;
    if (e != null) throw ProfessorStudentsException(e);
    savedKeys.add((key: pixKey, type: pixKeyType));
    this.pixKey = ProfessorPayoutPixKey(pixKey: pixKey, pixKeyType: pixKeyType);
    _changes.add(null);
  }

  @override
  Future<ProfessorWithdrawalResult> requestWithdrawal(
      double amountReais) async {
    final e = error;
    if (e != null) throw ProfessorStudentsException(e);
    requested.add(amountReais);
    return result ??
        const ProfessorWithdrawalResult(
          withdrawalId: 'w-new',
          status: 'approved',
          payoutStatus: 'sent',
          autoProcessed: true,
          processingMode: 'auto',
        );
  }
}

List<RouteBase> get professorEarningsRoutes => [
      GoRoute(
        path: AppRoutes.professorEarnings,
        name: AppRouteNames.professorEarnings,
        builder: (_, __) => const ProfessorEarningsPage(),
      ),
      GoRoute(
        path: AppRoutes.professorWithdraw,
        name: AppRouteNames.professorWithdraw,
        builder: (_, __) => const ProfessorWithdrawPage(),
      ),
      GoRoute(
        path: AppRoutes.professorPixKey,
        name: AppRouteNames.professorPixKey,
        builder: (_, __) => const ProfessorPixKeyPage(),
      ),
      GoRoute(
        path: AppRoutes.professorWithdrawals,
        name: AppRouteNames.professorWithdrawals,
        builder: (_, __) => const ProfessorWithdrawalsPage(),
      ),
    ];

Future<GoRouter> pumpProfessorEarningsApp(
  WidgetTester tester, {
  required FakeProfessorEarningsRepository earnings,
  required String location,
  List<ArenaProfessorLink> links = const [],
  List<String> initialStack = const [],
}) async {
  final router = await pumpProfessorStudentsApp(
    tester,
    repo: FakeProfessorStudentsRepository([professorStudentsSnapshot()]),
    earningsRepo: earnings,
    location: initialStack.isEmpty ? location : initialStack.first,
    extraRoutes: [...professorEarningsRoutes, ...professorWalletRoutes],
    overrides: [
      myProfessorLinksProvider.overrideWith((ref) => Stream.value(links)),
    ],
  );
  if (initialStack.isNotEmpty) {
    for (final l in [...initialStack.skip(1), location]) {
      router.push(l);
      await settleProfessorStudents(tester);
    }
  }
  return router;
}
