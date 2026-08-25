import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/tournament_team_roster_logic.dart';

/// Elenco da equipe (trio/quarteto/quinteto) na tela de inscrição.
///
/// Sem isto, quem entrava numa equipe pelo app não via com quem ia jogar nem
/// quantas vagas faltavam — só o portal web mostrava.
class TournamentRegistrationRosterCard extends StatelessWidget {
  const TournamentRegistrationRosterCard({
    super.key,
    required this.teamName,
    required this.members,
    required this.remainingSlots,
    this.onLeaveTeam,
    this.leaving = false,
  });

  final String? teamName;
  final List<TournamentRosterMember> members;
  final int remainingSlots;

  /// `null` quando o atleta não pode sair (capitão, ou cota já paga).
  final VoidCallback? onLeaveTeam;
  final bool leaving;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final name = teamName?.trim();

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  name != null && name.isNotEmpty ? name : 'Sua equipe',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
              ),
              Text(
                remainingSlots == 0
                    ? 'ELENCO COMPLETO'
                    : remainingSlots == 1
                        ? '1 VAGA'
                        : '$remainingSlots VAGAS',
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: remainingSlots == 0
                      ? AppColors.win
                      : colors.onSurfaceMuted,
                  letterSpacing: 0.4,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          for (final member in members) ...[
            Row(
              children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: AppColors.brand.withValues(alpha: 0.16),
                  foregroundImage: (member.photoUrl?.isNotEmpty ?? false)
                      ? NetworkImage(member.photoUrl!)
                      : null,
                  child: Text(
                    _initials(member.name),
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.brand,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    member.name,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: member.isMe ? FontWeight.w700 : null,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                if (member.isCaptain)
                  Text(
                    'CAPITÃO',
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: colors.onSurfaceMuted,
                      letterSpacing: 0.4,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 10),
          ],
          if (onLeaveTeam != null) ...[
            const SizedBox(height: 2),
            Align(
              alignment: Alignment.centerLeft,
              child: leaving
                  ? const Padding(
                      padding: EdgeInsets.symmetric(vertical: 8),
                      child: SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  : TextButton(
                      onPressed: onLeaveTeam,
                      style: TextButton.styleFrom(
                        foregroundColor: AppColors.live,
                        padding: EdgeInsets.zero,
                      ),
                      child: const Text('Sair da equipe'),
                    ),
            ),
          ],
        ],
      ),
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    if (parts.isEmpty) return 'AT';
    if (parts.length == 1) {
      final first = parts.first;
      return (first.length >= 2 ? first.substring(0, 2) : first).toUpperCase();
    }
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }
}
