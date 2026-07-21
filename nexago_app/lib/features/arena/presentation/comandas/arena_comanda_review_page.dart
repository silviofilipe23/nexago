import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/arena_bookings_grouping.dart';
import '../../domain/arena_schedule_providers.dart';
import '../../domain/comandas/arena_comanda_created_args.dart';
import '../../domain/comandas/arena_comanda_logic.dart';
import '../../domain/comandas/arena_comanda_providers.dart';
import '../widgets/arena_dashboard_tokens.dart';
import 'widgets/arena_comanda_stepper.dart';
import 'widgets/arena_comanda_wizard_scaffold.dart';

class ArenaComandaReviewPage extends ConsumerStatefulWidget {
  const ArenaComandaReviewPage({super.key});

  @override
  ConsumerState<ArenaComandaReviewPage> createState() =>
      _ArenaComandaReviewPageState();
}

class _ArenaComandaReviewPageState
    extends ConsumerState<ArenaComandaReviewPage> {
  bool _saving = false;

  Future<void> _openComanda() async {
    final arenaId = ref.read(managedArenaIdProvider).valueOrNull;
    if (arenaId == null || arenaId.isEmpty) {
      showAppSnackBar(context, 'Arena não encontrada.', isError: true);
      return;
    }

    final draft = ref.read(arenaComandaDraftProvider);
    if (!isValidComandaDraftForCreate(draft)) {
      showAppSnackBar(context, 'Preencha os dados da comanda.', isError: true);
      return;
    }

    setState(() => _saving = true);
    try {
      final comanda = await ref
          .read(arenaComandasRepositoryProvider)
          .createComanda(arenaId: arenaId, draft: draft);
      if (!mounted) return;
      ref.read(arenaComandaDraftProvider.notifier).reset();
      context.pushReplacementNamed(
        AppRouteNames.arenaComandaOpened,
        extra: ArenaComandaCreatedArgs(comanda: comanda),
      );
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, 'Erro ao abrir comanda: $e', isError: true);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(arenaComandaDraftProvider);
    final booking = draft.linkedBooking;
    final rentalCents = booking != null ? rentalCentsFromBooking(booking) : 0;
    final location = comandaReviewLocationLabel(draft);

    return ArenaComandaWizardScaffold(
      stepLabel: 'NOVA COMANDA · PASSO 3 DE 3',
      title: 'Revisar e abrir',
      currentStep: 2,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ArenaComandaStepper(currentStep: 2),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: ArenaDashboardTokens.cardDecoration(context),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AppColors.brand.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        Icons.person_outline_rounded,
                        color: AppColors.brand,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            draft.linkWithoutBooking
                                ? '${draft.customerName} · individual'
                                : '$location · ${comandaTypeLabel(draft.type).toLowerCase()}',
                            style: Theme.of(context).textTheme.titleMedium
                                ?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  color: context.themeColors.onSurface,
                                ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            comandaReviewSubtitle(draft, 0).replaceAll(
                              formatComandaNumber(0),
                              'nova comanda',
                            ),
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(
                                  color: context.themeColors.onSurfaceMuted,
                                ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                _ReviewRow(label: 'Tipo', value: comandaTypeLabel(draft.type)),
                _ReviewDivider(),
                _ReviewRow(label: 'Local', value: location),
                if (booking != null) ...[
                  _ReviewDivider(),
                  _ReviewRow(
                    label: 'Reserva',
                    value: ArenaBookingsGrouping.displayCode(booking.id),
                    valueColor: AppColors.win,
                  ),
                ],
                _ReviewDivider(),
                _ReviewRow(label: 'Cliente', value: draft.customerName),
                if (draft.customerWhatsapp.trim().isNotEmpty) ...[
                  _ReviewDivider(),
                  _ReviewRow(
                    label: 'WhatsApp',
                    value: draft.customerWhatsapp.trim(),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(
              'Pedidos pelo app',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
            ),
            subtitle: Text(
              booking != null
                  ? 'Atletas lançam consumo direto no celular'
                  : 'Só disponível para comanda vinculada a uma reserva',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
            ),
            value: draft.allowAppOrders && booking != null,
            activeTrackColor: AppColors.brand,
            onChanged: booking == null
                ? null
                : ref
                    .read(arenaComandaDraftProvider.notifier)
                    .setAllowAppOrders,
          ),
        ],
      ),
      footer: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (rentalCents > 0)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Abre já com a locação',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Text(
                    formatComandaReais(rentalCents),
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton.icon(
                onPressed: _saving ? null : _openComanda,
                icon: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: AppColors.black,
                        ),
                      )
                    : const Icon(Icons.receipt_long_rounded, size: 20),
                label: const Text(
                  'Abrir comanda',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                ),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: AppColors.black,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReviewRow extends StatelessWidget {
  const _ReviewRow({required this.label, required this.value, this.valueColor});

  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: valueColor ?? context.themeColors.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReviewDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Divider(
      height: 1,
      color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
    );
  }
}
