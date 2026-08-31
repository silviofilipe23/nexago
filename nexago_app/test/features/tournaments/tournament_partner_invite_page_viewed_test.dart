// Cobertura do read-receipt de substituição na tela do convite (Task 6 da
// jornada v2): `markSubstitutionInviteViewed` dispara UMA vez quando quem
// abre é o CONVIDADO de um convite de substituição pendente, e nunca mais —
// nem em rebuilds seguintes (o convite chega de novo pelo `watchInvite`),
// nem quando quem está logado não é o convidado, nem em convite de
// dupla/equipe comum (`isSubstitutionInvite: false`).
//
// O resto do comportamento da tela (aceitar/recusar, uniforme, gate de
// perfil) não é tocado por esta task — fora do escopo aqui.
import 'dart:async';

import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/domain/tournament_access_providers.dart';
import 'package:nexago_app/features/tournaments/data/tournament_partner_invite_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_partner_invite_page.dart';

void main() {
  const inviteId = 'invite-1';
  const tournamentId = 't1';

  TournamentPartnerInvite convite({
    String inviteeUid = 'carla',
    bool isSubstitutionInvite = true,
  }) =>
      TournamentPartnerInvite(
        id: inviteId,
        tournamentId: tournamentId,
        categoryId: 'masc',
        inviterUid: 'me',
        inviterName: 'Eu Mesmo',
        inviteeUid: inviteeUid,
        inviteeName: 'Carla Nunes',
        status: 'pending',
        attachRegistrationId: 'reg-1',
        createdAt: DateTime.now(),
        expiresAt: DateTime.now().add(const Duration(hours: 40)),
        isSubstitutionInvite: isSubstitutionInvite,
        replacedUid: 'ana',
        replacedName: 'Ana Souza',
      );

  late _FakeViewedInviteService service;

  Future<void> abrirConvite(
    WidgetTester tester, {
    required Stream<TournamentPartnerInvite?> inviteStream,
    String loggedUid = 'carla',
  }) async {
    service = _FakeViewedInviteService();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(
            (ref) => Stream.value(
              MockUser(uid: loggedUid, displayName: 'Carla Nunes'),
            ),
          ),
          tournamentAccessStateProvider.overrideWithValue(
            const TournamentAccessState(
              canAccess: true,
              onboardingCompleted: true,
              isProfileComplete: true,
            ),
          ),
          athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
          athleteProfileByIdProvider.overrideWith(
            (ref, uid) => Stream.value(null),
          ),
          tournamentDetailProvider(
            tournamentId,
          ).overrideWith((ref) => Stream.value(null)),
          tournamentPartnerInviteProvider(
            inviteId,
          ).overrideWith((ref) => inviteStream),
          tournamentPartnerInviteServiceProvider.overrideWithValue(service),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const TournamentPartnerInvitePage(inviteId: inviteId),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  testWidgets('convidado abrindo convite de substituição pendente: 1 chamada',
      (tester) async {
    await abrirConvite(
      tester,
      inviteStream: Stream.value(convite()),
    );

    expect(service.viewedCalls, [inviteId]);
  });

  testWidgets('rebuilds seguintes do mesmo convite não repetem a chamada',
      (tester) async {
    final controller = StreamController<TournamentPartnerInvite?>.broadcast();
    addTearDown(controller.close);

    await abrirConvite(tester, inviteStream: controller.stream);

    controller.add(convite());
    await tester.pump();
    await tester.pump();
    expect(service.viewedCalls, [inviteId]);

    // Mesmo convite de novo (ex.: `watchInvite` reemitindo por outro campo
    // que mudou) — não pode disparar uma 2ª vez.
    controller.add(convite());
    await tester.pump();
    await tester.pump();
    expect(service.viewedCalls, [inviteId]);
  });

  testWidgets('quem está logado não é o convidado: nenhuma chamada',
      (tester) async {
    await abrirConvite(
      tester,
      inviteStream: Stream.value(convite(inviteeUid: 'carla')),
      loggedUid: 'outro-uid',
    );

    expect(service.viewedCalls, isEmpty);
  });

  testWidgets('convite de dupla comum (não substituição): nenhuma chamada',
      (tester) async {
    await abrirConvite(
      tester,
      inviteStream: Stream.value(convite(isSubstitutionInvite: false)),
    );

    expect(service.viewedCalls, isEmpty);
  });
}

/// Dublê de `TournamentPartnerInviteService`: só captura as chamadas de
/// `markSubstitutionInviteViewed` — qualquer outro método usado por engano
/// denuncia via `noSuchMethod` (esta bateria não testa aceitar/recusar).
class _FakeViewedInviteService implements TournamentPartnerInviteService {
  final viewedCalls = <String>[];

  @override
  Future<void> markSubstitutionInviteViewed(String inviteId) async {
    viewedCalls.add(inviteId);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê não implementa ${invocation.memberName}. '
      'Se o teste passou a exercitar este método, cubra-o aqui.',
    );
  }
}
