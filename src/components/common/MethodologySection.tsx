import { useState, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export const MethodologySection = ({ title, children }: { title: string; children: ReactNode; key?: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b border-[#141414]/10 last:border-0">
      <button
        className="w-full flex justify-between items-center py-5 text-left gap-4"
        onClick={() => setIsOpen(o => !o)}
      >
        <span className="font-mono text-sm uppercase tracking-widest">{title}</span>
        <ChevronDown size={16} className={`shrink-0 transition-transform opacity-40 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="pb-6 pl-1">
          {children}
        </div>
      )}
    </div>
  );
};
