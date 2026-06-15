import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:share_plus/share_plus.dart';

import '../../../domain/tournament_ops/tournament_ops_logic.dart';
import '../../../domain/tournament_ops/tournament_ops_providers.dart';

Future<void> showOrganizerTournamentActionsSheet(
  BuildContext context, {
  required String tournamentId,
  required Map<String, dynamic> tournament,
  OrganizerTournamentSummary? summary,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: context.themeColors.surfaceCard,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => _OrganizerTournamentActionsSheet(
      tournamentId: tournamentId,
      tournament: tournament,
      summary: summary,
    ),
  );
}

class _OrganizerTournamentActionsSheet extends ConsumerWidget {
  const _OrganizerTournamentActionsSheet({
    required this.tournamentId,
    required this.tournament,
    this.summary,
  });

  final String tournamentId;
  final Map<String, dynamic> tournament;
  final OrganizerTournamentSummary? summary;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.read(organizerTournamentOpsRepositoryProvider);
    final name = summary?.name ?? (tournament['name'] as String?) ?? 'Torneio';

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
              'Ações do torneio',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 12),
            _ActionTile(
              icon: Icons.edit_rounded,
              label: 'Editar identidade',
              onTap: () {
                Navigator.pop(context);
                context.pushNamed(AppRouteNames.organizerTournamentCreateIdentity);
              },
            ),
            _ActionTile(
              icon: Icons.place_outlined,
              label: 'Local e datas',
              onTap: () {
                Navigator.pop(context);
                context.pushNamed(AppRouteNames.organizerTournamentCreateLocation);
              },
            ),
            _ActionTile(
              icon: Icons.category_outlined,
              label: 'Categorias e vagas',
              onTap: () {
                Navigator.pop(context);
                context.pushNamed(AppRouteNames.organizerTournamentCreateCategories);
              },
            ),
            _ActionTile(
              icon: Icons.share_rounded,
              label: 'Compartilhar torneio',
              onTap: () {
                Navigator.pop(context);
                Share.share(
                  '$name — ${organizerTournamentShareLink(tournamentId)}',
                );
              },
            ),
            _ActionTile(
              icon: Icons.lock_outline_rounded,
              label: 'Encerrar inscrições',
              onTap: () async {
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('Encerrar inscrições?'),
                    content: const Text(
                      'Novas inscrições serão bloqueadas em todas as categorias.',
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, false),
                        child: const Text('Cancelar'),
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
                  await repo.closeTournamentRegistrations(tournamentId);
                  if (context.mounted) {
                    Navigator.pop(context);
                    showAppSnackBar(context, 'Inscrições encerradas.');
                  }
                } catch (e) {
                  if (context.mounted) {
                    showAppSnackBar(context, '$e', isError: true);
                  }
                }
              },
            ),
            _ActionTile(
              icon: Icons.cancel_outlined,
              label: 'Cancelar torneio',
              destructive: true,
              onTap: () async {
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('Cancelar torneio?'),
                    content: const Text(
                      'Esta ação marca o torneio como cancelado. Reembolsos automáticos não estão disponíveis nesta versão.',
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, false),
                        child: const Text('Voltar'),
                      ),
                      FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: Colors.red,
                        ),
                        onPressed: () => Navigator.pop(ctx, true),
                        child: const Text('Cancelar torneio'),
                      ),
                    ],
                  ),
                );
                if (confirm != true || !context.mounted) return;
                try {
                  await repo.cancelTournament(tournamentId);
                  if (context.mounted) {
                    Navigator.pop(context);
                    context.pop();
                    showAppSnackBar(context, 'Torneio cancelado.');
                  }
                } catch (e) {
                  if (context.mounted) {
                    showAppSnackBar(context, '$e', isError: true);
                  }
                }
              },
            ),
          ],
        ),
      ),
    );
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
    final color = destructive ? Colors.red : context.themeColors.onSurface;
    return ListTile(
      leading: Icon(icon, color: color),
      title: Text(label, style: TextStyle(color: color)),
      onTap: onTap,
    );
  }
}
