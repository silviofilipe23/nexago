import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/athlete_tournament_day_logic.dart';
import '../../domain/tournament_detail_model.dart';
import '../../domain/tournament_detail_tabs_logic.dart';
import '../../domain/tournament_discovery_providers.dart';
import '../../domain/tournament_match_display.dart';

/// A folha "Hoje é dia de torneio" — o convite para entrar no Modo Focus.
///
/// Substitui o redirect automático que a versão anterior fazia. Os protótipos
/// são explícitos aqui: o atleta ESCOLHE entrar ("Entrar no Focus") ou adiar
/// ("Depois"). É menos agressivo que sequestrar a navegação de quem abriu o app
/// para reservar quadra, e resolve o mesmo problema — ninguém perde o jogo por
/// não saber que o Focus existe.
Future<bool?> showFocusInviteSheet(
  BuildContext context, {
  required AthleteNextMatch target,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _FocusInviteSheet(target: target),
  );
}

class _FocusInviteSheet extends ConsumerWidget {
  const _FocusInviteSheet({required this.target});

  final AthleteNextMatch target;

  /// "SÁB 29 AGO · DIA 2 DE 3" — o dia do evento só entra quando o torneio
  /// declara início E fim e está mesmo rolando; senão a linha encolhe para a
  /// data, em vez de afirmar um dia que não dá para calcular.
  String _kicker(TournamentDetail? tournament) {
    final now = DateTime.now();
    final raw = DateFormat('EEE d MMM', 'pt_BR').format(now).replaceAll('.', '');
    final parts = <String>[raw.toUpperCase()];
    if (tournament != null) {
      final meta = tournamentDetailHeroMeta(tournament, now);
      for (final piece in meta.split(' · ')) {
        if (piece.toLowerCase().startsWith('dia ')) {
          parts.add(piece.toUpperCase());
        }
      }
    }
    return parts.join(' · ');
  }

  /// "R3 · 12:10 · Q3 · vs Sá / Toledo" — só o que o organizador marcou.
  String _matchLine() {
    final m = target.match;
    final parts = <String>[
      if (m.scheduleTime != null) matchTimeLabelForCard(m),
      if (matchCourtLabelForCard(m).trim().isNotEmpty)
        matchCourtLabelForCard(m),
    ];
    return parts.isEmpty ? 'Horário a definir' : parts.join(' · ');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final tournament =
        ref.watch(tournamentDetailProvider(target.tournamentId)).valueOrNull;

    return SafeArea(
      top: false,
      child: Container(
        decoration: BoxDecoration(
          color: colors.surfaceSheet,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
        ),
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          AppSpacing.md,
          AppSpacing.screenH,
          AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: AppSpacing.lg),
                decoration: BoxDecoration(
                  color: colors.outline,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                    vertical: AppSpacing.xs + 2,
                  ),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: AppColors.brand),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.local_fire_department_rounded,
                        size: 12,
                        color: AppColors.brand,
                      ),
                      const SizedBox(width: 5),
                      Text(
                        'MODO FOCUS',
                        style: AppTypography.eyebrow
                            .copyWith(color: AppColors.brand),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Text(
                    _kicker(tournament),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.eyebrow
                        .copyWith(color: colors.onSurfaceMuted),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              'Hoje é dia de torneio.',
              style: AppTypography.displayL.copyWith(color: colors.onSurface),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              'O Focus esconde o resto do app e deixa na tela só o que decide '
              'o seu dia: próxima partida, adversário, quadra e sua trajetória '
              'até o título.',
              style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
            ),
            const SizedBox(height: AppSpacing.lg),
            Container(
              padding: const EdgeInsets.all(AppSpacing.lg),
              decoration: BoxDecoration(
                color: colors.surfaceCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: colors.outline),
              ),
              child: Column(
                children: [
                  _Row(
                    icon: Icons.star_rounded,
                    title: 'Próxima partida',
                    subtitle: _matchLine(),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  const _Row(
                    icon: Icons.emoji_events_rounded,
                    title: 'Trajetória e cenários',
                    subtitle: 'O que cada resultado muda',
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  const _Row(
                    icon: Icons.notifications_rounded,
                    title: 'Alertas em tempo real',
                    subtitle: 'Atraso, troca de quadra e chamada',
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () {
                  Navigator.of(context).pop(true);
                  context.pushNamed(
                    AppRouteNames.tournamentFocus,
                    pathParameters: {'tournamentId': target.tournamentId},
                  );
                },
                icon: const Icon(Icons.local_fire_department_rounded, size: 18),
                label: const Text('Entrar no Focus'),
              ),
            ),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('Depois'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Row(
      children: [
        Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.brand.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, size: 20, color: AppColors.brand),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: AppTypography.bodyM.copyWith(
                  color: colors.onSurface,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                subtitle,
                style:
                    AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
