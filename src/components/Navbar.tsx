import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  PlayCircle,
  Layers,
  Activity,
  FileText,
  GitCompare,
  Menu,
  X,
  TrendingUp,
} from 'lucide-react';
import { useStore } from '@/store/useStore';

const navItems = [
  { path: '/', label: '仪表盘', icon: LayoutDashboard },
  { path: '/replay', label: '回放', icon: PlayCircle },
  { path: '/sectors', label: '板块', icon: Layers },
  { path: '/sentiment', label: '情绪', icon: Activity },
  { path: '/report', label: '晨报', icon: FileText },
  { path: '/compare', label: '对比', icon: GitCompare },
];

const springTransition = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
};

export default function Navbar() {
  const location = useLocation();
  const isMobileMenuOpen = useStore((s) => s.isMobileMenuOpen);
  const setIsMobileMenuOpen = useStore((s) => s.setIsMobileMenuOpen);
  const replayMode = useStore((s) => s.replayMode);
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const h = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      setCurrentTime(`${y}-${m}-${d} ${h}:${min}:${s}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <nav className="sticky top-0 z-50 h-14 md:h-[56px] vibrancy hairline-b">
      <div className="h-full max-w-[1440px] mx-auto px-4 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-[8px] bg-gradient-to-br from-brand-blue to-brand-cyan flex items-center justify-center shadow-[0_0_16px_-4px_rgba(10,132,255,0.5)]">
            <TrendingUp className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-ink-primary font-semibold text-[15px] tracking-tight hidden sm:inline">
            HotAlpha
          </span>
        </Link>

        {/* Desktop Nav Links — Apple segmented-style pill indicator */}
        <div className="hidden md:flex items-center gap-0.5 relative">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`relative px-3 py-1.5 rounded-[8px] text-[13.5px] font-medium transition-colors duration-150 ${
                  isActive
                    ? 'text-ink-primary'
                    : 'text-ink-tertiary hover:text-ink-secondary'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute inset-0 rounded-[8px] bg-hover/[0.08]"
                    transition={springTransition}
                  />
                )}
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Right side: status + time + mobile menu */}
        <div className="flex items-center gap-3">
          {/* Real-time status */}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-hover/[0.04]">
            {replayMode === 'live' ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-green opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-green" />
                </span>
                <span className="text-brand-green text-[11px] font-medium tracking-tight">实时</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-brand-yellow" />
                <span className="text-brand-yellow text-[11px] font-medium tracking-tight">回放</span>
              </>
            )}
          </div>

          {/* Current time */}
          <span className="hidden lg:inline-block text-ink-tertiary text-[11px] font-num">
            {currentTime}
          </span>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-1.5 rounded-[8px] text-ink-secondary hover:bg-hover/[0.06] transition-colors"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden vibrancy hairline-b overflow-hidden"
          >
            <div className="px-4 py-2 space-y-0.5">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[14px] font-medium transition-colors ${
                      isActive
                        ? 'bg-hover/[0.06] text-ink-primary'
                        : 'text-ink-tertiary hover:text-ink-secondary hover:bg-hover/[0.04]'
                    }`}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
