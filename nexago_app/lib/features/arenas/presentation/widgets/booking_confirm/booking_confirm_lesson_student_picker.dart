import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';

/// Aluno da carteira que a aula atende (só reserva como professor
/// independente). Opcional: "Nenhum" é a reserva de professor de sempre. A
/// arena não vê o aluno — a ligação fica fora da reserva.
class BookingConfirmLessonStudentPicker extends StatelessWidget {
  const BookingConfirmLessonStudentPicker({
    super.key,
    required this.students,
    required this.selectedId,
    required this.onSelected,
    this.enabled = true,
  });

  /// Alunos ativos da carteira.
  final List<({String id, String name})> students;
  final String? selectedId;
  final ValueChanged<String?> onSelected;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'AULA PARA UM ALUNO DA CARTEIRA (OPCIONAL)',
          style: AppTypography.mono(
            fontWeight: FontWeight.w600,
            fontSize: 12,
            letterSpacing: 0.8,
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            ArenaClassChip(
              key: const Key('booking-confirm-lesson-none'),
              label: 'Nenhum',
              selected: selectedId == null,
              onTap: enabled ? () => onSelected(null) : null,
            ),
            for (final s in students)
              ArenaClassChip(
                key: Key('booking-confirm-lesson-${s.id}'),
                label: s.name,
                selected: selectedId == s.id,
                onTap: enabled ? () => onSelected(s.id) : null,
              ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          'O aluno recebe o aviso da aula. A arena vê só a quadra reservada '
          'por você.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
          ),
        ),
      ],
    );
  }
}
