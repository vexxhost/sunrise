'use client';

import { useMemo } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsHydrated } from '@/hooks/useIsHydrated';

const themeOptions = [
  {
    value: 'system',
    label: 'System',
    icon: Monitor,
  },
  {
    value: 'light',
    label: 'Light',
    icon: Sun,
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: Moon,
  },
] as const;

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme, systemTheme } = useTheme();
  const isHydrated = useIsHydrated();

  const activeTheme = isHydrated ? theme ?? 'system' : 'system';
  const appearance = isHydrated ? resolvedTheme ?? systemTheme ?? 'light' : 'light';
  const StatusIcon = appearance === 'dark' ? Moon : Sun;
  const systemLabel = systemTheme === 'dark' ? 'Dark' : 'Light';

  const triggerLabel = useMemo(() => {
    if (!isHydrated) return 'Appearance';
    if (activeTheme === 'system') {
      return `Appearance: system (${systemLabel.toLowerCase()})`;
    }

    return `Appearance: ${activeTheme}`;
  }, [activeTheme, isHydrated, systemLabel]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 hover:bg-muted"
          aria-label={triggerLabel}
          title={triggerLabel}
        >
          <StatusIcon className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Appearance
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {themeOptions.map((option) => {
          const OptionIcon = option.icon;
          const isSelected = activeTheme === option.value;

          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => setTheme(option.value)}
              className="justify-between"
            >
              <span className="flex items-center gap-2">
                <OptionIcon className="h-3.5 w-3.5" />
                {option.label}
              </span>
              <span className="ml-auto flex items-center gap-2">
                {option.value === 'system' && isHydrated ? (
                  <span className="text-xs text-muted-foreground">
                    {systemLabel}
                  </span>
                ) : null}
                {isSelected ? <Check className="h-3.5 w-3.5 text-foreground" /> : null}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
