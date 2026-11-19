/// Regras puras do formulário "Avaliar a arena": opções que mudam com a nota,
/// régua com frases e a data do "Jogar de novo".
library;

/// O que as opções pedem: elogio (4 e 5) ou o que melhorar (1 a 3).
enum ArenaReviewTone { praise, improve }

ArenaReviewTone arenaReviewToneFor(int rating) =>
    rating >= 4 ? ArenaReviewTone.praise : ArenaReviewTone.improve;

/// Destaques de nota alta, com a cara da quadra de areia. Pontualidade fica de
/// fora: tem pergunta própria ([arenaReviewOnTimeQuestion]).
const List<String> arenaReviewPraiseTags = <String>[
  'Areia fofa e limpa',
  'Rede bem armada',
  'Iluminação',
  'Atendimento',
  'Vestiário',
  'Bar e água',
  'Estacionamento',
];

/// O que melhorar em nota de 1 a 3.
const List<String> arenaReviewImprovementTags = <String>[
  'Areia dura ou com pedras',
  'Rede ou antenas',
  'Iluminação fraca',
  'Atendimento',
  'Vestiário',
  'Falta de água',
  'Estacionamento',
];

/// Pergunta objetiva, respondida com Sim/Atrasou (gravada em `onTime`).
const String arenaReviewOnTimeQuestion = 'A quadra foi liberada no horário?';

/// Opções para a nota; sem nota, nenhuma (a pergunta só aparece depois).
List<String> arenaReviewTagsFor(int? rating) {
  if (rating == null) return const [];
  return switch (arenaReviewToneFor(rating)) {
    ArenaReviewTone.praise => arenaReviewPraiseTags,
    ArenaReviewTone.improve => arenaReviewImprovementTags,
  };
}

/// Ao trocar a nota: no mesmo tom as opções ficam; se o tom vira (elogio ↔ o que
/// melhorar), a seleção zera. "Vestiário" marcado como destaque não pode ir a público
/// como "A melhorar: Vestiário" sem o atleta escolher.
Set<String> keepArenaReviewTags(
  Set<String> selected, {
  required int? from,
  required int to,
}) {
  if (from == null || arenaReviewToneFor(from) != arenaReviewToneFor(to)) {
    return const {};
  }
  return selected;
}

/// Uma frase por nota, para todo mundo usar a mesma régua.
String arenaReviewHint(int? rating) => switch (rating) {
      1 => 'Não dá para voltar',
      2 => 'Teve problema que atrapalhou o jogo',
      3 => 'Deu para jogar, mas pode melhorar',
      4 => 'Jogaria de novo aqui',
      5 => 'Quero voltar',
      _ => 'Só a nota é obrigatória; o resto é opcional',
    };

/// Próximo dia com o mesmo dia da semana do jogo, sempre depois de hoje.
DateTime arenaReviewRebookDate({
  required DateTime playedOn,
  required DateTime now,
}) {
  final today = DateTime(now.year, now.month, now.day);
  var candidate = DateTime(playedOn.year, playedOn.month, playedOn.day + 7);
  while (!candidate.isAfter(today)) {
    candidate = DateTime(candidate.year, candidate.month, candidate.day + 7);
  }
  return candidate;
}

const _weekdayShort = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/// "Sáb 22/11", para o cartão "Jogar de novo".
String arenaReviewRebookLabel(DateTime date) {
  final dd = date.day.toString().padLeft(2, '0');
  final mm = date.month.toString().padLeft(2, '0');
  return '${_weekdayShort[date.weekday - 1]} $dd/$mm';
}
