import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { APP_STORE_URL, GOOGLE_PLAY_COMING_SOON, GOOGLE_PLAY_URL, isGooglePlayAvailable } from '../../../lib/store-links';
import { ToastService } from './toast';

@Component({
  selector: 'app-store-buttons',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <div [class]="className()">
      <a
        [href]="appStoreUrl"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Baixar na App Store"
        [class]="itemClasses()"
      >
        <svg [class]="appleIconClasses() + ' shrink-0'" fill="currentColor" viewBox="0 0 384 512" aria-hidden="true">
          <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
        </svg>
        <span class="text-left">
          <span [class]="topLabelClasses()">Baixar na</span>
          <span [class]="mainLabelClasses()">App Store</span>
        </span>
      </a>
      <a
        [href]="playReady ? googlePlayUrl : '#'"
        (click)="onGooglePlayClick($event)"
        [attr.aria-label]="playReady ? 'Disponível no Google Play' : 'Google Play — em breve'"
        [attr.target]="playReady ? '_blank' : null"
        [attr.rel]="playReady ? 'noopener noreferrer' : null"
        [class]="itemClasses()"
      >
        <svg [class]="playIconClasses() + ' shrink-0'" fill="currentColor" viewBox="0 0 512 512" aria-hidden="true">
          <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z" />
        </svg>
        <span class="text-left">
          <span [class]="topLabelClasses()">Disponível no</span>
          <span [class]="mainLabelClasses()">Google Play</span>
        </span>
      </a>
    </div>
  `,
})
export class StoreButtons {
  readonly size = input<'sm' | 'md'>('md');
  readonly className = input('');
  readonly itemClassName = input('');

  protected readonly appStoreUrl = APP_STORE_URL;
  protected readonly googlePlayUrl = GOOGLE_PLAY_URL;
  protected readonly playReady = isGooglePlayAvailable();

  private readonly toastService = inject(ToastService);

  private static readonly BASE =
    'group inline-flex items-center justify-center gap-3 rounded-4 border border-line-strong bg-surface-1 ' +
    'text-fg transition-all duration-200 ease-out hover:border-brand hover:-translate-y-0.5 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

  private static readonly SIZES = {
    sm: { pad: 'px-4 py-2.5', apple: 'size-5', play: 'size-[18px]', top: 'text-[9px]', main: 'text-sm' },
    md: { pad: 'px-6 py-3.5', apple: 'size-7', play: 'size-6', top: 'text-[10px]', main: 'text-lg' },
  } as const;

  protected itemClasses(): string {
    const s = StoreButtons.SIZES[this.size()];
    return `${StoreButtons.BASE} ${s.pad} ${this.itemClassName()}`;
  }

  protected appleIconClasses(): string {
    return StoreButtons.SIZES[this.size()].apple;
  }

  protected playIconClasses(): string {
    return StoreButtons.SIZES[this.size()].play;
  }

  protected topLabelClasses(): string {
    return `block ${StoreButtons.SIZES[this.size()].top} font-600 uppercase tracking-wider text-text-dim`;
  }

  protected mainLabelClasses(): string {
    return `block ${StoreButtons.SIZES[this.size()].main} font-700 leading-none tracking-tight`;
  }

  protected onGooglePlayClick(event: MouseEvent): void {
    if (this.playReady) return;
    event.preventDefault();
    this.toastService.show(GOOGLE_PLAY_COMING_SOON);
  }
}
