'use client';

import { useEffect, useMemo, useState } from 'react';
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = mounted ? theme ?? 'system' : 'system';
  const appearance = mounted ? resolvedTheme ?? systemTheme ?? 'light' : 'light';
  const StatusIcon = appearance === 'dark' ? Moon : Sun;
  const systemLabel = systemTheme === 'dark' ? 'Dark' : 'Light';

  const triggerLabel = useMemo(() => {
    if (!mounted) return 'Appearance';
    if (activeTheme === 'system') {
      return `Appearance: system (${systemLabel.toLowerCase()})`;
    }

    return `Appearance: ${activeTheme}`;
  }, [activeTheme, mounted, systemLabel]);

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
                {option.value === 'system' && mounted ? (
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
