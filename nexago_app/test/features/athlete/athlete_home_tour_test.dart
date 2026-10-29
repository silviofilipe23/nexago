import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
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

/// Tela com os três alvos, como a Início com a barra.
Widget _targets({bool withBell = true}) => Column(
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
        const Spacer(),
        const AthleteHomeTourAnchor(
          target: AthleteHomeTourTarget.navBar,
          child: SizedBox(height: 80, width: double.infinity),
        ),
      ],
    );

void main() {
  group('showAthleteHomeTour', () {
    Future<void> open(WidgetTester tester, {bool withBell = true}) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(
            body: Builder(
              builder: (context) => Stack(
                children: [
                  _targets(withBell: withBell),
                  Center(
                    child: TextButton(
                      onPressed: () => showAthleteHomeTour(context),
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

    testWidgets('passa pelos três passos e fecha no Entendi', (tester) async {
      await open(tester);

      expect(find.text('1 DE 3'), findsOneWidget);
      expect(find.text('Sua conta fica aqui'), findsOneWidget);

      await tester.tap(find.byKey(const Key('athlete-home-tour-next')));
      await tester.pumpAndSettle();
      expect(find.text('2 DE 3'), findsOneWidget);
      expect(find.text('Avisos e convites'), findsOneWidget);

      await tester.tap(find.byKey(const Key('athlete-home-tour-next')));
      await tester.pumpAndSettle();
      expect(find.text('3 DE 3'), findsOneWidget);
      expect(find.text('Entendi'), findsOneWidget);
      expect(
        find.byKey(const Key('athlete-home-tour-skip')),
        findsNothing,
        reason: 'no último passo só sobra o Entendi',
      );

      await tester.tap(find.byKey(const Key('athlete-home-tour-next')));
      await tester.pumpAndSettle();
      expect(find.byType(AthleteHomeTourOverlay), findsNothing);
    });

    testWidgets('Pular fecha de uma vez', (tester) async {
      await open(tester);

      await tester.tap(find.byKey(const Key('athlete-home-tour-skip')));
      await tester.pumpAndSettle();

      expect(find.byType(AthleteHomeTourOverlay), findsNothing);
    });

    testWidgets('alvo fora da tela sai da conta sem furar o contador',
        (tester) async {
      await open(tester, withBell: false);

      expect(find.text('1 DE 2'), findsOneWidget);
      await tester.tap(find.byKey(const Key('athlete-home-tour-next')));
      await tester.pumpAndSettle();
      expect(find.text('2 DE 2'), findsOneWidget);
      expect(find.text('Navegue pelas abas'), findsOneWidget);
    });

    testWidgets('cartão do passo de cima fica abaixo do alvo, e vice-versa',
        (tester) async {
      await open(tester);

      final account = AthleteHomeTourAnchor.rectOf(
        AthleteHomeTourTarget.account,
      )!;
      final card = tester.getRect(find.text('Sua conta fica aqui'));
      expect(card.top, greaterThan(account.bottom));

      await tester.tap(find.byKey(const Key('athlete-home-tour-next')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('athlete-home-tour-next')));
      await tester.pumpAndSettle();

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
              body: AthleteHomeTourAnnouncer(child: _targets()),
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
