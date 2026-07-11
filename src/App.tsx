import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Replay from '@/pages/Replay';
import StockDetail from '@/pages/StockDetail';
import Sectors from '@/pages/Sectors';
import Sentiment from '@/pages/Sentiment';
import Report from '@/pages/Report';
import Compare from '@/pages/Compare';
import { useStore } from '@/store/useStore';

export default function App() {
  const init = useStore((s) => s.init);

  useEffect(() => {
    init();
    // Refresh every 5 minutes
    const interval = setInterval(() => {
      useStore.getState().refreshData();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [init]);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="replay" element={<Replay />} />
        <Route path="stock/:code" element={<StockDetail />} />
        <Route path="sectors" element={<Sectors />} />
        <Route path="sentiment" element={<Sentiment />} />
        <Route path="report" element={<Report />} />
        <Route path="compare" element={<Compare />} />
      </Route>
    </Routes>
  );
}
