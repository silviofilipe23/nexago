import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/arena_plan.dart';
import '../../../domain/arena_shell_providers.dart';

/// Copy do upsell por recurso bloqueado.
typedef _UpsellCopy = ({IconData icon, String title, String description});

/// Planos que destravam a capability — o selo tem de dizer a verdade, senão
/// manda assinar um plano que não libera o recurso. Espelha [capabilitiesFor].
String _badgeFor(ArenaCapability capability) => switch (capability) {
      ArenaCapability.multiUnidade => 'Plano Elite',
      _ => 'Planos Pro e Elite',
    };

_UpsellCopy _copyFor(ArenaCapability capability) => switch (capability) {
      ArenaCapability.pdvComandas => (
          icon: Icons.receipt_long_rounded,
          title: 'PDV e comandas',
          description:
              'Abra comandas, registre o consumo e receba pagamentos direto no '
              'balcão — tudo integrado ao estoque.',
        ),
      ArenaCapability.estoque => (
          icon: Icons.inventory_2_rounded,
          title: 'Controle de estoque',
          description:
              'Cadastre produtos, acompanhe o giro e receba alertas de estoque '
              'baixo, com baixa automática nas vendas.',
        ),
      ArenaCapability.promocoes => (
          icon: Icons.local_offer_rounded,
          title: 'Promoções de horário',
          description:
              'Crie descontos para encher os horários ociosos e atrair quem já '
              'joga na areia.',
        ),
      ArenaCapability.clubinho => (
          icon: Icons.groups_rounded,
          title: 'Clubinho',
          description:
              'Abra um jogo recorrente com lista pública: os atletas entram '
              'na lista e pagam por sessão via PIX antecipado.',
        ),
      ArenaCapability.metricasCompletas => (
          icon: Icons.insights_rounded,
          title: 'Métricas completas',
          description:
              'Insights de ocupação, receita e seguidores para decidir com '
              'dados.',
        ),
      ArenaCapability.receberTorneios => (
          icon: Icons.emoji_events_rounded,
          title: 'Receber torneios',
          description: 'Seja sede de etapas e torneios da comunidade.',
        ),
      ArenaCapability.multiUnidade => (
          icon: Icons.apartment_rounded,
          title: 'Múltiplas unidades',
          description: 'Gerencie várias quadras e unidades sem limite.',
        ),
    };

/// Tela de bloqueio (paywall) exibida quando a arena não tem o [capability]
/// liberado no plano. Convida a ver os planos. O bloqueio real de escrita vive
/// nas `firestore.rules`; este widget é a camada de UX.
class ArenaPlanUpsell extends StatelessWidget {
  const ArenaPlanUpsell({
    super.key,
    required this.capability,
    this.icon,
    this.title,
    this.description,
    this.badge,
  });

  final ArenaCapability capability;

  /// Sobrescrevem a copy padrão do [capability] (ex.: limite atingido).
  final IconData? icon;
  final String? title;
  final String? description;

  /// Selo do plano. Por padrão vem do [capability]; telas que fazem upsell de
  /// um degrau específico (ex.: Starter no teto de quadras → Pro) informam o
  /// plano real que resolve o caso.
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final copy = _copyFor(capability);
    final effectiveIcon = icon ?? copy.icon;
    final effectiveTitle = title ?? copy.title;
    final effectiveDescription = description ?? copy.description;
    final effectiveBadge = badge ?? _badgeFor(capability);

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: AppColors.brand.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Icon(effectiveIcon, color: AppColors.brand, size: 34),
            ),
            const SizedBox(height: 20),
            Text(
              effectiveTitle,
              textAlign: TextAlign.center,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.brand.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                effectiveBadge,
                style: AppTypography.mono(
                  color: AppColors.brand,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.4,
                  fontSize: 11,
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              effectiveDescription,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colors.onSurfaceMuted,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 28),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton(
                onPressed: () => context.pushNamed(AppRouteNames.arenaPlan),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: AppColors.black,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: const Text(
                  'Ver planos',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.2,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Faixa compacta de "modo somente leitura" para telas que preservam os dados
/// Pro após downgrade (comandas/produtos). Toca → planos.
class ArenaPlanReadOnlyBanner extends StatelessWidget {
  const ArenaPlanReadOnlyBanner({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: AppColors.pending.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.pushNamed(AppRouteNames.arenaPlan),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              const Icon(Icons.lock_outline_rounded,
                  color: AppColors.pending, size: 18),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  message,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: colors.onSurface,
                    fontWeight: FontWeight.w600,
                    height: 1.3,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'Ver planos',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: AppColors.brand,
                  fontWeight: FontWeight.w800,
                ),
              ),
              Icon(Icons.chevron_right_rounded,
                  color: AppColors.brand, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}

/// Abre o paywall como bottom sheet (para gates de ação, ex.: limite atingido).
Future<void> showArenaPlanUpsellSheet(
  BuildContext context, {
  required ArenaCapability capability,
  IconData? icon,
  String? title,
  String? description,
  String? badge,
}) {
  return showArenaShellModalBottomSheet<void>(
    context: context,
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 12,
        bottom: 20 + MediaQuery.viewInsetsOf(ctx).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: ctx.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 8),
          ArenaPlanUpsell(
            capability: capability,
            icon: icon,
            title: title,
            description: description,
            badge: badge,
          ),
        ],
      ),
    ),
  );
}
