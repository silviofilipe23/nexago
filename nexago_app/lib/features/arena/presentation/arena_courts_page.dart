import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../../arenas/domain/arena_court.dart';
import '../domain/arena_providers.dart';
import 'widgets/arena_async_state.dart';
import 'widgets/arena_court_form_sheet.dart';
import 'widgets/arena_dashboard_tokens.dart';

class ArenaCourtsPage extends ConsumerWidget {
  const ArenaCourtsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(arenaModuleConfigProvider);
    final managed = ref.watch(managedArenaIdProvider);
    final courtsAsync = ref.watch(arenaManagedCourtsProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
        child: FadeSlideIn(
          child: managed.when(
            data: (arenaId) {
              if (arenaId == null || arenaId.isEmpty) {
                return _NoArenaMessage(configTitle: config.title);
              }
              return courtsAsync.when(
                data: (courts) => _CourtsBody(
                  arenaId: arenaId,
                  courts: courts,
                ),
                loading: () => const ArenaLoadingState(
                  label: 'Carregando quadras...',
                ),
                error: (e, _) => ArenaErrorState(
                  message: 'Erro ao carregar quadras.\n$e',
                ),
              );
            },
            loading: () => const ArenaLoadingState(label: 'Carregando arena...'),
            error: (e, _) => ArenaErrorState(message: '$e'),
          ),
        ),
      ),
    );
  }
}

class _CourtsHeader extends StatelessWidget {
  const _CourtsHeader({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 20, 0),
      child: Row(
        children: [
          Material(
            color: AppColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onBack,
              child: const SizedBox(
                width: 44,
                height: 44,
                child: Icon(
                  Icons.arrow_back_rounded,
                  color: AppColors.onSurface,
                ),
              ),
            ),
          ),
          Expanded(
            child: Text(
              'Quadras',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppColors.onSurface,
                  ),
            ),
          ),
          const SizedBox(width: 44),
        ],
      ),
    );
  }
}

class _CourtsBody extends ConsumerWidget {
  const _CourtsBody({
    required this.arenaId,
    required this.courts,
  });

  final String arenaId;
  final List<ArenaCourt> courts;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final monthlyAsync = ref.watch(arenaCourtMonthlyBookingsProvider(arenaId));
    final monthly = monthlyAsync.valueOrNull ?? const <String, int>{};

    final maintenanceCount =
        courts.where((c) => c.isMaintenance).length;
    final activeCount = courts.length - maintenanceCount;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _CourtsHeader(onBack: () => context.pop()),
        Expanded(
          child: courts.isEmpty
              ? _EmptyCourts(
                  onAdd: () => _openCourtSheet(context, arenaId: arenaId),
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(
                    ArenaDashboardTokens.horizontalPadding,
                    16,
                    ArenaDashboardTokens.horizontalPadding,
                    28,
                  ),
                  children: [
                    _CourtsSummaryHeader(
                      total: courts.length,
                      active: activeCount,
                      maintenance: maintenanceCount,
                    ),
                    const SizedBox(height: 16),
                    for (var i = 0; i < courts.length; i++) ...[
                      if (i > 0) const SizedBox(height: 10),
                      staggeredFadeSlide(
                        index: i,
                        child: _CourtCard(
                          court: courts[i],
                          monthlyBookings: monthly[courts[i].id] ?? 0,
                          onEdit: () => _openCourtSheet(
                            context,
                            arenaId: arenaId,
                            existing: courts[i],
                          ),
                          onDelete: () => _confirmDelete(
                            context,
                            ref,
                            arenaId: arenaId,
                            court: courts[i],
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 14),
                    _AddCourtButton(
                      onTap: () => _openCourtSheet(context, arenaId: arenaId),
                    ),
                  ],
                ),
        ),
      ],
    );
  }
}

class _CourtsSummaryHeader extends StatelessWidget {
  const _CourtsSummaryHeader({
    required this.total,
    required this.active,
    required this.maintenance,
  });

  final int total;
  final int active;
  final int maintenance;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final quadraLabel = total == 1 ? 'quadra' : 'quadras';

    return RichText(
      text: TextSpan(
        style: theme.textTheme.bodyMedium?.copyWith(
          color: AppColors.onSurfaceMuted,
          fontWeight: FontWeight.w500,
        ),
        children: [
          TextSpan(
            text: '$total $quadraLabel',
            style: const TextStyle(
              color: AppColors.onSurface,
              fontWeight: FontWeight.w800,
            ),
          ),
          TextSpan(text: ' · $active ativa${active == 1 ? '' : 's'}'),
          if (maintenance > 0)
            TextSpan(
              text:
                  ' · $maintenance em manutenção',
            ),
        ],
      ),
    );
  }
}

class _CourtCard extends StatelessWidget {
  const _CourtCard({
    required this.court,
    required this.monthlyBookings,
    required this.onEdit,
    required this.onDelete,
  });

  final ArenaCourt court;
  final int monthlyBookings;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final typeLabel = court.type ?? '—';
    final subtitleParts = <String>[typeLabel];
    if (court.dimensionsLabel != null && court.dimensionsLabel!.isNotEmpty) {
      subtitleParts.add(court.dimensionsLabel!);
    }
    final subtitle = subtitleParts.join(' · ');
    final priceFmt = NumberFormat.currency(locale: 'pt_BR', symbol: r'R$');
    final priceLabel = court.basePricePerHourReais != null &&
            court.basePricePerHourReais! > 0
        ? '${priceFmt.format(court.basePricePerHourReais)} / h'
        : null;

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(
        color: AppColors.surfaceRaised,
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 12, 10, 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 10, right: 4),
              child: Icon(
                Icons.drag_handle_rounded,
                size: 20,
                color: AppColors.onSurfaceMuted.withValues(alpha: 0.55),
              ),
            ),
            _CourtIconBadge(),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          court.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: AppColors.onSurface,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      _CourtStatusBadge(isMaintenance: court.isMaintenance),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.onSurfaceMuted,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 6),
                  if (priceLabel != null)
                    Text(
                      priceLabel,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.brand,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  if (priceLabel != null) const SizedBox(height: 4),
                  RichText(
                    text: TextSpan(
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.onSurfaceMuted,
                        fontWeight: FontWeight.w500,
                      ),
                      children: [
                        TextSpan(
                          text: '$monthlyBookings',
                          style: const TextStyle(
                            color: AppColors.brand,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const TextSpan(text: ' reservas no mês'),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            _CourtActionButton(
              icon: Icons.edit_outlined,
              iconColor: AppColors.onSurface,
              onTap: onEdit,
            ),
            const SizedBox(width: 6),
            _CourtActionButton(
              icon: Icons.delete_outline_rounded,
              iconColor: AppColors.live,
              onTap: onDelete,
            ),
          ],
        ),
      ),
    );
  }
}

class _CourtIconBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0xFFFF8A4A),
            AppColors.brand,
            Color(0xFFE5560E),
          ],
        ),
      ),
      child: const Icon(
        Icons.grid_view_rounded,
        color: AppColors.white,
        size: 22,
      ),
    );
  }
}

class _CourtStatusBadge extends StatelessWidget {
  const _CourtStatusBadge({required this.isMaintenance});

  final bool isMaintenance;

  @override
  Widget build(BuildContext context) {
    final label = isMaintenance ? 'MANUTENÇÃO' : 'ATIVA';
    final color = isMaintenance ? AppColors.pending : AppColors.win;
    final bg = color.withValues(alpha: 0.14);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color.withValues(alpha: 0.95),
          fontWeight: FontWeight.w800,
          fontSize: 9,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

class _CourtActionButton extends StatelessWidget {
  const _CourtActionButton({
    required this.icon,
    required this.iconColor,
    required this.onTap,
  });

  final IconData icon;
  final Color iconColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surfaceSheet,
      borderRadius: BorderRadius.circular(10),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: AppColors.onSurfaceMuted.withValues(alpha: 0.25),
            ),
          ),
          child: Icon(icon, size: 20, color: iconColor),
        ),
      ),
    );
  }
}

class _AddCourtButton extends StatelessWidget {
  const _AddCourtButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sportsPreview = kCourtTypeOptions.take(3).join(', ');

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: CustomPaint(
          painter: _DashedBorderPainter(
            color: AppColors.brand.withValues(alpha: 0.45),
            radius: 14,
          ),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.brand.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.add_rounded,
                    color: AppColors.brand,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Adicionar nova quadra',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: AppColors.brand,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '$sportsPreview…',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.onSurfaceMuted,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  _DashedBorderPainter({
    required this.color,
    required this.radius,
  });

  final Color color;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final rrect = RRect.fromRectAndRadius(
      Offset.zero & size,
      Radius.circular(radius),
    );
    final path = Path()..addRRect(rrect);
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    const dashWidth = 6.0;
    const dashSpace = 5.0;
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        final next = distance + dashWidth;
        final extractPath = metric.extractPath(
          distance,
          next.clamp(0.0, metric.length),
        );
        canvas.drawPath(extractPath, paint);
        distance = next + dashSpace;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedBorderPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.radius != radius;
}

class _NoArenaMessage extends StatelessWidget {
  const _NoArenaMessage({required this.configTitle});

  final String configTitle;

  @override
  Widget build(BuildContext context) {
    return ArenaEmptyState(
      title: 'Arena não encontrada',
      message:
          'Nenhuma arena vinculada ao seu usuário como gestor de $configTitle.',
      icon: Icons.storefront_outlined,
    );
  }
}

class _EmptyCourts extends StatelessWidget {
  const _EmptyCourts({required this.onAdd});

  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const Spacer(),
          const ArenaEmptyState(
            title: 'Nenhuma quadra cadastrada',
            message: 'Adicione a primeira quadra para liberar horários na agenda.',
            icon: Icons.sports_tennis_outlined,
          ),
          const Spacer(),
          _AddCourtButton(onTap: onAdd),
        ],
      ),
    );
  }
}

Future<void> _openCourtSheet(
  BuildContext context, {
  required String arenaId,
  ArenaCourt? existing,
}) async {
  final ok = await ArenaCourtFormSheet.show(
    context,
    arenaId: arenaId,
    existing: existing,
  );
  if (!ok || !context.mounted) return;
  showAppSnackBar(
    context,
    existing != null ? 'Quadra atualizada.' : 'Quadra criada.',
  );
}

Future<void> _confirmDelete(
  BuildContext context,
  WidgetRef ref, {
  required String arenaId,
  required ArenaCourt court,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: AppColors.surfaceSheet,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: const Text('Remover quadra?'),
      content: Text(
        '“${court.name}” será removida. Horários já vinculados a esta quadra podem ficar inconsistentes.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(ctx, true),
          style: FilledButton.styleFrom(backgroundColor: AppColors.live),
          child: const Text('Remover'),
        ),
      ],
    ),
  );

  if (ok != true || !context.mounted) return;

  try {
    await ref.read(courtServiceProvider).deleteCourt(
          arenaId: arenaId,
          courtId: court.id,
        );
    if (!context.mounted) return;
    showAppSnackBar(context, 'Quadra removida.');
  } on CourtServiceException catch (e) {
    if (!context.mounted) return;
    showAppSnackBar(context, e.message, isError: true);
  } catch (e) {
    if (!context.mounted) return;
    showAppSnackBar(context, 'Não foi possível remover: $e', isError: true);
  }
}
