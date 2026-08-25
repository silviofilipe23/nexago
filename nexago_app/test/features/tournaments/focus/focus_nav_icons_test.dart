import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/layout/nexa_bottom_nav_icon_map.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/focus_section.dart';

/// Os ícones que a nav do Focus usa, nos dois estados.
const _icons = <IconData>[
  Icons.local_fire_department_outlined,
  Icons.local_fire_department_rounded,
  Icons.emoji_events_outlined,
  Icons.emoji_events_rounded,
  Icons.table_rows_outlined,
  Icons.table_rows_rounded,
  Icons.account_tree_outlined,
  Icons.account_tree_rounded,
  Icons.place_outlined,
  Icons.place_rounded,
  Icons.casino_outlined,
  Icons.casino_rounded,
];

void main() {
  group('ícones da nav do Focus', () {
    test('todos resolvem para um SF Symbol', () {
      // Ícone fora do mapa NÃO degrada para "sem símbolo": a barra nativa cai
      // no `iconData` e desenha o ícone FORA DE ESCALA. Foi exatamente o que
      // aconteceu — só o troféu saía certo, porque era o único mapeado.
      for (final icon in _icons) {
        expect(
          materialIconToSfSymbol(icon),
          isNotNull,
          reason: 'ícone sem SF Symbol quebra a escala da barra nativa',
        );
      }
    });

    test('cada seção tem rótulo e slug próprios', () {
      final slugs = FocusSection.values.map((s) => s.slug).toSet();
      final labels = FocusSection.values.map((s) => s.label).toSet();

      expect(slugs.length, FocusSection.values.length);
      expect(labels.length, FocusSection.values.length);
    });
  });
}
