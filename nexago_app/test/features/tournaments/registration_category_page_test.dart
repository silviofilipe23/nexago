import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/ui/app_status_views.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/domain/tournament_access_providers.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/registration_wizard/registration_category_page.dart';

/// Testes da tela 1 do wizard de inscrição: o detalhe da categoria.
///
/// A categoria vem da ROTA (não de um seletor), então os helpers só
/// precisam montar um torneio com UMA categoria de id 'masc' e verificar o
/// que a tela mostra em cada estado.
void main() {
  const meuUid = 'atleta-1';

  TournamentCategoryOffer dupla({
    String id = 'masc',
    String name = 'Dupla Masculina',
    String genderType = 'male',
    double entryFee = 100,
    int maxTeams = 8,
    String? uniformType,
    bool registrationClosed = false,
  }) => TournamentCategoryOffer(
    id: id,
    name: name,
    genderType: genderType,
    entryFee: entryFee,
    maxTeams: maxTeams,
    spotsTotal: maxTeams,
    spotsLeft: maxTeams,
    uniformType: uniformType,
    registrationClosed: registrationClosed,
  );

  TournamentDetail torneio(
    List<TournamentCategoryOffer> categorias, {
    bool requireFormedPair = false,
    DateTime? registrationClosesAt,
  }) => TournamentDetail(
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
    registrationClosesAt: registrationClosesAt,
  );

  AthleteProfile perfil({
    String gender = 'Masculino',
    Map<String, bool> levelLocked = const {'BEACH_TENNIS': true},
  }) => AthleteProfile(
    id: meuUid,
    name: 'João Teste',
    sport: 'Beach Tennis',
    level: 'Open',
    city: 'Goiânia',
    gender: gender,
    phoneVerified: true,
    onboardingCompleted: true,
    isProfileComplete: true,
    levelsBySportFirestore: const {'BEACH_TENNIS': 'open'},
    levelLocked: levelLocked,
  );

  Future<void> abrirTela(
    WidgetTester tester, {
    required TournamentDetail tournament,
    Map<String, UserCategoryRegistration> registrations = const {},
    Map<String, int> inscritosPorCategoria = const {},
    AthleteProfile? profile,
    bool canAccess = true,
  }) async {
    final router = GoRouter(
      initialLocation: '/inscricao',
      routes: [
        GoRoute(
          path: '/inscricao',
          builder: (_, __) => const RegistrationCategoryPage(
            tournamentId: 't1',
            categoryId: 'masc',
          ),
        ),
        GoRoute(
          path: '/torneios/:tournamentId/inscricao/consentimento',
          name: AppRouteNames.tournamentRegistrationConsent,
          builder: (_, __) => const Scaffold(body: Text('consentimento')),
        ),
        GoRoute(
          path: '/torneios/:tournamentId/inscricao',
          name: AppRouteNames.tournamentRegistration,
          builder: (_, __) => const Scaffold(body: Text('inscrição')),
        ),
        GoRoute(
          path: '/torneio',
          name: AppRouteNames.tournamentDetail,
          builder: (_, __) => const Scaffold(body: Text('detalhe')),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          athleteProfileProvider.overrideWith(
            (ref) => Stream.value(profile ?? perfil()),
          ),
          tournamentAccessStateProvider.overrideWithValue(
            canAccess
                ? const TournamentAccessState(
                    canAccess: true,
                    onboardingCompleted: true,
                    isProfileComplete: true,
                  )
                : TournamentAccessState.locked,
          ),
          tournamentDetailProvider(
            't1',
          ).overrideWith((ref) => Stream.value(tournament)),
          tournamentUserRegistrationsByCategoryProvider(
            't1',
          ).overrideWith((ref) => Stream.value(registrations)),
          tournamentCategoryEnrollmentCountsProvider(
            't1',
          ).overrideWith((ref) => Stream.value(inscritosPorCategoria)),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('mostra vagas, nível e o prazo de inscrição', (tester) async {
    // Prazo no FUTURO de propósito: desde que o status passou a aplicar
    // `registrationClosesAt`, uma data no passado deixaria a categoria
    // ENCERRADA e este teste passaria a exercitar, sem dizer, o caminho
    // bloqueado. 07/07/2027 é uma quarta-feira (daí o "qua").
    await abrirTela(
      tester,
      tournament: torneio(
        [dupla(entryFee: 220, maxTeams: 16)],
        registrationClosesAt: DateTime(2027, 7, 7, 23, 59),
      ),
      inscritosPorCategoria: const {'masc': 11},
    );

    expect(find.text('VAGAS'), findsOneWidget);
    expect(find.text('5 de 16'), findsOneWidget);
    expect(find.text('Inscrições até'), findsOneWidget);
    expect(find.text('qua, 07 jul · 23h59'), findsOneWidget);
    // Prazo aberto: o CTA continua livre.
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNotNull,
    );
  });

  testWidgets(
    'prazo de inscrição vencido bloqueia o CTA com ENCERRADA',
    (tester) async {
      // O prazo era só exibido. O atleta percorria consentimento, condições e
      // parceiro para a callable recusar com "Prazo de inscrição encerrado."
      await abrirTela(
        tester,
        tournament: torneio(
          [dupla()],
          registrationClosesAt: DateTime(2026, 7, 8, 23, 59),
        ),
      );

      expect(find.text('ENCERRADA'), findsOneWidget);
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull,
      );
    },
  );

  testWidgets('sem registrationClosesAt a linha do prazo não aparece', (
    tester,
  ) async {
    await abrirTela(tester, tournament: torneio([dupla()]));

    expect(find.text('Inscrições até'), findsNothing);
  });

  testWidgets('dupla obrigatória mostra o aviso e o CTA de inscrever', (
    tester,
  ) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla()], requireFormedPair: true),
    );

    expect(find.textContaining('só aceita inscrição em dupla'), findsOneWidget);
    expect(find.text('Inscrever-se'), findsOneWidget);
  });

  testWidgets('categoria lotada bloqueia o CTA', (tester) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla(maxTeams: 8)]),
      inscritosPorCategoria: const {'masc': 8},
    );

    final botao = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(botao.onPressed, isNull);
    expect(find.text('LOTADO'), findsOneWidget);
  });

  testWidgets(
    'já inscrito leva para o passo pendente em vez de inscrever de novo',
    (tester) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla()]),
        registrations: const {
          'masc': UserCategoryRegistration(
            registrationId: 'reg-1',
            partnerPending: true,
            isPaid: false,
          ),
        },
      );

      expect(find.text('JÁ INSCRITO'), findsOneWidget);
      expect(find.text('Continuar inscrição'), findsOneWidget);

      // O CTA precisa estar HABILITADO e navegar de verdade — bloquear quem
      // já tem inscrição (ou um "Continuar" que não leva a lugar nenhum) foi
      // o beco sem saída histórico da vaga solo pendente.
      final botao = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(botao.onPressed, isNotNull);

      await tester.tap(find.byType(FilledButton));
      await tester.pumpAndSettle();

      expect(find.text('inscrição'), findsOneWidget);
    },
  );

  testWidgets(
    'stream com dado carregado e erro depois (assinatura já estabelecida) '
    'sai embrulhado em Scaffold, não pelo ramo interno do NexaAsyncView',
    (tester) async {
      // Reproduz o mecanismo real: erro numa assinatura JÁ estabelecida passa
      // por `asyncTransition(seamless: true)`, e `AsyncError.copyWithPrevious`
      // preserva `hasValue: previous.hasValue` — dado antigo E erro novo
      // coexistem no MESMO AsyncValue. Uma guarda `hasError && !hasValue`
      // deixa esse caso escapar; só `hasError` sozinho cobre.
      final controller = StreamController<TournamentDetail?>();
      addTearDown(controller.close);

      final router = GoRouter(
        initialLocation: '/inscricao',
        routes: [
          GoRoute(
            path: '/inscricao',
            builder: (_, __) => const RegistrationCategoryPage(
              tournamentId: 't1',
              categoryId: 'masc',
            ),
          ),
        ],
      );
      addTearDown(router.dispose);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            athleteProfileProvider.overrideWith(
              (ref) => Stream.value(perfil()),
            ),
            tournamentAccessStateProvider.overrideWithValue(
              const TournamentAccessState(
                canAccess: true,
                onboardingCompleted: true,
                isProfileComplete: true,
              ),
            ),
            tournamentDetailProvider(
              't1',
            ).overrideWith((ref) => controller.stream),
            tournamentUserRegistrationsByCategoryProvider('t1').overrideWith(
              (ref) => Stream.value(const <String, UserCategoryRegistration>{}),
            ),
            tournamentCategoryEnrollmentCountsProvider(
              't1',
            ).overrideWith((ref) => Stream.value(const <String, int>{})),
          ],
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      // Ainda carregando: só `pump()`, nunca `pumpAndSettle()` — o spinner
      // indeterminado do `AppLoadingView` gira pra sempre e nunca assenta.
      await tester.pump();

      controller.add(torneio([dupla()]));
      await tester.pumpAndSettle();
      expect(find.text('VAGAS'), findsOneWidget); // confirma que já carregou

      controller.addError(Exception('Firestore unavailable'));
      await tester.pumpAndSettle();

      expect(find.byType(AppErrorView), findsOneWidget);
      expect(
        find.ancestor(
          of: find.byType(AppErrorView),
          matching: find.byType(Scaffold),
        ),
        findsOneWidget,
      );
    },
  );
}
