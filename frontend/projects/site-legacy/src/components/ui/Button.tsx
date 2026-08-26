import Link from 'next/link';
import type { ComponentProps } from 'react';

type Variant = 'primary' | 'secondary';

const base =
  'inline-flex items-center justify-center gap-2 rounded-pill font-semibold ' +
  'min-h-[48px] px-6 text-[15px] tracking-tight transition-all duration-200 ease-out ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-bg cursor-pointer select-none';

const variants: Record<Variant, string> = {
  primary:
    'bg-brand text-on-brand shadow-glow-orange hover:bg-brand-light active:bg-brand-dark active:scale-[0.98]',
  secondary:
    'bg-surface-1 text-fg border border-line-strong hover:border-brand hover:text-brand active:scale-[0.98]',
};

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant };

export function ButtonLink({ variant = 'primary', className = '', ...props }: ButtonLinkProps) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

type ButtonProps = ComponentProps<'button'> & { variant?: Variant };

export function Button({ variant = 'primary', className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
