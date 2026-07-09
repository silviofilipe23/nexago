import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type PanelIconName =
  | 'home'
  | 'calendar'
  | 'cash'
  | 'trophy'
  | 'courts'
  | 'team'
  | 'person'
  | 'gear'
  | 'chevron-right'
  | 'search'
  | 'bell'
  | 'plus'
  | 'download'
  | 'edit'
  | 'mail'
  | 'star'
  | 'share';

/** Ícones stroke-24 do painel da arena (protótipo Ar\*\/Bo\*\/At\* Ic\*), um componente para evitar repetir SVG. */
@Component({
  selector: 'ar-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @switch (name()) {
        @case ('home') {
          <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-6h6v6" />
        }
        @case ('calendar') {
          <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
        }
        @case ('cash') {
          <rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 6v0M18 18v0" />
        }
        @case ('trophy') {
          <path d="M8 21h8M12 17v4" /><path d="M7 4h10v6a5 5 0 0 1-10 0V4z" />
          <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
        }
        @case ('courts') {
          <rect x="3" y="6" width="18" height="12" rx="1.5" /><path d="M12 6v12M3 12h18M7 6v3M17 6v3M7 15v3M17 15v3" />
        }
        @case ('team') {
          <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
          <circle cx="17.5" cy="8.5" r="2.6" /><path d="M15.2 13.2c2.9.4 5.3 2.9 5.3 6.3" />
        }
        @case ('person') {
          <circle cx="12" cy="8" r="4" /><path d="M4 21c0-3.9 3.6-7 8-7s8 3.1 8 7" />
        }
        @case ('gear') {
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
        }
        @case ('chevron-right') {
          <path d="m9 6 6 6-6 6" />
        }
        @case ('search') {
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        }
        @case ('bell') {
          <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 20a2.2 2.2 0 0 0 4 0" />
        }
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('download') {
          <path d="M12 4v11M7.5 11 12 15.5 16.5 11" /><path d="M4 19h16" />
        }
        @case ('edit') {
          <path d="M4 20h4L20 8l-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" />
        }
        @case ('mail') {
          <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        }
        @case ('star') {
          <path d="m12 2.5 3.1 6.5 7.1 1-5.1 5 1.2 7.1L12 18.7l-6.3 3.4 1.2-7.1-5.1-5 7.1-1z" />
        }
        @case ('share') {
          <circle cx="18" cy="5" r="2.7" /><circle cx="6" cy="12" r="2.7" /><circle cx="18" cy="19" r="2.7" />
          <path d="m8.4 10.7 7.2-4.1M8.4 13.3l7.2 4.1" />
        }
      }
    </svg>
  `,
})
export class IconComponent {
  readonly name = input.required<PanelIconName>();
  readonly size = input(18);
  readonly strokeWidth = input(1.8);
}
