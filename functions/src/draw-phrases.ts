/**
 * Banco de frases de provocação do sorteio ao vivo.
 *
 * Regra editorial, que é o que importa aqui: a frase comenta A SITUAÇÃO — o
 * grupo, o pote, o favoritismo, o cruzamento — e NUNCA a pessoa. Nada sobre
 * corpo, idade, aparência ou fracasso individual. Uma frase mal calibrada num
 * telão com 400 atletas assistindo é um problema de produto, não uma piada
 * infeliz, então o console mostra a frase antes de ir ao ar (com "Trocar" e
 * "Sem frase") e o organizador pode desligar o recurso inteiro na sessão.
 *
 * O placeholder `{team}` vira o rótulo da dupla ("Ana / Bia") na hora do
 * sorteio. Misturar frases com e sem nome evita eco com o spotlight (onde o
 * nome já está gigante) e mantém corneta dirigida sem virar ataque pessoal.
 *
 * Fora desta versão: banco por esporte e por categoria (o tom do Feminino Open
 * não é o do Iniciante). O bucket por contexto já cobre o essencial e a
 * separação por público pode entrar depois sem mudar esta interface.
 */

export type PhraseContext =
  | "seed"
  | "death_group"
  | "same_city"
  | "pot_first"
  | "pot_last"
  | "pot_middle"
  | "de_vs_seed"
  | "de_position"
  | "generic";

export interface Phrase {
  /** Estável — é o que impede a frase de voltar na mesma sessão. */
  id: string;
  /** Texto pronto pra telão, ou template com `{team}` ainda no banco. */
  text: string;
}

export interface PhraseSituation {
  format: "groups_knockout" | "double_elimination";
  /** 1-based. Em dupla eliminatória não tem peso. */
  potIndex: number;
  totalPots: number;
  isSeed: boolean;
  /** Já há conterrânea no grupo de destino. */
  sameCityInGroup: boolean;
  /** O grupo virou o mais forte da chave depois desta entrada. */
  isStrongestGroup: boolean;
  /** Dupla eliminatória: estreia contra uma cabeça travada. */
  meetsSeedOnDebut: boolean;
}

/** Teto pro telão: rótulo longo demais quebra a linha da frase. */
const TEAM_LABEL_MAX = 42;
/** Se o snapshot vier sem label, a frase ainda precisa fazer sentido. */
const TEAM_FALLBACK = "Essa dupla";

export const PHRASE_BANK: Record<PhraseContext, Phrase[]> = {
  seed: [
    {id: "seed-1", text: "Chegou {team}. Agora é descobrir quem vai fingir que não ficou com medo."},
    {id: "seed-2", text: "{team} é cabeça de chave. O grupo já começou a estudar o histórico."},
    {id: "seed-3", text: "{team} entrou como favorita e saiu com um alvo do tamanho da quadra."},
    {id: "seed-4", text: "Pote 1: porque sofrer logo na primeira fase também pode ser por escolha."},
    {id: "seed-5", text: "{team} caiu aqui. Três duplas já abriram o regulamento procurando brecha."},
    {id: "seed-6", text: "{team} no grupo. O 'boa sorte' no WhatsApp veio com intenção duvidosa."},
    {id: "seed-7", text: "Chegou a pedreira: {team}. Alguém vai precisar explicar esse sorteio em casa."},
    {id: "seed-8", text: "{team} no pote 1. A esperança das outras duplas acaba de diminuir 17%."},
    {id: "seed-9", text: "{team} chegou. Agora é oficialmente proibido chamar esse grupo de fácil."},
    {id: "seed-10", text: "Cabeça de chave na área. O grupo pediu VAR antes mesmo do primeiro jogo."},
  ],

  death_group: [
    {id: "death-1", text: "Grupo da morte confirmado. O grupo da vida ficou para o próximo torneio."},
    {id: "death-2", text: "Aqui não tem jogo fácil. Tem jogo e tem sofrimento."},
    {id: "death-3", text: "Esse grupo não precisa de aquecimento. Já nasceu pegando fogo."},
    {id: "death-4", text: "Quatro duplas, duas vagas e zero tranquilidade."},
    {id: "death-5", text: "O grupo da morte pediu música no Fantástico."},
    {id: "death-6", text: "Classificar aqui vale quase como um título."},
    {id: "death-7", text: "{team} entrou e o grupo ficou ainda mais pesado."},
    {id: "death-8", text: "O sorteio olhou para esse grupo e escolheu violência esportiva."},
    {id: "death-9", text: "Grupo tão forte que o segundo colocado já está comemorando a experiência."},
    {id: "death-10", text: "Alguém vai passar. Alguém vai sofrer. E a NexaGO vai assistir."},
    {id: "death-11", text: "Aqui até o saldo de pontos vai sair traumatizado."},
    {id: "death-12", text: "{team} completou o grupo da morte. A areia pediu reforço."},
  ],

  same_city: [
    {id: "city-1", text: "Derby local! Hoje é amizade, amanhã é 'não te conheço' na quadra."},
    {id: "city-2", text: "{team} caiu com conterrânea. O problema agora vai para o WhatsApp da cidade."},
    {id: "city-3", text: "Vizinhas de quadra. Amigas até o primeiro saque."},
    {id: "city-4", text: "Clássico local confirmado. A resenha pós-jogo já promete."},
    {id: "city-5", text: "Mesma cidade. Mesma areia. Zero amizade durante o jogo."},
    {id: "city-6", text: "O treino de amanhã ganhou um novo significado."},
    {id: "city-7", text: "{team} conhece a adversária e a cidade. Agora só falta ganhar."},
    {id: "city-8", text: "O sorteio resolveu transformar rivalidade local em conteúdo."},
    {id: "city-9", text: "{team} encontrou a dupla que treina na quadra ao lado."},
    {id: "city-10", text: "Depois dessa, o 'bom dia' na academia vai ficar estranho."},
  ],

  pot_first: [
    {id: "p1-1", text: "{team} abriu o pote 1. O grupo acabou de ganhar um problema."},
    {id: "p1-2", text: "Começou o sorteio e já tem gente fazendo promessa."},
    {id: "p1-3", text: "A primeira bomba caiu: {team}. Agora o grupo se desenha na base do trauma."},
    {id: "p1-4", text: "Pote 1 na mesa. Respira e aceita."},
    {id: "p1-5", text: "{team} chegou. Quem estava tranquilo perdeu a tranquilidade."},
    {id: "p1-6", text: "Primeira dupla definida. Agora começa a matemática emocional."},
  ],

  pot_middle: [
    {id: "pm-1", text: "Entrou {team} — a dupla que ninguém queria enfrentar logo agora."},
    {id: "pm-2", text: "Pote do meio: onde mora a famosa 'zebra que ninguém viu chegando'."},
    {id: "pm-3", text: "{team} chegou quietinha. Perigoso."},
    {id: "pm-4", text: "Nem favorita, nem zebra. {team} só veio para atrapalhar os planos."},
    {id: "pm-5", text: "O grupo estava tranquilo. Aí {team} apareceu."},
    {id: "pm-6", text: "{team} não promete nada. E é exatamente isso que preocupa."},
    {id: "pm-7", text: "Chegou {team}, pronta para transformar prognóstico em meme."},
    {id: "pm-8", text: "O pote do meio nunca decepciona quem gosta de confusão."},
    {id: "pm-9", text: "{team} entrou. Agora ninguém sabe mais quem é favorito."},
    {id: "pm-10", text: "{team} pode complicar o grupo inteiro. Boa sorte, pessoal."},
  ],

  pot_last: [
    {id: "pl-1", text: "{team} fechou o grupo. Agora não tem mais como culpar o sorteio."},
    {id: "pl-2", text: "Fechou o grupo. Pode parar de atualizar a tela."},
    {id: "pl-3", text: "Última vaga: {team}. Agora começa a terapia."},
    {id: "pl-4", text: "O grupo está completo. A paz não."},
    {id: "pl-5", text: "{team} foi a última sorteada. Agora todo mundo conhece seu destino."},
    {id: "pl-6", text: "Fechou! O grupo já pode começar a criar desculpas."},
    {id: "pl-7", text: "Último pote. A sorte deu seu último suspiro."},
    {id: "pl-8", text: "Pronto. Agora é jogar e não reclamar do sorteio."},
    {id: "pl-9", text: "Grupo fechado com {team}. O WhatsApp pode começar a trabalhar."},
    {id: "pl-10", text: "Terminou o sorteio. Começou a resenha."},
  ],

  de_vs_seed: [
    {id: "dvs-1", text: "{team} estreia contra a favorita. O sorteio acordou querendo entretenimento."},
    {id: "dvs-2", text: "Primeiro jogo de {team} e já veio pedreira. Bom dia, atletas."},
    {id: "dvs-3", text: "Logo na estreia, {team}? O sorteio não conhece misericórdia."},
    {id: "dvs-4", text: "{team} estreia contra cabeça de chave. Aquecimento cancelado."},
    {id: "dvs-5", text: "Começar enfrentando a favorita é uma forma de testar o psicológico."},
    {id: "dvs-6", text: "{team} pega a favorita na estreia. Pelo menos já sabe quem procurar no chaveamento."},
    {id: "dvs-7", text: "A sorte mandou um recado: 'quero ver se vocês são bons mesmo'."},
    {id: "dvs-8", text: "Estreia difícil. Mas se {team} ganhar, a história fica melhor."},
    {id: "dvs-9", text: "Primeira rodada e já vale aquele olhar de 'é sério isso?'."},
    {id: "dvs-10", text: "O sorteio colocou a favorita no caminho de {team}. Agora é surpreender."},
  ],

  de_position: [
    {id: "dp-1", text: "{team} caiu nesse lado da chave. O outro lado acabou de respirar aliviado."},
    {id: "dp-2", text: "Posição definida. Agora é descobrir quantas partidas faltam até a crise."},
    {id: "dp-3", text: "O caminho de {team} está desenhado. Boa sorte fingindo que não olhou a chave."},
    {id: "dp-4", text: "{team} caiu aqui. Agora começa a famosa conta: 'se a gente ganhar essa...'"},
    {id: "dp-5", text: "O caminho até a final está definido. A parte fácil era não saber."},
    {id: "dp-6", text: "Chave definida. Agora é print, grupo do WhatsApp e análise de adversário."},
    {id: "dp-7", text: "A chave falou. Agora não adianta discutir com o Excel."},
    {id: "dp-8", text: "Caminho definido. Alguém já está calculando todas as combinações possíveis."},
    {id: "dp-9", text: "{team} caiu no lado difícil. O lado fácil agradece a participação."},
    {id: "dp-10", text: "A chave está montada. Agora começa o verdadeiro campeonato: a resenha."},
  ],

  generic: [
    {id: "gen-1", text: "{team} sorteada! Agora pode começar a corneta."},
    {id: "gen-2", text: "Está definido. Reclamações somente após o primeiro jogo."},
    {id: "gen-3", text: "{team} na chave. Menos uma desculpa para faltar."},
    {id: "gen-4", text: "Sorteio feito. Agora é treino, jogo e print da chave."},
    {id: "gen-5", text: "{team} caiu no grupo. Agora é torcer para o algoritmo ter bom coração."},
    {id: "gen-6", text: "Mais uma definida. O grupo está ficando interessante."},
    {id: "gen-7", text: "A chave está tomando forma. A ansiedade também."},
    {id: "gen-8", text: "Definido! Agora todo mundo vira especialista em chaveamento."},
    {id: "gen-9", text: "{team} no quadro. Já pode começar a estudar os adversários."},
    {id: "gen-10", text: "A NexaGO sorteou. Se der ruim, a culpa é da matemática."},
    {id: "gen-11", text: "{team} está na chave. Agora só falta jogar bem."},
    {id: "gen-12", text: "Pronto. A desculpa 'não sabia quem ia pegar' morreu aqui."},
    {id: "gen-13", text: "A chave está pronta. O grupo do WhatsApp também."},
    {id: "gen-14", text: "Sorteio concluído. Agora começa a parte em que todo mundo vira comentarista."},
    {id: "gen-15", text: "{team} definida. O torneio acabou de ficar mais interessante."},
  ],
};

/**
 * Buckets candidatos, do mais específico ao mais genérico. Sempre termina em
 * `generic`, então nunca existe revelação sem lugar de onde tirar frase.
 */
export function phraseContextsFor(situation: PhraseSituation): PhraseContext[] {
  const contexts: PhraseContext[] = [];

  if (situation.format === "double_elimination") {
    if (situation.meetsSeedOnDebut) contexts.push("de_vs_seed");
    if (situation.isSeed) contexts.push("seed");
    contexts.push("de_position", "generic");
    return contexts;
  }

  if (situation.isStrongestGroup) contexts.push("death_group");
  if (situation.isSeed) contexts.push("seed");
  if (situation.sameCityInGroup) contexts.push("same_city");

  if (situation.potIndex === 1) contexts.push("pot_first");
  else if (situation.potIndex >= situation.totalPots) contexts.push("pot_last");
  else contexts.push("pot_middle");

  contexts.push("generic");
  return contexts;
}

/** Sorteador injetável: recebe o tamanho e devolve um índice em `[0, size)`. */
export type PhrasePicker = (size: number) => number;

/** Corta rótulo longo pra frase caber no telão sem virar parágrafo. */
export function shortenTeamLabel(label: string, max = TEAM_LABEL_MAX): string {
  const trimmed = label.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Troca `{team}` pelo rótulo da dupla. Frases sem placeholder passam intactas —
 * misturar as duas evita eco com o nome gigante do spotlight.
 */
export function fillPhrase(phrase: Phrase, teamLabel: string): Phrase {
  if (!phrase.text.includes("{team}")) return phrase;
  const name = shortenTeamLabel(teamLabel.trim() || TEAM_FALLBACK);
  return {id: phrase.id, text: phrase.text.split("{team}").join(name)};
}

/**
 * Primeira frase ainda não usada, andando do bucket mais específico ao mais
 * genérico. `null` quando o banco inteiro se esgotou — e ficar sem frase é
 * melhor que repetir uma que já foi ao ar.
 *
 * `teamLabel` preenche `{team}` antes de gravar: o telão recebe texto pronto.
 */
export function pickPhrase(
  contexts: readonly PhraseContext[],
  usedIds: ReadonlySet<string>,
  pick: PhrasePicker,
  teamLabel = "",
): Phrase | null {
  for (const context of contexts) {
    const bucket = PHRASE_BANK[context];
    if (!bucket) continue;
    const available = bucket.filter((p) => !usedIds.has(p.id));
    if (available.length === 0) continue;
    const index = Math.min(Math.max(pick(available.length), 0), available.length - 1);
    return fillPhrase(available[index]!, teamLabel);
  }
  return null;
}
