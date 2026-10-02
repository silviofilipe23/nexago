import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:image/image.dart' as img;

import '../../../../core/location/br_locations_data.dart';
import '../../../../core/text/safe_display_text.dart';

/// Editor do perfil público no modo organizador — spec
/// `docs/superpowers/specs/2026-10-02-organizer-public-profile-design.md`, "Edição pelo
/// organizador". A origem é `users/{uid}.organizerProfile`; a Cloud Function projeta dali o
/// `organizerPublicProfiles/{uid}`.

const int kOrganizerNameMinLength = 2;
const int kOrganizerNameMaxLength = 60;
const int kOrganizerBioMaxLength = 280;
const int kOrganizerImageMaxBytes = 5 * 1024 * 1024;
const int kOrganizerImageMaxWidth = 1600;

/// Prefixo dos caminhos pontilhados: o resto do mapa `organizerProfile` nunca é reenviado.
const String kOrganizerProfileFieldPrefix = 'organizerProfile.';

/// O que está gravado em `users/{uid}` e importa ao editor.
class OrganizerProfileSource {
  const OrganizerProfileSource({
    this.orgName = '',
    this.logoUrl,
    this.coverUrl,
    this.bio = '',
    this.city = '',
    this.state = '',
    this.contactPhone = '',
    this.publicWhatsapp = false,
    this.fallbackName = '',
  });

  final String orgName;
  final String? logoUrl;
  final String? coverUrl;
  final String bio;
  final String city;
  final String state;

  /// Como gravado (o painel grava só dígitos, com DDD).
  final String contactPhone;
  final bool publicWhatsapp;

  /// Nome que o perfil público usa sem `orgName` (mesma cadeia do backend).
  final String fallbackName;

  /// Nome que o atleta vê hoje — a projeção do backend: `orgName → displayName → fullName →
  /// name → "Organizador"`, cortado em 60 e aparado.
  String get displayName {
    final raw = orgName.isNotEmpty
        ? orgName
        : (fallbackName.isNotEmpty ? fallbackName : 'Organizador');
    return organizerNameCap(raw);
  }

  static OrganizerProfileSource fromUserDoc(Map<String, dynamic>? data) {
    if (data == null) return const OrganizerProfileSource();
    final raw = data['organizerProfile'];
    final profile = raw is Map ? raw : const {};
    String text(Object? v) => v is String ? v.trim() : '';
    String? url(Object? v) => text(v).isEmpty ? null : text(v);
    final fallback = [
      text(data['displayName']),
      text(data['fullName']),
      text(data['name']),
    ].firstWhere((v) => v.isNotEmpty, orElse: () => '');
    return OrganizerProfileSource(
      orgName: text(profile['orgName']),
      logoUrl: url(profile['logoUrl']),
      coverUrl: url(profile['coverUrl']),
      bio: text(profile['bio']),
      city: text(profile['city']),
      state: text(profile['state']).toUpperCase(),
      contactPhone: text(profile['contactPhone']),
      publicWhatsapp: profile['publicWhatsapp'] == true,
      fallbackName: fallback,
    );
  }
}

/// Corta em [kOrganizerNameMaxLength] unidades e apara, como o backend (`slice(0, 60).trim()`).
/// Um emoji partido no corte é descartado em vez de virar caractere inválido.
String organizerNameCap(String name) {
  final trimmed = name.trim();
  if (trimmed.length <= kOrganizerNameMaxLength) return trimmed;
  return sanitizeUtf16(trimmed.substring(0, kOrganizerNameMaxLength)).trim();
}

/// Aplica um payload de [buildOrganizerProfileUpdate] (ou de imagem) sobre a origem: é o que o
/// doc passa a ter depois do `update()`. `FieldValue.delete()` vira ausente.
OrganizerProfileSource applyOrganizerProfileUpdate(
  OrganizerProfileSource source,
  Map<String, Object> update,
) {
  const p = kOrganizerProfileFieldPrefix;
  bool has(String field) => update.containsKey('$p$field');
  String text(String field, String current) {
    if (!has(field)) return current;
    final value = update['$p$field'];
    return value is String ? value : '';
  }

  String? url(String field, String? current) {
    if (!has(field)) return current;
    final value = update['$p$field'];
    return value is String && value.isNotEmpty ? value : null;
  }

  return OrganizerProfileSource(
    orgName: text('orgName', source.orgName),
    logoUrl: url('logoUrl', source.logoUrl),
    coverUrl: url('coverUrl', source.coverUrl),
    bio: text('bio', source.bio),
    city: text('city', source.city),
    state: text('state', source.state),
    contactPhone: text('contactPhone', source.contactPhone),
    publicWhatsapp: has('publicWhatsapp')
        ? update['${p}publicWhatsapp'] == true
        : source.publicWhatsapp,
    fallbackName: source.fallbackName,
  );
}

/// Valores da tela.
class OrganizerProfileForm {
  const OrganizerProfileForm({
    required this.orgName,
    required this.bio,
    required this.city,
    required this.state,
    required this.contactPhone,
    required this.publicWhatsapp,
  });

  /// O campo de nome nasce com o nome que o atleta já vê (marca ou, sem ela, o do usuário).
  factory OrganizerProfileForm.fromSource(OrganizerProfileSource source) {
    return OrganizerProfileForm(
      orgName: source.displayName,
      bio: source.bio,
      city: source.city,
      state: source.state,
      contactPhone: organizerPhoneDigits(source.contactPhone),
      publicWhatsapp: source.publicWhatsapp,
    );
  }

  final String orgName;
  final String bio;
  final String city;
  final String state;
  final String contactPhone;
  final bool publicWhatsapp;

  OrganizerProfileForm copyWith({
    String? orgName,
    String? bio,
    String? city,
    String? state,
    String? contactPhone,
    bool? publicWhatsapp,
  }) {
    return OrganizerProfileForm(
      orgName: orgName ?? this.orgName,
      bio: bio ?? this.bio,
      city: city ?? this.city,
      state: state ?? this.state,
      contactPhone: contactPhone ?? this.contactPhone,
      publicWhatsapp: publicWhatsapp ?? this.publicWhatsapp,
    );
  }
}

/// Só dígitos, com DDD. Quem digita o DDI (`+55 62 9…`) tem o 55 tirado: o servidor o põe de
/// volta para o `wa.me`.
String organizerPhoneDigits(String raw) {
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  if (digits.startsWith('55') && (digits.length == 12 || digits.length == 13)) {
    return digits.substring(2);
  }
  return digits;
}

/// DDD + 8 ou 9 dígitos.
bool organizerPhoneIsValid(String raw) {
  final digits = organizerPhoneDigits(raw);
  return digits.length == 10 || digits.length == 11;
}

/// O switch do WhatsApp público só liga com telefone válido.
bool organizerWhatsappSwitchEnabled(OrganizerProfileForm form) =>
    organizerPhoneIsValid(form.contactPhone);

enum OrganizerProfileField { orgName, bio, state, contactPhone }

/// Erros por campo (vazio = válido).
///
/// Com [baseline], o nome intocado não é validado: ele não vai no payload, então não pode
/// barrar o save de outro campo (ex.: o fallback "A" de quem nunca preencheu a marca).
Map<OrganizerProfileField, String> validateOrganizerProfileForm(
  OrganizerProfileForm form, {
  OrganizerProfileSource? baseline,
}) {
  final errors = <OrganizerProfileField, String>{};
  final name = form.orgName.trim();
  final nameUntouched =
      baseline != null &&
      name == OrganizerProfileForm.fromSource(baseline).orgName.trim();
  if (nameUntouched) {
    // Não vai ser gravado.
  } else if (name.length < kOrganizerNameMinLength) {
    errors[OrganizerProfileField.orgName] =
        'Use pelo menos $kOrganizerNameMinLength caracteres.';
  } else if (name.length > kOrganizerNameMaxLength) {
    errors[OrganizerProfileField.orgName] =
        'Use até $kOrganizerNameMaxLength caracteres.';
  }
  if (form.bio.trim().length > kOrganizerBioMaxLength) {
    errors[OrganizerProfileField.bio] =
        'A bio tem no máximo $kOrganizerBioMaxLength caracteres.';
  }
  final state = form.state.trim().toUpperCase();
  if (state.isNotEmpty &&
      !BrLocationsData.states.any((uf) => uf.sigla == state)) {
    errors[OrganizerProfileField.state] = 'Escolha uma UF da lista.';
  }
  final phone = organizerPhoneDigits(form.contactPhone);
  if (phone.isNotEmpty && !organizerPhoneIsValid(phone)) {
    errors[OrganizerProfileField.contactPhone] =
        'Informe o telefone com DDD (10 ou 11 dígitos).';
  }
  return errors;
}

/// Payload do `update()` em `users/{uid}`: só os campos desta tela que mudaram, cada um pelo
/// caminho pontilhado. Nunca o mapa inteiro — reenviar campo que não mudou é o que derruba o
/// save inteiro quando alguma rule congela um deles.
///
/// [newLogoUrl]/[newCoverUrl] são as URLs das imagens recém-enviadas; [removeCover] apaga a
/// capa com `FieldValue.delete()`.
Map<String, Object> buildOrganizerProfileUpdate({
  required OrganizerProfileSource source,
  required OrganizerProfileForm form,
  String? newLogoUrl,
  String? newCoverUrl,
  bool removeCover = false,
}) {
  const p = kOrganizerProfileFieldPrefix;
  final update = <String, Object>{};

  final name = form.orgName.trim();
  // O campo nasce com o nome que o atleta vê (sem `orgName`, o de fallback): intocado, não é
  // gravado — nem vira `orgName` sem o organizador mexer.
  final prefill = OrganizerProfileForm.fromSource(source).orgName.trim();
  if (name != source.orgName && name != prefill) {
    update['${p}orgName'] = name;
  }

  final bio = form.bio.trim();
  if (bio != source.bio) update['${p}bio'] = bio;

  final city = form.city.trim();
  if (city != source.city) update['${p}city'] = city;

  final state = form.state.trim().toUpperCase();
  if (state != source.state) update['${p}state'] = state;

  final phone = organizerPhoneDigits(form.contactPhone);
  if (phone != organizerPhoneDigits(source.contactPhone)) {
    update['${p}contactPhone'] = phone;
  }

  // Sem telefone válido o botão público não pode ficar ligado.
  final publicWhatsapp = form.publicWhatsapp && organizerPhoneIsValid(phone);
  if (publicWhatsapp != source.publicWhatsapp) {
    update['${p}publicWhatsapp'] = publicWhatsapp;
  }

  final logo = newLogoUrl?.trim() ?? '';
  if (logo.isNotEmpty) update['${p}logoUrl'] = logo;

  final cover = newCoverUrl?.trim() ?? '';
  if (cover.isNotEmpty) {
    update['${p}coverUrl'] = cover;
  } else if (removeCover && source.coverUrl != null) {
    update['${p}coverUrl'] = FieldValue.delete();
  }

  return update;
}

/// `null` = cabe. Vale sobre o arquivo entregue pelo seletor de imagem.
String? validateOrganizerImageSize(int bytes) {
  if (bytes <= 0) return 'Não foi possível ler a imagem.';
  if (bytes > kOrganizerImageMaxBytes) {
    return 'Imagem muito grande (máximo 5 MB).';
  }
  return null;
}

/// Reduz para no máximo [maxWidth] px de largura e regrava em JPEG. Lança [FormatException]
/// quando os bytes não são uma imagem legível.
Uint8List resizeOrganizerImageJpeg(
  Uint8List bytes, {
  int maxWidth = kOrganizerImageMaxWidth,
}) {
  img.Image? decoded;
  try {
    decoded = img.decodeImage(bytes);
  } catch (_) {
    // O decodificador lança RangeError e afins em lixo; para quem chama é tudo "não é imagem".
    decoded = null;
  }
  if (decoded == null) {
    throw const FormatException('Formato de imagem não suportado.');
  }
  final output = decoded.width > maxWidth
      ? img.copyResize(
          decoded,
          width: maxWidth,
          interpolation: img.Interpolation.linear,
        )
      : decoded;
  return Uint8List.fromList(img.encodeJpg(output, quality: 85));
}
