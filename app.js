/* global React, ReactDOM */

// --- 🧠 MATH ENGINE (FROM V4) ---
class StatisticalEngine {
    constructor(gameConfig, lastDrawData) {
        this.config = gameConfig;
        this.history = lastDrawData || { numbers: [] };
    }

    generateSmartPick() {
        const pool = [];
        // Initialize pool with all possible numbers
        for(let i=1; i<=this.config.mainMax; i++) pool.push(i);

        const weightedPool = [];
        pool.forEach(num => {
            let weight = 10; 
            // "Cooling" Logic: If number hit last time, reduce weight significantly
            if (this.history.numbers && this.history.numbers.includes(num)) {
                weight = 1; 
            }
            for(let k=0; k<weight; k++) weightedPool.push(num);
        });

        // Pick Main Numbers
        const result = new Set();
        while(result.size < this.config.mainCount) {
            const idx = Math.floor(Math.random() * weightedPool.length);
            result.add(weightedPool[idx]);
        }

        // Pick Special Ball
        let special = null;
        if (this.config.hasSpecial) {
            const specialHistory = this.history.special;
            do {
                special = Math.floor(Math.random() * this.config.specialMax) + 1;
            } while (special === specialHistory && Math.random() > 0.1);
        }

        return {
            main: Array.from(result).sort((a,b) => a-b),
            special
        };
    }
}

// --- ⚙️ GAME CONFIG ---
const GAMES = [
  { key: "pb", label: "Powerball", path: "/api/pb", mainMax: 69, mainCount: 5, hasSpecial: true, specialMax: 26, color: "from-red-600 to-red-900" },
  { key: "mm", label: "Mega Millions", path: "/api/mm", mainMax: 70, mainCount: 5, hasSpecial: true, specialMax: 25, color: "from-yellow-500 to-yellow-700" },
  { key: "cash4life", label: "Cash4Life", path: "/api/cash4life", mainMax: 60, mainCount: 5, hasSpecial: true, specialMax: 4, color: "from-emerald-600 to-emerald-900" },
  { key: "ga_fantasy5", label: "GA Fantasy 5", path: "/api/ga/fantasy5", mainMax: 42, mainCount: 5, hasSpecial: false, color: "from-blue-600 to-blue-900" }
];

const DEFAULT_API_BASE = localStorage.getItem("gaLottoApiBase") || ""; 

function formatCurrency(n) {
  if (!n || isNaN(n)) return "Loading...";
  return Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function GeorgiaLotteryHub() {
  const [apiBase, setApiBase] = React.useState(DEFAULT_API_BASE);
  const [selected, setSelected] = React.useState("pb");
  const [data, setData] = React.useState({});
  const [status, setStatus] = React.useState({ online: navigator.onLine, lastUpdated: null });
  const [prediction, setPrediction] = React.useState(null);
  const [isCrunching, setIsCrunching] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);

  // Derived state
  const activeGame = GAMES.find(g => g.key === selected);
  const activeData = data[selected] || {};

  // --- API LOGIC ---
  async function refreshAll() {
    if (!apiBase) return;
    const out = {};
    for (const g of GAMES) {
      try {
        const res = await fetch(`${apiBase}${g.path}`);
        if (res.ok) out[g.key] = await res.json();
      } catch (e) { console.error(e); }
    }
    setData(prev => ({ ...prev, ...out }));
    setStatus(s => ({ ...s, lastUpdated: new Date() }));
  }

  React.useEffect(() => {
    refreshAll();
  }, [apiBase]);

  // --- MATH LOGIC ---
  const runPrediction = () => {
    setIsCrunching(true);
    setPrediction(null);
    
    // Simulate "Thinking" time for UX
    setTimeout(() => {
        const engine = new StatisticalEngine(activeGame, activeData);
        const result = engine.generateSmartPick();
        setPrediction(result);
        setIsCrunching(false);
    }, 800);
  };

  // --- UI COMPONENTS ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-20">
      
      {/* HEADER */}
      <div className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur border-b border-white/10 px-4 py-4 flex justify-between items-center">
        <div>
            <h1 className="text-xl font-bold italic tracking-tighter">GA HUB <span className="text-xs text-emerald-400 align-top">LIVE</span></h1>
        </div>
        <button onClick={() => setShowSettings(!showSettings)} className="p-2 bg-slate-800 rounded text-xs">
            {showSettings ? "Close" : "Setup API"}
        </button>
      </div>

      {/* SETTINGS DRAWER */}
      {showSettings && (
        <div className="p-4 bg-slate-900 border-b border-white/10">
            <label className="text-xs text-gray-400">Worker URL</label>
            <input 
                className="w-full bg-black/30 border border-white/20 rounded p-2 text-white mt-1"
                placeholder="https://your-worker.workers.dev"
                value={apiBase}
                onChange={(e) => {
                    setApiBase(e.target.value);
                    localStorage.setItem("gaLottoApiBase", e.target.value);
                }}
            />
            <button onClick={refreshAll} className="mt-2 w-full bg-indigo-600 py-2 rounded font-bold text-sm">Test Connection</button>
        </div>
      )}

      {/* GAME SELECTOR */}
      <div className="p-4 grid grid-cols-4 gap-2">
        {GAMES.map(g => (
            <button 
                key={g.key}
                onClick={() => { setSelected(g.key); setPrediction(null); }}
                className={`p-2 rounded-lg text-[10px] font-bold transition-all border ${selected === g.key ? 'bg-white text-black border-white' : 'bg-slate-800 text-gray-400 border-slate-700'}`}
            >
                {g.label.split(' ')[0]}
            </button>
        ))}
      </div>

      <div className="px-4 space-y-6">
        
        {/* JACKPOT CARD */}
        <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${activeGame.color} p-6 shadow-2xl border border-white/10`}>
            <div className="relative z-10">
                <div className="text-xs font-bold text-white/70 uppercase">{activeGame.label}</div>
                <div className="text-4xl font-black text-white mt-1 tracking-tighter">
                    {activeData.jackpot ? formatCurrency(activeData.jackpot) : "Loading..."}
                </div>
                <div className="mt-4 pt-4 border-t border-white/20 flex justify-between items-end">
                    <div>
                        <div className="text-[10px] text-white/60 uppercase">Cash Value</div>
                        <div className="font-mono font-bold">
                            {activeData.cash ? formatCurrency(activeData.cash) : "—"}
                        </div>
                    </div>
                    {/* Tax Calc Mini */}
                    <div className="text-right">
                         <div className="text-[10px] text-emerald-300 uppercase">Est. Take Home</div>
                         <div className="font-mono font-bold text-emerald-300">
                            {activeData.cash ? formatCurrency(activeData.cash * 0.7025) : "—"}
                         </div>
                    </div>
                </div>
            </div>
        </div>

        {/* LAST DRAW NUMBERS */}
        <div className="bg-slate-900 border border-white/10 rounded-xl p-4">
            <div className="text-[10px] text-gray-400 uppercase font-bold mb-2">Last Draw Data</div>
            {activeData.numbers ? (
                <div className="flex flex-wrap gap-2">
                    {activeData.numbers.slice(0, activeGame.mainCount).map((n,i) => (
                        <span key={i} className="w-8 h-8 flex items-center justify-center bg-slate-800 rounded font-mono text-sm border border-slate-700">{n}</span>
                    ))}
                    {activeGame.hasSpecial && (
                        <span className="w-8 h-8 flex items-center justify-center bg-slate-700 rounded font-mono text-sm border border-white/20 text-yellow-400 font-bold">
                            {activeData.numbers[activeGame.mainCount] || activeData.special}
                        </span>
                    )}
                </div>
            ) : (
                <div className="text-xs text-gray-500 italic">Waiting for live data...</div>
            )}
        </div>

        {/* PREDICTION ENGINE */}
        <div className="space-y-4">
            {!prediction ? (
                <button 
                    onClick={runPrediction}
                    disabled={isCrunching || !activeData.numbers}
                    className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all ${isCrunching || !activeData.numbers ? 'bg-slate-800 text-gray-500' : 'bg-white text-black hover:scale-[1.02]'}`}
                >
                    {isCrunching ? "Analyzing..." : (!activeData.numbers ? "Waiting for Data..." : "Run AI Prediction 🎲")}
                </button>
            ) : (
                <div className="bg-slate-800/50 border border-emerald-500/50 rounded-xl p-6 animate-in slide-in-from-bottom-4">
                     <div className="flex justify-between items-center mb-4">
                        <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Optimized Set</div>
                        <button onClick={() => setPrediction(null)} className="text-xs text-gray-400">Reset</button>
                     </div>
                     <div className="flex flex-wrap justify-center gap-3">
                        {prediction.main.map((num, i) => (
                            <div key={i} className="w-10 h-10 bg-white text-slate-900 rounded-full flex items-center justify-center text-lg font-black">
                                {num}
                            </div>
                        ))}
                        {prediction.special !== null && (
                             <div className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center text-lg font-black ring-4 ring-black/20">
                                {prediction.special}
                            </div>
                        )}
                     </div>
                </div>
            )}
        </div>

      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<GeorgiaLotteryHub />);
