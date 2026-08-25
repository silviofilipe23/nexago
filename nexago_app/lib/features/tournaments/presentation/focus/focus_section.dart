/// As seções do Modo Focus.
///
/// A terceira depende do FORMATO da categoria — nos protótipos a nav mostra
/// `GRUPO` nas categorias com fase de grupos e `CHAVE` na dupla eliminação. É a
/// mesma posição, com o conteúdo que faz sentido para aquele torneio.
enum FocusSection {
  agora('Agora', 'agora'),
  // "Jornada" e não "Trajetória": com cinco abas o rótulo tem ~71px no iPhone
  // comum, e "TRAJETÓRIA" mede 76px em Sora 11/w700 — truncava como
  // "TRAJETÓR…". O slug NÃO muda junto: `?secao=trajetoria` já circula em deep
  // link, e rótulo é tela enquanto slug é contrato.
  trajetoria('Jornada', 'trajetoria'),
  grupo('Grupo', 'grupo'),
  chave('Chave', 'chave'),
  arena('Arena', 'arena'),
  palpites('Palpites', 'palpites');

  const FocusSection(this.label, this.slug);

  final String label;
  final String slug;
}

/// As cinco abas visíveis, na ordem da nav. A terceira é [FocusSection.chave]
/// quando a categoria é dupla eliminação (não há fase de grupos para mostrar) e
/// [FocusSection.grupo] caso contrário.
///
/// [FocusSection.arena] e [FocusSection.palpites] fecham a barra e não variam:
/// são as duas seções que olham o torneio INTEIRO, sem depender da categoria em
/// foco, então servem inclusive a quem ainda não tem partida nenhuma — ou a
/// quem já foi eliminado e continua acompanhando.
List<FocusSection> visibleFocusSections({required bool isDoubleElimination}) {
  return [
    FocusSection.agora,
    FocusSection.trajetoria,
    isDoubleElimination ? FocusSection.chave : FocusSection.grupo,
    FocusSection.arena,
    FocusSection.palpites,
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
