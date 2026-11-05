import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { youtubeThumbnailUrl, type VideoProvider } from '../../../../lib/blog/video';

const PROVIDER_LABEL: Record<VideoProvider, string> = { youtube: 'YouTube', instagram: 'Instagram' };

/**
 * Bloco "Vídeo" do post: sem player embutido (sem iframe). Card com a miniatura do YouTube — ou
 * uma arte padrão para Instagram / link sem id — que abre o vídeo em nova aba.
 */
@Component({
  selector: 'app-blog-video-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <a
      [href]="url()"
      target="_blank"
      rel="noopener noreferrer"
      [attr.aria-label]="ariaLabel()"
      class="group block overflow-hidden rounded-4 border border-line bg-surface-1 transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <div class="relative aspect-video overflow-hidden bg-surface-2">
        @if (thumbnail(); as src) {
          <img [src]="src" alt="" loading="lazy" (error)="failed.set(true)" class="size-full object-cover" />
        } @else {
          <div class="flex size-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-surface-2 to-surface-1 text-text-dim">
            @if (provider() === 'instagram') {
              <svg class="size-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
              </svg>
            } @else {
              <svg class="size-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" /><path d="m10 15 5-3-5-3z" />
              </svg>
            }
            <span class="text-sm font-600">Vídeo no {{ providerLabel() }}</span>
          </div>
        }
        @if (thumbnail()) {
          <span class="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <span class="flex size-14 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-transform group-hover:scale-105 motion-reduce:transition-none">
              <svg class="ml-0.5 size-6" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
            </span>
          </span>
        }
      </div>
      <div class="flex items-center justify-between gap-3 px-4 py-3">
        <p class="min-w-0 text-sm text-text-mute">{{ caption() || 'Vídeo' }}</p>
        <span class="inline-flex shrink-0 items-center gap-1 text-sm font-600 text-brand">
          Assistir no {{ providerLabel() }}
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          </svg>
        </span>
      </div>
    </a>
  `,
})
export class BlogVideoBlock {
  readonly url = input.required<string>();
  readonly caption = input('');
  readonly provider = input.required<VideoProvider>();
  readonly youtubeId = input<string | null>(null);

  protected readonly failed = linkedSignal({ source: this.youtubeId, computation: () => false });
  protected readonly thumbnail = computed(() => {
    const id = this.youtubeId();
    return id && !this.failed() ? youtubeThumbnailUrl(id) : null;
  });
  protected readonly providerLabel = computed(() => PROVIDER_LABEL[this.provider()]);
  protected readonly ariaLabel = computed(
    () => `${this.caption() || 'Vídeo'} — assistir no ${this.providerLabel()} (abre em nova aba)`,
  );
}
