import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/category_gender_eligibility.dart';
import '../../../domain/category_level_eligibility.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_registration_logic.dart';

class TournamentRegistrationCategoryCard extends StatelessWidget {
  const TournamentRegistrationCategoryCard({
    super.key,
    required this.offer,
    required this.format,
    this.inscriptionCount,
    this.selected = false,
    this.showChangeAction = false,
    this.alreadyRegistered = false,
    this.registrationIncomplete = false,
    this.levelBlocked = false,
    this.belowMinLevel = false,
    this.ageBlocked = false,
    this.ageBlockLabel = '',
    this.genderBlocked = false,
    this.onTap,
    this.onChange,
  });

  final TournamentCategoryOffer offer;
  final TournamentFormat format;
  final int? inscriptionCount;
  final bool selected;
  final bool showChangeAction;
  final bool alreadyRegistered;
  /// A inscrição existente ainda tem passo pendente (parceiro, uniforme ou
  /// pagamento). Muda o selo: "JÁ INSCRITO" mentiria para quem não terminou.
  final bool registrationIncomplete;
  /// Categoria abaixo do nível do atleta (anti-sandbagging): bloqueada.
  final bool levelBlocked;
  /// Quando [levelBlocked], distingue o motivo: atleta abaixo do PISO
  /// (`minLevel`) da categoria, não acima do teto. Muda o selo exibido.
  final bool belowMinLevel;
  /// Categoria fora da faixa etária do atleta (ou sem data de nascimento).
  final bool ageBlocked;
  final String ageBlockLabel;
  /// Categoria de gênero incompatível com o perfil do atleta.
  final bool genderBlocked;
  final VoidCallback? onTap;
  final VoidCallback? onChange;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final badge = categoryBadgeLabel(offer);
    final genderLabel = categoryGenderDisplayLabel(offer);
    final subtitle = categoryRegistrationSubtitle(
      offer,
      format: format,
      inscriptionCount: inscriptionCount,
      includeGender: genderLabel.isEmpty,
    );
    // Já inscrito continua recebendo toque: é assim que o atleta volta para a
    // inscrição existente (convidar parceiro, informar uniforme, pagar). Nesse
    // caso a categoria lotada/encerrada não bloqueia — a vaga já é dele.
    final selectable = !levelBlocked &&
        !ageBlocked &&
        !genderBlocked &&
        (alreadyRegistered ||
            isCategorySelectable(
              offer,
              inscriptionCount: inscriptionCount,
            ));
    final registeredColor =
        registrationIncomplete ? AppColors.pending : AppColors.win;
    final borderColor = alreadyRegistered
        ? registeredColor.withValues(alpha: 0.45)
        : selected
            ? AppColors.brand
            : context.themeColors.onSurfaceMuted.withValues(alpha: 0.15);

    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: selectable ? onTap : null,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: borderColor,
              width: selected || alreadyRegistered ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: AppColors.brand.withValues(alpha: 0.35),
                  ),
                ),
                child: Text(
                  badge,
                  style: AppTypography.mono(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: AppColors.brand,
                  ),
                ),
              ),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      offer.name,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: selectable
                            ? context.themeColors.onSurface
                            : context.themeColors.onSurfaceMuted,
                      ),
                    ),
                    if (genderLabel.isNotEmpty) ...[
                      SizedBox(height: 6),
                      _CategoryGenderChip(label: genderLabel),
                    ],
                    SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    if (alreadyRegistered) ...[
                      SizedBox(height: 4),
                      Text(
                        registrationIncomplete
                            ? 'CONTINUAR INSCRIÇÃO'
                            : 'JÁ INSCRITO',
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: registrationIncomplete
                              ? AppColors.pending
                              : AppColors.win,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ] else if (!selectable) ...[
                      SizedBox(height: 4),
                      Text(
                        _closedLabel(offer),
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: AppColors.live,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (showChangeAction && onChange != null)
                TextButton(
                  onPressed: onChange,
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.brand,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: Text(
                    'TROCAR',
                    style: AppTypography.mono(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: AppColors.brand,
                      letterSpacing: 0.6,
                    ),
                  ),
                )
              else if (alreadyRegistered)
                Icon(
                  registrationIncomplete
                      ? Icons.arrow_forward_rounded
                      : Icons.verified_rounded,
                  color: registeredColor,
                  size: 22,
                )
              else if (selected)
                Icon(
                  Icons.check_circle_rounded,
                  color: AppColors.brand,
                  size: 22,
                ),
            ],
          ),
        ),
      ),
    );
  }

  String _closedLabel(TournamentCategoryOffer offer) {
    if (ageBlocked) {
      return ageBlockLabel.isNotEmpty ? ageBlockLabel : 'FORA DA FAIXA ETÁRIA';
    }
    if (levelBlocked) {
      return belowMinLevel
          ? CategoryLevelEligibility.minLevelBadgeLabel()
          : CategoryLevelEligibility.blockBadgeLabel();
    }
    if (genderBlocked) {
      return CategoryGenderEligibility.blockBadgeLabel();
    }
    if (offer.registrationClosed || offer.isCompleted) {
      return 'INSCRIÇÕES ENCERRADAS';
    }
    return 'CATEGORIA LOTADA';
  }
}

class _CategoryGenderChip extends StatelessWidget {
  const _CategoryGenderChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: AppColors.brand.withValues(alpha: 0.3),
        ),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: AppColors.brand,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

class TournamentRegistrationCategorySection extends StatelessWidget {
  const TournamentRegistrationCategorySection({
    super.key,
    required this.label,
    required this.child,
  });

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: AppTypography.mono(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
            fontSize: 11,
            letterSpacing: 0.8,
          ),
        ),
        SizedBox(height: 10),
        child,
      ],
    );
  }
}
