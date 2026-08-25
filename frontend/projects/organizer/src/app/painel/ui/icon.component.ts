import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type OgIconName =
  | 'home'
  | 'trophy'
  | 'users'
  | 'cash'
  | 'gear'
  | 'bell'
  | 'search'
  | 'chevron'
  | 'check'
  | 'edit'
  | 'download'
  | 'plus'
  | 'mail'
  | 'flag'
  | 'bracket'
  | 'whistle'
  | 'alert'
  | 'clock'
  | 'grid'
  | 'calendar'
  | 'back'
  | 'close'
  | 'logout'
  | 'share'
  | 'team'
  | 'tv'
  | 'shirt'
  | 'flame'
  | 'phone'
  | 'whatsapp'
  | 'copy'
  | 'menu';

/** Ícones de contorno do design system NexaGO — mesmo traçado do protótipo (stroke 24, 1.8–2.2px). */
@Component({
  selector: 'og-icon',
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
        @case ('trophy') {
          <path d="M8 21h8M12 17v4" /><path d="M7 4h10v6a5 5 0 0 1-10 0V4z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
        }
        @case ('users') {
          <circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 5a3.5 3.5 0 0 1 0 6.8M21 20c0-2.6-1.6-4.8-4-5.6" />
        }
        @case ('cash') {
          <rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 6v0M18 18v0" />
        }
        @case ('gear') {
          <circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
        }
        @case ('bell') {
          <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 20a2.2 2.2 0 0 0 4 0" />
        }
        @case ('search') {
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        }
        @case ('chevron') {
          <path d="m9 6 6 6-6 6" />
        }
        @case ('check') {
          <path d="m4.5 12.5 5 5 10-11" />
        }
        @case ('edit') {
          <path d="M4 20h4L20 8l-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" />
        }
        @case ('download') {
          <path d="M12 4v11M7.5 11 12 15.5 16.5 11" /><path d="M4 19h16" />
        }
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('mail') {
          <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        }
        @case ('flag') {
          <path d="M5 21V4" /><path d="M5 4h13l-2.5 4L18 12H5" />
        }
        @case ('bracket') {
          <path d="M4 5h4v4H4zM4 15h4v4H4zM16 10h4v4h-4z" /><path d="M8 7h3a2 2 0 0 1 2 2v0M8 17h3a2 2 0 0 0 2-2v0M13 12h3" />
        }
        @case ('whistle') {
          <circle cx="8" cy="15" r="5" /><path d="M13 12h5a3 3 0 0 0 3-3V7l-3 2h-5" /><path d="M8 12v0" />
        }
        @case ('alert') {
          <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
        }
        @case ('clock') {
          <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
        }
        @case ('grid') {
          <rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" />
        }
        @case ('calendar') {
          <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
        }
        @case ('back') {
          <path d="m15 6-6 6 6 6" />
        }
        @case ('close') {
          <path d="M6 6l12 12M18 6 6 18" />
        }
        @case ('logout') {
          <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" /><path d="m16 17 5-5-5-5M21 12H9" />
        }
        @case ('team') {
          <circle cx="12" cy="7.5" r="3.5" /><path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7" />
        }
        @case ('tv') {
          <rect x="2.5" y="4.5" width="19" height="13" rx="2" /><path d="M8.5 21h7" />
        }
        @case ('shirt') {
          <path d="M9 3.5 12 6l3-2.5 4.5 2.2-1.5 4.3 2 .8V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9.2l2-.8L4.5 5.7 9 3.5z" />
        }
        @case ('flame') {
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        }
        @case ('phone') {
          <path d="M6.5 3h3l1.5 4-2 1.4a13 13 0 0 0 6.6 6.6L17 13l4 1.5v3a2.5 2.5 0 0 1-2.7 2.5C10.4 19.5 4.5 13.6 4 5.7A2.5 2.5 0 0 1 6.5 3z" />
        }
        @case ('whatsapp') {
          <path d="M3.5 20.5 5 16.4A8.2 8.2 0 1 1 8 19.3l-4.5 1.2z" /><path d="M9 9.2c.3 1 .8 2 1.6 2.8.8.8 1.7 1.3 2.7 1.6" />
        }
        @case ('copy') {
          <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2" />
        }
        @case ('menu') {
          <path d="M4 7h16M4 12h16M4 17h16" />
        }
        @case ('share') {
          <circle cx="18" cy="5" r="2.7" /><circle cx="6" cy="12" r="2.7" /><circle cx="18" cy="19" r="2.7" />
          <path d="m8.4 10.7 7.2-4.1M8.4 13.3l7.2 4.1" />
        }
      }
    </svg>
  `,
})
export class OgIconComponent {
  readonly name = input.required<OgIconName>();
  readonly size = input(18);
  readonly strokeWidth = input(1.8);
}
