import 'package:flutter/material.dart';

import '../../athlete/domain/athlete_profile_options.dart';
import 'tournament_discovery_models.dart';

/// Identidade visual da categoria por faixa de nível.
///
/// A escada do atleta tem 7 degraus, mas o card só precisa de 4 famílias — o
/// mesmo agrupamento que o filtro de nível do ranking já usa (0-1 / 2-3 / 4-5 /
/// 6). Cada família tem cor, ícone e uma frase curta que serve de subtítulo.
enum CategoryLevelFamily {
  /// Categoria sem teto de nível: `level: 'Livre'`, ou nenhum nível declarado
  /// e nenhuma pista no nome. É o preset padrão do organizador, e portanto a
  /// família mais comum — não é "dado faltando", é uma escolha.
  livre,
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
/// Turquesa: está na paleta da casa (o elo DESAFIANTE usa a mesma) e fica de
/// fora da progressão bronze → azul → roxo → dourado de propósito, para não
/// sugerir um degrau que a categoria Livre não tem.
const Color _acentoLivre = Color(0xFF17A2A6);

/// Família de nível da categoria.
///
/// Lê `categories[].level` e, quando o organizador não preencheu, tenta o nome
/// da categoria ("Open Masculino", "Iniciante Feminino") — o mesmo recurso que
/// [tournamentCategoryGenderTag] usa para o gênero.
///
/// Sem nível e sem pista no nome o resultado é [CategoryLevelFamily.livre],
/// **não** Open: `CategoryLevelEligibility.categoryLevelRank` trata nível vazio
/// como Open porque ali isso significa "aceita todos", mas pintar de dourado
/// todo torneio que não declara nível seria mentir sobre a categoria.
CategoryLevelFamily categoryLevelFamily(TournamentCategoryOffer offer) {
  // `AthleteProfileOptions.levelRank` trata 'livre' como apelido legado de
  // 'open' (rank 6). Isso vale para o NÍVEL DO ATLETA; para uma CATEGORIA,
  // Livre é o oposto de elite — sem teto, aberta a todos. O apelido morre aqui.
  if (_isLivre(offer.level)) return CategoryLevelFamily.livre;

  final fromField = _familyFromRank(
    AthleteProfileOptions.levelRank(offer.level),
  );
  if (fromField != CategoryLevelFamily.livre) return fromField;
  return _familyFromText(offer.name);
}

bool _isLivre(String raw) => _stripAccents(raw.trim().toLowerCase()) == 'livre';

CategoryLevelFamily _familyFromRank(int? rank) {
  return switch (rank) {
    0 || 1 => CategoryLevelFamily.iniciante,
    2 || 3 => CategoryLevelFamily.intermediario,
    4 || 5 => CategoryLevelFamily.avancado,
    6 => CategoryLevelFamily.open,
    _ => CategoryLevelFamily.livre,
  };
}

CategoryLevelFamily _familyFromText(String raw) {
  final text = _stripAccents(raw.trim().toLowerCase());
  if (text.isEmpty) return CategoryLevelFamily.livre;
  if (text.contains('iniciante') || text.contains('basico')) {
    return CategoryLevelFamily.iniciante;
  }
  if (text.contains('intermediario')) return CategoryLevelFamily.intermediario;
  if (text.contains('avancado')) return CategoryLevelFamily.avancado;
  if (RegExp(r'\bopen\b').hasMatch(text)) return CategoryLevelFamily.open;
  return CategoryLevelFamily.livre;
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
    CategoryLevelFamily.livre => _acentoLivre,
  };
}

/// Subtítulo do card — a promessa da faixa, não o nome dela.
String categoryLevelTagline(CategoryLevelFamily family) {
  return switch (family) {
    CategoryLevelFamily.iniciante => 'Comece sua jornada',
    CategoryLevelFamily.intermediario => 'Equilíbrio e grandes jogos',
    CategoryLevelFamily.avancado => 'Nível técnico elevado',
    CategoryLevelFamily.open => 'Alto nível de competição',
    CategoryLevelFamily.livre => 'Todo mundo joga',
  };
}

/// Rótulo curto da família (selo/acessibilidade).
String categoryLevelFamilyLabel(CategoryLevelFamily family) {
  return switch (family) {
    CategoryLevelFamily.iniciante => 'Iniciante',
    CategoryLevelFamily.intermediario => 'Intermediário',
    CategoryLevelFamily.avancado => 'Avançado',
    CategoryLevelFamily.open => 'Open',
    CategoryLevelFamily.livre => 'Livre',
  };
}

/// Ícone da família — a escada desenhada em um glifo só.
IconData categoryLevelIcon(CategoryLevelFamily family) {
  return switch (family) {
    CategoryLevelFamily.iniciante => Icons.wb_sunny_rounded,
    CategoryLevelFamily.intermediario => Icons.trending_up_rounded,
    CategoryLevelFamily.avancado => Icons.local_fire_department_rounded,
    CategoryLevelFamily.open => Icons.emoji_events_rounded,
    CategoryLevelFamily.livre => Icons.diversity_3_rounded,
  };
}

/// Arte de fundo do card, uma por faixa.
///
/// Fotos de praia com a MESMA linguagem de câmera e os dois terços da esquerda
/// deliberadamente escuros e vazios — é onde o nome, a descrição e a linha de
/// meta são desenhados. Trocar por uma imagem sem essa área escura torna o
/// texto ilegível, porque o card passa a escrever em branco quando há arte.
String categoryLevelArt(CategoryLevelFamily family) {
  const dir = 'assets/images/category_levels';
  return switch (family) {
    CategoryLevelFamily.iniciante => '$dir/level_iniciante.webp',
    CategoryLevelFamily.intermediario => '$dir/level_intermediario.webp',
    CategoryLevelFamily.avancado => '$dir/level_avancado.webp',
    CategoryLevelFamily.open => '$dir/level_open.webp',
    CategoryLevelFamily.livre => '$dir/level_livre.webp',
  };
}
