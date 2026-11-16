/// Regras puras da versão premium do clube: selos de validade, destaque,
/// momento do jogo, busca, distância, bloqueio por requisito e os textos da
/// carteirinha e de "Meus benefícios". Espelham a seção "Versão premium (v2)"
/// de `docs/product/vantagens-nexago-spec.md`.
library;

import '../../../core/location/geo_distance.dart';
import '../../../core/search/search_keywords.dart';
import '../../athlete/domain/athlete_firestore_codes.dart';
import 'my_benefits.dart';
import 'partner.dart';

/// Busca, "Perto de você" e Lista|Mapa só aparecem com esta quantidade de
/// parceiros visíveis (nada de recurso de descoberta num catálogo curto).
const int benefitsDiscoveryMinPartners = 8;

/// "Termina em N dias" aparece nos últimos 7 dias da validade.
const int benefitsEndingSoonDays = 7;

/// "Novo" nos primeiros 14 dias depois do cadastro.
const int benefitsNewPartnerDays = 14;

bool discoveryEnabled(int visibleCount) =>
    visibleCount >= benefitsDiscoveryMinPartners;

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

/// "Termina hoje" / "Termina em 1 dia" / "Termina em N dias" nos últimos
/// [benefitsEndingSoonDays] dias; `null` fora disso ou sem `validUntil`.
/// A conta é por dia do calendário, no fuso do aparelho.
String? endingBadge(Partner partner, DateTime now) {
  final until = partner.validUntil;
  if (until == null || !now.isBefore(until)) return null;
  final days = _day(until.toLocal()).difference(_day(now.toLocal())).inDays;
  if (days > benefitsEndingSoonDays) return null;
  if (days <= 0) return 'Termina hoje';
  return days == 1 ? 'Termina em 1 dia' : 'Termina em $days dias';
}

/// "Novo" = `createdAt` nos últimos [benefitsNewPartnerDays] dias.
bool isNewPartner(Partner partner, DateTime now) {
  final created = partner.createdAt;
  if (created == null || created.isAfter(now)) return false;
  return now.difference(created).inDays < benefitsNewPartnerDays;
}

/// "Destaque da semana": o `featured` de maior prioridade (a lista já vem
/// ordenada por prioridade).
Partner? featuredPartner(List<Partner> visible) =>
    visible.where((p) => p.featured).firstOrNull;

/// Parceiro com requisito que a pessoa não cumpre (ou cujo resultado ainda
/// não chegou: sem a resposta do servidor, fica bloqueado).
bool isPartnerLocked(Partner partner, Set<String>? eligiblePartnerIds) {
  if (partner.requirement.isNone) return false;
  return !(eligiblePartnerIds?.contains(partner.id) ?? false);
}

/// Frase do bloqueio: o `requirementLabel` do parceiro ou o padrão por tipo
/// (mesmo texto de `requirementDeniedMessage` no backend).
String requirementText(Partner partner) {
  final label = partner.requirementLabel;
  if (label != null && label.isNotEmpty) return label;
  final req = partner.requirement;
  return switch (req.type) {
    PartnerRequirementType.squad => 'Exclusivo para embaixadores do Squad.',
    PartnerRequirementType.tournament => 'Exclusivo para inscritos do torneio.',
    PartnerRequirementType.minLevel =>
      'Exclusivo para atletas a partir do nível '
          '${_levelLabel(req.minLevel)}.',
    PartnerRequirementType.none =>
      'Este benefício não está disponível para você.',
  };
}

String _levelLabel(String? code) {
  final label = AthleteFirestoreCodes.levelFirestoreToLabel(code);
  return label.isEmpty ? 'mínimo' : label;
}

/// Selo curto do hero de um parceiro bloqueado ("Exclusivo Squad").
String requirementBadge(Partner partner) => switch (partner.requirement.type) {
  PartnerRequirementType.squad => 'Exclusivo Squad',
  PartnerRequirementType.tournament => 'Exclusivo inscritos',
  PartnerRequirementType.minLevel =>
    'A partir de ${_levelLabel(partner.requirement.minLevel)}',
  PartnerRequirementType.none => 'Exclusivo',
};

/// Parceiro do card "Bateu a fome?" no pós-jogo ou no dia de torneio: o
/// visível de maior prioridade com aquele `placement`. Parceiro com
/// requisito fica de fora (o card não pode oferecer o que a pessoa talvez
/// não possa usar). A lista visível já filtra cidade, público e validade.
Partner? gameMomentPartner(List<Partner> visible, PartnerPlacement placement) =>
    visible
        .where((p) => p.placements.contains(placement))
        .where((p) => p.requirement.isNone)
        .firstOrNull;

/// Título do card do momento do jogo: "Bateu a fome?" é do desenho e só
/// faz sentido para comida; os outros parceiros levam um título neutro.
String gameMomentTitle(Partner partner) =>
    partner.category == PartnerCategory.food
    ? 'Bateu a fome?'
    : 'Vantagem do clube';

/// "10% OFF na Fast Açaí" (sem o selo, o título do benefício).
String gameMomentLine(Partner partner) {
  final highlight = partner.benefitHighlight.isNotEmpty
      ? partner.benefitHighlight
      : partner.benefitTitle;
  return '$highlight na ${partner.name}';
}

/// Busca por nome, categoria e benefício, sem acento nem caixa. Cada palavra
/// da busca precisa aparecer em algum campo.
bool partnerMatchesQuery(Partner partner, String query) {
  final tokens = query
      .trim()
      .split(RegExp(r'\s+'))
      .map(normalizeSearchTerm)
      .where((t) => t.isNotEmpty)
      .toList();
  if (tokens.isEmpty) return true;
  final fields = [
    partner.name,
    partner.category.label,
    partner.benefitHighlight,
    partner.benefitTitle,
  ].map(normalizeSearchTerm).toList();
  return tokens.every((t) => fields.any((f) => f.contains(t)));
}

List<Partner> searchPartners(List<Partner> partners, String query) =>
    List.unmodifiable(partners.where((p) => partnerMatchesQuery(p, query)));

/// Distância até uma unidade, em km.
double distanceToLocationKm(PartnerLocation location, double lat, double lng) =>
    haversineDistanceKm(
      lat1: lat,
      lon1: lng,
      lat2: location.latitude,
      lon2: location.longitude,
    );

/// Distância até a unidade mais perto, em km; `null` sem unidade.
double? nearestDistanceKm(Partner partner, double lat, double lng) {
  double? best;
  for (final location in partner.locations) {
    final km = distanceToLocationKm(location, lat, lng);
    if (best == null || km < best) best = km;
  }
  return best;
}

/// Mais perto primeiro; quem não tem unidade vai para o fim, na ordem que
/// já estava (prioridade).
List<Partner> sortByDistance(List<Partner> partners, double lat, double lng) {
  final indexed = [
    for (var i = 0; i < partners.length; i++)
      (i: i, p: partners[i], km: nearestDistanceKm(partners[i], lat, lng)),
  ];
  indexed.sort((a, b) {
    final ka = a.km;
    final kb = b.km;
    if (ka == null && kb == null) return a.i.compareTo(b.i);
    if (ka == null) return 1;
    if (kb == null) return -1;
    final byKm = ka.compareTo(kb);
    return byKm != 0 ? byKm : a.i.compareTo(b.i);
  });
  return List.unmodifiable(indexed.map((e) => e.p));
}

/// "850 m" abaixo de 1 km; "1,2 km" até 10 km; "12 km" acima.
String formatDistanceKm(double km) {
  if (km < 1) return '${(km * 1000).round()} m';
  if (km < 10) return '${km.toStringAsFixed(1).replaceAll('.', ',')} km';
  return '${km.round()} km';
}

const List<String> _monthsShort = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/// "Membro desde mar/2025".
String memberSinceLabel(DateTime date) {
  final local = date.toLocal();
  return 'Membro desde ${_monthsShort[local.month - 1]}/${local.year}';
}

/// "Beach Tennis · Intermediário 2" (o que existir).
String memberSportLevelLabel({required String sport, required String level}) =>
    [sport.trim(), level.trim()].where((s) => s.isNotEmpty).join(' · ');

/// Iniciais da pessoa ("Marina Costa" → "MC").
String memberInitials(String name) {
  final words = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty)
      .toList();
  if (words.isEmpty) return '?';
  if (words.length == 1) return words.first[0].toUpperCase();
  return '${words.first[0]}${words.last[0]}'.toUpperCase();
}

String _ddmm(DateTime date) {
  final local = date.toLocal();
  final dd = local.day.toString().padLeft(2, '0');
  final mm = local.month.toString().padLeft(2, '0');
  return '$dd/$mm';
}

/// "Usado 3 vezes · último em 12/11" (lead: "Contato enviado em 12/11").
String benefitUseLabel(BenefitUse use, {required bool isLead}) {
  final last = use.lastUsedAt;
  if (isLead) {
    return last == null
        ? 'Contato enviado'
        : 'Contato enviado em ${_ddmm(last)}';
  }
  final times = use.useCount == 1 ? '1 vez' : '${use.useCount} vezes';
  return last == null
      ? 'Usado $times'
      : 'Usado $times · último em ${_ddmm(last)}';
}

/// Status da resposta: "Deu certo", "Não deu certo" ou "Sem resposta".
String benefitAnswerLabel(BenefitUseAnswer? answer) => switch (answer) {
  BenefitUseAnswer.used => 'Deu certo',
  BenefitUseAnswer.notUsed => 'Não deu certo',
  null => 'Sem resposta',
};

/// "em 3 resgates confirmados".
String savingsCountLabel(int count) =>
    count == 1 ? 'em 1 resgate confirmado' : 'em $count resgates confirmados';

/// Usos com parceiro ainda visível, mais recente primeiro.
List<BenefitUse> visibleUses(List<BenefitUse> uses, Set<String> visibleIds) {
  final list = uses
      .where((u) => u.useCount > 0 && visibleIds.contains(u.partnerId))
      .toList();
  list.sort((a, b) {
    final la = a.lastUsedAt?.millisecondsSinceEpoch ?? 0;
    final lb = b.lastUsedAt?.millisecondsSinceEpoch ?? 0;
    return lb.compareTo(la);
  });
  return List.unmodifiable(list);
}

/// "Você abriu o cardápio com o cupom X ontem." — a frase da pergunta, com o
/// que se sabe de verdade (sem cupom, sem a parte do cupom).
String pendingQuestionSubtitle({
  required Partner partner,
  String? coupon,
  DateTime? lastUsedAt,
  required DateTime now,
}) {
  final when = lastUsedAt == null ? '' : ' ${_relativeDay(lastUsedAt, now)}';
  final what = coupon == null
      ? 'Você abriu o benefício da ${partner.name}$when.'
      : 'Você usou o cupom $coupon$when.';
  return '$what Sua resposta ajuda a manter no clube só o que funciona.';
}

String _relativeDay(DateTime date, DateTime now) {
  final days = _day(now.toLocal()).difference(_day(date.toLocal())).inDays;
  if (days <= 0) return 'hoje';
  if (days == 1) return 'ontem';
  return 'em ${_ddmm(date)}';
}
