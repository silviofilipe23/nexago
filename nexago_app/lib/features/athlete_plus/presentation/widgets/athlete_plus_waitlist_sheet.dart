import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/friendly_error_message.dart';
import '../../../../core/observability/analytics_log.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../application/athlete_plus_providers.dart';
import '../../domain/athlete_plus_waitlist.dart';

/// Folha do nexaGO+: o que vem no plano, sem números prometidos (benefícios e
/// preço estão em definição — ver a spec), e a entrada na lista de espera.
/// As duas perguntas são opcionais; o botão vale sem nenhuma resposta.
///
/// Teto de 90% + rolagem: com fonte ampliada a folha passa da altura útil, e
/// `showModalBottomSheet` sem `isScrollControlled` trava em 9/16 da tela.
Future<void> showAthletePlusWaitlistSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.9,
    ),
    builder: (_) => const AthletePlusWaitlistSheet(),
  );
}

class AthletePlusWaitlistSheet extends ConsumerStatefulWidget {
  const AthletePlusWaitlistSheet({super.key});

  @override
  ConsumerState<AthletePlusWaitlistSheet> createState() =>
      _AthletePlusWaitlistSheetState();
}

class _AthletePlusWaitlistSheetState
    extends ConsumerState<AthletePlusWaitlistSheet> {
  final _interests = <AthletePlusInterest>{};
  AthletePlusPriceBand? _priceBand;
  bool _saving = false;

  Future<void> _join() async {
    setState(() => _saving = true);
    try {
      await ref.read(athletePlusRepositoryProvider).join(
            uid: ref.read(athletePlusUidProvider),
            interests: _interests,
            priceBand: _priceBand,
          );
      logAnalytics(
        ref,
        (a) => a.logAthletePlusWaitlistJoined(
          interests: [
            for (final i in AthletePlusInterest.values)
              if (_interests.contains(i)) i.key,
          ].join(','),
          priceBand: _priceBand?.key,
        ),
      );
      if (!mounted) return;
      // O messenger é o da raiz: o aviso fica na Início depois que a folha fecha.
      showAppSnackBar(
        context,
        'Pronto! Você está na lista do nexaGO+ e fica sabendo primeiro.',
      );
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showAppSnackBar(
        context,
        friendlyErrorMessage(
          e,
          action: 'Não foi possível entrar na lista',
          logReason: 'athlete_plus_join',
        ),
        isError: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final sectionTitle = AppTypography.labelL.copyWith(color: colors.onSurface);

    return SafeArea(
      top: false,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Flexible(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenH,
                AppSpacing.xl,
                AppSpacing.screenH,
                AppSpacing.lg,
              ),
              children: [
                Text(
                  'nexaGO+ vem aí',
                  style: AppTypography.titleL.copyWith(color: colors.onSurface),
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  'Um plano para quem joga sempre. Nada de vantagem em '
                  'pontos, nível ou chave: o ranking continua igual para '
                  'todo mundo.',
                  style: AppTypography.bodyM.copyWith(
                    color: colors.onSurfaceMuted,
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),
                Text('O que mais te interessa? (opcional)',
                    style: sectionTitle),
                const SizedBox(height: AppSpacing.sm),
                for (final interest in AthletePlusInterest.values)
                  _InterestTile(
                    interest: interest,
                    selected: _interests.contains(interest),
                    onChanged: _saving
                        ? null
                        : (on) => setState(
                              () => on
                                  ? _interests.add(interest)
                                  : _interests.remove(interest),
                            ),
                  ),
                const SizedBox(height: AppSpacing.lg),
                Text(
                  'Quanto faz sentido pagar por mês? (opcional)',
                  style: sectionTitle,
                ),
                const SizedBox(height: AppSpacing.sm),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    for (final band in AthletePlusPriceBand.values)
                      ChoiceChip(
                        key: Key('athlete-plus-price-${band.key}'),
                        label: Text(band.label),
                        selected: _priceBand == band,
                        onSelected: _saving
                            ? null
                            : (on) =>
                                setState(() => _priceBand = on ? band : null),
                      ),
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),
                Text(
                  'Benefícios e preço ainda estão em definição. Quem entra '
                  'na lista fica sabendo primeiro, sem compromisso.',
                  style: AppTypography.bodyS.copyWith(
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              0,
              AppSpacing.screenH,
              AppSpacing.lg,
            ),
            child: FilledButton(
              key: const Key('athlete-plus-join'),
              onPressed: _saving ? null : _join,
              child: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Quero ser avisado'),
            ),
          ),
        ],
      ),
    );
  }
}

class _InterestTile extends StatelessWidget {
  const _InterestTile({
    required this.interest,
    required this.selected,
    required this.onChanged,
  });

  final AthletePlusInterest interest;
  final bool selected;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Material(
        color: colors.surfaceCard,
        borderRadius: AppRadii.mdAll,
        clipBehavior: Clip.antiAlias,
        child: CheckboxListTile(
          key: Key('athlete-plus-interest-${interest.key}'),
          value: selected,
          onChanged: onChanged == null ? null : (v) => onChanged!(v ?? false),
          controlAffinity: ListTileControlAffinity.trailing,
          title: Text(
            interest.label,
            style: AppTypography.titleS.copyWith(color: colors.onSurface),
          ),
          subtitle: Text(
            interest.description,
            style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
          ),
        ),
      ),
    );
  }
}
