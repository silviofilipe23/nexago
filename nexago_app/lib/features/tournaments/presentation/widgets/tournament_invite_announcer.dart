import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../domain/tournament_invite_announcer.dart';
import '../../domain/tournament_invite_announcer_providers.dart';
import '../../domain/tournament_partner_invite.dart';
import '../../domain/tournament_partner_invite_providers.dart';

/// Abre a tela do convite de dupla/equipe ao entrar no app.
///
/// Antes disso, um convite recebido só aparecia na Agenda ou para quem tocasse
/// no link/notificação — quem abria o app direto na Home não tinha como saber
/// que alguém estava esperando resposta.
///
/// A decisão de O QUE anunciar mora em [nextInviteToAnnounce] (pura, testada).
/// Aqui só ficam as três coisas que dependem do mundo: quem é o atleta, se a
/// tela do app está visível, e a navegação.
///
/// A tela aberta é a mesma do deep link (`/torneios-convite/:id`), com as três
/// saídas: aceitar (passa pelo termo LGPD, pela confirmação de nível e pelo
/// uniforme), recusar, ou voltar — que é o "decidir depois".
class TournamentInviteAnnouncer extends ConsumerStatefulWidget {
  const TournamentInviteAnnouncer({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<TournamentInviteAnnouncer> createState() =>
      _TournamentInviteAnnouncerState();
}

class _TournamentInviteAnnouncerState
    extends ConsumerState<TournamentInviteAnnouncer> {
  bool _opening = false;

  void _maybeAnnounce(List<TournamentPartnerInvite> pending) {
    if (_opening || !mounted) return;
    final uid = ref.read(announcerAthleteUidProvider);
    if (uid.isEmpty) return;

    final session = ref.read(inviteAnnouncementSessionProvider);
    final invite = nextInviteToAnnounce(
      pending: pending,
      announced: session.announcedFor(uid),
      sessionStartedAt: session.startedAt,
    );
    if (invite == null) return;

    _opening = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) {
        _opening = false;
        return;
      }
      // Só anuncia com a casca do atleta à vista: se o atleta já está numa
      // inscrição, num pagamento ou no próprio convite (deep link), empilhar
      // outra tela por cima seria justamente o que o corte de sessão evita.
      if (ModalRoute.of(context)?.isCurrent != true) {
        _opening = false;
        return;
      }
      session.markAnnounced(uid, invite.id);
      await context.pushNamed(
        AppRouteNames.tournamentPartnerInvite,
        pathParameters: <String, String>{'inviteId': invite.id},
      );
      if (mounted) _opening = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<List<TournamentPartnerInvite>>>(
      pendingTournamentPartnerInvitesProvider,
      (previous, next) {
        final invites = next.valueOrNull;
        if (invites != null) _maybeAnnounce(invites);
      },
    );

    // O primeiro valor do stream pode chegar antes do primeiro `listen` — sem
    // esta leitura, quem abre o app com convite pendente só veria a tela se o
    // stream emitisse de novo.
    final current = ref
        .watch(pendingTournamentPartnerInvitesProvider)
        .valueOrNull;
    if (current != null) _maybeAnnounce(current);

    return widget.child;
  }
}
