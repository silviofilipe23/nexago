import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arenas/domain/arena_promotion.dart';
import '../../../arenas/domain/arena_promotion_display.dart';
import '../../../arenas/domain/slots_providers.dart';
import '../../domain/arena_shell_providers.dart';
import 'arena_dashboard_tokens.dart';
import 'arena_promotion_form_sheet.dart';

/// Bottom sheet para listar, pausar/ativar e criar promoções da arena.
class ArenaPromotionsSheet extends ConsumerStatefulWidget {
  const ArenaPromotionsSheet({super.key, required this.arenaId});

  final String arenaId;

  static Future<void> show(
    BuildContext context, {
    required String arenaId,
  }) {
    return showArenaShellModalBottomSheet<void>(
      context: context,
      builder: (ctx) => ArenaPromotionsSheet(arenaId: arenaId),
    );
  }

  @override
  ConsumerState<ArenaPromotionsSheet> createState() =>
      _ArenaPromotionsSheetState();
}

class _ArenaPromotionsSheetState extends ConsumerState<ArenaPromotionsSheet> {
  final Set<String> _busyIds = {};

  Future<void> _toggleActive(ArenaPromotion promotion, bool active) async {
    if (_busyIds.contains(promotion.id)) return;

    setState(() => _busyIds.add(promotion.id));
    try {
      await ref.read(promotionsRepositoryProvider).setPromotionActive(
            arenaId: widget.arenaId,
            promotionId: promotion.id,
            active: active,
          );
      if (!mounted) return;
      showAppSnackBar(
        context,
        active ? 'Promoção ativada na agenda.' : 'Promoção pausada.',
      );
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível atualizar a promoção: $e',
        isError: true,
      );
    } finally {
      if (mounted) {
        setState(() => _busyIds.remove(promotion.id));
      }
    }
  }

  Future<void> _editPromotion(ArenaPromotion promotion) async {
    if (_busyIds.contains(promotion.id)) return;

    final ok = await ArenaPromotionFormSheet.show(
      context,
      arenaId: widget.arenaId,
      existing: promotion,
    );
    if (ok && mounted) {
      showAppSnackBar(context, 'Promoção atualizada.');
    }
  }

  Future<void> _confirmDelete(ArenaPromotion promotion) async {
    if (_busyIds.contains(promotion.id)) return;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.themeColors.surfaceSheet,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Excluir promoção?'),
        content: Text(
          '“${promotion.label}” será removida e o desconto deixa de valer na agenda.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.live),
            child: const Text('Excluir'),
          ),
        ],
      ),
    );

    if (ok != true || !mounted) return;

    setState(() => _busyIds.add(promotion.id));
    try {
      await ref.read(promotionsRepositoryProvider).deletePromotion(
            arenaId: widget.arenaId,
            promotionId: promotion.id,
          );
      if (!mounted) return;
      showAppSnackBar(context, 'Promoção excluída.');
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível excluir a promoção: $e',
        isError: true,
      );
    } finally {
      if (mounted) {
        setState(() => _busyIds.remove(promotion.id));
      }
    }
  }

  Future<void> _createPromotion() async {
    final ok = await ArenaPromotionFormSheet.show(
      context,
      arenaId: widget.arenaId,
    );
    if (ok && mounted) {
      showAppSnackBar(context, 'Promoção ativada na agenda.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final promotionsAsync =
        ref.watch(arenaAllPromotionsProvider(widget.arenaId));

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 12,
        bottom: 20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.82,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.35,
                ),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Promoções da arena',
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Pause, edite ou exclua descontos em horários ociosos.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 16),
          Flexible(
            child: promotionsAsync.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Text(
                  'Não foi possível carregar promoções: $e',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.error,
                  ),
                ),
              ),
              data: (promotions) {
                if (promotions.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Text(
                      'Nenhuma promoção ainda. Crie a primeira para encher horários ociosos.',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                  );
                }

                return ListView.separated(
                  itemCount: promotions.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final promotion = promotions[index];
                    return _PromotionTile(
                      promotion: promotion,
                      busy: _busyIds.contains(promotion.id),
                      onToggle: (active) => _toggleActive(promotion, active),
                      onEdit: () => _editPromotion(promotion),
                      onDelete: () => _confirmDelete(promotion),
                    );
                  },
                );
              },
            ),
          ),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _createPromotion,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
            icon: const Icon(Icons.add_rounded, color: AppColors.black),
            label: const Text(
              'Nova promoção',
              style: TextStyle(
                fontWeight: FontWeight.w800,
                color: AppColors.black,
              ),
            ),
          ),
        ],
        ),
      ),
    );
  }
}

class _PromotionTile extends StatelessWidget {
  const _PromotionTile({
    required this.promotion,
    required this.busy,
    required this.onToggle,
    required this.onEdit,
    required this.onDelete,
  });

  final ArenaPromotion promotion;
  final bool busy;
  final ValueChanged<bool> onToggle;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusLabel = arenaPromotionStatusLabel(promotion);
    final statusColor = promotion.active ? AppColors.win : AppColors.pending;

    return Material(
      color: context.themeColors.surfaceRaised,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
        side: BorderSide(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          promotion.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: context.themeColors.onSurface,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: statusColor.withValues(alpha: 0.16),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          statusLabel,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: statusColor,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    arenaPromotionSummaryLabel(promotion),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      TextButton.icon(
                        onPressed: busy ? null : onEdit,
                        style: TextButton.styleFrom(
                          foregroundColor: AppColors.brand,
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        icon: const Icon(Icons.edit_outlined, size: 16),
                        label: const Text(
                          'Editar',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                      TextButton.icon(
                        onPressed: busy ? null : onDelete,
                        style: TextButton.styleFrom(
                          foregroundColor: AppColors.live,
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        icon: const Icon(Icons.delete_outline_rounded, size: 16),
                        label: const Text(
                          'Excluir',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Switch(
              value: promotion.active,
              onChanged: busy ? null : onToggle,
              activeTrackColor: AppColors.brand.withValues(alpha: 0.35),
              activeThumbColor: AppColors.brand,
            ),
          ],
        ),
      ),
    );
  }
}
