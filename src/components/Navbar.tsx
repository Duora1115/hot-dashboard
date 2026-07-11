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
} from 'lucide-react';
import { useStore } from '@/store/useStore';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/replay', label: 'Replay', icon: PlayCircle },
  { path: '/sectors', label: 'Sectors', icon: Layers },
  { path: '/sentiment', label: 'Sentiment', icon: Activity },
  { path: '/report', label: 'Report', icon: FileText },
  { path: '/compare', label: 'Compare', icon: GitCompare },
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
    <nav className="sticky top-0 z-50 h-14 md:h-[56px] bg-[#111827] border-b border-[#1E293B]">
      <div className="h-full max-w-[1440px] mx-auto px-4 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src="/logo-icon.svg" alt="HotAlpha" className="w-7 h-7" />
          <span className="text-[#F1F5F9] font-semibold text-base tracking-tight hidden sm:inline">
            HotAlpha
          </span>
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center gap-1 relative">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`relative px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? 'text-[#F1F5F9]'
                    : 'text-[#64748B] hover:text-[#94A3B8] hover:bg-[#1A2332]'
                }`}
              >
                {item.label}
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute bottom-0 left-1.5 right-1.5 h-0.5 bg-[#3B82F6] rounded-full"
                    transition={springTransition}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Right side: status + time + mobile menu */}
        <div className="flex items-center gap-3">
          {/* Real-time status */}
          <div className="hidden sm:flex items-center gap-2">
            {replayMode === 'live' ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00E396] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#00E396]" />
                </span>
                <span className="text-[#00E396] text-xs font-medium">实时</span>
              </>
            ) : (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-[#FBBF24]" />
                <span className="text-[#FBBF24] text-xs font-medium">回放</span>
              </>
            )}
          </div>

          {/* Current time */}
          <span className="hidden lg:inline-block text-[#64748B] text-xs font-mono tabular-nums">
            {currentTime}
          </span>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-1.5 rounded-md text-[#94A3B8] hover:bg-[#1A2332] transition-colors"
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
            className="md:hidden bg-[#111827] border-b border-[#1E293B] overflow-hidden"
          >
            <div className="px-4 py-2 space-y-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[#1A2332] text-[#F1F5F9]'
                        : 'text-[#64748B] hover:text-[#94A3B8] hover:bg-[#1A2332]'
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
