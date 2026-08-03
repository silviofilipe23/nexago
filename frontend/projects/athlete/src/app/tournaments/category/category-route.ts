import { inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

/** Id da categoria lido da rota-pai (`categorias/:categoriaId`): as sub-visões são filhas dela e
 *  não carregam o parâmetro na própria rota. Chamar em contexto de injeção (campo de classe). */
export function parentCategoryId(): Signal<string> {
  const route = inject(ActivatedRoute);
  const source = route.parent ?? route;
  return toSignal(source.paramMap.pipe(map((p) => p.get('categoriaId') ?? '')), {
    initialValue: source.snapshot.paramMap.get('categoriaId') ?? '',
  });
}
