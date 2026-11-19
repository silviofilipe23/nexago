import '../../../athlete_billing/domain/athlete_billing.dart';
import '../../../tournaments/domain/tournament_partner_invite.dart';

/// Quantas pendências "Precisa de você" mostra antes do "Ver todas".
const kAgendaPendenciesVisible = 3;

/// Algo que o atleta precisa fazer, no topo da Agenda.
sealed class AgendaPendency {
  const AgendaPendency();

  String get id;
}

/// Cobrança em aberto (Pix da reserva, mensalidade de aula, horário fixo,
/// inscrição…). Vem das Cobranças: o toque leva à tela de pagar da origem.
class AgendaChargePendency extends AgendaPendency {
  const AgendaChargePendency(this.charge);

  final AthleteCharge charge;

  @override
  String get id => 'charge-${charge.id}';
}

/// Convite de dupla recebido, esperando resposta.
class AgendaInvitePendency extends AgendaPendency {
  const AgendaInvitePendency({
    required this.inviteId,
    required this.inviterName,
  });

  final String inviteId;
  final String inviterName;

  @override
  String get id => 'invite-$inviteId';
}

/// Fila única de pendências, da mais urgente para a menos:
/// cobrança vencida → Pix de reserva (a vaga expira) → convite de dupla →
/// cobrança a vencer → cobrança paga direto a quem recebe.
///
/// [charges] já chega em ordem de urgência (`buildOpenCharges`); a ordem
/// dentro de cada faixa é preservada.
List<AgendaPendency> buildAgendaPendencies({
  required String uid,
  required List<AthleteCharge> charges,
  required List<TournamentPartnerInvite> invites,
}) {
  final ranked = <(int, int, AgendaPendency)>[
    for (var i = 0; i < charges.length; i++)
      (_chargeRank(charges[i]), i, AgendaChargePendency(charges[i])),
    for (var i = 0; i < invites.length; i++)
      if (_isOpenInviteFor(invites[i], uid))
        (
          _inviteRank,
          i,
          AgendaInvitePendency(
            inviteId: invites[i].id,
            inviterName: invites[i].inviterName,
          ),
        ),
  ]..sort((a, b) {
      final byRank = a.$1.compareTo(b.$1);
      return byRank != 0 ? byRank : a.$2.compareTo(b.$2);
    });
  return [for (final r in ranked) r.$3];
}

const _inviteRank = 2;

int _chargeRank(AthleteCharge c) {
  if (c.isOverdue) return 0;
  if (c.kind == AthleteChargeKind.booking) return 1;
  return c.state == AthleteChargeState.direct ? 4 : 3;
}

bool _isOpenInviteFor(TournamentPartnerInvite invite, String uid) =>
    invite.isPending &&
    !invite.isExpired &&
    (uid.isEmpty || invite.inviteeUid == uid);

/// O recorte que a seção mostra: as [kAgendaPendenciesVisible] primeiras,
/// ou todas depois do "Ver todas".
class AgendaPendenciesView {
  const AgendaPendenciesView({required this.items, required this.hiddenCount});

  final List<AgendaPendency> items;
  final int hiddenCount;
}

AgendaPendenciesView visibleAgendaPendencies(
  List<AgendaPendency> all, {
  required bool expanded,
}) {
  if (expanded || all.length <= kAgendaPendenciesVisible) {
    return AgendaPendenciesView(items: all, hiddenCount: 0);
  }
  return AgendaPendenciesView(
    items: all.take(kAgendaPendenciesVisible).toList(growable: false),
    hiddenCount: all.length - kAgendaPendenciesVisible,
  );
}
