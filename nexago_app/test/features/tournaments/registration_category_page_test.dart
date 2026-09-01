import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
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
    await abrirTela(
      tester,
      tournament: torneio(
        [dupla(entryFee: 220, maxTeams: 16)],
        registrationClosesAt: DateTime(2026, 7, 8, 23, 59),
      ),
      inscritosPorCategoria: const {'masc': 11},
    );

    expect(find.text('VAGAS'), findsOneWidget);
    expect(find.text('5 de 16'), findsOneWidget);
    expect(find.text('Inscrições até'), findsOneWidget);
    expect(find.text('qua, 08 jul · 23h59'), findsOneWidget);
  });

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
    },
  );
}
