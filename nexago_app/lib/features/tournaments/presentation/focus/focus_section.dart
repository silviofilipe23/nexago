/// As seções do Modo Focus.
///
/// A segunda depende do FORMATO da categoria — a nav mostra `GRUPO` nas
/// categorias com fase de grupos e `CHAVE` na dupla eliminação. É a mesma
/// posição, com o conteúdo que faz sentido para aquele torneio.
enum FocusSection {
  agora('Agora', 'agora'),
  grupo('Grupo', 'grupo'),
  chave('Chave', 'chave'),
  arena('Arena', 'arena'),
  palpites('Palpites', 'palpites');

  const FocusSection(this.label, this.slug);

  final String label;
  final String slug;
}

/// As abas visíveis, na ordem da nav.
///
/// - Dupla eliminação: `CHAVE` no lugar do grupo (não há fase de grupos).
/// - Com fase de grupos: `GRUPO` sempre; `CHAVE` entra depois que a fase
///   fecha ou o mata-mata já existe — o atleta precisa ver o bracket assim
///   que a classificação encerra.
///
/// [FocusSection.arena] e [FocusSection.palpites] fecham a barra e não variam:
/// são as duas seções que olham o torneio INTEIRO, sem depender da categoria em
/// foco, então servem inclusive a quem ainda não tem partida nenhuma — ou a
/// quem já foi eliminado e continua acompanhando.
List<FocusSection> visibleFocusSections({
  required bool isDoubleElimination,
  bool groupsComplete = false,
  bool hasKnockoutBracket = false,
}) {
  if (isDoubleElimination) {
    return const [
      FocusSection.agora,
      FocusSection.chave,
      FocusSection.arena,
      FocusSection.palpites,
    ];
  }
  return [
    FocusSection.agora,
    FocusSection.grupo,
    if (groupsComplete || hasKnockoutBracket) FocusSection.chave,
    FocusSection.arena,
    FocusSection.palpites,
  ];
}

/// Resolve `?secao=` para uma seção. Valor desconhecido, ausente, vazio ou o
/// slug legado `trajetoria` (seção removida) cai em [FocusSection.agora] — é a
/// seção de entrada, e um deep link torto não pode deixar o atleta numa tela
/// em branco.
FocusSection focusSectionFromSlug(String? slug) {
  final key = slug?.trim().toLowerCase() ?? '';
  for (final section in FocusSection.values) {
    if (section.slug == key) return section;
  }
  return FocusSection.agora;
}
