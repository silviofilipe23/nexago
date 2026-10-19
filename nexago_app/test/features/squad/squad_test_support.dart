import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/squad/application/squad_providers.dart';
import 'package:nexago_app/features/squad/domain/squad_models.dart';
import 'package:nexago_app/features/squad/domain/squad_repository.dart';
import 'package:nexago_app/features/squad/presentation/squad_benefits_page.dart';
import 'package:nexago_app/features/squad/presentation/squad_earnings_page.dart';
import 'package:nexago_app/features/squad/presentation/squad_invite_page.dart';
import 'package:nexago_app/features/squad/presentation/squad_page.dart';
import 'package:nexago_app/features/squad/presentation/squad_ranking_page.dart';
import 'package:nexago_app/features/squad/presentation/squad_share_page.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';

/// Apoio dos testes do NexaSquad: payloads realistas das callables, o dublê
/// do repositório e o app mínimo com as rotas reais do Squad.
///
/// Nada aqui guarda estado entre testes: cada teste cria o seu
/// [FakeSquadRepository] e monta os modelos pelos `fromMap` de verdade.

// ── payloads (o que `getMySquad` / `viewSquadInvite` devolvem) ─────────────

Map<String, Object?> squadPackagePayload(String tier) => switch (tier) {
  'amb' => {
    'tier': 'amb',
    'tierLabel': 'Ambassador',
    'commissionPct': 10,
    'followerDiscountPct': 10,
    'registrations': {'type': 'freePerMonth', 'value': 1},
    'kit': 'Kit completo',
    'events': 'Prioridade',
    'partnerHalfOff': false,
    'campaignFee': false,
    'tournamentOriginBonusCents': null,
  },
  'pro' => {
    'tier': 'pro',
    'tierLabel': 'Pro Ambassador',
    'commissionPct': [10, 15],
    'followerDiscountPct': 15,
    'registrations': {'type': 'freeUnlimited', 'value': null},
    'kit': 'Kit premium + uniforme',
    'events': 'Prioridade + exclusivos',
    'partnerHalfOff': true,
    'campaignFee': true,
    'tournamentOriginBonusCents': null,
  },
  'cap' => {
    'tier': 'cap',
    'tierLabel': 'Captain',
    'commissionPct': 15,
    'followerDiscountPct': 15,
    'registrations': {'type': 'freePerMonth', 'value': 2},
    'kit': '',
    'events': '',
    'partnerHalfOff': false,
    'campaignFee': false,
    'tournamentOriginBonusCents': 5000,
  },
  _ => {
    'tier': 'ath',
    'tierLabel': 'Athlete',
    'commissionPct': 5,
    'followerDiscountPct': 10,
    'registrations': {'type': 'discount', 'value': 20},
    'kit': 'Camiseta, boné, garrafa',
    'events': 'Prioridade',
    'partnerHalfOff': false,
    'campaignFee': false,
    'tournamentOriginBonusCents': null,
  },
};

SquadPackage squadPackage(String tier) =>
    SquadPackage.fromMap(squadPackagePayload(tier));

Map<String, Object?> squadCommissionPayload({
  required String id,
  required String at,
  required String label,
  String tournamentName = 'Open Errejota',
  String categoryName = 'Masc. C',
  String origin = 'code',
  int amountCents = 1200,
  String status = 'released',
  String? cancelReason,
}) => {
  'id': id,
  'at': at,
  'label': label,
  'tournamentName': tournamentName,
  'categoryName': categoryName,
  'origin': origin,
  'amountCents': amountCents,
  'status': status,
  'cancelReason': cancelReason,
};

/// Três comissões (liberada, aguardando e cancelada por reembolso), já na
/// ordem do servidor: da mais recente para a mais antiga.
List<Map<String, Object?>> defaultSquadCommissions() => [
  squadCommissionPayload(
    id: 'c3',
    at: '2026-10-14T15:00:00.000Z',
    label: 'Ana P.',
    tournamentName: 'Copa Sol',
    categoryName: 'Fem. B',
    amountCents: 1000,
    status: 'canceled',
    cancelReason: 'refund',
  ),
  squadCommissionPayload(
    id: 'c2',
    at: '2026-10-11T15:00:00.000Z',
    label: 'Pedro A.',
    amountCents: 1500,
    status: 'pending',
  ),
  squadCommissionPayload(
    id: 'c1',
    at: '2026-10-10T15:00:00.000Z',
    label: 'Lucas M.',
  ),
];

const defaultSquadWeekly = [
  {'weekStart': '2026-09-08', 'cents': 0},
  {'weekStart': '2026-09-15', 'cents': 1200},
  {'weekStart': '2026-09-22', 'cents': 3600},
  {'weekStart': '2026-09-29', 'cents': 2400},
  {'weekStart': '2026-10-06', 'cents': 4800},
  {'weekStart': '2026-10-13', 'cents': 1000},
];

const defaultSquadLevels = [
  {'name': 'Bronze', 'min': 0},
  {'name': 'Silver', 'min': 500},
  {'name': 'Gold', 'min': 1000},
  {'name': 'Elite', 'min': 2000},
];

/// Membro do piloto (Ambassador → Pro), com ganhos, conversões e extrato.
Map<String, Object?> squadMemberPayload({
  String tier = 'amb',
  String code = 'JOAO10',
  String status = 'active',
  String? pausedUntil,
  String? endsAt,
  String cycleId = 'piloto',
  int totalCents = 32400,
  int availableCents = 4800,
  int pendingCents = 1500,
  int receivedCents = 18000,
  int revenueCents = 216000,
  String nextPayoutDate = '2026-10-20',
  int minPayoutCents = 2000,
  int conversions = 7,
  int athletes = 9,
  bool followerDiscountFirstOnly = true,
  List<Map<String, Object?>>? commissions,
  List<Map<String, Object?>>? payouts,
  List<Map<String, Object?>> weekly = defaultSquadWeekly,
  bool withProgress = true,
  int minConversions = 12,
  Map<String, Object?>? pendingAmendment,
}) => {
  'tier': tier,
  'tierLabel': '',
  'code': code,
  'status': status,
  'pausedUntil': pausedUntil,
  'endsAt': endsAt,
  // Instantes ISO em UTC: 00:00 de 08/09 e 23:59 de 06/12 em São Paulo.
  'start': '2026-09-08T03:00:00.000Z',
  'end': '2026-12-07T02:59:59.000Z',
  'cycleId': cycleId,
  'commissionPct': 10,
  'followerDiscountPct': 10,
  'followerDiscountFirstOnly': followerDiscountFirstOnly,
  'pendingAmendment': pendingAmendment,
  'earnings': {
    'totalCents': totalCents,
    'availableCents': availableCents,
    'pendingCents': pendingCents,
    'receivedCents': receivedCents,
    'revenueCents': revenueCents,
    'nextPayoutDate': nextPayoutDate,
    'minPayoutCents': minPayoutCents,
  },
  'conversions': conversions,
  'athletes': athletes,
  'weekly': weekly,
  'commissions': commissions ?? defaultSquadCommissions(),
  'payouts':
      payouts ??
      [
        {'id': 'p1', 'at': '2026-10-12T12:00:00.000Z', 'amountCents': 18000},
      ],
  'points': {
    'total': 1280,
    'level': 'Gold',
    'levels': defaultSquadLevels,
    'perConversion': 100,
  },
  'progress': withProgress
      ? {
          'toTier': 'pro',
          'toTierLabel': 'Pro Ambassador',
          'conversions': conversions,
          'minConversions': minConversions,
          'reviewDate': '2026-12-07T02:59:59.000Z',
        }
      : null,
  'package': squadPackagePayload(tier),
  'nextPackage': withProgress ? squadPackagePayload('pro') : null,
};

SquadMember squadMember({
  String status = 'active',
  String? pausedUntil,
  String? endsAt,
  String cycleId = 'piloto',
  int availableCents = 4800,
  int minPayoutCents = 2000,
  List<Map<String, Object?>>? commissions,
  List<Map<String, Object?>>? payouts,
  bool withProgress = true,
  Map<String, Object?>? pendingAmendment,
}) => SquadMember.fromMap(
  squadMemberPayload(
    status: status,
    pausedUntil: pausedUntil,
    endsAt: endsAt,
    cycleId: cycleId,
    availableCents: availableCents,
    minPayoutCents: minPayoutCents,
    commissions: commissions,
    payouts: payouts,
    withProgress: withProgress,
    pendingAmendment: pendingAmendment,
  ),
);

MySquad memberSquad([SquadMember? member]) =>
    MySquad(member: member ?? squadMember(), invite: null);

MySquad inviteSquad({String id = 'inv-1', String tier = 'amb'}) =>
    MySquad.fromMap({
      'member': null,
      'invite': {
        'id': id,
        'tier': tier,
        'tierLabel': 'Ambassador',
        'expiresAt': '2026-10-24T03:00:00.000Z',
      },
    });

Map<String, Object?> squadInvitePayload({
  String id = 'inv-1',
  String status = 'opened',
  String tier = 'amb',
  String suggestedCode = 'JOAO10',
  String? message,
  int? tournaments = 12,
}) => {
  'id': id,
  'status': status,
  'package': squadPackagePayload(tier),
  'suggestedCode': suggestedCode,
  'periodStart': '2026-09-08',
  'periodEnd': '2026-12-06',
  'message': message,
  'expiresAt': '2026-10-24T03:00:00.000Z',
  'firstName': 'João',
  'tournaments': tournaments,
  'followerDiscountFirstOnly': true,
};

SquadInvite squadInvite({
  String status = 'opened',
  String suggestedCode = 'JOAO10',
}) => SquadInvite.fromMap(
  squadInvitePayload(status: status, suggestedCode: suggestedCode),
);

Map<String, Object?> squadRankingEntryPayload(
  int position,
  String name,
  int points, {
  int? delta,
  bool me = false,
}) => {
  'position': position,
  'name': name,
  'photoUrl': null,
  'points': points,
  'delta': delta,
  'me': me,
};

/// Top 5 com o atleta da sessão em 3º, subindo 3 posições na semana.
SquadRanking squadRanking({
  List<Map<String, Object?>>? entries,
  Map<String, Object?>? me,
}) {
  final list =
      entries ??
      [
        squadRankingEntryPayload(1, 'Marina Costa', 2400, delta: 0),
        squadRankingEntryPayload(2, 'Pedro Alves', 2100, delta: 1),
        squadRankingEntryPayload(3, 'João Victor', 1280, delta: 3, me: true),
        squadRankingEntryPayload(4, 'Lia Rocha', 900, delta: -2),
        squadRankingEntryPayload(5, 'Caio Lima', 600),
      ];
  return SquadRanking.fromMap({
    'entries': list,
    'me': me ?? _meIn(list),
    'level': 'Gold',
    'levels': defaultSquadLevels,
  });
}

Map<String, Object?>? _meIn(List<Map<String, Object?>> list) {
  for (final e in list) {
    if (e['me'] == true) return e;
  }
  return null;
}

// ── dublê do repositório ────────────────────────────────────────────────────

typedef SquadAcceptCall = ({String inviteId, String code});
typedef SquadCheckCall = ({
  String code,
  List<String> athleteUids,
  String registrationId,
  String purpose,
  String? arenaId,
});

/// Repositório do Squad em memória: devolve o que o teste configurou e
/// registra cada chamada para o teste conferir.
class FakeSquadRepository implements SquadRepository {
  FakeSquadRepository({
    this.mySquad = MySquad.none,
    this.mySquadError,
    SquadRanking? ranking,
    this.rankingError,
    SquadInvite? invite,
    this.inviteError,
    this.acceptError,
    this.amendmentError,
    this.checkResult = SquadCodeCheck.none,
    this.checkError,
    this.linkResult = SquadCodeCheck.none,
    this.enabled = true,
  }) : ranking = ranking ?? squadRanking(),
       invite = invite ?? squadInvite();

  MySquad mySquad;
  Object? mySquadError;
  SquadRanking ranking;
  Object? rankingError;
  SquadInvite invite;
  Object? inviteError;
  Object? acceptError;
  Object? amendmentError;
  SquadCodeCheck checkResult;
  Object? checkError;

  /// Resposta de `checkCode` com código vazio (indicação por link/QR).
  SquadCodeCheck linkResult;
  bool enabled;

  int watchEnabledCalls = 0;
  int fetchMySquadCalls = 0;
  int fetchRankingCalls = 0;
  int acceptAmendmentCalls = 0;
  final viewInviteCalls = <String>[];
  final acceptCalls = <SquadAcceptCall>[];
  final checkCalls = <SquadCheckCall>[];

  @override
  Stream<bool> watchEnabled() {
    watchEnabledCalls++;
    return Stream.value(enabled);
  }

  @override
  Future<MySquad> fetchMySquad() async {
    fetchMySquadCalls++;
    final error = mySquadError;
    if (error != null) throw error;
    return mySquad;
  }

  @override
  Future<SquadRanking> fetchRanking() async {
    fetchRankingCalls++;
    final error = rankingError;
    if (error != null) throw error;
    return ranking;
  }

  @override
  Future<SquadInvite> viewInvite(String inviteId) async {
    viewInviteCalls.add(inviteId);
    final error = inviteError;
    if (error != null) throw error;
    return invite;
  }

  @override
  Future<void> acceptInvite({
    required String inviteId,
    required String code,
  }) async {
    acceptCalls.add((inviteId: inviteId, code: code));
    final error = acceptError;
    if (error != null) throw error;
  }

  @override
  Future<void> acceptAmendment() async {
    acceptAmendmentCalls++;
    final error = amendmentError;
    if (error != null) throw error;
  }

  @override
  Future<SquadCodeCheck> checkCode({
    required String code,
    required List<String> athleteUids,
    required String registrationId,
    String purpose = 'registration',
    String? arenaId,
  }) async {
    checkCalls.add((
      code: code,
      athleteUids: athleteUids,
      registrationId: registrationId,
      purpose: purpose,
      arenaId: arenaId,
    ));
    if (code.isEmpty) return linkResult;
    final error = checkError;
    if (error != null) throw error;
    return checkResult;
  }
}

// ── fontes reais ────────────────────────────────────────────────────────────

/// Carrega Sora e JetBrains Mono do app. Sem isso o teste mede texto com a
/// fonte de teste (cada letra = 1 em), bem mais larga que a real, e acusa
/// estouro de layout que não existe no aparelho. Chamar no `setUpAll`.
Future<void> loadSquadFonts() async {
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

// ── app mínimo com as rotas reais do Squad ─────────────────────────────────

/// Torneio da vitrine (Descobrir) para o card "Torneio" do Compartilhar.
DiscoveryTournament discoveryTournament({
  required String id,
  required String name,
  required DateTime startDate,
  TournamentListingStatus status = TournamentListingStatus.open,
  String location = 'Arena Errejota',
}) => DiscoveryTournament(
  id: id,
  name: name,
  location: location,
  city: 'Rio de Janeiro',
  dateLabel: '',
  startDate: startDate,
  categories: const [TournamentGenderCat.m],
  format: TournamentFormat.dupla,
  priceLabel: r'R$ 120',
  priceValue: 120,
  spotsLeft: 10,
  spotsTotal: 32,
  status: status,
  featured: false,
  enrolledCount: 22,
  liveMatchesNow: 0,
);

/// Monta o app com GoRouter (rotas e nomes reais do Squad) sobre o [repo].
///
/// A flag `appConfig/squad` vem de [flag]; a sessão é um `MockFirebaseAuth`
/// logado. A tela é alta para a ListView montar tudo de uma vez, mas com a
/// largura de um iPhone (390) para pegar estouro de layout.
Future<GoRouter> pumpSquadApp(
  WidgetTester tester, {
  required FakeSquadRepository repo,
  required String location,
  bool flag = true,
  List<DiscoveryTournament> tournaments = const [],
  Widget? home,
  Size size = const Size(390, 1600),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    initialLocation: location,
    routes: [
      GoRoute(
        path: AppRoutes.home,
        name: AppRouteNames.home,
        builder: (_, __) =>
            home ?? const Scaffold(body: Center(child: Text('home'))),
      ),
      GoRoute(
        path: AppRoutes.squad,
        name: AppRouteNames.squad,
        builder: (_, __) => const SquadPage(),
      ),
      GoRoute(
        path: AppRoutes.squadShare,
        name: AppRouteNames.squadShare,
        builder: (_, __) => const SquadSharePage(),
      ),
      GoRoute(
        path: AppRoutes.squadEarnings,
        name: AppRouteNames.squadEarnings,
        builder: (_, __) => const SquadEarningsPage(),
      ),
      GoRoute(
        path: AppRoutes.squadRanking,
        name: AppRouteNames.squadRanking,
        builder: (_, __) => const SquadRankingPage(),
      ),
      GoRoute(
        path: AppRoutes.squadBenefits,
        name: AppRouteNames.squadBenefits,
        builder: (_, __) => const SquadBenefitsPage(),
      ),
      GoRoute(
        path: AppRoutes.squadInvite,
        name: AppRouteNames.squadInvite,
        builder: (_, state) =>
            SquadInvitePage(inviteId: state.pathParameters['inviteId'] ?? ''),
      ),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        firebaseAuthProvider.overrideWithValue(
          MockFirebaseAuth(
            signedIn: true,
            mockUser: MockUser(uid: 'atleta-1', displayName: 'João Victor'),
          ),
        ),
        squadRepositoryProvider.overrideWithValue(repo),
        squadFlagProvider.overrideWith((ref) => Stream.value(flag)),
        discoveryTournamentsProvider.overrideWith(
          (ref) => Stream.value(tournaments),
        ),
        athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await settleSquad(tester);
  return router;
}

/// Deixa sessão, flag e callables responderem. Sem `pumpAndSettle`: o
/// esqueleto do Squad e os indicadores giram para sempre.
Future<void> settleSquad(WidgetTester tester, [int frames = 6]) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

/// Espera a folha (bottom sheet) terminar de abrir ou fechar.
Future<void> settleSheet(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

/// Texto completo de um `Text`/`Text.rich` achado pela [key].
String squadTextOf(WidgetTester tester, Key key) {
  final text = tester.widget<Text>(find.byKey(key));
  return text.data ?? text.textSpan?.toPlainText() ?? '';
}
