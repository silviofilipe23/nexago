import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/active_role_providers.dart';
import 'package:nexago_app/core/observability/analytics_service.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/arena_access_provider.dart';
import 'package:nexago_app/features/benefits_club/application/benefits_club_providers.dart';
import 'package:nexago_app/features/benefits_club/domain/benefit_event.dart';
import 'package:nexago_app/features/benefits_club/domain/benefits_club_config.dart';
import 'package:nexago_app/features/benefits_club/presentation/widgets/benefits_club_hub_card.dart';
import 'package:nexago_app/features/benefits_club/presentation/widgets/partner_visuals.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_discovery_page.dart';

import '../../../support/recording_analytics.dart';
import '../support/benefits_club_fakes.dart';

const _card = BenefitsClubHubCard.cardKey;

Future<GoRouter> _pumpHub(
  WidgetTester tester, {
  required FakeBenefitsClubService service,
  BenefitsClubConfig config = const BenefitsClubConfig(enabled: true),
  Stream<BenefitsClubConfig>? configStream,
  bool isAdmin = false,
}) async {
  await tester.binding.setSurfaceSize(const Size(430, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));

  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => const Scaffold(body: TournamentDiscoveryPage()),
      ),
      GoRoute(
        path: AppRoutes.benefitsClub,
        name: AppRouteNames.benefitsClub,
        builder: (_, state) => Scaffold(
          body: Text('clube ${state.uri.queryParameters['origem']}'),
        ),
      ),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        ...benefitsOverrides(
          service: service,
          config: config,
          configStream: configStream,
          isAdmin: isAdmin,
        ),
        hasMultipleMobileRolesProvider.overrideWithValue(false),
        arenaPanelAccessProvider.overrideWith((ref) async => false),
        analyticsServiceProvider.overrideWithValue(RecordingAnalytics()),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  // Flag, papel e parceiros chegam em frames seguidos (os parceiros só são
  // lidos depois que o card decide aparecer).
  for (var i = 0; i < 5; i++) {
    await tester.pump();
  }
  return router;
}

void main() {
  testWidgets(
    'flag ligada: card de largura total entre a grade e Organizadores, '
    'grava hub_card_view uma vez e abre o clube com origem hub_card',
    (tester) async {
      final service = FakeBenefitsClubService();
      await _pumpHub(tester, service: service);

      expect(find.byKey(_card), findsOneWidget);
      expect(find.textContaining('Clube de Vantagens Nexa'), findsOneWidget);
      expect(find.text('Descontos dos parceiros NexaGO'), findsOneWidget);
      expect(
        find.descendant(of: find.byKey(_card), matching: find.text('NOVO')),
        findsOneWidget,
      );
      // Logos dos parceiros visíveis (a LinQ é só de quem testa).
      expect(
        find.descendant(of: find.byKey(_card), matching: find.text('FA')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: find.byKey(_card), matching: find.text('LT')),
        findsNothing,
      );

      final cardRect = tester.getRect(find.byKey(_card));
      final classesRect = tester.getRect(
        find.byKey(const Key('compete-hub-classes')),
      );
      final organizersTop = tester.getRect(find.text('Organizadores')).top;
      expect(cardRect.width, greaterThan(430 * 0.85), reason: 'largura total');
      expect(cardRect.top, greaterThan(classesRect.bottom));
      expect(cardRect.bottom, lessThan(organizersTop));

      expect(service.of(BenefitEventType.hubCardView), hasLength(1));
      expect(
        service.of(BenefitEventType.hubCardView).single.source,
        BenefitSource.hubCard,
      );

      // Mesma sessão do app: não grava de novo.
      final container = ProviderScope.containerOf(
        tester.element(find.byType(TournamentDiscoveryPage)),
      );
      container.read(benefitsClubTrackerProvider).hubCardViewed();
      await tester.pump();
      expect(service.of(BenefitEventType.hubCardView), hasLength(1));

      await tester.tap(find.byKey(_card));
      await tester.pumpAndSettle();
      expect(find.text('clube hub_card'), findsOneWidget);
    },
  );

  testWidgets('flag desligada e sem teste: o Hub fica como era', (
    tester,
  ) async {
    final service = FakeBenefitsClubService();
    await _pumpHub(
      tester,
      service: service,
      config: const BenefitsClubConfig(testerUids: ['outra-pessoa']),
    );

    expect(find.byKey(_card), findsNothing);
    expect(find.textContaining('Clube de Vantagens'), findsNothing);
    expect(service.events, isEmpty);

    // Sem buraco: Organizadores logo depois da última linha da grade.
    final classesRect = tester.getRect(
      find.byKey(const Key('compete-hub-classes')),
    );
    final organizers = find.ancestor(
      of: find.text('Organizadores'),
      matching: find.byType(Material),
    );
    expect(
      tester.getRect(organizers.first).top,
      moreOrLessEquals(classesRect.bottom + 12, epsilon: 0.5),
    );
  });

  testWidgets('flag desligada: aparece para o uid em testerUids', (
    tester,
  ) async {
    await _pumpHub(
      tester,
      service: FakeBenefitsClubService(),
      config: const BenefitsClubConfig(testerUids: [testUid]),
    );

    expect(find.byKey(_card), findsOneWidget);
    // Quem testa vê também a LinQ (audience testers).
    expect(
      find.descendant(of: find.byKey(_card), matching: find.text('LT')),
      findsOneWidget,
    );
  });

  testWidgets('flag desligada: aparece para admin', (tester) async {
    await _pumpHub(
      tester,
      service: FakeBenefitsClubService(),
      config: const BenefitsClubConfig(),
      isAdmin: true,
    );

    expect(find.byKey(_card), findsOneWidget);
  });

  testWidgets('flag carregando: não aparece', (tester) async {
    await _pumpHub(
      tester,
      service: FakeBenefitsClubService(),
      configStream: pendingStream(),
    );
    expect(find.byKey(_card), findsNothing);
    expect(find.text('Organizadores'), findsOneWidget);
  });

  testWidgets('flag com erro: não aparece nem para admin', (tester) async {
    await _pumpHub(
      tester,
      service: FakeBenefitsClubService(),
      configStream: Stream.error(Exception('sem rede')),
      isAdmin: true,
    );
    expect(find.byKey(_card), findsNothing);
    expect(find.text('Organizadores'), findsOneWidget);
  });

  testWidgets('hubSponsorPartnerId visível: card em modo patrocinador', (
    tester,
  ) async {
    await _pumpHub(
      tester,
      service: FakeBenefitsClubService(),
      config: const BenefitsClubConfig(
        enabled: true,
        testerUids: [testUid],
        hubSponsorPartnerId: 'linq',
      ),
    );

    expect(find.byKey(_card), findsOneWidget);
    expect(find.text('OFERECIDO POR LINQ TELECOM'), findsOneWidget);
    // Selo NOVO continua no modo patrocinador.
    expect(
      find.descendant(of: find.byKey(_card), matching: find.text('NOVO')),
      findsOneWidget,
    );
    // Só a logo do patrocinador na faixa: nada de bolinhas dos parceiros.
    expect(
      find.descendant(
        of: find.byKey(_card),
        matching: find.byType(PartnerLogo),
      ),
      findsOneWidget,
    );
    // Título e subtítulo em uma linha, cortando com "…".
    for (final label in [
      'Clube de Vantagens Nexa',
      'Descontos dos parceiros NexaGO',
    ]) {
      final text = tester.widget<Text>(
        find.descendant(of: find.byKey(_card), matching: find.text(label)),
      );
      expect(text.maxLines, 1);
      expect(text.overflow, TextOverflow.ellipsis);
    }
    // Borda laranja da NexaGO, não a cor da marca do patrocinador.
    final material = tester.widget<Material>(
      find
          .descendant(of: find.byKey(_card), matching: find.byType(Material))
          .first,
    );
    expect(
      (material.shape! as RoundedRectangleBorder).side.color,
      AppColors.brand,
    );
    await tester.tap(find.byKey(_card));
    await tester.pumpAndSettle();
    expect(find.text('clube hub_card'), findsOneWidget);
  });

  testWidgets('patrocinador invisível para a pessoa: o card de sempre', (
    tester,
  ) async {
    await _pumpHub(
      tester,
      service: FakeBenefitsClubService(),
      // A LinQ é só de quem testa; esta pessoa não testa.
      config: const BenefitsClubConfig(
        enabled: true,
        hubSponsorPartnerId: 'linq',
      ),
    );

    expect(find.byKey(_card), findsOneWidget);
    expect(find.textContaining('OFERECIDO POR'), findsNothing);
    expect(
      find.descendant(of: find.byKey(_card), matching: find.text('NOVO')),
      findsOneWidget,
    );
  });
}
