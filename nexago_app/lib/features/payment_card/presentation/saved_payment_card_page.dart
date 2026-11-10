import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../application/payment_card_providers.dart';
import '../domain/saved_payment_card.dart';

/// Cartão salvo do atleta: ver, trocar e remover. Remover desliga o
/// débito automático de todos os planos.
class SavedPaymentCardPage extends ConsumerStatefulWidget {
  const SavedPaymentCardPage({super.key});

  @override
  ConsumerState<SavedPaymentCardPage> createState() =>
      _SavedPaymentCardPageState();
}

class _SavedPaymentCardPageState extends ConsumerState<SavedPaymentCardPage> {
  bool _removing = false;

  Future<void> _addOrReplace() async {
    await context.push<SavedPaymentCard>(AppRoutes.paymentCardNew);
    if (mounted) ref.invalidate(myPaymentCardProvider);
  }

  Future<void> _remove() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remover o cartão?'),
        content: const Text(
          'O débito automático de todos os seus planos será desligado.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            key: const Key('payment-card-remove-confirm'),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Remover'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _removing = true);
    try {
      await ref.read(paymentCardRepositoryProvider).remove();
      ref.invalidate(myPaymentCardProvider);
      if (mounted) showAppSnackBar(context, 'Cartão removido.');
    } catch (e) {
      if (mounted) {
        showAppSnackBar(
          context,
          friendlyErrorMessage(
            e,
            action: 'Não foi possível remover o cartão',
            logReason: 'payment_card_remove',
          ),
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _removing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final card = ref.watch(myPaymentCardProvider);
    final colors = context.themeColors;
    return ProfessorLinksScaffold(
      title: 'Cartão salvo',
      subtitle: 'DÉBITO AUTOMÁTICO DOS PLANOS',
      onBack: () => popOrGo(context, AppRoutes.athleteBilling),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          card.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (e, _) => Column(
              children: [
                Text(
                  friendlyErrorMessage(
                    e,
                    action: 'Não foi possível carregar o cartão',
                    logReason: 'payment_card_load',
                  ),
                  style: TextStyle(color: AppColors.live),
                ),
                TextButton(
                  onPressed: () => ref.invalidate(myPaymentCardProvider),
                  child: const Text('Tentar de novo'),
                ),
              ],
            ),
            data: (saved) =>
                saved == null ? _empty(colors) : _saved(saved, colors),
          ),
        ],
      ),
    );
  }

  Widget _empty(AppThemeColors colors) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ProfessorLinksCard(
            child: Text(
              'Nenhum cartão salvo.',
              style: TextStyle(color: colors.onSurface),
            ),
          ),
          const SizedBox(height: 14),
          FilledButton(
            key: const Key('payment-card-add'),
            onPressed: _addOrReplace,
            child: const Text('Adicionar cartão'),
          ),
        ],
      );

  Widget _saved(SavedPaymentCard saved, AppThemeColors colors) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ProfessorLinksCard(
            child: Row(
              children: [
                Icon(Icons.credit_card_rounded, color: AppColors.brand),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    '${saved.label} · validade ${saved.expiryLabel}',
                    key: const Key('payment-card-label'),
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          OutlinedButton(
            key: const Key('payment-card-replace'),
            onPressed: _removing ? null : _addOrReplace,
            child: const Text('Trocar cartão'),
          ),
          const SizedBox(height: 8),
          TextButton(
            key: const Key('payment-card-remove'),
            onPressed: _removing ? null : _remove,
            child: Text('Remover', style: TextStyle(color: AppColors.live)),
          ),
        ],
      );
}
