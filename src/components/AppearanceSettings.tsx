import { useAppearanceModes, type AppearanceModeId } from '@/hooks/useAppearanceModes';
import { cn } from '@/lib/utils';

const DETAILS: Record<AppearanceModeId, { description: string; preview: string; dot: string }> = {
  bright: { description: 'Light background, dark text', preview: 'bg-[#fafafa] border', dot: 'bg-[#09090b]' },
  dark: { description: 'Black background, light text', preview: 'bg-black', dot: 'bg-[#fafafa]' },
  hacker: { description: 'Black background, green mono font', preview: 'bg-black', dot: 'bg-[#22c55e]' },
};

/**
 * Appearance picker: Bright / Dark / Hacker. Mode definitions live in
 * useAppearanceModes (shared with the ThemeQuickSwitch in the sidebar/top
 * bar). The choice persists via useTheme → AppConfig (+ encrypted settings
 * sync when logged in).
 */
export function AppearanceSettings() {
  const modes = useAppearanceModes();

  return (
    <section className="px-3 pb-4">
      <h2 className="text-sm font-semibold">Appearance</h2>
      <p className="text-xs text-muted-foreground mt-1 mb-3 leading-relaxed">
        Color mode for the whole app. Hacker mode is pure black with a green monospace font.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {modes.map(({ id, label, icon: Icon, active, onSelect }) => {
          const { description, preview, dot } = DETAILS[id];
          return (
            <button
              key={id}
              type="button"
              onClick={onSelect}
              aria-pressed={active}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors hover:border-foreground/40',
                active ? 'border-primary ring-1 ring-primary' : 'border-border',
              )}
            >
              <div className={cn('mb-2 flex h-10 items-center justify-center rounded-md', preview)}>
                <span className={cn('size-2.5 rounded-full', dot)} />
              </div>
              <div className="flex items-center gap-1.5">
                <Icon className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold">{label}</span>
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground leading-snug">{description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
