/// As quatro seções do Modo Focus, na ordem em que aparecem na casca.
enum FocusSection {
  agora('Agora', 'agora'),
  trajetoria('Trajetória', 'trajetoria'),
  grupo('Grupo', 'grupo'),
  chave('Chave', 'chave');

  const FocusSection(this.label, this.slug);

  final String label;
  final String slug;
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
