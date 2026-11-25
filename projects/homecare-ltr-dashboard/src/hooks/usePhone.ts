import { useEffect, useState } from 'react';

/** Phone-width layout (below Tailwind's `md`, 768 px). */
export const PHONE_QUERY = '(max-width: 767px)';
export function usePhone(): boolean {
  const mq = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(PHONE_QUERY) : null);
  const [phone, setPhone] = useState(() => !!mq()?.matches);
  useEffect(() => {
    const m = mq(); if (!m) return;
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}
