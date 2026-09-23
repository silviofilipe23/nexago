import { initialsOf } from '../../painel/data/mock-data';

/** Iniciais para o disco do painel de LED.
 *
 *  Reusa `initialsOf` do painel (inicial de cada palavra) e só acrescenta o caso de nome com uma
 *  palavra só: ali `initialsOf` devolve UMA letra, que num disco grande visto do fundo do ginásio
 *  não identifica ninguém. "Sor" vira SO, "Hölting Nilsson" segue HN. */
export function ledIniciaisDe(nome: string): string {
  const limpo = nome.trim().replace(/\s+/g, ' ');
  if (!limpo) return '';
  const porPalavra = initialsOf(limpo);
  return porPalavra.length >= 2 ? porPalavra : limpo.slice(0, 2).toUpperCase();
}
