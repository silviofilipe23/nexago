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
      expect(focusSectionFromSlug('palpites'), FocusSection.palpites);
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

  group('rótulos', () {
    // Com cinco abas o slot cai para ~71px no iPhone comum, e "TRAJETÓRIA"
    // (76px em Sora 11/w700) truncava como "TRAJETÓR…". "Jornada" cabe e é o
    // termo que o domínio já usa (`focus_journey_logic`, `journeyStepsOf`).
    test('a aba da trajetória se chama Jornada', () {
      expect(FocusSection.trajetoria.label, 'Jornada');
    });

    test('o slug dela continua "trajetoria", para não quebrar deep link', () {
      // `?secao=trajetoria` já circula; o rótulo é de tela, o slug é contrato.
      expect(FocusSection.trajetoria.slug, 'trajetoria');
      expect(focusSectionFromSlug('trajetoria'), FocusSection.trajetoria);
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
          FocusSection.palpites,
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
