
interface LinkFooterProps {
  /** Optional callback fired when an internal (React Router) link is clicked. */
  onNavigate?: () => void;
}

const chipClass =
  'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors';

/** Shared footer links used in both sidebars. */
export function LinkFooter({ onNavigate }: LinkFooterProps) {
  return (
    <footer className="mt-auto pt-3 pb-3 -mx-1 sidebar:bg-background/85 sidebar:rounded-xl sidebar:p-3">
      <nav className="flex items-center justify-center gap-0.5 flex-wrap" aria-label="Footer links">
        <a href="https://bao.markets" target="_blank" rel="noreferrer" className={chipClass} onClick={onNavigate}>
          bao.markets
        </a>
      </nav>
    </footer>
  );
}
