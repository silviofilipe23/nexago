import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:share_plus/share_plus.dart';

import '../../../data/organizer_tournament_ops_repository.dart';
import '../../../domain/tournament_ops/tournament_ops_logic.dart';
import '../../../domain/tournament_ops/tournament_ops_providers.dart';

Future<void> showOrganizerTournamentActionsSheet(
  BuildContext context, {
  required String tournamentId,
  required Map<String, dynamic> tournament,
  OrganizerTournamentSummary? summary,
  List<OrganizerTournamentCategorySummary> categories = const [],
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.surfaceCard,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => _OrganizerTournamentActionsSheet(
      tournamentId: tournamentId,
      tournament: tournament,
      summary: summary,
      categories: categories,
    ),
  );
}

class _OrganizerTournamentActionsSheet extends ConsumerWidget {
  const _OrganizerTournamentActionsSheet({
    required this.tournamentId,
    required this.tournament,
    this.summary,
    this.categories = const [],
  });

  final String tournamentId;
  final Map<String, dynamic> tournament;
  final OrganizerTournamentSummary? summary;
  final List<OrganizerTournamentCategorySummary> categories;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.read(organizerTournamentOpsRepositoryProvider);
    final name = summary?.name ?? (tournament['name'] as String?) ?? 'Torneio';
    final locationLine = summary == null
        ? ''
        : tournamentMetaLine(
            locationName: summary!.locationName,
            city: summary!.city,
            state: summary!.state,
            dateLabel: summary!.dateLabel,
          );
    final totalSpots = categories.fold<int>(0, (sum, c) => sum + c.maxTeams);
    final categorySubtitle = categories.isEmpty
        ? '${summary?.categoryCount ?? 0} categorias'
        : '${categories.length} categorias · $totalSpots vagas no total';

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.85,
        ),
        child: SingleChildScrollView(
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
              name.toUpperCase(),
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.brand,
                letterSpacing: 0.8,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Gerenciar torneio',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 8),
            _ActionTile(
              icon: Icons.edit_rounded,
              label: 'Editar identidade',
              subtitle: 'Nome, capa, modalidade',
              accent: true,
              onTap: () {
                Navigator.pop(context);
                context.pushNamed(AppRouteNames.organizerTournamentCreateIdentity);
              },
            ),
            _ActionTile(
              icon: Icons.place_outlined,
              label: 'Local & datas',
              subtitle: locationLine.isEmpty ? 'Arena e período do torneio' : locationLine,
              onTap: () {
                Navigator.pop(context);
                context.pushNamed(AppRouteNames.organizerTournamentCreateLocation);
              },
            ),
            _ActionTile(
              icon: Icons.category_outlined,
              label: 'Categorias & vagas',
              subtitle: categorySubtitle,
              onTap: () {
                Navigator.pop(context);
                context.pushNamed(AppRouteNames.organizerTournamentCreateCategories);
              },
            ),
            _ActionTile(
              icon: Icons.share_rounded,
              label: 'Compartilhar torneio',
              subtitle: 'Link de inscrição + card pro story',
              onTap: () {
                Navigator.pop(context);
                Share.shareUri(
                  Uri.parse(
                    organizerTournamentRegistrationShareLink(tournamentId),
                  ),
                );
              },
            ),
            _ActionTile(
              icon: Icons.schedule_rounded,
              label: 'Encerrar inscrições',
              subtitle: 'Fecha as vagas e libera a chave',
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
                    showAppSnackBar(
                      context,
                      _opsError(e, 'encerrar as inscrições'),
                      isError: true,
                    );
                  }
                }
              },
            ),
            _ActionTile(
              icon: Icons.delete_outline_rounded,
              label: 'Cancelar torneio',
              subtitle: 'Marca o torneio como cancelado',
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
                await _cancelWithRefundGuard(context, repo, tournamentId);
              },
            ),
          ],
        ),
      ),
      ),
    );
  }
}

/// Traduz exceções de gerenciamento de torneio em mensagem PT amigável.
String _opsError(Object error, String action) {
  if (error is FirebaseException) {
    return friendlyTournamentOpsError(
      action: action,
      code: error.code,
      message: error.message,
    );
  }
  return friendlyTournamentOpsError(action: action);
}

/// Se o servidor bloqueou o cancelamento por haver inscrições pagas, devolve
/// quantas pagaram; caso contrário, `null`.
int? _paidRegistrationsBlocked(Object error) {
  if (error is! FirebaseFunctionsException) return null;
  final details = error.details;
  if (details is Map && details['reason'] == 'has_paid_registrations') {
    final raw = details['paidCount'];
    if (raw is int) return raw;
    if (raw is num) return raw.toInt();
    return 0;
  }
  return null;
}

/// Cancela o torneio; se houver pagamentos, exige confirmação do reembolso
/// manual antes de reenviar com `force`.
Future<void> _cancelWithRefundGuard(
  BuildContext context,
  OrganizerTournamentOpsRepository repo,
  String tournamentId, {
  bool force = false,
}) async {
  try {
    await repo.cancelTournament(tournamentId, force: force);
    if (context.mounted) {
      Navigator.pop(context);
      context.pop();
      showAppSnackBar(context, 'Torneio cancelado.');
    }
  } catch (e) {
    final paidCount = _paidRegistrationsBlocked(e);
    if (paidCount != null && context.mounted) {
      final go = await _confirmForceCancel(context, paidCount);
      if (go == true && context.mounted) {
        await _cancelWithRefundGuard(context, repo, tournamentId, force: true);
      }
      return;
    }
    if (context.mounted) {
      showAppSnackBar(context, _opsError(e, 'cancelar o torneio'), isError: true);
    }
  }
}

Future<bool?> _confirmForceCancel(BuildContext context, int paidCount) {
  final duplas = paidCount == 1 ? '1 dupla já pagou' : '$paidCount duplas já pagaram';
  return showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Reembolso manual necessário'),
      content: Text(
        '$duplas a inscrição. Não há estorno automático: você precisará '
        'reembolsá-las manualmente. Confirma o cancelamento mesmo assim?',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Voltar'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: Colors.red),
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Cancelar e reembolsar'),
        ),
      ],
    ),
  );
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.onTap,
    this.accent = false,
    this.destructive = false,
  });

  final IconData icon;
  final String label;
  final String subtitle;
  final VoidCallback onTap;
  final bool accent;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final titleColor = destructive
        ? Colors.red
        : accent
            ? AppColors.brand
            : context.themeColors.onSurface;
    final iconBg = destructive
        ? Colors.red.withValues(alpha: 0.12)
        : accent
            ? AppColors.brand.withValues(alpha: 0.15)
            : context.themeColors.surfaceRaised;
    final iconColor = destructive
        ? Colors.red
        : accent
            ? AppColors.brand
            : context.themeColors.onSurfaceMuted;

    return Column(
      children: [
        InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: iconBg,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, size: 20, color: iconColor),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: titleColor,
                            ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: context.themeColors.onSurfaceMuted,
                              height: 1.3,
                            ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        Divider(
          height: 1,
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ],
    );
  }
}
