import { motion, useScroll, useSpring } from 'framer-motion';

export default function ReadingProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 24,
    mass: 0.35,
  });

  return (
    <motion.div
      aria-hidden
      className="reading-progress-bar fixed left-0 right-0 top-0 z-[60] h-[2px] bg-gradient-to-r from-brand-blue via-brand-cyan to-brand-purple"
      style={{ scaleX }}
    />
  );
}
