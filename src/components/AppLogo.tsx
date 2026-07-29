import { useAppContext } from '@/hooks/useAppContext';
import { cn } from '@/lib/utils';

interface AppLogoProps {
  className?: string;
  size?: number;
}

/** The app logo — ₿AO branding used in the sidebar, top bar, and loading screens. */
export function AppLogo({ className, size = 40 }: AppLogoProps) {
  const { config } = useAppContext();

  return (
    <img
      src="/bao-icon.png"
      alt={config.appName}
      width={size}
      height={size}
      className={cn('block object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}
