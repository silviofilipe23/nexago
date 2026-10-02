import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:nexago_app/features/organizer/domain/public_profile/organizer_profile_editor_logic.dart';

const _source = OrganizerProfileSource(
  orgName: 'Liga Amadora Goiânia',
  logoUrl: 'https://x/logo.jpg',
  coverUrl: 'https://x/cover.jpg',
  bio: 'Ligas de areia.',
  city: 'Goiânia',
  state: 'GO',
  contactPhone: '62999990000',
  publicWhatsapp: true,
  fallbackName: 'Ana Souza',
);

void main() {
  group('OrganizerProfileSource.fromUserDoc', () {
    test('lê organizerProfile e o nome de fallback', () {
      final source = OrganizerProfileSource.fromUserDoc({
        'displayName': ' Ana Souza ',
        'organizerProfile': {
          'orgName': 'Liga X',
          'logoUrl': 'https://x/logo.jpg',
          'coverUrl': '',
          'bio': ' Bio ',
          'city': 'Goiânia',
          'state': 'go',
          'contactPhone': '62999990000',
          'contactEmail': 'nao@importa.com',
          'publicWhatsapp': true,
        },
      });
      expect(source.orgName, 'Liga X');
      expect(source.logoUrl, 'https://x/logo.jpg');
      expect(source.coverUrl, isNull);
      expect(source.bio, 'Bio');
      expect(source.state, 'GO');
      expect(source.publicWhatsapp, isTrue);
      expect(source.fallbackName, 'Ana Souza');
      expect(source.displayName, 'Liga X');
    });

    test('sem organizerProfile: tudo vazio, nome de fallback', () {
      final source = OrganizerProfileSource.fromUserDoc({'fullName': 'Ana'});
      expect(source.orgName, '');
      expect(source.publicWhatsapp, isFalse);
      expect(source.displayName, 'Ana');
      expect(
          OrganizerProfileSource.fromUserDoc(null).displayName, 'Organizador');
    });
  });

  group('validateOrganizerProfileForm', () {
    final valid = OrganizerProfileForm.fromSource(_source);

    test('formulário do doc é válido', () {
      expect(validateOrganizerProfileForm(valid), isEmpty);
    });

    test('nome entre 2 e 60', () {
      expect(
        validateOrganizerProfileForm(valid.copyWith(orgName: ' A ')),
        {OrganizerProfileField.orgName: 'Use pelo menos 2 caracteres.'},
      );
      expect(
        validateOrganizerProfileForm(valid.copyWith(orgName: 'x' * 61)),
        {OrganizerProfileField.orgName: 'Use até 60 caracteres.'},
      );
      expect(
        validateOrganizerProfileForm(valid.copyWith(orgName: 'x' * 60)),
        isEmpty,
      );
    });

    test('bio até 280', () {
      expect(
        validateOrganizerProfileForm(valid.copyWith(bio: 'b' * 281)).keys,
        [OrganizerProfileField.bio],
      );
      expect(validateOrganizerProfileForm(valid.copyWith(bio: 'b' * 280)),
          isEmpty);
    });

    test('UF da lista fixa; vazia é permitida', () {
      expect(
        validateOrganizerProfileForm(valid.copyWith(state: 'XX')).keys,
        [OrganizerProfileField.state],
      );
      expect(
          validateOrganizerProfileForm(valid.copyWith(state: 'sp')), isEmpty);
      expect(validateOrganizerProfileForm(valid.copyWith(state: '')), isEmpty);
    });

    test('telefone com DDD, 10 ou 11 dígitos; vazio é permitido', () {
      expect(
        validateOrganizerProfileForm(valid.copyWith(contactPhone: '9999')).keys,
        [OrganizerProfileField.contactPhone],
      );
      expect(
        validateOrganizerProfileForm(
          valid.copyWith(contactPhone: '(62) 3333-4444'),
        ),
        isEmpty,
      );
      expect(validateOrganizerProfileForm(valid.copyWith(contactPhone: '')),
          isEmpty);
    });
  });

  group('telefone', () {
    test('só dígitos, sem o DDI 55', () {
      expect(organizerPhoneDigits('(62) 99999-0000'), '62999990000');
      expect(organizerPhoneDigits('+55 62 99999-0000'), '62999990000');
      expect(organizerPhoneDigits('5562999990000'), '62999990000');
      expect(organizerPhoneDigits(''), '');
    });

    test('switch do WhatsApp só com telefone válido', () {
      final form = OrganizerProfileForm.fromSource(_source);
      expect(organizerWhatsappSwitchEnabled(form), isTrue);
      expect(
        organizerWhatsappSwitchEnabled(form.copyWith(contactPhone: '')),
        isFalse,
      );
      expect(
        organizerWhatsappSwitchEnabled(form.copyWith(contactPhone: '123')),
        isFalse,
      );
    });
  });

  group('buildOrganizerProfileUpdate', () {
    final unchanged = OrganizerProfileForm.fromSource(_source);

    test('nada mudou: payload vazio', () {
      expect(
        buildOrganizerProfileUpdate(source: _source, form: unchanged),
        isEmpty,
      );
    });

    test('só os campos alterados, por caminho pontilhado', () {
      final update = buildOrganizerProfileUpdate(
        source: _source,
        form: unchanged.copyWith(bio: '  Nova bio  ', city: 'Anápolis'),
      );
      expect(update, {
        'organizerProfile.bio': 'Nova bio',
        'organizerProfile.city': 'Anápolis',
      });
      // Nunca o mapa inteiro.
      expect(update.containsKey('organizerProfile'), isFalse);
      expect(
        update.keys.every((k) => k.startsWith('organizerProfile.')),
        isTrue,
      );
    });

    test('todos os campos da tela, quando todos mudam', () {
      final update = buildOrganizerProfileUpdate(
        source: _source,
        form: const OrganizerProfileForm(
          orgName: 'Circuito Praia',
          bio: '',
          city: 'Santos',
          state: 'sp',
          contactPhone: '(13) 98888-7777',
          publicWhatsapp: false,
        ),
        newLogoUrl: 'https://x/novo-logo.jpg',
        newCoverUrl: 'https://x/nova-capa.jpg',
      );
      expect(update, {
        'organizerProfile.orgName': 'Circuito Praia',
        'organizerProfile.bio': '',
        'organizerProfile.city': 'Santos',
        'organizerProfile.state': 'SP',
        'organizerProfile.contactPhone': '13988887777',
        'organizerProfile.publicWhatsapp': false,
        'organizerProfile.logoUrl': 'https://x/novo-logo.jpg',
        'organizerProfile.coverUrl': 'https://x/nova-capa.jpg',
      });
    });

    test('remover a capa = FieldValue.delete()', () {
      final update = buildOrganizerProfileUpdate(
        source: _source,
        form: unchanged,
        removeCover: true,
      );
      expect(update, {'organizerProfile.coverUrl': FieldValue.delete()});
    });

    test('remover capa que não existe não grava nada', () {
      final update = buildOrganizerProfileUpdate(
        source: const OrganizerProfileSource(orgName: 'Liga'),
        form: OrganizerProfileForm.fromSource(
          const OrganizerProfileSource(orgName: 'Liga'),
        ),
        removeCover: true,
      );
      expect(update, isEmpty);
    });

    test('sem orgName: o nome de fallback intocado não é gravado', () {
      const source = OrganizerProfileSource(fallbackName: 'Ana Souza');
      final form = OrganizerProfileForm.fromSource(source);
      expect(form.orgName, 'Ana Souza');
      expect(buildOrganizerProfileUpdate(source: source, form: form), isEmpty);
      expect(
        buildOrganizerProfileUpdate(
          source: source,
          form: form.copyWith(orgName: 'Ana Eventos'),
        ),
        {'organizerProfile.orgName': 'Ana Eventos'},
      );
    });

    test('WhatsApp público desliga junto com o telefone', () {
      final update = buildOrganizerProfileUpdate(
        source: _source,
        form: unchanged.copyWith(contactPhone: ''),
      );
      expect(update, {
        'organizerProfile.contactPhone': '',
        'organizerProfile.publicWhatsapp': false,
      });
    });

    test('ligar o WhatsApp sem telefone não grava true', () {
      const source = OrganizerProfileSource(orgName: 'Liga');
      final update = buildOrganizerProfileUpdate(
        source: source,
        form: OrganizerProfileForm.fromSource(
          source,
        ).copyWith(publicWhatsapp: true),
      );
      expect(update, isEmpty);
    });

    test('telefone com máscara igual ao gravado não regrava', () {
      final update = buildOrganizerProfileUpdate(
        source: _source,
        form: unchanged.copyWith(contactPhone: '(62) 99999-0000'),
      );
      expect(update, isEmpty);
    });
  });

  group('imagens', () {
    test('limite de 5 MB', () {
      expect(validateOrganizerImageSize(5 * 1024 * 1024), isNull);
      expect(
        validateOrganizerImageSize(5 * 1024 * 1024 + 1),
        'Imagem muito grande (máximo 5 MB).',
      );
      expect(validateOrganizerImageSize(0), isNotNull);
    });

    test('redimensiona para 1600 px de largura em JPEG', () {
      final png = Uint8List.fromList(
        img.encodePng(img.Image(width: 2000, height: 500)),
      );
      final out = resizeOrganizerImageJpeg(png);
      final decoded = img.decodeJpg(out)!;
      expect(decoded.width, 1600);
      expect(decoded.height, 400);
    });

    test('imagem menor fica do tamanho que veio (só vira JPEG)', () {
      final png = Uint8List.fromList(
        img.encodePng(img.Image(width: 300, height: 300)),
      );
      final decoded = img.decodeJpg(resizeOrganizerImageJpeg(png))!;
      expect(decoded.width, 300);
    });

    test('bytes que não são imagem lançam FormatException', () {
      expect(
        () => resizeOrganizerImageJpeg(Uint8List.fromList([1, 2, 3])),
        throwsFormatException,
      );
    });
  });
}
