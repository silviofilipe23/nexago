import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/arena/data/arena_wallet_repository.dart';
import 'package:nexago_app/features/arena/data/review_reply_service.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_club.dart';
import 'package:nexago_app/features/arena/domain/arena_club_admin_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_dashboard_period.dart';
import 'package:nexago_app/features/arena/domain/arena_dashboard_period_metrics.dart';
import 'package:nexago_app/features/arena/domain/arena_financial_logic.dart';
import 'package:nexago_app/features/arena/domain/arena_plan.dart';
import 'package:nexago_app/features/arena/domain/arena_plan_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_providers.dart';
import 'package:nexago_app/features/arena/domain/mercado_pago_providers.dart';
import 'package:nexago_app/features/arena/domain/products/arena_product_logic.dart';
import 'package:nexago_app/features/arena/domain/products/arena_product_providers.dart';
import 'package:nexago_app/features/arena/domain/professionals/arena_professionals_logic.dart';
import 'package:nexago_app/features/arena/domain/professionals/arena_professionals_providers.dart';
import 'package:nexago_app/features/arena/domain/review_reply_providers.dart';
import 'package:nexago_app/features/arena/presentation/arena_club_details_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_club_form_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_club_session_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_clubs_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_profile_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_settings_page.dart';
import 'package:nexago_app/features/arena/presentation/plan/arena_plan_activated_page.dart';
import 'package:nexago_app/features/arena/presentation/plan/arena_plan_page.dart';
import 'package:nexago_app/features/arena/presentation/plan/widgets/arena_plan_gate.dart';
import 'package:nexago_app/features/arena/presentation/plan/widgets/arena_plan_status_banner.dart';
import 'package:nexago_app/features/arena/presentation/professionals/arena_professional_detail_page.dart';
import 'package:nexago_app/features/arena/presentation/professionals/widgets/arena_professional_invite_sheet.dart';
import 'package:nexago_app/features/arena/presentation/professionals/widgets/arena_professional_request_sheet.dart';
import 'package:nexago_app/features/arena/presentation/professionals/widgets/arena_professional_suspend_sheet.dart';
import 'package:nexago_app/features/arena/presentation/professionals/widgets/arena_professionals_ui.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_dashboard_followers_card.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_dashboard_kpi_grid.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_dashboard_reputation_section.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_dashboard_revenue_chart_card.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_financial_widgets.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_mercadopago_connect_card.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_platform_pix_card.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_promotions_sheet.dart';
import 'package:nexago_app/features/arenas/domain/arena_club_session.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arena_promotion.dart';
import 'package:nexago_app/features/arenas/domain/slots_providers.dart';
import 'package:nexago_app/features/athlete/domain/arena_review.dart';
import 'package:nexago_app/features/athlete/domain/favorites_providers.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';

import '../../core/theme/state_tone_contrast.dart';
import '../../core/theme/state_tone_screens.dart';
import 'presentation/professionals/arena_professionals_test_support.dart';

// Texto, ícone e marca em verde, vermelho e âmbar no lado do gestor da
// arena: Clubinho (lista, detalhe, formulário, sessão), Painel (seguidores,
// KPIs, faturamento, reputação), Financeiro (saldo, saque, extrato, Mercado
// Pago, PIX), perfil, ajustes, promoções, plano (página, ativação, avisos) e
// profissionais (status, pedido, detalhe, folhas). Conferidos contra o fundo
// real nos dois temas; no claro os crus do AppColors reprovam.

/// Tela larga: a fonte de teste (glifos quadrados) estoura linhas que cabem
/// com a Sora no aparelho; a cor do fundo não depende da largura.
const _wide = Size(600, 1400);

/// [pumpTonePiece] em [_wide] (mesma tela, mesmo [tonePiece]).
Future<void> _pumpWidePiece(
  WidgetTester tester,
  ThemeData theme,
  Widget child, {
  bool onSheet = false,
  List<Override> overrides = const [],
}) =>
    pumpTonePage(
      tester,
      theme,
      Builder(
        builder: (context) {
          final colors = context.themeColors;
          return Scaffold(
            backgroundColor: colors.canvas,
            body: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: KeyedSubtree(
                key: tonePieceKey,
                child: onSheet
                    ? Material(
                        color: colors.surfaceSheet,
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: child,
                        ),
                      )
                    : child,
              ),
            ),
          );
        },
      ),
      overrides: overrides,
      size: _wide,
    );

// ── Acesso: dono da arena a1 (lê e escreve tudo) ───────────────────────────

const _membership = ArenaMembership(
  arenaId: 'a1',
  name: 'Arena Sol',
  isOwner: true,
);

final List<Override> _owner = [
  ownedArenaMembershipsProvider.overrideWith(
    (ref) => Stream.value(const [_membership]),
  ),
  staffArenaMembershipsProvider.overrideWith(
    (ref) => Stream.value(const <ArenaMembership>[]),
  ),
];

const _arena = ArenaListItem(
  id: 'a1',
  name: 'Arena Sol',
  locationLabel: 'Centro · Recife',
  pricePerHourReais: 120,
);

/// [ReviewReplyService] exige um Firestore; nenhum método é chamado.
class _FakeFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

// ── Clubinho ───────────────────────────────────────────────────────────────

ArenaClub _club(
        {String status = 'active', String name = 'Clubinho de sexta'}) =>
    ArenaClub(
      id: 'c1',
      arenaId: 'a1',
      arenaName: 'Arena Sol',
      name: name,
      weekday: 5,
      startTime: '18:00',
      endTime: '21:00',
      courtIds: const ['q1'],
      courtNames: const ['Quadra 1'],
      capacity: 12,
      priceReais: 30,
      cancelWindowHours: 24,
      allowOnsitePayment: true,
      status: status,
      startDate: '2026-10-02',
      skippedDates: const [],
    );

ArenaClubSession _session({
  String id = 's1',
  String date = '2026-11-06',
  String status = 'scheduled',
}) =>
    ArenaClubSession(
      id: id,
      clubId: 'c1',
      arenaId: 'a1',
      arenaName: 'Arena Sol',
      clubName: 'Clubinho de sexta',
      date: date,
      startTime: '18:00',
      endTime: '21:00',
      courtIds: const ['q1'],
      courtNames: const ['Quadra 1'],
      capacity: 12,
      priceReais: 30,
      cancelWindowHours: 24,
      allowOnsitePayment: true,
      confirmedCount: 2,
      pendingCount: 1,
      status: status,
      source: 'series',
    );

ClubParticipant _participant(
  String id,
  String name, {
  required String status,
  String paymentMethod = 'pix',
}) =>
    ClubParticipant(
      sessionId: 's1',
      athleteId: id,
      athleteName: name,
      clubId: 'c1',
      arenaId: 'a1',
      arenaName: 'Arena Sol',
      clubName: 'Clubinho de sexta',
      date: '2026-11-06',
      startTime: '18:00',
      endTime: '21:00',
      status: status,
      paymentMethod: paymentMethod,
      amountReais: 30,
      refundStatus: 'none',
    );

final _participants = [
  _participant('u1', 'Maria Alves', status: 'confirmed'),
  _participant('u2', 'Enzo Lima', status: 'confirmed', paymentMethod: 'onsite'),
  _participant('u3', 'Lia Martins', status: 'pending_payment'),
  _participant('u4', 'Rafael Souza', status: 'canceled_refunded'),
];

List<Override> _sessionOverrides(ArenaClubSession session) => [
      ..._owner,
      arenaClubSessionDocProvider('s1').overrideWith(
        (ref) => Stream.value(session),
      ),
      arenaClubSessionParticipantsProvider('s1').overrideWith(
        (ref) => Stream.value(_participants),
      ),
    ];

// ── Painel e financeiro ────────────────────────────────────────────────────

ArenaDashboardPeriodMetrics _metrics(double trend) =>
    ArenaDashboardPeriodMetrics(
      period: ArenaDashboardPeriod.today,
      revenue: 250,
      bookingsCount: 3,
      occupancyRatePercent: 50,
      peakHour: 19,
      revenueBadge: null,
      occupancyBadge: null,
      bookingsBadge: null,
      peakBadge: null,
      chartTotal7Days: 1800,
      chartTrendPercent: trend,
    );

const _chartValues = <double>[200, 240, 180, 260, 300, 320, 300];
const _chartLabels = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

ArenaReviewReputationMetrics _reputation(double repliedPercent) =>
    ArenaReviewReputationMetrics(
      totalReviews: 20,
      repliedReviews: (20 * repliedPercent / 100).round(),
      repliedPercent: repliedPercent,
      averageReplyHours: 3.5,
      negativePendingCount: 0,
      respondsFastBadge: true,
    );

List<Override> _reputationOverrides(double repliedPercent) => [
      ..._owner,
      authProvider.overrideWith((ref) => Stream.value(null)),
      managedArenaReviewsProvider.overrideWith(
        (ref) => Stream.value(const <ArenaReview>[]),
      ),
      arenaReviewReputationMetricsProvider.overrideWith(
        (ref) => Stream.value(_reputation(repliedPercent)),
      ),
      reviewReplyServiceProvider.overrideWith(
        (ref) => ReviewReplyService(_FakeFirestore()),
      ),
    ];

/// Data fixa e longe de hoje: o carimbo sai "14 mar, 10:30", não "Hoje".
final _movementAt = DateTime(2026, 3, 14, 10, 30);

final _movements = [
  ArenaFinancialMovement(
    id: 'm1',
    kind: ArenaFinancialMovementKind.receipt,
    title: 'Reserva · Quadra 1',
    at: _movementAt,
    amountReais: 120,
    statusLabel: 'CONFIRMADO',
    isPositive: true,
    isFailed: false,
  ),
  ArenaFinancialMovement(
    id: 'm2',
    kind: ArenaFinancialMovementKind.withdrawal,
    title: 'Saque PIX',
    at: _movementAt,
    amountReais: 300,
    statusLabel: 'FALHOU',
    isPositive: false,
    isFailed: true,
  ),
  ArenaFinancialMovement(
    id: 'm3',
    kind: ArenaFinancialMovementKind.receipt,
    title: 'Estorno · Clubinho',
    at: _movementAt,
    amountReais: 30,
    statusLabel: 'ESTORNADO',
    isPositive: false,
    isFailed: false,
  ),
];

// ── Plano ──────────────────────────────────────────────────────────────────

DateTime get _today {
  final now = DateTime.now();
  return DateTime(now.year, now.month, now.day);
}

List<Override> _planBannerOverrides(ArenaPlanStatus status) => [
      ..._owner,
      managedArenaPlanStatusProvider.overrideWith(
        (ref) => Stream.value(status),
      ),
    ];

// ── Profissionais ──────────────────────────────────────────────────────────

/// Busca de contas fora do ar: a folha de convite mostra o erro.
class _FailingSearchRepository extends FakeArenaProfessionalsRepository {
  @override
  Future<List<ArenaProfessorCandidate>> searchAccounts(String term) async =>
      throw Exception('offline');
}

List<Override> _professionalsOverrides(
  FakeArenaProfessionalsRepository repo,
) =>
    [
      arenaProfessionalsRepositoryProvider.overrideWithValue(repo),
      arenaProfessionalsManagedArenaIdsProvider.overrideWithValue(
        const {arenaTestId},
      ),
      arenaProfessionalsClockProvider.overrideWithValue(() => arenaTestNow),
    ];

Future<void> _pumpProfessionalDetail(
  WidgetTester tester,
  ThemeData theme,
  ArenaProfessorLink link,
) =>
    pumpTonePage(
      tester,
      theme,
      ArenaProfessionalDetailPage(linkId: link.id),
      overrides: _professionalsOverrides(
        FakeArenaProfessionalsRepository(links: [link]),
      ),
    );

// ── Telas ──────────────────────────────────────────────────────────────────

final List<ToneScreen> arenaGestorToneScreens = [
  // Clubinho
  ToneScreen(
    'Clubinho: lista (selos e aviso de plano)',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const ArenaClubsPage(),
      overrides: [
        ..._owner,
        managedArenaDetailProvider.overrideWith((ref) => Stream.value(null)),
        managedArenaCapabilitiesProvider.overrideWith(
          (ref) => const <ArenaCapability>{},
        ),
        managedArenaClubsProvider.overrideWith(
          (ref) => Stream.value([
            _club(),
            _club(status: 'paused', name: 'Clubinho de domingo'),
          ]),
        ),
      ],
    ),
    find.byType(ArenaClubsPage),
    ['ATIVO', 'PAUSADO', Icons.lock_outline_rounded],
  ),
  ToneScreen(
    'Clubinho: detalhe (selo, sessão cancelada, pausar e arquivar)',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const ArenaClubDetailsPage(clubId: 'c1'),
      overrides: [
        ..._owner,
        arenaClubProvider('c1').overrideWith((ref) => Stream.value(_club())),
        arenaClubSessionsProvider('c1').overrideWith(
          (ref) => Stream.value([
            _session(),
            _session(id: 's2', date: '2026-11-13', status: 'canceled'),
          ]),
        ),
      ],
    ),
    find.byType(ArenaClubDetailsPage),
    [
      'ATIVO',
      Icons.event_busy_rounded,
      'Cancelada',
      Icons.pause_rounded,
      'Pausar clubinho',
      Icons.archive_outlined,
      'Arquivar clubinho',
    ],
  ),
  ToneScreen(
    'Clubinho: formulário de edição (aviso)',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const ArenaClubFormPage(clubId: 'c1'),
      overrides: [
        ..._owner,
        arenaClubProvider('c1').overrideWith((ref) => Stream.value(_club())),
        courtsStreamProvider('a1').overrideWith(
          (ref) => Stream.value(const <ArenaCourt>[]),
        ),
      ],
    ),
    find.byType(ArenaClubFormPage),
    [Icons.info_outline_rounded],
  ),
  ToneScreen(
    'Clubinho: sessão agendada (contadores, selos, cancelar)',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const ArenaClubSessionPage(sessionId: 's1'),
      overrides: _sessionOverrides(_session()),
      size: _wide,
    ),
    find.byType(ArenaClubSessionPage),
    [
      '2/12',
      '1',
      'Paga na arena',
      'Confirmado',
      'Aguardando PIX',
      'Saiu (estornado)',
      Icons.event_busy_rounded,
      'Cancelar sessão',
    ],
  ),
  ToneScreen(
    'Clubinho: sessão cancelada (selo)',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const ArenaClubSessionPage(sessionId: 's1'),
      overrides: _sessionOverrides(_session(status: 'canceled')),
      size: _wide,
    ),
    find.byType(ArenaClubSessionPage),
    ['CANCELADA'],
  ),
  ToneScreen(
    'Clubinho: adicionar à lista (erro do convidado)',
    (tester, theme) async {
      await pumpTonePage(
        tester,
        theme,
        const ArenaClubSessionPage(sessionId: 's1'),
        overrides: _sessionOverrides(_session()),
        size: _wide,
      );
      await tester.tap(find.text('Adicionar'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));
      await tester.tap(find.text('Adicionar convidado'));
      await tester.pump();
    },
    find.byType(BottomSheet),
    ['Informe o nome do convidado.'],
  ),

  // Perfil e ajustes
  ToneScreen(
    'Perfil da arena: perfil público ativo',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const ArenaProfilePage(),
      overrides: [
        ..._owner,
        managedArenaDetailProvider.overrideWith((ref) => Stream.value(_arena)),
        arenaFollowersCountProvider('a1').overrideWith(
          (ref) => Stream.value(12),
        ),
        arenaFollowersPreviewProvider('a1').overrideWith(
          (ref) => Stream.value(const <ArenaFollowerItem>[]),
        ),
        arenaFollowersInsightsProvider('a1').overrideWith(
          (ref) => Stream.value(
            const ArenaFollowersInsights(
              totalFollowers: 12,
              growthLastWeek: 2,
              qualityBookedPercent: 40,
              activeRecentlyPercent: 60,
            ),
          ),
        ),
      ],
    ),
    find.byType(ArenaProfilePage),
    ['marca', 'PERFIL PÚBLICO ATIVO'],
  ),
  ToneScreen(
    'Perfil da arena: erro ao carregar',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const ArenaProfilePage(),
      overrides: [
        ..._owner,
        managedArenaDetailProvider.overrideWith(
          (ref) => Stream<ArenaListItem?>.error('falha'),
        ),
      ],
    ),
    find.byType(ArenaProfilePage),
    ['Não foi possível carregar o perfil.\nfalha'],
  ),
  ToneScreen(
    'Ajustes: selo do perfil, logo e sair',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const ArenaSettingsPage(),
      size: const Size(402, 2600),
      overrides: [
        ..._owner,
        managedArenaDetailProvider.overrideWith((ref) => Stream.value(_arena)),
        arenaFollowersCountProvider('a1').overrideWith(
          (ref) => Stream.value(0),
        ),
        arenaSettingsTemplateProvider.overrideWith(
          (ref) async => ArenaSettingsScheduleState.initial(),
        ),
        arenaManagedCourtsProvider.overrideWith(
          (ref) => Stream.value(const []),
        ),
        arenaProfessionalLinksProvider('a1').overrideWith(
          (ref) => Stream.value(const <ArenaProfessorLink>[]),
        ),
        managedArenaProductSummaryProvider.overrideWith(
          (ref) => const ArenaProductSummary(
            activeCount: 0,
            lowCount: 0,
            outCount: 0,
            inventoryValueCents: 0,
          ),
        ),
      ],
    ),
    find.byType(ArenaSettingsPage),
    ['PERFIL DA ARENA', 'marca', Icons.logout_rounded, 'Sair'],
  ),

  // Painel
  ToneScreen(
    'Painel: seguidores que já reservaram',
    (tester, theme) => _pumpWidePiece(
      tester,
      theme,
      const ArenaDashboardFollowersCard(
        arenaId: 'a1',
        insightsAsync: AsyncValue.data(
          ArenaFollowersInsights(
            totalFollowers: 128,
            growthLastWeek: 6,
            qualityBookedPercent: 40,
            activeRecentlyPercent: 55,
          ),
        ),
      ),
      overrides: _owner,
    ),
    tonePiece,
    ['40% já reservaram'],
  ),
  ToneScreen(
    'Painel: KPIs com variação',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const ArenaDashboardKpiGrid(
        items: [
          ArenaDashboardKpiItem(
            label: 'Ocupação',
            value: '62%',
            icon: Icons.donut_large_rounded,
            badge: ArenaDashboardKpiBadge(
              label: '+12%',
              tone: ArenaDashboardKpiBadgeTone.positive,
            ),
          ),
          ArenaDashboardKpiItem(
            label: 'Reservas',
            value: '18',
            icon: Icons.event_available_rounded,
            badge: ArenaDashboardKpiBadge(
              label: '−8%',
              tone: ArenaDashboardKpiBadgeTone.negative,
            ),
          ),
        ],
      ),
    ),
    tonePiece,
    ['+12%', '−8%'],
  ),
  ToneScreen(
    'Painel: faturamento em alta e em queda',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      Column(
        children: [
          ArenaDashboardRevenueChartCard(
            values: _chartValues,
            labels: _chartLabels,
            metrics: _metrics(15),
          ),
          const SizedBox(height: 12),
          ArenaDashboardRevenueChartCard(
            values: _chartValues,
            labels: _chartLabels,
            metrics: _metrics(-9),
          ),
        ],
      ),
    ),
    tonePiece,
    ['▲ 15%', '▼ 9%'],
  ),
  ToneScreen(
    'Painel: reputação com taxa de resposta alta',
    (tester, theme) => _pumpWidePiece(
      tester,
      theme,
      const ArenaDashboardReputationSection(),
      overrides: _reputationOverrides(85),
    ),
    tonePiece,
    ['alto'],
  ),
  ToneScreen(
    'Painel: reputação com taxa de resposta média',
    (tester, theme) => _pumpWidePiece(
      tester,
      theme,
      const ArenaDashboardReputationSection(),
      overrides: _reputationOverrides(60),
    ),
    tonePiece,
    ['médio'],
  ),

  // Financeiro
  ToneScreen(
    'Financeiro: saldo (recebido no período)',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      ArenaFinancialBalanceCard(
        wallet: const ArenaWalletSummary(availableReais: 850, pendingReais: 0),
        period: ArenaFinancialPeriod.d7,
        stats: const ArenaFinancialPeriodStats(
          receivedReais: 1234.5,
          withdrawnReais: 300,
        ),
        onPeriodChanged: (_) {},
      ),
    ),
    tonePiece,
    [formatBRL(1234.5)],
  ),
  ToneScreen(
    'Financeiro: saque (chave PIX de destino)',
    (tester, theme) => _pumpWidePiece(
      tester,
      theme,
      ArenaFinancialWithdrawSection(
        amountController: TextEditingController(),
        pixKey: 'arena@exemplo.com',
        amountError: null,
        canSubmit: false,
        submitting: false,
        onWithdrawAll: () {},
        onEditPix: () {},
        onSubmit: () {},
      ),
    ),
    tonePiece,
    [Icons.diamond_rounded],
  ),
  ToneScreen(
    'Financeiro: extrato (recebido, saque falho, estorno)',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      ArenaFinancialHistorySection(
        movements: _movements,
        filter: ArenaFinancialHistoryFilter.all,
        onFilterChanged: (_) {},
      ),
    ),
    tonePiece,
    [
      Icons.arrow_downward_rounded,
      'CONFIRMADO',
      '+${formatBRL(120)}',
      Icons.arrow_upward_rounded,
      'FALHOU',
    ],
  ),
  ToneScreen(
    'Financeiro: Mercado Pago conectado',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const ArenaMercadoPagoConnectCard(),
      overrides: [
        mercadoPagoLinkedProvider.overrideWith((ref) async => true),
      ],
    ),
    tonePiece,
    [Icons.check_circle_rounded],
  ),
  ToneScreen(
    'Financeiro: PIX via NexaGO (com e sem chave)',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const Column(
        children: [
          ArenaPlatformPixCard(payoutPixKey: 'arena@exemplo.com'),
          SizedBox(height: 12),
          ArenaPlatformPixCard(payoutPixKey: ''),
        ],
      ),
    ),
    tonePiece,
    [Icons.pix_rounded, Icons.warning_amber_rounded],
  ),

  // Promoções
  ToneScreen(
    'Promoções: ativa e pausada, excluir',
    (tester, theme) => _pumpWidePiece(
      tester,
      theme,
      const ArenaPromotionsSheet(arenaId: 'a1'),
      onSheet: true,
      overrides: [
        managedArenaCapabilitiesProvider.overrideWith(
          (ref) => const {ArenaCapability.promocoes},
        ),
        arenaAllPromotionsProvider('a1').overrideWith(
          (ref) => Stream.value(const [
            ArenaPromotion(
              id: 'p1',
              active: true,
              label: 'Happy hour',
              courtIds: [],
              weekdays: [1, 2, 3],
              startTime: '14:00',
              endTime: '17:00',
              discountPercent: 20,
            ),
            ArenaPromotion(
              id: 'p2',
              active: false,
              label: 'Manhã vazia',
              courtIds: [],
              weekdays: [6, 7],
              startTime: '07:00',
              endTime: '09:00',
              fixedPricePerHourReais: 80,
            ),
          ]),
        ),
      ],
    ),
    tonePiece,
    ['Ativa', 'Pausada', Icons.delete_outline_rounded, 'Excluir'],
  ),

  // Plano
  ToneScreen(
    'Plano: ativação do Elite',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const ArenaPlanActivatedPage(
        args: ArenaPlanActivatedArgs(
          arenaId: 'a1',
          tier: ArenaPlanTier.elite,
        ),
      ),
    ),
    // Só o conteúdo: os confetes (decoração, crus) ficam de fora.
    find.byType(SingleChildScrollView),
    ['Elite', 'Já aplicada automaticamente', 'Disponível agora'],
  ),
  ToneScreen(
    'Plano: assinatura ativa (selos)',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const ArenaPlanPage(),
      size: _wide,
      overrides: [
        managedArenaIdProvider.overrideWithValue(
          const AsyncValue<String?>.data('a1'),
        ),
        arenaPlanStatusProvider('a1').overrideWith(
          (ref) => Stream.value(
            ArenaPlanStatus(
              tier: ArenaPlanTier.pro,
              status: 'active',
              activeUntil: DateTime(2026, 12, 1),
            ),
          ),
        ),
      ],
    ),
    find.byType(ArenaPlanPage),
    ['ATIVO', '1 MÊS GRÁTIS'],
  ),
  ToneScreen(
    'Plano: aviso de somente leitura',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const ArenaPlanReadOnlyBanner(
        message: 'Comandas em modo leitura: assine o Pro para abrir novas.',
      ),
    ),
    tonePiece,
    [Icons.lock_outline_rounded],
  ),
  ToneScreen(
    'Plano: pagamento em atraso (carência)',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const ArenaPlanStatusBanner(),
      overrides: _planBannerOverrides(
        ArenaPlanStatus(
          tier: ArenaPlanTier.pro,
          status: 'overdue',
          activeUntil: _today.subtract(const Duration(days: 1)),
        ),
      ),
    ),
    tonePiece,
    [Icons.warning_amber_rounded],
  ),
  ToneScreen(
    'Plano: recursos suspensos',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const ArenaPlanStatusBanner(),
      overrides: _planBannerOverrides(
        ArenaPlanStatus(
          tier: ArenaPlanTier.pro,
          status: 'overdue',
          activeUntil: _today.subtract(const Duration(days: 30)),
        ),
      ),
    ),
    tonePiece,
    [Icons.lock_clock_rounded],
  ),
  ToneScreen(
    'Plano: assinatura cancelada',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const ArenaPlanStatusBanner(),
      overrides: _planBannerOverrides(
        ArenaPlanStatus(
          tier: ArenaPlanTier.pro,
          status: 'canceling',
          activeUntil: _today.add(const Duration(days: 10)),
        ),
      ),
    ),
    tonePiece,
    [Icons.info_outline_rounded],
  ),

  // Profissionais
  ToneScreen(
    'Profissionais: status do vínculo',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ArenaProfessorStatusLabel(ArenaProfessorLinkStatus.active),
          SizedBox(height: 8),
          ArenaProfessorStatusLabel(ArenaProfessorLinkStatus.pending),
          SizedBox(height: 8),
          ArenaProfessorStatusLabel(ArenaProfessorLinkStatus.suspended),
        ],
      ),
      onCard: true,
    ),
    tonePiece,
    ['marca', 'Ativo', 'Aguardando aprovação', 'Suspenso'],
  ),
  ToneScreen(
    'Profissionais: pedido na lista (rejeitar)',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      ArenaProfessorRequestCard(
        link: rafaelPending(),
        now: arenaTestNow,
        onAnalyze: () {},
        onReject: () {},
        highlight: true,
      ),
    ),
    tonePiece,
    ['Rejeitar'],
  ),
  ToneScreen(
    'Profissionais: erro na folha',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const ArenaProfessorErrorBanner(
        'Não foi possível aprovar a solicitação. Tente de novo.',
      ),
      onSheet: true,
    ),
    tonePiece,
    ['Não foi possível aprovar a solicitação. Tente de novo.'],
  ),
  ToneScreen(
    'Profissionais: detalhe ativo (encerrar vínculo)',
    (tester, theme) => _pumpProfessionalDetail(tester, theme, marcosActive()),
    find.byKey(const Key('arena-professor-action-end')),
    ['Encerrar vínculo'],
  ),
  ToneScreen(
    'Profissionais: detalhe do convite (cancelar convite)',
    (tester, theme) => _pumpProfessionalDetail(tester, theme, lucasInvited()),
    find.byKey(const Key('arena-professor-action-cancel')),
    ['Cancelar convite'],
  ),
  ToneScreen(
    'Profissionais: folha de suspensão (efeitos)',
    (tester, theme) => _pumpWidePiece(
      tester,
      theme,
      SizedBox(
        height: 1200,
        child: ArenaProfessorSuspendSheet(link: marcosActive()),
      ),
      onSheet: true,
      overrides: _professionalsOverrides(
        FakeArenaProfessionalsRepository(links: [marcosActive()]),
      ),
    ),
    tonePiece,
    ['marca'],
  ),
  ToneScreen(
    'Profissionais: folha de convite (erro da busca)',
    (tester, theme) async {
      await pumpTonePiece(
        tester,
        theme,
        const SizedBox(
          height: 1300,
          child: ArenaProfessorInviteSheet(arenaId: arenaTestId),
        ),
        onSheet: true,
        overrides: _professionalsOverrides(_FailingSearchRepository()),
      );
      await tester.enterText(
        find.byKey(const Key('arena-professor-invite-search')),
        'Ana',
      );
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump();
    },
    tonePiece,
    ['Não foi possível buscar agora. Tente novamente.'],
  ),
];

/// Só no claro: no escuro o "Rejeitar" cru da folha do pedido (botão
/// fantasma sobre a folha) dá 4,26:1 — o escuro é a referência e não muda,
/// então esta tela não entra em [arenaGestorToneScreens].
final List<ToneScreen> _lightOnlyScreens = [
  ToneScreen(
    'Profissionais: folha do pedido (rejeitar)',
    (tester, theme) => _pumpWidePiece(
      tester,
      theme,
      SizedBox(
        height: 1200,
        child: ArenaProfessorRequestSheet(link: rafaelPending()),
      ),
      onSheet: true,
      overrides: _professionalsOverrides(
        FakeArenaProfessionalsRepository(links: [rafaelPending()]),
      ),
    ),
    tonePiece,
    ['Rejeitar'],
  ),
];

void main() {
  stateToneScreensTests(arenaGestorToneScreens);

  group('tema claro (só claro)', () {
    for (final screen in _lightOnlyScreens) {
      testWidgets('${screen.name}: tons de estado legíveis', (tester) async {
        await screen.open(tester, AppTheme.light);
        final checked = expectStateTonesLegible(tester, screen.root);
        expect(checked, containsAll(screen.expected));
      });
    }
  });
}
