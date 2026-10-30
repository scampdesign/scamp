import { useEffect, useState } from 'react';

type WindowSize = { width: number; height: number };

const current = (): WindowSize => ({ width: window.innerWidth, height: window.innerHeight });

/** The window's inner size, kept current as it resizes. */
export const useWindowSize = (): WindowSize => {
  const [size, setSize] = useState<WindowSize>(current);
  useEffect(() => {
    const handleResize = (): void => setSize(current());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return size;
};
