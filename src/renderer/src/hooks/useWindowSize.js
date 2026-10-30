import { useEffect, useState } from 'react';
const current = () => ({ width: window.innerWidth, height: window.innerHeight });
/** The window's inner size, kept current as it resizes. */
export const useWindowSize = () => {
    const [size, setSize] = useState(current);
    useEffect(() => {
        const handleResize = () => setSize(current());
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    return size;
};
