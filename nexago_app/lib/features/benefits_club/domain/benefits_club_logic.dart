/// Regras puras do Clube de Vantagens Nexa: quem vê o quê, código do atleta,
/// link rastreado e textos derivados. Espelham `functions/src/benefits-club.ts`
/// e `docs/product/vantagens-nexago-spec.md`.
library;

import '../../../core/search/search_keywords.dart';
import 'benefits_club_config.dart';
import 'partner.dart';

/// Papel `admin` no claim `roles` ou `superAdmin: true` no token — o mesmo
/// `callerFromAuth` do backend.
bool isAdminFromClaims(Map<String, dynamic>? claims) {
  final roles = claims?['roles'];
  if (roles is List && roles.contains('admin')) return true;
  return claims?['superAdmin'] == true;
}

/// Quem testa: admin ou uid em `appConfig/benefitsClub.testerUids`.
bool isTester({
  required String uid,
  required bool isAdmin,
  required BenefitsClubConfig config,
}) {
  if (isAdmin) return true;
  return uid.isNotEmpty && config.testerUids.contains(uid);
}

/// O card do Hub aparece com o clube ligado ou para quem testa.
bool hubCardVisible(BenefitsClubConfig config, {required bool tester}) =>
    config.enabled || tester;

/// Parceiros que o atleta vê: ativos, dentro da validade (`startsAt` /
/// `validUntil`), do público dele (`testers` só para quem testa) e da cidade
/// dele (lista de cidades vazia = todas; a comparação ignora acento e caixa).
/// Ordem: prioridade maior primeiro, depois nome.
List<Partner> visiblePartners(
  Iterable<Partner> partners, {
  required bool tester,
  String? athleteCity,
  DateTime? now,
}) {
  final city = normalizeSearchTerm(athleteCity ?? '');
  final at = now ?? DateTime.now();
  final visible =
      partners
          .where((p) => p.active)
          .where((p) => isWithinValidity(p, at))
          .where((p) => p.audience == PartnerAudience.all || tester)
          .where((p) => _servesCity(p, city))
          .toList()
        ..sort(comparePartners);
  return List.unmodifiable(visible);
}

/// Antes de `startsAt` o parceiro não aparece; a partir de `validUntil`, some.
bool isWithinValidity(Partner partner, DateTime now) {
  final starts = partner.startsAt;
  if (starts != null && now.isBefore(starts)) return false;
  final until = partner.validUntil;
  if (until != null && !now.isBefore(until)) return false;
  return true;
}

bool _servesCity(Partner partner, String normalizedCity) {
  if (partner.cities.isEmpty) return true;
  if (normalizedCity.isEmpty) return false;
  return partner.cities.any((c) => normalizeSearchTerm(c) == normalizedCity);
}

/// Prioridade desc, nome (sem acento/caixa) asc e, no empate, o id.
int comparePartners(Partner a, Partner b) {
  final byPriority = b.priority.compareTo(a.priority);
  if (byPriority != 0) return byPriority;
  final byName = normalizeSearchTerm(
    a.name,
  ).compareTo(normalizeSearchTerm(b.name));
  if (byName != 0) return byName;
  return a.id.compareTo(b.id);
}

/// O patrocinador do banner do topo: o primeiro master da lista já ordenada.
Partner? masterSponsor(List<Partner> visible) =>
    visible.where((p) => p.isMasterSponsor).firstOrNull;

/// Só as categorias que têm parceiro, na ordem do enum.
List<PartnerCategory> categoriesOf(List<Partner> visible) => List.unmodifiable(
  PartnerCategory.values.where(
    (category) => visible.any((p) => p.category == category),
  ),
);

/// Filtro local dos chips; `null` = Todos.
List<Partner> partnersInCategory(
  List<Partner> visible,
  PartnerCategory? category,
) {
  if (category == null) return visible;
  return List.unmodifiable(visible.where((p) => p.category == category));
}

/// Busca por id entre os visíveis; `null` = não existe ou não é para este
/// atleta (mesmo critério do backend, que recusa o evento).
Partner? partnerById(List<Partner> visible, String partnerId) =>
    visible.where((p) => p.id == partnerId).firstOrNull;

const String _athleteCodePrefix = 'NEXA-';
const int _athleteCodeLength = 4;

/// `NEXA-` + os 4 primeiros caracteres alfanuméricos do uid, em maiúsculas.
/// É o `ref` do link e o cupom por atleta — nunca o uid.
String athleteCode(String uid) {
  final chars = uid.replaceAll(RegExp(r'[^A-Za-z0-9]'), '');
  final head = chars.length > _athleteCodeLength
      ? chars.substring(0, _athleteCodeLength)
      : chars;
  return '$_athleteCodePrefix${head.toUpperCase()}';
}

/// Cupom que a tela mostra: nenhum, o fixo do parceiro ou o do atleta.
String? couponFor(Partner partner, String uid) => switch (partner.couponMode) {
  PartnerCouponMode.none => null,
  PartnerCouponMode.fixed => partner.couponCode,
  PartnerCouponMode.athlete => uid.trim().isEmpty ? null : athleteCode(uid),
};

/// O cupom do atleta só sai da `claimBenefit`: com requisito (cupom privado)
/// ou com desconto por elo (o cupom da faixa não está no doc público). Aí o
/// `couponCode` público nunca é mostrado como se fosse o dele.
bool couponViaClaim(Partner partner) =>
    !partner.requirement.isNone || partner.levelTiers.isNotEmpty;

/// O parceiro como o atleta do elo [rankCode] o vê: o selo e o título da
/// faixa dele (ou o benefício-base abaixo da primeira faixa) e a escada
/// completa em `levelLadder`. Sem faixas (ou já resolvido), volta igual.
Partner partnerForSandRank(Partner partner, String rankCode) {
  if (partner.levelTiers.isEmpty || partner.levelLadder != null) {
    return partner;
  }
  final base = PartnerLevelTier(
    minRank: sandRankCodes.first,
    benefitHighlight: partner.benefitHighlight,
    benefitTitle: partner.benefitTitle,
  );
  final current = levelTierFor(partner.levelTiers, rankCode) ?? base;
  return partner.withLevelBenefit(
    benefitHighlight: current.benefitHighlight,
    benefitTitle: current.benefitTitle,
    levelLadder: PartnerLevelLadder(
      rungs: List.unmodifiable([base, ...partner.levelTiers]),
      currentRank: current.minRank,
    ),
  );
}

/// UTMs do clube no app (`utm_medium=web` é do portal).
const Map<String, String> benefitsAppUtm = {
  'utm_source': 'nexago',
  'utm_medium': 'app',
  'utm_campaign': 'clube_vantagens',
};

/// Link do parceiro com as UTMs do clube e `ref=<código do atleta>`,
/// preservando a query e o fragmento que já existiam. Com [couponParam] e
/// [coupon], leva também `&<couponParam>=<cupom>` (o parceiro já recebe o
/// cupom aplicado). `null` quando o link não é https (o botão não abre nada
/// fora do padrão do backoffice).
String? trackedPartnerUrl(
  String? link,
  String code, {
  String? couponParam,
  String? coupon,
}) {
  final uri = Uri.tryParse(link?.trim() ?? '');
  if (uri == null || uri.scheme.toLowerCase() != 'https' || uri.host.isEmpty) {
    return null;
  }
  final param = couponParam?.trim() ?? '';
  final couponValue = coupon?.trim() ?? '';
  final params = <String, List<String>>{
    ...uri.queryParametersAll,
    for (final entry in benefitsAppUtm.entries) entry.key: [entry.value],
    if (code.isNotEmpty) 'ref': [code],
    if (param.isNotEmpty && couponValue.isNotEmpty) param: [couponValue],
  };
  return uri.replace(queryParameters: params).toString();
}

/// Os 3 passos de "Como usar": os do Firestore ou o padrão do tipo de botão.
List<String> howToUseSteps(Partner partner, {String? coupon}) {
  if (partner.howToUse.isNotEmpty) {
    return List.unmodifiable(partner.howToUse.take(3));
  }
  final name = _displayName(partner);
  return switch (partner.ctaType) {
    PartnerCtaType.link => [
      'Toque em ${partner.ctaLabel}. O site da $name abre já com o link '
          'da NexaGO.',
      'Monte o pedido normalmente.',
      coupon == null
          ? 'Finalize o pedido: o benefício vale pelo link da NexaGO.'
          : 'No fechamento, use o cupom $coupon.',
    ],
    PartnerCtaType.leadForm => [
      'Toque em ${partner.ctaLabel}.',
      'Confira seus dados e autorize o envio para a $name.',
      'A $name chama você no WhatsApp para fechar o plano.',
    ],
  };
}

/// Iniciais da logo quando o parceiro não tem imagem: duas palavras = a
/// primeira letra de cada ("Fast Açaí" → "FA"); uma palavra = as duas
/// primeiras letras.
String partnerInitials(String name) {
  final words = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty)
      .toList();
  if (words.isEmpty) return '?';
  if (words.length == 1) {
    final word = words.first;
    return (word.length > 2 ? word.substring(0, 2) : word).toUpperCase();
  }
  return '${words[0][0]}${words[1][0]}'.toUpperCase();
}

/// "Alimentação · Goiânia": a categoria e, se o parceiro é de cidades
/// específicas, a do atleta (ou a primeira da lista).
String partnerLocationLabel(Partner partner, {String? athleteCity}) {
  if (partner.cities.isEmpty) return partner.category.label;
  final city = normalizeSearchTerm(athleteCity ?? '');
  final match =
      partner.cities
          .where((c) => city.isNotEmpty && normalizeSearchTerm(c) == city)
          .firstOrNull ??
      partner.cities.first;
  return '${partner.category.label} · $match';
}

/// Rótulo da categoria no card da lista ("Serviços · Oficial" no master).
String partnerListCategoryLabel(Partner partner) => partner.isMasterSponsor
    ? '${partner.category.label} · Oficial'
    : partner.category.label;

/// "2 parceiros em Goiânia" (sem a cidade quando o perfil não tem).
String partnersCountLabel(int count, {String? city}) {
  final noun = count == 1 ? '1 parceiro' : '$count parceiros';
  final where = city?.trim() ?? '';
  return where.isEmpty ? noun : '$noun em $where';
}

/// O nome que os textos usam; o backend cai em "parceiro" sem nome.
String _displayName(Partner partner) =>
    partner.name.isEmpty ? 'parceiro' : partner.name;
