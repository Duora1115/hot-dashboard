import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from './Navbar';
import Footer from './Footer';
import { useAutoTheme } from '@/hooks/useAutoTheme';

// Apple-ish spring curve, snappier than the previous 0.35s ease.
const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] },
};

export default function Layout() {
  const { theme, toggle } = useAutoTheme();
  const { pathname } = useLocation();
  return (
    <div className="noise-overlay min-h-[100dvh] flex flex-col bg-background text-foreground">
      <Navbar theme={theme} onToggleTheme={toggle} />
      <main className="flex-1 px-4 py-4 md:px-6 md:py-6 max-w-[1440px] mx-auto w-full">
        <motion.div
          key={pathname}
          initial={pageTransition.initial}
          animate={pageTransition.animate}
          transition={pageTransition.transition}
          className="h-full"
        >
          <Outlet />
        </motion.div>
      </main>
      <Footer />
    </div>
  );
}
