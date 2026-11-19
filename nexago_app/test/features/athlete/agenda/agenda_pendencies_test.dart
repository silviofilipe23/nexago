import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/agenda/agenda_pendencies.dart';
import 'package:nexago_app/features/athlete_billing/domain/athlete_billing.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';

AthleteCharge _charge(
  String id, {
  AthleteChargeKind kind = AthleteChargeKind.classes,
  AthleteChargeState state = AthleteChargeState.due,
  String? dueDate,
}) =>
    AthleteCharge(
      id: id,
      kind: kind,
      title: 'Cobrança $id',
      payee: 'Arena Orla',
      amountReais: 60,
      state: state,
      dueDate: dueDate,
      target: const TrainingPlansTarget(),
    );

TournamentPartnerInvite _invite(
  String id, {
  String invitee = 'u1',
  String status = 'pending',
  DateTime? expiresAt,
}) =>
    TournamentPartnerInvite(
      id: id,
      tournamentId: 't1',
      categoryId: 'cat-b',
      inviterUid: 'parceiro-1',
      inviterName: 'Lucas',
      inviteeUid: invitee,
      inviteeName: 'Atleta',
      status: status,
      createdAt: DateTime(2026, 11, 1),
      expiresAt: expiresAt ?? DateTime(2099, 1, 1),
    );

List<String> _ids(List<AgendaPendency> list) => [for (final p in list) p.id];

void main() {
  test('junta cobranças e convites numa fila só', () {
    final list = buildAgendaPendencies(
      uid: 'u1',
      charges: [_charge('mensal')],
      invites: [_invite('inv')],
    );

    expect(list, hasLength(2));
    expect(list.whereType<AgendaChargePendency>().single.charge.id, 'mensal');
    expect(list.whereType<AgendaInvitePendency>().single.inviteId, 'inv');
  });

  test('ordem: vencida, Pix de reserva, convite, a vencer e pagar direto', () {
    final list = buildAgendaPendencies(
      uid: 'u1',
      charges: [
        _charge('direto', state: AthleteChargeState.direct),
        _charge('a-vencer', dueDate: '2026-12-05'),
        _charge(
          'pix',
          kind: AthleteChargeKind.booking,
        ),
        _charge(
          'vencida',
          state: AthleteChargeState.overdue,
          dueDate: '2026-11-05',
        ),
      ],
      invites: [_invite('inv')],
    );

    expect(
      _ids(list),
      [
        'charge-vencida',
        'charge-pix',
        'invite-inv',
        'charge-a-vencer',
        'charge-direto'
      ],
    );
  });

  test('convite vencido, respondido ou de outra pessoa fica de fora', () {
    final list = buildAgendaPendencies(
      uid: 'u1',
      charges: const [],
      invites: [
        _invite('vencido', expiresAt: DateTime(2020)),
        _invite('aceito', status: 'accepted'),
        _invite('de-outro', invitee: 'u2'),
      ],
    );

    expect(list, isEmpty);
  });

  test('visibleAgendaPendencies mostra 3 e diz quantas ficaram de fora', () {
    final list = buildAgendaPendencies(
      uid: 'u1',
      charges: [for (var i = 0; i < 5; i++) _charge('c$i')],
      invites: const [],
    );

    final visible = visibleAgendaPendencies(list, expanded: false);
    expect(visible.items, hasLength(3));
    expect(visible.hiddenCount, 2);

    final all = visibleAgendaPendencies(list, expanded: true);
    expect(all.items, hasLength(5));
    expect(all.hiddenCount, 0);
  });
}
