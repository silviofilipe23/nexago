import 'package:flutter/material.dart';

import '../../../domain/slots_page_logic.dart';

/// Uma opção de [SlotsChoiceChipsRow].
class SlotsChoiceOption<T> {
  const SlotsChoiceOption({required this.value, required this.label});

  final T value;
  final String label;
}

/// Fileira de escolha única que rola para o lado, sem quebrar em várias
/// linhas (esporte na grade por horário e no perfil da arena).
class SlotsChoiceChipsRow<T> extends StatelessWidget {
  const SlotsChoiceChipsRow({
    super.key,
    required this.options,
    required this.selected,
    required this.onSelected,
    this.padding = EdgeInsets.zero,
    this.scrollKey,
  });

  /// Chave da área que rola (os testes procuram a fileira por ela).
  final Key? scrollKey;
  final List<SlotsChoiceOption<T>> options;
  final T selected;
  final ValueChanged<T> onSelected;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      key: scrollKey,
      scrollDirection: Axis.horizontal,
      clipBehavior: Clip.none,
      padding: padding,
      child: Row(
        children: [
          for (final (i, option) in options.indexed) ...[
            if (i > 0) const SizedBox(width: 8),
            ChoiceChip(
              label: Text(option.label),
              selected: option.value == selected,
              onSelected: (_) => onSelected(option.value),
            ),
          ],
        ],
      ),
    );
  }
}

/// Durações oferecidas (1 h, 2 h…), escolha única.
class SlotsDurationChips extends StatelessWidget {
  const SlotsDurationChips({
    super.key,
    required this.durations,
    required this.selectedMinutes,
    required this.onSelected,
  });

  final List<int> durations;
  final int selectedMinutes;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final minutes in durations)
          ChoiceChip(
            label: Text(formatSelectionDurationLabel(1, minutes)),
            selected: minutes == selectedMinutes,
            onSelected: (_) => onSelected(minutes),
          ),
      ],
    );
  }
}
