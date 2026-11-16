import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { APP_STORE_URL, GOOGLE_PLAY_URL } from '../../../lib/store-links';
import { detectPlatform, type DevicePlatform } from '../../../lib/platform';

interface StoreBadge {
  id: 'ios' | 'android';
  href: string;
  lead: string;
  name: string;
  /** "na App Store", "no Google Play". */
  at: string;
  label: string;
}

const BADGES: Record<'ios' | 'android', StoreBadge> = {
  ios: { id: 'ios', href: APP_STORE_URL, lead: 'Baixar na', name: 'App Store', at: 'na', label: 'Baixar o nexaGO na App Store' },
  android: {
    id: 'android',
    href: GOOGLE_PLAY_URL,
    lead: 'Disponível no',
    name: 'Google Play',
    at: 'no',
    label: 'Baixar o nexaGO no Google Play',
  },
};

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

/**
 * Chamada de download que já sabe em que aparelho está. No celular mostra um botão só, o da loja
 * daquele sistema, em largura cheia (e a outra loja vira um link discreto); no computador mostra
 * as duas lojas lado a lado. É o destino final de toda a home — não há outro botão primário nela.
 */
@Component({
  selector: 'app-download-cta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-wrap gap-3" [class.justify-center]="align() === 'center'">
      @for (badge of badges(); track badge.id) {
        <a
          [href]="badge.href"
          target="_blank"
          rel="noopener noreferrer"
          [attr.aria-label]="badge.label"
          [class]="badgeClasses()"
        >
          @if (badge.id === 'ios') {
            <svg class="size-7 shrink-0" fill="currentColor" viewBox="0 0 384 512" aria-hidden="true">
              <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
            </svg>
          } @else {
            <svg class="size-6 shrink-0" fill="currentColor" viewBox="0 0 512 512" aria-hidden="true">
              <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z" />
            </svg>
          }
          <span class="text-left leading-none">
            <span class="block text-[11px] font-500 opacity-70">{{ badge.lead }}</span>
            <span class="mt-1 block font-athletic text-[19px] font-800 tracking-tight">{{ badge.name }}</span>
          </span>
        </a>
      }
    </div>

    @if (other(); as alt) {
      <p class="mt-4 text-sm text-text-mute" [class.text-center]="align() === 'center'">
        Usa outro aparelho?
        <a
          [href]="alt.href"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-1 font-600 text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand {{ focus }}"
        >
          Baixe {{ alt.at }} {{ alt.name }}
        </a>
      </p>
    }
  `,
})
export class DownloadCta {
  readonly align = input<'start' | 'center'>('start');

  protected readonly focus = FOCUS;
  protected readonly platform: DevicePlatform = detectPlatform();

  /** No celular, só a loja do aparelho; no computador, as duas. */
  protected readonly badges = computed<StoreBadge[]>(() =>
    this.platform === 'desktop' ? [BADGES.ios, BADGES.android] : [BADGES[this.platform]],
  );

  protected readonly other = computed<StoreBadge | null>(() => {
    if (this.platform === 'ios') return BADGES.android;
    if (this.platform === 'android') return BADGES.ios;
    return null;
  });

  protected readonly badgeClasses = computed(() => {
    const base = `group inline-flex h-[60px] items-center gap-3 rounded-[16px] px-6 transition-[background-color,color,transform,box-shadow] duration-200 ease-out active:scale-[0.98] motion-reduce:transition-none ${FOCUS}`;
    // As duas lojas aparecem também numa tela estreita quando o aparelho não se identifica (navegador
    // embutido, modo de desenvolvedor): ali elas empilham em largura cheia, como o botão único do celular.
    return this.platform === 'desktop'
      ? `${base} w-full justify-center sm:w-auto sm:min-w-[188px] sm:justify-start bg-fg text-bg hover:bg-brand hover:text-on-brand hover:shadow-glow-orange`
      : `${base} w-full justify-center bg-brand text-on-brand shadow-glow-orange hover:bg-brand-light`;
  });
}
