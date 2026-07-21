/// Confiabilidade do rating (RD do Glicko-2) em rótulo categórico de leitura
/// rápida — complementa (não substitui) o indicador binário de partidas
/// provisórias já existente (`AthleteRating.isProvisional`).
///
/// Faixa real do RD conforme `functions/src/glicko.ts`
/// (`DEFAULT_GLICKO_OPTIONS`): mínimo 60 (rating bem consolidado, muitas
/// partidas rateadas recentes) a máximo 350 (jogador novo ou muito tempo
/// sem jogar — `inflateRd` sobe o RD por inatividade). Dividimos essa faixa
/// de 290 pontos em 3 terços aproximados, arredondados para números redondos
/// e fáceis de lembrar:
/// - Alta: rd <= 150 (terço inferior — rating calibrado, mais confiável)
/// - Média: 150 < rd <= 250 (terço central)
/// - Baixa: rd > 250 (terço superior — poucas partidas ou muita inatividade)
enum RatingReliability {
  alta,
  media,
  baixa;

  /// Rótulo PT-BR pronto para exibir na UI.
  String get label => switch (this) {
        RatingReliability.alta => 'Alta',
        RatingReliability.media => 'Média',
        RatingReliability.baixa => 'Baixa',
      };
}

/// Piso e teto reais do RD no backend (`DEFAULT_GLICKO_OPTIONS` em
/// `functions/src/glicko.ts`). Mantidos aqui só como documentação/validação
/// dos cortes abaixo — a função aceita qualquer valor e satura nas pontas.
const double kMinGlickoRd = 60;
const double kMaxGlickoRd = 350;

/// Corte entre Alta e Média confiabilidade (fim do terço inferior da faixa).
const double _highReliabilityMaxRd = 150;

/// Corte entre Média e Baixa confiabilidade (fim do terço central da faixa).
const double _mediumReliabilityMaxRd = 250;

/// Mapeia o RD (incerteza do Glicko-2) para um rótulo categórico de
/// confiabilidade do rating. Valores fora da faixa 60–350 (não deveriam
/// ocorrer, mas por segurança) saturam na categoria mais próxima.
RatingReliability ratingReliabilityFor(double rd) {
  if (rd <= _highReliabilityMaxRd) return RatingReliability.alta;
  if (rd <= _mediumReliabilityMaxRd) return RatingReliability.media;
  return RatingReliability.baixa;
}
