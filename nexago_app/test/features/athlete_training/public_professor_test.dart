import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete_training/application/athlete_training_providers.dart';
import 'package:nexago_app/features/athlete_training/domain/public_professor.dart';
import 'package:nexago_app/features/athlete_training/infrastructure/class_presence_repository.dart';
import 'package:nexago_app/features/athlete_training/infrastructure/public_professor_repository.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_find_professor_page.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_professor_profile_page.dart';

const _ju = PublicProfessor(
  professorUid: 'uJu',
  name: 'Juliana Rocha',
  modalities: ['Beach Tennis'],
  arenas: [
    PublicProfessorArena(
      arenaId: 'cfc',
      arenaName: 'Arena CFC',
      city: 'Goiânia',
      distanceKm: 2.1,
    ),
  ],
  rating: 4.8,
  ratingCount: 12,
  priceFromReais: 120,
  acceptsPrivate: true,
  since: '2025-03-01',
  plans: [
    PublicProfessorPlan(name: 'Avulsa', kind: 'single', priceReais: 120),
    PublicProfessorPlan(
        name: 'Pacote 4', kind: 'package', priceReais: 440, classes: 4),
  ],
);

const _ca = PublicProfessor(
  professorUid: 'uCa',
  name: 'Camila Lopes',
  modalities: ['Vôlei de Praia'],
  arenas: [
    PublicProfessorArena(
      arenaId: 'sul',
      arenaName: 'Arena Sul',
      independent: true,
      distanceKm: 6.3,
    ),
  ],
);

class _FakeRepo implements PublicProfessorRepository {
  final contacts = <(String, String?)>[];
  bool alreadyRequested = false;

  @override
  Future<void> requestContact(String professorUid, {String? message}) async {
    if (alreadyRequested) {
      throw const ClassPresenceException(
        'Você já pediu contato.',
        code: 'already-exists',
      );
    }
    contacts.add((professorUid, message));
  }

  @override
  Future<PublicProfessor> profile(String professorUid,
          {double? lat, double? lng}) =>
      throw UnimplementedError();

  @override
  Future<ProfessorSearchResult> search(ProfessorSearchQuery q) =>
      throw UnimplementedError();
}

void main() {
  test('lê a resposta do servidor e os rótulos', () {
    final p = PublicProfessor.fromMap({
      'professorUid': 'uJu',
      'name': 'Juliana',
      'modalities': ['Beach Tennis'],
      'arenas': [
        {
          'arenaId': 'cfc',
          'arenaName': 'Arena CFC',
          'relationshipType': 'INDEPENDENT',
          'distanceKm': 2.1
        },
      ],
      'rating': 4.5,
      'ratingCount': 2,
      'plans': [
        {'name': 'Avulsa', 'kind': 'single', 'priceReais': 130},
      ],
      'isMyProfessor': true,
    });
    expect(p.arenas.single.independent, isTrue);
    expect(p.plans.single.priceReais, 130.0);
    expect(p.isMyProfessor, isTrue);
    expect(professorDistanceLabel(2.1), '2,1 km');
    expect(professorDistanceLabel(0.45), '450 m');
    expect(professorRatingLabel(4.8), '4,8');
    expect(professorSinceLabel('2025-03-01'), 'desde mar 2025');
  });

  Future<(GoRouter, _FakeRepo)> pump(
    WidgetTester tester, {
    required String location,
    PublicProfessor profile = _ju,
    _FakeRepo? repo,
  }) async {
    tester.view.physicalSize = const Size(400, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    final fake = repo ?? _FakeRepo();
    final router = GoRouter(
      initialLocation: location,
      routes: [
        GoRoute(
          path: AppRoutes.athleteTrainingFindProfessor,
          name: AppRouteNames.athleteTrainingFindProfessor,
          builder: (_, __) => const AthleteTrainingFindProfessorPage(),
        ),
        GoRoute(
          path: AppRoutes.athleteTrainingProfessorProfile,
          name: AppRouteNames.athleteTrainingProfessorProfile,
          builder: (_, s) => AthleteTrainingProfessorProfilePage(
            professorUid: s.pathParameters['professorUid']!,
          ),
        ),
        GoRoute(
          path: AppRoutes.athletePrivateLessonBook,
          name: AppRouteNames.athletePrivateLessonBook,
          builder: (_, s) => Scaffold(
            body: Text('agendar ${s.pathParameters['professorUid']}'),
          ),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        athleteSearchOriginProvider
            .overrideWith((ref) => (lat: -16.69, lng: -49.27, city: 'Goiânia')),
        professorSearchProvider.overrideWith((ref, q) async {
          final all = [_ju, _ca];
          return ProfessorSearchResult(
            items: [
              for (final p in all)
                if (q.sport.isEmpty || p.modalities.contains(q.sport)) p,
            ],
            modalities: const ['Beach Tennis', 'Vôlei de Praia'],
          );
        }),
        publicProfessorProvider.overrideWith((ref, id) async => profile),
        publicProfessorRepositoryProvider.overrideWithValue(fake),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    return (router, fake);
  }

  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 80));
    }
  }

  testWidgets('T13 · lista, filtro de modalidade e abre o perfil',
      (tester) async {
    final (router, _) =
        await pump(tester, location: AppRoutes.athleteTrainingFindProfessor);
    expect(find.text('PERTO DE VOCÊ · GOIÂNIA'), findsOneWidget);
    expect(find.byKey(const Key('find-professor-uJu')), findsOneWidget);
    expect(find.byKey(const Key('find-professor-uCa')), findsOneWidget);
    expect(find.text('Arena CFC · 2,1 km'), findsOneWidget);
    expect(find.text('4,8'), findsOneWidget);

    await tester
        .tap(find.byKey(const Key('find-professor-sport-Vôlei de Praia')));
    await settle(tester);
    expect(find.byKey(const Key('find-professor-uJu')), findsNothing);
    expect(find.byKey(const Key('find-professor-uCa')), findsOneWidget);

    await tester.tap(find.byKey(const Key('find-professor-uCa')));
    await settle(tester);
    expect(router.state.uri.path, '/treinos/professor/uCa');
  });

  testWidgets('T11 · quem não é aluno pede contato com mensagem',
      (tester) async {
    final (_, repo) = await pump(tester, location: '/treinos/professor/uJu');
    expect(find.text('Juliana Rocha'), findsOneWidget);
    expect(find.text('Beach Tennis · desde mar 2025'), findsOneWidget);
    expect(
        find.byKey(const Key('professor-profile-arena-cfc')), findsOneWidget);
    expect(find.byKey(const Key('professor-profile-plans')), findsOneWidget);
    expect(find.byKey(const Key('professor-profile-message')), findsNothing);

    await tester.tap(find.byKey(const Key('professor-profile-contact')));
    await settle(tester);
    await tester.enterText(
        find.byKey(const Key('professor-contact-message')), 'Quero aula');
    await tester.tap(find.byKey(const Key('professor-contact-send')));
    await settle(tester);
    expect(repo.contacts, [('uJu', 'Quero aula')]);
    expect(find.text('Contato pedido'), findsOneWidget);
  });

  testWidgets('T11 · contato já pedido fica desligado', (tester) async {
    await pump(
      tester,
      location: '/treinos/professor/uJu',
      profile: _ju.copyWith(contactRequested: true),
    );
    final button = tester
        .widget<Widget>(find.byKey(const Key('professor-profile-contact')));
    expect(button, isNotNull);
    expect(find.text('Contato pedido'), findsOneWidget);
  });

  testWidgets('T11 · aluno vê Mensagem e Agendar', (tester) async {
    final (router, _) = await pump(
      tester,
      location: '/treinos/professor/uJu',
      profile: PublicProfessor.fromMap({
        'professorUid': 'uJu',
        'name': 'Juliana Rocha',
        'acceptsPrivate': true,
        'isMyProfessor': true,
      }),
    );
    expect(find.byKey(const Key('professor-profile-mine')), findsOneWidget);
    expect(find.byKey(const Key('professor-profile-contact')), findsNothing);
    expect(find.text('Sem avaliações ainda'), findsOneWidget);
    await tester.tap(find.byKey(const Key('professor-profile-book')));
    await settle(tester);
    expect(router.state.uri.path, '/particulares/agendar/uJu');
  });
}
