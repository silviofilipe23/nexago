import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/data/match_point_write.dart';
import 'package:nexago_app/features/organizer/data/organizer_match_schedule_service.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_providers.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/organizer_match_live_table_page.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/organizer_match_navigation.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_widgets.dart';
import 'package:nexago_app/features/tournaments/data/tournament_matches_repository.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_point_event.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'package:wakelock_plus_platform_interface/wakelock_plus_platform_interface.dart';

/// Cobertura da mesa DEDICADA do "modo full" (`LiveTableFullModeMesa`), que
/// substitui a TELA INTEIRA quando o mesário liga o toggle no cabeçalho da
/// mesa normal — não é mais uma barra extra dentro da mesa pequena (esse
/// desenho foi removido). A mesa pequena, quando o modo full está desligado,
/// volta a ser exatamente a de antes (sem Quadra/Tempo/nada extra).
///
/// Duas armadilhas de infraestrutura de teste já confirmadas empiricamente
/// pelo agente anterior (preservadas aqui porque a tela ainda tem os mesmos
/// dois pontos de contato — `_presentMode` e o `Timer.periodic` do relógio):
///
/// 1. `SystemChrome.setEnabledSystemUIMode` trava para sempre em
///    `flutter test` puro sem mockar `SystemChannels.platform` — necessário
///    registrar `setMockMethodCallHandler` em `setUp`.
/// 2. `wakelock_plus` não expõe fake oficial: usamos a variável top-level
///    `@visibleForTesting` `wakelockPlusPlatformInstance` com um fake que
///    estende `WakelockPlusPlatformInterface`.
///
/// A tela tem um `Timer.periodic` (relógio decorrido) que nunca some
/// sozinho — por isso todos os testes usam `tester.pump()` explícito, nunca
/// `pumpAndSettle()`.
void main() {
  const tournamentId = 't1';
  const matchId = 'm1';
  const teamAId = 'team-a';
  const teamBId = 'team-b';
  const teamALabel = 'Marcos / Victor';
  const teamBLabel = 'Igor / João';

  late _FakeWakelockPlusPlatform fakeWakelock;
  late List<MethodCall> systemChromeCalls;
  late _FakeMatchesRepository fakeRepo;
  late StreamController<TournamentMatch?> matchController;

  setUp(() {
    fakeWakelock = _FakeWakelockPlusPlatform();
    wakelockPlusPlatformInstance = fakeWakelock;

    systemChromeCalls = [];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
      systemChromeCalls.add(call);
      return null;
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null);
  });

  TournamentMatch buildMatch({
    String servingTeamId = teamAId,
    int currentSetIndex = 0,
    List<TournamentMatchSet> sets = const [TournamentMatchSet(a: 0, b: 0)],
    String status = TournamentMatchStatus.inProgress,
    int bestOf = 3,
  }) {
    return TournamentMatch(
      id: matchId,
      tournamentId: tournamentId,
      categoryId: 'masc-open',
      round: 1,
      matchType: 'wb',
      poolId: '',
      teamAId: teamAId,
      teamBId: teamBId,
      status: status,
      resultA: '',
      resultB: '',
      isGroupMatch: false,
      matchNumber: 1,
      teamADescription: teamALabel,
      teamBDescription: teamBLabel,
      courtId: 'Q1',
      servingTeamId: servingTeamId,
      currentSetIndex: currentSetIndex,
      sets: sets,
      bestOf: bestOf,
    );
  }

  Future<GoRouter> pumpLiveTable(
    WidgetTester tester, {
    required TournamentMatch initialMatch,
    List<TournamentMatchPointEvent> pointEvents = const [],
    // Achado à parte (não é sobre o modo full em si): o layout NORMAL desta
    // tela já estoura `RenderFlex overflow` na superfície padrão do
    // `flutter test` (800×600) — usar uma altura generosa evita que esse
    // overflow (achado real, já reportado antes) mascare os testes de
    // estado que não são sobre pixel-perfect layout.
    Size surfaceSize = const Size(800, 1200),
  }) async {
    tester.view.physicalSize = surfaceSize;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    fakeRepo = _FakeMatchesRepository(initialMatch);
    // Single-subscription (não `.broadcast()`) DE PROPÓSITO: eventos
    // adicionados antes de qualquer `listen()` ficam enfileirados e são
    // entregues assim que o provider assina o stream — um `.broadcast()`
    // teria DESCARTADO o valor inicial por falta de assinante na hora do
    // `add`.
    matchController = StreamController<TournamentMatch?>();
    addTearDown(matchController.close);

    final router = GoRouter(
      initialLocation: '/home',
      routes: [
        GoRoute(
          path: '/home',
          builder: (_, __) => const Scaffold(body: Text('home stub')),
        ),
        GoRoute(
          path: AppRoutes.organizerMatchLive,
          name: AppRouteNames.organizerMatchLive,
          builder: (context, state) {
            final tid = state.pathParameters['tournamentId']?.trim() ?? '';
            final mid = state.pathParameters['matchId']?.trim() ?? '';
            return OrganizerMatchLiveTablePage(tournamentId: tid, matchId: mid);
          },
        ),
        GoRoute(
          path: AppRoutes.organizerMatchSummary,
          name: AppRouteNames.organizerMatchSummary,
          builder: (_, __) => const Scaffold(body: Text('summary stub')),
        ),
        GoRoute(
          path: AppRoutes.organizerMatchValidate,
          name: AppRouteNames.organizerMatchValidate,
          builder: (_, __) => const Scaffold(body: Text('validate stub')),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tournamentMatchesRepositoryProvider.overrideWithValue(fakeRepo),
          organizerMatchScheduleServiceProvider
              .overrideWithValue(_FakeScheduleService()),
          organizerMatchByIdProvider((
            tournamentId: tournamentId,
            matchId: matchId,
          )).overrideWith((ref) => matchController.stream),
          organizerMatchPointEventsProvider(matchId).overrideWith(
            (ref) => Stream<List<dynamic>>.value(pointEvents),
          ),
          organizerMatchCardsByIdProvider(tournamentId).overrideWith(
            (ref) => Stream.value(<String, TournamentMatchCardViewModel>{}),
          ),
          organizerTournamentDetailProvider(tournamentId).overrideWith(
            (ref) => Stream.value(
              const OrganizerTournamentDetailState(isLoading: false),
            ),
          ),
        ],
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ),
    );

    matchController.add(initialMatch);
    await tester.pump();

    router.push(organizerMatchLivePath(tournamentId, matchId));
    await tester.pump();
    // A transição de push (slide-in do Material) ainda está em andamento
    // depois de um `pump()` só — sem isso, o cabeçalho fica temporariamente
    // fora da faixa 0..width e qualquer `tester.tap()` no ícone falha o
    // hit-test. `pumpAndSettle()` não serve aqui (o relógio decorrido é um
    // `Timer.periodic` que nunca some sozinho).
    await tester.pump(const Duration(milliseconds: 400));

    return router;
  }

  Future<void> toggleFullMode(WidgetTester tester) async {
    // Não usar `find.byIcon(Icons.tune_rounded)` puro: o mesmo ícone também
    // aparece no chip "Formato: Melhor de 3" (`_FormatChip`), sem relação
    // com o modo full. Escopar por `LiveTableHeader` — só existe UM
    // tune_rounded ali dentro — resolve o problema.
    await tester.tap(
      find.descendant(
        of: find.byType(LiveTableHeader),
        matching: find.byIcon(Icons.tune_rounded),
      ),
    );
    await tester.pump();
  }

  // `_FullModeTeamPanel` é privado (outra library) — localizamos pelo nome
  // via `runtimeType.toString()`, o mesmo truque já usado em outros testes
  // do repositório para widgets privados.
  Finder fullModePanel() => find.byWidgetPredicate(
        (w) => w.runtimeType.toString() == '_FullModeTeamPanel',
      );

  // Só é seguro chamar isto DEPOIS de entrar no modo full: a mesa pequena
  // também mostra o mesmo texto do label da dupla (`LiveTableTeamScoreCard`),
  // então antes do toggle o `find.text(label)` bateria no widget errado.
  Finder panelWithLabel(String label) => find.ancestor(
        of: find.text(label),
        matching: fullModePanel(),
      );

  // Os dois pontinhos de tempo técnico são `Container`s 7×7 sem outro jeito
  // público de inspecionar `timeouts` (widget privado) — filtramos pelas
  // constraints exatas que só eles têm no painel (o badge "SAQUE" não tem
  // width/height fixos) e contamos quantos estão pintados com AppColors.brand.
  int filledTimeoutDots(WidgetTester tester, Finder panel) {
    final dots = tester
        .widgetList<Container>(
          find.descendant(of: panel, matching: find.byType(Container)),
        )
        .where((c) {
      final constraints = c.constraints;
      return constraints != null &&
          constraints.maxWidth == 7 &&
          constraints.maxHeight == 7;
    }).toList();
    expect(
      dots,
      hasLength(2),
      reason: 'cada painel do modo full deveria ter exatamente 2 pontinhos '
          'de tempo técnico',
    );
    return dots
        .where((c) => (c.decoration as BoxDecoration?)?.color == AppColors.brand)
        .length;
  }

  // Lê o `LiveTableActiveTimeout` que a tela passou pro overlay — mais
  // confiável que reler texto renderizado (o "M:SS" e o label da dupla
  // aparecem tanto no painel coberto quanto no overlay).
  LiveTableActiveTimeout overlayTimeout(WidgetTester tester) => tester
      .widget<LiveTableTechnicalTimeoutOverlay>(
        find.byType(LiveTableTechnicalTimeoutOverlay),
      )
      .timeout;

  // `_TimeoutRingPainter` é privado (mesmo truque de `_FullModeTeamPanel`):
  // localizamos o `CustomPaint` pelo `runtimeType` do painter e lemos
  // `color`/`progress` via `dynamic` — os NOMES dos campos não são privados,
  // só a classe é.
  dynamic timeoutRingPainter(WidgetTester tester) {
    final customPaint = tester.widget<CustomPaint>(
      find.byWidgetPredicate(
        (w) =>
            w is CustomPaint &&
            w.painter.runtimeType.toString() == '_TimeoutRingPainter',
      ),
    );
    return customPaint.painter;
  }

  // Avança o relógio em blocos de 1s — o mesmo `Timer.periodic` do relógio
  // decorrido tambem dá o tick do tempo técnico (`_maybeTickTechnicalTimeout`
  // roda antes do `setState` geral). `pumpAndSettle()` nunca serve aqui.
  Future<void> pumpSeconds(WidgetTester tester, int seconds) async {
    for (var i = 0; i < seconds; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
  }

  group('modo full desligado por padrão', () {
    testWidgets(
      'mostra a mesa pequena de sempre, sem a mesa dedicada do modo full',
      (tester) async {
        await pumpLiveTable(tester, initialMatch: buildMatch());

        expect(find.byType(LiveTableFullModeMesa), findsNothing);
        expect(find.byType(LiveTableHeader), findsOneWidget);
        expect(find.byType(LiveTableSetStrip), findsOneWidget);
        expect(find.byType(LiveTableTeamScoreBoard), findsOneWidget);
        expect(find.byType(LiveTableActionBar), findsOneWidget);
      },
    );
  });

  group('alternar modo full', () {
    testWidgets(
      'ligar troca a TELA INTEIRA pra mesa dedicada; a mesa pequena some '
      'por completo (não é mais uma barra extra)',
      (tester) async {
        await pumpLiveTable(tester, initialMatch: buildMatch());

        await toggleFullMode(tester);

        expect(find.byType(LiveTableFullModeMesa), findsOneWidget);
        expect(find.byType(LiveTableHeader), findsNothing);
        expect(find.byType(LiveTableSetStrip), findsNothing);
        expect(find.byType(LiveTableTeamScoreBoard), findsNothing);
        expect(find.byType(LiveTableActionBar), findsNothing);
      },
    );
  });

  group('marcar ponto tocando em qualquer lugar do painel', () {
    testWidgets('painel da dupla A credita ponto pro lado A de verdade', (
      tester,
    ) async {
      await pumpLiveTable(tester, initialMatch: buildMatch());
      await toggleFullMode(tester);

      await tester.tap(panelWithLabel(teamALabel));
      await tester.pump();
      await tester.pump();

      expect(fakeRepo.pointWrites, hasLength(1));
      expect(fakeRepo.pointWrites.single.pointEvent['side'], 'A');
    });

    testWidgets('painel da dupla B credita ponto pro lado B de verdade', (
      tester,
    ) async {
      await pumpLiveTable(tester, initialMatch: buildMatch());
      await toggleFullMode(tester);

      await tester.tap(panelWithLabel(teamBLabel));
      await tester.pump();
      await tester.pump();

      expect(fakeRepo.pointWrites, hasLength(1));
      expect(fakeRepo.pointWrites.single.pointEvent['side'], 'B');
    });
  });

  group('Trocar quadra', () {
    testWidgets(
      'troca a ordem visual e o painel que aparece à ESQUERDA credita o '
      'lado REAL certo',
      (tester) async {
        await pumpLiveTable(tester, initialMatch: buildMatch());
        await toggleFullMode(tester);

        // Antes de inverter: A está à esquerda de B.
        final beforeA = tester.getCenter(find.text(teamALabel)).dx;
        final beforeB = tester.getCenter(find.text(teamBLabel)).dx;
        expect(beforeA, lessThan(beforeB));

        await tester.tap(find.text('Trocar quadra'));
        await tester.pump();

        // Depois de inverter: B passa a aparecer à esquerda.
        final afterA = tester.getCenter(find.text(teamALabel)).dx;
        final afterB = tester.getCenter(find.text(teamBLabel)).dx;
        expect(
          afterB,
          lessThan(afterA),
          reason:
              'depois de "Trocar quadra" a dupla B deveria aparecer à esquerda',
        );

        // Tocar no painel da ESQUERDA (agora mostra a dupla B) tem que
        // creditar o ponto pra B de verdade — não pra A só porque A
        // "nasceu" no slot esquerdo.
        await tester.tap(panelWithLabel(teamBLabel));
        await tester.pump();
        await tester.pump();

        expect(fakeRepo.pointWrites, hasLength(1));
        expect(
          fakeRepo.pointWrites.single.pointEvent['side'],
          'B',
          reason: 'o painel da esquerda (visualmente B após o swap) tem que '
              'creditar o time B real, não o A',
        );
      },
    );
  });

  group('sem saque definido ainda', () {
    testWidgets(
      'tocar no painel ESCOLHE quem saca sem marcar ponto; só depois de '
      'escolhido o toque marca ponto de verdade',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(servingTeamId: ''),
        );
        await toggleFullMode(tester);

        await tester.tap(panelWithLabel(teamALabel));
        await tester.pump();
        await tester.pump();

        expect(
          fakeRepo.pointWrites,
          isEmpty,
          reason: 'antes de escolher quem saca, o toque não pode marcar ponto',
        );
        expect(fakeRepo.updateFieldsCalls, hasLength(1));
        expect(
          fakeRepo.updateFieldsCalls.single.fields['servingTeamId'],
          teamAId,
        );

        // Simula o Firestore devolvendo o saque já definido.
        matchController.add(buildMatch(servingTeamId: teamAId));
        await tester.pump();
        await tester.pump();

        await tester.tap(panelWithLabel(teamALabel));
        await tester.pump();
        await tester.pump();

        expect(fakeRepo.pointWrites, hasLength(1));
        expect(fakeRepo.pointWrites.single.pointEvent['side'], 'A');
      },
    );
  });

  group('Tempo técnico', () {
    testWidgets(
      'botão da barra incrementa o lado que está sacando, trava em 2, e o '
      '"−" do painel decrementa só aquele lado, com piso 0 — fechando o '
      'overlay (via "Encerrar tempo") entre cada chamada',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(servingTeamId: teamAId),
        );
        await toggleFullMode(tester);

        final panelA = panelWithLabel(teamALabel);
        final panelB = panelWithLabel(teamBLabel);

        expect(filledTimeoutDots(tester, panelA), 0);
        expect(filledTimeoutDots(tester, panelB), 0);

        // 1ª chamada: incrementa E abre o overlay bloqueando a mesa.
        await tester.tap(find.text('Tempo técnico'));
        await tester.pump();
        expect(filledTimeoutDots(tester, panelA), 1);
        expect(filledTimeoutDots(tester, panelB), 0);
        expect(find.byType(LiveTableTechnicalTimeoutOverlay), findsOneWidget);

        // Fecha o overlay pra poder chamar de novo — enquanto ele está
        // aberto, a barra de baixo (inclusive o próprio "Tempo técnico")
        // não recebe toque.
        await tester.tap(find.text('Encerrar tempo'));
        await tester.pump();
        expect(find.byType(LiveTableTechnicalTimeoutOverlay), findsNothing);

        // 2ª chamada: incrementa de novo.
        await tester.tap(find.text('Tempo técnico'));
        await tester.pump();
        expect(filledTimeoutDots(tester, panelA), 2);

        await tester.tap(find.text('Encerrar tempo'));
        await tester.pump();

        // 3ª chamada: trava em 2, não passa (nem incrementa, nem abre
        // overlay).
        await tester.tap(find.text('Tempo técnico'));
        await tester.pump();
        expect(filledTimeoutDots(tester, panelA), 2);
        expect(find.byType(LiveTableTechnicalTimeoutOverlay), findsNothing);

        // "−" no painel de B (nunca usou tempo técnico) fica no piso 0.
        await tester.tap(
          find.descendant(
            of: panelB,
            matching: find.byIcon(Icons.remove_rounded),
          ),
        );
        await tester.pump();
        expect(filledTimeoutDots(tester, panelB), 0);

        // "−" no painel de A desconta só o de A.
        await tester.tap(
          find.descendant(
            of: panelA,
            matching: find.byIcon(Icons.remove_rounded),
          ),
        );
        await tester.pump();
        expect(filledTimeoutDots(tester, panelA), 1);
        expect(filledTimeoutDots(tester, panelB), 0);

        // Tempo técnico é 100% estado local de tela — nada disso grava no
        // Firestore.
        expect(fakeRepo.pointWrites, isEmpty);
        expect(fakeRepo.updateFieldsCalls, isEmpty);
      },
    );

    testWidgets(
      'os pontinhos acompanham a Quadra: depois de inverter, aparecem no '
      'painel da direita',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(servingTeamId: teamAId),
        );
        await toggleFullMode(tester);

        await tester.tap(find.text('Tempo técnico'));
        await tester.pump();
        expect(filledTimeoutDots(tester, panelWithLabel(teamALabel)), 1);
        expect(filledTimeoutDots(tester, panelWithLabel(teamBLabel)), 0);

        // Fecha o overlay antes de continuar — aberto, ele cobre a mesa
        // inteira (inclusive "Trocar quadra") e absorve o toque.
        await tester.tap(find.text('Encerrar tempo'));
        await tester.pump();

        await tester.tap(find.text('Trocar quadra'));
        await tester.pump();

        expect(
          filledTimeoutDots(tester, panelWithLabel(teamALabel)),
          1,
          reason: 'o tempo marcado tem que ter seguido a dupla, não a posição',
        );
        expect(filledTimeoutDots(tester, panelWithLabel(teamBLabel)), 0);
      },
    );

    testWidgets(
      'tocar no "−" dentro do painel NÃO marca ponto (o gesto aninhado não '
      'vaza pro toque do painel maior)',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(servingTeamId: teamAId),
        );
        await toggleFullMode(tester);

        await tester.tap(find.text('Tempo técnico'));
        await tester.pump();

        // Fecha o overlay antes de tocar no "−" — aberto, ele absorveria o
        // toque antes dele chegar no painel por trás.
        await tester.tap(find.text('Encerrar tempo'));
        await tester.pump();

        final panelA = panelWithLabel(teamALabel);
        await tester.tap(
          find.descendant(
            of: panelA,
            matching: find.byIcon(Icons.remove_rounded),
          ),
        );
        await tester.pump();
        await tester.pump();

        expect(
          fakeRepo.pointWrites,
          isEmpty,
          reason: 'o toque no "−" vazou pro onTap do painel e marcou ponto',
        );
        expect(fakeRepo.updateFieldsCalls, isEmpty);
      },
    );
  });

  group('Tempo técnico: overlay de contagem regressiva', () {
    testWidgets(
      'tocar "Tempo técnico" abre o overlay com o time e o número do tempo '
      'certos, contando 60s a partir do início',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(servingTeamId: teamAId),
        );
        await toggleFullMode(tester);

        await tester.tap(find.text('Tempo técnico'));
        await tester.pump();

        expect(find.byType(LiveTableTechnicalTimeoutOverlay), findsOneWidget);
        final timeout = overlayTimeout(tester);
        expect(timeout.teamLabel, teamALabel);
        expect(timeout.timeoutNumber, 1);
        expect(timeout.remainingSeconds, 60);
        expect(timeout.totalSeconds, 60);
        expect(timeout.phase, LiveTableTimeoutPhase.running);
        expect(find.text('1º tempo do time'), findsOneWidget);
      },
    );

    testWidgets(
      'a contagem regressiva desce 1 segundo a cada tick do relógio da tela',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(servingTeamId: teamAId),
        );
        await toggleFullMode(tester);

        await tester.tap(find.text('Tempo técnico'));
        await tester.pump();
        expect(overlayTimeout(tester).remainingSeconds, 60);

        await pumpSeconds(tester, 1);
        expect(overlayTimeout(tester).remainingSeconds, 59);

        await pumpSeconds(tester, 5);
        expect(overlayTimeout(tester).remainingSeconds, 54);
      },
    );

    testWidgets(
      'chegando a 0: fase vira ended, mostra "TEMPO ENCERRADO" e some o '
      'botão "Pausar" (só "Encerrar tempo" fica)',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(servingTeamId: teamAId),
        );
        await toggleFullMode(tester);

        await tester.tap(find.text('Tempo técnico'));
        await tester.pump();

        await pumpSeconds(tester, 60);

        final timeout = overlayTimeout(tester);
        expect(timeout.remainingSeconds, 0);
        expect(timeout.phase, LiveTableTimeoutPhase.ended);
        expect(find.text('TEMPO ENCERRADO'), findsOneWidget);
        expect(find.text('Pausar'), findsNothing);
        expect(find.text('Retomar'), findsNothing);
        expect(find.text('Encerrar tempo'), findsOneWidget);
        expect(
          timeoutRingPainter(tester).color,
          AppColors.win,
          reason: 'tempo encerrado deveria pintar o anel de verde',
        );
      },
    );

    testWidgets(
      '"Pausar" trava a contagem (não desce mais) e "Retomar" volta a '
      'descer de onde parou',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(servingTeamId: teamAId),
        );
        await toggleFullMode(tester);

        await tester.tap(find.text('Tempo técnico'));
        await tester.pump();
        await pumpSeconds(tester, 1);
        expect(overlayTimeout(tester).remainingSeconds, 59);

        await tester.tap(find.text('Pausar'));
        await tester.pump();
        expect(overlayTimeout(tester).phase, LiveTableTimeoutPhase.paused);

        await pumpSeconds(tester, 5);
        expect(
          overlayTimeout(tester).remainingSeconds,
          59,
          reason: 'pausado, o contador não deveria descer',
        );

        await tester.tap(find.text('Retomar'));
        await tester.pump();
        expect(overlayTimeout(tester).phase, LiveTableTimeoutPhase.running);

        await pumpSeconds(tester, 1);
        expect(overlayTimeout(tester).remainingSeconds, 58);
      },
    );

    testWidgets(
      '"Encerrar tempo" durante a contagem (antes de chegar a 0) fecha o '
      'overlay na hora sem desfazer o incremento do contador',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(servingTeamId: teamAId),
        );
        await toggleFullMode(tester);

        await tester.tap(find.text('Tempo técnico'));
        await tester.pump();
        await pumpSeconds(tester, 3);
        expect(overlayTimeout(tester).remainingSeconds, 57);

        await tester.tap(find.text('Encerrar tempo'));
        await tester.pump();

        expect(find.byType(LiveTableTechnicalTimeoutOverlay), findsNothing);
        expect(find.byType(LiveTableFullModeMesa), findsOneWidget);
        expect(
          filledTimeoutDots(tester, panelWithLabel(teamALabel)),
          1,
          reason: 'encerrar o tempo antes do fim não desfaz o "chamado"',
        );
      },
    );

    testWidgets(
      'com o overlay aberto, a mesa por trás (painéis, barra de baixo e '
      '"⋮") não responde a toque',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(servingTeamId: teamAId),
        );
        await toggleFullMode(tester);

        await tester.tap(find.text('Tempo técnico'));
        await tester.pump();

        // Painel A: não credita ponto.
        await tester.tap(
          panelWithLabel(teamALabel),
          warnIfMissed: false,
        );
        await tester.pump();
        await tester.pump();
        expect(fakeRepo.pointWrites, isEmpty);

        // "Trocar saque": não grava nada.
        await tester.tap(find.text('Trocar saque'), warnIfMissed: false);
        await tester.pump();
        expect(fakeRepo.updateFieldsCalls, isEmpty);

        // "⋮": não abre o menu de mais opções.
        await tester.tap(
          find.byIcon(Icons.more_vert_rounded),
          warnIfMissed: false,
        );
        await tester.pump();
        expect(find.text('Placar completo'), findsNothing);

        // O overlay continua aberto o tempo todo — nada disso o fechou.
        expect(find.byType(LiveTableTechnicalTimeoutOverlay), findsOneWidget);
      },
    );

    testWidgets(
      'sons: "click" nos ticks em que o valor mostrado passa a ser 3, 2 e '
      '1; "alert" só ao chegar a 0; nada antes disso',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(servingTeamId: teamAId),
        );
        await toggleFullMode(tester);

        await tester.tap(find.text('Tempo técnico'));
        await tester.pump();
        systemChromeCalls.clear();

        List<MethodCall> soundCalls() => systemChromeCalls
            .where((c) => c.method == 'SystemSound.play')
            .toList();

        // 60 -> 11: ainda longe do fim, nenhum som.
        await pumpSeconds(tester, 49);
        expect(overlayTimeout(tester).remainingSeconds, 11);
        expect(
          soundCalls(),
          isEmpty,
          reason: 'a 11s restantes nenhum som deveria ter tocado ainda',
        );

        // 11 -> 10: ainda sem som (o gatilho é o valor MOSTRADO ser <= 3).
        await pumpSeconds(tester, 1);
        expect(overlayTimeout(tester).remainingSeconds, 10);
        expect(soundCalls(), isEmpty);

        // 10 -> 3: sétimo tick abaixo chega no "3" e toca 1 click.
        await pumpSeconds(tester, 7);
        expect(overlayTimeout(tester).remainingSeconds, 3);
        expect(
          soundCalls()
              .where((c) => c.arguments == 'SystemSoundType.click')
              .length,
          1,
        );
        expect(
          soundCalls()
              .where((c) => c.arguments == 'SystemSoundType.alert')
              .length,
          0,
        );

        // 3 -> 2 -> 1: mais 2 clicks (3 no total).
        await pumpSeconds(tester, 2);
        expect(overlayTimeout(tester).remainingSeconds, 1);
        expect(
          soundCalls()
              .where((c) => c.arguments == 'SystemSoundType.click')
              .length,
          3,
        );
        expect(
          soundCalls()
              .where((c) => c.arguments == 'SystemSoundType.alert')
              .length,
          0,
        );

        // 1 -> 0: alert, sem 4º click.
        await pumpSeconds(tester, 1);
        expect(overlayTimeout(tester).remainingSeconds, 0);
        expect(overlayTimeout(tester).phase, LiveTableTimeoutPhase.ended);
        expect(
          soundCalls()
              .where((c) => c.arguments == 'SystemSoundType.click')
              .length,
          3,
          reason: 'chegar a 0 não deveria disparar um 4º click',
        );
        expect(
          soundCalls()
              .where((c) => c.arguments == 'SystemSoundType.alert')
              .length,
          1,
        );
      },
    );

    testWidgets(
      'cor crítica: com 10s ou menos restantes (e ainda rodando) o anel '
      'usa AppColors.live em vez de AppColors.brand',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(servingTeamId: teamAId),
        );
        await toggleFullMode(tester);

        await tester.tap(find.text('Tempo técnico'));
        await tester.pump();
        expect(timeoutRingPainter(tester).color, AppColors.brand);

        // 60 -> 11: ainda não crítico.
        await pumpSeconds(tester, 49);
        expect(overlayTimeout(tester).remainingSeconds, 11);
        expect(timeoutRingPainter(tester).color, AppColors.brand);

        // 11 -> 10: crítico a partir daqui.
        await pumpSeconds(tester, 1);
        expect(overlayTimeout(tester).remainingSeconds, 10);
        expect(timeoutRingPainter(tester).color, AppColors.live);
      },
    );
  });

  group('barra de baixo: trocar saque / desfazer', () {
    testWidgets(
      '"Trocar saque" grava o outro time como sacador',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(servingTeamId: teamAId),
        );
        await toggleFullMode(tester);

        await tester.tap(find.text('Trocar saque'));
        await tester.pump();

        expect(fakeRepo.updateFieldsCalls, hasLength(1));
        expect(
          fakeRepo.updateFieldsCalls.single.fields['servingTeamId'],
          teamBId,
        );
      },
    );

    testWidgets(
      '"Desfazer" grava um evento undo-point do lado do último ponto',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(
            servingTeamId: teamAId,
            sets: const [TournamentMatchSet(a: 5, b: 3)],
          ),
          pointEvents: [
            TournamentMatchPointEvent(
              seq: 1,
              type: 'point',
              setIndex: 0,
              scoreA: 5,
              scoreB: 3,
              side: 'A',
              ts: DateTime(2026, 6, 16, 10, 5),
            ),
          ],
        );
        await toggleFullMode(tester);

        await tester.tap(find.text('Desfazer'));
        await tester.pump();
        await tester.pump();

        expect(fakeRepo.pointWrites, hasLength(1));
        expect(fakeRepo.pointWrites.single.pointEvent['type'], 'undo-point');
        expect(fakeRepo.pointWrites.single.pointEvent['side'], 'A');
      },
    );
  });

  group('partida completada desabilita a mesa, exceto o menu "⋮"', () {
    testWidgets(
      'os 4 botões da barra e o toque nos painéis ficam desabilitados; '
      'o "⋮" continua tocável',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(status: TournamentMatchStatus.completed),
        );
        await toggleFullMode(tester);

        await tester.tap(panelWithLabel(teamALabel));
        await tester.pump();
        await tester.pump();
        expect(fakeRepo.pointWrites, isEmpty);

        await tester.tap(find.text('Trocar saque'));
        await tester.pump();
        expect(fakeRepo.updateFieldsCalls, isEmpty);

        await tester.tap(find.text('Tempo técnico'));
        await tester.pump();
        expect(filledTimeoutDots(tester, panelWithLabel(teamALabel)), 0);

        await tester.tap(find.text('Desfazer'));
        await tester.pump();
        await tester.pump();
        expect(fakeRepo.pointWrites, isEmpty);

        final beforeA = tester.getCenter(find.text(teamALabel)).dx;
        await tester.tap(find.text('Trocar quadra'));
        await tester.pump();
        final afterA = tester.getCenter(find.text(teamALabel)).dx;
        expect(
          afterA,
          beforeA,
          reason: '"Trocar quadra" desabilitado não deveria mudar nada',
        );

        // O "⋮" continua tocável mesmo com tudo o mais desabilitado.
        await tester.tap(find.byIcon(Icons.more_vert_rounded));
        await tester.pump();
        expect(find.text('Placar completo'), findsOneWidget);
      },
    );
  });

  group('menu "⋮" (mais opções)', () {
    testWidgets(
      'abre com os itens certos quando a partida NÃO está completada',
      (tester) async {
        await pumpLiveTable(tester, initialMatch: buildMatch());
        await toggleFullMode(tester);

        await tester.tap(find.byIcon(Icons.more_vert_rounded));
        await tester.pump();

        expect(find.text('Alterar formato'), findsOneWidget);
        expect(find.text('Placar completo'), findsOneWidget);
        expect(find.text('Histórico'), findsOneWidget);
        expect(find.text('Modo exibição'), findsOneWidget);
        expect(find.text('Sair do modo full'), findsOneWidget);
      },
    );

    testWidgets(
      '"Alterar formato" não aparece quando a partida está completada',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(status: TournamentMatchStatus.completed),
        );
        await toggleFullMode(tester);

        await tester.tap(find.byIcon(Icons.more_vert_rounded));
        await tester.pump();

        expect(find.text('Alterar formato'), findsNothing);
        expect(find.text('Placar completo'), findsOneWidget);
      },
    );

    testWidgets('"Alterar formato" abre a folha de troca de sets', (
      tester,
    ) async {
      await pumpLiveTable(tester, initialMatch: buildMatch());
      await toggleFullMode(tester);

      await tester.tap(find.byIcon(Icons.more_vert_rounded));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(find.text('Alterar formato'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('Quantidade de sets'), findsOneWidget);
    });

    testWidgets('"Placar completo" abre a folha de placar completo', (
      tester,
    ) async {
      await pumpLiveTable(tester, initialMatch: buildMatch());
      await toggleFullMode(tester);

      await tester.tap(find.byIcon(Icons.more_vert_rounded));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(find.text('Placar completo'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.byType(LiveTableQuickScoreSheet), findsOneWidget);
    });

    testWidgets('"Histórico" navega pra tela de histórico', (tester) async {
      await pumpLiveTable(tester, initialMatch: buildMatch());
      await toggleFullMode(tester);

      await tester.tap(find.byIcon(Icons.more_vert_rounded));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(find.text('Histórico'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('summary stub'), findsOneWidget);
    });

    testWidgets('"Modo exibição" entra em present mode', (tester) async {
      await pumpLiveTable(tester, initialMatch: buildMatch());
      await toggleFullMode(tester);

      await tester.tap(find.byIcon(Icons.more_vert_rounded));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(find.text('Modo exibição'));
      await tester.pump();
      await tester.pump();

      expect(find.byType(LiveTablePresentView), findsOneWidget);
      expect(find.byType(LiveTableFullModeMesa), findsNothing);
      expect(
        fakeWakelock.toggles.last,
        isTrue,
        reason: 'entrar no modo exibição deveria ligar o wakelock',
      );
      expect(
        systemChromeCalls.last.arguments,
        'SystemUiMode.immersiveSticky',
      );
    });

    testWidgets(
      '"Sair do modo full" volta pra mesa pequena (a mesa dedicada some da '
      'árvore)',
      (tester) async {
        await pumpLiveTable(tester, initialMatch: buildMatch());
        await toggleFullMode(tester);
        expect(find.byType(LiveTableFullModeMesa), findsOneWidget);

        await tester.tap(find.byIcon(Icons.more_vert_rounded));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        await tester.tap(find.text('Sair do modo full'));
        await tester.pump();

        expect(find.byType(LiveTableFullModeMesa), findsNothing);
        expect(find.byType(LiveTableHeader), findsOneWidget);
      },
    );
  });
}

/// Fake do wakelock: `wakelock_plus` não expõe um fake oficial da platform
/// interface, então estendemos a classe abstrata diretamente (o mesmo padrão
/// que o próprio pacote usa no seu teste interno). Atribuído à variável
/// top-level `wakelockPlusPlatformInstance` (não ao setter de
/// `WakelockPlusPlatformInterface.instance` — `WakelockPlus.enable/disable`
/// lê a variável top-level, capturada uma única vez na carga da lib).
class _FakeWakelockPlusPlatform extends WakelockPlusPlatformInterface {
  final List<bool> toggles = [];
  bool _enabled = false;

  @override
  Future<void> toggle({required bool enable}) async {
    toggles.add(enable);
    _enabled = enable;
  }

  @override
  Future<bool> get enabled async => _enabled;
}

/// Dublê do repositório de partidas: intercepta `recordPointTransaction` sem
/// tocar no Firestore. `build` roda sobre [freshMatch] (o "doc lido dentro da
/// transação"), e o [MatchPointWrite] resultante é guardado pra inspeção —
/// é dali que os testes leem qual `side` foi de fato creditado, e não do
/// texto exibido na tela (que pode estar invertido pela Quadra).
class _FakeMatchesRepository implements TournamentMatchesRepository {
  _FakeMatchesRepository(this.freshMatch);

  final TournamentMatch freshMatch;
  final pointWrites = <MatchPointWrite>[];
  final updateFieldsCalls = <({String matchId, Map<String, dynamic> fields})>[];

  @override
  Future<MatchPointWrite?> recordPointTransaction({
    required String matchId,
    required MatchPointWrite? Function(TournamentMatch match) build,
  }) async {
    final write = build(freshMatch);
    if (write != null) pointWrites.add(write);
    return write;
  }

  @override
  Future<void> updateMatchFields({
    required String matchId,
    required Map<String, dynamic> fields,
  }) async {
    updateFieldsCalls.add((matchId: matchId, fields: fields));
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Dublê do serviço de callables — nenhum dos cenários de modo full aciona
/// "Placar completo"/W.O. de fato (só abrimos a folha), então qualquer
/// chamada aqui é sinal de teste tocando em algo que não deveria.
class _FakeScheduleService implements OrganizerMatchScheduleService {
  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê do serviço de agendamento não implementa '
      '${invocation.memberName}. Se a tela passou a chamá-lo, cubra-o aqui.',
    );
  }
}
