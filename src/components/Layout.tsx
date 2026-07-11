import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from './Navbar';
import Footer from './Footer';

const pageTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.9] as [number, number, number, number] },
};

export default function Layout() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#0B0E14] text-[#F1F5F9]">
      <Navbar />
      <main className="flex-1 px-4 py-4 md:px-6 md:py-6 max-w-[1440px] mx-auto w-full">
        <motion.div
          key={location.pathname}
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
