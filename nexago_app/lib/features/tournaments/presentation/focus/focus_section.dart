/// As seções do Modo Focus.
///
/// A terceira depende do FORMATO da categoria — nos protótipos a nav mostra
/// `GRUPO` nas categorias com fase de grupos e `CHAVE` na dupla eliminação. É a
/// mesma posição, com o conteúdo que faz sentido para aquele torneio.
enum FocusSection {
  agora('Agora', 'agora'),
  trajetoria('Trajetória', 'trajetoria'),
  grupo('Grupo', 'grupo'),
  chave('Chave', 'chave'),
  arena('Arena', 'arena');

  const FocusSection(this.label, this.slug);

  final String label;
  final String slug;
}

/// As quatro abas visíveis, na ordem da nav. A terceira é [FocusSection.chave]
/// quando a categoria é dupla eliminação (não há fase de grupos para mostrar) e
/// [FocusSection.grupo] caso contrário.
///
/// [FocusSection.arena] fecha a barra e não varia: é a única seção que olha o
/// torneio INTEIRO, sem depender da categoria em foco, então serve inclusive a
/// quem ainda não tem partida nenhuma.
List<FocusSection> visibleFocusSections({required bool isDoubleElimination}) {
  return [
    FocusSection.agora,
    FocusSection.trajetoria,
    isDoubleElimination ? FocusSection.chave : FocusSection.grupo,
    FocusSection.arena,
  ];
}

/// Resolve `?secao=` para uma seção. Valor desconhecido, ausente ou vazio cai
/// em [FocusSection.agora] — é a seção de entrada, e um deep link torto não
/// pode deixar o atleta numa tela em branco.
FocusSection focusSectionFromSlug(String? slug) {
  final key = slug?.trim().toLowerCase() ?? '';
  for (final section in FocusSection.values) {
    if (section.slug == key) return section;
  }
  return FocusSection.agora;
}
