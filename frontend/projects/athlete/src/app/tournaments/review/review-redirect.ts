import { inject } from '@angular/core';
import { Router, type RedirectFunction } from '@angular/router';

/**
 * `torneios/:id/avaliar` → `torneios/:id/minha-inscricao?avaliar=1`. A casca do torneio abre o
 * diálogo pelo `?avaliar=1`. Destino "Minha inscrição": só quem jogou tem convite, e essa é a aba
 * padrão de inscrito. Precisa ser UrlTree — a casca, ao cair em `/torneios/:id` sem aba,
 * navegaria para a aba padrão e perderia a query.
 */
export const reviewRedirect: RedirectFunction = ({ params }) =>
  inject(Router).createUrlTree(['/torneios', params['id'], 'minha-inscricao'], { queryParams: { avaliar: '1' } });
