import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';

const BBOX_DEGREES = 0.006;
/** Trava a precisão da bbox em 6 casas decimais (~0.1m) — sem isso, subtração/soma de
 *  ponto flutuante pode gerar dígitos extras (ex.: 10.011000000000001) na URL. */
const COORD_PRECISION = 6;

function round(n: number): number {
  return Number(n.toFixed(COORD_PRECISION));
}

/** Monta a URL de embed público do OpenStreetMap: bbox ~600m ao redor do ponto + marcador. */
export function buildOsmEmbedUrl(lat: number, lng: number): string {
  const west = round(lng - BBOX_DEGREES);
  const south = round(lat - BBOX_DEGREES);
  const east = round(lng + BBOX_DEGREES);
  const north = round(lat + BBOX_DEGREES);
  const bbox = `${west},${south},${east},${north}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

@Component({
  selector: 'app-location-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (embedUrl(); as url) {
      <iframe
        class="lm-frame"
        [src]="url"
        [attr.title]="'Mapa de ' + label()"
        loading="lazy"
        referrerpolicy="no-referrer"
      ></iframe>
    } @else {
      <div class="lm-fallback">
        <span>Localização não disponível no mapa</span>
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .lm-frame {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
    }
    .lm-fallback {
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      text-align: center;
      padding: 0 12px;
    }
  `],
})
export class LocationMapComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly lat = input<number | null>(null);
  readonly lng = input<number | null>(null);
  readonly label = input<string>('arena');

  protected readonly embedUrl = computed<SafeResourceUrl | null>(() => {
    const lat = this.lat();
    const lng = this.lng();
    if (lat == null || lng == null) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(buildOsmEmbedUrl(lat, lng));
  });
}
