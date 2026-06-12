import { 
  Package, 
  Truck, 
  Warehouse, 
  AlertCircle, 
  TrendingDown, 
  Clock, 
  BarChart3,
  Waves,
  Zap,
  Plus as MedicalServices,
  Search
} from "lucide-react";
import { motion } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const inventory = [
  { id: "water", name: "Water Tankers", active: "42 Units", cap: "88%", color: "secondary", icon: Waves },
  { id: "power", name: "Portable Generators", active: "12 Units", cap: "34%", color: "tertiary", icon: Zap },
  { id: "medical", name: "Medical Kits", active: "215 Kits", cap: "15%", color: "error", icon: BarChart3 },
];

export default function OrchestrationView() {
  return (
    <div className="flex flex-col gap-6 h-full animate-in fade-in duration-500 overflow-y-auto pb-20 lg:pb-0 lg:overflow-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl md:text-3xl font-black text-on-surface tracking-tighter uppercase">Logistic <span className="text-tertiary">Orchestration</span></h1>
          <div className="h-6 w-px bg-white/10 hidden sm:block"></div>
          <span className="font-mono text-[10px] md:text-xs text-primary font-bold tracking-[0.2em] md:tracking-[0.3em] uppercase whitespace-nowrap">Fleet Status: Optimal</span>
        </div>
        <div className="relative group w-full md:w-auto">
          <input 
            className="bg-surface-container-high border-none rounded px-4 py-2 font-mono text-xs text-on-surface focus:ring-1 focus:ring-primary w-full md:w-64 transition-all" 
            placeholder="QUERY LOGISTICS..."
            type="text"
          />
          <Search className="w-4 h-4 absolute right-3 top-2.5 text-on-surface-variant pointer-events-none" />
        </div>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Inventory Vertical List (LHS) */}
        <section className="col-span-12 lg:col-span-4 flex flex-col gap-6 h-auto lg:h-full shrink-0">
          <div className="bg-surface-container-high border border-white/5 p-5 rounded-xl flex-1 flex flex-col overflow-hidden min-h-[300px] lg:min-h-0">
            <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
              <h2 className="text-lg font-bold text-primary uppercase tracking-tight">Global Inventory</h2>
              <Package className="w-5 h-5 text-secondary" />
            </div>
            <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
              {inventory.map((item) => (
                <div key={item.id} className="p-4 bg-surface-container-low border border-white/5 rounded-lg flex justify-between items-center group hover:border-primary/30 transition-all cursor-pointer">
                  <div className="flex items-center gap-3 md:gap-4 min-w-0">
                    <div className={cn(
                      "w-8 h-8 md:w-10 md:h-10 rounded flex items-center justify-center shrink-0",
                      item.color === "secondary" && "bg-secondary-container/20 text-secondary",
                      item.color === "tertiary" && "bg-tertiary-container/20 text-tertiary",
                      item.color === "error" && "bg-error-container/20 text-error"
                    )}>
                      <item.icon className="w-4 h-4 md:w-5 md:h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-xs md:text-sm tracking-tight truncate">{item.name}</div>
                      <div className="font-mono text-[8px] md:text-[9px] text-on-surface-variant tracking-wider uppercase truncate">{item.active} active</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={cn(
                      "font-mono font-black text-xs md:text-sm",
                      item.color === "error" ? "text-error animate-pulse" : `text-${item.color}`
                    )}>{item.cap} CAP</div>
                    <div className="w-16 md:w-20 h-1 bg-surface-container-highest rounded-full overflow-hidden mt-1.5">
                      <div className={cn(
                        "h-full transition-all",
                        item.color === "secondary" && "bg-secondary",
                        item.color === "tertiary" && "bg-tertiary",
                        item.color === "error" && "bg-error"
                      )} style={{ width: item.cap }}></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="h-64 shrink-0 bg-surface-container-high border border-white/5 p-5 rounded-xl flex flex-col shadow-inner overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[14px] md:text-lg font-bold text-primary uppercase tracking-tight truncate">Burn Rate</h2>
              <span className="font-mono text-[8px] md:text-[10px] text-error font-black border border-error/30 px-2 py-0.5 rounded tracking-tighter whitespace-nowrap">EXHAUSTION: 18h 42m</span>
            </div>
            <div className="flex-1 relative mt-6 flex items-end gap-2 md:gap-3 px-2 md:px-4 pb-2">
              {[
                { h: "80%", ah: "60%", label: "T-12h", type: "primary" },
                { h: "70%", ah: "45%", label: "T-08h", type: "primary" },
                { h: "60%", ah: "30%", label: "T-04h", type: "primary" },
                { h: "50%", ah: "15%", label: "NOW", type: "error" },
                { h: "40%", ah: "0%", label: "", type: "dash" },
                { h: "30%", ah: "0%", label: "", type: "dash" },
              ].map((bar, i) => (
                <div key={i} className="flex-1 flex flex-col justify-end h-full relative group">
                  <div 
                    className={cn(
                      "w-full rounded-t transition-all duration-1000",
                      bar.type === "primary" && "bg-primary/20",
                      bar.type === "error" && "bg-error/20",
                      bar.type === "dash" && "bg-white/5 border-t border-dashed border-outline-variant"
                    )} 
                    style={{ height: bar.h }}
                  >
                    {bar.ah !== "0%" && (
                      <div 
                        className={cn(
                          "absolute bottom-0 w-full rounded-t",
                          bar.type === "primary" && "bg-primary shadow-[0_0_10px_rgba(255,180,170,0.5)]",
                          bar.type === "error" && "bg-error shadow-[0_0_10px_rgba(241,120,120,0.5)] animate-pulse"
                        )} 
                        style={{ height: bar.ah }}
                      />
                    )}
                  </div>
                  {bar.label && (
                    <span className={cn(
                      "absolute -bottom-6 left-1/2 -translate-x-1/2 text-[7px] md:text-[8px] font-mono font-bold whitespace-nowrap scale-75 sm:scale-100",
                      bar.type === "error" ? "text-error" : "text-on-surface-variant opacity-60"
                    )}>
                      {bar.label}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Timeline & Map (RHS) */}
        <section className="col-span-12 lg:col-span-8 flex flex-col gap-6 h-auto lg:h-full shrink-0 lg:overflow-hidden pb-10 lg:pb-0">
          <div className="bg-surface-container-high border border-white/5 p-5 rounded-xl h-auto shrink-0">
            <h2 className="text-lg font-bold text-primary uppercase tracking-tight mb-6">Supply Arrival Timeline</h2>
            <div className="relative pt-8 pb-4 overflow-x-auto no-scrollbar">
              <div className="min-w-[500px]">
                <div className="absolute top-2 w-full h-px bg-white/5"></div>
                <div className="flex justify-between font-mono text-[9px] text-on-surface-variant uppercase font-black opacity-60 tracking-[0.2em] mb-8">
                  <span>08:00</span>
                  <span>12:00</span>
                  <span>16:00</span>
                  <span>20:00</span>
                  <span>00:00</span>
                </div>
                <div className="space-y-6">
                  {[
                    { name: "Zone Alpha", items: [
                      { l: "15%", color: "bg-secondary", label: "TRK-8821: 09:15" },
                      { l: "65%", color: "bg-tertiary" },
                    ]},
                    { name: "Zone Gamma", items: [
                      { l: "40%", color: "bg-error" },
                      { l: "85%", color: "bg-primary" },
                    ]}
                  ].map((row, i) => (
                    <div key={i} className="flex items-center h-8">
                      <div className="w-24 font-mono text-[9px] font-black uppercase text-on-surface-variant tracking-widest">{row.name}</div>
                      <div className="flex-1 h-[1px] bg-white/10 relative">
                        {row.items.map((marker, j) => (
                          <div key={j} className="absolute top-1/2 -translate-y-1/2 group" style={{ left: marker.l }}>
                            <div className={cn(
                              "w-3 h-3 rounded-full ring-4 shadow-lg transition-transform hover:scale-125 cursor-help",
                              marker.color,
                              marker.color === "bg-secondary" && "ring-secondary/20",
                              marker.color === "bg-tertiary" && "ring-tertiary/20",
                              marker.color === "bg-error" && "ring-error/20",
                              marker.color === "bg-primary" && "ring-primary/20"
                            )}></div>
                            {marker.label && (
                              <div className="absolute -top-10 left-1/2 -translate-x-1/2 scale-0 group-hover:scale-100 transition-all bg-surface-bright p-2 border border-white/10 rounded shadow-2xl z-50 whitespace-nowrap font-mono text-[9px] text-primary font-bold">
                                {marker.label}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-[300px] lg:min-h-0 relative rounded-xl overflow-hidden border border-white/5 shadow-2xl group">
            <img 
              className="w-full h-full object-cover grayscale opacity-40 transition-all group-hover:scale-105 duration-[10000ms]" 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCFsnJB2hSbghqYFKx1vSZyYEhzoGAMMSwTWia55kGgayPRWSlDTJGe3pJGyYXGq3TbGbLWXPmX0uMDTBLRJwkYositGAATD0ZRUa_3EUoCACY3nVl9ZmJhbPWX1YRwzyi1z_20L8f8mlt_wT7a61YJJSVnQuGRCr16ujSsE8e_DHyDIrM8Wi7kzD3VG7W8UMkuXx9EPuZjhGNQeZSJs7Y9U1hGkjhLzCC4fqVarevWXor56vi_b8XNRjFZ_YuOXHyurhd2sRRYJw"
              alt="Logistics Map"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent"></div>
            
            <div className="absolute top-4 right-4 flex flex-col gap-2">
              <div className="glass-panel p-2 md:p-3 rounded-lg border border-primary/20">
                <div className="font-mono text-[8px] md:text-[9px] text-primary font-black uppercase tracking-widest mb-1">Stability</div>
                <div className="font-mono text-base md:text-xl font-bold">94.2%</div>
              </div>
              <div className="glass-panel p-2 md:p-3 rounded-lg border border-tertiary/20">
                <div className="font-mono text-[8px] md:text-[9px] text-tertiary font-black uppercase tracking-widest mb-1">Lead Time</div>
                <div className="font-mono text-base md:text-xl font-bold">42m</div>
              </div>
            </div>

            <div className="absolute top-1/3 left-1/4 animate-pulse opacity-80">
              <AlertCircle className="w-6 h-6 md:w-8 md:h-8 text-error shadow-[0_0_20px_rgba(241,120,120,0.5)]" />
            </div>
            <div className="absolute bottom-1/4 right-1/3 opacity-80">
              <Truck className="w-5 h-5 md:w-6 md:h-6 text-secondary shadow-[0_0_15px_#4b8eff]" />
            </div>
          </div>
        </section>
      </div>


      <section className="h-40 shrink-0">
        <div className="bg-surface-container-lowest border border-primary/20 rounded-xl h-full flex flex-col overflow-hidden shadow-[inset_0_0_30px_rgba(0,0,0,0.8)]">
          <div className="bg-surface-container-high px-5 py-2.5 flex justify-between items-center border-b border-white/5">
            <div className="flex items-center gap-3">
              <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity }} className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_#ffb4aa]"></motion.div>
              <span className="font-mono text-[10px] text-primary font-black uppercase tracking-widest">Logistics Agent Core_AI.v4</span>
            </div>
            <div className="font-mono text-[8px] text-on-surface-variant font-bold uppercase tracking-[0.2em] opacity-40">Streaming Real-time Decisions</div>
          </div>
          <div className="flex-1 p-5 font-mono text-[11px] text-on-surface-variant overflow-y-auto space-y-3 custom-scrollbar backdrop-blur-md">
            {[
              { time: "08:42:15", msg: "Re-routing Truck #TRK-901 (Generators). Reason: Flash flood at Sector 4 crossing.", level: "info", hl: true },
              { time: "08:43:02", msg: "Optimizing delivery path for water tankers en route to Zone Delta. Estimated time saved: 12 min.", level: "info" },
              { time: "08:44:59", msg: "Warning: Resource burn rate in Sector 2 exceeds predictions. Dispatching emergency kits.", level: "error" },
              { time: "08:45:21", msg: "Agent Log: All coordinates synchronized with global tactical overlay.", level: "info" },
              { time: "08:46:00", msg: "Analyzing secondary routes for cargo shipment C-404...", level: "primary" },
            ].map((log, i) => (
              <div key={i} className={cn(
                "flex gap-4 border-l-2 pl-4 transition-all duration-300",
                log.level === "error" ? "border-error text-error bg-error/5 py-1" : "border-white/10",
                log.hl && "text-on-surface font-bold"
              )}>
                <span className="text-tertiary opacity-70 font-black tracking-tighter">[{log.time}]</span>
                <span className={cn(
                  "tracking-tight",
                  log.level === "primary" && "text-primary animate-pulse"
                )}>{log.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
