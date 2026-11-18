/// Eventos do funil do clube que o app manda pela callable `trackBenefitEvent`
/// (`lead_submit` é gravado só pelo `submitPartnerLead`, no servidor).
enum BenefitEventType {
  hubCardView('hub_card_view'),
  clubView('club_view'),
  partnerView('partner_view'),
  ctaClick('cta_click'),
  codeCopy('code_copy');

  const BenefitEventType(this.key);

  final String key;
}

/// Por onde a pessoa entrou no clube. A origem acompanha a visita inteira: o
/// clique no botão de um parceiro aberto a partir do card do Hub grava
/// `hub_card`. Vai na rota como `?origem=`.
enum BenefitSource {
  hubCard('hub_card'),
  clubList('club_list'),
  sponsorBanner('sponsor_banner'),
  competirWeb('competir_web'),
  home('home'),
  deeplink('deeplink'),
  push('push'),

  /// Card do clube no detalhe da pelada.
  postGame('post_game'),

  /// Card do clube no dia de torneio (Modo Focus).
  tournamentDay('tournament_day'),

  /// "Destaque da semana" no topo do clube.
  featured('featured'),

  /// Resultado da busca do clube.
  search('search'),

  /// Pino do mapa do clube.
  map('map'),

  /// "Meus benefícios".
  myBenefits('my_benefits'),

  /// Botão de uma novidade, de um guia da Central de ajuda ou de um banner
  /// da Home (destino `clube`).
  appNews('app_news'),
  unknown('unknown');

  const BenefitSource(this.key);

  final String key;

  /// Nome do parâmetro de query que leva a origem entre as telas.
  static const String queryParam = 'origem';

  /// Sem origem (link aberto de fora) = `deeplink`; valor que o app não
  /// conhece = `unknown`, como o backend faria.
  static BenefitSource fromQuery(String? raw) {
    final value = raw?.trim() ?? '';
    if (value.isEmpty) return BenefitSource.deeplink;
    for (final source in values) {
      if (source.key == value) return source;
    }
    return BenefitSource.unknown;
  }
}
