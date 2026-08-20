import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/registration_shell_logic.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_registration_logic.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'registration_shell_card.dart';

/// Cartão 1 — **Categoria**. Mostra a escolhida com seus metadados e abre o
/// seletor das demais no "Trocar", igual ao `rg-card` da categoria no portal.
///
/// A lista completa de categorias empilhada (como era no passo do wizard) não
/// cabe numa tela que também precisa mostrar uniforme, inscrição e resumo — o
/// portal resolve com "a atual + trocar", e é o que este cartão faz.
class RegistrationShellCategoryCard extends StatelessWidget {
  const RegistrationShellCategoryCard({
    super.key,
    required this.selected,
    required this.selectedStatus,
    required this.others,
    required this.pickerOpen,
    required this.onTogglePicker,
    required this.onSelect,
    required this.hasRegistration,
  });

  final TournamentCategoryOffer? selected;
  final RegistrationCategoryStatus? selectedStatus;

  /// Demais categorias, já com o status calculado.
  final List<({TournamentCategoryOffer offer, RegistrationCategoryStatus status})>
  others;

  final bool pickerOpen;
  final VoidCallback onTogglePicker;
  final ValueChanged<TournamentCategoryOffer> onSelect;

  /// Com inscrição na categoria escolhida o aviso de bloqueio some — a vaga já
  /// é do atleta (mesma condição do `@if` no template da web).
  final bool hasRegistration;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final category = selected;

    return RegistrationShellCard(
      step: 1,
      title: 'Categoria',
      child: category == null
          ? const RegistrationShellNote(
              'Nenhuma categoria disponível para inscrição.',
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            category.name,
                            style: AppTypography.soraRegular(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: colors.onSurface,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: [
                              RegistrationShellPill(
                                label: category.genderFree
                                    ? 'Livre'
                                    : categoryGenderDisplayLabel(category)
                                          .toUpperCase(),
                                tone: RegistrationPillTone.brand,
                              ),
                              RegistrationShellPill(
                                label: category.formatLabel.toUpperCase(),
                              ),
                              if (category.genderDetail != null &&
                                  category.genderDetail != 'Livre')
                                RegistrationShellPill(
                                  label: category.genderDetail!.toUpperCase(),
                                ),
                              if (category.level.trim().isNotEmpty)
                                RegistrationShellPill(
                                  label: category.level.toUpperCase(),
                                ),
                              if (selectedStatus?.badge != null)
                                RegistrationShellPill(
                                  label: selectedStatus!.badge!,
                                  tone: RegistrationPillTone.warn,
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: AppSpacing.md),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          formatRegistrationMoney(category.entryFee),
                          style: AppTypography.soraRegular(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: colors.onSurface,
                          ),
                        ),
                        if (others.isNotEmpty)
                          TextButton(
                            onPressed: onTogglePicker,
                            style: TextButton.styleFrom(
                              padding: EdgeInsets.zero,
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                            child: Text(
                              pickerOpen ? 'Fechar' : 'Trocar',
                              style: AppTypography.mono(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: AppColors.brand,
                                letterSpacing: 0.4,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
                if (!hasRegistration &&
                    selectedStatus?.blocked == true &&
                    selectedStatus?.message != null) ...[
                  const SizedBox(height: AppSpacing.md),
                  RegistrationShellNote(
                    selectedStatus!.message!,
                    tone: AppColors.pending,
                  ),
                ],
                if (pickerOpen && others.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.lg),
                  for (final option in others) ...[
                    _CategoryOption(
                      offer: option.offer,
                      status: option.status,
                      onTap: () => onSelect(option.offer),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                  ],
                ],
              ],
            ),
    );
  }
}

class _CategoryOption extends StatelessWidget {
  const _CategoryOption({
    required this.offer,
    required this.status,
    required this.onTap,
  });

  final TournamentCategoryOffer offer;
  final RegistrationCategoryStatus status;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    // Categoria bloqueada continua selecionável de propósito: escolher para ver
    // o motivo é melhor que uma linha morta sem explicação — o CTA é quem trava.
    return Material(
      color: colors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.md,
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      offer.name,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: colors.onSurface,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (status.badge != null) ...[
                      const SizedBox(height: 5),
                      RegistrationShellPill(
                        label: status.badge!,
                        tone: RegistrationPillTone.warn,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                formatRegistrationMoney(offer.entryFee),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: colors.onSurfaceMuted,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
