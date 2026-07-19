import { useEffect, useState } from 'react';
import { fetchVersion } from '@/lib/api';

export default function Footer() {
  const [version, setVersion] = useState('');

  useEffect(() => {
    fetchVersion().then(v => setVersion(v.version)).catch(() => {});
  }, []);

  return (
    <footer className="py-4 text-center text-xs text-[#475569] border-t border-[#1E293B] bg-[#0B0E14]">
      <p>数据来源：25个飞书投资群 | 每5分钟更新 | 仅供参考</p>
      {version && <p className="text-[#334155] mt-1 font-mono">version: {version}</p>}
    </footer>
  );
}
