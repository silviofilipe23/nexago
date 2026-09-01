// Testes da TELA de confirmação da inscrição (Task 11 do wizard): re-skin do
// `Scaffold` + `_RegistrationSuccessAppBar` (um `NexaAppBar` próprio, hoje
// removido) para `RegistrationWizardScaffold`.
//
// A tela nunca teve cobertura — o relatório da Task 11 registrou o motivo:
// `initState` agenda `Future.delayed(3s)` para o pedido de avaliação na loja,
// e em `flutter_test` esse `Future.delayed` vira um timer do relógio falso.
// Se o teste terminar antes dos 3s, o teardown estoura com "A Timer is still
// pending". Daí `esperarPedidoDeAvaliacao`, chamada no fim de todo teste que
// não controla o relógio por conta própria: drenar o timer é obrigação do
// teste, não do dublê — trocar o serviço por um fake NÃO impede o timer de
// nascer, só troca o que ele chama quando dispara.
//
// Harness no padrão de `registration_partner_page_test.dart`
// (`ProviderScope` + `GoRouter`), com duas diferenças que valem a nota:
//  - `UncontrolledProviderScope` sobre um `ProviderContainer` próprio, para o
//    teste poder LER `tournamentRegistrationSuccessHandledIdsProvider` depois
//    do toque (mesmo padrão de `tournament_invite_announcer_widget_test.dart`);
//  - `authProvider` emitindo `null`: com uid vazio o notifier de "inscrições
//    já vistas" não toca em `tournamentRegistrationSuccessPreferencesRepositoryProvider`
//    (que lança `UnimplementedError` fora do `main()`), mas `markHandled`
//    continua atualizando o estado — que é o que se quer observar.
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/review/app_review_providers.dart';
import 'package:nexago_app/core/review/app_review_service.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/ui/nexa_skeleton.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_receipt.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_success_args.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_registration_success_page.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/registration_wizard/registration_wizard_scaffold.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/tournament_registration_header.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/tournament_registration_share_card.dart';

void main() {
  // O card compartilhável formata a data com `DateFormat(..., 'pt_BR')`; sem
  // isto o `build` estoura com `LocaleDataException` antes de renderizar.
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  const registrationId = 'reg-98765';
  // `formatRegistrationReceiptCode` pega os 5 últimos caracteres do id.
  const codigoComprovante = 'NXG-98765';

  TournamentCategoryOffer dupla({
    String id = 'masc',
    String name = 'Dupla Masculina',
    int maxTeams = 8,
    int spotsLeft = 3,
  }) => TournamentCategoryOffer(
    id: id,
    name: name,
    entryFee: 100,
    maxTeams: maxTeams,
    spotsTotal: maxTeams,
    spotsLeft: spotsLeft,
  );

  TournamentDetail torneio(
    List<TournamentCategoryOffer> categorias, {
    String name = 'Copa de Teste',
  }) => TournamentDetail(
    id: 't1',
    name: name,
    location: 'Arena Teste',
    city: 'Goiânia',
    dateLabel: '20–22 Ago',
    startDate: DateTime(2026, 8, 20),
    endDate: DateTime(2026, 8, 22),
    categories: const [],
    format: TournamentFormat.dupla,
    priceLabel: 'R\$ 100',
    priceValue: 100,
    spotsLeft: 3,
    spotsTotal: 8,
    status: TournamentListingStatus.open,
    featured: false,
    enrolledCount: 5,
    liveMatchesNow: 0,
    categoryOffers: categorias,
    sport: 'beachTennis',
  );

  TournamentRegistrationReceipt comprovante({String categoryId = 'masc'}) =>
      TournamentRegistrationReceipt(
        registrationId: registrationId,
        categoryId: categoryId,
        player1Name: 'Eu Mesmo',
        player2Name: 'Bruno Alves',
        isPaid: true,
        registeredAt: DateTime(2026, 8, 1),
      );

  late List<String> rotasAbertas;
  late int pedidosDeAvaliacao;

  /// Dublê do pedido de avaliação: `AppReviewService` já nasce com os três
  /// callbacks injetáveis, então não precisa de subclasse. `loadPreferences`
  /// é a PRIMEIRA coisa que `maybeRequestReview` faz — contá-la é o jeito de
  /// observar o pedido sem `SharedPreferences` nem `in_app_review` (devolver
  /// `null` aqui faz o serviço desistir logo em seguida, sem tocar em canal
  /// de plataforma nenhum).
  AppReviewService dubleDeAvaliacao() => AppReviewService(
    loadPreferences: () async {
      pedidosDeAvaliacao++;
      return null;
    },
    isReviewAvailable: () async => false,
    requestReview: () async {},
  );

  Future<ProviderContainer> abrirConfirmacao(
    WidgetTester tester, {
    TournamentDetail? tournament,
    TournamentRegistrationReceipt? receipt,
    Map<String, int> inscritosPorCategoria = const {'masc': 5},
  }) async {
    // Tela alta o bastante para o card compartilhável inteiro caber sem
    // overflow (o viewport padrão de 800x600 corta o card de ~420px mais a
    // barra fixa).
    tester.view.physicalSize = const Size(800, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    rotasAbertas = <String>[];
    pedidosDeAvaliacao = 0;

    final router = GoRouter(
      initialLocation: '/sucesso',
      routes: [
        GoRoute(
          path: '/sucesso',
          builder: (_, __) => const TournamentRegistrationSuccessPage(
            args: TournamentRegistrationSuccessArgs(
              tournamentId: 't1',
              registrationId: registrationId,
              tournamentName: 'Copa de Teste',
              categoryName: 'Dupla Masculina',
            ),
          ),
        ),
        GoRoute(
          path: '/torneios/:tournamentId',
          name: AppRouteNames.tournamentDetail,
          builder: (_, __) {
            rotasAbertas.add('detalhe');
            return const Scaffold(body: Text('detalhe'));
          },
        ),
      ],
    );
    addTearDown(router.dispose);

    final container = ProviderContainer(
      overrides: [
        // Guarda: nada nesta árvore deve chegar em `FirebaseAuth.instance`
        // (sem Firebase inicializado, seria um erro obscuro em vez de uma
        // falha de asserção).
        firebaseAuthProvider.overrideWithValue(MockFirebaseAuth()),
        // Sessão sem uid: `TournamentRegistrationSuccessHandledIdsNotifier`
        // vira memória pura (não persiste), que é o suficiente para observar
        // `markHandled` sem dublar Firestore/SharedPreferences.
        authProvider.overrideWith((ref) => Stream.value(null)),
        appReviewServiceProvider.overrideWith((ref) => dubleDeAvaliacao()),
        tournamentDetailProvider(
          't1',
        ).overrideWith((ref) => Stream.value(tournament)),
        // Comprovante nulo deixaria `contentLoading` ligado e o corpo cairia
        // no `NexaSkeleton`, cuja animação é infinita — `pumpAndSettle`
        // estouraria o timeout. Os testes que querem a tela pronta passam um
        // comprovante de verdade.
        tournamentRegistrationReceiptProvider(
          registrationId,
        ).overrideWith((ref) => receipt),
        tournamentCategoryEnrollmentCountsProvider(
          't1',
        ).overrideWith((ref) => Stream.value(inscritosPorCategoria)),
      ],
    );
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

  /// Drena o timer de 3s do pedido de avaliação (ver nota do topo do arquivo).
  Future<void> esperarPedidoDeAvaliacao(WidgetTester tester) async {
    await tester.pump(const Duration(seconds: 4));
    await tester.pump();
  }

  testWidgets(
    'confirmação abre na casca do wizard, com o título "Confirmado"',
    (tester) async {
      await abrirConfirmacao(
        tester,
        tournament: torneio([dupla()]),
        receipt: comprovante(),
      );

      expect(find.byType(RegistrationWizardScaffold), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(TournamentRegistrationHeader),
          matching: find.text('Confirmado'),
        ),
        findsOneWidget,
      );
      // Prova que o corpo renderizou de verdade — não o esqueleto de
      // carregamento nem um estado de erro.
      expect(find.byType(TournamentRegistrationShareCard), findsOneWidget);
      expect(find.byType(NexaSkeleton), findsNothing);
      // Os nomes vêm do comprovante (o card junta a dupla numa linha só).
      expect(find.text('Eu Mesmo · Bruno Alves'), findsOneWidget);

      await esperarPedidoDeAvaliacao(tester);
    },
  );

  testWidgets(
    'fechar sai para o detalhe do torneio e marca a inscrição como vista',
    (tester) async {
      final container = await abrirConfirmacao(
        tester,
        tournament: torneio([dupla()]),
        receipt: comprovante(),
      );

      // Tela terminal: o ícone é "X" (fechar), não a seta do resto do wizard
      // — `onBack` não desfaz o pagamento que acabou de acontecer.
      expect(find.byIcon(Icons.close_rounded), findsOneWidget);
      expect(find.byIcon(Icons.arrow_back_rounded), findsNothing);
      expect(
        container.read(tournamentRegistrationSuccessHandledIdsProvider),
        isNot(contains(registrationId)),
      );

      await tester.tap(find.byIcon(Icons.close_rounded));
      await tester.pumpAndSettle();

      expect(rotasAbertas, ['detalhe']);
      expect(
        container.read(tournamentRegistrationSuccessHandledIdsProvider),
        contains(registrationId),
      );

      await esperarPedidoDeAvaliacao(tester);
    },
  );

  testWidgets('o código do comprovante aparece no corpo, não no cabeçalho', (
    tester,
  ) async {
    await abrirConfirmacao(
      tester,
      tournament: torneio([dupla()]),
      receipt: comprovante(),
    );

    // O código morava na `action` da toolbar antiga; a casca do wizard não
    // tem slot ao lado do título, então ele passou a abrir o corpo. Só
    // `find.text` não provaria a migração — a asserção é de ONDE ele está.
    expect(find.text(codigoComprovante), findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(TournamentRegistrationHeader),
        matching: find.text(codigoComprovante),
      ),
      findsNothing,
    );
    expect(
      find.descendant(
        of: corpoRolavel(),
        matching: find.text(codigoComprovante),
      ),
      findsOneWidget,
    );

    await esperarPedidoDeAvaliacao(tester);
  });

  testWidgets('calendário e compartilhar ficam na barra fixa, fora do corpo', (
    tester,
  ) async {
    await abrirConfirmacao(
      tester,
      tournament: torneio([dupla()]),
      receipt: comprovante(),
    );

    // A `Row` de ações migrou para o slot `stickyBar:`, que a casca do
    // wizard vira `bottomNavigationBar` — logo, fora da `ListView` do corpo.
    final scaffold = tester.widget<Scaffold>(
      find.descendant(
        of: find.byType(RegistrationWizardScaffold),
        matching: find.byType(Scaffold),
      ),
    );
    expect(scaffold.bottomNavigationBar, isNotNull);

    expect(find.text('Compartilhar no story'), findsOneWidget);
    expect(
      find.descendant(
        of: corpoRolavel(),
        matching: find.text('Compartilhar no story'),
      ),
      findsNothing,
    );
    expect(find.byTooltip('Adicionar ao calendário'), findsOneWidget);

    await esperarPedidoDeAvaliacao(tester);
  });

  testWidgets('o pedido de avaliação na loja só sai 3s depois de abrir', (
    tester,
  ) async {
    await abrirConfirmacao(
      tester,
      tournament: torneio([dupla()]),
      receipt: comprovante(),
    );

    // O delay existe para o atleta ver a conquista antes do diálogo da loja:
    // pedir na hora da abertura seria outra experiência.
    expect(pedidosDeAvaliacao, 0);

    await tester.pump(const Duration(seconds: 2));
    expect(pedidosDeAvaliacao, 0);

    await tester.pump(const Duration(seconds: 2));
    await tester.pump();
    expect(pedidosDeAvaliacao, 1);
  });
}

/// `ListView` do corpo da casca do wizard — o que a barra fixa NÃO é.
Finder corpoRolavel() => find.descendant(
  of: find.byType(RegistrationWizardScaffold),
  matching: find.byType(ListView),
);
