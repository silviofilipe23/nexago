import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/features/arenas/domain/my_bookings_providers.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_models.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite_providers.dart';

TournamentPartnerInvite _invite({
  String id = 'inv-1',
  String status = 'pending',
  DateTime? expiresAt,
}) =>
    TournamentPartnerInvite(
      id: id,
      tournamentId: 't1',
      categoryId: 'cat-b',
      inviterUid: 'parceiro-1',
      inviterName: 'Lucas',
      inviteeUid: 'u1',
      inviteeName: 'Atleta',
      status: status,
      createdAt: DateTime(2026, 11, 1),
      expiresAt: expiresAt ?? DateTime(2099, 1, 1),
    );

Future<List<AthleteAgendaNeedsYouItem>> _read(
  List<TournamentPartnerInvite> invites,
) async {
  final container = ProviderContainer(
    overrides: [
      authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
      pendingTournamentPartnerInvitesProvider
          .overrideWith((ref) => Stream.value(invites)),
      myBookingsStreamProvider.overrideWith((ref) => Stream.value(const [])),
      myGuestBookingsStreamProvider
          .overrideWith((ref) => Stream.value(const [])),
    ],
  );
  addTearDown(container.dispose);
  final sub = container.listen(athleteAgendaNeedsYouProvider, (_, __) {});
  addTearDown(sub.close);
  await container.read(authProvider.future);
  await container.read(pendingTournamentPartnerInvitesProvider.future);
  await container.read(myBookingsStreamProvider.future);
  await container.read(myGuestBookingsStreamProvider.future);
  return container.read(athleteAgendaNeedsYouProvider);
}

void main() {
  test('sem convite pendente, "Precisa de você" fica vazia (nada de demo)',
      () async {
    final items = await _read(const []);

    expect(items, isEmpty);
  });

  test('convite de dupla recebido e pendente vira pendência real', () async {
    final items = await _read([_invite()]);

    expect(items, hasLength(1));
    expect(items.single.kind, AthleteAgendaNeedsYouKind.partnerInvite);
    expect(items.single.inviteId, 'inv-1');
    expect(items.single.title, 'Lucas convidou você');
    expect(items.any((i) => i.isMock), isFalse);
  });

  test('convite vencido ou já respondido não entra', () async {
    final items = await _read([
      _invite(id: 'vencido', expiresAt: DateTime(2020, 1, 1)),
      _invite(id: 'aceito', status: 'accepted'),
    ]);

    expect(items, isEmpty);
  });
}
