import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/features/arena/data/arena_class_enrollment_repository.dart';
import 'package:nexago_app/features/arena/data/arena_class_repository.dart';
import 'package:nexago_app/features/arena/domain/arena_plan_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_schedule_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_billing_logic.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_enrollment.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_enrollment_providers.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_logic.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_payout.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_payout_logic.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_payout_providers.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_providers.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_session.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_class_attendance_page.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_class_cancel_sheet.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_class_charges_page.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_class_enroll_page.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_class_payouts_page.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_class_student_page.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_class_teacher_payout_page.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_class_teachers_section.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_classes_page.dart';
import 'package:nexago_app/features/arena/presentation/aulas/widgets/arena_class_atoms.dart';
import 'package:nexago_app/features/arena/presentation/aulas/widgets/arena_class_attendance_widgets.dart';
import 'package:nexago_app/features/arena/presentation/aulas/widgets/arena_class_card.dart';
import 'package:nexago_app/features/arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import 'package:nexago_app/features/arena/presentation/aulas/widgets/arena_class_payout_atoms.dart';
import 'package:nexago_app/features/arena/presentation/aulas/widgets/arena_class_session_card.dart';

import '../../core/theme/state_tone_screens.dart';
import 'aulas/arena_class_fixtures.dart';
import 'aulas/arena_class_payout_fixtures.dart';
import 'aulas/aulas_pump.dart' show proActivePlan;
import 'aulas/fake_arena_class_enrollment_repository.dart';
import 'aulas/fake_arena_class_payout_repository.dart';
import 'aulas/fake_arena_class_repository.dart';

// Texto, ícone e marca em verde, vermelho e âmbar nas telas de Aulas do
// gestor da arena (chamada, encaixe, cancelamento, mensalidades, aluno,
// matrícula, repasse dos professores), conferidos contra o fundo real nos
// dois temas. No claro os crus do AppColors reprovam: ~1,6–3,5:1 no branco.

const _today = '2026-10-19';

/// Cor de professor que não é tom de estado: a bolinha do professor é a cor
/// de identidade dele, não entra na conferência.
const _teacherBlue = '#5B9BFF';

// ── Fixtures ────────────────────────────────────────────────────────────

ArenaClassSession _sess({
  String id = 's1',
  String status = 'scheduled',
  String start = '18:00',
  String end = '19:30',
  ArenaClassCancelReason? cancelReason,
}) {
  return ArenaClassSession(
    id: id,
    classId: 'c1',
    arenaId: 'a1',
    className: 'Vôlei Avançado',
    type: ArenaClassType.turma,
    sport: 'volei_praia',
    level: ArenaClassLevel.avancado,
    teacherName: 'Marcos Lima',
    teacherColor: _teacherBlue,
    courtName: 'Quadra 3',
    capacity: 12,
    date: _today,
    startTime: start,
    endTime: end,
    status: status,
    attendance: const {},
    cancelReason: cancelReason,
  );
}

ArenaClass _cls({
  String id = 'c1',
  String name = 'Vôlei Avançado',
  List<int> weekdays = const [1, 3, 5],
  int capacity = 12,
  int studentCount = 10,
  String status = 'active',
  List<String> conflictDates = const [],
}) {
  return ArenaClass(
    id: id,
    arenaId: 'a1',
    name: name,
    type: ArenaClassType.turma,
    sport: 'volei_praia',
    level: ArenaClassLevel.avancado,
    teacherId: 't1',
    teacherName: 'Marcos Lima',
    teacherColor: _teacherBlue,
    weekdays: weekdays,
    startTime: '18:00',
    endTime: '19:30',
    courtId: 'q3',
    courtName: 'Quadra 3',
    capacity: capacity,
    studentCount: studentCount,
    startDate: '2026-10-01',
    status: status,
    conflictDates: conflictDates,
  );
}

/// Mesmo acesso e relógio do `pumpAulas` (hoje = segunda 19/10/2026).
List<Override> _aulas({
  FakeArenaClassRepository? repo,
  FakeArenaClassEnrollmentRepository? enrollmentRepo,
  FakeArenaClassPayoutRepository? payoutRepo,
  ArenaStaffRole role = ArenaStaffRole.recepcao,
  List<Override> extra = const [],
}) =>
    [
      ...arenaAccessOverrides(role),
      arenaClassRepositoryProvider
          .overrideWithValue(repo ?? FakeArenaClassRepository()),
      arenaClassEnrollmentRepositoryProvider.overrideWithValue(
        enrollmentRepo ?? FakeArenaClassEnrollmentRepository(),
      ),
      arenaClassPayoutRepositoryProvider.overrideWithValue(
        payoutRepo ?? FakeArenaClassPayoutRepository(),
      ),
      arenaClassTodayKeyProvider.overrideWith((ref) => _today),
      arenaClassClockProvider.overrideWith(
        (ref) => Stream.value(DateTime(2026, 10, 19, 17, 40)),
      ),
      arenaClassSelectedDayProvider.overrideWith(
        (ref) => DateTime(2026, 10, 19),
      ),
      managedArenaPlanStatusProvider.overrideWith(
        (ref) => Stream.value(proActivePlan),
      ),
      managedArenaDetailProvider.overrideWith((ref) => Stream.value(null)),
      ...extra,
    ];

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pump();
  await tester.tap(finder);
  await _settle(tester);
}

final _sheet = find.byType(BottomSheet);
final _menu = find.byWidgetPredicate((w) => w is PopupMenuItem);

class _ThrowingClassRepository extends FakeArenaClassRepository {
  _ThrowingClassRepository({super.sessionsById});

  @override
  Future<ArenaClassCancelResult> cancelSession({
    required String sessionId,
    required ArenaClassCancelReason reason,
    String? note,
    bool? generateCredits,
  }) async =>
      throw ArenaClassException('A aula já começou.');

  @override
  Future<String> addExtra({
    required String sessionId,
    required ArenaClassExtraKind kind,
    String? creditId,
    String? athleteId,
    String? name,
    String? phone,
  }) async =>
      throw ArenaClassException('A aula lotou agora há pouco.');
}

class _ThrowingEnrollmentRepository extends FakeArenaClassEnrollmentRepository {
  _ThrowingEnrollmentRepository({
    super.plans,
    super.rules,
    super.charges,
    super.preview,
    this.failPreview = false,
  });

  final bool failPreview;

  @override
  Future<void> markChargePaid({
    required String chargeId,
    required ArenaClassPaymentMethod method,
  }) async =>
      throw ArenaClassException('Mensalidade já foi paga.');

  @override
  Future<ArenaClassEnrollmentPreview> previewEnrollment(
    ArenaClassEnrollmentRequest request,
  ) async {
    if (failPreview) throw StateError('sem rede');
    return super.previewEnrollment(request);
  }

  @override
  Future<ArenaClassEnrollmentCreated> createEnrollment(
    ArenaClassEnrollmentRequest request,
  ) async =>
      throw ArenaClassException('Turma lotada na quinta.');
}

class _ThrowingPayoutRepository extends FakeArenaClassPayoutRepository {
  _ThrowingPayoutRepository({
    super.teachers,
    super.previews,
    super.payouts,
  });

  @override
  Future<void> markPayoutPaid({
    required String payoutId,
    required ArenaClassPayoutMethod method,
    required String paidOn,
  }) async =>
      throw ArenaClassException('Repasse já registrado.');
}

class _ThrowingUsersRepository implements UsersRepository {
  @override
  Future<List<AppUserProfile>> searchAthletesByKeywords(
    String term, {
    int max = 25,
  }) async =>
      throw StateError('sem rede');

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Chamada de hoje → "Encaixar aluno" (a folha na largura real da tela).
Future<void> _openExtra(
  WidgetTester tester,
  ThemeData theme,
  FakeArenaClassRepository repo,
) async {
  await pumpTonePage(
    tester,
    theme,
    const ArenaClassAttendancePage(sessionId: 's1'),
    overrides: _aulas(repo: repo),
  );
  await _tap(tester, find.text('Encaixar aluno'));
}

// ── Mensalidades ────────────────────────────────────────────────────────

final _lateCharge = charge(
  id: 'late',
  studentId: 'u4',
  name: 'Diego Nunes',
  description: 'Pacote 4 particulares',
  amount: 440,
  dueDate: '2026-10-12',
  asaas: invoice(groupId: 'g4', status: 'OVERDUE'),
);
final _todayCharge = charge(
  id: 'today',
  studentId: 'u5',
  name: 'Elisa Prado',
  description: 'Mensal 1x/semana · out/2026',
  amount: 180,
  dueDate: _today,
  asaas: invoice(
    groupId: 'g5',
    state: ArenaClassAsaasState.failed,
    url: null,
    status: null,
  ),
);
final _paidCharge = charge(
  id: 'paid',
  status: 'paid',
  paidOn: '2026-10-02',
  amount: 320,
  asaas: invoice(state: ArenaClassAsaasState.paid, url: null),
  paidVia: 'asaas',
);

Future<void> _openCharges(
  WidgetTester tester,
  ThemeData theme, {
  FakeArenaClassEnrollmentRepository? enrollmentRepo,
}) =>
    pumpTonePage(
      tester,
      theme,
      const ArenaClassChargesPage(),
      overrides: _aulas(
        enrollmentRepo: enrollmentRepo ??
            FakeArenaClassEnrollmentRepository(
              charges: [_lateCharge, _todayCharge, _paidCharge],
            ),
      ),
    );

// ── Aluno ───────────────────────────────────────────────────────────────

final _studentLate = charge(
  id: 'sl',
  dueDate: '2026-10-05',
  asaas: invoice(groupId: 'e1_10', status: 'OVERDUE'),
);
final _studentPaid = charge(
  id: 'sp',
  description: 'Mensal 2x/semana · set/2026',
  dueDate: '2026-09-05',
  status: 'paid',
  paidOn: '2026-09-04',
  asaas: invoice(groupId: 'e1_09', state: ArenaClassAsaasState.paid, url: null),
  paidVia: 'asaas',
);

// ── Repasse ─────────────────────────────────────────────────────────────

FakeArenaClassPayoutRepository _payoutRepo({
  List<ArenaClassPayout> payouts = const [],
  int pending = 0,
  bool throwing = false,
}) {
  final teachers = [
    teacher(id: 't1', name: 'Thiago Mendes', payout: revenueShare(50)),
    teacher(id: 't2', name: 'Juliana Rocha', userId: null),
  ];
  final previews = {
    '2026-10': monthPreview('2026-10', [
      previewTeacher(id: 't1', name: 'Thiago Mendes', amount: 480),
      previewTeacher(id: 't2', name: 'Juliana Rocha', amount: 0, model: null),
    ]),
    '2026-09': monthPreview('2026-09', [
      previewTeacher(
          id: 't1', name: 'Thiago Mendes', amount: 960, pending: pending),
      previewTeacher(id: 't2', name: 'Juliana Rocha', amount: 0, model: null),
      previewTeacher(id: 't3', name: 'Marcos Lima', amount: 450),
    ]),
  };
  return throwing
      ? _ThrowingPayoutRepository(
          teachers: teachers, previews: previews, payouts: payouts)
      : FakeArenaClassPayoutRepository(
          teachers: teachers, previews: previews, payouts: payouts);
}

Future<void> _openTeacherPayout(
  WidgetTester tester,
  ThemeData theme,
  FakeArenaClassPayoutRepository payoutRepo,
) =>
    pumpTonePage(
      tester,
      theme,
      const ArenaClassTeacherPayoutPage(teacherId: 't1', month: '2026-09'),
      overrides: _aulas(
        repo: FakeArenaClassRepository(classes: [_cls()]),
        payoutRepo: payoutRepo,
        role: ArenaStaffRole.gestor,
      ),
      size: const Size(402, 2600),
    );

// ── Matrícula ───────────────────────────────────────────────────────────

const _seed = ArenaClassEnrollSeed(
  studentId: 'st1',
  name: 'Marina Teles',
  phone: '62988887777',
);

final _package = plan(
  id: 'p8',
  name: 'Pacote 8 aulas',
  kind: ArenaClassPlanKind.package,
  price: 360,
  credits: 8,
  validityDays: 60,
);

const _packagePreview = ArenaClassEnrollmentPreview(
  charges: [
    (
      description: 'Pacote 8 aulas · 8 aulas',
      amountReais: 360,
      dueDate: _today,
    ),
  ],
  totalReais: 360,
  enrollmentFeeReais: 0,
);

/// Aluno → pacote → quinta 19:00 → pagamento.
Future<void> _enrollToPayment(
  WidgetTester tester,
  ThemeData theme,
  FakeArenaClassEnrollmentRepository enrollmentRepo, {
  ArenaClassEnrollSeed seed = _seed,
}) async {
  await pumpTonePage(
    tester,
    theme,
    ArenaClassEnrollPage(seed: seed),
    overrides: _aulas(
      repo: FakeArenaClassRepository(
        classes: [
          _cls(id: 'c2', name: 'Intermediário B', weekdays: const [2, 4]),
        ],
      ),
      enrollmentRepo: enrollmentRepo,
    ),
  );
  await _tap(tester, find.text('Continuar'));
  await _tap(tester, find.text('Pacote 8 aulas'));
  await _tap(tester, find.text('Continuar'));
  await _tap(tester, find.textContaining('Qui · 18:00'));
  await _tap(tester, find.text('Continuar'));
  await _settle(tester);
}

final List<ToneScreen> arenaAulasToneScreens = [
  // ── Peças-base ────────────────────────────────────────────────────────
  ToneScreen(
    'ArenaClassTag e ArenaClassTypeTag',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const Wrap(
        spacing: 6,
        children: [
          ArenaClassTag(label: 'Reposição', color: AppColors.win),
          ArenaClassTag(label: 'Cancelada', color: AppColors.live),
          ArenaClassTag(label: 'Pausada', color: AppColors.pending),
          ArenaClassTypeTag(type: ArenaClassType.experimental),
        ],
      ),
      onCard: true,
    ),
    tonePiece,
    ['REPOSIÇÃO', 'CANCELADA', 'PAUSADA', 'EXPERIMENTAL'],
  ),
  ToneScreen(
    'ArenaClassAvatar (iniciais na cor)',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const ArenaClassAvatar(initials: 'TM', color: AppColors.win),
      onCard: true,
    ),
    tonePiece,
    ['TM'],
  ),
  ToneScreen(
    'ArenaClassKicker',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ArenaClassKicker('Pago', color: AppColors.win),
          ArenaClassKicker('Atenção', color: AppColors.pending),
        ],
      ),
      onCard: true,
    ),
    tonePiece,
    ['PAGO', 'ATENÇÃO'],
  ),
  ToneScreen(
    'ArenaClassInfoRow (valor na cor)',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const Column(
        children: [
          ArenaClassInfoRow(
            label: 'Em atraso',
            value: 'R\$ 320 · desde 05 out',
            valueColor: AppColors.live,
          ),
          ArenaClassInfoRow(
            label: 'Créditos de reposição',
            value: '1 · expira 13 nov',
            valueColor: AppColors.win,
          ),
          ArenaClassInfoRow(
            label: 'Pagamento',
            value: 'Em aberto · R\$ 360',
            valueColor: AppColors.pending,
          ),
        ],
      ),
      onCard: true,
    ),
    tonePiece,
    ['R\$ 320 · desde 05 out', '1 · expira 13 nov', 'Em aberto · R\$ 360'],
  ),
  ToneScreen(
    'ArenaClassGhostButton (cor de alerta)',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      ArenaClassGhostButton(
        label: 'Cancelar plano',
        icon: Icons.block_rounded,
        color: AppColors.live,
        onPressed: () {},
      ),
      onCard: true,
    ),
    tonePiece,
    ['Cancelar plano', Icons.block_rounded],
  ),
  ToneScreen(
    'ArenaClassSheetHeader (subtítulo na cor)',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const ArenaClassSheetHeader(
        title: 'Encaixar na aula',
        subtitle: 'Aula sem vaga · Vôlei Avançado 18:00',
        subtitleColor: AppColors.live,
      ),
      onSheet: true,
    ),
    tonePiece,
    ['Aula sem vaga · Vôlei Avançado 18:00'],
  ),
  ToneScreen(
    'ArenaClassPayoutStat',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ArenaClassPayoutStat(
            label: 'Pago',
            value: formatBRL(960),
            color: AppColors.win,
          ),
          ArenaClassPayoutStat(
            label: 'Ajuste',
            value: arenaClassSignedBrl(-40),
            color: AppColors.live,
          ),
        ],
      ),
      onCard: true,
    ),
    tonePiece,
    [formatBRL(960), arenaClassSignedBrl(-40)],
  ),
  ToneScreen(
    'ArenaClassInfoBanner (aviso)',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const ArenaClassInfoBanner('Mudou desde o fechamento.', warn: true),
    ),
    tonePiece,
    [Icons.warning_amber_rounded, 'Mudou desde o fechamento.'],
  ),
  ToneScreen(
    'ArenaClassAttendanceNotice',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const Column(
        children: [
          ArenaClassAttendanceNotice(
            color: AppColors.live,
            icon: Icons.event_busy_rounded,
            text: 'Aula cancelada.',
          ),
          ArenaClassAttendanceNotice(
            color: AppColors.win,
            icon: Icons.check_circle_outline_rounded,
            text: 'Chamada fechada.',
          ),
        ],
      ),
    ),
    tonePiece,
    [Icons.event_busy_rounded, Icons.check_circle_outline_rounded],
  ),
  ToneScreen(
    'ArenaClassMarkControl (presente, falta, avisou)',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ArenaClassMarkControl(
            name: 'Felipe',
            mark: AttendanceMark.present,
            onMark: null,
          ),
          ArenaClassMarkControl(
            name: 'Bruno',
            mark: AttendanceMark.absent,
            onMark: null,
          ),
          ArenaClassMarkControl(
            name: 'Davi',
            mark: AttendanceMark.excused,
            onMark: null,
          ),
        ],
      ),
      onCard: true,
    ),
    tonePiece,
    [
      'Presente',
      'Falta',
      'Avisou',
      Icons.check_rounded,
      Icons.close_rounded,
    ],
  ),
  ToneScreen(
    'ArenaClassMarkControl · menu de troca',
    (tester, theme) async {
      await pumpTonePiece(
        tester,
        theme,
        ArenaClassMarkControl(
          name: 'Felipe',
          mark: AttendanceMark.present,
          onMark: (_) {},
        ),
        onCard: true,
      );
      await _tap(tester, find.text('Presente'));
    },
    _menu,
    ['Falta', 'Avisou'],
  ),
  ToneScreen(
    'ArenaClassAttendanceSummaryCard',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const ArenaClassAttendanceSummaryCard(
        summary: AttendanceSummary(
          present: 6,
          absent: 2,
          excused: 1,
          unmarked: 1,
        ),
        onAllPresent: null,
        allPresentLabel: 'Todos presentes',
        onAddExtra: null,
      ),
    ),
    tonePiece,
    ['2 faltas', '1 avisou'],
  ),
  ToneScreen(
    'ArenaClassSessionCard · ao vivo',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      ArenaClassSessionCard(
        item: ArenaClassDayItem(
          session: _sess(start: '17:00', end: '18:30'),
          phase: ArenaClassPhase.live,
          studentCount: 10,
        ),
      ),
    ),
    tonePiece,
    ['AGORA', 'marca'],
  ),
  ToneScreen(
    'ArenaClassSessionCard · cancelada',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      ArenaClassSessionCard(
        item: ArenaClassDayItem(
          session: _sess(
            status: 'canceled',
            cancelReason: ArenaClassCancelReason.rain,
          ),
          phase: ArenaClassPhase.canceled,
          studentCount: 10,
        ),
      ),
    ),
    tonePiece,
    ['CANCELADA', 'Cancelada · chuva'],
  ),
  ToneScreen(
    'ArenaClassSessionCard · chamada fechada e pendente',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      Column(
        children: [
          ArenaClassSessionCard(
            item: ArenaClassDayItem(
              session: _sess(id: 's1', status: 'completed'),
              phase: ArenaClassPhase.done,
              studentCount: 10,
            ),
          ),
          const SizedBox(height: 10),
          ArenaClassSessionCard(
            item: ArenaClassDayItem(
              session: _sess(id: 's2', start: '07:00', end: '08:00'),
              phase: ArenaClassPhase.done,
              studentCount: 6,
            ),
          ),
        ],
      ),
    ),
    tonePiece,
    ['Chamada fechada', 'Chamada pendente'],
  ),
  ToneScreen(
    'ArenaClassCard · lotada, pausada e sem quadra',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      ArenaClassCard(
        cls: _cls(
          capacity: 12,
          studentCount: 12,
          status: 'paused',
          conflictDates: const ['2026-10-21', '2026-10-28'],
        ),
        todayKey: _today,
      ),
    ),
    tonePiece,
    ['12/12', 'PAUSADA', '2 datas sem quadra'],
  ),
  ToneScreen(
    'ArenaClassAthleteSearch · erro na busca',
    (tester, theme) async {
      await pumpTonePiece(
        tester,
        theme,
        ArenaClassAthleteSearch(selectedUid: null, onSelect: (_) {}),
        onSheet: true,
        overrides: [
          usersRepositoryProvider.overrideWithValue(_ThrowingUsersRepository()),
        ],
      );
      await tester.enterText(find.byType(TextField), 'Carla');
      await tester.pump(const Duration(milliseconds: 400));
      await _settle(tester);
    },
    tonePiece,
    ['Não foi possível buscar agora. Tente novamente.'],
  ),

  // ── Folhas da chamada ─────────────────────────────────────────────────
  ToneScreen(
    'Cancelar aula · erro',
    (tester, theme) async {
      await pumpTonePiece(
        tester,
        theme,
        ArenaClassCancelSheet(
          session: session(),
          studentCount: 3,
          studentsWithAccount: 2,
        ),
        onSheet: true,
        overrides: _aulas(repo: _ThrowingClassRepository()),
      );
      await _tap(tester, find.text('Chuva'));
      await _tap(tester, find.text('Cancelar e avisar 2 alunos'));
    },
    tonePiece,
    ['A aula já começou.'],
  ),
  ToneScreen(
    'Encaixar na aula · sem vaga',
    (tester, theme) => _openExtra(
      tester,
      theme,
      FakeArenaClassRepository(
        sessionsById: {'s1': session(capacity: 1)},
        students: [
          student('u1', 'Felipe Rocha', weekdays: const [1])
        ],
      ),
    ),
    _sheet,
    ['Aula sem vaga · Vôlei Avançado 18:00'],
  ),
  ToneScreen(
    'Encaixar na aula · erro',
    (tester, theme) async {
      await _openExtra(
        tester,
        theme,
        _ThrowingClassRepository(sessionsById: {'s1': session()}),
      );
      await _tap(tester, find.text('Experimental'));
      await _tap(tester, find.text('Não tem conta? Encaixar só pelo nome'));
      await tester.enterText(
        find.widgetWithText(TextField, 'Nome de quem vai fazer a aula'),
        'Ana Souza',
      );
      await tester.pump();
      await _tap(tester, find.text('Encaixar Ana Souza'));
    },
    _sheet,
    ['A aula lotou agora há pouco.'],
  ),

  // ── Chamada ───────────────────────────────────────────────────────────
  ToneScreen(
    'Chamada · aula cancelada',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const ArenaClassAttendancePage(sessionId: 's1'),
      overrides: _aulas(
        repo: FakeArenaClassRepository(
          sessionsById: {
            's1': session(
              status: 'canceled',
              cancelReason: ArenaClassCancelReason.rain,
            ),
          },
          students: [student('u1', 'Felipe Rocha')],
        ),
      ),
    ),
    find.byType(ArenaClassAttendancePage),
    [Icons.event_busy_rounded],
  ),
  ToneScreen(
    'Chamada · fechada com encaixes',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const ArenaClassAttendancePage(sessionId: 's1'),
      overrides: _aulas(
        repo: FakeArenaClassRepository(
          sessionsById: {
            's1': session(
              status: 'completed',
              attendance: const {
                'u1': AttendanceMark.present,
                'u2': AttendanceMark.absent,
                'z': AttendanceMark.present,
                't': AttendanceMark.excused,
              },
              extras: {
                'z': extra('z', 'Igor Martins'),
                't': extra(
                  't',
                  'Ana Souza',
                  kind: ArenaClassExtraKind.trial,
                ),
              },
            ),
          },
          students: [
            student('u1', 'Felipe Rocha', weekdays: const [1, 3, 5]),
            student('u2', 'Bruno Alves', weekdays: const [1]),
          ],
        ),
      ),
    ),
    find.byType(ArenaClassAttendancePage),
    [
      Icons.check_circle_outline_rounded,
      'REPOSIÇÃO',
      'EXPERIMENTAL',
      'Presente',
      'Falta',
      'Avisou',
      Icons.check_rounded,
      Icons.close_rounded,
      '1 falta',
      '1 avisou',
    ],
  ),
  ToneScreen(
    'Chamada · menu ⋯',
    (tester, theme) async {
      await pumpTonePage(
        tester,
        theme,
        const ArenaClassAttendancePage(sessionId: 's1'),
        overrides: _aulas(
          repo: FakeArenaClassRepository(
            sessionsById: {'s1': session()},
            students: [student('u1', 'Felipe Rocha')],
          ),
        ),
      );
      await _tap(tester, find.byTooltip('Mais ações'));
    },
    _menu,
    [Icons.event_busy_rounded],
  ),

  // ── Mensalidades ──────────────────────────────────────────────────────
  ToneScreen(
    'Mensalidades · em atraso',
    (tester, theme) => _openCharges(tester, theme),
    find.byType(ArenaClassChargesPage),
    [
      formatBRL(440),
      '1',
      arenaClassChargeStatusLabel(_lateCharge, _today),
      'Fatura vencida',
      Icons.bolt_rounded,
    ],
  ),
  ToneScreen(
    'Mensalidades · vencendo',
    (tester, theme) async {
      await _openCharges(tester, theme);
      await _tap(tester, find.text('Vencendo · 1'));
    },
    find.byType(ArenaClassChargesPage),
    [
      'vence hoje',
      'Falha ao gerar link — tentando de novo',
      Icons.bolt_rounded,
    ],
  ),
  ToneScreen(
    'Mensalidades · pagos',
    (tester, theme) async {
      await _openCharges(tester, theme);
      await _tap(tester, find.text('Pagos · 1'));
    },
    find.byType(ArenaClassChargesPage),
    [
      arenaClassChargeStatusLabel(_paidCharge, _today),
      'Pago online · PIX',
      Icons.bolt_rounded,
    ],
  ),
  ToneScreen(
    'Registrar pagamento · fatura online e erro',
    (tester, theme) async {
      await _openCharges(
        tester,
        theme,
        enrollmentRepo: _ThrowingEnrollmentRepository(
          charges: [_lateCharge, _todayCharge, _paidCharge],
        ),
      );
      await _tap(tester, find.text('Registrar pagamento'));
      await _tap(tester, find.text('Confirmar recebimento'));
    },
    _sheet,
    [
      Icons.link_off_rounded,
      'Mensalidade já foi paga.',
      'Cancelar mensalidade',
    ],
  ),

  // ── Aluno ─────────────────────────────────────────────────────────────
  ToneScreen(
    'Aluno · plano, frequência e mensalidades',
    (tester, theme) async {
      await pumpTonePage(
        tester,
        theme,
        const ArenaClassStudentPage(studentId: 'u1'),
        overrides: _aulas(
          repo: FakeArenaClassRepository(
            classes: [
              _cls(id: 'c1', name: 'Iniciante A', weekdays: const [1, 3]),
            ],
            students: [
              student('u1', 'Carla Dias',
                  weekdays: const [1, 3], enrollmentId: 'e1'),
            ],
          ),
          enrollmentRepo: FakeArenaClassEnrollmentRepository(
            enrollments: [enrollment()],
            charges: [_studentLate, _studentPaid],
            credits: [credit(studentId: 'u1', name: 'Carla Dias')],
            sessionsByClass: {
              'c1': [
                session(id: 'a', date: '2026-10-07', attendance: const {
                  'u1': AttendanceMark.absent,
                }),
                session(id: 'b', date: '2026-10-12', attendance: const {
                  'u1': AttendanceMark.present,
                }),
                session(id: 'c', date: '2026-10-14', attendance: const {
                  'u1': AttendanceMark.excused,
                }),
              ],
            },
          ),
        ),
        size: const Size(402, 3000),
      );
      await _settle(tester);
    },
    find.byType(ArenaClassStudentPage),
    [
      'ATRASADO',
      '${formatBRL(320)} · desde ${arenaClassShortDate('2026-10-05')}',
      '1 · expira ${arenaClassShortDate('2026-11-13')}',
      'marca',
      '${formatBRL(320)} · '
          '${arenaClassChargeStatusLabel(_studentLate, _today)}',
      'Fatura vencida',
      '${formatBRL(320)} · '
          '${arenaClassChargeStatusLabel(_studentPaid, _today)}',
      'Pago online · PIX',
      'Cancelar plano',
    ],
  ),

  // ── Aulas · aba Alunos ────────────────────────────────────────────────
  ToneScreen(
    'Aulas · aba Alunos',
    (tester, theme) async {
      await pumpTonePage(
        tester,
        theme,
        const ArenaClassesPage(),
        overrides: _aulas(
          repo: FakeArenaClassRepository(
            classes: [
              _cls(id: 'c1', name: 'Iniciante A', weekdays: const [1, 3]),
            ],
          ),
          enrollmentRepo: FakeArenaClassEnrollmentRepository(
            enrollments: [
              enrollment(),
              enrollment(id: 'e2', studentId: 'u2', name: 'Bruno Alves'),
              enrollment(id: 'e3', studentId: 'u3', name: 'Davi Lopes'),
            ],
            charges: [
              charge(id: 'x1', dueDate: '2026-10-05'),
              charge(
                id: 'x2',
                studentId: 'u2',
                name: 'Bruno Alves',
                dueDate: _today,
              ),
            ],
          ),
        ),
      );
      await _tap(tester, find.text('Alunos'));
    },
    find.byType(ArenaClassesPage),
    ['ATRASADO', 'VENCE HOJE', 'EM DIA'],
  ),

  // ── Professores e repasse ─────────────────────────────────────────────
  ToneScreen(
    'Aulas · aba Professores (gestor)',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      ArenaClassTeachersSection(classes: [_cls()]),
      overrides: _aulas(
        payoutRepo: _payoutRepo(),
        role: ArenaStaffRole.gestor,
      ),
    ),
    tonePiece,
    [formatBRL(3200), 'Definir repasse', Icons.edit_outlined],
  ),
  ToneScreen(
    'Repasse do mês',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const ArenaClassPayoutsPage(month: '2026-09'),
      overrides: _aulas(
        repo: FakeArenaClassRepository(classes: [_cls()]),
        payoutRepo: _payoutRepo(payouts: [
          payout(
            teacherId: 't1',
            month: '2026-09',
            computed: 960,
            status: 'paid',
            paidOn: '2026-10-05',
            method: ArenaClassPayoutMethod.pix,
          ),
          payout(
            teacherId: 't3',
            name: 'Marcos Lima',
            month: '2026-09',
            computed: 400,
          ),
        ]),
        role: ArenaStaffRole.gestor,
      ),
      size: const Size(402, 2000),
    ),
    find.byType(ArenaClassPayoutsPage),
    [
      formatBRL(960),
      formatBRL(3200),
      'PAGO 05 OUT',
      'SEM MODELO',
      'Mudou desde o fechamento — recalcule',
    ],
  ),
  ToneScreen(
    'Repasse do professor · pago com ajuste',
    (tester, theme) => _openTeacherPayout(
      tester,
      theme,
      _payoutRepo(payouts: [
        payout(
          month: '2026-09',
          computed: 960,
          adjustment: -40,
          note: 'Aula de 08/09 sem substituto',
          status: 'paid',
          paidOn: '2026-10-05',
          method: ArenaClassPayoutMethod.pix,
          model: perClass(45),
        ),
        payout(month: '2026-08', computed: 900),
      ]),
    ),
    find.byType(ArenaClassTeacherPayoutPage),
    [
      'PAGO',
      formatBRL(1920),
      arenaClassSignedBrl(-40),
      'Ajuste',
      'Fechado com o modelo anterior — hoje o cadastro diz '
          '${arenaClassPayoutModelLabel(revenueShare(50))}. Recalcule '
          'para aplicar.',
      'Pago ${arenaClassShortDate('2026-10-05')}',
      'A pagar',
    ],
  ),
  ToneScreen(
    'Repasse do professor · fechamento desatualizado',
    (tester, theme) => _openTeacherPayout(
      tester,
      theme,
      _payoutRepo(payouts: [payout(month: '2026-09', computed: 900)]),
    ),
    find.byType(ArenaClassTeacherPayoutPage),
    [
      Icons.warning_amber_rounded,
      'A conta de hoje deu ${formatBRL(960)} — mudou desde o fechamento '
          '(pagamento lançado ou estornado depois). Recalcule antes de '
          'pagar.',
    ],
  ),
  ToneScreen(
    'Fechar o repasse · chamada aberta e ajuste sem motivo',
    (tester, theme) async {
      await _openTeacherPayout(tester, theme, _payoutRepo(pending: 2));
      await _tap(tester, find.text('Fechar mês'));
      await tester.enterText(find.widgetWithText(TextField, '0'), '-40');
      await tester.pump();
      await _tap(tester, find.widgetWithText(FilledButton, 'Fechar mês').last);
    },
    _sheet,
    [
      '2 aula(s) do mês estão com a chamada aberta e não entram. Feche a '
          'chamada antes, se for o caso.',
      'Explique o ajuste (ex.: aula cancelada pelo professor).',
    ],
  ),
  ToneScreen(
    'Modelo de repasse · valor inválido',
    (tester, theme) async {
      await _openTeacherPayout(tester, theme, _payoutRepo());
      await _tap(tester, find.text('Alterar'));
      await tester.enterText(
        find.descendant(of: _sheet, matching: find.byType(TextField)),
        '150',
      );
      await tester.pump();
      await _tap(tester, find.text('Salvar repasse'));
    },
    _sheet,
    ['Informe um percentual entre 0 e 100.'],
  ),
  ToneScreen(
    'Registrar pagamento do repasse · erro',
    (tester, theme) async {
      await _openTeacherPayout(
        tester,
        theme,
        _payoutRepo(
          payouts: [payout(month: '2026-09', computed: 960)],
          throwing: true,
        ),
      );
      await _tap(tester, find.text('Registrar pagamento'));
      await _tap(tester, find.text('Confirmar pagamento'));
    },
    _sheet,
    ['Repasse já registrado.'],
  ),

  // ── Matrícula ─────────────────────────────────────────────────────────
  ToneScreen(
    'Matrícula · horários',
    (tester, theme) async {
      await pumpTonePage(
        tester,
        theme,
        const ArenaClassEnrollPage(seed: _seed),
        overrides: _aulas(
          repo: FakeArenaClassRepository(
            classes: [
              _cls(
                id: 'c2',
                name: 'Intermediário B',
                weekdays: const [1, 2, 4],
                capacity: 1,
              ),
            ],
            // Terça lotada (1 vaga, 1 aluno); segunda e quinta livres.
            students: [
              student('x', 'Xavier', classId: 'c2', weekdays: const [2]),
            ],
          ),
          enrollmentRepo: FakeArenaClassEnrollmentRepository(
            plans: [plan(id: 'm1', name: 'Mensal 1x/semana', perWeek: 1)],
          ),
        ),
      );
      await _tap(tester, find.text('Continuar'));
      await _tap(tester, find.text('Mensal 1x/semana'));
      await _tap(tester, find.text('Continuar'));
      await _tap(tester, find.textContaining('Seg · 18:00'));
      await _tap(tester, find.textContaining('Qui · 18:00'));
    },
    find.byType(ArenaClassEnrollPage),
    [
      'Lotada',
      '1 vaga',
      'Este plano tem 1 aula por semana — desmarque o horário atual para '
          'trocar.',
    ],
  ),
  ToneScreen(
    'Matrícula · prévia com erro',
    (tester, theme) => _enrollToPayment(
      tester,
      theme,
      _ThrowingEnrollmentRepository(plans: [_package], failPreview: true),
    ),
    find.byType(ArenaClassEnrollPage),
    ['Não foi possível calcular a cobrança. Tente de novo.'],
  ),
  ToneScreen(
    'Matrícula · taxa isenta e erro ao matricular',
    (tester, theme) async {
      await _enrollToPayment(
        tester,
        theme,
        _ThrowingEnrollmentRepository(
          plans: [_package],
          rules: const ArenaClassRules(enrollmentFeeReais: 50),
          preview: _packagePreview,
        ),
      );
      await _tap(tester, find.byType(Switch));
      await _tap(tester, find.text('Matricular'));
    },
    find.byType(ArenaClassEnrollPage),
    ['Isenta', 'Turma lotada na quinta.'],
  ),
  ToneScreen(
    'Matrícula · CPF inválido',
    (tester, theme) async {
      await _enrollToPayment(
        tester,
        theme,
        FakeArenaClassEnrollmentRepository(
          plans: [_package],
          rules: const ArenaClassRules(onlineBillingEnabled: true),
          preview: _packagePreview,
        ),
      );
      await tester.enterText(
        find.widgetWithText(TextField, '000.000.000-00'),
        '11111111111',
      );
      await tester.pump();
    },
    find.byType(ArenaClassEnrollPage),
    ['CPF inválido'],
  ),
  ToneScreen(
    'Matrícula feita',
    (tester, theme) async {
      await _enrollToPayment(
        tester,
        theme,
        FakeArenaClassEnrollmentRepository(
          plans: [_package],
          preview: _packagePreview,
        ),
      );
      await _tap(tester, find.text('Transferência'));
      await _tap(tester, find.text('Matricular'));
    },
    find.byType(ArenaClassEnrollPage),
    [Icons.check_rounded, 'Em aberto · ${formatBRL(360)}'],
  ),
  ToneScreen(
    'Matrícula feita · fatura online com falha',
    (tester, theme) async {
      await _enrollToPayment(
        tester,
        theme,
        FakeArenaClassEnrollmentRepository(
          plans: [_package],
          rules: const ArenaClassRules(onlineBillingEnabled: true),
          preview: _packagePreview,
          charges: [
            charge(
              id: 'e-new_2026-10',
              studentId: 'u7',
              name: 'Marina Teles',
              amount: 360,
              dueDate: _today,
              asaas: invoice(
                groupId: 'e-new_first',
                state: ArenaClassAsaasState.failed,
                url: null,
                status: null,
              ),
            ),
          ],
        ),
        seed: const ArenaClassEnrollSeed(
          athleteId: 'u7',
          name: 'Marina Teles',
          phone: '62988887777',
        ),
      );
      await _tap(tester, find.text('Matricular'));
    },
    find.byType(ArenaClassEnrollPage),
    [Icons.info_outline_rounded, 'Online · ${formatBRL(360)}'],
  ),
];

void main() => stateToneScreensTests(arenaAulasToneScreens);
