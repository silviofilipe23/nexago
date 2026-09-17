import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/focus_section.dart';

void main() {
  group('focusSectionFromSlug', () {
    test('resolve cada slug', () {
      expect(focusSectionFromSlug('agora'), FocusSection.agora);
      expect(focusSectionFromSlug('grupo'), FocusSection.grupo);
      expect(focusSectionFromSlug('chave'), FocusSection.chave);
      expect(focusSectionFromSlug('arena'), FocusSection.arena);
      expect(focusSectionFromSlug('palpites'), FocusSection.palpites);
    });

    test('slug desconhecido, vazio, nulo ou legado trajetoria cai em Agora',
        () {
      // Deep link torto / seção removida não pode deixar o atleta numa tela
      // em branco.
      expect(focusSectionFromSlug('inexistente'), FocusSection.agora);
      expect(focusSectionFromSlug(''), FocusSection.agora);
      expect(focusSectionFromSlug(null), FocusSection.agora);
      expect(focusSectionFromSlug('trajetoria'), FocusSection.agora);
    });

    test('tolera caixa e espaço', () {
      expect(focusSectionFromSlug('  CHAVE '), FocusSection.chave);
    });
  });

  group('visibleFocusSections', () {
    test('a segunda aba é Grupo em categoria com fase de grupos', () {
      expect(
        visibleFocusSections(isDoubleElimination: false),
        [
          FocusSection.agora,
          FocusSection.grupo,
          FocusSection.arena,
          FocusSection.palpites,
        ],
      );
    });

    test('após grupos (ou com mata-mata) a Chave entra na nav', () {
      expect(
        visibleFocusSections(
          isDoubleElimination: false,
          groupsComplete: true,
        ),
        [
          FocusSection.agora,
          FocusSection.grupo,
          FocusSection.chave,
          FocusSection.arena,
          FocusSection.palpites,
        ],
      );
      expect(
        visibleFocusSections(
          isDoubleElimination: false,
          hasKnockoutBracket: true,
        ),
        contains(FocusSection.chave),
      );
    });

    test('a segunda aba é Chave na dupla eliminação', () {
      // Não há fase de grupos para mostrar; a mesma posição vira a chave.
      expect(
        visibleFocusSections(isDoubleElimination: true),
        [
          FocusSection.agora,
          FocusSection.chave,
          FocusSection.arena,
          FocusSection.palpites,
        ],
      );
    });

    test('Palpites fecha a barra nos dois formatos', () {
      // Como a Arena, não se recorta por categoria nem por formato: vale para
      // quem foi eliminado e para quem ainda não entrou em quadra.
      for (final isDouble in [true, false]) {
        expect(
          visibleFocusSections(isDoubleElimination: isDouble).last,
          FocusSection.palpites,
        );
      }
    });

    test('Arena vem imediatamente antes de Palpites, nos dois formatos', () {
      for (final isDouble in [true, false]) {
        final sections = visibleFocusSections(isDoubleElimination: isDouble);
        expect(sections[sections.length - 2], FocusSection.arena);
      }
    });
  });
}
