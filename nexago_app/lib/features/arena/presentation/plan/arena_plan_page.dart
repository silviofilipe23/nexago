import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/layout/nexa_floating_header.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
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
import 'arena_subscription_pending_page.dart';

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
              status: status,
              isCurrent: _isCurrentPlan(status, plan),
              submitting: _submitting,
              onSubscribe: () => _onSubscribe(arenaId, plan),
            ),
            const SizedBox(height: 14),
          ],
          const SizedBox(height: 8),
          Text(
            'Valores ilustrativos — a tabela oficial de planos será confirmada em breve.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colors.onSurfaceMuted,
                ),
          ),
          if (status.tier != null && status.entitled) ...[
            const SizedBox(height: 16),
            Center(
              child: TextButton(
                onPressed: _submitting ? null : () => _onCancel(arenaId),
                child: Text(
                  'Cancelar assinatura',
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ),
            ),
          ],
        ]),
      ),
    );
  }

  Future<void> _onSubscribe(String arenaId, ArenaPlan plan) async {
    final repo = ref.read(arenaSubscriptionRepositoryProvider);
    final storedCnpj = await repo.fetchStoredCpfCnpj(arenaId);
    if (!mounted) return;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => _SubscribeSheet(
        plan: plan,
        initialCnpj: storedCnpj,
        onSubmit: (choice) => _completeSubscription(
          sheetContext: sheetContext,
          arenaId: arenaId,
          plan: plan,
          choice: choice,
          repo: repo,
        ),
      ),
    );
  }

  Future<void> _completeSubscription({
    required BuildContext sheetContext,
    required String arenaId,
    required ArenaPlan plan,
    required _SubscribeChoice choice,
    required ArenaSubscriptionRepository repo,
  }) async {
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

      Navigator.of(sheetContext).pop();

      final pendingArgs = ArenaSubscriptionPendingArgs(
        arenaId: arenaId,
        plan: plan,
        cycle: _cycle,
        result: result.isPix ? result : null,
      );

      if (result.isPix) {
        await context.pushNamed(
          AppRouteNames.arenaSubscriptionPending,
          extra: pendingArgs,
        );
      } else if (result.invoiceUrl != null) {
        await repo.openCheckout(result.invoiceUrl!);
        if (mounted) {
          await context.pushNamed(
            AppRouteNames.arenaSubscriptionPending,
            extra: pendingArgs,
          );
        }
      } else {
        if (mounted) {
          showAppSnackBar(context, 'Não foi possível iniciar o pagamento.');
        }
      }
    } on ArenaSubscriptionException catch (e) {
      if (mounted) showAppSnackBar(context, e.message);
      rethrow;
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

bool _isCurrentPlan(ArenaPlanStatus status, ArenaPlan plan) {
  return status.entitled && status.tier == plan.tier;
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
  const _SubscribeSheet({
    required this.plan,
    required this.initialCnpj,
    required this.onSubmit,
  });

  final ArenaPlan plan;
  final String initialCnpj;
  final Future<void> Function(_SubscribeChoice choice) onSubmit;

  @override
  State<_SubscribeSheet> createState() => _SubscribeSheetState();
}

class _SubscribeSheetState extends State<_SubscribeSheet> {
  late final TextEditingController _controller;
  bool _submitting = false;
  ArenaSubscriptionMethod? _submittingMethod;

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

  Future<void> _submit(ArenaSubscriptionMethod method) async {
    setState(() {
      _submitting = true;
      _submittingMethod = method;
    });
    try {
      await widget.onSubmit(
        _SubscribeChoice(
          cpfCnpj: CpfCnpjValidator.normalize(_controller.text),
          method: method,
        ),
      );
    } catch (_) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _submittingMethod = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final raw = _controller.text;
    final valid = CpfCnpjValidator.isValid(raw);
    final error = CpfCnpjValidator.validationMessage(raw);
    final canSubmit = valid && !_submitting;

    return PopScope(
      canPop: !_submitting,
      child: Padding(
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
              style: theme.textTheme.bodySmall?.copyWith(
                color: colors.onSurfaceMuted,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _controller,
              onChanged: (_) => setState(() {}),
              enabled: !_submitting,
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
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.info_outline_rounded,
                  size: 16,
                  color: colors.onSurfaceMuted,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Primeira assinatura tem ativação única de '
                    '${formatBRL(arenaActivationFeeCents / 100)} somada à '
                    '1ª cobrança.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: colors.onSurfaceMuted,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
            if (_submitting) ...[
              const SizedBox(height: 20),
              Row(
                children: [
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: colors.brand,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _submittingMethod == ArenaSubscriptionMethod.pix
                          ? 'Gerando cobrança PIX…'
                          : 'Preparando checkout do cartão…',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: canSubmit
                        ? () => _submit(ArenaSubscriptionMethod.pix)
                        : null,
                    icon: _submittingMethod == ArenaSubscriptionMethod.pix
                        ? null
                        : const Icon(Icons.qr_code_rounded),
                    label: Text(
                      _submittingMethod == ArenaSubscriptionMethod.pix
                          ? 'Gerando…'
                          : 'PIX',
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: colors.onSurface,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: canSubmit
                        ? () => _submit(ArenaSubscriptionMethod.creditCard)
                        : null,
                    icon: _submittingMethod == ArenaSubscriptionMethod.creditCard
                        ? null
                        : const Icon(Icons.credit_card_rounded),
                    label: Text(
                      _submittingMethod == ArenaSubscriptionMethod.creditCard
                          ? 'Gerando…'
                          : 'Cartão',
                    ),
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
              style: theme.textTheme.bodySmall?.copyWith(
                color: colors.onSurfaceMuted,
              ),
            ),
          ],
        ),
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
    final (
      String title,
      String subtitle,
      Color accent,
      bool showActiveBadge,
      IconData icon,
    ) = switch (status.status) {
      'active' => (
          'Plano ${plan?.name ?? ''} ativo',
          status.activeUntil != null
              ? 'Renova em ${_fmtDate(status.activeUntil!)}'
              : 'Assinatura ativa',
          colors.brand,
          true,
          Icons.star_rounded,
        ),
      'overdue' => (
          'Pagamento em atraso',
          'Regularize para manter os benefícios do plano.',
          colors.pending,
          false,
          Icons.warning_amber_rounded,
        ),
      'canceling' => (
          'Plano ${plan?.name ?? ''} cancelado',
          status.activeUntil != null
              ? 'Benefícios até ${_fmtDate(status.activeUntil!)}'
              : 'Reative quando quiser.',
          colors.pending,
          false,
          Icons.info_outline_rounded,
        ),
      _ => (
          'Sem plano',
          'Assine um plano para reduzir a taxa por reserva e liberar mais '
              'recursos.',
          colors.onSurfaceMuted,
          false,
          Icons.star_outline_rounded,
        ),
    };

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: accent.withValues(alpha: 0.45)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: accent, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        title,
                        style: AppTypography.soraRegular(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: colors.onSurface,
                        ),
                      ),
                    ),
                    if (showActiveBadge) ...[
                      const SizedBox(width: 8),
                      _PlanPillBadge(
                        label: 'ATIVO',
                        background: AppColors.win.withValues(alpha: 0.18),
                        foreground: AppColors.win,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: colors.onSurfaceMuted,
                    height: 1.35,
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

class _PlanPillBadge extends StatelessWidget {
  const _PlanPillBadge({
    required this.label,
    required this.background,
    required this.foreground,
  });

  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: AppTypography.soraRegular(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: foreground,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
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
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        children: [
          Expanded(
            child: _CycleOption(
              label: 'Mensal',
              active: cycle == ArenaBillingCycle.monthly,
              colors: colors,
              onTap: () => onChanged(ArenaBillingCycle.monthly),
            ),
          ),
          Expanded(
            child: _CycleOption(
              label: 'Anual',
              active: cycle == ArenaBillingCycle.yearly,
              colors: colors,
              onTap: () => onChanged(ArenaBillingCycle.yearly),
              trailing: _PlanPillBadge(
                label: '2 MESES GRÁTIS',
                background: AppColors.win.withValues(alpha: 0.16),
                foreground: AppColors.win,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CycleOption extends StatelessWidget {
  const _CycleOption({
    required this.label,
    required this.active,
    required this.colors,
    required this.onTap,
    this.trailing,
  });

  final String label;
  final bool active;
  final AppThemeColors colors;
  final VoidCallback onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          color: active ? colors.brand : Colors.transparent,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              label,
              style: AppTypography.soraRegular(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: active ? colors.black : colors.onSurface,
              ),
            ),
            if (trailing != null) ...[
              const SizedBox(width: 6),
              trailing!,
            ],
          ],
        ),
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.plan,
    required this.cycle,
    required this.colors,
    required this.status,
    required this.isCurrent,
    required this.submitting,
    required this.onSubscribe,
  });

  final ArenaPlan plan;
  final ArenaBillingCycle cycle;
  final AppThemeColors colors;
  final ArenaPlanStatus status;
  final bool isCurrent;
  final bool submitting;
  final VoidCallback onSubscribe;

  @override
  Widget build(BuildContext context) {
    final priceLabel = formatBRL(plan.priceCents(cycle) / 100);
    final cycleLabel = cycle == ArenaBillingCycle.yearly ? '/ano' : '/mês';
    final installmentLabel = cycle == ArenaBillingCycle.yearly
        ? '12× de ${formatBRL(plan.yearlyCents / 12 / 100)} · 1 mês grátis'
        : null;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: plan.popular
              ? colors.brand.withValues(alpha: 0.55)
              : colors.onSurfaceMuted.withValues(alpha: 0.14),
          width: plan.popular ? 1.4 : 1,
        ),
        boxShadow: plan.popular
            ? [
                BoxShadow(
                  color: colors.brand.withValues(alpha: 0.12),
                  blurRadius: 28,
                  offset: const Offset(0, 10),
                ),
              ]
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                plan.name,
                style: AppTypography.soraRegular(
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  color: colors.onSurface,
                  letterSpacing: -0.3,
                ),
              ),
              if (plan.popular) ...[
                const SizedBox(width: 8),
                _PlanPillBadge(
                  label: 'POPULAR',
                  background: colors.brand,
                  foreground: colors.black,
                ),
              ],
            ],
          ),
          const SizedBox(height: 6),
          Text(
            plan.tagline,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: colors.onSurfaceMuted,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                priceLabel,
                style: AppTypography.soraRegular(
                  fontSize: 30,
                  fontWeight: FontWeight.w900,
                  color: colors.onSurface,
                  letterSpacing: -0.8,
                ),
              ),
              const SizedBox(width: 4),
              Text(
                cycleLabel,
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.onSurfaceMuted,
                ),
              ),
            ],
          ),
          if (installmentLabel != null) ...[
            const SizedBox(height: 4),
            Text(
              installmentLabel,
              style: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: colors.onSurfaceMuted,
              ),
            ),
          ],
          const SizedBox(height: 18),
          for (final feature in plan.features)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 22,
                    height: 22,
                    decoration: BoxDecoration(
                      color: colors.surfaceRaised,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.check_rounded,
                      size: 14,
                      color: colors.brand,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      feature,
                      style: AppTypography.soraRegular(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: colors.onSurface,
                        height: 1.35,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: _buildAction(context),
          ),
        ],
      ),
    );
  }

  String get _actionLabel => isCurrent ? 'Plano atual' : 'Assinar';

  Widget _buildAction(BuildContext context) {
    final disabled = submitting || isCurrent;

    return FilledButton(
      onPressed: disabled ? null : onSubscribe,
      style: FilledButton.styleFrom(
        backgroundColor: plan.popular ? colors.brand : colors.surfaceRaised,
        foregroundColor: plan.popular ? colors.black : colors.onSurface,
        disabledBackgroundColor: colors.surfaceRaised,
        disabledForegroundColor: colors.onSurfaceMuted,
        padding: const EdgeInsets.symmetric(vertical: 15),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
        ),
      ),
      child: Text(
        _actionLabel,
        style: const TextStyle(fontWeight: FontWeight.w800),
      ),
    );
  }
}
