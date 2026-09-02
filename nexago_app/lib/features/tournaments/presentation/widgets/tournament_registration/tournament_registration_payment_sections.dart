import 'package:flutter/material.dart';

import '../../../../../core/profiles/app_user_profile.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/nexa_card.dart';
import '../../../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_registration_logic.dart';
import '../../../domain/tournament_team_roster_logic.dart';

const _shortMonths = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

const _shortWeekdays = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

/// "Masc. Intermediário · dom · 12 jul · 08h"
String registrationPaymentEventSubtitle({
  required TournamentCategoryOffer category,
  DateTime? startDate,
}) {
  final gender = categoryGenderDisplayLabel(category);
  final genderShort = switch (gender) {
    'Masculino' => 'Masc.',
    'Feminino' => 'Fem.',
    _ => gender,
  };
  final level = category.level.trim().isNotEmpty
      ? category.level.trim()
      : category.name.trim();
  final categoryPart = [
    if (genderShort.isNotEmpty) genderShort,
    if (level.isNotEmpty) level,
  ].join(' ');
  final datePart = startDate != null ? _formatEventDate(startDate) : '';
  return [
    if (categoryPart.isNotEmpty) categoryPart,
    if (datePart.isNotEmpty) datePart,
  ].join(' · ');
}

String _formatEventDate(DateTime date) {
  final local = date.toLocal();
  final weekday = _shortWeekdays[local.weekday - 1];
  final month = _shortMonths[local.month - 1];
  final hour = local.hour.toString().padLeft(2, '0');
  return '$weekday · ${local.day} $month · ${hour}h';
}

String _firstName(String name) {
  final trimmed = name.trim();
  if (trimmed.isEmpty) return 'Parceiro';
  return trimmed.split(RegExp(r'\s+')).first;
}

/// Card compacto "DUPLA CONFIRMADA" no topo do pagamento.
class TournamentRegistrationDuoSummaryCard extends StatelessWidget {
  const TournamentRegistrationDuoSummaryCard({
    super.key,
    required this.roster,
    required this.eventSubtitle,
    this.isTeamCategory = false,
  });

  final List<TournamentRosterMember> roster;
  final String eventSubtitle;
  final bool isTeamCategory;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final me = roster.where((m) => m.isMe).firstOrNull ?? roster.first;
    TournamentRosterMember? partner;
    for (final member in roster) {
      if (!member.isMe) {
        partner = member;
        break;
      }
    }

    final headline = partner == null
        ? me.name
        : isTeamCategory
        ? '${roster.length} atletas na equipe'
        : 'Você & ${_firstName(partner.name)}';

    final avatars = roster.take(2).toList();

    return NexaCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox(
            width: avatars.length > 1 ? 68 : 44,
            height: 44,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                for (var i = 0; i < avatars.length; i++)
                  Positioned(
                    left: i * 24.0,
                    child: AthleteProfileAvatar(
                      size: 44,
                      initials: initialsFromDisplayName(avatars[i].name),
                      imageUrl: avatars[i].photoUrl,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isTeamCategory ? 'EQUIPE CONFIRMADA' : 'DUPLA CONFIRMADA',
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: AppColors.win,
                    letterSpacing: 1.1,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  headline,
                  style: AppTypography.titleM.copyWith(
                    color: colors.onSurface,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (eventSubtitle.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    eventSubtitle,
                    style: AppTypography.bodyS.copyWith(
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Opções "Metade e metade" vs "Integral" — protótipo AGORA SIM: O PAGAMENTO.
class TournamentRegistrationPaymentOptionsSection extends StatelessWidget {
  const TournamentRegistrationPaymentOptionsSection({
    super.key,
    required this.quote,
    required this.paymentType,
    required this.onPaymentTypeChanged,
    this.dualPaymentOnly = false,
  });

  final TournamentRegistrationQuote quote;
  final String paymentType;
  final ValueChanged<String> onPaymentTypeChanged;
  final bool dualPaymentOnly;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final shareLabel = formatRegistrationMoney(quote.shareAmount);
    final totalLabel = formatRegistrationMoney(quote.displayTotal);
    final isTeam = quote.isTeamCategory;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'AGORA SIM: O PAGAMENTO',
          style: AppTypography.eyebrow.copyWith(color: colors.onSurfaceMuted),
        ),
        const SizedBox(height: AppSpacing.md),
        _PaymentOptionTile(
          selected: paymentType == 'share',
          onTap: () => onPaymentTypeChanged('share'),
          icon: Icons.payments_outlined,
          title: isTeam
              ? 'Dividido pelo elenco · $shareLabel cada'
              : 'Metade e metade · $shareLabel cada',
          subtitle: isTeam
              ? 'Cada atleta paga a própria parte no app'
              : 'Você paga a sua parte e seu parceiro paga a dele no app',
        ),
        if (!dualPaymentOnly) ...[
          const SizedBox(height: AppSpacing.sm),
          _PaymentOptionTile(
            selected: paymentType == 'full',
            onTap: () => onPaymentTypeChanged('full'),
            icon: Icons.bolt_outlined,
            title: isTeam
                ? 'Pagar a inscrição inteira · $totalLabel'
                : 'Pagar a inscrição inteira · $totalLabel',
            subtitle: isTeam
                ? 'O restante vocês acertam direto, fora do app'
                : 'A metade dele vocês acertam direto, fora do app',
          ),
        ],
      ],
    );
  }
}

class _PaymentOptionTile extends StatelessWidget {
  const _PaymentOptionTile({
    required this.selected,
    required this.onTap,
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final bool selected;
  final VoidCallback onTap;
  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final borderColor = selected
        ? AppColors.brand
        : colors.onSurfaceMuted.withValues(alpha: 0.18);

    return Material(
      color: colors.surfaceCard,
      borderRadius: AppRadii.lgAll,
      child: InkWell(
        onTap: onTap,
        borderRadius: AppRadii.lgAll,
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            borderRadius: AppRadii.lgAll,
            border: Border.all(
              color: borderColor,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                selected
                    ? Icons.radio_button_checked_rounded
                    : Icons.radio_button_off_rounded,
                size: 20,
                color: selected ? AppColors.brand : colors.onSurfaceMuted,
              ),
              const SizedBox(width: AppSpacing.sm),
              Icon(icon, size: 18, color: selected ? AppColors.brand : colors.onSurfaceMuted),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: AppTypography.titleS.copyWith(
                        color: colors.onSurface,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: AppTypography.bodyS.copyWith(
                        color: colors.onSurfaceMuted,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Card "RESUMO" com divisão por atleta.
class TournamentRegistrationPaymentSummaryCard extends StatelessWidget {
  const TournamentRegistrationPaymentSummaryCard({
    super.key,
    required this.quote,
    required this.paymentType,
    required this.myName,
    required this.partnerName,
    required this.mySharePaid,
    required this.partnerSharePaid,
    required this.isFullyPaid,
  });

  final TournamentRegistrationQuote quote;
  final String paymentType;
  final String myName;
  final String partnerName;
  final bool mySharePaid;
  final bool partnerSharePaid;
  final bool isFullyPaid;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final totalLabel = formatRegistrationMoney(quote.displayTotal);
    final shareLabel = formatRegistrationMoney(quote.shareAmount);
    final payFull = paymentType == 'full';

    return NexaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'RESUMO',
                  style: AppTypography.eyebrow.copyWith(
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ),
              Text(
                '$totalLabel no total',
                style: AppTypography.titleS.copyWith(
                  color: colors.onSurface,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          _SummaryRow(
            title: payFull ? 'Você paga agora' : 'Você paga agora',
            subtitle: payFull ? 'inscrição inteira · Pix ou cartão' : 'sua metade · Pix ou cartão',
            amount: payFull ? totalLabel : shareLabel,
            badge: isFullyPaid || mySharePaid ? 'PAGO' : 'A PAGAR',
            badgeColor: isFullyPaid || mySharePaid ? AppColors.win : AppColors.brand,
          ),
          if (!payFull && !quote.isTeamCategory) ...[
            Divider(
              height: AppSpacing.xl,
              color: colors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
            _SummaryRow(
              title: partnerName,
              subtitle: 'metade dele, no app',
              amount: shareLabel,
              badge: partnerSharePaid || isFullyPaid ? 'CONFIRMADO' : 'AGUARDANDO',
              badgeColor: partnerSharePaid || isFullyPaid
                  ? AppColors.win
                  : colors.onSurfaceMuted,
            ),
          ],
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.title,
    required this.subtitle,
    required this.amount,
    required this.badge,
    required this.badgeColor,
  });

  final String title;
  final String subtitle;
  final String amount;
  final String badge;
  final Color badgeColor;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: AppTypography.titleS.copyWith(
                  color: colors.onSurface,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
              ),
            ],
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              amount,
              style: AppTypography.titleS.copyWith(
                color: colors.onSurface,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              badge,
              style: AppTypography.mono(
                fontSize: 9,
                fontWeight: FontWeight.w700,
                color: badgeColor,
                letterSpacing: 0.8,
              ),
            ),
          ],
        ),
      ],
    );
  }
}
