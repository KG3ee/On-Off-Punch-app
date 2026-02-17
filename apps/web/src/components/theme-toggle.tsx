'use client';

import { useTheme } from '@/hooks/use-theme';

export function ThemeToggle({ className }: { className?: string }) {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            type="button"
            className={`button button-ghost ${className || ''}`}
            onClick={toggleTheme}
            aria-label="Toggle theme"
        >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
    );
}
