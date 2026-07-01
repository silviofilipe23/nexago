import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/layout/nexa_floating_header.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../../core/validation/cpf_cnpj.dart';
import '../../domain/arena_plan.dart';
import '../../domain/arena_plan_providers.dart';
import '../../domain/arena_schedule_providers.dart';
import '../../data/arena_subscription_repository.dart';
import '../widgets/arena_dashboard_tokens.dart';
import 'arena_subscription_pix_page.dart';

/// Escolha e assinatura do plano da arena (gestor). Cobrança recorrente via
/// Asaas: PIX (QR in-app) ou cartão (checkout hospedado).
class ArenaPlanPage extends ConsumerStatefulWidget {
  const ArenaPlanPage({super.key});

  @override
  ConsumerState<ArenaPlanPage> createState() => _ArenaPlanPageState();
}

class _ArenaPlanPageState extends ConsumerState<ArenaPlanPage> {
  ArenaBillingCycle _cycle = ArenaBillingCycle.monthly;
  bool _submitting = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final arenaId = ref.watch(managedArenaIdProvider).valueOrNull;
    final loading = arenaId == null || arenaId.isEmpty;

    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        top: false,
        bottom: false,
        child: CustomScrollView(
          physics: ArenaDashboardTokens.shellScrollPhysics,
          slivers: [
            NexaFloatingHeaderSliver(
              topGap: 8,
              padding: const EdgeInsets.fromLTRB(16, 0, 20, 12),
              child: _PlanPageToolbar(onBack: () => context.pop()),
            ),
            if (loading)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: Center(child: CircularProgressIndicator()),
              )
            else
              _buildContentSlivers(context, colors, arenaId),
          ],
        ),
      ),
    );
  }

  Widget _buildContentSlivers(
    BuildContext context,
    AppThemeColors colors,
    String arenaId,
  ) {
    final statusAsync = ref.watch(arenaPlanStatusProvider(arenaId));
    final status = statusAsync.valueOrNull ?? ArenaPlanStatus.none;
    final bottomPad = MediaQuery.paddingOf(context).bottom + 40;

    return SliverPadding(
      padding: EdgeInsets.fromLTRB(
        ArenaDashboardTokens.horizontalPadding,
        8,
        ArenaDashboardTokens.horizontalPadding,
        bottomPad,
      ),
      sliver: SliverList(
        delegate: SliverChildListDelegate([
          _StatusBanner(status: status, colors: colors),
          const SizedBox(height: 20),
          _CycleToggle(
            cycle: _cycle,
            onChanged: (c) => setState(() => _cycle = c),
            colors: colors,
          ),
          const SizedBox(height: 20),
          for (final plan in arenaPlansCatalog) ...[
            _PlanCard(
              plan: plan,
              cycle: _cycle,
              colors: colors,
              isCurrent: status.isActive && status.tier == plan.tier,
              submitting: _submitting,
              onSubscribe: plan.free ? null : () => _onSubscribe(arenaId, plan),
            ),
            const SizedBox(height: 14),
          ],
          if (status.isActive || status.isOverdue) ...[
            const SizedBox(height: 4),
            Center(
              child: TextButton(
                onPressed: _submitting ? null : () => _onCancel(arenaId),
                child: Text(
                  'Cancelar assinatura',
                  style: TextStyle(color: colors.onSurfaceMuted),
                ),
              ),
            ),
          ],
          const SizedBox(height: 8),
          Text(
            'Valores ilustrativos — a tabela oficial de planos será confirmada em breve.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colors.onSurfaceMuted,
                ),
          ),
        ]),
      ),
    );
  }

  Future<void> _onSubscribe(String arenaId, ArenaPlan plan) async {
    final repo = ref.read(arenaSubscriptionRepositoryProvider);
    final storedCnpj = await repo.fetchStoredCpfCnpj(arenaId);
    if (!mounted) return;

    final choice = await showModalBottomSheet<_SubscribeChoice>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _SubscribeSheet(plan: plan, initialCnpj: storedCnpj),
    );
    if (choice == null) return;

    setState(() => _submitting = true);
    try {
      final result = await repo.createSubscription(
        arenaId: arenaId,
        tier: plan.tier,
        cycle: _cycle,
        method: choice.method,
        cpfCnpj: choice.cpfCnpj,
      );
      if (!mounted) return;

      if (result.isPix) {
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ArenaSubscriptionPixPage(
              arenaId: arenaId,
              result: result,
              plan: plan,
              cycle: _cycle,
            ),
          ),
        );
      } else if (result.invoiceUrl != null) {
        await repo.openCheckout(result.invoiceUrl!);
        if (mounted) {
          showAppSnackBar(
            context,
            'Conclua o pagamento no navegador. O plano é ativado automaticamente.',
          );
        }
      } else {
        if (mounted) showAppSnackBar(context, 'Não foi possível iniciar o pagamento.');
      }
    } on ArenaSubscriptionException catch (e) {
      if (mounted) showAppSnackBar(context, e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _onCancel(String arenaId) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancelar assinatura?'),
        content: const Text(
          'A arena perde os benefícios do plano ao fim do período pago.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Voltar')),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Cancelar plano')),
        ],
      ),
    );
    if (confirm != true) return;

    setState(() => _submitting = true);
    try {
      await ref.read(arenaSubscriptionRepositoryProvider).cancelSubscription(arenaId);
      if (mounted) showAppSnackBar(context, 'Assinatura cancelada.');
    } on ArenaSubscriptionException catch (e) {
      if (mounted) showAppSnackBar(context, e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

}

class _PlanPageToolbar extends StatelessWidget {
  const _PlanPageToolbar({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Row(
      children: [
        Material(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            onTap: onBack,
            borderRadius: BorderRadius.circular(12),
            child: const SizedBox(
              width: 44,
              height: 44,
              child: Icon(Icons.arrow_back_rounded, size: 22),
            ),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Text(
            'Plano da arena',
            style: AppTypography.soraRegular(
              fontSize: 20,
              fontWeight: FontWeight.w900,
              color: colors.onSurface,
              letterSpacing: -0.3,
            ),
          ),
        ),
      ],
    );
  }
}

class _SubscribeChoice {
  const _SubscribeChoice({required this.cpfCnpj, required this.method});
  final String cpfCnpj;
  final ArenaSubscriptionMethod method;
}

/// Coleta o CNPJ (novo padrão alfanumérico) e o método de pagamento.
class _SubscribeSheet extends StatefulWidget {
  const _SubscribeSheet({required this.plan, required this.initialCnpj});

  final ArenaPlan plan;
  final String initialCnpj;

  @override
  State<_SubscribeSheet> createState() => _SubscribeSheetState();
}

class _SubscribeSheetState extends State<_SubscribeSheet> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(
      text: CpfCnpjValidator.formatDisplay(widget.initialCnpj),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final raw = _controller.text;
    final valid = CpfCnpjValidator.isValid(raw);
    final error = CpfCnpjValidator.validationMessage(raw);

    void finish(ArenaSubscriptionMethod method) {
      Navigator.of(context).pop(
        _SubscribeChoice(
          cpfCnpj: CpfCnpjValidator.normalize(_controller.text),
          method: method,
        ),
      );
    }

    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        16,
        20,
        16 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Assinar plano ${widget.plan.name}',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Confirme o CNPJ da arena para emitir a cobrança.',
            style: theme.textTheme.bodySmall?.copyWith(color: colors.onSurfaceMuted),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            onChanged: (_) => setState(() {}),
            keyboardType: TextInputType.text,
            textCapitalization: TextCapitalization.characters,
            inputFormatters: [CpfCnpjInputFormatter()],
            decoration: InputDecoration(
              labelText: 'CNPJ',
              hintText: '00.000.000/0000-00',
              errorText: error,
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: valid
                      ? () => finish(ArenaSubscriptionMethod.pix)
                      : null,
                  icon: const Icon(Icons.qr_code_rounded),
                  label: const Text('PIX'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: colors.onSurface,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton.icon(
                  onPressed: valid
                      ? () => finish(ArenaSubscriptionMethod.creditCard)
                      : null,
                  icon: const Icon(Icons.credit_card_rounded),
                  label: const Text('Cartão'),
                  style: FilledButton.styleFrom(
                    backgroundColor: colors.brand,
                    foregroundColor: colors.black,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'PIX gera o QR na hora; cartão abre o checkout seguro do Asaas.',
            style: theme.textTheme.bodySmall?.copyWith(color: colors.onSurfaceMuted),
          ),
        ],
      ),
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.status, required this.colors});

  final ArenaPlanStatus status;
  final AppThemeColors colors;

  @override
  Widget build(BuildContext context) {
    final plan = arenaPlanByTier(status.tier);
    final (String title, String subtitle, Color accent) = switch (status.status) {
      'active' => (
          'Plano ${plan?.name ?? ''} ativo',
          status.activeUntil != null
              ? 'Renova em ${_fmtDate(status.activeUntil!)}'
              : 'Assinatura ativa',
          colors.win,
        ),
      'overdue' => (
          'Pagamento em atraso',
          'Regularize para manter os benefícios do plano.',
          colors.pending,
        ),
      _ => (
          'Plano Essencial',
          'Você está no plano gratuito. Assine para liberar mais.',
          colors.onSurfaceMuted,
        ),
    };

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: accent.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Icon(Icons.workspace_premium_rounded, color: accent),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _fmtDate(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
}

class _CycleToggle extends StatelessWidget {
  const _CycleToggle({
    required this.cycle,
    required this.onChanged,
    required this.colors,
  });

  final ArenaBillingCycle cycle;
  final ValueChanged<ArenaBillingCycle> onChanged;
  final AppThemeColors colors;

  @override
  Widget build(BuildContext context) {
    Widget option(ArenaBillingCycle value, String label, {String? badge}) {
      final active = cycle == value;
      return Expanded(
        child: GestureDetector(
          onTap: () => onChanged(value),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: active ? colors.brand : Colors.transparent,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: active ? colors.black : colors.onSurfaceMuted,
                  ),
                ),
                if (badge != null) ...[
                  const SizedBox(width: 6),
                  Text(
                    badge,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: active ? colors.black : colors.brand,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        children: [
          option(ArenaBillingCycle.monthly, 'Mensal'),
          option(ArenaBillingCycle.yearly, 'Anual', badge: '2 meses grátis'),
        ],
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.plan,
    required this.cycle,
    required this.colors,
    required this.isCurrent,
    required this.submitting,
    required this.onSubscribe,
  });

  final ArenaPlan plan;
  final ArenaBillingCycle cycle;
  final AppThemeColors colors;
  final bool isCurrent;
  final bool submitting;
  final VoidCallback? onSubscribe;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final priceLabel = plan.free ? 'Grátis' : formatBRL(plan.priceCents(cycle) / 100);
    final cycleLabel = cycle == ArenaBillingCycle.yearly ? '/ano' : '/mês';

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: plan.popular ? colors.brand.withValues(alpha: 0.6) : colors.outline,
          width: plan.popular ? 1.4 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                plan.name,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(width: 8),
              if (plan.popular)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: colors.brand,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    'Popular',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: colors.black,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            plan.tagline,
            style: theme.textTheme.bodySmall?.copyWith(color: colors.onSurfaceMuted),
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                priceLabel,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: colors.onSurface,
                ),
              ),
              if (!plan.free) ...[
                const SizedBox(width: 4),
                Text(cycleLabel, style: theme.textTheme.bodySmall?.copyWith(color: colors.onSurfaceMuted)),
              ],
            ],
          ),
          const SizedBox(height: 14),
          for (final f in plan.features)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.check_rounded, size: 18, color: colors.brand),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      f,
                      style: theme.textTheme.bodyMedium?.copyWith(color: colors.onSurface),
                    ),
                  ),
                ],
              ),
            ),
          if (!plan.free) ...[
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: (submitting || isCurrent) ? null : onSubscribe,
                style: FilledButton.styleFrom(
                  backgroundColor: plan.popular ? colors.brand : colors.surfaceRaised,
                  foregroundColor: plan.popular ? colors.black : colors.onSurface,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: Text(
                  isCurrent ? 'Plano atual' : 'Assinar',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
