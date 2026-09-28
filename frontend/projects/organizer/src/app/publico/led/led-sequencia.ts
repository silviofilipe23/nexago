/** Tags de sequência do trono no painel de LED — substituem o antigo selo "N seguidas".
 *
 *  Só a dupla do trono acumula sequência no KOTC (quem desafia e vence vira rei sem ponto, e a
 *  conta recomeça). Um nível a cada duas defesas a partir da 3ª; o último não tem teto. */

export interface LedSequenciaTier {
  /** 1 a 5 — quantos traços da barrinha acendem. */
  nivel: 1 | 2 | 3 | 4 | 5;
  nome: string;
  /** Defesas seguidas (o "×7" do badge). */
  count: number;
}

const NIVEIS: readonly { min: number; nome: string }[] = [
  { min: 11, nome: 'Lenda da areia' },
  { min: 9, nome: 'Modo deus' },
  { min: 7, nome: 'Imparável' },
  { min: 5, nome: 'Pegando fogo' },
  { min: 3, nome: 'Em chamas' },
];

/** `null` abaixo de 3 defesas seguidas: tag que não significa nada só polui o painel. */
export function ledSequenciaTier(seguidas: number | null | undefined): LedSequenciaTier | null {
  const n = Math.floor(Number(seguidas) || 0);
  const i = NIVEIS.findIndex((l) => n >= l.min);
  if (i < 0) return null;
  return { nivel: (NIVEIS.length - i) as LedSequenciaTier['nivel'], nome: NIVEIS[i]!.nome, count: n };
}
