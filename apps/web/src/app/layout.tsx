import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Modern Punch Dashboard',
  description: 'Prototype for duty + break dashboard',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg'
  }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="dark">
      <body>
        {children}
      </body>
    </html>
  );
}
