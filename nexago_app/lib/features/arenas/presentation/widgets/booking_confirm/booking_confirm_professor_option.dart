import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../professor_links/domain/arena_professor_link.dart';
import '../../../../professor_links/presentation/widgets/professor_links_ui.dart';

/// "Reservar como professor": só para quem tem vínculo com a arena liberando
/// "Reservar quadras". Desligado é reserva de atleta, como sempre — o
/// professor também joga. Ligado, a arena vê na agenda que o horário é dele
/// como professor; preço, regras e pagamento não mudam.
class BookingConfirmProfessorOption extends StatelessWidget {
  const BookingConfirmProfessorOption({
    super.key,
    required this.arenaName,
    required this.type,
    required this.value,
    required this.onChanged,
    this.enabled = true,
  });

  final String arenaName;
  final ArenaProfessorLinkType type;
  final bool value;
  final ValueChanged<bool> onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final arena =
        arenaName.trim().isEmpty ? 'A arena' : 'A ${arenaName.trim()}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'COMO PROFESSOR',
          style: AppTypography.mono(
            fontWeight: FontWeight.w600,
            fontSize: 14,
            letterSpacing: 0.8,
          ),
        ),
        const SizedBox(height: 10),
        AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            color: value
                ? AppColors.brand.withValues(alpha: 0.11)
                : theme.colorScheme.surfaceContainerHigh.withValues(alpha: 0.5),
            border: Border.all(
              color: value
                  ? AppColors.brand.withValues(alpha: 0.9)
                  : theme.colorScheme.outline.withValues(alpha: 0.2),
              width: value ? 1.6 : 1,
            ),
          ),
          child: Semantics(
            toggled: value,
            enabled: enabled,
            label: 'Reservar como professor',
            child: InkWell(
              key: const Key('booking-confirm-as-professor'),
              borderRadius: BorderRadius.circular(16),
              onTap: enabled
                  ? () {
                      HapticFeedback.selectionClick();
                      onChanged(!value);
                    }
                  : null,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
                child: Row(
                  children: [
                    Icon(
                      Icons.school_outlined,
                      color: value
                          ? AppColors.brand
                          : theme.colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Wrap(
                            spacing: 8,
                            runSpacing: 4,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              Text(
                                'Reservar como professor',
                                style: theme.textTheme.titleSmall?.copyWith(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              ProfessorLinkTypeTag(type, small: true),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '$arena vê na agenda que o horário é seu como '
                            'professor. Mesmo preço e regras.',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurface.withValues(
                                alpha: 0.64,
                              ),
                              height: 1.3,
                            ),
                          ),
                        ],
                      ),
                    ),
                    ExcludeSemantics(
                      child: Switch(
                        value: value,
                        onChanged: enabled ? onChanged : null,
                        activeThumbColor: AppColors.black,
                        activeTrackColor: AppColors.brand,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
