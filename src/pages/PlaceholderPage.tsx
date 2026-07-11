import { motion } from 'framer-motion';
import {
  PlayCircle,
  Layers,
  Activity,
  FileText,
  GitCompare,
  TrendingUp,
  ArrowLeft,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Replay: PlayCircle,
  'Stock Detail': TrendingUp,
  Sectors: Layers,
  Sentiment: Activity,
  Report: FileText,
  Compare: GitCompare,
};

interface PlaceholderPageProps {
  name: string;
}

export default function PlaceholderPage({ name }: PlaceholderPageProps) {
  const navigate = useNavigate();
  const { code } = useParams();
  const Icon = iconMap[name] || TrendingUp;
  const displayName = code ? `${name} (${code})` : name;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center min-h-[50vh] text-center"
    >
      <div className="w-20 h-20 rounded-full bg-[#1A2332] flex items-center justify-center mb-6">
        <Icon size={36} className="text-[#3B82F6]" />
      </div>
      <h1 className="text-2xl font-semibold text-[#F1F5F9] mb-2">{displayName}</h1>
      <p className="text-[#64748B] text-sm mb-6 max-w-md">
        此页面正在开发中，将在后续版本中上线。
      </p>
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 px-4 py-2 bg-[#1A2332] hover:bg-[#1E293B] text-[#94A3B8] hover:text-[#F1F5F9] rounded-[10px] text-sm font-medium transition-colors border border-[#334155]"
      >
        <ArrowLeft size={16} />
        返回 Dashboard
      </button>
    </motion.div>
  );
}
