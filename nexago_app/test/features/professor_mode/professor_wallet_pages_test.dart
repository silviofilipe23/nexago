import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_wallet.dart';
import 'package:nexago_app/features/professor_mode/presentation/wallet/professor_payout_account_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/wallet/professor_student_invite_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/wallet/professor_wallet_student_page.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts;
import 'professor_students_test_support.dart';
import 'professor_wallet_test_support.dart';

String studentPath(String id) =>
    AppRoutes.professorWalletStudent.replaceAll(':athleteId', id);

String chargePath(String id) =>
    AppRoutes.professorWalletCharge.replaceAll(':athleteId', id);

Finder field(String key) => find.descendant(
      of: find.byKey(Key(key)),
      matching: find.byType(TextField),
    );

Future<void> tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.tap(f);
  await settleProfessorStudents(tester);
}

Future<void> type(WidgetTester tester, String key, String text) async {
  await tester.ensureVisible(field(key));
  await tester.enterText(field(key), text);
  await settleProfessorStudents(tester, 2);
}

bool enabled(WidgetTester tester, String key) {
  final button = tester.widget<FilledButton>(
    find.descendant(
        of: find.byKey(Key(key)), matching: find.byType(FilledButton)),
  );
  return button.onPressed != null;
}

class _FakeUsers implements UsersRepository {
  @override
  Future<List<AppUserProfile>> searchAthletesByKeywords(
    String term, {
    int max = 25,
  }) async =>
      const [AppUserProfile(uid: 'ath-rafa', fullName: 'Rafaela Torres')];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('Conta de recebimento', () {
    testWidgets('sem conta: formulário valida antes de chamar o servidor',
        (tester) async {
      final wallet = FakeProfessorWalletRepository();
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: AppRoutes.professorPayoutAccount,
      );
      expect(find.text(kProfessorPayoutExplanation), findsOneWidget);

      await tap(tester, find.byKey(const Key('professor-account-submit')));
      expect(find.text('Informe o nome completo.'), findsOneWidget);
      expect(find.text('CPF inválido.'), findsOneWidget);
      expect(find.text('Informe o bairro.'), findsOneWidget);
      expect(wallet.callsOf('createAccount'), isEmpty);
    });

    testWidgets('dados válidos criam a conta e mostram a situação',
        (tester) async {
      final wallet = FakeProfessorWalletRepository();
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: AppRoutes.professorPayoutAccount,
      );
      await type(tester, 'professor-account-name', 'Carlos da Silva');
      await type(tester, 'professor-account-cpf', '529.982.247-25');
      await type(tester, 'professor-account-email', 'carlos@exemplo.com');
      await type(tester, 'professor-account-mobilePhone', '(62) 99812-4471');
      await type(tester, 'professor-account-birthDate', '10/05/1990');
      await type(tester, 'professor-account-incomeValue', '4000');
      await type(tester, 'professor-account-postalCode', '74000-000');
      await type(tester, 'professor-account-address', 'Rua 10');
      await type(tester, 'professor-account-addressNumber', '120');
      await type(tester, 'professor-account-province', 'Setor Bueno');
      await tap(tester, find.byKey(const Key('professor-account-submit')));

      final call = wallet.callsOf('createAccount').single;
      final data = call.data as Map<String, Object?>;
      expect(data['cpfCnpj'], '52998224725');
      expect(data['mobilePhone'], '62998124471');
      expect(data['birthDate'], '1990-05-10');
      expect(data['incomeValue'], 4000.0);
      expect(find.byKey(const Key('professor-account-status-card')),
          findsOneWidget);
      expect(
        tester
            .widget<Text>(find.descendant(
                of: find.byKey(const Key('professor-account-status')),
                matching: find.byType(Text)))
            .data,
        'PENDENTE',
      );
    });

    testWidgets('criação que falhou volta ao formulário com o aviso',
        (tester) async {
      final wallet = FakeProfessorWalletRepository(
        account: const ProfessorPayoutAccount(
          status: ProfessorAccountStatus.failed,
          name: '',
          email: '',
        ),
      );
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: AppRoutes.professorPayoutAccount,
      );
      expect(find.byKey(const Key('professor-account-failed')), findsOneWidget);
      expect(find.byKey(const Key('professor-account-submit')), findsOneWidget);
      expect(wallet.callsOf('refreshAccountStatus'), isEmpty);
    });

    testWidgets('em criação: mostra a situação sem reler no Asaas',
        (tester) async {
      final wallet = FakeProfessorWalletRepository(
        account: const ProfessorPayoutAccount(
          status: ProfessorAccountStatus.creating,
          name: '',
          email: '',
        ),
      );
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: AppRoutes.professorPayoutAccount,
      );
      expect(find.text('CRIANDO'), findsOneWidget);
      expect(wallet.callsOf('refreshAccountStatus'), isEmpty);
    });

    testWidgets('com conta: relê a situação ao abrir e no botão',
        (tester) async {
      final wallet = FakeProfessorWalletRepository(
        account: walletAccount(status: ProfessorAccountStatus.pending),
      );
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: AppRoutes.professorPayoutAccount,
      );
      expect(wallet.callsOf('refreshAccountStatus'), hasLength(1));
      expect(find.text('carlos@exemplo.com'), findsOneWidget);
      expect(find.text('***.456.789-**'), findsOneWidget);

      wallet.refreshStatus = ProfessorAccountStatus.approved;
      await tap(tester, find.byKey(const Key('professor-account-refresh')));
      expect(wallet.callsOf('refreshAccountStatus'), hasLength(2));
      expect(find.text('APROVADA'), findsOneWidget);
    });
  });

  group('B14 Meus planos e preços', () {
    testWidgets('lista e desativa um plano', (tester) async {
      final wallet = FakeProfessorWalletRepository(
        plans: walletPlans(),
        students: [walletStudent()],
      );
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: AppRoutes.professorWalletPlans,
      );
      expect(find.text('Aula avulsa'), findsWidgets);
      expect(find.text('Mensal 8 aulas'), findsOneWidget);
      expect(find.text('1 ALUNO'), findsOneWidget);

      await tap(
          tester, find.byKey(const Key('professor-plan-toggle-p-mensal')));
      final data =
          wallet.callsOf('upsertPlan').single.data as Map<String, Object?>;
      expect(data['planId'], 'p-mensal');
      expect(data['active'], isFalse);
      expect(data['classes'], 8);
      expect(find.text('DESATIVADO'), findsOneWidget);
    });

    testWidgets('"+" cria um pacote; erro do editor aparece na folha',
        (tester) async {
      final wallet = FakeProfessorWalletRepository();
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: AppRoutes.professorWalletPlans,
      );
      expect(find.byKey(const Key('professor-plans-empty')), findsOneWidget);

      await tap(tester, find.byKey(const Key('professor-plans-add')));
      await tap(tester, find.byKey(const Key('professor-plan-kind-package')));
      await type(tester, 'professor-plan-name', 'Pacote 4 aulas');
      await type(tester, 'professor-plan-price', '500');
      await tap(tester, find.byKey(const Key('professor-plan-save')));
      expect(find.text('Informe quantas aulas (1 a 60).'), findsOneWidget);
      expect(wallet.callsOf('upsertPlan'), isEmpty);

      await type(tester, 'professor-plan-classes', '4');
      await tap(tester, find.byKey(const Key('professor-plan-save')));
      final data =
          wallet.callsOf('upsertPlan').single.data as Map<String, Object?>;
      expect(data, {
        'name': 'Pacote 4 aulas',
        'kind': 'package',
        'priceReais': 500.0,
        'classes': 4,
        'validityDays': 45,
        'active': true,
      });
      expect(find.text('Pacote 4 aulas'), findsOneWidget);
    });
  });

  group('B16 Carteira própria', () {
    testWidgets('resumo do mês, atrasados com "Lembrar" e alunos',
        (tester) async {
      final wallet = FakeProfessorWalletRepository(
        account: walletAccount(),
        plans: walletPlans(),
        students: [
          walletStudent(),
          walletStudent(
            athleteId: 'ath-livia',
            name: 'Lívia Couto',
            status: ProfessorWalletStudentStatus.invited,
          ),
        ],
        charges: [
          walletCharge(
            id: 'pago',
            status: ProfessorChargeStatus.paid,
            netReais: 830,
            paidAt: DateTime.utc(2026, 10, 10, 15),
          ),
          walletCharge(id: 'aberta', amount: 880, dueDate: '2026-11-10'),
          walletCharge(id: 'atrasada', amount: 140, dueDate: '2026-10-15'),
        ],
      );
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: AppRoutes.professorWallet,
      );
      String text(String key) =>
          tester.widget<Text>(find.byKey(Key(key))).data!;
      expect(text('professor-wallet-received'), contains('830,00'));
      expect(text('professor-wallet-to-receive'), contains('1.020,00'));
      expect(text('professor-wallet-overdue-count'), '1');
      expect(find.byKey(const Key('professor-wallet-account-banner')),
          findsNothing);
      expect(find.text('CONVITE ENVIADO'), findsOneWidget);

      await tap(
          tester, find.byKey(const Key('professor-wallet-remind-atrasada')));
      expect(sharedReminders.single, contains('https://asaas.test/i/ch-1'));
      expect(sharedReminders.single, contains('venceu em 15 out'));
    });

    testWidgets('conta não aprovada: aviso que leva à conta', (tester) async {
      final wallet = FakeProfessorWalletRepository(
        account: walletAccount(status: ProfessorAccountStatus.pending),
      );
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: AppRoutes.professorWallet,
      );
      await tap(
          tester, find.byKey(const Key('professor-wallet-account-banner')));
      expect(find.byKey(const Key('professor-account-status-card')),
          findsOneWidget);
    });
  });

  group('B4 Aluno da carteira', () {
    testWidgets('cobranças, cancelar com confirmação e a regra',
        (tester) async {
      final wallet = FakeProfessorWalletRepository(
        account: walletAccount(),
        plans: walletPlans(),
        students: [walletStudent()],
        charges: [
          walletCharge(id: 'aberta'),
          walletCharge(
            id: 'paga',
            dueDate: '2026-10-10',
            status: ProfessorChargeStatus.paid,
          ),
        ],
      );
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: studentPath('ath-paulo'),
      );
      expect(find.text('Paulo Viana'), findsOneWidget);
      expect(find.text('INDEPENDENTE'), findsOneWidget);
      expect(find.text(kProfessorWalletStudentRule), findsOneWidget);
      expect(enabled(tester, 'professor-wallet-student-charge'), isTrue);

      await tap(tester,
          find.byKey(const Key('professor-wallet-student-charge-aberta')));
      await tap(tester, find.byKey(const Key('professor-charge-cancel')));
      // Desistiu: nada é chamado.
      await tap(tester, find.text('Voltar'));
      expect(wallet.callsOf('cancelCharge'), isEmpty);

      await tap(tester, find.byKey(const Key('professor-charge-cancel')));
      await tap(tester, find.byKey(const Key('professor-wallet-confirm')));
      expect(wallet.callsOf('cancelCharge').single.data, 'aberta');
      expect(find.text('CANCELADA'), findsOneWidget);
    });

    testWidgets('paga não oferece cancelar', (tester) async {
      final wallet = FakeProfessorWalletRepository(
        students: [walletStudent()],
        charges: [
          walletCharge(id: 'paga', status: ProfessorChargeStatus.paid),
        ],
      );
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: studentPath('ath-paulo'),
      );
      await tap(tester,
          find.byKey(const Key('professor-wallet-student-charge-paga')));
      expect(
          find.byKey(const Key('professor-charge-copy-link')), findsOneWidget);
      expect(find.byKey(const Key('professor-charge-cancel')), findsNothing);
    });

    testWidgets('convidado: selo, aviso e sem "Cobrar"', (tester) async {
      final wallet = FakeProfessorWalletRepository(
        students: [
          walletStudent(status: ProfessorWalletStudentStatus.invited),
        ],
      );
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: studentPath('ath-paulo'),
      );
      expect(find.text('CONVITE ENVIADO'), findsOneWidget);
      expect(find.byKey(const Key('professor-wallet-student-invited-note')),
          findsOneWidget);
      expect(enabled(tester, 'professor-wallet-student-charge'), isFalse);
    });

    testWidgets('parar recorrência e arquivar pedem confirmação',
        (tester) async {
      final wallet = FakeProfessorWalletRepository(
        plans: walletPlans(),
        students: [
          walletStudent(
            recurring: const ProfessorWalletRecurring(
              planId: 'p-mensal',
              amountReais: 880,
              description: 'Mensal 8 aulas',
              dueDay: 10,
            ),
          ),
        ],
      );
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: studentPath('ath-paulo'),
      );
      expect(find.byKey(const Key('professor-wallet-student-recurring')),
          findsOneWidget);
      await tap(
          tester, find.byKey(const Key('professor-wallet-stop-recurring')));
      await tap(tester, find.byKey(const Key('professor-wallet-confirm')));
      expect(wallet.callsOf('stopRecurring').single.data, 'ath-paulo');
      expect(find.byKey(const Key('professor-wallet-student-recurring')),
          findsNothing);

      await tap(tester, find.byKey(const Key('professor-wallet-student-menu')));
      await tap(
          tester, find.byKey(const Key('professor-wallet-student-archive')));
      await tap(tester, find.byKey(const Key('professor-wallet-confirm')));
      expect(wallet.callsOf('archiveStudent').single.data, 'ath-paulo');
      // Volta para a carteira.
      expect(find.text('Carteira própria'), findsOneWidget);
    });
  });

  group('B15 Nova cobrança', () {
    testWidgets('plano combinado vem marcado; envia planId e recorrência',
        (tester) async {
      final wallet = FakeProfessorWalletRepository(
        account: walletAccount(),
        plans: walletPlans(),
        students: [walletStudent()],
      );
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: chargePath('ath-paulo'),
      );
      // ≈ 95% de R$ 880.
      expect(find.textContaining('836,00'), findsOneWidget);
      await tap(tester, find.byType(Switch));
      await tap(tester, find.byKey(const Key('professor-charge-submit')));
      expect(wallet.callsOf('createCharge').single.data, {
        'athleteId': 'ath-paulo',
        'planId': 'p-mensal',
        'dueDate': '2026-10-23',
        'repeatMonthly': true,
      });
    });

    testWidgets('valor personalizado manda valor e descrição, sem plano',
        (tester) async {
      final wallet = FakeProfessorWalletRepository(
        account: walletAccount(),
        plans: walletPlans(),
        students: [walletStudent()],
      );
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: chargePath('ath-paulo'),
      );
      await tap(tester, find.byKey(const Key('professor-charge-custom')));
      expect(enabled(tester, 'professor-charge-submit'), isFalse);
      await type(tester, 'professor-charge-amount', '150,50');
      await type(tester, 'professor-charge-description', 'Particular sábado');
      await tap(tester, find.byKey(const Key('professor-charge-submit')));
      expect(wallet.callsOf('createCharge').single.data, {
        'athleteId': 'ath-paulo',
        'amountReais': 150.5,
        'description': 'Particular sábado',
        'dueDate': '2026-10-23',
        'repeatMonthly': false,
      });
    });

    testWidgets('avulsa não repete todo mês', (tester) async {
      final wallet = FakeProfessorWalletRepository(
        account: walletAccount(),
        plans: walletPlans(),
        students: [walletStudent(planId: 'p-avulsa')],
      );
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: chargePath('ath-paulo'),
      );
      expect(tester.widget<Switch>(find.byType(Switch)).onChanged, isNull);
    });

    testWidgets('conta não aprovada: botão desligado com o aviso',
        (tester) async {
      final wallet = FakeProfessorWalletRepository(
        account: walletAccount(status: ProfessorAccountStatus.pending),
        plans: walletPlans(),
        students: [walletStudent()],
      );
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: chargePath('ath-paulo'),
      );
      expect(find.byKey(const Key('professor-wallet-account-banner')),
          findsOneWidget);
      expect(find.text('Conta de recebimento não aprovada'), findsOneWidget);
      expect(enabled(tester, 'professor-charge-submit'), isFalse);
    });

    testWidgets('aluno só convidado não pode ser cobrado', (tester) async {
      final wallet = FakeProfessorWalletRepository(
        account: walletAccount(),
        plans: walletPlans(),
        students: [
          walletStudent(status: ProfessorWalletStudentStatus.invited),
        ],
      );
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: chargePath('ath-paulo'),
      );
      expect(find.byKey(const Key('professor-charge-student-not-active')),
          findsOneWidget);
      expect(enabled(tester, 'professor-charge-submit'), isFalse);
    });
  });

  group('B5 Adicionar aluno (carteira)', () {
    testWidgets('busca o atleta e envia o convite com o plano', (tester) async {
      final wallet = FakeProfessorWalletRepository(plans: walletPlans());
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: AppRoutes.professorWalletAddStudent,
        overrides: [usersRepositoryProvider.overrideWithValue(_FakeUsers())],
      );
      expect(enabled(tester, 'professor-wallet-add-submit'), isFalse);
      await tester.enterText(find.byType(TextField).first, 'Rafa');
      await tester.pump(const Duration(milliseconds: 400));
      await settleProfessorStudents(tester);
      await tap(tester, find.text('Rafaela Torres'));
      await tap(
          tester, find.byKey(const Key('professor-wallet-add-plan-p-mensal')));
      await tap(tester, find.byKey(const Key('professor-wallet-add-submit')));
      expect(wallet.callsOf('upsertStudent').single.data,
          {'athleteId': 'ath-rafa', 'planId': 'p-mensal'});
    });
  });

  group('Convite do professor (atleta)', () {
    String invitePath(String uid) =>
        AppRoutes.professorStudentInvite.replaceAll(':professorUid', uid);

    testWidgets('aceitar chama a callable e mostra que já é aluno',
        (tester) async {
      final wallet = FakeProfessorWalletRepository(invites: {
        'prof-x': walletStudent(
          status: ProfessorWalletStudentStatus.invited,
          professorName: 'Carlos Professor',
        ),
      });
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: invitePath('prof-x'),
      );
      expect(find.text('Carlos Professor'), findsOneWidget);
      expect(find.text(kProfessorStudentInviteExplanation), findsOneWidget);
      await tap(tester, find.byKey(const Key('professor-invite-accept')));
      expect(wallet.callsOf('respondInvite').single.data,
          {'professorUid': 'prof-x', 'accept': true});
      expect(
          find.byKey(const Key('professor-invite-accepted')), findsOneWidget);
    });

    testWidgets('recusar chama a callable e volta', (tester) async {
      final wallet = FakeProfessorWalletRepository(invites: {
        'prof-x': walletStudent(status: ProfessorWalletStudentStatus.invited),
      });
      final GoRouter router = await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: invitePath('prof-x'),
      );
      await tap(tester, find.byKey(const Key('professor-invite-decline')));
      expect(wallet.callsOf('respondInvite').single.data,
          {'professorUid': 'prof-x', 'accept': false});
      expect(
          router.routerDelegate.currentConfiguration.uri.path, AppRoutes.home);
    });

    testWidgets('convite inexistente ou já respondido: aviso amigável',
        (tester) async {
      final wallet = FakeProfessorWalletRepository(invites: {
        'prof-y': walletStudent(status: ProfessorWalletStudentStatus.archived),
      });
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: invitePath('prof-x'),
      );
      expect(find.byKey(const Key('professor-invite-missing')), findsOneWidget);
      expect(find.byKey(const Key('professor-invite-accept')), findsNothing);

      await pumpProfessorWalletApp(
        tester,
        wallet: wallet,
        location: invitePath('prof-y'),
      );
      expect(find.byKey(const Key('professor-invite-closed')), findsOneWidget);
    });
  });
}
