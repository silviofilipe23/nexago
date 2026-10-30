import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/observability/analytics_service.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/data/athlete_home_tour_store.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_shell_providers.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_tour.dart';

import '../../support/recording_analytics.dart';

class _FakeStore extends AthleteHomeTourStore {
  _FakeStore({this.seen = 0});

  final int seen;
  final marked = <String>[];

  @override
  Future<int> seenVersion(String uid) async =>
      marked.contains(uid) ? AthleteHomeTourStore.version : seen;

  @override
  Future<void> markSeen(String uid) async => marked.add(uid);
}

const _profile = AthleteProfile(
  id: 'u1',
  name: 'Atleta Teste',
  sport: '',
  level: '',
  city: '',
);

/// Casca mínima: abas numa `IndexedStack` (como a do atleta, que monta todas)
/// e a barra embaixo. [tab] escolhe a aba à vista.
Widget _shell(
  ValueListenable<int> tab, {
  bool withBell = true,
  bool withFocusCard = false,
}) => Column(
      children: [
        Expanded(
          child: ValueListenableBuilder<int>(
            valueListenable: tab,
            builder: (_, index, __) => IndexedStack(
              index: index,
              children: [
                Column(
                  children: [
                    const SizedBox(height: 80),
                    Row(
                      children: [
                        const AthleteHomeTourAnchor(
                          target: AthleteHomeTourTarget.account,
                          child: SizedBox(width: 48, height: 48),
                        ),
                        const Spacer(),
                        if (withBell)
                          const AthleteHomeTourAnchor(
                            target: AthleteHomeTourTarget.notifications,
                            child: SizedBox(width: 42, height: 42),
                          ),
                      ],
                    ),
                    if (withFocusCard)
                      const AthleteHomeTourAnchor(
                        target: AthleteHomeTourTarget.focus,
                        child: SizedBox(height: 200, width: double.infinity),
                      ),
                  ],
                ),
                const SizedBox.shrink(),
                const SizedBox.shrink(),
                const Column(
                  children: [
                    SizedBox(height: 120),
                    Row(
                      children: [
                        Expanded(
                          child: AthleteHomeTourAnchor(
                            target: AthleteHomeTourTarget.tournaments,
                            child: SizedBox(height: 160),
                          ),
                        ),
                        Expanded(
                          child: AthleteHomeTourAnchor(
                            target: AthleteHomeTourTarget.ranking,
                            child: SizedBox(height: 160),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const AthleteHomeTourAnchor(
          target: AthleteHomeTourTarget.navBar,
          child: SizedBox(height: 80, width: double.infinity),
        ),
      ],
    );

void main() {
  group('showAthleteHomeTour', () {
    late ValueNotifier<int> tab;
    late List<int> shownTabs;

    Future<void> open(
      WidgetTester tester, {
      bool withBell = true,
      bool switchTabs = true,
      bool withFocusCard = false,
    }) async {
      tab = ValueNotifier(0);
      shownTabs = [];
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(
            body: Builder(
              builder: (context) => Stack(
                children: [
                  _shell(
                    tab,
                    withBell: withBell,
                    withFocusCard: withFocusCard,
                  ),
                  Center(
                    child: TextButton(
                      onPressed: () => showAthleteHomeTour(
                        context,
                        onShowTab: switchTabs
                            ? (i) {
                                shownTabs.add(i);
                                tab.value = i;
                              }
                            : null,
                      ),
                      child: const Text('abrir'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('abrir'));
      await tester.pumpAndSettle();
    }

    Future<void> next(WidgetTester tester) async {
      await tester.tap(find.byKey(const Key('athlete-home-tour-next')));
      await tester.pumpAndSettle();
    }

    testWidgets(
        'passa pelas abas: conta, sino, quadra, torneios, ranking, Focus, '
        'barra', (tester) async {
      await open(tester);

      expect(find.text('1 DE 7'), findsOneWidget);
      expect(find.text('Sua conta fica aqui'), findsOneWidget);

      await next(tester);
      expect(find.text('Avisos e convites'), findsOneWidget);
      expect(tab.value, 0);

      await next(tester);
      expect(find.text('Alugue uma quadra'), findsOneWidget);
      expect(
        tab.value,
        0,
        reason: 'a quadra é o botão Reservar da barra: abrir a aba poria o '
            'mapa nativo junto da barra nativa',
      );

      await next(tester);
      expect(find.text('Torneios e ligas'), findsOneWidget);
      expect(tab.value, athleteShellCompeteTabIndex);

      await next(tester);
      expect(find.text('Ranking'), findsOneWidget);

      await next(tester);
      expect(find.text('Modo Focus no dia do torneio'), findsOneWidget);
      expect(tab.value, 0, reason: 'o card do Focus mora na Início');

      await next(tester);
      expect(find.text('7 DE 7'), findsOneWidget);
      expect(find.text('Navegue pelas abas'), findsOneWidget);
      expect(tab.value, 0, reason: 'o último passo volta para a Início');
      expect(find.text('Entendi'), findsOneWidget);
      expect(
        find.byKey(const Key('athlete-home-tour-skip')),
        findsNothing,
        reason: 'no último passo só sobra o Entendi',
      );
      expect(
        shownTabs,
        [athleteShellCompeteTabIndex, 0],
        reason: 'troca de aba só quando o passo muda de aba',
      );

      await next(tester);
      expect(find.byType(AthleteHomeTourOverlay), findsNothing);
    });

    testWidgets('Pular fecha de uma vez', (tester) async {
      await open(tester);

      await tester.tap(find.byKey(const Key('athlete-home-tour-skip')));
      await tester.pumpAndSettle();

      expect(find.byType(AthleteHomeTourOverlay), findsNothing);
    });

    testWidgets('sem como trocar de aba fica só o que está na Início',
        (tester) async {
      await open(tester, switchTabs: false);

      expect(find.text('1 DE 5'), findsOneWidget);
      await next(tester);
      await next(tester);
      expect(find.text('Alugue uma quadra'), findsOneWidget);
      await next(tester);
      expect(find.text('Modo Focus no dia do torneio'), findsOneWidget);
      await next(tester);
      expect(find.text('Navegue pelas abas'), findsOneWidget);
      expect(tab.value, 0);
    });

    testWidgets('alvo fora da tela sai da conta sem furar o contador',
        (tester) async {
      await open(tester, withBell: false);

      expect(find.text('1 DE 6'), findsOneWidget);
      await next(tester);
      expect(find.text('2 DE 6'), findsOneWidget);
      expect(find.text('Alugue uma quadra'), findsOneWidget);
    });

    testWidgets('não é rota: a casca segue a rota atual e a barra nativa fica',
        (tester) async {
      // Qualquer rota por cima faz o plugin apagar a barra nativa do iOS e a
      // casca trocar para a cápsula Flutter — era o que o tour mostrava.
      await open(tester);

      final shell = tester.element(find.text('abrir'));
      expect(ModalRoute.of(shell)!.isCurrent, isTrue);
      expect(find.text('Sua conta fica aqui'), findsOneWidget);
    });

    testWidgets('cartão do alvo de cima fica abaixo dele, e o da barra acima',
        (tester) async {
      await open(tester);

      final account = AthleteHomeTourAnchor.rectOf(
        AthleteHomeTourTarget.account,
      )!;
      final card = tester.getRect(find.text('Sua conta fica aqui'));
      expect(card.top, greaterThan(account.bottom));

      for (var i = 0; i < 6; i++) {
        await next(tester);
      }

      final bar = AthleteHomeTourAnchor.rectOf(AthleteHomeTourTarget.navBar)!;
      final lastCard = tester.getRect(find.text('Navegue pelas abas'));
      expect(lastCard.bottom, lessThan(bar.top));
    });
  });

  group('passo do Modo Focus', () {
    Future<void> openFocusStep(
      WidgetTester tester, {
      required bool withFocusCard,
    }) async {
      final tab = ValueNotifier(0);
      final focusStep = athleteHomeTourSteps.firstWhere(
        (s) => s.target == AthleteHomeTourTarget.focus,
      );
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(
            body: Builder(
              builder: (context) => Stack(
                children: [
                  _shell(tab, withFocusCard: withFocusCard),
                  Center(
                    child: TextButton(
                      onPressed: () => showAthleteHomeTour(
                        context,
                        steps: [focusStep],
                        onShowTab: (i) => tab.value = i,
                      ),
                      child: const Text('abrir'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('abrir'));
      await tester.pumpAndSettle();
    }

    testWidgets('fora do dia do torneio: explica sem recorte', (tester) async {
      await openFocusStep(tester, withFocusCard: false);

      expect(
        find.byKey(const Key('athlete-home-tour-standalone')),
        findsOneWidget,
      );
      expect(find.textContaining('aparece um card no topo'), findsOneWidget);
      expect(find.text('NOVIDADE'), findsOneWidget, reason: 'passo único');
      expect(find.text('Entendi'), findsOneWidget);
    });

    testWidgets('com o card na tela: destaca o card', (tester) async {
      await openFocusStep(tester, withFocusCard: true);

      expect(
        find.byKey(const Key('athlete-home-tour-standalone')),
        findsNothing,
      );
      expect(find.textContaining('Deslize para entrar'), findsOneWidget);
      final card = AthleteHomeTourAnchor.rectOf(AthleteHomeTourTarget.focus)!;
      final text = tester.getRect(find.text('Modo Focus no dia do torneio'));
      expect(text.top, greaterThan(card.bottom));
    });
  });

  test('slotOf divide a barra em fatias iguais', () {
    const bar = Rect.fromLTWH(16, 700, 350, 64);

    expect(
      AthleteHomeTourAnchor.slotOf(bar, athleteShellReservarTabIndex, 5),
      const Rect.fromLTWH(156, 700, 70, 64),
    );
    expect(AthleteHomeTourAnchor.slotOf(bar, 0, 5).left, bar.left);
    expect(AthleteHomeTourAnchor.slotOf(bar, 4, 5).right, bar.right);
  });

  group('AthleteHomeTourAnnouncer', () {
    late RecordingAnalytics analytics;
    setUp(() => analytics = RecordingAnalytics());

    Future<_FakeStore> pumpShell(
      WidgetTester tester, {
      int seen = 0,
      int tab = 0,
    }) async {
      final store = _FakeStore(seen: seen);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authProvider.overrideWith(
              (ref) => Stream.value(MockUser(uid: 'u1')),
            ),
            athleteProfileProvider.overrideWith(
              (ref) => Stream.value(_profile),
            ),
            athleteShellTabIndexProvider.overrideWith((ref) => tab),
            athleteHomeTourStoreProvider.overrideWithValue(store),
            analyticsServiceProvider.overrideWithValue(analytics),
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            home: Scaffold(
              body: AthleteHomeTourAnnouncer(
                child: Consumer(
                  builder: (context, ref, _) => _shell(
                    ValueNotifier(ref.watch(athleteShellTabIndexProvider)),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(AthleteHomeTourAnnouncer.settleDelay);
      await tester.pumpAndSettle();
      return store;
    }

    testWidgets('abre na Início no primeiro acesso e grava que viu',
        (tester) async {
      final store = await pumpShell(tester);

      expect(find.text('Sua conta fica aqui'), findsOneWidget);
      expect(store.marked, ['u1']);
    });

    testWidgets('Pular no meio do Hub devolve o atleta à Início',
        (tester) async {
      await pumpShell(tester);
      final container = ProviderScope.containerOf(
        tester.element(find.byType(AthleteHomeTourAnnouncer)),
      );

      for (var i = 0; i < 3; i++) {
        await tester.tap(find.byKey(const Key('athlete-home-tour-next')));
        await tester.pumpAndSettle();
      }
      expect(find.text('Torneios e ligas'), findsOneWidget);
      expect(
        container.read(athleteShellTabIndexProvider),
        athleteShellCompeteTabIndex,
      );

      await tester.tap(find.byKey(const Key('athlete-home-tour-skip')));
      await tester.pumpAndSettle();
      expect(container.read(athleteShellTabIndexProvider), 0);
    });

    testWidgets('analytics: cada passo e onde o atleta pulou', (tester) async {
      await pumpShell(tester);

      await tester.tap(find.byKey(const Key('athlete-home-tour-next')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('athlete-home-tour-skip')));
      await tester.pumpAndSettle();

      final steps = analytics.of(#logHomeTourStep);
      expect(steps.map((c) => c.namedArguments[#step]), [1, 2]);
      expect(steps.map((c) => c.namedArguments[#target]), [
        'account',
        'notifications',
      ]);
      expect(steps.first.namedArguments[#total], 7);

      final finished = analytics.of(#logHomeTourFinished).single;
      expect(finished.namedArguments[#result], 'pulou');
      expect(finished.namedArguments[#step], 2);
      expect(finished.namedArguments[#version], AthleteHomeTourStore.version);
    });

    testWidgets('analytics: chegou ao fim registra "concluiu"', (tester) async {
      await pumpShell(tester);

      for (var i = 0; i < 7; i++) {
        await tester.tap(find.byKey(const Key('athlete-home-tour-next')));
        await tester.pumpAndSettle();
      }

      expect(analytics.of(#logHomeTourStep), hasLength(7));
      final finished = analytics.of(#logHomeTourFinished).single;
      expect(finished.namedArguments[#result], 'concluiu');
      expect(finished.namedArguments[#step], 7);
    });

    testWidgets('não abre de novo para quem já viu', (tester) async {
      await pumpShell(tester, seen: AthleteHomeTourStore.version);

      expect(find.byType(AthleteHomeTourOverlay), findsNothing);
    });

    testWidgets('quem viu a v3 vê só o passo novo do Focus', (tester) async {
      final store = await pumpShell(tester, seen: 3);

      expect(find.text('Modo Focus no dia do torneio'), findsOneWidget);
      expect(find.text('NOVIDADE'), findsOneWidget);
      expect(find.text('Sua conta fica aqui'), findsNothing);
      expect(store.marked, ['u1']);

      await tester.tap(find.text('Entendi'));
      await tester.pumpAndSettle();
      expect(find.byType(AthleteHomeTourOverlay), findsNothing);
      expect(analytics.of(#logHomeTourStep).single.namedArguments[#target],
          'focus');
    });

    testWidgets('não abre fora da aba Início', (tester) async {
      final store = await pumpShell(tester, tab: 1);

      expect(find.byType(AthleteHomeTourOverlay), findsNothing);
      expect(store.marked, isEmpty);
    });
  });
}
