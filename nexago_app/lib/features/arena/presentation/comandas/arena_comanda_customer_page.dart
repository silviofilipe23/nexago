import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../domain/comandas/arena_comanda_providers.dart';
import 'widgets/arena_comanda_stepper.dart';
import 'widgets/arena_comanda_wizard_scaffold.dart';

class ArenaComandaCustomerPage extends ConsumerStatefulWidget {
  const ArenaComandaCustomerPage({super.key});

  @override
  ConsumerState<ArenaComandaCustomerPage> createState() =>
      _ArenaComandaCustomerPageState();
}

class _ArenaComandaCustomerPageState
    extends ConsumerState<ArenaComandaCustomerPage> {
  late final TextEditingController _nameController;
  late final TextEditingController _whatsappController;
  late final TextEditingController _cpfController;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController();
    _whatsappController = TextEditingController();
    _cpfController = TextEditingController();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _whatsappController.dispose();
    _cpfController.dispose();
    super.dispose();
  }

  InputDecoration _fieldDecoration(
    BuildContext context, {
    required String label,
    required IconData icon,
    String? hint,
  }) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      prefixIcon: Icon(icon, color: context.themeColors.onSurfaceMuted),
      filled: true,
      fillColor: context.themeColors.surfaceRaised,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.2),
        ),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.2),
        ),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.brand, width: 1.5),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(arenaComandaDraftProvider);

    return ArenaComandaWizardScaffold(
      stepLabel: 'NOVA COMANDA · PASSO 2 DE 3',
      title: 'Dados do cliente',
      currentStep: 1,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ArenaComandaStepper(currentStep: 1),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: _ModeChip(
                  label: 'Buscar cadastro',
                  selected: false,
                  enabled: false,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _ModeChip(
                  label: 'Cliente avulso',
                  selected: true,
                  enabled: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Text(
            'NOME DO CLIENTE',
            style: AppTypography.mono(
              color: context.themeColors.onSurfaceMuted,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _nameController,
            onChanged: ref
                .read(arenaComandaDraftProvider.notifier)
                .setCustomerName,
            textCapitalization: TextCapitalization.words,
            decoration: _fieldDecoration(
              context,
              label: '',
              icon: Icons.person_outline_rounded,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'WHATSAPP',
            style: AppTypography.mono(
              color: context.themeColors.onSurfaceMuted,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _whatsappController,
            onChanged: ref
                .read(arenaComandaDraftProvider.notifier)
                .setCustomerWhatsapp,
            keyboardType: TextInputType.phone,
            decoration: _fieldDecoration(
              context,
              label: '',
              icon: Icons.phone_outlined,
              hint: '(62) 9 0000-0000',
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'CPF NA NOTA (opcional)',
            style: AppTypography.mono(
              color: context.themeColors.onSurfaceMuted,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _cpfController,
            onChanged:
                ref.read(arenaComandaDraftProvider.notifier).setCustomerCpf,
            keyboardType: TextInputType.number,
            decoration: _fieldDecoration(
              context,
              label: '',
              icon: Icons.badge_outlined,
              hint: '000.000.000-00',
            ),
          ),
          const SizedBox(height: 20),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(
              'Comprovante e cashback',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
            ),
            subtitle: Text(
              'Enviar no WhatsApp ao fechar a conta',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
            ),
            value: draft.sendReceiptWhatsapp,
            activeTrackColor: AppColors.brand,
            onChanged: ref
                .read(arenaComandaDraftProvider.notifier)
                .setSendReceiptWhatsapp,
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.info_outline_rounded,
                size: 16,
                color: context.themeColors.onSurfaceMuted,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Só o nome é obrigatório. WhatsApp e CPF são usados para comprovante, cashback NexaGO e nota fiscal.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        height: 1.4,
                      ),
                ),
              ),
            ],
          ),
        ],
      ),
      footer: ArenaComandaWizardContinueButton(
        label: '→ Revisar comanda',
        enabled: draft.canContinueFromCustomer,
        onPressed: () {
          context.pushNamed(AppRouteNames.arenaComandaNewReview);
        },
      ),
    );
  }
}

class _ModeChip extends StatelessWidget {
  const _ModeChip({
    required this.label,
    required this.selected,
    required this.enabled,
  });

  final String label;
  final bool selected;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        color: selected ? AppColors.brand : context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: selected
              ? AppColors.brand
              : context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
        ),
      ),
      alignment: Alignment.center,
      child: Text(
        label,
        style: TextStyle(
          fontWeight: FontWeight.w700,
          fontSize: 13,
          color: !enabled
              ? context.themeColors.onSurfaceMuted.withValues(alpha: 0.5)
              : selected
                  ? AppColors.black
                  : context.themeColors.onSurface,
        ),
      ),
    );
  }
}
