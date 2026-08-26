import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input, viewChild } from '@angular/core';

/**
 * Mapa da arena (Leaflet + tiles do OpenStreetMap) com pino da marca. Porta de `ArenaMap.tsx`.
 * O Leaflet toca `window` no import, então entra por import dinâmico dentro de
 * `afterNextRender` (equivalente ao `useEffect` da fonte) — o container já ocupa o espaço
 * final via CSS, sem salto de layout. Cleanup via `DestroyRef` chamando `map.remove()`.
 *
 * `leaflet/dist/leaflet.css` é registrado no `styles` global do build
 * (`angular.json` → projeto `site-ng`), não com um side-effect import aqui: a fonte Next.js
 * importa o CSS direto no componente (o webpack dela resolve os `url()` de
 * `images/marker-icon.png` etc. sem problema), mas o builder esbuild do Angular só resolve
 * assets referenciados em CSS quando o arquivo entra pela lista `styles` do `angular.json` —
 * um `import 'leaflet/dist/leaflet.css'` aqui quebra o build com "No loader is configured for
 * .png files".
 */
@Component({
  selector: 'app-arena-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `<div #container class="map" role="img" [attr.aria-label]="'Mapa — ' + label()"></div>`,
  styleUrl: './arena-map.scss',
})
export class ArenaMap {
  readonly lat = input.required<number>();
  readonly lng = input.required<number>();
  readonly label = input.required<string>();

  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('container');

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      let cancelled = false;
      let map: { remove: () => void } | null = null;

      void (async () => {
        const L = (await import('leaflet')).default;
        if (cancelled) return;

        const instance = L.map(this.container().nativeElement, {
          scrollWheelZoom: false,
          attributionControl: true,
        }).setView([this.lat(), this.lng()], 15);

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(instance);

        L.marker([this.lat(), this.lng()], {
          alt: this.label(),
          icon: L.divIcon({
            className: '',
            html: '<div class="arena-map-pin"></div>',
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          }),
        }).addTo(instance);

        map = instance;
      })();

      destroyRef.onDestroy(() => {
        cancelled = true;
        map?.remove();
      });
    });
  }
}
