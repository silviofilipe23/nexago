import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/data/athlete_home_tour_store.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_shell_providers.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_tour.dart';

class _FakeStore extends AthleteHomeTourStore {
  _FakeStore({this.alreadySeen = false});

  final bool alreadySeen;
  final marked = <String>[];

  @override
  Future<bool> seen(String uid) async => alreadySeen || marked.contains(uid);

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
Widget _shell(ValueListenable<int> tab, {bool withBell = true}) => Column(
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
                  ],
                ),
                const SizedBox.shrink(),
                const Column(
                  children: [
                    SizedBox(height: 80),
                    AthleteHomeTourAnchor(
                      target: AthleteHomeTourTarget.bookCourt,
                      child: SizedBox(height: 48, width: double.infinity),
                    ),
                  ],
                ),
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
                  _shell(tab, withBell: withBell),
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

    testWidgets('passa pelas abas: conta, sino, quadra, torneios, ranking, barra',
        (tester) async {
      await open(tester);

      expect(find.text('1 DE 6'), findsOneWidget);
      expect(find.text('Sua conta fica aqui'), findsOneWidget);

      await next(tester);
      expect(find.text('Avisos e convites'), findsOneWidget);
      expect(tab.value, 0);

      await next(tester);
      expect(find.text('Alugue uma quadra'), findsOneWidget);
      expect(tab.value, athleteShellReservarTabIndex);

      await next(tester);
      expect(find.text('Torneios e ligas'), findsOneWidget);
      expect(tab.value, athleteShellCompeteTabIndex);

      await next(tester);
      expect(find.text('Ranking'), findsOneWidget);

      await next(tester);
      expect(find.text('6 DE 6'), findsOneWidget);
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
        [athleteShellReservarTabIndex, athleteShellCompeteTabIndex, 0],
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

      expect(find.text('1 DE 3'), findsOneWidget);
      await next(tester);
      await next(tester);
      expect(find.text('Navegue pelas abas'), findsOneWidget);
      expect(tab.value, 0);
    });

    testWidgets('alvo fora da tela sai da conta sem furar o contador',
        (tester) async {
      await open(tester, withBell: false);

      expect(find.text('1 DE 5'), findsOneWidget);
      await next(tester);
      expect(find.text('2 DE 5'), findsOneWidget);
      expect(find.text('Alugue uma quadra'), findsOneWidget);
    });

    testWidgets('cartão do alvo de cima fica abaixo dele, e o da barra acima',
        (tester) async {
      await open(tester);

      final account = AthleteHomeTourAnchor.rectOf(
        AthleteHomeTourTarget.account,
      )!;
      final card = tester.getRect(find.text('Sua conta fica aqui'));
      expect(card.top, greaterThan(account.bottom));

      for (var i = 0; i < 5; i++) {
        await next(tester);
      }

      final bar = AthleteHomeTourAnchor.rectOf(AthleteHomeTourTarget.navBar)!;
      final lastCard = tester.getRect(find.text('Navegue pelas abas'));
      expect(lastCard.bottom, lessThan(bar.top));
    });
  });

  group('AthleteHomeTourAnnouncer', () {
    Future<_FakeStore> pumpShell(
      WidgetTester tester, {
      bool alreadySeen = false,
      int tab = 0,
    }) async {
      final store = _FakeStore(alreadySeen: alreadySeen);
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

    testWidgets('não abre de novo para quem já viu', (tester) async {
      await pumpShell(tester, alreadySeen: true);

      expect(find.byType(AthleteHomeTourOverlay), findsNothing);
    });

    testWidgets('não abre fora da aba Início', (tester) async {
      final store = await pumpShell(tester, tab: 1);

      expect(find.byType(AthleteHomeTourOverlay), findsNothing);
      expect(store.marked, isEmpty);
    });
  });
}
