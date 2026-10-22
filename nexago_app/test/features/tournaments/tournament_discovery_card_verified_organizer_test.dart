// Selo de organizador verificado no card do Competir: nome + selo só quando
// `organizerPublicProfiles/{managerId}` é exibível e `verified`. Sem selo o card segue sem
// linha de organizador, como sempre foi.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_public_profile_models.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_public_profile_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_discovery_card.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  DiscoveryTournament buildTournament({String? managerId}) {
    return DiscoveryTournament(
      id: 't1',
      name: 'Copa Teste',
      location: 'Arena Teste',
      city: 'Goiânia',
      dateLabel: '16/08',
      startDate: DateTime(2026, 8, 16),
      categories: const [TournamentGenderCat.m],
      format: TournamentFormat.dupla,
      priceLabel: 'R\$ 140,00',
      priceValue: 140,
      spotsLeft: 2,
      spotsTotal: 8,
      status: TournamentListingStatus.open,
      featured: false,
      enrolledCount: 6,
      liveMatchesNow: 0,
      managerId: managerId,
    );
  }

  Future<List<String>> pumpCard(
    WidgetTester tester, {
    String? managerId,
    OrganizerPublicProfile? profile,
  }) async {
    final watched = <String>[];
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          organizerPublicProfileProvider.overrideWith((ref, id) {
            watched.add(id);
            return Stream.value(profile);
          }),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(
            body: SingleChildScrollView(
              child: TournamentDiscoveryCard(
                tournament: buildTournament(managerId: managerId),
                onTap: () {},
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    return watched;
  }

  const verifiedProfile = OrganizerPublicProfile(
    uid: 'org-1',
    name: 'Liga Areia',
    isOrganizer: true,
    verified: true,
  );

  testWidgets('organizador verificado: nome e selo', (tester) async {
    final watched = await pumpCard(
      tester,
      managerId: 'org-1',
      profile: verifiedProfile,
    );

    expect(watched, ['org-1']);
    expect(find.text('Liga Areia'), findsOneWidget);
    expect(find.byIcon(Icons.verified_rounded), findsOneWidget);
    final icon = tester.widget<Icon>(find.byIcon(Icons.verified_rounded));
    expect(icon.semanticLabel, 'Organizador verificado');
  });

  testWidgets('organizador não verificado: sem linha', (tester) async {
    await pumpCard(
      tester,
      managerId: 'org-1',
      profile: const OrganizerPublicProfile(
        uid: 'org-1',
        name: 'Liga Areia',
        isOrganizer: true,
      ),
    );

    expect(find.text('Liga Areia'), findsNothing);
    expect(find.byIcon(Icons.verified_rounded), findsNothing);
  });

  testWidgets('verificado mas sem identidade projetada: sem linha', (
    tester,
  ) async {
    await pumpCard(
      tester,
      managerId: 'org-1',
      profile: const OrganizerPublicProfile(
        uid: 'org-1',
        name: 'Organizador',
        verified: true,
      ),
    );

    expect(find.byIcon(Icons.verified_rounded), findsNothing);
  });

  testWidgets('torneio sem managerId não consulta perfil', (tester) async {
    final watched = await pumpCard(tester, profile: verifiedProfile);

    expect(watched, isEmpty);
    expect(find.byIcon(Icons.verified_rounded), findsNothing);
  });
}
