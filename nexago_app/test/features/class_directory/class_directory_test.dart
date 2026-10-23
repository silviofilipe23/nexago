import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete_training/application/athlete_training_providers.dart';
import 'package:nexago_app/features/athlete_training/domain/public_professor.dart';
import 'package:nexago_app/features/class_directory/application/class_directory_providers.dart';
import 'package:nexago_app/features/class_directory/domain/class_directory.dart';
import 'package:nexago_app/features/class_directory/domain/class_directory_logic.dart';
import 'package:nexago_app/features/class_directory/presentation/class_directory_page.dart';
import 'package:nexago_app/features/class_directory/presentation/class_provider_detail_page.dart';

const _slotB = DirectorySlot(
  className: 'Intermediário B',
  level: 'intermediario',
  weekdays: [1, 3],
  startTime: '19:00',
  openSpots: 2,
);

final _cfc = ClassProvider.fromMap({
  'kind': 'arena',
  'id': 'cfc',
  'name': 'Arena CFC',
  'city': 'Goiânia',
  'sports': ['Vôlei de praia'],
  'levels': ['iniciante', 'intermediario'],
  'classCount': 2,
  'openSpots': 2,
  'distanceKm': 3.1,
  'priceFromReais': 140,
  'professorCount': 2,
  'professors': [
    {'name': 'Thiago Mendes'},
  ],
  'highlight': {
    'className': 'Intermediário B',
    'level': 'intermediario',
    'weekdays': [1, 3],
    'startTime': '19:00',
    'openSpots': 2,
  },
  'schedule': [
    {
      'className': 'Intermediário B',
      'level': 'intermediario',
      'weekdays': [1, 3],
      'startTime': '19:00',
      'openSpots': 2,
    },
    {
      'className': 'Iniciante',
      'level': 'iniciante',
      'weekdays': [5],
      'startTime': '18:00',
      'openSpots': 0,
    },
  ],
});

final _ct = ClassProvider.fromMap({
  'kind': 'center',
  'id': 'elv',
  'name': 'CT Elevação Beach',
  'sports': ['Vôlei de praia'],
  'levels': ['Avançado'],
  'classCount': 1,
  'openSpots': 3,
  'priceFromReais': 480,
  'schedule': [
    {
      'className': 'Competição manhã',
      'level': 'Avançado',
      'weekdays': [1, 3, 5],
      'startTime': '06:00',
      'openSpots': 3,
    },
  ],
});

final _norte = ClassProvider.fromMap({
  'kind': 'arena',
  'id': 'norte',
  'name': 'Arena Norte',
  'sports': ['Beach Tennis'],
  'levels': ['iniciante'],
  'classCount': 1,
  'distanceKm': 5.8,
  'schedule': [
    {
      'className': 'Iniciante sábado',
      'level': 'iniciante',
      'weekdays': [6],
      'startTime': '09:00',
      'openSpots': 0,
    },
  ],
});

const _rafa = PublicProfessor(
  professorUid: 'uRafa',
  name: 'Rafael Souza',
  modalities: ['Vôlei de praia'],
  arenas: [
    PublicProfessorArena(
      arenaId: 'norte',
      arenaName: 'Arena Norte',
      independent: true,
      distanceKm: 2.4,
    ),
  ],
  rating: 4.9,
  ratingCount: 21,
  priceFromReais: 140,
  acceptsPrivate: true,
);

const _staffOnly = PublicProfessor(
  professorUid: 'uStaff',
  name: 'Thiago Mendes',
  arenas: [PublicProfessorArena(arenaId: 'cfc', arenaName: 'Arena CFC')],
);

final _detail = ClassProviderDetail.fromMap({
  'kind': 'arena',
  'id': 'cfc',
  'name': 'Arena CFC',
  'city': 'Goiânia',
  'contactPhone': '62999990000',
  'makeupNoticeHours': 4,
  'classes': [
    {
      'classId': 't1',
      'name': 'Intermediário B',
      'level': 'intermediario',
      'weekdays': [1, 3],
      'startTime': '19:00',
      'endTime': '20:00',
      'professorName': 'Thiago Mendes',
      'professorUid': 'uThiago',
      'capacity': 8,
      'taken': 6,
    },
    {
      'classId': 't2',
      'name': 'Intermediário A',
      'level': 'intermediario',
      'weekdays': [1],
      'startTime': '20:00',
      'endTime': '21:00',
      'professorName': 'Juliana Rocha',
      'capacity': 8,
      'taken': 8,
    },
  ],
  'plans': [
    {
      'name': '1× semana',
      'kind': 'monthly',
      'priceReais': 140,
      'classesPerWeek': 1
    },
    {
      'name': '2× semana',
      'kind': 'monthly',
      'priceReais': 220,
      'classesPerWeek': 2
    },
    {'name': 'Livre', 'kind': 'monthly', 'priceReais': 300},
  ],
  'professors': [
    {'name': 'Thiago Mendes', 'professorUid': 'uThiago'},
    {'name': 'Juliana Rocha'},
  ],
  'places': [
    {
      'name': 'Arena CFC',
      'address': 'Av. Independência, 1200',
      'distanceKm': 3.1
    },
  ],
});

void main() {
  group('lógica', () {
    test('nível do perfil vira nível de turma', () {
      expect(classLevelForAthlete('intermediario_2'), 'intermediario');
      expect(classLevelForAthlete('basico'), 'iniciante');
      expect(classLevelForAthlete('iniciante_1'), 'iniciante');
      expect(classLevelForAthlete('avancado_1'), 'avancado');
      expect(classLevelForAthlete('open'), 'avancado');
      expect(classLevelForAthlete(''), isNull);
      expect(classLevelForAthlete('xyz'), isNull);
    });

    test('nível de texto livre do CT casa sem acento', () {
      expect(directoryLevelMatches('Avançado', {'avancado'}), isTrue);
      expect(
          directoryLevelMatches('Intermediário A', {'intermediario'}), isTrue);
      expect(directoryLevelMatches('Kids', {'avancado'}), isFalse);
      expect(directoryLevelMatches('qualquer', {}), isTrue);
    });

    test('ordena por distância; sem distância vai para o fim, por nome', () {
      final prof = ClassProvider.fromProfessor(_rafa);
      final out =
          filterDirectory([_ct, _norte, _cfc, prof], const DirectoryFilters());
      expect(out.map((i) => i.id), ['uRafa', 'cfc', 'norte', 'elv']);
    });

    test('tipo, esporte, distância e "com vaga"', () {
      final all = [_cfc, _ct, _norte, ClassProvider.fromProfessor(_rafa)];
      expect(
        filterDirectory(
                all, const DirectoryFilters(kind: ClassProviderKind.center))
            .map((i) => i.id),
        ['elv'],
      );
      expect(
        filterDirectory(all, const DirectoryFilters(sport: 'Beach Tennis'))
            .map((i) => i.id),
        ['norte'],
      );
      // CT não tem coordenada: sai com distância ligada.
      expect(
        filterDirectory(all, const DirectoryFilters(maxKm: 7)).map((i) => i.id),
        ['uRafa', 'cfc', 'norte'],
      );
      // Arena Norte só tem turma lotada.
      expect(
        filterDirectory(all, const DirectoryFilters(withOpening: true))
            .map((i) => i.id),
        ['uRafa', 'cfc', 'elv'],
      );
    });

    test('nível e período olham a grade; o card mostra a turma que passou', () {
      const f = DirectoryFilters(
        levels: {'iniciante'},
        periods: {DirectoryPeriod.evening},
      );
      final out = filterDirectory([_cfc, _ct, _norte], f);
      expect(out.map((i) => i.id), ['cfc']);
      expect(directoryCardSlot(_cfc, f)?.className, 'Iniciante');
      expect(directoryCardSlot(_cfc, const DirectoryFilters())?.className,
          _slotB.className);
    });

    test('professor só entra se for independente em alguma arena', () {
      final r = ProfessorSearchResult(items: const [_rafa, _staffOnly]);
      expect(independentProfessors(r).map((p) => p.id), ['uRafa']);
    });

    test('dia inicial: hoje com turma, senão o próximo', () {
      expect(directoryInitialWeekday([1, 3], 3), 3);
      expect(directoryInitialWeekday([1, 3], 4), 1);
      expect(directoryInitialWeekday([6], 2), 6);
    });

    test('rótulos', () {
      expect(directorySpotsLabel(0), 'Lotada');
      expect(directorySpotsLabel(1), '1 vaga');
      expect(directorySpotsLabel(3), '3 vagas');
      expect(directoryPrice(220), r'R$ 220');
      expect(directoryPrice(99.9), r'R$ 99,90');
      expect(directoryDistance(3.14), '3,1 km');
      final d = _detail;
      expect(
        classDirectoryContactMessage(d, d.classes[1]),
        contains('lista de espera'),
      );
    });
  });

  Future<GoRouter> pump(WidgetTester tester, String location) async {
    tester.view.physicalSize = const Size(400, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    final router = GoRouter(
      initialLocation: location,
      routes: [
        GoRoute(
          path: AppRoutes.classDirectory,
          name: AppRouteNames.classDirectory,
          builder: (_, __) => const ClassDirectoryPage(),
        ),
        GoRoute(
          path: AppRoutes.classDirectoryArena,
          name: AppRouteNames.classDirectoryArena,
          builder: (_, s) => ClassProviderDetailPage(
            kind: ClassProviderKind.arena,
            id: s.pathParameters['arenaId']!,
          ),
        ),
        GoRoute(
          path: AppRoutes.classDirectoryCenter,
          name: AppRouteNames.classDirectoryCenter,
          builder: (_, s) => Text('ct ${s.pathParameters['centerId']}'),
        ),
        GoRoute(
          path: AppRoutes.athleteTrainingProfessorProfile,
          name: AppRouteNames.athleteTrainingProfessorProfile,
          builder: (_, s) => Text('prof ${s.pathParameters['professorUid']}'),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        athleteSearchOriginProvider
            .overrideWith((ref) => (lat: -16.69, lng: -49.27, city: 'Goiânia')),
        athleteClassLevelProvider.overrideWith(
          (ref) => (code: 'intermediario', label: 'Intermediário 2'),
        ),
        classDirectoryProvider.overrideWith(
          (ref) async =>
              [_cfc, _ct, _norte, ClassProvider.fromProfessor(_rafa)],
        ),
        classProviderDetailProvider.overrideWith((ref, key) async => _detail),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ));
    await settle(tester);
    return router;
  }

  testWidgets('H2 · lista os quatro tipos, filtra e abre a arena',
      (tester) async {
    final router = await pump(tester, AppRoutes.classDirectory);
    expect(find.text('GOIÂNIA · 3 LOCAIS · 1 PROFESSOR'), findsOneWidget);
    expect(find.text('4 RESULTADOS'), findsOneWidget);
    expect(find.byKey(const Key('class-directory-arena-cfc')), findsOneWidget);
    expect(find.byKey(const Key('class-directory-professor-uRafa')),
        findsOneWidget);
    expect(find.text('Intermediário B · Seg 19:00'), findsOneWidget);
    expect(find.textContaining('Intermediário 2'), findsOneWidget);

    await tester.tap(find.text('CTs'));
    await settle(tester);
    expect(find.text('1 RESULTADO'), findsOneWidget);
    expect(find.byKey(const Key('class-directory-center-elv')), findsOneWidget);

    await tester.tap(find.text('Todos'));
    await settle(tester);
    await tester.tap(find.byKey(const Key('class-directory-opening')));
    await settle(tester);
    expect(find.byKey(const Key('class-directory-arena-norte')), findsNothing);

    await tester.tap(find.byKey(const Key('class-directory-arena-cfc')));
    await settle(tester);
    expect(router.state.uri.path, '/competir/aulas/arena/cfc');
  });

  testWidgets('H3 · folha de filtros conta o resultado antes de aplicar',
      (tester) async {
    await pump(tester, AppRoutes.classDirectory);
    await tester.tap(find.byKey(const Key('class-directory-filters')));
    await settle(tester);
    expect(find.text('Ver 3 locais e 1 professor'), findsOneWidget);
    await tester.tap(find.byKey(const Key('class-directory-level-avancado')));
    await settle(tester);
    expect(find.text('Ver 1 local e 1 professor'), findsOneWidget);
    await tester.tap(find.byKey(const Key('class-directory-filters-apply')));
    await settle(tester);
    expect(find.text('2 RESULTADOS'), findsOneWidget);
    expect(find.byKey(const Key('class-directory-center-elv')), findsOneWidget);
  });

  testWidgets('H4 · turmas do dia, lotada, planos e professor abre o perfil',
      (tester) async {
    final router = await pump(tester, '/competir/aulas/arena/cfc');
    expect(find.text('Arena CFC'), findsWidgets);
    await tester.tap(find.byKey(const Key('class-day-1')));
    await settle(tester);
    expect(find.byKey(const Key('class-row-t1')), findsOneWidget);
    expect(find.byKey(const Key('class-row-t2')), findsOneWidget);
    expect(find.text('LOTADA'), findsOneWidget);
    expect(find.text('2 VAGAS'), findsOneWidget);
    expect(find.text(r'R$ 220/mês', findRichText: true), findsOneWidget);
    expect(find.textContaining('4h de antecedência'), findsOneWidget);
    expect(find.text('Quero entrar'), findsOneWidget);

    await tester.tap(find.byKey(const Key('class-row-t2')));
    await settle(tester);
    expect(find.text('Turma lotada · lista de espera'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.byKey(const Key('class-staff-uThiago')),
      200,
      scrollable: find
          .descendant(
            of: find.byKey(const Key('class-provider-detail')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.tap(find.byKey(const Key('class-staff-uThiago')));
    await settle(tester);
    expect(router.state.uri.path, '/treinos/professor/uThiago');
  });
}

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 80));
  }
}
