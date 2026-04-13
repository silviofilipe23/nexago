import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { trigger, transition, style, query, group, animate } from '@angular/animations';

const pageOrder: Record<string, number> = {
  home: 0,
  login: 1,
  search: 2,
  arena: 3,
  checkout: 4,
  success: 5,
};

const routeAnimations = trigger('routeAnimations', [
  transition(':increment', [
    style({ position: 'relative' }),
    query(
      ':enter, :leave',
      [
        style({
          position: 'absolute',
          width: '100%',
          top: 0,
          left: 0,
        }),
      ],
      { optional: true },
    ),
    group([
      query(
        ':leave',
        [
          animate(
            '250ms ease',
            style({
              opacity: 0,
              transform: 'translateX(-20px) scale(0.98)',
              filter: 'blur(4px)',
            }),
          ),
        ],
        { optional: true },
      ),
      query(
        ':enter',
        [
          style({
            opacity: 0,
            transform: 'translateX(20px) scale(0.98)',
            filter: 'blur(4px)',
          }),
          animate(
            '300ms cubic-bezier(0.22, 1, 0.36, 1)',
            style({
              opacity: 1,
              transform: 'translateX(0) scale(1)',
              filter: 'blur(0)',
            }),
          ),
        ],
        { optional: true },
      ),
    ]),
  ]),
  transition(':decrement', [
    style({ position: 'relative' }),
    query(
      ':enter, :leave',
      [
        style({
          position: 'absolute',
          width: '100%',
          top: 0,
          left: 0,
        }),
      ],
      { optional: true },
    ),
    group([
      query(
        ':leave',
        [
          animate(
            '250ms ease',
            style({
              opacity: 0,
              transform: 'translateX(20px) scale(0.98)',
              filter: 'blur(4px)',
            }),
          ),
        ],
        { optional: true },
      ),
      query(
        ':enter',
        [
          style({
            opacity: 0,
            transform: 'translateX(-20px) scale(0.98)',
            filter: 'blur(4px)',
          }),
          animate(
            '300ms cubic-bezier(0.22, 1, 0.36, 1)',
            style({
              opacity: 1,
              transform: 'translateX(0) scale(1)',
              filter: 'blur(0)',
            }),
          ),
        ],
        { optional: true },
      ),
    ]),
  ]),
  transition('* <=> *', [
    style({ position: 'relative' }),
    query(
      ':enter, :leave',
      [
        style({
          position: 'absolute',
          width: '100%',
          top: 0,
          left: 0,
        }),
      ],
      { optional: true },
    ),
    group([
      query(':leave', [animate('150ms ease', style({ opacity: 0 }))], { optional: true }),
      query(':enter', [style({ opacity: 0 }), animate('200ms ease', style({ opacity: 1 }))], { optional: true }),
    ]),
  ]),
]);

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  animations: [routeAnimations],
})
export class App {
  protected readonly title = signal('site');

  protected prepareRoute(outlet: RouterOutlet): number {
    const key = outlet?.activatedRouteData?.['animation'];
    return typeof key === 'string' && key in pageOrder ? pageOrder[key] : 0;
  }

  protected shouldDisableAnimations(): boolean {
    if (typeof window === 'undefined' || !('matchMedia' in window)) {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
