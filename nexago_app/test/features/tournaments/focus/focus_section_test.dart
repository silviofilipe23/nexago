import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/focus_section.dart';

void main() {
  group('focusSectionFromSlug', () {
    test('resolve cada slug', () {
      expect(focusSectionFromSlug('agora'), FocusSection.agora);
      expect(focusSectionFromSlug('trajetoria'), FocusSection.trajetoria);
      expect(focusSectionFromSlug('grupo'), FocusSection.grupo);
      expect(focusSectionFromSlug('chave'), FocusSection.chave);
      expect(focusSectionFromSlug('arena'), FocusSection.arena);
    });

    test('slug desconhecido, vazio ou nulo cai em Agora', () {
      // Deep link torto não pode deixar o atleta numa tela em branco.
      expect(focusSectionFromSlug('inexistente'), FocusSection.agora);
      expect(focusSectionFromSlug(''), FocusSection.agora);
      expect(focusSectionFromSlug(null), FocusSection.agora);
    });

    test('tolera caixa e espaço', () {
      expect(focusSectionFromSlug('  CHAVE '), FocusSection.chave);
    });
  });

  group('visibleFocusSections', () {
    test('a terceira aba é Grupo em categoria com fase de grupos', () {
      expect(
        visibleFocusSections(isDoubleElimination: false),
        [
          FocusSection.agora,
          FocusSection.trajetoria,
          FocusSection.grupo,
          FocusSection.arena,
        ],
      );
    });

    test('a terceira aba é Chave na dupla eliminação', () {
      // Não há fase de grupos para mostrar; a mesma posição vira a chave.
      expect(
        visibleFocusSections(isDoubleElimination: true),
        [
          FocusSection.agora,
          FocusSection.trajetoria,
          FocusSection.chave,
          FocusSection.arena,
        ],
      );
    });

    test('Arena é sempre a última, nos dois formatos', () {
      // É a única seção que não depende da categoria em foco: vale para quem
      // ainda não tem partida nenhuma.
      for (final isDouble in [true, false]) {
        expect(
          visibleFocusSections(isDoubleElimination: isDouble).last,
          FocusSection.arena,
        );
      }
    });
  });
}
