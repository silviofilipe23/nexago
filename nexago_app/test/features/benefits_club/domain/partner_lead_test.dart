import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/benefits_club/domain/benefit_event.dart';
import 'package:nexago_app/features/benefits_club/domain/partner.dart';
import 'package:nexago_app/features/benefits_club/domain/partner_brand_color.dart';
import 'package:nexago_app/features/benefits_club/domain/partner_lead.dart';

PartnerLeadDraft _draft({
  String partnerId = 'linq',
  String name = 'Silvio Dionizio',
  String whatsapp = '(62) 98240-6456',
  String neighborhood = 'Setor Bueno',
  String cep = '74230-010',
  bool consent = true,
}) => PartnerLeadDraft(
  partnerId: partnerId,
  name: name,
  whatsapp: whatsapp,
  neighborhood: neighborhood,
  cep: cep,
  consent: consent,
);

void main() {
  group('validação do lead (espelho do parseLead)', () {
    test('rascunho completo passa', () {
      expect(partnerLeadError(_draft()), isNull);
    });

    test('mesmas mensagens e mesma ordem do backend', () {
      expect(partnerLeadError(_draft(partnerId: 'a/b')), 'Parceiro inválido.');
      expect(
        partnerLeadError(_draft(consent: false, name: '')),
        'Marque a autorização para enviarmos seus dados ao parceiro.',
      );
      expect(partnerLeadError(_draft(name: ' x ')), 'Informe seu nome.');
      expect(partnerLeadError(_draft(name: 'a' * 121)), 'Informe seu nome.');
      expect(
        partnerLeadError(_draft(whatsapp: '98240-6456')),
        'Informe um WhatsApp com DDD.',
      );
      expect(
        partnerLeadError(_draft(neighborhood: 'B')),
        'Informe seu bairro.',
      );
      expect(
        partnerLeadError(_draft(cep: '7423-001')),
        'Informe um CEP com 8 números.',
      );
    });

    test('WhatsApp aceita máscara, DDI e fixo', () {
      expect(normalizeLeadWhatsapp('(62) 98240-6456'), '5562982406456');
      expect(normalizeLeadWhatsapp('+55 62 98240-6456'), '5562982406456');
      expect(normalizeLeadWhatsapp('6232406456'), '556232406456');
      expect(normalizeLeadWhatsapp('982406456'), isNull);
      expect(normalizeLeadCep('74230-010'), '74230010');
      expect(normalizeLeadCep('742300100'), isNull);
    });

    test('submissão normalizada', () {
      final s = PartnerLeadSubmission.fromDraft(
        _draft(name: '  Silvio   Dionizio ', neighborhood: ' Setor  Bueno'),
        source: BenefitSource.hubCard,
      );
      expect(s.name, 'Silvio Dionizio');
      expect(s.neighborhood, 'Setor Bueno');
      expect(s.whatsapp, '5562982406456');
      expect(s.cep, '74230010');
      expect(s.source, BenefitSource.hubCard);
    });
  });

  group('textos do lead', () {
    test('consentimento padrão idêntico ao do backend', () {
      expect(
        defaultConsentText('LinQ Telecom'),
        'Autorizo a NexaGO a compartilhar meu nome, WhatsApp, bairro e CEP '
        'com a LinQ Telecom para que ela entre em contato comigo sobre esta '
        'oferta.',
      );
    });

    test('consentimento do parceiro vence o padrão', () {
      const custom = Partner(
        id: 'linq',
        name: 'LinQ Telecom',
        leadConsentText: 'Texto da LinQ.',
      );
      const plain = Partner(id: 'linq', name: 'LinQ Telecom');
      const nameless = Partner(id: 'x', name: '');
      expect(leadConsentTextFor(custom), 'Texto da LinQ.');
      expect(leadConsentTextFor(plain), defaultConsentText('LinQ Telecom'));
      expect(leadConsentTextFor(nameless), contains('com a parceiro para'));
    });

    test('sucesso: mensagem da callable ou a padrão, sem o "Pronto!"', () {
      const linq = Partner(id: 'linq', name: 'LinQ Telecom');
      expect(
        leadSuccessMessageOrDefault('  ', linq),
        'Pronto! A LinQ Telecom vai falar com você pelo WhatsApp',
      );
      expect(
        leadSuccessBody('Pronto! A LinQ vai falar com você pelo WhatsApp'),
        'A LinQ vai falar com você pelo WhatsApp.',
      );
      expect(leadSuccessBody('Em breve a LinQ liga.'), 'Em breve a LinQ liga.');
      expect(leadSuccessBody('Pronto!'), '');
    });
  });

  group('cor da marca', () {
    test('lê #RRGGBB e recusa o resto', () {
      expect(parseBrandColorArgb('#5E1E7A'), 0xFF5E1E7A);
      expect(parseBrandColorArgb(' #0f62fe '), 0xFF0F62FE);
      expect(parseBrandColorArgb('5E1E7A'), isNull);
      expect(parseBrandColorArgb('#FFF'), isNull);
      expect(parseBrandColorArgb(null), isNull);
    });

    test('texto por cima escolhido pela luminância', () {
      const white = 0xFFFFFFFF;
      const ink = 0xFF050505;
      int pick(int bg) => pickForeground(bg, light: white, dark: ink);

      expect(pick(0xFF5E1E7A), white, reason: 'roxo da Fast');
      expect(pick(0xFF0F62FE), white, reason: 'azul da LinQ');
      expect(pick(0xFFFF6A1A), ink, reason: 'laranja da NexaGO');
      expect(pick(0xFFF4C543), ink, reason: 'amarelo');
      expect(relativeLuminance(white), closeTo(1, 0.0001));
      expect(contrastRatio(white, 0xFF000000), closeTo(21, 0.01));
    });
  });
}
