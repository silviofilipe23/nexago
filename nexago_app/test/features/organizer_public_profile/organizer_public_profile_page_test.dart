import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/nexa_skeleton.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart';
import 'package:nexago_app/features/organizer_public_profile/data/organizer_event_mapper.dart';
import 'package:nexago_app/features/organizer_public_profile/data/organizer_public_profile_repository.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_event.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_public_profile_models.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_public_profile_providers.dart';
import 'package:nexago_app/features/organizer_public_profile/presentation/organizer_public_profile_page.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';

const _orgId = 'org-1';
const _athleteId = 'atleta-1';

OrganizerPublicProfile _profile({String? whatsapp, bool isOrganizer = true}) {
  return OrganizerPublicProfile.fromMap(_orgId, {
    'uid': _orgId,
    'name': 'Liga Amadora Goiânia',
    'city': 'Goiânia',
    'state': 'GO',
    'bio': 'Ligas e torneios de areia em Goiânia.',
    if (whatsapp != null) 'whatsapp': whatsapp,
    'isOrganizer': isOrganizer,
    'verified': true,
    'listed': true,
    'followersCount': 2100,
    'stats': {
      'eventsCompleted': 38,
      'athletes': 1240,
      'openEvents': 1,
      'listedEvents': 40,
      'organizerSince': Timestamp.fromDate(DateTime(2021, 3, 6, 12)),
      'sports': ['beachVolleyball'],
      'venues': [
        {'name': 'Arena ErreJota', 'city': 'Goiânia', 'count': 12},
      ],
    },
  })!;
}

List<OrganizerEvent> _events() {
  final next = DateTime.now().add(const Duration(days: 20));
  return [
    organizerEventFromMap('ev-open', {
      'name': 'Copa Verão Beach Vôlei',
      'listingStatus': 'open',
      'sport': 'beachVolleyball',
      'locationName': 'Arena ErreJota',
      'startAt': Timestamp.fromDate(next),
      'categories': [
        {
          'id': 'c1',
          'categoryName': 'Masculino B',
          'entryFee': 140,
          'maxTeams': 32,
        },
      ],
    })!,
    organizerEventFromMap('ev-done', {
      'name': 'Torneio de Abertura',
      'listingStatus': 'completed',
      'sport': 'beachVolleyball',
      'startAt': Timestamp.fromDate(DateTime(2026, 5, 2, 8)),
    })!,
  ];
}

/// Repositório falso: só seguir/deixar de seguir. O resto da tela vem dos overrides.
class _FakeRepository implements OrganizerPublicProfileRepository {
  final followCalls = <String>[];
  Completer<void>? pending;
  Object? failWith;

  Future<void> _write(String call) async {
    followCalls.add(call);
    final completer = pending;
    if (completer != null) await completer.future;
    final error = failWith;
    if (error != null) throw error;
  }

  @override
  Future<void> follow({
    required String organizerId,
    required String followerId,
  }) => _write('follow:$organizerId:$followerId');

  @override
  Future<void> unfollow({
    required String organizerId,
    required String followerId,
  }) => _write('unfollow:$organizerId:$followerId');

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void _tallScreen(WidgetTester tester, {double width = 430}) {
  tester.view.devicePixelRatio = 1.0;
  tester.view.physicalSize = Size(width, 3200);
  addTearDown(tester.view.reset);
}

Future<void> _pump(
  WidgetTester tester, {
  required Stream<OrganizerPublicProfile?> profile,
  OrganizerReputation? reputation,
  String viewerUid = _athleteId,
  Stream<bool>? isFollowed,
  _FakeRepository? repository,
  double width = 430,
}) async {
  _tallScreen(tester, width: width);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith(
          (ref) => Stream<User?>.value(MockUser(uid: viewerUid)),
        ),
        organizerPublicProfileProvider(_orgId).overrideWith((ref) => profile),
        organizerEventsProvider(
          _orgId,
        ).overrideWith((ref) => Stream.value(_events())),
        organizerReputationProvider(
          _orgId,
        ).overrideWith((ref) => Stream.value(reputation)),
        organizerChampionNamesProvider(
          _orgId,
        ).overrideWith((ref) async => const <String, String>{}),
        organizerReviewSummariesProvider(_orgId).overrideWith(
          (ref) => Stream.value(const <TournamentReviewSummary>[]),
        ),
        organizerIsFollowedProvider(
          _orgId,
        ).overrideWith((ref) => isFollowed ?? Stream.value(false)),
        tournamentCategoryEnrollmentCountsProvider(
          'ev-open',
        ).overrideWith((ref) => Stream.value(const {'c1': 10})),
        organizerRealizedEntriesProvider(
          'ev-done',
        ).overrideWith((ref) async => 16),
        if (repository != null)
          organizerPublicProfileRepositoryProvider.overrideWithValue(
            repository,
          ),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const OrganizerPublicProfilePage(organizerId: _orgId),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('carregando: esqueleto, sem "não encontrado"', (tester) async {
    final controller = StreamController<OrganizerPublicProfile?>();
    addTearDown(controller.close);
    await _pump(tester, profile: controller.stream);

    expect(find.byType(NexaSkeleton), findsWidgets);
    expect(find.text('Organizador não encontrado'), findsNothing);
  });

  testWidgets('sem doc: "Organizador não encontrado" com botão para a lista', (
    tester,
  ) async {
    await _pump(tester, profile: Stream.value(null));
    await tester.pumpAndSettle();

    expect(find.text('Organizador não encontrado'), findsOneWidget);
    expect(find.text('Ver organizadores'), findsOneWidget);
  });

  testWidgets(
    'doc só com números (sem isOrganizer) também é "não encontrado"',
    (tester) async {
      await _pump(tester, profile: Stream.value(_profile(isOrganizer: false)));
      await tester.pumpAndSettle();

      expect(find.text('Organizador não encontrado'), findsOneWidget);
      expect(find.text('Liga Amadora Goiânia'), findsNothing);
    },
  );

  testWidgets('sem reputação: sem nota no cabeçalho e o aviso no card', (
    tester,
  ) async {
    await _pump(
      tester,
      profile: Stream.value(_profile()),
      reputation: const OrganizerReputation(
        reviewsCount: 2,
        tournamentsRated: 1,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Liga Amadora Goiânia'), findsOneWidget);
    expect(find.byIcon(Icons.verified_rounded), findsOneWidget);
    expect(find.textContaining('Goiânia · GO'), findsOneWidget);
    expect(find.textContaining('Organizador desde 2021'), findsOneWidget);
    expect(find.text('EVENTOS REALIZADOS'), findsOneWidget);
    expect(find.text('38'), findsOneWidget);
    expect(find.text('1.240'), findsOneWidget);
    expect(find.text('2.100'), findsOneWidget);
    expect(find.text('NOTA MÉDIA'), findsNothing);
    expect(find.text('Ainda sem avaliações suficientes'), findsOneWidget);
    // Sem WhatsApp público, sem "Mensagem".
    expect(find.text('Mensagem'), findsNothing);
    expect(find.text('Seguir'), findsOneWidget);
    // Próximo evento e histórico.
    expect(find.text('Copa Verão Beach Vôlei'), findsOneWidget);
    expect(find.text('INSCRIÇÕES ABERTAS'), findsOneWidget);
    expect(find.text('Inscrever'), findsOneWidget);
    expect(find.text('R\$\u00a0140'), findsOneWidget);
    expect(find.text('POR DUPLA'), findsOneWidget);
    expect(find.text('10/32'), findsOneWidget);
    expect(find.text('Torneio de Abertura'), findsOneWidget);
    // Realizado: contagem única (count()), não o stream de inscrições.
    expect(find.textContaining('16 duplas inscritas'), findsOneWidget);
    expect(find.text('Onde acontece'), findsOneWidget);
    expect(find.text('Arena ErreJota'), findsWidgets);
  });

  testWidgets(
    'com reputação pública: nota no cabeçalho; WhatsApp vira Mensagem',
    (tester) async {
      await _pump(
        tester,
        profile: Stream.value(_profile(whatsapp: '5562999990000')),
        reputation: const OrganizerReputation(
          reviewsCount: 312,
          tournamentsRated: 9,
          average: 4.8,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('NOTA MÉDIA'), findsOneWidget);
      expect(find.text('4,8'), findsWidgets);
      expect(find.text('Ainda sem avaliações suficientes'), findsNothing);
      expect(find.text('Mensagem'), findsOneWidget);
    },
  );

  testWidgets('tela estreita (320) com todas as ações cabe sem overflow', (
    tester,
  ) async {
    await _pump(
      tester,
      profile: Stream.value(_profile(whatsapp: '5562999990000')),
      reputation: const OrganizerReputation(
        reviewsCount: 312,
        tournamentsRated: 9,
        average: 4.8,
      ),
      width: 320,
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Seguir'), findsOneWidget);
    expect(find.text('Mensagem'), findsOneWidget);
  });

  testWidgets('próprio perfil: Seguir some, Compartilhar fica', (tester) async {
    await _pump(tester, profile: Stream.value(_profile()), viewerUid: _orgId);
    await tester.pumpAndSettle();

    expect(find.text('Seguir'), findsNothing);
    expect(find.text('Seguindo'), findsNothing);
    expect(find.text('Compartilhar'), findsOneWidget);
    // O convite a seguir também some do aviso de "sem próximos" (aqui há próximo, mas o texto
    // de convite nunca aparece no próprio perfil).
    expect(find.textContaining('Siga para saber'), findsNothing);
  });

  testWidgets('seguir é otimista e grava o doc do atleta', (tester) async {
    final repository = _FakeRepository()..pending = Completer<void>();
    final followed = StreamController<bool>();
    addTearDown(followed.close);
    followed.add(false);
    await _pump(
      tester,
      profile: Stream.value(_profile()),
      isFollowed: followed.stream,
      repository: repository,
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Seguir'));
    await tester.pump();

    // Antes de a escrita terminar a tela já diz "Seguindo".
    expect(find.text('Seguindo'), findsOneWidget);
    expect(repository.followCalls, ['follow:$_orgId:$_athleteId']);

    repository.pending!.complete();
    followed.add(true);
    await tester.pumpAndSettle();
    expect(find.text('Seguindo'), findsOneWidget);
  });

  testWidgets('erro ao seguir desfaz e avisa', (tester) async {
    final repository = _FakeRepository()
      ..pending = Completer<void>()
      ..failWith = FirebaseException(plugin: 'cloud_firestore');
    await _pump(
      tester,
      profile: Stream.value(_profile()),
      repository: repository,
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Seguir'));
    await tester.pump();
    expect(find.text('Seguindo'), findsOneWidget);

    repository.pending!.complete();
    await tester.pumpAndSettle();

    expect(find.text('Seguir'), findsOneWidget);
    expect(find.text('Seguindo'), findsNothing);
    expect(
      find.text('Não foi possível seguir agora. Tente de novo.'),
      findsOneWidget,
    );
  });

  testWidgets('deixar de seguir chama unfollow', (tester) async {
    final repository = _FakeRepository();
    await _pump(
      tester,
      profile: Stream.value(_profile()),
      isFollowed: Stream.value(true),
      repository: repository,
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Seguindo'));
    await tester.pump();
    expect(find.text('Seguir'), findsOneWidget);
    expect(repository.followCalls, ['unfollow:$_orgId:$_athleteId']);
  });

  testWidgets('abas: Avaliações mostra o aviso sem reputação', (tester) async {
    await _pump(tester, profile: Stream.value(_profile()));
    await tester.pumpAndSettle();

    // As abas rolam na horizontal: a última pode estar fora da tela.
    await tester.ensureVisible(find.text('Avaliações'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Avaliações'));
    await tester.pumpAndSettle();
    expect(find.text('Ainda sem avaliações suficientes'), findsOneWidget);
    expect(find.text('Copa Verão Beach Vôlei'), findsNothing);

    await tester.ensureVisible(find.text('Resultados'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Resultados'));
    await tester.pumpAndSettle();
    expect(find.text('Torneio de Abertura'), findsOneWidget);
    expect(find.text('Campeões ainda não registrados.'), findsOneWidget);
  });
}
