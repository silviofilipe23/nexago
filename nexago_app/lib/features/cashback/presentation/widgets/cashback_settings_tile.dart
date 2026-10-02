import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../athlete/presentation/widgets/athlete_settings/athlete_settings_group.dart';
import '../../application/cashback_providers.dart';
import '../cashback_copy.dart';

/// Tile "Meu cashback" no grupo PREFERÊNCIAS dos ajustes — o "Pagamentos"
/// continua sendo o de métodos salvos. Some com o recurso desligado: a tela
/// segue alcançável pelo push e pelo link direto.
class CashbackSettingsTile extends ConsumerWidget {
  const CashbackSettingsTile({super.key, this.onTap});

  /// Injetável para teste; em produção abre Meu cashback.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(cashbackEnabledProvider)) return const SizedBox.shrink();
    final wallet = ref.watch(cashbackWalletProvider).valueOrNull;
    return AthleteSettingsTile(
      icon: Icons.savings_outlined,
      title: CashbackCopy.pageTitle,
      subtitle: wallet == null
          ? CashbackCopy.settingsFallbackSubtitle
          : CashbackCopy.availableToUse(wallet.availableCents),
      variant: AthleteSettingsIconVariant.green,
      onTap: onTap ?? () => context.pushNamed(AppRouteNames.athleteCashback),
      showDivider: true,
    );
  }
}
