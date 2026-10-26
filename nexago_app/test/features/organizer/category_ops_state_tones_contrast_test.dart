import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/active_role_providers.dart';
import 'package:nexago_app/core/auth/app_mobile_role.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/location/br_locations_data.dart';
import 'package:nexago_app/features/organizer/data/organizer_category_ops_repository.dart';
import 'package:nexago_app/features/organizer/data/organizer_category_ops_service.dart';
import 'package:nexago_app/features/organizer/data/organizer_leagues_repository.dart';
import 'package:nexago_app/features/organizer/data/organizer_public_profile_editor_repository.dart';
import 'package:nexago_app/features/organizer/data/organizer_wallet_repository.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_logic.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/domain/league_create/league_create_providers.dart';
import 'package:nexago_app/features/organizer/domain/league_stage_create/league_stage_create_providers.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_providers.dart';
import 'package:nexago_app/features/organizer/domain/organizer_wallet_providers.dart';
import 'package:nexago_app/features/organizer/domain/public_profile/organizer_profile_editor_logic.dart';
import 'package:nexago_app/features/organizer/domain/public_profile/organizer_profile_editor_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_app_payout.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_logic.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_logic.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_staff/my_tournament_staff_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_uniforms/tournament_uniforms_models.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/organizer_category_generate_koc_page.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/sheets/organizer_team_actions_sheet.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/tabs/organizer_category_payments_tab.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/tabs/organizer_tournament_financial_tab.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/tabs/organizer_tournament_matches_tab.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/widgets/organizer_bracket_seed_preview.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/widgets/organizer_category_shell_header.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/widgets/organizer_group_draw_widgets.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/widgets/organizer_team_list_tile.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/widgets/organizer_tournament_category_card.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/widgets/organizer_tournament_header.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/widgets/uniforms/organizer_uniforms_athlete_tile.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/widgets/uniforms/organizer_uniforms_kpi_row.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/widgets/uniforms/organizer_uniforms_size_panel.dart';
import 'package:nexago_app/features/organizer/presentation/league_create/sheets/organizer_league_actions_sheet.dart';
import 'package:nexago_app/features/organizer/presentation/organizer_financial_page.dart';
import 'package:nexago_app/features/organizer/presentation/organizer_home_page.dart';
import 'package:nexago_app/features/organizer/presentation/public_profile/organizer_public_profile_editor_page.dart';
import 'package:nexago_app/features/organizer/presentation/sheets/organizer_settings_sheet.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/steps/tournament_create_categories_page.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/steps/tournament_create_prizes_page.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/steps/tournament_create_registration_page.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/widgets/organizer_category_cards.dart';
import 'package:nexago_app/features/organizer/presentation/widgets/organizer_wizard_exit_dialog.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

import '../../core/theme/state_tone_screens.dart';

// Verde, vermelho e âmbar do organizador (operação da categoria: inscritas,
// folha de ações, pagamentos, financeiro, jogos, chave, pódio, uniformes; home,
// financeiro, criação de torneio/liga, ajustes e editor do perfil público),
// conferidos contra o fundo real nos dois temas. No claro os crus do AppColors
// reprovam: são ~1,6–3,5:1 no branco.

// ── Fakes ───────────────────────────────────────────────────────────────

/// Serviço de callables que nunca encosta em FirebaseFunctions.
class _FakeCategoryOpsService implements OrganizerCategoryOpsService {
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

/// Repositório da categoria: só a leitura da config do KOTC responde.
class _FakeCategoryOpsRepository implements OrganizerCategoryOpsRepository {
  @override
  Future<Map<String, dynamic>?> getCategory({
    required String tournamentId,
    required String categoryId,
  }) async =>
      const <String, dynamic>{};

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

class _FakeLeaguesRepository implements OrganizerLeaguesRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

class _FakeEditorRepository implements OrganizerPublicProfileEditorRepository {
  @override
  Future<void> save(String uid, Map<String, Object> update) async {}

  @override
  Future<String> uploadLogo(String uid, Uint8List jpegBytes) async => '';

  @override
  Future<String> uploadCover(String uid, Uint8List jpegBytes) async => '';

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Carteira sem Firebase: a vista vem pronta e o saldo ao vivo nunca emite.
class _FakeWalletRepository implements OrganizerWalletRepository {
  _FakeWalletRepository(this.view);

  final OrganizerWalletView view;

  /// Quando não-nulo, a recarga estoura (o aviso de dado velho).
  Object? loadError;

  final _live = StreamController<TournamentCashBox?>.broadcast();

  @override
  Future<OrganizerWalletView> loadWalletView({
    String? tournamentId,
    int? ledgerLimit,
  }) async {
    final error = loadError;
    if (error != null) throw error;
    return view;
  }

  @override
  Future<OrganizerWithdrawalRequestResult> requestWithdrawal({
    required String tournamentId,
    required double amountReais,
  }) async {
    return const OrganizerWithdrawalRequestResult(
      withdrawalId: 'w9',
      status: 'approved',
      payoutStatus: 'sent',
      autoProcessed: true,
    );
  }

  @override
  Future<OrganizerPayoutProfile> setPayoutPixKey({
    required String pixKey,
    required String pixKeyType,
  }) async =>
      OrganizerPayoutProfile.empty;

  @override
  Stream<TournamentCashBox?> watchCashBox(String tournamentId) => _live.stream;

  @override
  Stream<List<TournamentLedgerCredit>> watchLedgerCredits(
    String tournamentId,
  ) =>
      const Stream.empty();
}

/// Wizard do torneio com estado semeado e sem o timer de persistência (que
/// bate em `FirebaseAuth.instance`).
class _SeededTournamentWizard extends TournamentCreateWizardNotifier {
  _SeededTournamentWizard(this.seed);

  final TournamentCreateWizardState seed;

  @override
  TournamentCreateWizardState build() => seed;

  @override
  void setCurrentStep(TournamentCreateStep step) {
    state = state.copyWith(currentStep: step);
  }

  @override
  Future<void> tryRestoreFromLocal() async {}
}

class _NoRestoreLeagueWizard extends LeagueCreateWizardNotifier {
  @override
  Future<void> tryRestoreFromLocal() async {}
}

class _NoRestoreStageWizard extends LeagueStageCreateWizardNotifier {
  @override
  Future<void> tryRestoreAnyFromLocal() async {}
}

class _OrganizerRole extends ActiveMobileRoleNotifier {
  @override
  AppMobileRole? build() => AppMobileRole.organizer;
}

// ── Fixtures ────────────────────────────────────────────────────────────

const _tid = 't1';
const _cid = 'open';
const _key = OrganizerCategoryKey(tournamentId: _tid, categoryId: _cid);

OrganizerCategoryTeamRow _team({
  String registrationId = 'reg-1',
  String teamId = 'team-1',
  String name1 = 'Marcos Lima',
  String name2 = 'Victor Sá',
  OrganizerTeamRegistrationStatus status =
      OrganizerTeamRegistrationStatus.confirmed,
  int paidAmountCents = 10000,
  List<String> lgpdAcceptedUids = const ['p1', 'p2'],
  String? cancellationRequestReason,
  List<String> sharePaidUids = const [],
  List<String> organizerConfirmedShareUids = const [],
  DateTime? declaredPaidAt,
}) {
  return OrganizerCategoryTeamRow(
    registrationId: registrationId,
    teamId: teamId,
    player1: OrganizerCategoryPlayerInfo(uid: 'p1', name: name1),
    player2: OrganizerCategoryPlayerInfo(uid: 'p2', name: name2),
    status: status,
    paidAmountCents: paidAmountCents,
    expectedAmountCents: 10000,
    lgpdAcceptedUids: lgpdAcceptedUids,
    cancellationRequestReason: cancellationRequestReason,
    sharePaidUids: sharePaidUids,
    organizerConfirmedShareUids: organizerConfirmedShareUids,
    declaredPaidAt: declaredPaidAt,
  );
}

final _paidWithCancellation = _team(cancellationRequestReason: 'Lesão');

final _halfPaid = _team(
  status: OrganizerTeamRegistrationStatus.pending,
  paidAmountCents: 5000,
  lgpdAcceptedUids: const ['p1'],
  sharePaidUids: const ['p1'],
  organizerConfirmedShareUids: const ['p1'],
);

final _declaredByAthlete = _team(
  status: OrganizerTeamRegistrationStatus.pending,
  sharePaidUids: const ['p1', 'p2'],
  organizerConfirmedShareUids: const ['p1'],
);

/// LGPD parcial: o selo LGPD sai âmbar (o verde fica fora, ver a lista).
final _awaitsVerification = _team(
  lgpdAcceptedUids: const ['p1'],
  sharePaidUids: const ['p1', 'p2'],
  declaredPaidAt: DateTime(2026, 8, 20),
);

const _paymentsSummary = OrganizerCategoryPaymentsSummary(
  paidCount: 1,
  pendingCount: 1,
  totalSlots: 8,
  viaAppCents: 10000,
  expectedCents: 20000,
);

const _fullCategory = OrganizerTournamentCategorySummary(
  categoryId: 'open',
  name: 'Open',
  maxTeams: 4,
  enrolledCount: 5,
  paidCount: 4,
  pendingCount: 1,
);

const _publishedCategory = OrganizerTournamentCategorySummary(
  categoryId: 'open',
  name: 'Open',
  maxTeams: 4,
  enrolledCount: 4,
  paidCount: 4,
  bracketStatus: OrganizerCategoryBracketStatus.published,
);

const _financialSummary = OrganizerTournamentSummary(
  tournamentId: _tid,
  name: 'Copa Areia',
  enrolledCount: 3,
  pendingCount: 2,
  paymentsBreakdown: OrganizerPaymentsBreakdown(
    viaAppCents: 30000,
    viaOrganizerCents: 15000,
  ),
);

/// Extrato do caixa do torneio acima: as duas inscrições pelo app creditadas,
/// com a taxa saindo do organizador.
const _financialLedger = [
  TournamentLedgerCredit(
    registrationId: 'r1',
    grossCents: 15000,
    netCents: 13800,
    organizerFeeCents: 1200,
  ),
  TournamentLedgerCredit(
    registrationId: 'r2',
    grossCents: 15000,
    netCents: 13800,
    organizerFeeCents: 1200,
  ),
];

const _financialCategory = OrganizerTournamentCategorySummary(
  categoryId: 'open',
  name: 'Open',
  paidCount: 4,
  pendingCount: 1,
  collectedCents: 40000,
);

TournamentMatch _match(
  String id, {
  required String status,
  String matchType = 'Group',
  String teamAId = 'tA',
  String teamBId = 'tB',
  String? winnerId,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: _tid,
    categoryId: _cid,
    round: 1,
    matchType: matchType,
    poolId: '',
    teamAId: teamAId,
    teamBId: teamBId,
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: false,
    matchNumber: 1,
    winnerId: winnerId,
    teamADescription: 'Ana / Bia',
    teamBDescription: 'Carla / Duda',
  );
}

const _uniformsSummary = OrganizerUniformsSummary(
  totalAthletes: 11,
  confirmedCount: 8,
  pendingCount: 3,
  countBySize: {'P': 3, 'M': 5},
  pendingWithoutSize: 3,
  sizeOrder: ['P', 'M'],
);

const _profile = OrganizerProfileSource(
  orgName: 'Liga Amadora Goiânia',
  bio: 'Ligas de areia.',
  city: 'Goiânia',
  state: 'GO',
  contactPhone: '62999990000',
  publicWhatsapp: true,
  coverUrl: 'https://x/cover.jpg',
);

TournamentCashBox _cashBox({double pending = 0}) => TournamentCashBox(
      tournamentId: 'a',
      tournamentName: 'Etapa Aurora',
      availableReais: 1000,
      pendingReais: pending,
    );

OrganizerWithdrawalItem _withdrawal(
  String id,
  String status, {
  String? payoutStatus,
}) {
  return OrganizerWithdrawalItem(
    id: id,
    amountReais: 50,
    status: status,
    payoutStatus: payoutStatus,
    pixKey: '',
    createdAt: DateTime(2026, 9, 10),
    requestedBy: 'u1',
  );
}

const _payout = OrganizerPayoutProfile(
  pixKey: 'antigo@nexago.app',
  pixKeyType: 'EMAIL',
  hasPixKey: true,
);

const _category = TournamentCategoryDraft(id: 'c1', name: 'Masculino A');

TournamentCreateWizardState _wizard(TournamentCreateDraft draft) =>
    TournamentCreateWizardState(draft: draft);

// ── Aberturas ───────────────────────────────────────────────────────────

/// Monta um botão que abre [open] (folha ou diálogo) e toca nele.
Future<void> _openFromButton(
  WidgetTester tester,
  ThemeData theme,
  void Function(BuildContext context, WidgetRef ref) open, {
  List<Override> overrides = const [],
}) async {
  await pumpTonePiece(
    tester,
    theme,
    Consumer(
      builder: (context, ref, _) => FilledButton(
        onPressed: () => open(context, ref),
        child: const Text('abrir'),
      ),
    ),
    overrides: overrides,
  );
  await tester.tap(find.text('abrir'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 800));
}

Future<void> _openTeamActions(
  WidgetTester tester,
  ThemeData theme,
  OrganizerCategoryTeamRow team,
) {
  return _openFromButton(
    tester,
    theme,
    (context, _) => showOrganizerTeamActionsSheet(
      context,
      tournamentId: _tid,
      categoryId: _cid,
      team: team,
      rank: 4,
    ),
    overrides: [
      organizerCategoryOpsServiceProvider
          .overrideWithValue(_FakeCategoryOpsService()),
      organizerCategoryRegistrationsProvider(_key)
          .overrideWith((ref) => Stream.value([team])),
    ],
  );
}

Future<void> _openFinancialPage(
  WidgetTester tester,
  ThemeData theme,
  _FakeWalletRepository repo,
) async {
  addTearDown(repo._live.close);
  await pumpTonePage(
    tester,
    theme,
    const OrganizerFinancialPage(),
    overrides: [
      organizerWalletRepositoryProvider.overrideWithValue(repo),
      currentOrganizerIdProvider.overrideWithValue('u1'),
    ],
  );
  await tester.pumpAndSettle();
}

List<Override> _wizardOverrides(TournamentCreateDraft draft) => [
      tournamentCreateWizardProvider
          .overrideWith(() => _SeededTournamentWizard(_wizard(draft))),
    ];

final _bottomSheet = find.byType(BottomSheet);

/// Páginas com rótulo longo em linha (botão do rodapé, título do card do
/// KOTC): na fonte de teste, de glifo quadrado, 402 px estouram o Row.
const _wide = Size(800, 1400);

/// Fileiras de KPI têm card de largura e altura fixas: na fonte de teste o
/// rótulo quebra e a coluna estoura. A escala menor vale nos dois temas.
Widget _compactText(Widget child) => Builder(
      builder: (context) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: const TextScaler.linear(0.8),
        ),
        child: child,
      ),
    );

final List<ToneScreen> organizerCategoryOpsToneScreens = [
  // ── Lista de inscritas ──
  // Fora da conferência, de propósito (ver o relatório):
  // - pílula CANCELAMENTO: no escuro (a referência, que não muda) o vermelho
  //   dela dá 4,45:1 sobre o próprio fundo translúcido; no claro, 4,58:1;
  // - texto dos selos verdes "Pago"/"LGPD": no claro, o verde do tema sobre
  //   o verde a 18% da superfície elevada dá 4,496:1 (o cru dava ~1,9:1).
  //   Aqui só os ícones deles, que pedem 3:1.
  ToneScreen(
    'Inscritas: paga e LGPD completo (ícones)',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      OrganizerTeamListTile(team: _team(), rank: 1, onTap: () {}),
    ),
    find.descendant(of: tonePiece, matching: find.byType(Icon)),
    const [Icons.check_rounded, Icons.verified_user_rounded],
  ),
  ToneScreen(
    'Inscritas: metade paga e LGPD parcial',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      OrganizerTeamListTile(team: _halfPaid, rank: 2, onTap: () {}),
    ),
    tonePiece,
    const [
      Icons.schedule_rounded,
      '1/2 PAGO',
      Icons.pie_chart_outline_rounded,
      'LGPD',
      Icons.shield_outlined,
    ],
  ),
  ToneScreen(
    'Inscritas: pagamento a conferir',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      OrganizerTeamListTile(team: _awaitsVerification, rank: 5, onTap: () {}),
    ),
    tonePiece,
    const ['A conferir', Icons.fact_check_outlined],
  ),

  // ── Folha de ações da dupla ──
  ToneScreen(
    'Folha de ações: paga e com pedido de cancelamento',
    (tester, theme) => _openTeamActions(tester, theme, _paidWithCancellation),
    _bottomSheet,
    const [
      'Pago',
      Icons.check_rounded,
      Icons.event_busy_rounded,
      Icons.delete_outline_rounded,
      'Remover da categoria',
    ],
  ),
  ToneScreen(
    'Folha de ações: pagamento parcial',
    (tester, theme) => _openTeamActions(tester, theme, _halfPaid),
    _bottomSheet,
    const [
      'Pendente',
      Icons.schedule_rounded,
      Icons.check_circle_rounded,
      'Confirmado por você',
      Icons.info_outline_rounded,
      'Pagamento parcial',
    ],
  ),
  ToneScreen(
    'Folha de ações: atleta declarou o pagamento',
    (tester, theme) => _openTeamActions(tester, theme, _declaredByAthlete),
    _bottomSheet,
    const [
      Icons.hourglass_bottom_rounded,
      'Declarado pelo atleta · aguardando conferência',
    ],
  ),
  ToneScreen(
    'Folha de ações: a conferir',
    (tester, theme) => _openTeamActions(tester, theme, _awaitsVerification),
    _bottomSheet,
    const ['A conferir', Icons.fact_check_outlined],
  ),

  // ── Gerar rodadas KOTC ──
  ToneScreen(
    'Gerar rodadas KOTC: configuração não fecha',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const OrganizerCategoryGenerateKocPage(
        tournamentId: _tid,
        categoryId: _cid,
      ),
      size: _wide,
      overrides: [
        organizerCategoryOpsRepositoryProvider
            .overrideWithValue(_FakeCategoryOpsRepository()),
        organizerCategoryRegistrationsProvider(_key)
            .overrideWith((ref) => Stream.value(const [])),
        organizerCategoryOpsProvider(_key)
            .overrideWith((ref) => Stream.value(const CategoryOpsState())),
      ],
    ),
    find.byType(OrganizerCategoryGenerateKocPage),
    const [Icons.error_outline],
  ),

  // ── Pagamentos da categoria ──
  // O botão "Cobrar" (âmbar sobre o laranja a 18% da superfície elevada) fica
  // fora: no claro dá 4,31:1 com o tom do tema (o cru dava ~1,5:1).
  ToneScreen(
    'Pagamentos da categoria: arrecadado e recebidas',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const Scaffold(
        body: OrganizerCategoryPaymentsTab(
          tournamentId: _tid,
          categoryId: _cid,
        ),
      ),
      overrides: [
        organizerSeesTournamentMoneyProvider(_tid).overrideWithValue(true),
        organizerTournamentLedgerCreditsProvider(_tid)
            .overrideWith((ref) => Stream.value(const [])),
        organizerCategoryPaymentsProvider(_key)
            .overrideWithValue(_paymentsSummary),
        organizerCategoryVisibleTeamsProvider(_key).overrideWithValue(
          AsyncValue.data([_team()]),
        ),
      ],
    ),
    find.byType(OrganizerCategoryPaymentsTab),
    [
      'ARRECADADO NESTA CATEGORIA',
      '${formatOrganizerMoneyDetail(_paymentsSummary.outstandingCents)} em aberto',
      formatOrganizerMoneyDetail(teamDisplayAmountCents(_team())),
    ],
  ),
  ToneScreen(
    'Pagamentos da categoria: cobrar todas as pendentes',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const Scaffold(
        body: OrganizerCategoryPaymentsTab(
          tournamentId: _tid,
          categoryId: _cid,
        ),
      ),
      overrides: [
        organizerSeesTournamentMoneyProvider(_tid).overrideWithValue(false),
        organizerCategoryPaymentsProvider(_key)
            .overrideWithValue(_paymentsSummary),
        organizerCategoryVisibleTeamsProvider(_key).overrideWithValue(
          AsyncValue.data([
            _team(
              status: OrganizerTeamRegistrationStatus.pending,
              paidAmountCents: 0,
            ),
          ]),
        ),
      ],
    ),
    find
        .ancestor(of: find.text('Cobrar todas'), matching: find.byType(Row))
        .first,
    const ['Cobrar todas'],
  ),

  // ── Financeiro do torneio (aba) ──
  ToneScreen(
    'Financeiro do torneio',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const Scaffold(
        body: OrganizerTournamentFinancialTab(
          summary: _financialSummary,
          categories: [_financialCategory],
          ledgerCredits: AsyncValue.data(_financialLedger),
        ),
      ),
    ),
    find.byType(OrganizerTournamentFinancialTab),
    [
      '3',
      '2',
      // Taxa nexaGO do extrato (a parte do organizador), não um percentual.
      formatOrganizerMoneyDetail(2400),
      Icons.payments_outlined,
      'SEM TAXA',
      '4 pagas',
      '1 pend.',
      'marca',
    ],
  ),

  // ── Partidas do torneio ──
  ToneScreen(
    'Partidas: ao vivo e concluídas',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const Scaffold(body: OrganizerTournamentMatchesTab(tournamentId: _tid)),
      overrides: [
        organizerTournamentMatchesProvider(_tid).overrideWith(
          (ref) => Stream.value([
            _match('m1', status: TournamentMatchStatus.inProgress),
            _match('m2', status: TournamentMatchStatus.completed),
            _match('m3', status: TournamentMatchStatus.completed),
            _match('m4', status: TournamentMatchStatus.scheduled),
          ]),
        ),
      ],
    ),
    find.byType(OrganizerTournamentMatchesTab),
    const ['1', '2'],
  ),

  // ── Chave ──
  ToneScreen(
    'Prévia da chave: BYE',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      OrganizerBracketSeedPreview(
        teams: [
          _team(teamId: 't1'),
          _team(teamId: 't2', name1: 'Ana', name2: 'Bia'),
          _team(teamId: 't3', name1: 'Carla', name2: 'Duda'),
        ],
      ),
    ),
    tonePiece,
    const ['BYE'],
  ),
  ToneScreen(
    'Sorteio de grupos: ponto de quem classifica',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      OrganizerGroupDrawCard(
        group: const CategoryGroupPreview(id: 'A', teamIds: ['t1', 't2']),
        teamsById: {
          't1': _team(teamId: 't1'),
          't2': _team(teamId: 't2', name1: 'Ana', name2: 'Bia'),
        },
        qualifiersPerGroup: 1,
        primaryHeadCount: 0,
        overallRankByTeamId: const {},
      ),
    ),
    tonePiece,
    const ['marca'],
  ),
  // ── Cabeçalhos e cards da categoria / torneio ──
  ToneScreen(
    'KPIs da categoria',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      _compactText(
        const OrganizerCategoryKpiRow(
          confirmedCount: 6,
          pendingCount: 2,
          waitlistCount: 1,
          collectedCents: 60000,
        ),
      ),
    ),
    tonePiece,
    ['6', formatOrganizerMoneyCents(60000)],
  ),
  ToneScreen(
    'Card da categoria: lotada',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      OrganizerTournamentCategoryCard(
        category: _fullCategory,
        onTap: () {},
        onGenerateBracket: () {},
      ),
    ),
    tonePiece,
    const [
      'Lotado',
      'marca',
      Icons.check_circle_outline_rounded,
      Icons.schedule_rounded,
    ],
  ),
  ToneScreen(
    'Card da categoria: chave publicada',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      OrganizerTournamentCategoryCard(
        category: _publishedCategory,
        onTap: () {},
        onGenerateBracket: () {},
      ),
    ),
    tonePiece,
    const ['Chave publicada · ver jogos'],
  ),
  ToneScreen(
    'Cabeçalho do torneio: inscrições abertas',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const OrganizerTournamentHeader(
        summary: OrganizerTournamentSummary(tournamentId: _tid, name: 'Copa'),
      ),
    ),
    tonePiece,
    const ['Inscrições abertas', 'marca'],
  ),
  ToneScreen(
    'Cabeçalho do torneio: inscrições encerradas',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const OrganizerTournamentHeader(
        summary: OrganizerTournamentSummary(
          tournamentId: _tid,
          name: 'Copa',
          listingStatus: 'closed',
        ),
      ),
    ),
    tonePiece,
    const ['Inscrições encerradas', 'marca'],
  ),
  ToneScreen(
    'KPIs do torneio: arrecadado',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      _compactText(
        const OrganizerTournamentKpiRow(
          summary: OrganizerTournamentSummary(
            tournamentId: _tid,
            name: 'Copa',
            collectedCents: 90000,
          ),
        ),
      ),
    ),
    tonePiece,
    [formatOrganizerMoneyCents(90000)],
  ),

  // ── Uniformes ──
  ToneScreen(
    'Uniformes: atleta sem escolha',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const OrganizerUniformsAthleteTile(
        row: OrganizerUniformAthleteRow(
          athleteUid: 'p1',
          athleteName: 'Marcos',
          initials: 'ML',
          categoryId: _cid,
          categoryLabel: 'Open',
          partnerShortName: 'Victor',
          isComplete: false,
        ),
      ),
    ),
    tonePiece,
    const ['PENDENTE'],
  ),
  ToneScreen(
    'Uniformes: KPIs com filtro de pendentes',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      OrganizerUniformsKpiRow(
        summary: _uniformsSummary,
        pendingFilterActive: true,
        onPendingTap: () {},
      ),
    ),
    tonePiece,
    const ['8', '3', 'FILTR. ATIVO'],
  ),
  ToneScreen(
    'Uniformes: painel por tamanho',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      OrganizerUniformsSizePanel(
        summary: _uniformsSummary,
        selectedSize: null,
        pendingFilterActive: false,
        onSizeSelected: (_) {},
        onPendingSelected: () {},
        onClearFilters: () {},
      ),
    ),
    tonePiece,
    const ['PEND. 3'],
  ),

  // ── Liga ──
  ToneScreen(
    'Ações da liga: cancelar',
    (tester, theme) => _openFromButton(
      tester,
      theme,
      (context, _) => showOrganizerLeagueActionsSheet(
        context,
        leagueId: 'l1',
        league: const {'name': 'Liga Sol', 'listingStatus': 'open'},
      ),
      overrides: [
        organizerLeaguesRepositoryProvider
            .overrideWithValue(_FakeLeaguesRepository()),
      ],
    ),
    _bottomSheet,
    const ['Cancelar liga', Icons.cancel_outlined],
  ),

  // ── Financeiro (caixa) ──
  ToneScreen(
    'Financeiro: saldo, extrato e saques',
    (tester, theme) => _openFinancialPage(
      tester,
      theme,
      _FakeWalletRepository(
        OrganizerWalletView(
          cashBoxes: [_cashBox(pending: 120)],
          selected: _cashBox(pending: 120),
          payout: _payout,
          ledger: [
            OrganizerLedgerEntry(
              id: 'l1',
              netReais: 100,
              grossReais: 106.38,
              platformFeeReais: 6.38,
              createdAt: DateTime(2026, 9, 10),
              athleteLabel: 'Ana & Bia',
            ),
          ],
          withdrawals: [
            _withdrawal('w1', 'approved', payoutStatus: 'paid'),
            _withdrawal('w2', 'rejected', payoutStatus: 'failed'),
            _withdrawal('w3', 'pending'),
          ],
        ),
      ),
    ),
    find.byType(OrganizerFinancialPage),
    [
      '${formatBRL(120)} em processamento',
      '+ ${formatBRL(100)}',
      'Pago',
      'Falhou',
      'Pendente',
    ],
  ),
  ToneScreen(
    'Financeiro: aviso de dado desatualizado',
    (tester, theme) async {
      final repo = _FakeWalletRepository(
        OrganizerWalletView(
          cashBoxes: [_cashBox()],
          selected: _cashBox(),
          payout: _payout,
          ledger: const [],
          withdrawals: const [],
        ),
      );
      await _openFinancialPage(tester, theme, repo);
      // 1º saque fixa a seleção e recarrega bem; o 2º recarrega com falha.
      for (final fail in [false, true]) {
        repo.loadError = fail ? Exception('deadline exceeded') : null;
        await tester.enterText(find.byType(TextField), '20');
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('Solicitar saque'));
        await tester.tap(find.text('Solicitar saque'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
      }
      await tester.pumpAndSettle();
    },
    find.byType(OrganizerFinancialPage),
    const [Icons.warning_amber_rounded],
  ),

  // ── Home ──
  ToneScreen(
    'Home do organizador: arrecadado do evento',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const OrganizerHomePage(),
      overrides: [
        hasMultipleMobileRolesProvider.overrideWithValue(false),
        managedOrganizerTournamentsProvider.overrideWith(
          (ref) => Stream.value(const [
            {
              'id': _tid,
              'name': 'Copa Areia',
              'listingStatus': 'closed',
              'collectedCents': 45000,
            },
          ]),
        ),
        managedOrganizerLeaguesProvider
            .overrideWith((ref) => Stream.value(const [])),
        myTournamentStaffEntriesProvider
            .overrideWith((ref) => Stream.value(const [])),
        tournamentCreateWizardProvider.overrideWith(
          () => _SeededTournamentWizard(const TournamentCreateWizardState()),
        ),
        leagueCreateWizardProvider.overrideWith(_NoRestoreLeagueWizard.new),
        leagueStageCreateWizardProvider.overrideWith(_NoRestoreStageWizard.new),
      ],
    ),
    find.byType(OrganizerHomePage),
    [formatBRL(450)],
  ),

  // ── Perfil público ──
  ToneScreen(
    'Editor do perfil público: erro de campo',
    (tester, theme) async {
      await tester.runAsync(BrLocationsData.load);
      await pumpTonePage(
        tester,
        theme,
        const OrganizerPublicProfileEditorPage(),
        size: const Size(430, 2600),
        overrides: [
          organizerEditorUidProvider.overrideWithValue('org-1'),
          organizerProfileSourceProvider
              .overrideWith((ref) => Stream.value(_profile)),
          organizerPublicProfileEditorRepositoryProvider
              .overrideWithValue(_FakeEditorRepository()),
        ],
      );
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Liga Amadora Goiânia'),
        'A',
      );
      await tester.pump();
      await tester.ensureVisible(find.text('Salvar perfil'));
      await tester.tap(find.text('Salvar perfil'));
      await tester.pumpAndSettle();
    },
    find.byType(OrganizerPublicProfileEditorPage),
    const ['Use pelo menos 2 caracteres.'],
  ),

  // ── Ajustes ──
  ToneScreen(
    'Ajustes do organizador: sair da conta',
    (tester, theme) => _openFromButton(
      tester,
      theme,
      (context, ref) => showOrganizerSettingsSheet(context, ref),
      overrides: [
        hasMultipleMobileRolesProvider.overrideWithValue(false),
        activeMobileRoleProvider.overrideWith(_OrganizerRole.new),
      ],
    ),
    _bottomSheet,
    const ['Sair da conta', Icons.logout_rounded],
  ),

  // ── Criação de torneio ──
  ToneScreen(
    'Categorias do torneio: remover',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      OrganizerCategoryCard(
        category: _category,
        formatLabel: '',
        onEdit: () {},
        onRemove: () {},
      ),
    ),
    tonePiece,
    const [Icons.delete_outline_rounded],
  ),
  ToneScreen(
    'Categorias do torneio: diálogo de remover',
    (tester, theme) async {
      await pumpTonePage(
        tester,
        theme,
        const TournamentCreateCategoriesPage(),
        size: _wide,
        overrides: _wizardOverrides(
          const TournamentCreateDraft(categories: [_category]),
        ),
      );
      await tester.tap(find.byIcon(Icons.delete_outline_rounded));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 800));
    },
    find.byType(AlertDialog),
    const ['Remover'],
  ),
  ToneScreen(
    'Premiação do torneio: total',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const TournamentCreatePrizesPage(),
      overrides: _wizardOverrides(
        const TournamentCreateDraft(
          categories: [
            TournamentCategoryDraft(
              id: 'c1',
              name: 'Masculino A',
              prizes: [
                TournamentCategoryPrizeDraft(position: '1', valueCents: 50000),
              ],
            ),
          ],
        ),
      ),
    ),
    find.byType(TournamentCreatePrizesPage),
    ['${formatCents(50000)} no total'],
  ),
  ToneScreen(
    'Inscrições do torneio: janela inválida',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const TournamentCreateRegistrationPage(),
      overrides: _wizardOverrides(
        TournamentCreateDraft(
          registrationOpensAt: DateTime(2026, 11, 10, 9),
          registrationClosesAt: DateTime(2026, 11, 5, 18),
        ),
      ),
    ),
    find.byType(TournamentCreateRegistrationPage),
    const [Icons.warning_amber_rounded],
  ),
  ToneScreen(
    'Sair do cadastro: descartar',
    (tester, theme) => _openFromButton(
      tester,
      theme,
      (context, _) => showOrganizerWizardExitDialog(context),
    ),
    find.byType(Dialog),
    const ['Descartar e sair', Icons.delete_outline_rounded],
  ),
];

void main() => stateToneScreensTests(organizerCategoryOpsToneScreens);
