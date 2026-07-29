import { useAppearanceModes } from '@/hooks/useAppearanceModes';
import { cn } from '@/lib/utils';

/**
 * Compact Bright / Dark / Hacker switch for the top of the app (sidebar top
 * row, mobile top bar). Expanded: a 3-icon segmented control. Compact: one
 * button showing the current mode that cycles to the next on click.
 */
export function ThemeQuickSwitch({ compact = false }: { compact?: boolean }) {
  const modes = useAppearanceModes();

  if (compact) {
    const currentIndex = modes.findIndex((m) => m.active);
    const current = modes[currentIndex] ?? modes[0];
    const next = modes[(currentIndex + 1 + modes.length) % modes.length];
    const Icon = current.icon;
    return (
      <button
        type="button"
        onClick={next.onSelect}
        aria-label={`Theme: ${current.label} — switch to ${next.label}`}
        title={`Theme: ${current.label} — switch to ${next.label}`}
        className="flex items-center justify-center size-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
      >
        <Icon className="size-4" />
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Color mode"
      className="flex items-center gap-0.5 rounded-full border border-border bg-background/85 p-0.5"
    >
      {modes.map(({ id, label, icon: Icon, active, onSelect }) => (
        <button
          key={id}
          type="button"
          onClick={onSelect}
          aria-pressed={active}
          aria-label={label}
          title={label}
          className={cn(
            'flex items-center justify-center size-6 rounded-full transition-colors',
            active
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60',
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
