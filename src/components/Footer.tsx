import { useEffect, useState } from 'react';
import { fetchVersion } from '@/lib/api';

export default function Footer() {
  const [version, setVersion] = useState('');

  useEffect(() => {
    fetchVersion().then(v => setVersion(v.version)).catch(() => {});
  }, []);

  return (
    <footer className="py-5 text-center text-[11px] text-ink-tertiary hairline-t">
      <p className="tracking-tight">数据来源：25 个飞书投资群 · 每 5 分钟更新 · 仅供参考</p>
      {version && <p className="text-ink-quaternary mt-1 font-num text-[10px]">v{version}</p>}
    </footer>
  );
}
