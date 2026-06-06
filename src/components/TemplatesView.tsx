import React, { useState, useEffect } from "react";
import { 
  FolderSync, 
  Sparkles, 
  Trash2, 
  Save, 
  Check, 
  FileText, 
  Layers, 
  Zap, 
  Info 
} from "lucide-react";

interface PresetItem {
  id: string;
  name: string;
  type: string;
  symbol: string;
  action: string;
  strategy: string;
  notes: string;
}

interface Props {
  onLoadTemplate: (template: PresetItem) => void;
  onShowSuccessAlert: (msg: string) => void;
}

const STORAGE_KEY_BLUEPRINTS = "broadcaster_blueprints";

export default function TemplatesView({ onLoadTemplate, onShowSuccessAlert }: Props) {
  // Built-in high fidelity baseline templates
  const baselineTemplates: PresetItem[] = [
    {
      id: "zeta-volatility-100",
      name: "Zeta Volatility 100 Under Setup",
      type: "Derivative Digit Contract",
      symbol: "VOLATILITY 100 (1s) INDEX",
      action: "UNDER 7",
      strategy: "Second Least Digit Pattern Sniping",
      notes: "High accuracy (85%+) tick oscillations breaker. Best loaded for high frequency short runs during low-volatility sessions."
    },
    {
      id: "crash-boom-sniper",
      name: "Crash / Boom Spike Breaker Blueprint",
      type: "Synthetic Index Spot",
      symbol: "BOOM 1000 INDEX",
      action: "BUY SPIKE AT SUPPORT",
      strategy: "Spike Oscillator M1 Continuation",
      notes: "Scans for 3 consecutive drop ticks at historical support, triggering auto standby alerts for members to load spikes scalp orders."
    },
    {
      id: "forex-gold-breakout",
      name: "XAUUSD Gold Trend Continuation",
      type: "Forex Major Pair",
      symbol: "XAUUSD (GOLD)",
      action: "BUY LIMIT ENTRYS",
      strategy: "H4 Demark Breakout Confirmation",
      notes: "Broadcasting structural trend continuation on gold. Recommends moving SL to Entry Zone once TP1 (30 pips) is secured."
    },
    {
      id: "bitcoin-hbar-scalp",
      name: "Crypto Bitcoin Multi-Barrier Run",
      type: "Crypto Breakout Pair",
      symbol: "BTCUSD",
      action: "BUY RANGE BREAKOUT",
      strategy: "RSI-Trend Multi-Timeframe Divergence",
      notes: "Leverages momentum shift on 15M candles. Targets small range spreads with high leverage metrics and immediate exits."
    }
  ];

  const [customTemplates, setCustomTemplates] = useState<PresetItem[]>([]);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateSymbol, setNewTemplateSymbol] = useState("VOLATILITY 75 INDEX");
  const [newTemplateAction, setNewTemplateAction] = useState("UNDER 7");
  const [newTemplateType, setNewTemplateType] = useState("Derivative Digit Contract");
  const [newTemplateStrategy, setNewTemplateStrategy] = useState("Second Least Digit");
  const [newTemplateNotes, setNewTemplateNotes] = useState("");

  // Load custom templates from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_BLUEPRINTS);
    if (saved) {
      try {
        setCustomTemplates(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse custom templates", e);
      }
    }
  }, []);

  const saveCustomTemplatesList = (newList: PresetItem[]) => {
    setCustomTemplates(newList);
    localStorage.setItem(STORAGE_KEY_BLUEPRINTS, JSON.stringify(newList));
  };

  const handleCreateTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim()) return;

    const newTp: PresetItem = {
      id: "blueprint_" + Date.now(),
      name: newTemplateName.trim(),
      type: newTemplateType,
      symbol: newTemplateSymbol.trim().toUpperCase(),
      action: newTemplateAction.trim().toUpperCase(),
      strategy: newTemplateStrategy.trim(),
      notes: newTemplateNotes.trim() || "Custom trading template blueprint formulated by user."
    };

    const nextList = [newTp, ...customTemplates];
    saveCustomTemplatesList(nextList);
    setNewTemplateName("");
    setNewTemplateNotes("");
    onShowSuccessAlert(`Custom template "${newTp.name}" saved successfully!`);
  };

  const handleDeleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this custom template blueprint?")) {
      const filtered = customTemplates.filter(t => t.id !== id);
      saveCustomTemplatesList(filtered);
      onShowSuccessAlert("Template deleted successfully.");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-sans" id="templates-view-panel">
      
      {/* Page header */}
      <div className="border-b border-slate-850 pb-4">
        <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
          <FolderSync className="w-5 h-5 text-sky-400" />
          <span>Blueprints & Draft Templates Manager</span>
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">Configure and save baseline setups. Loading templates instantly pre-populates your active Draft composer form.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Templates Directory Lists */}
        <div className="lg:col-span-8 space-y-5">
          
          {/* Baseline Official Blueprints */}
          <div className="space-y-3">
            <span className="text-[10px] uppercase font-bold text-slate-450 block tracking-wider">
              Official Baseline Blueprints
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {baselineTemplates.map((tp) => (
                <div
                  key={tp.id}
                  onClick={() => onLoadTemplate(tp)}
                  className="bg-slate-950 hover:bg-slate-900/30 p-4 rounded-xl border border-slate-850 hover:border-sky-500/30 cursor-pointer transition-all hover:shadow-lg hover:shadow-sky-500/5 group relative flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <span className="text-[9px] px-1.5 py-0.5 bg-sky-950/55 border border-sky-900/40 text-sky-400 rounded">
                        {tp.type}
                      </span>
                      <Zap className="w-3.5 h-3.5 text-slate-600 group-hover:text-amber-400 transition-colors" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white group-hover:text-sky-400 transition-colors leading-tight truncate">{tp.name}</h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-1 font-semibold">{tp.symbol} &bull; {tp.action}</p>
                      <p className="text-[10px] text-slate-450 mt-1.5 leading-relaxed line-clamp-2">{tp.notes}</p>
                    </div>
                  </div>
                  
                  <div className="pt-3 border-t border-slate-900/40 mt-3 text-[10px] text-sky-500 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                    <span>Load Blueprint Parameters</span>
                    <span>&rarr;</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* User Custom Templates */}
          <div className="space-y-3">
            <span className="text-[10px] uppercase font-bold text-slate-450 block tracking-wider">
              My Customized Templates ({customTemplates.length})
            </span>

            {customTemplates.length === 0 ? (
              <div className="text-center py-8 p-6 bg-slate-950/40 border border-slate-900 border-dashed rounded-xl text-xs text-slate-500 italic">
                You have not created any custom blueprints yet. Formulate settings on the right panel to store blueprints locally.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {customTemplates.map((tp) => (
                  <div
                    key={tp.id}
                    onClick={() => onLoadTemplate(tp)}
                    className="bg-slate-950 hover:bg-slate-900/30 p-4 rounded-xl border border-slate-850 hover:border-sky-500/30 cursor-pointer transition-all hover:shadow-lg hover:shadow-sky-500/5 group relative flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <span className="text-[9px] px-1.5 py-0.5 bg-emerald-950/40 border border-emerald-900/30 text-emerald-400 rounded">
                          {tp.type}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteTemplate(tp.id, e)}
                          className="p-1 hover:bg-slate-900 rounded text-slate-550 hover:text-rose-400 transition-colors"
                          title="Delete custom blueprint"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white group-hover:text-sky-400 transition-colors leading-tight truncate">{tp.name}</h4>
                        <p className="text-[10px] text-slate-400 font-mono mt-1 font-semibold">{tp.symbol} &bull; {tp.action}</p>
                        <p className="text-[10px] text-slate-450 mt-1.5 leading-relaxed line-clamp-2">{tp.notes}</p>
                      </div>
                    </div>
                    
                    <div className="pt-3 border-t border-slate-900/40 mt-3 text-[10px] text-sky-500 font-semibold flex items-center gap-1">
                      <span>Load Blueprint Parameters</span>
                      <span>&rarr;</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Create Blueprint Quick Form */}
        <div className="lg:col-span-4">
          <form onSubmit={handleCreateTemplate} className="bg-slate-950 border border-slate-850 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-900 pb-3">
              <Save className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Save Custom Blueprint</span>
            </div>

            <div className="space-y-3 text-sans">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-semibold uppercase">Blueprint Name</label>
                <input
                  type="text"
                  required
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g. Volatilty 75 Under 7 System"
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-lg text-white placeholder-slate-600 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-semibold uppercase">Asset Symbol</label>
                <input
                  type="text"
                  required
                  value={newTemplateSymbol}
                  onChange={(e) => setNewTemplateSymbol(e.target.value)}
                  placeholder="e.g. VOLATILITY 75 INDEX"
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-lg text-white font-mono uppercase outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-semibold uppercase">Action Trigger</label>
                  <input
                    type="text"
                    required
                    value={newTemplateAction}
                    onChange={(e) => setNewTemplateAction(e.target.value)}
                    placeholder="e.g. UNDER 7"
                    className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-lg text-white font-mono uppercase outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-semibold uppercase">Bot Strategy</label>
                  <input
                    type="text"
                    required
                    value={newTemplateStrategy}
                    onChange={(e) => setNewTemplateStrategy(e.target.value)}
                    placeholder="e.g. Second Least Digit"
                    className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-lg text-white outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1 font-sans">
                <label className="text-[10px] text-slate-400 font-semibold uppercase">Blueprint Category</label>
                <select
                  value={newTemplateType}
                  onChange={(e) => setNewTemplateType(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-lg text-slate-350 focus:text-white outline-none cursor-pointer"
                >
                  <option value="Derivative Digit Contract">Derivative Digit Contract</option>
                  <option value="Forex Major Pair">Forex Major Pair</option>
                  <option value="Crypto Breakout Pair">Crypto Breakout Pair</option>
                  <option value="Synthetic Index Spot">Synthetic Index Spot</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-semibold uppercase">Operator Setup Notes</label>
                <textarea
                  rows={2}
                  value={newTemplateNotes}
                  onChange={(e) => setNewTemplateNotes(e.target.value)}
                  placeholder="e.g. Stop after consecutive wins. Max recovery steps capped at 3..."
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-lg text-slate-200 placeholder-slate-650 outline-none resize-none leading-relaxed"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-sky-500/10 cursor-pointer flex items-center justify-center gap-1.5 pt-2 transition-all"
              >
                <Save className="w-3.5 h-3.5 text-sky-100" />
                <span>Save New Blueprint</span>
              </button>
            </div>
          </form>

          <div className="bg-slate-900/40 p-3.5 border border-slate-850/60 rounded-xl mt-4 flex items-start gap-2 text-[10.5px] text-slate-400 leading-normal">
            <Info className="w-4 h-4 text-sky-455 shrink-0 mt-0.5" />
            <span>Clicking <b>Load Blueprint</b> re-formats and carries parameters immediately into your Draft Composer view for micro adjustments.</span>
          </div>
        </div>

      </div>

    </div>
  );
}
