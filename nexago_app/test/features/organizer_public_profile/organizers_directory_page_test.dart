import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_public_profile_models.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_public_profile_providers.dart';
import 'package:nexago_app/features/organizer_public_profile/presentation/organizers_directory_page.dart';

OrganizerPublicProfile _organizer(
  String uid,
  String name, {
  String? city,
  String? state,
  int followers = 0,
  int open = 0,
  int completed = 0,
  bool verified = false,
}) {
  return OrganizerPublicProfile(
    uid: uid,
    name: name,
    city: city,
    state: state,
    isOrganizer: true,
    listed: true,
    verified: verified,
    followersCount: followers,
    stats: OrganizerPublicStats(openEvents: open, eventsCompleted: completed),
  );
}

Future<void> _pump(
  WidgetTester tester,
  Stream<List<OrganizerPublicProfile>> organizers,
) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        organizersDirectoryProvider.overrideWith((ref) => organizers),
        organizerReputationProvider.overrideWith(
          (ref, organizerId) => Stream.value(
            organizerId == 'goi'
                ? const OrganizerReputation(
                    reviewsCount: 12,
                    tournamentsRated: 2,
                    average: 4.8,
                  )
                : null,
          ),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const OrganizersDirectoryPage(),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  final organizers = [
    _organizer(
      'goi',
      'Liga Amadora Goiânia',
      city: 'Goiânia',
      state: 'GO',
      followers: 2100,
      open: 3,
      completed: 38,
      verified: true,
    ),
    _organizer(
      'sp',
      'Arena Sul Eventos',
      city: 'São Paulo',
      state: 'SP',
      followers: 40,
      completed: 5,
    ),
  ];

  testWidgets('lista os organizadores com números, selo e inscrições abertas', (
    tester,
  ) async {
    await _pump(tester, Stream.value(organizers));

    expect(find.text('Organizadores'), findsOneWidget);
    expect(find.text('Liga Amadora Goiânia'), findsOneWidget);
    expect(find.text('Goiânia · GO'), findsOneWidget);
    expect(find.text('★ 4,8 · 38 eventos · 2.100 seguidores'), findsOneWidget);
    expect(find.text('3 com inscrição aberta'), findsOneWidget);
    expect(find.byIcon(Icons.verified_rounded), findsOneWidget);
    // Sem reputação pública, sem estrela.
    expect(find.text('5 eventos · 40 seguidores'), findsOneWidget);
  });

  testWidgets('busca sem acento por cidade filtra a lista', (tester) async {
    await _pump(tester, Stream.value(organizers));

    await tester.enterText(find.byType(TextField), 'sao paulo');
    await tester.pump();
    expect(find.text('Arena Sul Eventos'), findsOneWidget);
    expect(find.text('Liga Amadora Goiânia'), findsNothing);

    await tester.enterText(find.byType(TextField), 'recife');
    await tester.pumpAndSettle();
    expect(find.text('Nenhum organizador encontrado'), findsOneWidget);
  });

  testWidgets('lista vazia tem aviso próprio', (tester) async {
    await _pump(tester, Stream.value(const []));
    await tester.pumpAndSettle();
    expect(find.text('Nenhum organizador por aqui ainda'), findsOneWidget);
  });

  testWidgets('erro de rede oferece "Tentar de novo"', (tester) async {
    await _pump(tester, Stream.error(Exception('offline')));
    await tester.pumpAndSettle();
    expect(find.text('Tentar de novo'), findsOneWidget);
  });

  testWidgets('carregando não quebra', (tester) async {
    final controller = StreamController<List<OrganizerPublicProfile>>();
    addTearDown(controller.close);
    await _pump(tester, controller.stream);
    expect(find.text('Liga Amadora Goiânia'), findsNothing);
  });
}
