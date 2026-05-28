import 'dart:math';

/// Frase de destaque do card de inscrição (duas linhas).
class TournamentRegistrationSharePhrase {
  const TournamentRegistrationSharePhrase(this.line1, this.line2);

  final String line1;
  final String line2;
}

/// Frases exibidas no card de sucesso da inscrição.
const List<TournamentRegistrationSharePhrase>
tournamentRegistrationSharePhrases = [
  TournamentRegistrationSharePhrase('A areia', 'vai ferver.'),
  TournamentRegistrationSharePhrase('Confirmados', 'na batalha.'),
  TournamentRegistrationSharePhrase('Agora é', 'só jogo.'),
  TournamentRegistrationSharePhrase('Dupla pronta', 'pro ataque.'),
  TournamentRegistrationSharePhrase('Na disputa', 'de verdade.'),
  TournamentRegistrationSharePhrase('Chegamos', 'pra jogar.'),
  TournamentRegistrationSharePhrase('Areia, suor', 'e resenha.'),
  TournamentRegistrationSharePhrase('O saque', 'tá pago.'),
  TournamentRegistrationSharePhrase('Inscrição feita', 'sem caô.'),
  TournamentRegistrationSharePhrase('A pressão', 'é deles.'),
  TournamentRegistrationSharePhrase('Vai ter', 'rally longo.'),
  TournamentRegistrationSharePhrase('Nos vemos', 'na quadra.'),
  TournamentRegistrationSharePhrase('Hoje o', 'show acontece.'),
  TournamentRegistrationSharePhrase('Tá confirmada', 'a resenha.'),
  TournamentRegistrationSharePhrase('Tudo certo', 'pro torneio.'),
  TournamentRegistrationSharePhrase('O beach', 'nos chama.'),
  TournamentRegistrationSharePhrase('Entramos', 'pra vencer.'),
  TournamentRegistrationSharePhrase('Agora ficou', 'sério.'),
  TournamentRegistrationSharePhrase('Que vença', 'a melhor dupla.'),
  TournamentRegistrationSharePhrase('Só dupla', 'casca grossa.'),
  TournamentRegistrationSharePhrase('Bateu a', 'vontade de jogar.'),
  TournamentRegistrationSharePhrase('Partiu fazer', 'história.'),
  TournamentRegistrationSharePhrase('A rede', 'que lute.'),
  TournamentRegistrationSharePhrase('Confirmado', 'na areia quente.'),
  TournamentRegistrationSharePhrase('Tem dupla', 'na área.'),
  TournamentRegistrationSharePhrase('Modo torneio', 'ativado.'),
  TournamentRegistrationSharePhrase('Chega mais', 'pro game.'),
  TournamentRegistrationSharePhrase('Nada tira', 'essa vaga.'),
  TournamentRegistrationSharePhrase('Vaga garantida', 'na disputa.'),
  TournamentRegistrationSharePhrase('A missão', 'começou.'),
  TournamentRegistrationSharePhrase('É dentro', 'da quadra.'),
  TournamentRegistrationSharePhrase('Vai começar', 'o espetáculo.'),
  TournamentRegistrationSharePhrase('Resenha boa', 'e bloqueio alto.'),
  TournamentRegistrationSharePhrase('O ponto', 'vale tudo.'),
  TournamentRegistrationSharePhrase('Ativando o', 'modo competição.'),
  TournamentRegistrationSharePhrase('A dupla', 'vem forte.'),
  TournamentRegistrationSharePhrase('O game', 'já virou.'),
  TournamentRegistrationSharePhrase('Mais um', 'desafio confirmado.'),
  TournamentRegistrationSharePhrase('Ninguém segura', 'essa dupla.'),
  TournamentRegistrationSharePhrase('A tropa', 'da areia chegou.'),
];

const TournamentRegistrationSharePhrase _defaultSharePhrase =
    TournamentRegistrationSharePhrase('É nóis', 'na areia.');

/// Sorteia uma frase determinística a partir de [seed] (ex.: id da inscrição).
TournamentRegistrationSharePhrase pickTournamentRegistrationSharePhrase(
  int seed,
) {
  final phrases = tournamentRegistrationSharePhrases;
  if (phrases.isEmpty) return _defaultSharePhrase;
  return phrases[Random(seed).nextInt(phrases.length)];
}
