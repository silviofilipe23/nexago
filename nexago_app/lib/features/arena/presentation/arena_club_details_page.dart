import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../../arenas/domain/arena_club_session.dart';
import '../data/arena_club_service.dart';
import '../domain/arena_club.dart';
import '../domain/arena_club_admin_providers.dart';
import 'widgets/arena_async_state.dart';
import 'widgets/arena_dashboard_tokens.dart';

/// Detalhe do clubinho (gestor): próximas sessões e ações (sessão avulsa,
/// pausar/reativar, arquivar, editar).
class ArenaClubDetailsPage extends ConsumerStatefulWidget {
  const ArenaClubDetailsPage({super.key, required this.clubId});

  final String clubId;

  @override
  ConsumerState<ArenaClubDetailsPage> createState() =>
      _ArenaClubDetailsPageState();
}

class _ArenaClubDetailsPageState extends ConsumerState<ArenaClubDetailsPage> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final clubAsync = ref.watch(arenaClubProvider(widget.clubId));

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _DetailsHeader(
              eyebrow: clubAsync.valueOrNull?.arenaName.toUpperCase() ??
                  'GESTOR · CLUBINHO',
              title: clubAsync.valueOrNull?.name ?? 'Clubinho',
              onBack: () => context.pop(),
              onEdit: clubAsync.valueOrNull == null
                  ? null
                  : () => context.pushNamed(
                        AppRouteNames.arenaClubEdit,
                        pathParameters: {'clubId': widget.clubId},
                      ),
            ),
            Expanded(
              child: clubAsync.when(
                data: (club) {
                  if (club == null) {
                    return const ArenaEmptyState(
                      title: 'Clubinho não encontrado',
                      message: 'Este clubinho não existe mais.',
                      icon: Icons.groups_outlined,
                    );
                  }
                  return _buildBody(context, club);
                },
                loading: () =>
                    const ArenaLoadingState(label: 'Carregando...'),
                error: (e, _) => ArenaErrorState(message: '$e'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(BuildContext context, ArenaClub club) {
    final theme = Theme.of(context);
    final sessionsAsync = ref.watch(arenaClubSessionsProvider(club.id));

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        FadeSlideIn(child: _ClubHeroCard(club: club)),
        const SizedBox(height: 24),
        Text(
          'PRÓXIMAS SESSÕES',
          style: theme.textTheme.labelSmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 12),
        sessionsAsync.when(
          data: (sessions) {
            if (sessions.isEmpty) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  club.isActive
                      ? 'Nenhuma sessão futura. Crie uma sessão avulsa ou '
                          'aguarde a geração automática.'
                      : 'Nenhuma sessão futura.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              );
            }
            return Column(
              children: [
                for (final session in sessions)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _SessionTile(session: session),
                  ),
              ],
            );
          },
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          ),
          error: (e, _) => ArenaErrorState(message: '$e'),
        ),
        const SizedBox(height: 20),
        if (!club.isArchived) ...[
          OutlinedButton.icon(
            onPressed: _busy ? null : () => _createSingleSession(club),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.brand,
              side: BorderSide(
                color: AppColors.brand.withValues(alpha: 0.5),
              ),
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            icon: const Icon(Icons.event_rounded),
            label: const Text(
              'Criar sessão avulsa',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _busy
                ? null
                : () => _setStatus(
                      club,
                      club.isPaused ? 'active' : 'paused',
                    ),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.pending,
              side: BorderSide(
                color: AppColors.pending.withValues(alpha: 0.5),
              ),
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            icon: Icon(
              club.isPaused
                  ? Icons.play_arrow_rounded
                  : Icons.pause_rounded,
            ),
            label: Text(
              club.isPaused ? 'Reativar clubinho' : 'Pausar clubinho',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _busy ? null : () => _confirmArchive(club),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.live,
              side: BorderSide(color: AppColors.live.withValues(alpha: 0.5)),
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            icon: const Icon(Icons.archive_outlined),
            label: const Text(
              'Arquivar clubinho',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            club.isPaused
                ? 'Pausado: nenhuma sessão nova é gerada até reativar.'
                : 'Pausar interrompe a geração de novas sessões; arquivar '
                    'encerra o clubinho de vez.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              height: 1.4,
            ),
          ),
        ],
      ],
    );
  }

  Future<void> _createSingleSession(ArenaClub club) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked == null || !mounted) return;

    setState(() => _busy = true);
    try {
      final result = await ref.read(arenaClubServiceProvider).createSession(
            clubId: club.id,
            date: _dateKey(picked),
          );
      if (!mounted) return;
      if (result.skippedCourtIds.isNotEmpty) {
        showAppSnackBar(
          context,
          'Sessão criada, mas ${result.skippedCourtIds.length} quadra(s) '
          'ficaram de fora por conflito de agenda.',
        );
      } else {
        showAppSnackBar(
          context,
          'Sessão de ${DateFormat('dd/MM').format(picked)} criada.',
        );
      }
    } on ArenaClubAdminException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _setStatus(ArenaClub club, String status) async {
    setState(() => _busy = true);
    try {
      final result = await ref.read(arenaClubServiceProvider).setClubStatus(
            clubId: club.id,
            status: status,
          );
      if (!mounted) return;
      showAppSnackBar(
        context,
        status == 'active'
            ? result.createdDates.isNotEmpty
                ? 'Clubinho reativado com ${result.createdDates.length} '
                    'sessão(ões) gerada(s).'
                : 'Clubinho reativado.'
            : 'Clubinho pausado.',
      );
    } on ArenaClubAdminException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmArchive(ArenaClub club) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.themeColors.surfaceSheet,
        title: const Text('Arquivar clubinho?'),
        content: const Text(
          'O clubinho deixa de gerar sessões e some da lista de ativos. '
          'Sessões futuras com atletas inscritos precisam ser canceladas '
          'antes.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.live),
            child: const Text('Arquivar'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _setStatusArchived(club);
  }

  Future<void> _setStatusArchived(ArenaClub club) async {
    setState(() => _busy = true);
    try {
      await ref.read(arenaClubServiceProvider).setClubStatus(
            clubId: club.id,
            status: 'archived',
          );
      if (!mounted) return;
      showAppSnackBar(context, 'Clubinho arquivado.');
    } on ArenaClubAdminException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static String _dateKey(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}

class _DetailsHeader extends StatelessWidget {
  const _DetailsHeader({
    required this.eyebrow,
    required this.title,
    required this.onBack,
    this.onEdit,
  });

  final String eyebrow;
  final String title;
  final VoidCallback onBack;
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
      child: Row(
        children: [
          Material(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onBack,
              child: SizedBox(
                width: 44,
                height: 44,
                child: Icon(
                  Icons.arrow_back_rounded,
                  color: context.themeColors.onSurface,
                ),
              ),
            ),
          ),
          Expanded(
            child: Column(
              children: [
                Text(
                  eyebrow,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.mono(
                    color: AppColors.brand,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                      ),
                ),
              ],
            ),
          ),
          if (onEdit != null)
            Material(
              color: context.themeColors.surfaceRaised,
              borderRadius: BorderRadius.circular(12),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: onEdit,
                child: SizedBox(
                  width: 44,
                  height: 44,
                  child: Icon(
                    Icons.edit_outlined,
                    size: 20,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
            )
          else
            const SizedBox(width: 44),
        ],
      ),
    );
  }
}

class _ClubHeroCard extends StatelessWidget {
  const _ClubHeroCard({required this.club});

  final ArenaClub club;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusColor = club.isActive
        ? AppColors.win
        : club.isPaused
            ? AppColors.pending
            : context.themeColors.onSurfaceMuted;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    club.recurrenceLabel.toUpperCase(),
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                      color: statusColor.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Text(
                    club.statusLabel.toUpperCase(),
                    style: TextStyle(
                      color: statusColor,
                      fontWeight: FontWeight.w800,
                      fontSize: 10,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              '${formatBRL(club.priceReais)} por atleta',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w900,
                color: context.themeColors.onSurface,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              '${club.capacity} vagas por sessão · '
              '${club.courtNames.isNotEmpty ? club.courtNames.join(', ') : 'sem quadras'}',
              style: theme.textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                height: 1.35,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Saída com estorno até ${club.cancelWindowHours}h antes '
              'do início.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SessionTile extends StatelessWidget {
  const _SessionTile({required this.session});

  final ArenaClubSession session;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final date = session.dateOnly;
    final label = date != null
        ? DateFormat('EEE, dd/MM', 'pt_BR').format(date)
        : session.dateShortLabel;
    final canceled = session.isCanceled;
    final spots = session.isFull
        ? 'Lista cheia'
        : '${session.spotsLeft} vaga${session.spotsLeft == 1 ? '' : 's'}';

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => context.pushNamed(
          AppRouteNames.arenaClubSession,
          pathParameters: {'sessionId': session.id},
        ),
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
        child: Ink(
          decoration: ArenaDashboardTokens.cardDecoration(context),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 12,
            ),
            child: Row(
              children: [
                Icon(
                  canceled
                      ? Icons.event_busy_rounded
                      : Icons.event_rounded,
                  size: 18,
                  color: canceled
                      ? AppColors.live
                      : context.themeColors.onSurfaceMuted,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '$label · ${session.timeRangeLabel}',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: context.themeColors.onSurface,
                          decoration:
                              canceled ? TextDecoration.lineThrough : null,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        canceled
                            ? 'Cancelada'
                            : '${session.confirmedCount}/${session.capacity} '
                                'confirmados · $spots',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: canceled
                              ? AppColors.live
                              : context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
