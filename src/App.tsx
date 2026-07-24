import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useStore } from '@/store/useStore';

// Route-level code splitting: keeps the initial bundle to just what's needed
// to paint the shell (react + router + Layout + Navbar). Each page's JS +
// heavier deps (framer-motion, recharts) load on navigation.
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Replay = lazy(() => import('@/pages/Replay'));
const StockDetail = lazy(() => import('@/pages/StockDetail'));
const Sectors = lazy(() => import('@/pages/Sectors'));
const Sentiment = lazy(() => import('@/pages/Sentiment'));
const Report = lazy(() => import('@/pages/Report'));
const Compare = lazy(() => import('@/pages/Compare'));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center h-64 text-[#64748B] text-sm">
      加载中…
    </div>
  );
}

export default function App() {
  const init = useStore((s) => s.init);

  useEffect(() => {
    init();
    const interval = setInterval(() => {
      useStore.getState().refreshData();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [init]);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          index
          element={
            <Suspense fallback={<RouteFallback />}>
              <Dashboard />
            </Suspense>
          }
        />
        <Route
          path="replay"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Replay />
            </Suspense>
          }
        />
        <Route
          path="stock/:code"
          element={
            <Suspense fallback={<RouteFallback />}>
              <StockDetail />
            </Suspense>
          }
        />
        <Route
          path="sectors"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Sectors />
            </Suspense>
          }
        />
        <Route
          path="sentiment"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Sentiment />
            </Suspense>
          }
        />
        <Route
          path="report"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Report />
            </Suspense>
          }
        />
        <Route
          path="compare"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Compare />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
