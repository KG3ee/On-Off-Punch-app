import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const themeStorageKey = 'modern-punch-theme';

export function useTheme() {
    const [theme, setTheme] = useState<Theme>('light');

    useEffect(() => {
        const storedTheme = window.localStorage.getItem(themeStorageKey);
        const resolvedTheme: Theme =
            storedTheme === 'dark' || storedTheme === 'light'
                ? storedTheme
                : window.matchMedia('(prefers-color-scheme: dark)').matches
                    ? 'dark'
                    : 'light';
        setTheme(resolvedTheme);
        document.documentElement.setAttribute('data-theme', resolvedTheme);
    }, []);

    function toggleTheme() {
        const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
        document.documentElement.setAttribute('data-theme', nextTheme);
        window.localStorage.setItem(themeStorageKey, nextTheme);
    }

    return { theme, toggleTheme };
}
