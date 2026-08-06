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
    this.tournamentId = '',
    this.tournamentName = '',
    this.tournamentCity = '',
    this.organizerManagerId,
    this.organizerPixKey = '',
    this.organizerPixKeyType = '',
    this.organizerPixRecipientName = '',
    this.organizerPixCity = '',
    this.showSoloPartnerInvite = false,
    this.partnerJoinsFree = false,
    this.onInvitePartner,
    this.pendingPartnerName,
    this.onTrackInvite,
    this.showInformUniform = false,
    this.onInformUniform,
    this.onCancelRegistration,
    this.cancelBlockedHint,
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
  final String tournamentId;
  final String tournamentName;

  /// Cidade do torneio — fallback pro campo 60 do BR Code quando a chave PIX
  /// do organizador não tem cidade configurada.
  final String tournamentCity;
  final String? organizerManagerId;
  final String organizerPixKey;
  final String organizerPixKeyType;
  final String organizerPixRecipientName;
  final String organizerPixCity;
  final bool showSoloPartnerInvite;

  /// Inscrição já paga (total): o parceiro convidado entra sem taxa.
  final bool partnerJoinsFree;
  final VoidCallback? onInvitePartner;
  final String? pendingPartnerName;
  final VoidCallback? onTrackInvite;

  /// Categoria exige uniforme: oferece informar o tamanho depois da inscrição.
  final bool showInformUniform;
  final VoidCallback? onInformUniform;

  /// Cancela a reserva/inscrição do próprio atleta (só enquanto não paga).
  final VoidCallback? onCancelRegistration;

  /// Exibido no lugar do botão de cancelar quando já há pagamento na
  /// inscrição (parcela de um dos dois) — o caminho passa a ser o organizador.
  final String? cancelBlockedHint;

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
        if (showSoloPartnerInvite && onInvitePartner != null) ...[
          TournamentRegistrationSoloInviteCard(
            onInvitePartner: onInvitePartner!,
            pendingPartnerName: pendingPartnerName,
            onTrackInvite: onTrackInvite,
            partnerJoinsFree: partnerJoinsFree,
          ),
          SizedBox(height: 12),
        ],
        if (showInformUniform && onInformUniform != null) ...[
          OutlinedButton.icon(
            onPressed: onInformUniform,
            icon: const Icon(Icons.checkroom_outlined, size: 18),
            label: const Text('Informar uniforme'),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
            ),
          ),
          SizedBox(height: 12),
        ],

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

          // Builder(
          //   builder: (context) {
          //     final parts = directOrganizerPaymentBodyParts(quote);
          //     return RichText(
          //       text: TextSpan(
          //         style: theme.textTheme.bodyMedium?.copyWith(
          //           color: context.themeColors.onSurfaceMuted,
          //           fontWeight: FontWeight.w500,
          //           height: 1.45,
          //         ),
          //         children: [
          //           TextSpan(text: parts.$1),
          //           TextSpan(
          //             text: parts.$2,
          //             style: const TextStyle(fontWeight: FontWeight.w800),
          //           ),
          //           TextSpan(text: parts.$3),
          //         ],
          //       ),
          //     );
          //   },
          // ),
          SizedBox(height: 16),
          TournamentRegistrationDirectOrganizerPanel(
            tournamentId: tournamentId,
            tournamentName: tournamentName,
            quote: quote,
            paymentType: paymentType,
            onPaymentTypeChanged: onPaymentTypeChanged,
            dualPaymentOnly: dualPaymentOnly,
            managerId: organizerManagerId,
            pixKey: organizerPixKey,
            pixKeyType: organizerPixKeyType,
            pixRecipientName: organizerPixRecipientName,
            pixCity: organizerPixCity,
            tournamentCity: tournamentCity,
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
        if (onCancelRegistration != null) ...[
          SizedBox(height: 12),
          TextButton(
            onPressed: onCancelRegistration,
            child: Text(
              'Cancelar reserva',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ] else if (cancelBlockedHint != null) ...[
          SizedBox(height: 12),
          Text(
            cancelBlockedHint!,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w500,
            ),
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
