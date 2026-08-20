import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/focus_section.dart';

void main() {
  group('focusSectionFromSlug', () {
    test('resolve cada slug', () {
      expect(focusSectionFromSlug('agora'), FocusSection.agora);
      expect(focusSectionFromSlug('trajetoria'), FocusSection.trajetoria);
      expect(focusSectionFromSlug('grupo'), FocusSection.grupo);
      expect(focusSectionFromSlug('chave'), FocusSection.chave);
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
}
