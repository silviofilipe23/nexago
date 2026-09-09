import { ChangeDetectionStrategy, Component, input, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

/**
 * Prova que `id` e `catId` CHEGAM no componente do sorteio.
 *
 * A tela fica dois níveis abaixo dos parâmetros: `:id` em `eventos/:id`,
 * `:catId` em `categorias/:catId`, e o componente num filho de path vazio
 * dentro de `sorteio`. Toda essa entrega depende de `withComponentInputBinding()`
 * estar ligado no `provideRouter` — sem ele os inputs chegam VAZIOS, que foi
 * exatamente o estado que prendeu a tela em "Carregando…". É esse mecanismo que
 * o teste guarda (verificado removendo o `withComponentInputBinding` e vendo
 * `''` no lugar dos ids).
 *
 * O componente real não serve pro teste: ele faz I/O no boot. O dublê abaixo
 * tem a MESMA assinatura de inputs, que é o que a fiação de rota enxerga.
 */
@Component({
  selector: 'og-sorteio-duble',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ id() }}|{{ catId() }}`,
})
class SorteioDubleComponent {
  readonly id = input<string>('');
  readonly catId = input<string>('');
}

/** Mesma forma de aninhamento de `app.routes.ts`, com os pais componentless. */
const nested = [
  {
    path: 'eventos/:id',
    children: [
      {
        path: 'categorias/:catId',
        children: [
          {
            path: 'sorteio',
            children: [{ path: '', pathMatch: 'full' as const, component: SorteioDubleComponent }],
          },
        ],
      },
    ],
  },
];

describe('parâmetros de rota do sorteio', () => {
  it('entrega `id` e `catId` ao componente dois níveis abaixo', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(nested, withComponentInputBinding()),
      ],
    });

    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(
      '/eventos/torneio-1/categorias/categoria-9/sorteio',
      SorteioDubleComponent,
    );

    expect(component.id()).toBe('torneio-1');
    expect(component.catId()).toBe('categoria-9');
  });
});
