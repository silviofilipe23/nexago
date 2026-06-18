import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../../../domain/tournament_create/tournament_create_providers.dart';
import '../tournament_create_navigation.dart';
import '../tournament_create_wizard_scaffold.dart';
import '../widgets/organizer_form_widgets.dart';

class TournamentCreateRegistrationPage extends ConsumerWidget {
  const TournamentCreateRegistrationPage({super.key});

  Future<void> _pickDate(
    BuildContext context,
    WidgetRef ref, {
    required bool opens,
  }) async {
    final draft = ref.read(tournamentCreateDraftProvider);
    final initial = opens
        ? (draft.registrationOpensAt ?? DateTime.now())
        : (draft.registrationClosesAt ??
            draft.registrationOpensAt ??
            DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 730)),
    );
    if (picked == null) return;
    if (opens) {
      ref.read(tournamentCreateWizardProvider.notifier).setRegistrationOpensAt(picked);
    } else {
      ref.read(tournamentCreateWizardProvider.notifier).setRegistrationClosesAt(picked);
    }
  }

  Future<void> _handleClose(BuildContext context, WidgetRef ref) =>
      handleWizardClose(context, ref);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(tournamentCreateDraftProvider);
    final canContinue = ref.watch(
      tournamentCreateCanContinueProvider(TournamentCreateStep.registration),
    );

    return TournamentCreateWizardScaffold(
      step: TournamentCreateStep.registration,
      onBack: () {
        syncWizardStep(ref, TournamentCreateStep.categories);
        Navigator.of(context).maybePop();
      },
      onClose: () => _handleClose(context, ref),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const OrganizerSectionLabel('PERÍODO'),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OrganizerDateField(
                  label: 'ABREM EM',
                  value: formatShortDate(draft.registrationOpensAt),
                  onTap: () => _pickDate(context, ref, opens: true),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OrganizerDateField(
                  label: 'FECHAM EM',
                  value: formatShortDate(draft.registrationClosesAt),
                  onTap: () => _pickDate(context, ref, opens: false),
                ),
              ),
            ],
          ),
          if (registrationWindowError(draft) case final error?) ...[
            const SizedBox(height: 10),
            _RegistrationWarning(message: error),
          ],
          const SizedBox(height: 24),
          const OrganizerSectionLabel('PAGAMENTO'),
          const SizedBox(height: 12),
          for (final mode in TournamentPaymentMode.values) ...[
            OrganizerRadioOptionCard(
              title: paymentModeLabel(mode),
              subtitle: paymentModeDescription(mode),
              selected: draft.paymentMode == mode,
              trailing: mode == TournamentPaymentMode.appPixCard
                  ? Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.surface,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text(
                        'taxa 6%',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
                      ),
                    )
                  : null,
              onTap: () =>
                  ref.read(tournamentCreateWizardProvider.notifier).setPaymentMode(mode),
            ),
            const SizedBox(height: 10),
          ],
          const SizedBox(height: 8),
          const OrganizerSectionLabel('VAGAS'),
          const SizedBox(height: 12),
          OrganizerToggleSettingRow(
            icon: Icons.format_list_numbered_rounded,
            title: 'Lista de espera',
            subtitle:
                'Quando lotar, novas duplas entram na fila automaticamente.',
            value: draft.waitlistEnabled,
            onChanged: (value) => ref
                .read(tournamentCreateWizardProvider.notifier)
                .setWaitlistEnabled(value),
          ),
          const SizedBox(height: 10),
          OrganizerToggleSettingRow(
            icon: Icons.mail_outline_rounded,
            title: 'Confirmar dupla por convite',
            subtitle: 'Parceiro precisa aceitar antes de confirmar a inscrição.',
            value: draft.inviteConfirmEnabled,
            onChanged: (value) => ref
                .read(tournamentCreateWizardProvider.notifier)
                .setInviteConfirmEnabled(value),
          ),
        ],
      ),
      footer: OrganizerWizardContinueButton(
        label: 'Continuar',
        enabled: canContinue,
        onPressed: () => goToNextCreateStep(
          context,
          ref,
          TournamentCreateStep.registration,
        ),
      ),
    );
  }
}

class _RegistrationWarning extends StatelessWidget {
  const _RegistrationWarning({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.pending.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.pending.withValues(alpha: 0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.warning_amber_rounded,
              color: AppColors.pending, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurface,
                    fontWeight: FontWeight.w600,
                    height: 1.35,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}
