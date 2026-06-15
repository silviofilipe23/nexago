import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../../data/organizer_leagues_repository.dart';
import '../../../domain/league_create/league_create_providers.dart';
import '../../league_stage_create/league_stage_create_navigation.dart';

Future<void> showOrganizerLeagueActionsSheet(
  BuildContext context, {
  required String leagueId,
  required Map<String, dynamic> league,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: context.themeColors.surfaceCard,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => _OrganizerLeagueActionsSheet(
      leagueId: leagueId,
      league: league,
    ),
  );
}

class _OrganizerLeagueActionsSheet extends ConsumerWidget {
  const _OrganizerLeagueActionsSheet({
    required this.leagueId,
    required this.league,
  });

  final String leagueId;
  final Map<String, dynamic> league;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.read(organizerLeaguesRepositoryProvider);
    final name = (league['name'] as String?) ?? 'Liga';
    final status = (league['listingStatus'] as String?) ?? 'draft';
    final isOpen = status == 'open';

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              name,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              _statusLabel(status),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
            ),
            const SizedBox(height: 16),
            _ActionTile(
              icon: Icons.emoji_events_outlined,
              label: 'Ver circuito',
              onTap: () {
                Navigator.pop(context);
                context.pushNamed(
                  AppRouteNames.leagueDetail,
                  pathParameters: {'leagueId': leagueId},
                );
              },
            ),
            if (isOpen) ...[
              _ActionTile(
                icon: Icons.add_circle_outline,
                label: 'Adicionar etapa',
                onTap: () {
                  Navigator.pop(context);
                  startLeagueStageWizard(context, ref, leagueId);
                },
              ),
              _ActionTile(
                icon: Icons.flag_outlined,
                label: 'Encerrar temporada',
                onTap: () => _confirmClose(context, repo),
              ),
              _ActionTile(
                icon: Icons.cancel_outlined,
                label: 'Cancelar liga',
                destructive: true,
                onTap: () => _confirmCancel(context, repo),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _statusLabel(String status) => switch (status) {
        'open' => 'Publicada',
        'closed' => 'Temporada encerrada',
        'cancelled' => 'Cancelada',
        'draft' => 'Rascunho',
        _ => status,
      };

  Future<void> _confirmClose(
    BuildContext context,
    OrganizerLeaguesRepository repo,
  ) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Encerrar temporada?'),
        content: const Text(
          'A liga sai do modo ativo. O ranking permanece visível, mas novas etapas não podem ser adicionadas.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Encerrar'),
          ),
        ],
      ),
    );
    if (confirm != true || !context.mounted) return;

    try {
      await repo.closeLeague(leagueId);
      if (context.mounted) {
        Navigator.pop(context);
        showAppSnackBar(context, 'Temporada encerrada.');
      }
    } catch (e) {
      if (context.mounted) {
        showAppSnackBar(context, '$e', isError: true);
      }
    }
  }

  Future<void> _confirmCancel(
    BuildContext context,
    OrganizerLeaguesRepository repo,
  ) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancelar liga?'),
        content: const Text(
          'A liga deixa de aparecer no catálogo público. Etapas já publicadas permanecem no histórico.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.live),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Cancelar liga'),
          ),
        ],
      ),
    );
    if (confirm != true || !context.mounted) return;

    try {
      await repo.cancelLeague(leagueId);
      if (context.mounted) {
        Navigator.pop(context);
        showAppSnackBar(context, 'Liga cancelada.');
      }
    } catch (e) {
      if (context.mounted) {
        showAppSnackBar(context, '$e', isError: true);
      }
    }
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.destructive = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final color = destructive ? AppColors.live : context.themeColors.onSurface;

    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: color),
      title: Text(
        label,
        style: TextStyle(
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
      onTap: onTap,
    );
  }
}
