import { BrainCircuit, Map as MapIcon, Activity, Cpu, ShieldAlert, Bolt, Database, HelpCircle, Settings } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen?: boolean;
  setIsOpen?: (open: boolean) => void;
  incidentCount?: number;
  criticalCount?: number;
}

const navItems = [
  { id: "intelligence", name: "Intelligence",      icon: BrainCircuit },
  { id: "tactical",     name: "Tactical Map",       icon: MapIcon      },
  { id: "trace",        name: "Logic Trace",        icon: Activity     },
  { id: "simulations",  name: "Simulations",        icon: Cpu          },
  { id: "command",      name: "Incident Command",   icon: ShieldAlert  },
  { id: "reporting",    name: "Report Incident",    icon: HelpCircle   },
];

export default function Sidebar({ activeTab, setActiveTab, isOpen, setIsOpen, incidentCount = 0, criticalCount = 0 }: SidebarProps) {
  return (
    <>
      {/* Overlay for mobile */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen?.(false)}
            className="fixed inset-0 bg-surface/80 backdrop-blur-sm z-[45] lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside className={cn(
        "fixed lg:left-4 top-4 lg:top-20 bottom-4 w-72 lg:w-64 z-50 flex flex-col bg-surface-container/95 lg:bg-surface-container/80 backdrop-blur-2xl border border-white/10 rounded-r-[32px] lg:rounded-[32px] shadow-2xl transition-transform duration-300",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="p-8 flex justify-between items-start">
          <div>
            <div className="font-light text-2xl tracking-tighter text-on-surface mb-1">
              <span className="font-bold text-primary">NEXUS</span>
            </div>
            <div className="text-[10px] text-on-surface-variant font-bold uppercase tracking-[0.3em] opacity-60">
              {incidentCount > 0 ? `${incidentCount} Active · ${criticalCount} Critical` : "All Systems Clear"}
            </div>
          </div>
          <button 
            onClick={() => setIsOpen?.(false)}
            className="lg:hidden p-2 text-on-surface-variant hover:text-white"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center px-6 py-4 transition-all duration-300 rounded-2xl group",
              activeTab === item.id
                ? "bg-primary/10 text-primary shadow-[inset_0_0_20px_rgba(6,182,212,0.1)]"
                : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
            )}
          >
            <item.icon
              className={cn(
                "mr-4 w-5 h-5 transition-all duration-300",
                activeTab === item.id ? "scale-110 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]" : "group-hover:scale-110"
              )}
            />
            <span className="font-medium uppercase tracking-[0.1em] text-xs">
              {item.name}
            </span>
          </button>
        ))}
      </nav>

      <div className="p-6 space-y-4">
        <motion.button
          whileHover={{ scale: 1.02, boxShadow: "0 0 20px rgba(6,182,212,0.4)" }}
          whileTap={{ scale: 0.98 }}
          className="w-full bg-gradient-to-tr from-primary to-secondary py-4 rounded-2xl flex items-center justify-center gap-2 text-on-primary font-bold tracking-tighter shadow-lg transition-all"
        >
          <Bolt className="w-4 h-4 fill-current" />
          ACTIVATE PROTOCOL
        </motion.button>
        
        <div className="flex justify-around pt-2">
          <button className="text-on-surface-variant hover:text-primary transition-all p-2 hover:bg-white/5 rounded-xl group">
            <Database className="w-5 h-5 transition-transform group-hover:scale-110" />
          </button>
          <button className="text-on-surface-variant hover:text-primary transition-all p-2 hover:bg-white/5 rounded-xl group">
            <HelpCircle className="w-5 h-5 transition-transform group-hover:scale-110" />
          </button>
          <button className="text-on-surface-variant hover:text-primary transition-all p-2 hover:bg-white/5 rounded-xl group">
            <Settings className="w-5 h-5 transition-transform group-hover:scale-110" />
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
