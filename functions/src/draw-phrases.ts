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

export const PHRASE_BANK: Record<PhraseContext, Phrase[]> = {
  seed: [
    {id: "seed-1", text: "Chegou a favorita. Alguém avisa o resto do grupo."},
    {id: "seed-2", text: "Cabeça de chave na mesa. O grupo acabou de ficar mais caro."},
    {id: "seed-3", text: "Essa entra com o pote 1 no crachá e o alvo nas costas."},
    {id: "seed-4", text: "Pote 1 sorteado: agora todo mundo sabe onde não queria cair."},
  ],
  death_group: [
    {id: "death-1", text: "Esse grupo virou oficialmente o grupo da morte."},
    {id: "death-2", text: "Somando o elo desse grupo, dá vontade de pedir recontagem."},
    {id: "death-3", text: "Chave dura é chave dura: esse grupo não tem jogo fácil."},
    {id: "death-4", text: "Alguém muito bom vai cair na fase de grupos por causa desse sorteio."},
  ],
  same_city: [
    {id: "city-1", text: "Clássico da cidade logo na primeira fase. Vai ter treino tenso essa semana."},
    {id: "city-2", text: "Conterrâneas no mesmo grupo — quem treina junto agora joga contra."},
    {id: "city-3", text: "A areia é a mesma, o grupo também. Vizinhas de quadra."},
  ],
  pot_first: [
    {id: "p1-1", text: "Primeiro pote, primeira decisão. O resto do grupo se desenha a partir daqui."},
    {id: "p1-2", text: "Abre o sorteio com o pote das fortes."},
    {id: "p1-3", text: "O pote 1 dá o tom do grupo inteiro."},
  ],
  pot_middle: [
    {id: "pm-1", text: "Pote do meio é onde o grupo muda de personalidade."},
    {id: "pm-2", text: "Essa chegada equilibra o grupo — ou desequilibra de vez."},
    {id: "pm-3", text: "Sem cabeça de chave nem lanterna: pote do meio é pura briga."},
    {id: "pm-4", text: "O grupo estava tranquilo até agora."},
  ],
  pot_last: [
    {id: "pl-1", text: "Último pote fechando o grupo. Agora dá pra fazer conta."},
    {id: "pl-2", text: "Fecha o grupo. Quem passou a semana torcendo já pode parar."},
    {id: "pl-3", text: "Última vaga preenchida — o grupo está completo e ninguém escolheu nada."},
  ],
  de_vs_seed: [
    {id: "dvs-1", text: "Estreia contra cabeça de chave. Sem aquecimento, direto pro jogo grande."},
    {id: "dvs-2", text: "O sorteio não perdoou: cabeça de chave logo na estreia."},
    {id: "dvs-3", text: "Primeira rodada valendo tudo — ninguém pediu esse confronto tão cedo."},
  ],
  de_position: [
    {id: "dp-1", text: "Posição definida. Agora dá pra ver o caminho inteiro até a final."},
    {id: "dp-2", text: "Caiu nesse lado da chave. O outro lado agradece."},
    {id: "dp-3", text: "A chave já mostra onde essa dupla cruza com as favoritas."},
    {id: "dp-4", text: "Um número no sorteio, três jogos de diferença na prática."},
  ],
  generic: [
    {id: "gen-1", text: "Mais uma vaga preenchida. A chave começa a tomar forma."},
    {id: "gen-2", text: "Sorteada. Agora é treinar e esperar o primeiro apito."},
    {id: "gen-3", text: "Está definido — e ninguém pode reclamar do sorteio."},
    {id: "gen-4", text: "Grupo formado no servidor, ao vivo, na frente de todo mundo."},
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

/**
 * Primeira frase ainda não usada, andando do bucket mais específico ao mais
 * genérico. `null` quando o banco inteiro se esgotou — e ficar sem frase é
 * melhor que repetir uma que já foi ao ar.
 */
export function pickPhrase(
  contexts: readonly PhraseContext[],
  usedIds: ReadonlySet<string>,
  pick: PhrasePicker,
): Phrase | null {
  for (const context of contexts) {
    const bucket = PHRASE_BANK[context];
    if (!bucket) continue;
    const available = bucket.filter((p) => !usedIds.has(p.id));
    if (available.length === 0) continue;
    const index = Math.min(Math.max(pick(available.length), 0), available.length - 1);
    return available[index]!;
  }
  return null;
}
