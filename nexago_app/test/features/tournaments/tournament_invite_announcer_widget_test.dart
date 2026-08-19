import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_invite_announcer_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_invite_announcer.dart';

/// A decisão de qual convite anunciar é testada em
/// `tournament_invite_announcer_test.dart`. Aqui o que importa é o efeito: a
/// tela do convite abre sozinha ao entrar, e abre UMA vez por sessão.
void main() {
  final sessionStart = DateTime.utc(2026, 8, 19, 10, 0);

  TournamentPartnerInvite invite(String id) => TournamentPartnerInvite(
        id: id,
        tournamentId: 't1',
        categoryId: 'c1',
        inviterUid: 'u1',
        inviterName: 'Bia',
        inviteeUid: 'me',
        inviteeName: 'Léo',
        status: 'pending',
        createdAt: sessionStart.subtract(const Duration(hours: 1)),
        expiresAt: DateTime.now().add(const Duration(hours: 20)),
      );

  late List<String> openedInviteIds;

  Future<ProviderContainer> pump(
    WidgetTester tester,
    List<TournamentPartnerInvite> pending, {
    String uid = 'me',
  }) async {
    openedInviteIds = <String>[];
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => const TournamentInviteAnnouncer(
            child: Scaffold(body: Text('casca do atleta')),
          ),
        ),
        GoRoute(
          path: '/torneios-convite/:inviteId',
          name: 'tournamentPartnerInvite',
          builder: (_, state) {
            openedInviteIds.add(state.pathParameters['inviteId']!);
            return const Scaffold(body: Text('tela do convite'));
          },
        ),
      ],
    );
    addTearDown(router.dispose);

    final container = ProviderContainer(overrides: [
      announcerAthleteUidProvider.overrideWithValue(uid),
      inviteAnnouncementSessionProvider.overrideWithValue(
        InviteAnnouncementSession(startedAt: sessionStart),
      ),
      pendingTournamentPartnerInvitesProvider
          .overrideWith((ref) => Stream.value(pending)),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
    return container;
  }

  testWidgets('convite pendente abre a tela ao entrar', (tester) async {
    await pump(tester, [invite('a')]);

    expect(openedInviteIds, ['a']);
    expect(find.text('tela do convite'), findsOneWidget);
  });

  testWidgets('sem convite pendente nada é aberto', (tester) async {
    await pump(tester, const []);

    expect(openedInviteIds, isEmpty);
    expect(find.text('casca do atleta'), findsOneWidget);
  });

  testWidgets('sem sessão o anúncio não roda', (tester) async {
    await pump(tester, [invite('a')], uid: '');

    expect(openedInviteIds, isEmpty);
  });

  // "Decidir depois" é voltar: o convite segue pendente, mas não volta a abrir
  // nesta sessão — senão o atleta ficaria preso na mesma tela.
  testWidgets('voltar não reabre o mesmo convite na sessão', (tester) async {
    await pump(tester, [invite('a')]);
    expect(openedInviteIds, ['a']);

    final router = GoRouter.of(
      tester.element(find.text('tela do convite')),
    );
    router.pop();
    await tester.pumpAndSettle();

    expect(find.text('casca do atleta'), findsOneWidget);
    expect(openedInviteIds, ['a']);
  });
}
