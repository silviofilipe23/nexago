import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/features/athlete/domain/agenda/agenda_pendencies.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_providers.dart';
import 'package:nexago_app/features/athlete_billing/application/athlete_billing_providers.dart';
import 'package:nexago_app/features/athlete_billing/domain/athlete_billing.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite_providers.dart';

const _pix = AthleteCharge(
  id: 'booking-b1',
  kind: AthleteChargeKind.booking,
  title: 'Reserva · Quadra 2 · 19/11 19:00',
  payee: 'Arena Orla',
  amountReais: 60,
  state: AthleteChargeState.due,
  note: 'aguardando o Pix',
  target: TrainingPlansTarget(),
);

const _mensalidade = AthleteCharge(
  id: 'class-e1',
  kind: AthleteChargeKind.classes,
  title: 'Mensal 2x · Novembro',
  payee: 'Arena Orla',
  amountReais: 180,
  state: AthleteChargeState.overdue,
  dueDate: '2026-11-05',
  target: TrainingPlansTarget(),
);

TournamentPartnerInvite _invite() => TournamentPartnerInvite(
      id: 'inv-1',
      tournamentId: 't1',
      categoryId: 'cat-b',
      inviterUid: 'parceiro-1',
      inviterName: 'Lucas',
      inviteeUid: 'u1',
      inviteeName: 'Atleta',
      status: 'pending',
      createdAt: DateTime(2026, 11, 1),
      expiresAt: DateTime(2099, 1, 1),
    );

Future<List<AgendaPendency>> _read({
  required List<AthleteCharge>? charges,
  List<TournamentPartnerInvite> invites = const [],
}) async {
  final container = ProviderContainer(
    overrides: [
      authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
      athleteOpenChargesProvider.overrideWith((ref) => charges),
      pendingTournamentPartnerInvitesProvider
          .overrideWith((ref) => Stream.value(invites)),
    ],
  );
  addTearDown(container.dispose);
  final sub = container.listen(athleteAgendaPendenciesProvider, (_, __) {});
  addTearDown(sub.close);
  await container.read(authProvider.future);
  await container.read(pendingTournamentPartnerInvitesProvider.future);
  return container.read(athleteAgendaPendenciesProvider);
}

void main() {
  test('Pix da reserva e mensalidade entram em "Precisa de você"', () async {
    final list = await _read(charges: const [_pix, _mensalidade]);

    final ids = [for (final p in list) p.id];
    // Mensalidade vencida vem antes do Pix.
    expect(ids, ['charge-class-e1', 'charge-booking-b1']);
  });

  test('convite de dupla entra junto das cobranças, depois do Pix', () async {
    final list = await _read(charges: const [_pix], invites: [_invite()]);

    expect([for (final p in list) p.id], ['charge-booking-b1', 'invite-inv-1']);
  });

  test('cobranças ainda carregando: a fila sai só com os convites', () async {
    final list = await _read(charges: null, invites: [_invite()]);

    expect([for (final p in list) p.id], ['invite-inv-1']);
  });

  test('nada em aberto: fila vazia', () async {
    final list = await _read(charges: const []);

    expect(list, isEmpty);
  });
}
