import 'package:flutter/material.dart';

import '../../athlete/domain/athlete_profile_options.dart';
import 'tournament_discovery_models.dart';

/// Identidade visual da categoria por faixa de nível.
///
/// A escada do atleta tem 7 degraus, mas o card só precisa de 4 famílias — o
/// mesmo agrupamento que o filtro de nível do ranking já usa (0-1 / 2-3 / 4-5 /
/// 6). Cada família tem cor, ícone e uma frase curta que serve de subtítulo.
enum CategoryLevelFamily {
  /// Nenhum nível declarado e nenhuma pista no nome da categoria.
  indefinido,
  iniciante,
  intermediario,
  avancado,
  open,
}

/// Paleta de acento por família. Os tons espelham a identidade dos elos
/// (`sandRankColor`, na feature do atleta) para o app falar uma língua só —
/// ficam declarados aqui para a feature de torneios não depender daquela.
const Color _acentoIniciante = Color(0xFFB08D57); // bronze-areia
const Color _acentoIntermediario = Color(0xFF2F6FBF); // azul
const Color _acentoAvancado = Color(0xFF7B4FBF); // roxo
const Color _acentoOpen = Color(0xFFD4A017); // dourado
const Color _acentoIndefinido = Color(0xFF9A9AA3); // cinza neutro do tema

/// Família de nível da categoria.
///
/// Lê `categories[].level` e, quando o organizador não preencheu, tenta o nome
/// da categoria ("Open Masculino", "Iniciante Feminino") — o mesmo recurso que
/// [tournamentCategoryGenderTag] usa para o gênero.
///
/// Sem nível e sem pista no nome o resultado é [CategoryLevelFamily.indefinido],
/// **não** Open: `CategoryLevelEligibility.categoryLevelRank` trata nível vazio
/// como Open porque ali isso significa "aceita todos", mas pintar de dourado
/// todo torneio que não declara nível seria mentir sobre a categoria.
CategoryLevelFamily categoryLevelFamily(TournamentCategoryOffer offer) {
  final fromField =
      _familyFromRank(AthleteProfileOptions.levelRank(offer.level));
  if (fromField != CategoryLevelFamily.indefinido) return fromField;
  return _familyFromText(offer.name);
}

CategoryLevelFamily _familyFromRank(int? rank) {
  return switch (rank) {
    0 || 1 => CategoryLevelFamily.iniciante,
    2 || 3 => CategoryLevelFamily.intermediario,
    4 || 5 => CategoryLevelFamily.avancado,
    6 => CategoryLevelFamily.open,
    _ => CategoryLevelFamily.indefinido,
  };
}

CategoryLevelFamily _familyFromText(String raw) {
  final text = _stripAccents(raw.trim().toLowerCase());
  if (text.isEmpty) return CategoryLevelFamily.indefinido;
  if (text.contains('iniciante') || text.contains('basico')) {
    return CategoryLevelFamily.iniciante;
  }
  if (text.contains('intermediario')) return CategoryLevelFamily.intermediario;
  if (text.contains('avancado')) return CategoryLevelFamily.avancado;
  if (RegExp(r'\bopen\b').hasMatch(text)) return CategoryLevelFamily.open;
  return CategoryLevelFamily.indefinido;
}

String _stripAccents(String value) {
  return value
      .replaceAll('á', 'a')
      .replaceAll('ã', 'a')
      .replaceAll('â', 'a')
      .replaceAll('é', 'e')
      .replaceAll('ê', 'e')
      .replaceAll('í', 'i')
      .replaceAll('ó', 'o')
      .replaceAll('õ', 'o')
      .replaceAll('ô', 'o')
      .replaceAll('ú', 'u')
      .replaceAll('ç', 'c');
}

/// Cor de acento da família — círculo do ícone, borda e barra do card.
Color categoryLevelAccent(CategoryLevelFamily family) {
  return switch (family) {
    CategoryLevelFamily.iniciante => _acentoIniciante,
    CategoryLevelFamily.intermediario => _acentoIntermediario,
    CategoryLevelFamily.avancado => _acentoAvancado,
    CategoryLevelFamily.open => _acentoOpen,
    CategoryLevelFamily.indefinido => _acentoIndefinido,
  };
}

/// Subtítulo do card — a promessa da faixa, não o nome dela.
String categoryLevelTagline(CategoryLevelFamily family) {
  return switch (family) {
    CategoryLevelFamily.iniciante => 'Comece sua jornada',
    CategoryLevelFamily.intermediario => 'Equilíbrio e grandes jogos',
    CategoryLevelFamily.avancado => 'Nível técnico elevado',
    CategoryLevelFamily.open => 'Alto nível de competição',
    CategoryLevelFamily.indefinido => 'Aberto a todos os níveis',
  };
}

/// Rótulo curto da família (selo/acessibilidade).
String categoryLevelFamilyLabel(CategoryLevelFamily family) {
  return switch (family) {
    CategoryLevelFamily.iniciante => 'Iniciante',
    CategoryLevelFamily.intermediario => 'Intermediário',
    CategoryLevelFamily.avancado => 'Avançado',
    CategoryLevelFamily.open => 'Open',
    CategoryLevelFamily.indefinido => 'Todos os níveis',
  };
}

/// Ícone da família — a escada desenhada em um glifo só.
IconData categoryLevelIcon(CategoryLevelFamily family) {
  return switch (family) {
    CategoryLevelFamily.iniciante => Icons.wb_sunny_rounded,
    CategoryLevelFamily.intermediario => Icons.trending_up_rounded,
    CategoryLevelFamily.avancado => Icons.local_fire_department_rounded,
    CategoryLevelFamily.open => Icons.emoji_events_rounded,
    CategoryLevelFamily.indefinido => Icons.sports_volleyball_rounded,
  };
}
