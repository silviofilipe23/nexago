import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/errors/friendly_error_message.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../domain/arena_access_providers.dart';
import '../domain/arena_business_providers.dart';
import '../domain/arena_month_goal.dart';
import '../domain/arena_schedule_providers.dart';
import 'widgets/arena_dashboard_tokens.dart';

/// Ajustes › Meta do mês: o dono define quanto quer faturar por mês.
///
/// A meta vale para todo mês até ser trocada. Fica num doc privado
/// (`arenas/{id}/goals/monthlyRevenue`): só quem lê o financeiro a vê.
class ArenaMonthGoalPage extends ConsumerStatefulWidget {
  const ArenaMonthGoalPage({super.key});

  @override
  ConsumerState<ArenaMonthGoalPage> createState() => _ArenaMonthGoalPageState();
}

class _ArenaMonthGoalPageState extends ConsumerState<ArenaMonthGoalPage> {
  final _controller = TextEditingController();
  bool _seeded = false;
  bool _busy = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final isOwner =
        ref.watch(arenaAccessProvider).valueOrNull?.isOwner ?? false;
    final goalAsync = ref.watch(arenaMonthlyRevenueGoalProvider);
    final current = goalAsync.valueOrNull;
    final progress = ref.watch(arenaMonthGoalProgressProvider).valueOrNull;

    if (!_seeded && goalAsync.hasValue) {
      _seeded = true;
      if (current != null) _controller.text = current.toStringAsFixed(0);
    }
    final parsed = parseArenaGoalInput(_controller.text);

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(title: const Text('Meta do mês')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(ArenaDashboardTokens.horizontalPadding),
          children: [
            Text(
              'Quanto a arena quer faturar por mês?',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'O Painel mostra quanto já foi feito, o que já está reservado '
              'e onde o mês fecha no ritmo atual. A meta vale para todos os '
              'meses até você trocar. Só quem vê o financeiro enxerga.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colors.onSurfaceMuted,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 20),
            TextField(
              key: const ValueKey('arena-goal-input'),
              controller: _controller,
              enabled: isOwner && !_busy,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              onChanged: (_) => setState(() {}),
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
              decoration: InputDecoration(
                labelText: 'Meta de faturamento',
                prefixText: 'R\$ ',
                helperText: parsed != null
                    ? '${formatBRLWhole(parsed)} por mês'
                    : 'Valor em reais, sem centavos',
                errorText: _controller.text.isNotEmpty && parsed == null
                    ? 'Informe um valor entre R\$ 1 e R\$ 10 milhões'
                    : null,
              ),
            ),
            if (progress != null) ...[
              const SizedBox(height: 16),
              _Reference(
                label: 'Este mês até agora',
                value: formatBRLWhole(progress.realizedReais),
              ),
              _Reference(
                label: 'No ritmo atual, o mês fecha em',
                value: formatBRLWhole(progress.projectionReais),
              ),
            ],
            const SizedBox(height: 24),
            if (!isOwner)
              Text(
                'Só o dono da arena pode definir a meta.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: colors.onSurfaceMuted,
                ),
              )
            else ...[
              FilledButton(
                onPressed: parsed == null || _busy || parsed == current
                    ? null
                    : () => _save(parsed),
                child: Text(current == null ? 'Definir meta' : 'Salvar meta'),
              ),
              if (current != null) ...[
                const SizedBox(height: 8),
                TextButton(
                  onPressed: _busy ? null : _clear,
                  style: TextButton.styleFrom(foregroundColor: colors.live),
                  child: const Text('Remover meta'),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _save(double amount) async {
    final arenaId = ref.read(managedArenaIdProvider).valueOrNull ?? '';
    final uid = ref.read(authProvider).valueOrNull?.uid ?? '';
    if (arenaId.isEmpty || uid.isEmpty) return;
    await _run(
      () => ref
          .read(arenaGoalsRepositoryProvider)
          .saveMonthlyRevenue(arenaId: arenaId, uid: uid, amountReais: amount),
      done: 'Meta salva.',
      action: 'Não foi possível salvar a meta',
    );
  }

  Future<void> _clear() async {
    final arenaId = ref.read(managedArenaIdProvider).valueOrNull ?? '';
    if (arenaId.isEmpty) return;
    await _run(
      () => ref.read(arenaGoalsRepositoryProvider).clearMonthlyRevenue(arenaId),
      done: 'Meta removida.',
      action: 'Não foi possível remover a meta',
    );
    if (mounted) setState(_controller.clear);
  }

  Future<void> _run(
    Future<void> Function() op, {
    required String done,
    required String action,
  }) async {
    setState(() => _busy = true);
    try {
      await op();
      if (!mounted) return;
      showAppSnackBar(context, done);
      Navigator.of(context).maybePop();
    } on Exception catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        friendlyErrorMessage(e, action: action, logReason: 'arena_meta'),
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _Reference extends StatelessWidget {
  const _Reference({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colors.onSurfaceMuted,
              ),
            ),
          ),
          Text(
            value,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: colors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}
