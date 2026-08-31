// Widget tests da tela de sucesso da substituição (Task 6 da jornada v2):
// para onde `TournamentSubstitutionStatusPage` leva quando o convite vira
// `accepted` (`pushReplacement`, sem rota própria). A renderização do hero
// "Dupla/Equipe atualizada" já é coberta indiretamente em
// `tournament_substitution_status_page_test.dart` (grupo "aceito"); aqui o
// alvo é a navegação exclusiva desta tela — o CTA "Ver inscrição →".
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_substitution_success_page.dart';

void main() {
  const tournamentId = 't1';
  const registrationId = 'reg-1';
  const inviteId = 'invite-1';

  TournamentPartnerInvite convite() => TournamentPartnerInvite(
        id: inviteId,
        tournamentId: tournamentId,
        categoryId: 'masc',
        inviterUid: 'me',
        inviterName: 'Eu Mesmo',
        inviteeUid: 'carla',
        inviteeName: 'Carla Nunes',
        status: 'accepted',
        attachRegistrationId: registrationId,
        createdAt: DateTime.now(),
        expiresAt: DateTime.now().add(const Duration(hours: 40)),
        isSubstitutionInvite: true,
        replacedUid: 'ana',
        replacedName: 'Ana Souza',
      );

  MyTournamentRegistration inscricao() => MyTournamentRegistration(
        registrationId: registrationId,
        tournamentId: tournamentId,
        tournamentName: 'Copa de Teste',
        dateLabel: '20 ago',
        statusLabel: 'Confirmada',
        isPaid: true,
        categoryId: 'masc',
        category: const TournamentCategoryOffer(
          id: 'masc',
          name: 'Dupla Masculina',
          entryFee: 150,
        ),
      );

  /// `TournamentSubstitutionSuccessPage` é `StatelessWidget` (nem `ref`, nem
  /// stream) — só precisa de um `GoRouter` ancestral pra resolver o
  /// `context.pushReplacementNamed` do CTA. O destino é um placeholder: a
  /// tela real (`TournamentRegistrationDetailPage`) tem cobertura própria em
  /// `tournament_registration_detail_page_test.dart`; aqui o alvo é só a
  /// navegação (rota certa, params certos).
  Future<void> abrirSucesso(
    WidgetTester tester, {
    required TournamentPartnerInvite invite,
    MyTournamentRegistration? registration,
  }) async {
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => TournamentSubstitutionSuccessPage(
            invite: invite,
            registration: registration,
          ),
        ),
        GoRoute(
          path: AppRoutes.tournamentRegistrationDetail,
          name: AppRouteNames.tournamentRegistrationDetail,
          builder: (context, state) {
            final tId = state.pathParameters['tournamentId'] ?? '';
            final regId = state.pathParameters['registrationId'] ?? '';
            return Scaffold(body: Center(child: Text('DETALHE $tId/$regId')));
          },
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          registrationRosterProfilesProvider.overrideWith(
            (ref, uids) async => const <String, AppUserProfile>{},
          ),
        ],
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  testWidgets(
      '"Ver inscrição →" navega pro detalhe com o tournamentId/registrationId '
      'do convite', (tester) async {
    await abrirSucesso(
      tester,
      invite: convite(),
      registration: inscricao(),
    );

    expect(find.text('Dupla atualizada'), findsOneWidget);

    await tester.tap(find.text('Ver inscrição →'));
    await tester.pumpAndSettle();

    expect(
      find.text('DETALHE $tournamentId/$registrationId'),
      findsOneWidget,
    );
    expect(find.text('Dupla atualizada'), findsNothing);
  });

  testWidgets(
      'sem inscrição carregada, usa o registrationId do próprio convite',
      (tester) async {
    await abrirSucesso(
      tester,
      invite: convite(),
      registration: null,
    );

    await tester.tap(find.text('Ver inscrição →'));
    await tester.pumpAndSettle();

    expect(
      find.text('DETALHE $tournamentId/$registrationId'),
      findsOneWidget,
    );
  });
}
