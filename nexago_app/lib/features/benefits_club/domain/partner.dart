/// Parceiro do Clube de Vantagens Nexa (`partners/{partnerId}`), conforme
/// `docs/product/vantagens-nexago-spec.md`. Parceiro novo entra só pelo
/// Firestore (ou pelo backoffice), sem atualizar o app: por isso a leitura é
/// tolerante a campo faltando ou com tipo errado.
library;

import 'partner_extras.dart';

export 'partner_extras.dart';

/// Categoria do parceiro. A ordem do enum é a ordem dos chips da tela do clube.
enum PartnerCategory {
  food('food', 'Alimentação'),
  sports('sports', 'Artigos esportivos'),
  health('health', 'Saúde e bem-estar'),
  services('services', 'Serviços'),
  leisure('leisure', 'Lazer'),
  other('other', 'Outros');

  const PartnerCategory(this.key, this.label);

  final String key;
  final String label;

  static PartnerCategory fromKey(Object? raw) {
    for (final category in values) {
      if (category.key == raw) return category;
    }
    return PartnerCategory.other;
  }
}

/// O que o botão do pé da tela do parceiro faz.
enum PartnerCtaType {
  /// Abre o site do parceiro fora do app, com as UTMs da NexaGO.
  link('link'),

  /// Abre o formulário "Quero contratar" (lead com consentimento).
  leadForm('lead_form');

  const PartnerCtaType(this.key);

  final String key;

  static PartnerCtaType fromKey(Object? raw) =>
      raw == leadForm.key ? leadForm : link;
}

/// Como o cupom é mostrado: nenhum, um código fixo (NEXAGO10) ou o código do
/// atleta (NEXA-XXXX).
enum PartnerCouponMode {
  none('none'),
  fixed('fixed'),
  athlete('athlete');

  const PartnerCouponMode(this.key);

  final String key;

  static PartnerCouponMode fromKey(Object? raw) {
    for (final mode in values) {
      if (mode.key == raw) return mode;
    }
    return PartnerCouponMode.none;
  }
}

/// Quem vê o parceiro. Só `testers` restringe (mesma regra do backend:
/// `partnerVisibleTo` em `functions/src/benefits-club.ts`).
enum PartnerAudience {
  all('all'),
  testers('testers');

  const PartnerAudience(this.key);

  final String key;

  static PartnerAudience fromKey(Object? raw) =>
      raw == testers.key ? testers : all;
}

class Partner {
  const Partner({
    required this.id,
    required this.name,
    this.logoUrl,
    this.category = PartnerCategory.other,
    this.benefitHighlight = '',
    this.benefitTitle = '',
    this.description = '',
    this.howToUse = const [],
    this.terms = '',
    this.ctaType = PartnerCtaType.link,
    this.ctaLabel = '',
    this.link,
    this.couponMode = PartnerCouponMode.none,
    this.couponCode,
    this.brandColor,
    this.cities = const [],
    this.isMasterSponsor = false,
    this.priority = 0,
    this.active = false,
    this.audience = PartnerAudience.all,
    this.leadConsentText,
    this.leadSuccessMessage,
    this.coverUrl,
    this.startsAt,
    this.validUntil,
    this.createdAt,
    this.featured = false,
    this.placements = const [],
    this.couponUrlParam,
    this.termsTags = const [],
    this.locations = const [],
    this.requirement = PartnerRequirement.none,
    this.requirementLabel,
  });

  /// Lê o doc sem confiar em nenhum campo: ausente ou com tipo errado vira o
  /// padrão. `active` só vale `true` explícito, como no backend.
  factory Partner.fromFirestore(String id, Map<String, dynamic>? data) {
    final d = data ?? const <String, dynamic>{};
    return Partner(
      id: id,
      name: _text(d['name']),
      logoUrl: _textOrNull(d['logoUrl']),
      category: PartnerCategory.fromKey(d['category']),
      benefitHighlight: _text(d['benefitHighlight']),
      benefitTitle: _text(d['benefitTitle']),
      description: _text(d['description']),
      howToUse: _texts(d['howToUse']),
      terms: _text(d['terms']),
      ctaType: PartnerCtaType.fromKey(d['ctaType']),
      ctaLabel: _text(d['ctaLabel']),
      link: _textOrNull(d['link']),
      couponMode: PartnerCouponMode.fromKey(d['couponMode']),
      couponCode: _textOrNull(d['couponCode']),
      brandColor: _textOrNull(d['brandColor']),
      cities: _texts(d['cities']),
      isMasterSponsor: d['isMasterSponsor'] == true,
      priority: d['priority'] is num ? (d['priority'] as num).toDouble() : 0,
      active: d['active'] == true,
      audience: PartnerAudience.fromKey(d['audience']),
      leadConsentText: _textOrNull(d['leadConsentText']),
      leadSuccessMessage: _textOrNull(d['leadSuccessMessage']),
      coverUrl: _httpsOrNull(d['coverUrl']),
      startsAt: readPartnerDate(d['startsAt']),
      validUntil: readPartnerDate(d['validUntil']),
      createdAt: readPartnerDate(d['createdAt']),
      featured: d['featured'] == true,
      placements: readPartnerEnumList(
        d['placements'],
        PartnerPlacement.fromKey,
      ),
      couponUrlParam: _couponParamOrNull(d['couponUrlParam']),
      termsTags: readPartnerEnumList(d['termsTags'], PartnerTermsTag.fromKey),
      locations: readPartnerLocations(d['locations']),
      requirement: PartnerRequirement.fromMap(d['requirement']),
      requirementLabel: _textOrNull(d['requirementLabel']),
    );
  }

  final String id;
  final String name;
  final String? logoUrl;
  final PartnerCategory category;

  /// Selo curto: "10% OFF".
  final String benefitHighlight;

  /// "10% de desconto em todo pedido".
  final String benefitTitle;
  final String description;

  /// Até 3 passos; vazio usa o padrão do tipo de botão.
  final List<String> howToUse;
  final String terms;
  final PartnerCtaType ctaType;
  final String ctaLabel;
  final String? link;
  final PartnerCouponMode couponMode;
  final String? couponCode;

  /// `#RRGGBB` como veio do Firestore; a tela cai no laranja da marca quando
  /// não dá para ler.
  final String? brandColor;

  /// Vazio = todas as cidades.
  final List<String> cities;
  final bool isMasterSponsor;
  final double priority;
  final bool active;
  final PartnerAudience audience;
  final String? leadConsentText;
  final String? leadSuccessMessage;

  /// Foto de capa 16:9 (só https).
  final String? coverUrl;

  /// Antes disso o parceiro não aparece.
  final DateTime? startsAt;

  /// Depois disso some; nos 7 dias antes mostra "Termina em N dias".
  final DateTime? validUntil;

  /// Gravado pelo backoffice; "Novo" nos primeiros 14 dias.
  final DateTime? createdAt;

  /// Candidato ao "Destaque da semana".
  final bool featured;

  /// Onde mais o benefício aparece (pós-jogo, dia de torneio).
  final List<PartnerPlacement> placements;

  /// Se definido, o link leva `&<param>=<cupom>`.
  final String? couponUrlParam;
  final List<PartnerTermsTag> termsTags;
  final List<PartnerLocation> locations;

  /// Quem pode usar; com requisito o `couponCode` público vem `null` e o
  /// cupom sai da callable `claimBenefit`.
  final PartnerRequirement requirement;

  /// Frase do bloqueio ("Exclusivo para embaixadores do Squad").
  final String? requirementLabel;
}

String _text(Object? value) => value is String ? value.trim() : '';

String? _textOrNull(Object? value) {
  final text = _text(value);
  return text.isEmpty ? null : text;
}

String? _httpsOrNull(Object? value) {
  final text = _text(value);
  final uri = Uri.tryParse(text);
  if (uri == null || uri.scheme.toLowerCase() != 'https' || uri.host.isEmpty) {
    return null;
  }
  return text;
}

final RegExp _couponParamPattern = RegExp(r'^[A-Za-z0-9_]{1,30}$');

String? _couponParamOrNull(Object? value) {
  final text = _text(value);
  return _couponParamPattern.hasMatch(text) ? text : null;
}

List<String> _texts(Object? value) {
  if (value is! List) return const [];
  return List.unmodifiable(value.map(_text).where((item) => item.isNotEmpty));
}
