import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/pending_tournament_invitee_invites_section.dart';

/// "Convites de dupla" na home — convites RECEBIDOS ainda pendentes,
/// simétrico ao card "Convites de dupla" do painel web. Ver
/// `pending_tournament_inviter_invites_section.dart` para o card irmão
/// (convites ENVIADOS), que não é tocado por este arquivo.
void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  TournamentPartnerInvite invite({
    String id = 'inv1',
    String inviterName = 'Bia',
    bool isTeamInvite = false,
    String? teamName,
    DateTime? createdAt,
    DateTime? expiresAt,
  }) =>
      TournamentPartnerInvite(
        id: id,
        tournamentId: 't1',
        categoryId: 'c1',
        inviterUid: 'u1',
        inviterName: inviterName,
        inviteeUid: 'me',
        inviteeName: 'Léo',
        status: 'pending',
        createdAt: createdAt ?? DateTime.now().subtract(const Duration(hours: 2)),
        expiresAt: expiresAt ??
            DateTime.now().add(const Duration(days: 1, hours: 4)),
        isTeamInvite: isTeamInvite,
        teamName: teamName,
      );

  TournamentDetail tournamentDetail() => TournamentDetail(
        id: 't1',
        name: 'Copa VH',
        location: 'Arena CFC',
        city: 'Aparecida',
        dateLabel: '',
        startDate: DateTime(2026, 6, 20),
        endDate: null,
        categories: const [],
        categoryOffers: [
          TournamentCategoryOffer(
            id: 'c1',
            name: 'Masculino',
            entryFee: 180,
            level: 'Intermediário',
            genderType: 'male',
          ),
        ],
        format: TournamentFormat.dupla,
        priceLabel: r'R$ 180',
        priceValue: 180,
        spotsLeft: 8,
        spotsTotal: 16,
        status: TournamentListingStatus.open,
        featured: false,
        enrolledCount: 4,
        liveMatchesNow: 0,
      );

  late List<String> openedInviteIds;

  Future<void> pumpStream(
    WidgetTester tester,
    Stream<List<TournamentPartnerInvite>> pending,
  ) async {
    openedInviteIds = <String>[];
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) =>
              const Scaffold(body: PendingTournamentInviteeInvitesSection()),
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

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          pendingTournamentPartnerInvitesProvider.overrideWith((ref) => pending),
          tournamentDetailProvider('t1')
              .overrideWith((ref) => Stream.value(tournamentDetail())),
          appUserPublicProfileProvider('u1').overrideWith(
            (ref) async => const AppUserProfile(
              uid: 'u1',
              fullName: 'Silvio Dionizio',
              profilePhotoUrl: 'https://example.com/silvio.jpg',
            ),
          ),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> pump(
    WidgetTester tester,
    List<TournamentPartnerInvite> pending,
  ) =>
      pumpStream(tester, Stream.value(pending));

  testWidgets('sem convite pendente a seção não ocupa espaço', (tester) async {
    await pump(tester, const []);

    expect(find.text('Convites de dupla'), findsNothing);
  });

  testWidgets('convite de dupla mostra o nome de quem chamou', (tester) async {
    await pump(tester, [invite(inviterName: 'Bia')]);

    expect(find.text('Convites de dupla'), findsOneWidget);
    expect(find.text('Bia te chamou pra dupla'), findsOneWidget);
    expect(find.text('CONVITE PENDENTE'), findsOneWidget);
    expect(find.textContaining('Falta só você'), findsOneWidget);
    expect(find.text('Toque para visualizar'), findsOneWidget);
    expect(find.text('1'), findsOneWidget);
  });

  testWidgets('convite de equipe mostra o nome da equipe', (tester) async {
    await pump(
      tester,
      [invite(inviterName: 'Bia', isTeamInvite: true, teamName: 'Trovão')],
    );

    expect(find.text('Bia te chamou pra equipe Trovão'), findsOneWidget);
    expect(find.textContaining('equipe estar fechada'), findsOneWidget);
  });

  testWidgets(
      'convite de equipe sem nome de equipe (nulo ou vazio) cai no texto de dupla',
      (tester) async {
    await pump(tester, [
      invite(id: 'a', inviterName: 'Bia', isTeamInvite: true),
      invite(id: 'b', inviterName: 'Caio', isTeamInvite: true, teamName: ''),
    ]);

    expect(find.text('Bia te chamou pra dupla'), findsOneWidget);
    expect(find.text('Caio te chamou pra dupla'), findsOneWidget);
    expect(find.textContaining('equipe'), findsNothing);
  });

  testWidgets('toque no card abre a tela de resposta do convite',
      (tester) async {
    await pump(tester, [invite(id: 'inv-xyz')]);

    await tester.tap(find.text('Toque para visualizar'));
    await tester.pumpAndSettle();

    expect(openedInviteIds, ['inv-xyz']);
    expect(find.text('tela do convite'), findsOneWidget);
  });

  testWidgets(
      'lista todos os convites pendentes recebidos, um card por convite, na ordem do provider',
      (tester) async {
    await pump(tester, [
      invite(id: 'a', inviterName: 'Bia'),
      invite(id: 'b', inviterName: 'Caio'),
    ]);

    expect(find.text('Bia te chamou pra dupla'), findsOneWidget);
    expect(find.text('Caio te chamou pra dupla'), findsOneWidget);
    expect(find.text('CONVITE PENDENTE'), findsNWidgets(2));
    expect(find.text('2'), findsOneWidget);

    final biaTop = tester.getTopLeft(find.text('Bia te chamou pra dupla')).dy;
    final caioTop =
        tester.getTopLeft(find.text('Caio te chamou pra dupla')).dy;
    expect(
      biaTop,
      lessThan(caioTop),
      reason: 'o card de Bia (primeiro no provider) deve vir acima do de Caio',
    );
  });

  testWidgets('mostra idade, prazo e detalhes do torneio quando disponíveis',
      (tester) async {
    await pump(tester, [invite()]);

    expect(find.text('HÁ 2 H'), findsOneWidget);
    expect(find.textContaining('VENCE EM 1 DIA'), findsOneWidget);
    expect(find.textContaining('Intermediário'), findsOneWidget);
    expect(find.textContaining('jun'), findsOneWidget);
    expect(find.text('LÉ'), findsOneWidget);
  });

  testWidgets('quando o provider emite erro a seção não ocupa espaço',
      (tester) async {
    await pumpStream(
      tester,
      Stream.error(Exception('falha ao carregar convites')),
    );

    expect(find.text('Convites de dupla'), findsNothing);
    expect(find.text('CONVITE PENDENTE'), findsNothing);
  });

  testWidgets(
      'seção some quando o provider atualiza de convites pendentes pra lista vazia',
      (tester) async {
    final pending = StreamController<List<TournamentPartnerInvite>>();
    addTearDown(pending.close);
    await pumpStream(tester, pending.stream);

    pending.add([invite(inviterName: 'Bia')]);
    await tester.pumpAndSettle();
    expect(find.text('Convites de dupla'), findsOneWidget);
    expect(find.text('Bia te chamou pra dupla'), findsOneWidget);

    pending.add(const []);
    await tester.pumpAndSettle();
    expect(find.text('Convites de dupla'), findsNothing);
    expect(find.text('Bia te chamou pra dupla'), findsNothing);
  });
}
