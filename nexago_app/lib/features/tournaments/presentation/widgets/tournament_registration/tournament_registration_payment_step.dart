import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_registration_logic.dart';
import 'tournament_registration_direct_organizer_panel.dart';
import 'tournament_registration_solo_invite_card.dart';

class TournamentRegistrationPaymentStep extends StatelessWidget {
  const TournamentRegistrationPaymentStep({
    super.key,
    required this.category,
    required this.quote,
    required this.paymentType,
    required this.onPaymentTypeChanged,
    this.dualPaymentOnly = false,
    this.progressLabel,
    this.isFullyPaid = false,
    this.isFreeRegistration = false,
    this.isDirectOrganizerPayment = false,
    this.tournamentName = '',
    this.organizerManagerId,
    this.organizerPixKey = '',
    this.organizerPixRecipientName = '',
    this.organizerPixCity = '',
    this.showSoloPartnerInvite = false,
    this.partnerJoinsFree = false,
    this.onInvitePartner,
    this.pendingPartnerName,
    this.onTrackInvite,
  });

  final TournamentCategoryOffer category;
  final TournamentRegistrationQuote quote;
  final String paymentType;
  final ValueChanged<String> onPaymentTypeChanged;
  final bool dualPaymentOnly;
  final String? progressLabel;
  final bool isFullyPaid;
  final bool isFreeRegistration;
  final bool isDirectOrganizerPayment;
  final String tournamentName;
  final String? organizerManagerId;
  final String organizerPixKey;
  final String organizerPixRecipientName;
  final String organizerPixCity;
  final bool showSoloPartnerInvite;
  /// Inscrição já paga (total): o parceiro convidado entra sem taxa.
  final bool partnerJoinsFree;
  final VoidCallback? onInvitePartner;
  final String? pendingPartnerName;
  final VoidCallback? onTrackInvite;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final amountLabel = paymentAmountLabel(
      quote: quote,
      amountType: paymentType,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          isFreeRegistration ? 'CONFIRMAÇÃO' : 'PAGAMENTO',
          style: AppTypography.mono(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
            fontSize: 11,
            letterSpacing: 0.8,
          ),
        ),
        SizedBox(height: 12),
        Text(
          category.name,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
          ),
        ),
        if (isDirectOrganizerPayment) ...[
          SizedBox(height: 16),
          Row(
            children: [
              Container(
                width: 3,
                height: 20,
                decoration: BoxDecoration(
                  color: AppColors.brand,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              SizedBox(width: 10),
              Icon(
                Icons.handshake_outlined,
                size: 20,
                color: AppColors.pending,
              ),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Pagamento direto com o organizador',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: 12),
          Builder(
            builder: (context) {
              final parts = directOrganizerPaymentBodyParts(quote);
              return RichText(
                text: TextSpan(
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w500,
                    height: 1.45,
                  ),
                  children: [
                    TextSpan(text: parts.$1),
                    TextSpan(
                      text: parts.$2,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    TextSpan(text: parts.$3),
                  ],
                ),
              );
            },
          ),
          SizedBox(height: 16),
          TournamentRegistrationDirectOrganizerPanel(
            tournamentName: tournamentName,
            quote: quote,
            managerId: organizerManagerId,
            pixKey: organizerPixKey,
            pixRecipientName: organizerPixRecipientName,
            pixCity: organizerPixCity,
          ),
        ] else ...[
          SizedBox(height: 4),
          Text(
            isFreeRegistration
                ? 'Esta categoria é gratuita. Cada atleta confirma a inscrição e a dupla é validada quando os dois confirmarem.'
                : dualPaymentOnly
                ? 'Cada atleta paga sua parcela. A inscrição da dupla é confirmada quando os dois pagarem.'
                : 'Escolha como deseja pagar a inscrição.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
        if (progressLabel != null && progressLabel!.isNotEmpty) ...[
          SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isFullyPaid
                  ? AppColors.win.withValues(alpha: 0.12)
                  : AppColors.pending.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: (isFullyPaid ? AppColors.win : AppColors.pending)
                    .withValues(alpha: 0.35),
              ),
            ),
            child: Text(
              progressLabel!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: isFullyPaid
                    ? AppColors.win
                    : context.themeColors.onSurface,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
        if (showSoloPartnerInvite && onInvitePartner != null) ...[
          SizedBox(height: 16),
          TournamentRegistrationSoloInviteCard(
            onInvitePartner: onInvitePartner!,
            pendingPartnerName: pendingPartnerName,
            onTrackInvite: onTrackInvite,
            partnerJoinsFree: partnerJoinsFree,
          ),
        ],
        if (!dualPaymentOnly && !isDirectOrganizerPayment) ...[
          SizedBox(height: 16),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'share', label: Text('Minha parte')),
              ButtonSegment(value: 'full', label: Text('Integral')),
            ],
            selected: {paymentType},
            onSelectionChanged: (selection) {
              if (selection.isEmpty) return;
              onPaymentTypeChanged(selection.first);
            },
          ),
        ],
        if (!isFreeRegistration && !isDirectOrganizerPayment) ...[
          SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: context.themeColors.surfaceRaised,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.12,
                ),
              ),
            ),
            child: Row(
              children: [
                Text(
                  paymentType == 'full' ? 'Total da dupla' : 'Sua parcela',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Spacer(),
                Text(
                  amountLabel,
                  style: AppTypography.mono(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    color: AppColors.brand,
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
