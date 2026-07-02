import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type PanelIconName =
  | 'home'
  | 'arena'
  | 'trophy'
  | 'users'
  | 'cash'
  | 'shield'
  | 'team'
  | 'gear'
  | 'bell'
  | 'search'
  | 'chevron-right'
  | 'check'
  | 'alert'
  | 'clock'
  | 'key'
  | 'lock'
  | 'edit'
  | 'camera'
  | 'logout'
  | 'plus'
  | 'download'
  | 'mail'
  | 'flag'
  | 'trend-up'
  | 'filter'
  | 'ticket'
  | 'swap'
  | 'archive'
  | 'ban'
  | 'trash';

/** Ícones stroke-24 do painel (mesmo conjunto do protótipo BoIc*), um componente para evitar repetir SVG. */
@Component({
  selector: 'bo-icon',
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
        @case ('arena') {
          <rect x="3" y="7" width="18" height="13" rx="2" /><path d="M3 13.5h18M12 7v13" /><path d="M8 7V4h8v3" />
        }
        @case ('trophy') {
          <path d="M8 21h8M12 17v4" /><path d="M7 4h10v6a5 5 0 0 1-10 0V4z" />
          <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
        }
        @case ('users') {
          <circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          <path d="M16 5a3.5 3.5 0 0 1 0 6.8M21 20c0-2.6-1.6-4.8-4-5.6" />
        }
        @case ('cash') {
          <rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 6v0M18 18v0" />
        }
        @case ('shield') {
          <path d="M12 3 4.5 6v5.5c0 4.6 3.2 7.8 7.5 9.5 4.3-1.7 7.5-4.9 7.5-9.5V6L12 3z" />
        }
        @case ('team') {
          <circle cx="12" cy="7.5" r="3.5" /><path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7" />
        }
        @case ('gear') {
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
        }
        @case ('bell') {
          <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 20a2.2 2.2 0 0 0 4 0" />
        }
        @case ('search') {
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        }
        @case ('chevron-right') {
          <path d="m9 6 6 6-6 6" />
        }
        @case ('check') {
          <path d="m4.5 12.5 5 5 10-11" />
        }
        @case ('alert') {
          <path d="M12 3 2.5 20h19L12 3z" /><path d="M12 10v4M12 17.2h.01" />
        }
        @case ('clock') {
          <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
        }
        @case ('key') {
          <circle cx="8" cy="14" r="4.5" /><path d="m11.5 10.5 8-8M17 4l3 3M14.5 6.5l3 3" />
        }
        @case ('lock') {
          <rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
        }
        @case ('edit') {
          <path d="M4 20h4L20 8l-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" />
        }
        @case ('camera') {
          <rect x="3" y="7" width="18" height="13" rx="2" /><circle cx="12" cy="13" r="3.5" /><path d="M8 7l1.5-2.5h5L16 7" />
        }
        @case ('logout') {
          <path d="M9 4H5v16h4" /><path d="M14 8l4 4-4 4M18 12H9" />
        }
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('download') {
          <path d="M12 4v11M7.5 11 12 15.5 16.5 11" /><path d="M4 19h16" />
        }
        @case ('mail') {
          <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        }
        @case ('flag') {
          <path d="M5 21V4" /><path d="M5 4h13l-2.5 4L18 12H5" />
        }
        @case ('trend-up') {
          <path d="M12 19V5M5 12l7-7 7 7" />
        }
        @case ('filter') {
          <path d="M4 5h16M7 12h10M10 19h4" />
        }
        @case ('ticket') {
          <path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3v3z" /><path d="M10 6v12" />
        }
        @case ('swap') {
          <path d="M7 7h11l-3-3M17 17H6l3 3" />
        }
        @case ('archive') {
          <rect x="3" y="4" width="18" height="5" rx="1.2" /><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" /><path d="M10 13h4" />
        }
        @case ('ban') {
          <circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" />
        }
        @case ('trash') {
          <path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" />
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
