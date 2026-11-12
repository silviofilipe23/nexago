import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete_training/application/athlete_training_providers.dart';
import 'package:nexago_app/features/class_agreements/application/class_agreements_providers.dart';
import 'package:nexago_app/features/class_agreements/domain/class_agreements.dart';
import 'package:nexago_app/features/class_agreements/infrastructure/class_agreements_repository.dart';
import 'package:nexago_app/features/class_agreements/presentation/class_agreements_pages.dart';
import 'package:nexago_app/features/class_agreements/presentation/class_plan_signup_page.dart';

/// Texto longo o bastante para não caber numa tela de 800px.
final longContractBody = [
  for (var i = 1; i <= 40; i++)
    '# $i. Cláusula\nTexto da cláusula $i com as regras da arena, a '
        'mensalidade, a reposição e o cancelamento, longo o bastante para '
        'ocupar algumas linhas na folha do contrato.',
].join('\n\n');

const sha = '9f3a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccc27e';

/// Arena Sul: mensal 2x com dois professores, pacote com um professor só.
Map<String, Object?> signupOptionsJson({
  List<Map<String, Object?>>? plans,
  List<Map<String, Object?>>? classes,
  int activePlanCount = 0,
}) =>
    {
      'arena': {'arenaId': 'arena-sul', 'name': 'Arena Sul'},
      'onlineBilling': true,
      'enrollmentFeeReais': 50,
      'dueDay': 10,
      'hasCpf': true,
      'activePlanCount': activePlanCount,
      'plans': plans ??
          [
            {
              'planId': 'mensal-2x',
              'name': 'Beach Tennis 2x',
              'kind': 'monthly',
              'priceReais': 280,
              'classesPerWeek': 2,
              'makeupsPerMonth': 2,
              'teacherIds': ['t1', 't2'],
            },
            {
              'planId': 'pacote-10',
              'name': 'Pacote 10 aulas',
              'kind': 'package',
              'priceReais': 450,
              'credits': 10,
              'validityDays': 60,
              'teacherIds': ['t1'],
            },
          ],
      'teachers': [
        {'teacherId': 't1', 'name': 'Ana Lima'},
        {'teacherId': 't2', 'name': 'Bruno Costa'},
      ],
      'classes': classes ??
          [
            {
              'classId': 'c1',
              'name': 'BT Iniciante',
              'teacherId': 't1',
              'startTime': '18:00',
              'endTime': '19:00',
              'capacity': 6,
              'days': [
                {'weekday': 1, 'vacancies': 3},
                {'weekday': 3, 'vacancies': 0},
              ],
            },
            {
              'classId': 'c2',
              'name': 'BT Intermediário',
              'teacherId': 't1',
              'startTime': '19:00',
              'endTime': '20:00',
              'capacity': 6,
              'days': [
                {'weekday': 2, 'vacancies': 1},
                {'weekday': 4, 'vacancies': 2},
              ],
            },
            {
              'classId': 'c3',
              'name': 'BT Manhã',
              'teacherId': 't2',
              'startTime': '07:00',
              'endTime': '08:00',
              'capacity': 6,
              'days': [
                {'weekday': 1, 'vacancies': 4},
                {'weekday': 5, 'vacancies': 5},
              ],
            },
            {
              'classId': 'c4',
              'name': 'BT Noite',
              'teacherId': 't2',
              'startTime': '20:00',
              'endTime': '21:00',
              'capacity': 6,
              'enrolled': true,
              'days': [
                {'weekday': 3, 'vacancies': 2},
              ],
            },
          ],
    };

ClassSignupOptions buildSignupOptions({
  List<Map<String, Object?>>? plans,
  List<Map<String, Object?>>? classes,
  int activePlanCount = 0,
}) =>
    ClassSignupOptions.fromMap(signupOptionsJson(
      plans: plans,
      classes: classes,
      activePlanCount: activePlanCount,
    ));

Map<String, Object?> previewJson({String body = '', bool needsCpf = false}) => {
      'agreement': {
        'title': 'Contrato de aulas · Arena Sul',
        'body': body.isEmpty ? longContractBody : body,
        'sha256': sha,
        'templateVersion': 3,
        'essentials': [
          {'label': 'Plano', 'value': 'Beach Tennis 2x'},
          {'label': 'Professor', 'value': 'Ana Lima'},
        ],
      },
      'charges': [
        {
          'description': 'Mensalidade + matrícula',
          'amountReais': 330,
          'dueDate': '2026-11-20',
        },
      ],
      'totalReais': 330,
      'online': true,
      'needsCpf': needsCpf,
      'startDate': '2026-11-16',
      'endDate': '2027-11-15',
    };

Map<String, Object?> agreementJson({
  String id = 'ag1',
  String audience = 'student',
  String status = 'signed',
  String arenaId = 'arena-sul',
  String arenaName = 'Arena Sul',
  String? planName = 'Beach Tennis 2x',
  String body = 'Cláusula única.',
  String? signedAt = '2026-11-10T14:30:00Z',
  bool evidence = true,
}) =>
    {
      'agreementId': id,
      'audience': audience,
      'arenaId': arenaId,
      'arenaName': arenaName,
      'status': status,
      'number': 'AUL-2026-0042',
      'title': audience == 'professor'
          ? 'Contrato de professor'
          : 'Contrato de aulas',
      if (planName != null) 'planName': planName,
      'essentials': [
        {'label': 'Professor', 'value': 'Ana Lima'},
        {'label': 'Aulas', 'value': 'SEG 18:00 · TER 19:00'},
      ],
      'startDate': '2026-11-16',
      'endDate': '2027-11-15',
      'sentAt': '2026-11-09T12:00:00Z',
      if (signedAt != null) 'signedAt': signedAt,
      'partyName': audience == 'professor' ? 'Ana Lima' : 'Carla Souza',
      'body': body,
      'sha256': sha,
      'templateVersion': 2,
      if (evidence)
        'evidence': {
          'platform': 'ios',
          'appVersion': '1.0.21+119',
          'ip': '189.6.***.***',
          'readSeconds': 95,
        },
    };

ClassAgreement agreement({
  String id = 'ag1',
  String audience = 'student',
  String status = 'signed',
  String arenaId = 'arena-sul',
  String arenaName = 'Arena Sul',
  String body = 'Cláusula única.',
  String? signedAt = '2026-11-10T14:30:00Z',
  bool evidence = true,
}) =>
    ClassAgreement.fromMap(agreementJson(
      id: id,
      audience: audience,
      status: status,
      arenaId: arenaId,
      arenaName: arenaName,
      body: body,
      signedAt: signedAt,
      evidence: evidence,
    ));

/// Repositório em memória: nenhuma chamada ao Firebase; grava o que a tela
/// mandou para as callables.
class FakeClassAgreementsRepository implements ClassAgreementsRepository {
  FakeClassAgreementsRepository({
    ClassSignupOptions? options,
    this.previewData,
    Map<String, ClassAgreement>? agreements,
    List<ClassAgreement>? mine,
  })  : options = options ?? buildSignupOptions(),
        agreements = agreements ?? {},
        mine = mine ?? const [];

  ClassSignupOptions options;
  Map<String, Object?>? previewData;
  final Map<String, ClassAgreement> agreements;
  List<ClassAgreement> mine;

  /// Erro da próxima assinatura (aluno ou professor); consumido na chamada.
  Object? enrollError;
  Object? signError;
  Object? myAgreementsError;

  bool signupOpen = true;

  /// `pendingPayment` devolvido pela assinatura (pagar ao assinar); null = ativa.
  Map<String, Object?>? enrollPendingPayment;

  /// Respostas da tela de pagamento, em ordem (a última se repete).
  List<Map<String, Object?>> paymentResponses = const [
    {'state': 'preparing'},
  ];
  final paymentCalls = <Map<String, Object?>>[];

  final calls = <String>[];
  final previewCalls = <Map<String, Object?>>[];
  Map<String, Object?>? lastEnroll;
  Map<String, Object?>? lastSign;

  /// Depois de assinar, o contrato relido vem assinado (como o servidor).
  ClassAgreement Function(ClassAgreement before)? afterSign;

  @override
  Stream<bool> watchSignupOpen(String arenaId) {
    calls.add('open? $arenaId');
    return Stream.value(signupOpen);
  }

  @override
  Future<ClassSignupOptions> signupOptions(String arenaId) async {
    calls.add('options $arenaId');
    return options;
  }

  @override
  Future<ClassEnrollmentPreview> preview({
    required String arenaId,
    required String planId,
    required List<ClassSlotChoice> slots,
    String cycle = 'monthly',
    int? dueDay,
    String? paymentForm,
    String? cpf,
  }) async {
    calls.add('preview $planId');
    previewCalls.add({
      'arenaId': arenaId,
      'planId': planId,
      'cycle': cycle,
      'dueDay': dueDay,
      'paymentForm': paymentForm,
      'slots': [for (final s in slots) s.key],
      'cpf': cpf,
    });
    return ClassEnrollmentPreview.fromMap(
        spMapOf(previewData ?? previewJson()));
  }

  @override
  Future<ClassEnrollmentResult> enroll({
    required String arenaId,
    required String planId,
    required List<ClassSlotChoice> slots,
    required String sha256,
    required int readSeconds,
    required String platform,
    required String appVersion,
    String cycle = 'monthly',
    int? dueDay,
    String? paymentForm,
    String? cpf,
  }) async {
    calls.add('enroll $planId');
    lastEnroll = {
      'arenaId': arenaId,
      'cycle': cycle,
      'dueDay': dueDay,
      'paymentForm': paymentForm,
      'planId': planId,
      'slots': [for (final s in slots) s.key],
      'sha256': sha256,
      'readSeconds': readSeconds,
      'platform': platform,
      'appVersion': appVersion,
      'cpf': cpf,
    };
    final err = enrollError;
    if (err != null) {
      enrollError = null;
      throw err;
    }
    return ClassEnrollmentResult.fromMap({
      'enrollmentId': 'enr-1',
      'agreementId': 'ag-new',
      'online': true,
      'charges': [
        {
          'description': 'Mensalidade + matrícula',
          'amountReais': 330,
          'dueDate': '2026-11-20',
        },
      ],
      'signedAt': '2026-11-12T15:00:00Z',
      'pendingPayment': enrollPendingPayment,
    });
  }

  @override
  Future<ClassEnrollmentPayment> enrollmentPayment({
    required String enrollmentId,
    required String method,
  }) async {
    paymentCalls.add({'enrollmentId': enrollmentId, 'method': method});
    final i = (paymentCalls.length - 1).clamp(0, paymentResponses.length - 1);
    return ClassEnrollmentPayment.fromMap(paymentResponses[i]);
  }

  @override
  Future<List<ClassAgreement>> myAgreements() async {
    calls.add('mine');
    final err = myAgreementsError;
    if (err != null) throw err;
    return mine;
  }

  @override
  Future<ClassAgreement> agreement(String agreementId) async {
    calls.add('agreement $agreementId');
    final a = agreements[agreementId];
    if (a == null) {
      throw ClassAgreementException('Contrato não encontrado.',
          code: 'not-found');
    }
    return a;
  }

  @override
  Future<void> sign({
    required String agreementId,
    required String sha256,
    required int readSeconds,
    required String platform,
    required String appVersion,
  }) async {
    calls.add('sign $agreementId');
    lastSign = {
      'agreementId': agreementId,
      'sha256': sha256,
      'readSeconds': readSeconds,
      'platform': platform,
      'appVersion': appVersion,
    };
    final err = signError;
    if (err != null) {
      signError = null;
      throw err;
    }
    final before = agreements[agreementId];
    final next = afterSign;
    if (before != null && next != null) agreements[agreementId] = next(before);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

Map<String, dynamic> spMapOf(Map<String, Object?> m) =>
    Map<String, dynamic>.from(m);

Widget _stub(String label) => Scaffold(body: Center(child: Text(label)));

/// Monta o app com as rotas reais dos contratos de aulas e stubs no resto.
Future<GoRouter> pumpClassAgreementsApp(
  WidgetTester tester, {
  required String location,
  required FakeClassAgreementsRepository repo,
  Size size = const Size(400, 800),
  String uid = 'me',
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    initialLocation: location,
    routes: [
      GoRoute(
        path: AppRoutes.discover,
        builder: (_, __) => _stub('descobrir'),
      ),
      GoRoute(
        path: AppRoutes.arenaDetail,
        builder: (_, __) => _stub('arena'),
      ),
      GoRoute(
        path: AppRoutes.classPlanSignup,
        name: AppRouteNames.classPlanSignup,
        builder: (_, s) => ClassPlanSignupPage(
          arenaId: s.pathParameters['arenaId']!,
          planId: s.uri.queryParameters['plano'],
        ),
      ),
      GoRoute(
        path: AppRoutes.classAgreements,
        name: AppRouteNames.classAgreements,
        builder: (_, __) => const ClassAgreementsPage(),
      ),
      GoRoute(
        path: AppRoutes.classAgreement,
        name: AppRouteNames.classAgreement,
        builder: (_, s) =>
            ClassAgreementPage(agreementId: s.pathParameters['agreementId']!),
      ),
      GoRoute(
        path: '/cobrancas',
        name: AppRouteNames.athleteBilling,
        builder: (_, __) => _stub('cobranças'),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        classAgreementsRepositoryProvider.overrideWithValue(repo),
        classAgreementsUidProvider.overrideWithValue(uid),
        contractSignPlatformProvider.overrideWithValue('ios'),
        contractSignAppVersionProvider
            .overrideWith((ref) async => '1.0.21+119'),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await settle(tester);
  return router;
}

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}

Future<void> tapKey(WidgetTester tester, String key) async {
  final f = find.byKey(Key(key));
  await tester.ensureVisible(f);
  await tester.pump();
  await tester.tap(f);
  await settle(tester);
}

/// `onPressed` do FilledButton dentro do SchedulePrimaryButton de [key].
bool buttonEnabled(WidgetTester tester, String key) =>
    tester
        .widget<FilledButton>(find.descendant(
          of: find.byKey(Key(key)),
          matching: find.byType(FilledButton),
        ))
        .onPressed !=
    null;

/// Fontes reais (Sora + JetBrains Mono): com a fonte de teste (glifo quadrado)
/// "18:00" não cabe na caixa de 46px do horário e o teste acusa um estouro que
/// não existe no aparelho. Com as fontes reais, um estouro derruba o teste.
Future<void> loadClassAgreementFonts() async {
  TestWidgetsFlutterBinding.ensureInitialized();
  final sora = FontLoader('Sora')
    ..addFont(rootBundle.load('assets/fonts/Sora/Sora-Variable.ttf'));
  final mono = FontLoader('JetBrains Mono');
  for (final weight in ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold']) {
    mono.addFont(
      rootBundle.load('assets/fonts/JetBrainsMono/JetBrainsMono-$weight.ttf'),
    );
  }
  await Future.wait([sora.load(), mono.load()]);
}
