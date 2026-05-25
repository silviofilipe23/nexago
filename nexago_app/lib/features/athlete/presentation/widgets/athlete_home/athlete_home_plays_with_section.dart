import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/athlete_home_models.dart';
import 'athlete_home_section_header.dart';

class AthleteHomePlaysWithSection extends StatelessWidget {
  const AthleteHomePlaysWithSection({
    super.key,
    required this.partners,
    this.onInvite,
    this.onPartnerAction,
  });

  final List<AthleteHomePlayPartner> partners;
  final VoidCallback? onInvite;
  final void Function(AthleteHomePlayPartner partner)? onPartnerAction;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AthleteHomeSectionHeader(
          title: 'Joga com você',
          trailingAccent: '3 ONLINE',
          trailingLabel: 'CONVIDAR',
          onTrailingTap: onInvite,
        ),
        const SizedBox(height: 10),
        ...partners.map(
          (p) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _PartnerRow(
              partner: p,
              onAction: () => onPartnerAction?.call(p),
            ),
          ),
        ),
      ],
    );
  }
}

class _PartnerRow extends StatelessWidget {
  const _PartnerRow({required this.partner, this.onAction});

  final AthleteHomePlayPartner partner;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.surfaceRaised),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: partner.avatarColor,
              shape: BoxShape.circle,
            ),
            child: Text(
              partner.initials,
              style: theme.textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w900,
                color: AppColors.white,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  partner.name,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppColors.onSurface,
                  ),
                ),
                Text(
                  partner.statusLabel,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          if (partner.action == AthleteHomePartnerAction.call)
            FilledButton(
              onPressed: onAction,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.white,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                minimumSize: Size.zero,
              ),
              child: const Text('Chamar'),
            )
          else
            Material(
              color: AppColors.surfaceRaised,
              borderRadius: BorderRadius.circular(10),
              child: InkWell(
                onTap: onAction,
                borderRadius: BorderRadius.circular(10),
                child: const SizedBox(
                  width: 36,
                  height: 36,
                  child: Icon(
                    Icons.add_rounded,
                    color: AppColors.onSurface,
                    size: 20,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
