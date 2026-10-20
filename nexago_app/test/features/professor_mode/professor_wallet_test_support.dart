import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_wallet.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_students_repository.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_wallet_repository.dart';
import 'package:nexago_app/features/professor_mode/presentation/wallet/professor_payout_account_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/wallet/professor_student_invite_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/wallet/professor_wallet_add_student_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/wallet/professor_wallet_charge_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/wallet/professor_wallet_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/wallet/professor_wallet_plans_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/wallet/professor_wallet_student_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/wallet/professor_wallet_widgets.dart';

import '../professor_links/professor_links_test_support.dart'
    show professorTestNow;
import 'professor_students_test_support.dart';

/// Apoio dos testes da carteira do professor (fase 3): dados realistas, o
/// dublê do repositório (estado em memória + chamadas gravadas) e o app
/// mínimo com as rotas reais. Hoje é 20/10/2026 ([professorTestNow]).

const walletTodayKey = '2026-10-20';

ProfessorPayoutAccount walletAccount({
  ProfessorAccountStatus status = ProfessorAccountStatus.approved,
}) =>
    ProfessorPayoutAccount(
      status: status,
      walletId: 'w-1',
      name: 'Carlos Professor',
      email: 'carlos@exemplo.com',
      cpfMasked: '***.456.789-**',
    );

ProfessorWalletPlan walletPlan({
  String id = 'p-avulsa',
  String name = 'Aula avulsa',
  ProfessorPlanKind kind = ProfessorPlanKind.single,
  double price = 140,
  int? classes,
  int? validityDays,
  bool active = true,
}) =>
    ProfessorWalletPlan(
      id: id,
      name: name,
      kind: kind,
      priceReais: price,
      classes: classes,
      validityDays: validityDays,
      active: active,
    );

/// Avulsa R$ 140 e mensal 8 aulas R$ 880.
List<ProfessorWalletPlan> walletPlans() => [
      walletPlan(),
      walletPlan(
        id: 'p-mensal',
        name: 'Mensal 8 aulas',
        kind: ProfessorPlanKind.monthly,
        price: 880,
        classes: 8,
      ),
    ];

ProfessorWalletStudent walletStudent({
  String athleteId = 'ath-paulo',
  String name = 'Paulo Viana',
  String? planId = 'p-mensal',
  ProfessorWalletStudentStatus status = ProfessorWalletStudentStatus.active,
  ProfessorWalletRecurring? recurring,
  String? professorName,
}) =>
    ProfessorWalletStudent(
      athleteId: athleteId,
      name: name,
      planId: planId,
      status: status,
      recurring: recurring,
      professorName: professorName,
    );

ProfessorCharge walletCharge({
  String id = 'ch-1',
  String athleteId = 'ath-paulo',
  String studentName = 'Paulo Viana',
  String description = 'Mensal 8 aulas',
  double amount = 880,
  String dueDate = '2026-11-10',
  ProfessorChargeStatus status = ProfessorChargeStatus.open,
  String? invoiceUrl = 'https://asaas.test/i/ch-1',
  double? netReais,
  DateTime? paidAt,
}) =>
    ProfessorCharge(
      id: id,
      athleteId: athleteId,
      studentName: studentName,
      description: description,
      amountReais: amount,
      dueDate: dueDate,
      status: status,
      invoiceUrl: invoiceUrl,
      netReais: netReais,
      paidAt: paidAt,
    );

typedef WalletCall = ({String name, Object? data});

/// Repositório em memória: as callables gravam em [calls], mudam o estado e
/// avisam os streams. [error] faz toda callable falhar com a mensagem.
class FakeProfessorWalletRepository implements ProfessorWalletRepository {
  FakeProfessorWalletRepository({
    this.account,
    List<ProfessorWalletPlan>? plans,
    List<ProfessorWalletStudent>? students,
    List<ProfessorCharge>? charges,
    Map<String, ProfessorWalletStudent>? invites,
    this.refreshStatus,
  })  : plans = plans ?? [],
        students = students ?? [],
        charges = charges ?? [],
        invites = invites ?? {};

  ProfessorPayoutAccount? account;
  List<ProfessorWalletPlan> plans;
  List<ProfessorWalletStudent> students;
  List<ProfessorCharge> charges;

  /// Convites do lado do atleta, por `professorUid`.
  Map<String, ProfessorWalletStudent> invites;
  ProfessorAccountStatus? refreshStatus;
  String? error;
  final calls = <WalletCall>[];
  final _changes = StreamController<void>.broadcast();

  void emit() => _changes.add(null);

  Iterable<WalletCall> callsOf(String name) =>
      calls.where((c) => c.name == name);

  Stream<T> _watch<T>(T Function() read) async* {
    yield read();
    await for (final _ in _changes.stream) {
      yield read();
    }
  }

  Future<void> _record(String name, Object? data) async {
    calls.add((name: name, data: data));
    final e = error;
    if (e != null) throw ProfessorStudentsException(e);
  }

  ProfessorWalletStudent _withStatus(
    ProfessorWalletStudent s,
    ProfessorWalletStudentStatus status, {
    bool clearRecurring = false,
  }) =>
      ProfessorWalletStudent(
        athleteId: s.athleteId,
        name: s.name,
        photoUrl: s.photoUrl,
        planId: s.planId,
        status: status,
        recurring: clearRecurring ? null : s.recurring,
        professorName: s.professorName,
        professorPhotoUrl: s.professorPhotoUrl,
      );

  @override
  Stream<ProfessorPayoutAccount?> watchAccount(String uid) =>
      _watch(() => account);

  @override
  Stream<List<ProfessorWalletPlan>> watchPlans(String uid) =>
      _watch(() => List.of(plans));

  @override
  Stream<List<ProfessorWalletStudent>> watchStudents(String uid) =>
      _watch(() => List.of(students));

  @override
  Stream<List<ProfessorCharge>> watchCharges(String uid) =>
      _watch(() => List.of(charges));

  @override
  Future<void> createAccount(Map<String, Object?> payload) async {
    await _record('createAccount', payload);
    account = ProfessorPayoutAccount(
      status: ProfessorAccountStatus.pending,
      name: payload['name'] as String,
      email: payload['email'] as String,
      cpfMasked: '***',
    );
    emit();
  }

  @override
  Future<ProfessorAccountStatus?> refreshAccountStatus() async {
    await _record('refreshAccountStatus', null);
    final next = refreshStatus;
    if (next != null && account != null) {
      account = ProfessorPayoutAccount(
        status: next,
        walletId: account!.walletId,
        name: account!.name,
        email: account!.email,
        cpfMasked: account!.cpfMasked,
      );
      emit();
    }
    return account?.status;
  }

  @override
  Future<String> upsertPlan(ProfessorPlanInput input) async {
    await _record('upsertPlan', input.toPayload());
    final id = input.planId ?? 'p-new-${plans.length}';
    final plan = ProfessorWalletPlan(
      id: id,
      name: input.name,
      kind: input.kind,
      priceReais: input.priceReais,
      classes: input.classes,
      validityDays: input.validityDays,
      active: input.active,
    );
    plans = [
      for (final p in plans)
        if (p.id != id) p,
      plan,
    ];
    emit();
    return id;
  }

  @override
  Future<void> upsertStudent(
      {required String athleteId, String? planId}) async {
    await _record('upsertStudent', {'athleteId': athleteId, 'planId': planId});
    students = [
      ...students.where((s) => s.athleteId != athleteId),
      ProfessorWalletStudent(
        athleteId: athleteId,
        name: 'Novo aluno',
        planId: planId,
        status: ProfessorWalletStudentStatus.invited,
      ),
    ];
    emit();
  }

  @override
  Future<void> archiveStudent(String athleteId) async {
    await _record('archiveStudent', athleteId);
    students = [
      for (final s in students)
        s.athleteId == athleteId
            ? _withStatus(s, ProfessorWalletStudentStatus.archived,
                clearRecurring: true)
            : s,
    ];
    emit();
  }

  @override
  Future<ProfessorChargeCreated> createCharge(
      ProfessorChargeInput input) async {
    await _record('createCharge', input.toPayload());
    final id = 'ch-new-${charges.length}';
    charges = [
      ...charges,
      walletCharge(
        id: id,
        athleteId: input.athleteId,
        amount: input.amountReais ?? 0,
        dueDate: input.dueDate,
      ),
    ];
    emit();
    return (chargeId: id, invoiceUrl: 'https://asaas.test/i/$id');
  }

  @override
  Future<void> cancelCharge(String chargeId) async {
    await _record('cancelCharge', chargeId);
    charges = [
      for (final c in charges)
        c.id == chargeId
            ? walletCharge(
                id: c.id,
                athleteId: c.athleteId,
                studentName: c.studentName,
                description: c.description,
                amount: c.amountReais,
                dueDate: c.dueDate,
                status: ProfessorChargeStatus.canceled,
              )
            : c,
    ];
    emit();
  }

  @override
  Future<void> stopRecurring(String athleteId) async {
    await _record('stopRecurring', athleteId);
    students = [
      for (final s in students)
        s.athleteId == athleteId
            ? _withStatus(s, s.status, clearRecurring: true)
            : s,
    ];
    emit();
  }

  @override
  Stream<ProfessorWalletStudent?> watchInvite({
    required String professorUid,
    required String athleteUid,
  }) =>
      _watch(() => invites[professorUid]);

  @override
  Future<void> respondInvite({
    required String professorUid,
    required bool accept,
  }) async {
    await _record(
        'respondInvite', {'professorUid': professorUid, 'accept': accept});
    final invite = invites[professorUid];
    if (invite != null) {
      invites[professorUid] = _withStatus(
        invite,
        accept
            ? ProfessorWalletStudentStatus.active
            : ProfessorWalletStudentStatus.archived,
      );
      emit();
    }
  }
}

Widget _stub(String label) => Scaffold(body: Center(child: Text(label)));

/// Rotas reais da carteira (+ o Mais e a home como destinos de voltar).
List<RouteBase> get professorWalletRoutes => [
      GoRoute(
        path: AppRoutes.professorMore,
        name: AppRouteNames.professorMore,
        builder: (_, __) => _stub('mais'),
      ),
      GoRoute(
        path: AppRoutes.home,
        name: AppRouteNames.home,
        builder: (_, __) => _stub('home'),
      ),
      GoRoute(
        path: AppRoutes.professorPayoutAccount,
        name: AppRouteNames.professorPayoutAccount,
        builder: (_, __) => const ProfessorPayoutAccountPage(),
      ),
      GoRoute(
        path: AppRoutes.professorWalletPlans,
        name: AppRouteNames.professorWalletPlans,
        builder: (_, __) => const ProfessorWalletPlansPage(),
      ),
      GoRoute(
        path: AppRoutes.professorWallet,
        name: AppRouteNames.professorWallet,
        builder: (_, __) => const ProfessorWalletPage(),
      ),
      GoRoute(
        path: AppRoutes.professorWalletAddStudent,
        name: AppRouteNames.professorWalletAddStudent,
        builder: (_, __) => const ProfessorWalletAddStudentPage(),
      ),
      GoRoute(
        path: AppRoutes.professorWalletStudent,
        name: AppRouteNames.professorWalletStudent,
        builder: (_, state) => ProfessorWalletStudentPage(
          athleteId: state.pathParameters['athleteId'] ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.professorWalletCharge,
        name: AppRouteNames.professorWalletCharge,
        builder: (_, state) => ProfessorWalletChargePage(
          athleteId: state.pathParameters['athleteId'] ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.professorStudentInvite,
        name: AppRouteNames.professorStudentInvite,
        builder: (_, state) => ProfessorStudentInvitePage(
          professorUid: state.pathParameters['professorUid'] ?? '',
        ),
      ),
    ];

/// Lembretes compartilhados (no lugar da folha do sistema).
final sharedReminders = <String>[];

/// Abre o app numa tela da carteira. [initialStack] empilha telas antes
/// (para o "voltar" ter para onde ir).
Future<GoRouter> pumpProfessorWalletApp(
  WidgetTester tester, {
  required FakeProfessorWalletRepository wallet,
  required String location,
  List<String> initialStack = const [],
  List<Override> overrides = const [],
}) async {
  sharedReminders.clear();
  final router = await pumpProfessorStudentsApp(
    tester,
    repo: FakeProfessorStudentsRepository([professorStudentsSnapshot()]),
    walletRepo: wallet,
    location: initialStack.isEmpty ? location : initialStack.first,
    extraRoutes: professorWalletRoutes,
    overrides: [
      professorLinksClockProvider.overrideWithValue(() => professorTestNow),
      professorReminderSharerProvider.overrideWithValue(
        (_, text) async => sharedReminders.add(text),
      ),
      ...overrides,
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
