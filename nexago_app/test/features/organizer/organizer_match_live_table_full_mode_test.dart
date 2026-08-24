import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
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
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'package:wakelock_plus_platform_interface/wakelock_plus_platform_interface.dart';

/// Cobertura do "modo full" da mesa ao vivo do organizador (mesário que
/// também é o próprio árbitro, sem mais ninguém ajudando): Quadra (inverter
/// lados), Tempo (contador de tempo técnico) e Modo exibição (tela cheia
/// virada pros atletas). Nenhuma das três ferramentas grava no Firestore —
/// são só estado local de tela (`_fullMode`/`_sidesSwapped`/`_timeouts`/
/// `_presentMode` em `organizer_match_live_table_page.dart`).
///
/// Duas armadilhas de infraestrutura de teste, verificadas empiricamente
/// antes de escrever os casos abaixo (ver relatório):
///
/// 1. `SystemChrome.setEnabledSystemUIMode` NÃO é no-op por padrão no
///    `flutter test` puro — sem mockar `SystemChannels.platform`, o
///    `invokeMethod` trava para sempre (confirmado: um teste sem o mock
///    estourou o timeout de 10 minutos). É preciso registrar um
///    `setMockMethodCallHandler` em `setUp`.
/// 2. `wakelock_plus` (pacote novo, sem fake oficial exportado) expõe
///    `wakelockPlusPlatformInstance` — uma variável top-level
///    `@visibleForTesting` em `package:wakelock_plus/wakelock_plus.dart` —
///    exatamente para isto: basta atribuir um fake que `extends
///    WakelockPlusPlatformInterface` (pacote `wakelock_plus_platform_interface`,
///    adicionado como dev_dependency só para este teste).
///
/// A tela também tem um `Timer.periodic` (relógio decorrido) que nunca some
/// sozinho: por isso os testes aqui usam sempre `tester.pump()` explícito,
/// nunca `pumpAndSettle()` (que ficaria martelando pump() por até 10 minutos
/// esperando o timer parar de agendar frames, e estouraria por timeout). O
/// framework troca a árvore por um `Container` ao final de cada teste e faz
/// um `pump()` — isso já dispara `dispose()` (que cancela o timer) antes da
/// checagem de "timer pendente", então não precisa de limpeza manual.
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
    List<TournamentMatchSet> sets = const [TournamentMatchSet(a: 5, b: 3)],
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
    // Achado à parte (não é sobre o modo full em si): o layout NORMAL desta
    // tela (fora do modo exibição) já estoura `RenderFlex overflow` na
    // superfície padrão do `flutter test` (800×600) assim que a barra do
    // modo full aparece — sobra só ~30px de altura. Usar uma altura generosa
    // aqui evita que esse overflow (achado real, reportado à parte) mascare
    // os testes de estado que não são sobre pixel-perfect layout.
    Size surfaceSize = const Size(800, 1200),
  }) async {
    tester.view.physicalSize = surfaceSize;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    fakeRepo = _FakeMatchesRepository(initialMatch);
    // Single-subscription (não `.broadcast()`) DE PROPÓSITO: eventos
    // adicionados antes de qualquer `listen()` ficam enfileirados e são
    // entregues assim que o provider assina o stream (o que só acontece
    // depois do `router.push` montar a página) — um `.broadcast()` teria
    // DESCARTADO o valor inicial por falta de assinante na hora do `add`.
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
          organizerMatchPointEventsProvider(matchId)
              .overrideWith((ref) => Stream.value(const <dynamic>[])),
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
    // fora da faixa 0..width (ex.: x=964 numa tela de 800px) e qualquer
    // `tester.tap()` no ícone falha o hit-test. Não dá pra usar
    // `pumpAndSettle()` aqui (o relógio decorrido da tela é um
    // `Timer.periodic` que nunca some sozinho), então avançamos o relógio
    // fake por uma duração fixa suficiente pra a animação da rota terminar.
    await tester.pump(const Duration(milliseconds: 400));

    return router;
  }

  List<LiveTableTeamScoreCard> scoreCards(WidgetTester tester) {
    return tester
        .widgetList<LiveTableTeamScoreCard>(find.byType(LiveTableTeamScoreCard))
        .toList();
  }

  Future<void> toggleFullMode(WidgetTester tester) async {
    // Não usar `find.byIcon(Icons.tune_rounded)` puro: o mesmo ícone também
    // aparece no chip "Formato: Melhor de 3" (`_FormatChip`), sem relação
    // com o modo full. E `find.byTooltip` bate na caixa do `Tooltip`/
    // `RawTooltip`, cuja geometria não necessariamente coincide com o botão
    // visível (gera "would not hit test"). Escopar por `LiveTableHeader` —
    // só existe UM tune_rounded ali dentro — resolve os dois problemas.
    await tester.tap(
      find.descendant(
        of: find.byType(LiveTableHeader),
        matching: find.byIcon(Icons.tune_rounded),
      ),
    );
    await tester.pump();
  }

  group('modo full desligado por padrão', () {
    testWidgets(
      'sem barra de ferramentas e sem pontinhos de tempo técnico',
      (tester) async {
        await pumpLiveTable(tester, initialMatch: buildMatch());

        expect(find.byType(LiveTableFullModeBar), findsNothing);

        final cards = scoreCards(tester);
        expect(cards, hasLength(2));
        expect(cards[0].timeoutCount, isNull);
        expect(cards[1].timeoutCount, isNull);
      },
    );
  });

  group('alternar modo full', () {
    testWidgets(
      'tocar no ícone do cabeçalho revela a barra; tocar de novo esconde',
      (tester) async {
        await pumpLiveTable(tester, initialMatch: buildMatch());

        expect(find.byType(LiveTableFullModeBar), findsNothing);

        await toggleFullMode(tester);
        expect(find.byType(LiveTableFullModeBar), findsOneWidget);

        await toggleFullMode(tester);
        expect(find.byType(LiveTableFullModeBar), findsNothing);
      },
    );
  });

  group('Quadra (inverter lados)', () {
    testWidgets(
      'troca a ordem visual e credita o ponto no lado REAL certo',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(
            servingTeamId: teamAId,
            sets: const [TournamentMatchSet(a: 5, b: 3)],
          ),
        );
        await toggleFullMode(tester);

        // Antes de inverter: esquerda = A, direita = B.
        var cards = scoreCards(tester);
        expect(cards[0].team.label, teamALabel);
        expect(cards[0].score, 5);
        expect(cards[1].team.label, teamBLabel);
        expect(cards[1].score, 3);

        await tester.tap(find.text('Quadra'));
        await tester.pump();

        // Depois de inverter: a barra avisa "invertida" e a ordem visual virou.
        expect(find.text('Quadra (invertida)'), findsOneWidget);
        cards = scoreCards(tester);
        expect(
          cards[0].team.label,
          teamBLabel,
          reason: 'esquerda deveria mostrar a dupla B depois da troca',
        );
        expect(cards[0].score, 3);
        expect(
          cards[1].team.label,
          teamALabel,
          reason: 'direita deveria mostrar a dupla A depois da troca',
        );
        expect(cards[1].score, 5);

        // Tocar "+" na dupla que agora está à ESQUERDA (visualmente B) tem
        // que creditar o ponto pra B de verdade — não pra A só porque A
        // "nasceu" no slot esquerdo.
        await tester.tap(
          find.descendant(
            of: find.byType(LiveTableTeamScoreCard).at(0),
            matching: find.byIcon(Icons.add_rounded),
          ),
        );
        await tester.pump();
        await tester.pump();

        expect(
          fakeRepo.pointWrites,
          hasLength(1),
          reason: 'recordPointTransaction deveria ter sido chamado uma vez',
        );
        expect(
          fakeRepo.pointWrites.single.pointEvent['side'],
          'B',
          reason: 'o "+" da esquerda (visualmente B após o swap) tem que '
              'creditar o time B real, não o A',
        );
      },
    );
  });

  group('Tempo (tempo técnico)', () {
    testWidgets(
      'incrementa o lado que está sacando, trava em 2, e reseta ao trocar de set',
      (tester) async {
        final match = buildMatch(
          servingTeamId: teamAId,
          sets: const [TournamentMatchSet(a: 0, b: 0)],
        );
        await pumpLiveTable(tester, initialMatch: match);
        await toggleFullMode(tester);

        expect(scoreCards(tester)[0].timeoutCount, 0);

        await tester.tap(find.text('Tempo'));
        await tester.pump();
        expect(scoreCards(tester)[0].timeoutCount, 1);

        await tester.tap(find.text('Tempo'));
        await tester.pump();
        expect(scoreCards(tester)[0].timeoutCount, 2);

        // 3ª chamada: trava em 2, não passa.
        await tester.tap(find.text('Tempo'));
        await tester.pump();
        expect(scoreCards(tester)[0].timeoutCount, 2);

        // Troca de set (novo valor emitido no stream do provider) zera.
        matchController.add(
          buildMatch(
            servingTeamId: teamAId,
            currentSetIndex: 1,
            sets: const [
              TournamentMatchSet(a: 21, b: 15),
              TournamentMatchSet(a: 0, b: 0),
            ],
          ),
        );
        await tester.pump();
        await tester.pump();

        expect(scoreCards(tester)[0].timeoutCount, 0);
      },
    );

    testWidgets(
      'os pontinhos acompanham a Quadra: depois de inverter, aparecem no '
      'card da direita',
      (tester) async {
        // A mesma regra do ponto: `_addTimeout` credita o lado REAL que
        // saca, mas quem decide em qual CARD (esquerda/direita) os
        // pontinhos aparecem é a Quadra. Sem este teste, um bug que
        // trocasse `timeoutsA`/`timeoutsB` sem respeitar `_sidesSwapped`
        // passaria despercebido.
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(
            servingTeamId: teamAId,
            sets: const [TournamentMatchSet(a: 0, b: 0)],
          ),
        );
        await toggleFullMode(tester);

        await tester.tap(find.text('Tempo'));
        await tester.pump();
        expect(scoreCards(tester)[0].timeoutCount, 1);
        expect(scoreCards(tester)[1].timeoutCount, 0);

        await tester.tap(find.text('Quadra'));
        await tester.pump();

        expect(
          scoreCards(tester)[0].timeoutCount,
          0,
          reason: 'esquerda agora mostra B (que nunca sacou/marcou tempo)',
        );
        expect(
          scoreCards(tester)[1].timeoutCount,
          1,
          reason: 'direita agora mostra A — o tempo marcado tem que ter '
              'seguido a dupla, não a posição',
        );
      },
    );
  });

  group('Modo exibição', () {
    testWidgets(
      'troca para LiveTablePresentView; sair volta ao layout normal; '
      'liga/desliga wakelock e o modo de UI do sistema',
      (tester) async {
        await pumpLiveTable(tester, initialMatch: buildMatch());
        await toggleFullMode(tester);

        expect(find.byType(LiveTablePresentView), findsNothing);
        expect(find.byType(LiveTableHeader), findsOneWidget);

        await tester.tap(find.text('Modo exibição'));
        await tester.pump();
        await tester.pump();

        expect(find.byType(LiveTablePresentView), findsOneWidget);
        expect(find.byType(LiveTableHeader), findsNothing);
        expect(
          fakeWakelock.toggles.last,
          isTrue,
          reason: 'entrar no modo exibição deveria ligar o wakelock',
        );
        expect(
          systemChromeCalls.last.arguments,
          'SystemUiMode.immersiveSticky',
        );

        await tester.tap(find.byIcon(Icons.fullscreen_exit_rounded));
        await tester.pump();
        await tester.pump();

        expect(find.byType(LiveTablePresentView), findsNothing);
        expect(find.byType(LiveTableHeader), findsOneWidget);
        expect(
          fakeWakelock.toggles.last,
          isFalse,
          reason: 'sair do modo exibição deveria desligar o wakelock',
        );
        expect(systemChromeCalls.last.arguments, 'SystemUiMode.edgeToEdge');
      },
    );

    testWidgets(
      'continua tocável mesmo com a partida já completada (enabled: false '
      'no resto da barra)',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(status: TournamentMatchStatus.completed),
        );
        await toggleFullMode(tester);

        // Quadra some visual: tocar não faz nada (desabilitado).
        await tester.tap(find.text('Quadra'));
        await tester.pump();
        expect(
          find.text('Quadra (invertida)'),
          findsNothing,
          reason: 'partida completada deveria desabilitar Quadra',
        );

        // Modo exibição continua funcionando.
        await tester.tap(find.text('Modo exibição'));
        await tester.pump();
        await tester.pump();

        expect(find.byType(LiveTablePresentView), findsOneWidget);
      },
    );

    testWidgets(
      'em paisagem usa o layout lado a lado (times na mesma altura)',
      (tester) async {
        // Largura > altura (paisagem), com altura generosa o bastante pra
        // não esbarrar no overflow do layout normal (ver nota em
        // `pumpLiveTable` sobre `RenderFlex overflow` com a barra do modo
        // full) — o que queremos testar aqui é a orientação dentro de
        // `LiveTablePresentView`, não o encaixe da tela normal.
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(),
          surfaceSize: const Size(1200, 700),
        );
        await toggleFullMode(tester);
        await tester.tap(find.text('Modo exibição'));
        await tester.pump();
        await tester.pump();

        final dyA = tester.getCenter(find.text(teamALabel)).dy;
        final dyB = tester.getCenter(find.text(teamBLabel)).dy;
        expect(
          (dyA - dyB).abs(),
          lessThan(20),
          reason: 'em paisagem as duas duplas ficam lado a lado (mesma '
              'altura), não empilhadas',
        );
      },
    );

    testWidgets(
      'em retrato usa o layout empilhado (times em alturas bem diferentes)',
      (tester) async {
        await pumpLiveTable(
          tester,
          initialMatch: buildMatch(),
          surfaceSize: const Size(400, 900),
        );
        await toggleFullMode(tester);
        await tester.tap(find.text('Modo exibição'));
        await tester.pump();
        await tester.pump();

        final dyA = tester.getCenter(find.text(teamALabel)).dy;
        final dyB = tester.getCenter(find.text(teamBLabel)).dy;
        expect(
          (dyA - dyB).abs(),
          greaterThan(100),
          reason: 'em retrato as duplas ficam empilhadas (alturas bem '
              'diferentes), não lado a lado',
        );
      },
    );

    testWidgets(
      'dispose com _presentMode ainda ativo não lança exceção e restaura '
      'UI/wakelock',
      (tester) async {
        final router = await pumpLiveTable(tester, initialMatch: buildMatch());
        await toggleFullMode(tester);
        await tester.tap(find.text('Modo exibição'));
        await tester.pump();
        await tester.pump();

        expect(find.byType(LiveTablePresentView), findsOneWidget);

        // Sai da tela SEM tocar em "sair" — só navega pra trás, como um
        // mesário que aperta o botão físico de voltar do Android.
        router.pop();
        await tester.pump();
        // A transição reversa (slide-out) do Navigator só termina de
        // verdade com o relógio avançado o bastante — sem isso a página
        // antiga fica presa na árvore em transição, `dispose()` (que é quem
        // restaura wakelock/UI) ainda não rodou, e as checagens abaixo veem
        // o estado de ANTES de sair. 1s cobre com folga a duração padrão da
        // transição do Material.
        await tester.pump(const Duration(milliseconds: 1000));

        expect(tester.takeException(), isNull);
        expect(find.text('home stub'), findsOneWidget);
        expect(
          find.byType(OrganizerMatchLiveTablePage),
          findsNothing,
          reason: 'a página antiga precisa ter sido desmontada (dispose) '
              'pra restaurar wakelock/UI',
        );
        expect(fakeWakelock.toggles.last, isFalse);
        expect(systemChromeCalls.last.arguments, 'SystemUiMode.edgeToEdge');
      },
    );
  });
}

/// Fake do wakelock: `wakelock_plus` não expõe um fake oficial da platform
/// interface, então estendemos a classe abstrata diretamente (o mesmo padrão
/// que o próprio pacote usa no seu teste interno,
/// `ExtendsWakelockPlusPlatform`). Atribuído à variável top-level
/// `wakelockPlusPlatformInstance` (não ao setter de
/// `WakelockPlusPlatformInterface.instance` — `WakelockPlus.enable/disable`
/// lê a variável top-level, capturada uma única vez na carga da lib; setar
/// só o `.instance` não teria efeito nas chamadas já em cache).
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
/// "Placar completo"/W.O., então qualquer chamada aqui é sinal de teste
/// tocando em algo que não deveria.
class _FakeScheduleService implements OrganizerMatchScheduleService {
  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê do serviço de agendamento não implementa '
      '${invocation.memberName}. Se a tela passou a chamá-lo, cubra-o aqui.',
    );
  }
}
