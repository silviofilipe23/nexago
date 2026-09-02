import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/domain/tournament_access_providers.dart';
import 'package:nexago_app/features/tournaments/data/tournament_registration_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_pix_args.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_registration_pix_page.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/registration_wizard/registration_wizard_notice.dart';

void main() {
  testWidgets('PIX mostra countdown da vaga com janela fixa do torneio', (
    tester,
  ) async {
    final holdExpiresAt = DateTime.now().add(const Duration(minutes: 20));
    final args = TournamentRegistrationPixArgs(
      registrationId: 'reg-1',
      tournamentId: 't1',
      tournamentName: 'Copa Teste',
      categoryName: 'Dupla Masculina',
      shareAmountReais: 100,
      holdExpiresAt: holdExpiresAt,
      holdMinutes: 30,
    );

    final auth = MockFirebaseAuth(
      signedIn: true,
      mockUser: MockUser(uid: 'atleta-1'),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          firebaseAuthProvider.overrideWithValue(auth),
          tournamentAccessStateProvider.overrideWith(
            (ref) => const TournamentAccessState(
              canAccess: true,
              onboardingCompleted: true,
              isProfileComplete: true,
              blockMessage: null,
              missingStepTitles: [],
            ),
          ),
          athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
          tournamentRegistrationSnapshotProvider('reg-1').overrideWith(
            (ref) => Stream.value(
              TournamentRegistrationSnapshot(
                registrationId: 'reg-1',
                isPaid: false,
                paidAmount: 0,
                holdExpiresAt: holdExpiresAt,
              ),
            ),
          ),
        ],
        child: MaterialApp(
          home: TournamentRegistrationPixPage(args: args),
        ),
      ),
    );
    await tester.pump();

    expect(find.byType(RegistrationWizardNotice), findsOneWidget);
    expect(find.text('PAGUE EM 30 MIN'), findsOneWidget);
    expect(find.text('PAGUE EM 20 MIN'), findsNothing);
  });
}
