import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/tournament_partner_invite.dart';
import '../../../domain/tournament_registration_logic.dart';

/// Convites que o atleta enviou nesta categoria e seguem pendentes.
///
/// Na dupla o convite pendente esconde a busca de atletas, então esta lista é
/// o que resta na tela — e o "Cancelar" é o caminho para chamar outra pessoa.
/// Convites antigos em paralelo seguem aparecendo: o primeiro aceite derruba
/// os demais no backend.
class TournamentRegistrationSentInvitesList extends StatelessWidget {
  const TournamentRegistrationSentInvitesList({
    super.key,
    required this.invites,
    required this.isTeamCategory,
    required this.onCancel,
    this.cancelingInviteId,
  });

  final List<TournamentPartnerInvite> invites;

  /// Em equipe a busca continua na tela enquanto houver vaga, então os
  /// convites seguem como "outros"; na dupla eles são o elemento principal.
  final bool isTeamCategory;

  final ValueChanged<TournamentPartnerInvite> onCancel;

  /// Convite com cancelamento em voo — só ele trava.
  final String? cancelingInviteId;

  @override
  Widget build(BuildContext context) {
    if (invites.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          switch ((isTeamCategory, invites.length)) {
            (true, 1) => 'Outro convite enviado',
            (true, final n) => 'Outros $n convites enviados',
            (false, 1) => 'Convite enviado',
            (false, final n) => '$n convites enviados',
          },
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w800,
            color: colors.onSurface,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          !isTeamCategory && invites.length == 1
              ? 'Cancele o convite se quiser chamar outro atleta.'
              : 'O primeiro que aceitar fecha a vaga; os outros caem sozinhos.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: colors.onSurfaceMuted,
            height: 1.3,
          ),
        ),
        const SizedBox(height: 12),
        for (final invite in invites) ...[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: colors.surfaceRaised,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: colors.outline),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        invite.inviteeName.trim().isEmpty
                            ? 'Atleta convidado'
                            : invite.inviteeName,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Aguardando resposta · '
                        '${tournamentInviteExpiryLabel(invite.expiresAt)}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                if (cancelingInviteId == invite.id)
                  const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else
                  TextButton(
                    onPressed: cancelingInviteId == null
                        ? () => onCancel(invite)
                        : null,
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.live,
                    ),
                    child: const Text('Cancelar'),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}
