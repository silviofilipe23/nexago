import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/tournaments/data/tournament_partner_invite_service.dart';
import 'package:nexago_app/features/tournaments/data/tournament_registration_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/registration_wizard/registration_waiting_page.dart';

/// Testes da etapa 5 do wizard: **aguardando a dupla**.
///
/// A tela é VIVA — ela existe para reagir ao aceite do parceiro — então quase
/// todo caso aqui empurra emissões novas no stream de convites do convidante
/// e cobra o que a tela faz a seguir. Como as asserções são sobre ROTA, o
/// harness (mesmo padrão de `registration_partner_page_test.dart`) registra
/// cada rota-alvo com um builder que anota o nome e os query params.
///
/// O `MediaQuery(disableAnimations: true)` em volta da tela não é decoração:
/// o orbe de espera pulsa em `repeat()` e sem esse caminho nenhum
/// `pumpAndSettle` assenta.
void main() {
  const meuUid = 'atleta-1';

  TournamentCategoryOffer dupla({
    String id = 'masc',
    String? uniformType,
  }) => TournamentCategoryOffer(
    id: id,
    name: 'Dupla Masculina',
    genderType: 'male',
    entryFee: 100,
    maxTeams: 8,
    spotsTotal: 8,
    spotsLeft: 8,
    uniformType: uniformType,
  );

  TournamentDetail torneio(
    List<TournamentCategoryOffer> categorias, {
    bool requireFormedPair = false,
  }) =>
      TournamentDetail(
        id: 't1',
        name: 'Copa de Teste',
        location: 'Arena Teste',
        city: 'Goiânia',
        dateLabel: '20–22 Ago',
        startDate: DateTime(2026, 8, 20),
        endDate: DateTime(2026, 8, 22),
        categories: const [],
        format: TournamentFormat.dupla,
        priceLabel: 'R\$ 100',
        priceValue: 100,
        spotsLeft: 8,
        spotsTotal: 8,
        status: TournamentListingStatus.open,
        featured: false,
        enrolledCount: 0,
        liveMatchesNow: 0,
        categoryOffers: categorias,
        sport: 'beachTennis',
        requireFormedPair: requireFormedPair,
      );

  /// Convite que EU enviei — o único que esta tela acompanha.
  TournamentPartnerInvite convite({
    String id = 'convite-1',
    String categoryId = 'masc',
    String status = 'pending',
    String? registrationId,
    DateTime? expiresAt,
  }) => TournamentPartnerInvite(
    id: id,
    tournamentId: 't1',
    categoryId: categoryId,
    inviterUid: meuUid,
    inviterName: 'Eu Mesmo',
    inviteeUid: 'parceiro-1',
    inviteeName: 'Bruno Alves',
    status: status,
    registrationId: registrationId,
    createdAt: DateTime(2026, 8, 1),
    expiresAt: expiresAt ?? DateTime(2027, 1, 1),
  );

  AthleteProfile perfil() => const AthleteProfile(
    id: meuUid,
    name: 'Eu Mesmo',
    sport: 'Beach Tennis',
    level: 'Open',
    city: 'Goiânia',
    gender: 'Masculino',
    phoneVerified: true,
    onboardingCompleted: true,
    isProfileComplete: true,
  );

  late List<String> rotasAbertas;
  late Map<String, String>? destinoQueryParams;
  late _FakeInviteService servico;

  Future<void> abrirTela(
    WidgetTester tester, {
    required TournamentDetail tournament,
    String categoryId = 'masc',
    String? registrationId,
    String? inviteId,
    bool lgpdAccepted = true,
    List<TournamentPartnerInvite>? convites,
    Stream<List<TournamentPartnerInvite>>? convitesStream,
    TournamentRegistrationSnapshot? snapshot,
    /// Convite lido por ID — é por ele que a tela descobre o desfecho quando
    /// o convite some da lista do convidante.
    TournamentPartnerInvite? convitePorId,
    /// Monta a PILHA REAL: a etapa 4 empurra o porteiro com `push` e o
    /// porteiro se substitui pela espera, então a busca de parceiro fica
    /// viva embaixo. É a pilha em que sair da espera pode cair na busca.
    bool pilhaDoParceiro = false,
  }) async {
    // Tela alta o bastante pra caber o orbe + o cartão da dupla + os botões;
    // o viewport padrão do teste corta antes do rodapé e o `tap` recusaria.
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    rotasAbertas = <String>[];
    destinoQueryParams = null;
    servico = _FakeInviteService();

    GoRoute alvo(String path, String nome, String rotulo) => GoRoute(
      path: path,
      name: nome,
      builder: (_, state) {
        rotasAbertas.add(rotulo);
        destinoQueryParams = Map.of(state.uri.queryParameters);
        return Scaffold(body: Text(rotulo));
      },
    );

    final router = GoRouter(
      initialLocation: pilhaDoParceiro
          ? '/torneios/t1/inscricao/parceiro'
          : '/torneios/t1/inscricao/aguardando',
      routes: [
        GoRoute(
          path: AppRoutes.tournamentRegistrationWaiting,
          name: AppRouteNames.tournamentRegistrationWaiting,
          builder: (_, __) => MediaQuery(
            data: const MediaQueryData(disableAnimations: true),
            child: RegistrationWaitingPage(
              tournamentId: 't1',
              categoryId: categoryId,
              registrationId: registrationId,
              inviteId: inviteId,
              lgpdAccepted: lgpdAccepted,
            ),
          ),
        ),
        alvo(
          AppRoutes.tournamentRegistration,
          AppRouteNames.tournamentRegistration,
          'porteiro',
        ),
        alvo(
          AppRoutes.tournamentRegistrationPartner,
          AppRouteNames.tournamentRegistrationPartner,
          'parceiro',
        ),
        alvo(
          AppRoutes.tournamentRegistrationUniform,
          AppRouteNames.tournamentRegistrationUniform,
          'uniforme',
        ),
        alvo(
          AppRoutes.tournamentRegistrationPayment,
          AppRouteNames.tournamentRegistrationPayment,
          'pagamento',
        ),
        alvo(
          AppRoutes.tournamentDetail,
          AppRouteNames.tournamentDetail,
          'detalhe do torneio',
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          athleteProfileProvider.overrideWith((ref) => Stream.value(perfil())),
          tournamentDetailProvider(
            't1',
          ).overrideWith((ref) => Stream.value(tournament)),
          tournamentPartnerInviteServiceProvider.overrideWithValue(servico),
          inviterTournamentPartnerInvitesProvider.overrideWith(
            (ref) => convitesStream ?? Stream.value(convites ?? [convite()]),
          ),
          if (convitePorId != null)
            tournamentPartnerInviteProvider(
              convitePorId.id,
            ).overrideWith((ref) => Stream.value(convitePorId)),
          if (registrationId != null)
            tournamentRegistrationSnapshotProvider(
              registrationId,
            ).overrideWith((ref) => Stream.value(snapshot)),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    if (pilhaDoParceiro) {
      await tester.pumpAndSettle();
      router.pushNamed(
        AppRouteNames.tournamentRegistrationWaiting,
        pathParameters: {'tournamentId': 't1'},
        queryParameters: {
          'categoryId': categoryId,
          if (registrationId != null) 'registrationId': registrationId,
          if (lgpdAccepted) 'lgpd': '1',
        },
      );
      await tester.pumpAndSettle();
      // A busca já foi construída no boot; o que interessa daqui em diante é
      // o que a SAÍDA abre.
      rotasAbertas.clear();
      destinoQueryParams = null;
      return;
    }
    if (convitesStream == null) {
      await tester.pumpAndSettle();
    } else {
      // Um stream que ainda não emitiu deixa a tela no loader, e o loader
      // gira para sempre: quem controla o stream é que decide quando o teste
      // pode assentar.
      await tester.pump();
    }
  }

  // ── a espera ─────────────────────────────────────────────────────────────

  testWidgets('mostra quem foi convidado e que a resposta ainda não veio', (
    tester,
  ) async {
    await abrirTela(tester, tournament: torneio([dupla()]));

    expect(find.text('Aguardando confirmação'), findsOneWidget);
    expect(find.text('Bruno Alves'), findsOneWidget);
    expect(find.textContaining('Bruno recebeu'), findsOneWidget);
    expect(find.textContaining('Sua vaga fica reservada por'), findsOneWidget);
  });

  testWidgets(
    'com dupla obrigatória não promete reserva de vaga antes do aceite',
    (tester) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()], requireFormedPair: true),
      );

      expect(find.text('Aguardando confirmação'), findsOneWidget);
      expect(
        find.textContaining('A vaga só é confirmada quando o parceiro aceitar'),
        findsOneWidget,
      );
      expect(find.textContaining('Sua vaga fica reservada por'), findsNothing);
    },
  );

  testWidgets(
    'não oferece "Reenviar convite": não existe callable de reenvio para '
    'convite de dupla',
    (tester) async {
      // `resendSubstitutionInvite` recusa qualquer convite que não seja de
      // substituição (`failed-precondition`). Um botão permanentemente cinza
      // seria pior que a ausência da ação.
      await abrirTela(tester, tournament: torneio([dupla()]));

      // Âncora: sem ela o `findsNothing` passaria com a tela em branco.
      expect(find.text('Aguardando confirmação'), findsOneWidget);
      expect(find.text('Continuar no app'), findsOneWidget);
      expect(find.text('Reenviar convite'), findsNothing);
    },
  );

  testWidgets('a ação destrutiva diz que cancela o CONVITE', (tester) async {
    // Aqui não existe inscrição — o backend só a cria no aceite. O rótulo
    // antigo do widget ("Cancelar inscrição") prometia algo que não existe.
    await abrirTela(tester, tournament: torneio([dupla()]));

    expect(find.text('Cancelar convite'), findsOneWidget);
    expect(find.text('Cancelar inscrição'), findsNothing);
  });

  // ── o aceite ─────────────────────────────────────────────────────────────

  group('quando o parceiro aceita', () {
    testWidgets(
      'mostra a virada ANTES de navegar e depois abre o uniforme com a '
      'inscrição recém-criada',
      (tester) async {
        final convites = StreamController<List<TournamentPartnerInvite>>();
        addTearDown(convites.close);

        await abrirTela(
          tester,
          tournament: torneio([dupla(uniformType: 'full')]),
          convitesStream: convites.stream,
        );
        convites.add([convite()]);
        await tester.pumpAndSettle();
        expect(find.text('Aguardando confirmação'), findsOneWidget);

        // O aceite carimba `status: accepted` e o `registrationId` no próprio
        // convite (`tournament-partner-invite.ts`).
        convites.add([
          convite(status: 'accepted', registrationId: 'reg-nova'),
        ]);
        // Dois pumps: o primeiro entrega o evento do stream (o `add` só
        // agenda um microtask, e sem frame pendente o `pump` não desenha), o
        // segundo desenha o frame já com o estado novo.
        await tester.pump();
        await tester.pump();

        // A virada tem de ficar visível: pular direto esconde do atleta o
        // único momento em que ele descobre que a dupla fechou.
        expect(find.text('Parceiro confirmou'), findsOneWidget);
        expect(find.textContaining('Bruno aceitou!'), findsOneWidget);
        expect(rotasAbertas, isEmpty);

        await tester.pump(const Duration(milliseconds: 1600));
        await tester.pumpAndSettle();

        expect(rotasAbertas, contains('uniforme'));
        expect(destinoQueryParams?['registrationId'], 'reg-nova');
        expect(destinoQueryParams?['categoryId'], 'masc');
      },
    );

    testWidgets('categoria sem uniforme vai direto ao pagamento', (
      tester,
    ) async {
      final convites = StreamController<List<TournamentPartnerInvite>>();
      addTearDown(convites.close);

      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        convitesStream: convites.stream,
      );
      convites.add([convite()]);
      await tester.pumpAndSettle();

      convites.add([convite(status: 'accepted', registrationId: 'reg-nova')]);
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1600));
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('pagamento'));
      expect(rotasAbertas, isNot(contains('uniforme')));
      expect(destinoQueryParams?['registrationId'], 'reg-nova');
    });

    testWidgets(
      'aceite sem registrationId no convite devolve ao porteiro em vez de '
      'inventar um id',
      (tester) async {
        final convites = StreamController<List<TournamentPartnerInvite>>();
        addTearDown(convites.close);

        await abrirTela(
          tester,
          tournament: torneio([dupla()]),
          convitesStream: convites.stream,
        );
        convites.add([convite()]);
        await tester.pumpAndSettle();

        convites.add([convite(status: 'accepted')]);
        await tester.pump();
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 1600));
        await tester.pumpAndSettle();

        expect(rotasAbertas, contains('porteiro'));
        expect(rotasAbertas, isNot(contains('pagamento')));
        expect(destinoQueryParams?['lgpd'], '1');
      },
    );
  });

  // ── cancelar ─────────────────────────────────────────────────────────────

  group('cancelar', () {
    testWidgets(
      'cancela o CONVITE (não a inscrição) e volta para o passo do parceiro '
      'com o aceite LGPD',
      (tester) async {
        await abrirTela(
          tester,
          tournament: torneio([dupla()]),
          lgpdAccepted: true,
        );

        await tester.tap(find.text('Cancelar convite'));
        await tester.pumpAndSettle();
        await tester.tap(
          find.widgetWithText(FilledButton, 'Cancelar convite'),
        );
        await tester.pumpAndSettle();

        expect(servico.cancelInviteCalls, ['convite-1']);
        expect(servico.cancelRegistrationCalls, isEmpty);
        expect(rotasAbertas, contains('parceiro'));
        expect(destinoQueryParams?['categoryId'], 'masc');
        expect(destinoQueryParams?['lgpd'], '1');
      },
    );

    testWidgets('voltar no diálogo não cancela nada e não sai da tela', (
      tester,
    ) async {
      await abrirTela(tester, tournament: torneio([dupla()]));

      await tester.tap(find.text('Cancelar convite'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Voltar'));
      await tester.pumpAndSettle();

      expect(servico.cancelInviteCalls, isEmpty);
      expect(rotasAbertas, isEmpty);
      expect(find.text('Aguardando confirmação'), findsOneWidget);
    });
  });

  // ── sair e estados de borda ──────────────────────────────────────────────

  // Sair da espera é o caso em que a tela poderia desfazer o próprio motivo
  // de existir: a pilha real é `[…, parceiro, aguardando]`, porque a etapa 4
  // empurra o porteiro com `push` e o porteiro se substitui por esta tela.
  // Um `pop` cairia direto na busca de parceiro, com o campo aberto.
  group('sair da espera, com a busca de parceiro VIVA na pilha', () {
    testWidgets('"Continuar no app" vai ao torneio, não de volta à busca', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        pilhaDoParceiro: true,
      );
      expect(find.text('Aguardando confirmação'), findsOneWidget);

      await tester.tap(find.text('Continuar no app'));
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('detalhe do torneio'));
      expect(rotasAbertas, isNot(contains('parceiro')));
      expect(find.text('parceiro'), findsNothing);
    });

    testWidgets('o cabeçalho fecha (X) e também não volta à busca', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        pilhaDoParceiro: true,
      );

      // "X", não seta: `onBack` aqui SAI do fluxo, não desfaz um passo.
      expect(find.byIcon(Icons.arrow_back_rounded), findsNothing);
      await tester.tap(find.byIcon(Icons.close_rounded));
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('detalhe do torneio'));
      expect(rotasAbertas, isNot(contains('parceiro')));
    });
  });

  // Recusa de convite comum NÃO gera notificação (a CF só notifica recusa de
  // substituição). Sem estas telas, o atleta que está olhando a espera ao
  // vivo veria ela pular para trás sem uma palavra.
  group('o convite sai do ar enquanto o atleta olha', () {
    Future<void> abrirEDerrubar(
      WidgetTester tester, {
      required TournamentPartnerInvite desfecho,
    }) async {
      final convites = StreamController<List<TournamentPartnerInvite>>();
      addTearDown(convites.close);

      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        convitesStream: convites.stream,
        convitePorId: desfecho,
      );
      convites.add([convite()]);
      await tester.pumpAndSettle();
      expect(rotasAbertas, isEmpty);

      // O stream do convidante só carrega `pending`/`accepted`: recusa,
      // cancelamento e expiração chegam à lista todos como ausência.
      convites.add(const []);
      await tester.pumpAndSettle();
    }

    testWidgets('recusa: diz que não foi aceito e NÃO salta em silêncio', (
      tester,
    ) async {
      await abrirEDerrubar(tester, desfecho: convite(status: 'declined'));

      expect(find.text('Bruno não aceitou'), findsOneWidget);
      expect(rotasAbertas, isEmpty);
    });

    testWidgets('cancelamento tem texto próprio', (tester) async {
      await abrirEDerrubar(tester, desfecho: convite(status: 'cancelled'));

      expect(find.text('Convite cancelado'), findsOneWidget);
      expect(rotasAbertas, isEmpty);
    });

    testWidgets('expiração tem texto próprio', (tester) async {
      await abrirEDerrubar(
        tester,
        desfecho: convite(expiresAt: DateTime(2020, 1, 1)),
      );

      expect(find.text('O convite expirou'), findsOneWidget);
      expect(rotasAbertas, isEmpty);
    });

    testWidgets('do aviso, o caminho é escolher outro parceiro', (
      tester,
    ) async {
      await abrirEDerrubar(tester, desfecho: convite(status: 'declined'));

      await tester.tap(find.text('Escolher outro parceiro'));
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('parceiro'));
      expect(destinoQueryParams?['categoryId'], 'masc');
      expect(destinoQueryParams?['lgpd'], '1');
    });
  });

  testWidgets(
    'sem convite NENHUM desde o começo, devolve ao porteiro sem inventar '
    'aviso: não houve notícia a dar',
    (tester) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        convites: const [],
      );
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('porteiro'));
      expect(destinoQueryParams?['categoryId'], 'masc');
    },
  );

  testWidgets('erro no stream de convites mostra a tela de erro com Scaffold', (
    tester,
  ) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla()]),
      convitesStream: Stream<List<TournamentPartnerInvite>>.error(
        StateError('sem rede'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Não foi possível carregar'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(Scaffold),
        matching: find.text('Não foi possível carregar'),
      ),
      findsOneWidget,
    );
  });

  testWidgets('convite de OUTRA categoria não vira a espera desta', (
    tester,
  ) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla(), dupla(id: 'fem')]),
      convites: [convite(categoryId: 'fem')],
    );
    await tester.pumpAndSettle();

    expect(rotasAbertas, contains('porteiro'));
  });

  // ── reserva solo: a ação de garantir a vaga veio junto ───────────────────

  // Ela já sumiu uma vez nesta branch: o porteiro nunca honra `step=payment`
  // com parceiro pendente (pagamento é posterior), então a única porta para o
  // pagamento nesse estado é o botão. Levar o atleta da reserva solo para a
  // espera sem levar a ação repetiria a regressão por outro caminho.
  group('garantir a vaga pagando o integral', () {
    TournamentRegistrationSnapshot reservaSolo({bool isPaid = false}) =>
        TournamentRegistrationSnapshot(
          registrationId: 'reg-solo',
          isPaid: isPaid,
          paidAmount: 0,
          partnerPending: true,
          player1Id: meuUid,
          participantUids: const [meuUid],
        );

    testWidgets('aparece na reserva solo em aberto e abre o pagamento', (
      tester,
    ) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        registrationId: 'reg-solo',
        snapshot: reservaSolo(),
      );

      expect(
        find.text('Garantir vaga pagando o valor integral'),
        findsOneWidget,
      );

      await tester.tap(find.text('Garantir vaga pagando o valor integral'));
      await tester.pumpAndSettle();

      expect(rotasAbertas, contains('pagamento'));
      expect(destinoQueryParams?['registrationId'], 'reg-solo');
      expect(destinoQueryParams?['categoryId'], 'masc');
    });

    testWidgets('não aparece no convite "no vácuo": não há vaga a garantir', (
      tester,
    ) async {
      // Sem inscrição, não existe nada a pagar — a callable só cria a
      // inscrição no aceite.
      await abrirTela(tester, tournament: torneio([dupla()]));

      expect(find.text('Aguardando confirmação'), findsOneWidget);
      expect(
        find.text('Garantir vaga pagando o valor integral'),
        findsNothing,
      );
    });

    testWidgets('não aparece quando a vaga JÁ está garantida', (tester) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        registrationId: 'reg-solo',
        snapshot: reservaSolo(isPaid: true),
      );

      expect(find.text('Aguardando confirmação'), findsOneWidget);
      expect(
        find.text('Garantir vaga pagando o valor integral'),
        findsNothing,
      );
    });
  });

  // ── qual convite a tela acompanha ────────────────────────────────────────

  testWidgets(
    'com dois convites em voo, acompanha o MAIS RECENTE — e é o dele que o '
    'cancelar cancela',
    (tester) async {
      // Quem acabou de convidar o Carlos não pode ler "aguardando Bruno" nem
      // cancelar o convite errado.
      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        convites: [
          convite(),
          TournamentPartnerInvite(
            id: 'convite-2',
            tournamentId: 't1',
            categoryId: 'masc',
            inviterUid: meuUid,
            inviterName: 'Eu Mesmo',
            inviteeUid: 'parceiro-2',
            inviteeName: 'Carlos Dias',
            status: 'pending',
            createdAt: DateTime(2026, 8, 2),
            expiresAt: DateTime(2027, 1, 1),
          ),
        ],
      );

      expect(find.text('Carlos Dias'), findsOneWidget);
      expect(find.text('Bruno Alves'), findsNothing);

      await tester.tap(find.text('Cancelar convite'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Cancelar convite'));
      await tester.pumpAndSettle();

      expect(servico.cancelInviteCalls, ['convite-2']);
    },
  );

  testWidgets('depois do aceite não há mais convite a cancelar', (
    tester,
  ) async {
    final convites = StreamController<List<TournamentPartnerInvite>>();
    addTearDown(convites.close);

    await abrirTela(
      tester,
      tournament: torneio([dupla()]),
      convitesStream: convites.stream,
    );
    convites.add([convite()]);
    await tester.pumpAndSettle();
    expect(find.text('Cancelar convite'), findsOneWidget);

    convites.add([convite(status: 'accepted', registrationId: 'reg-nova')]);
    await tester.pump();
    await tester.pump();

    expect(find.text('Parceiro confirmou'), findsOneWidget);
    expect(find.text('Cancelar convite'), findsNothing);
  });

  // ── o rótulo do prazo ────────────────────────────────────────────────────

  group('partnerInviteRemainingLabel', () {
    test('conta o que RESTA do convite, não a janela original', () {
      final agora = DateTime(2026, 8, 1, 12);
      expect(
        partnerInviteRemainingLabel(
          convite(expiresAt: DateTime(2026, 8, 3, 12)),
          now: agora,
        ),
        '48 horas',
      );
      expect(
        partnerInviteRemainingLabel(
          convite(expiresAt: DateTime(2026, 8, 1, 15)),
          now: agora,
        ),
        '3 horas',
      );
    });

    test('arredonda para cima e nunca diz "0 horas"', () {
      final agora = DateTime(2026, 8, 1, 12);
      expect(
        partnerInviteRemainingLabel(
          convite(expiresAt: DateTime(2026, 8, 1, 12, 30)),
          now: agora,
        ),
        '1 hora',
      );
      expect(
        partnerInviteRemainingLabel(
          convite(expiresAt: DateTime(2026, 8, 1, 11)),
          now: agora,
        ),
        'poucos minutos',
      );
    });
  });
}

class _FakeInviteService implements TournamentPartnerInviteService {
  final cancelInviteCalls = <String>[];
  final cancelRegistrationCalls = <String>[];

  @override
  Future<void> cancelInvite(String inviteId, {bool asDecline = false}) async {
    cancelInviteCalls.add(inviteId);
  }

  @override
  Future<void> cancelRegistration(String registrationId) async {
    cancelRegistrationCalls.add(registrationId);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê não implementa ${invocation.memberName}. '
      'Se a tela passou a usar este método, cubra-o aqui.',
    );
  }
}
