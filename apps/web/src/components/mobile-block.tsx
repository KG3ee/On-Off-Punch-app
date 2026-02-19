'use client';

import { useEffect, useMemo, useState } from 'react';

function detectMobile(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const uaMobile = /android|iphone|ipad|ipod|mobile|windows phone/i.test(ua);
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const narrow = window.innerWidth < 900;
  return uaMobile || (coarse && narrow);
}

export function useIsMobileClient(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = (): void => setIsMobile(detectMobile());
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}

export function MobileBlockedNotice({ title = 'Desktop only' }: { title?: string }) {
  const subtitle = useMemo(
    () => 'This system is only allowed on office desktop. Please use a workplace computer.',
    []
  );

  return (
    <main className="mobile-block-page">
      <section className="mobile-block-card">
        <img src="/icon.svg" className="mobile-block-logo" alt="Punch" />
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </section>
    </main>
  );
}
