interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<NonNullable<BrandMarkProps['size']>, string> = {
  sm: 'h-9 w-9 rounded-lg text-xs',
  md: 'h-11 w-11 rounded-xl text-sm',
  lg: 'h-16 w-16 rounded-2xl text-xl',
};

export function BrandMark({ size = 'md' }: BrandMarkProps) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center bg-gradient-to-br from-gold-300 to-gold-600 font-bold tracking-tight text-brand-950 shadow-lg shadow-brand-950/20 ring-1 ring-white/30 ${SIZE_CLASSES[size]}`}
      aria-hidden="true"
    >
      <span className="absolute inset-1 rounded-[inherit] border border-white/25" />
      B2
    </div>
  );
}
