/* global React, ReactDOM */

const DEFAULT_API_BASE = localStorage.getItem("gaLottoApiBase") || ""; 
// Example: https://your-worker.yourname.workers.dev  (no trailing slash)

function formatCurrency(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function safeJoin(arr) {
  return Array.isArray(arr) ? arr.join(" ") : "—";
}

function afterTax(lumpSum, taxRatePct) {
  const n = Number(lumpSum);
  const t = Number(taxRatePct) / 100;
  if (!Number.isFinite(n) || !Number.isFinite(t)) return null;
  return Math.max(0, n * (1 - t));
}

const GAMES = [
  { key: "pb", label: "Powerball", path: "/api/pb" },
  { key: "mm", label: "Mega Millions", path: "/api/mm" },
  { key: "cash4life", label: "Cash4Life", path: "/api/cash4life" },
  { key: "ga_fantasy5", label: "GA Fantasy 5", path: "/api/ga/fantasy5" },
  { key: "ga_cash3", label: "GA Cash 3", path: "/api/ga/cash3" },
  { key: "ga_cash4", label: "GA Cash 4", path: "/api/ga/cash4" }
];

function GeorgiaLotteryHub() {
  const [apiBase, setApiBase] = React.useState(DEFAULT_API_BASE);
  const [selected, setSelected] = React.useState("pb");
  const [data, setData] = React.useState({});
  const [status, setStatus] = React.useState({ online: navigator.onLine, lastUpdated: null, error: null });

  const [taxRate, setTaxRate] = React.useState(localStorage.getItem("gaLottoTaxRate") || "37");
  const [lumpSum, setLumpSum] = React.useState("");
  const [calcOut, setCalcOut] = React.useState(null);

  const [savedPicks, setSavedPicks] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("gaLottoSavedPicks") || "[]"); } catch { return []; }
  });

  const [installPromptEvent, setInstallPromptEvent] = React.useState(null);
  const [showSettings, setShowSettings] = React.useState(false);

  const selectedGame = GAMES.find(g => g.key === selected) || GAMES[0];

  function apiUrl(path) {
    const base = (apiBase || "").replace(/\/+$/, "");
    if (!base) return null;
    return base + path;
  }

  async function refreshAll() {
    if (!apiBase) {
      setStatus(s => ({ ...s, error: "Set your API base URL in Settings." }));
      return;
    }
    setStatus(s => ({ ...s, error: null }));
    const out = {};
    for (const g of GAMES) {
      const url = apiUrl(g.path);
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        out[g.key] = await res.json();
      } catch (e) {
        out[g.key] = { ok: false, error: String(e) };
      }
    }
    setData(out);
    setStatus(s => ({ ...s, lastUpdated: new Date().toISOString() }));
  }

  function quickPick(count, max, unique=true) {
    const nums = new Set();
    while (nums.size < count) {
      const n = Math.floor(Math.random() * max) + 1;
      if (unique) nums.add(n);
    }
    return Array.from(nums).sort((a,b)=>a-b);
  }

  function savePick(gameKey, numbers, note="") {
    const entry = {
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
      gameKey,
      numbers,
      note,
      createdAt: new Date().toISOString()
    };
    const next = [entry, ...savedPicks].slice(0, 50);
    setSavedPicks(next);
    localStorage.setItem("gaLottoSavedPicks", JSON.stringify(next));
  }

  React.useEffect(() => {
    function onOnline() { setStatus(s => ({ ...s, online: true })); }
    function onOffline() { setStatus(s => ({ ...s, online: false })); }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  React.useEffect(() => {
    // PWA install prompt
    const handler = (e) => {
      e.preventDefault();
      setInstallPromptEvent(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  React.useEffect(() => {
    if (!apiBase) return;
    localStorage.setItem("gaLottoApiBase", apiBase);
  }, [apiBase]);

  React.useEffect(() => {
    localStorage.setItem("gaLottoTaxRate", taxRate);
  }, [taxRate]);

  React.useEffect(() => {
    refreshAll();
    const id = setInterval(refreshAll, 5 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  React.useEffect(() => {
    const n = Number(lumpSum);
    const t = Number(taxRate);
    if (!Number.isFinite(n) || !Number.isFinite(t)) { setCalcOut(null); return; }
    setCalcOut(afterTax(n, t));
  }, [lumpSum, taxRate]);

  const selectedData = data[selected] || {};

  function renderNumbersBlock(d) {
    const nums = d?.numbers || d?.winningNumbers;
    const mb = d?.multiplier || d?.megaplier;
    if (!nums) return null;
    return (
      <div className="mt-3">
        <div className="text-slate-300 text-sm">Last draw numbers</div>
        <div className="text-white text-xl tracking-wide mt-1">{safeJoin(nums)}</div>
        {mb ? <div className="text-slate-400 text-sm mt-1">Multiplier: {mb}</div> : null}
        {d?.drawDate ? <div className="text-slate-500 text-xs mt-1">{formatDateTime(d.drawDate)}</div> : null}
      </div>
    );
  }

  async function doInstall() {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    try { await installPromptEvent.userChoice; } catch {}
    setInstallPromptEvent(null);
  }

  return (
    <div className="min-h-screen text-slate-100">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-bold">Georgia Lottery Hub</div>
            <div className="text-slate-400 text-sm">
              {status.online ? "Online" : "Offline"} 
              {status.lastUpdated ? <> • Updated {formatDateTime(status.lastUpdated)}</> : null}
            </div>
          </div>
          <div className="flex gap-2">
            {installPromptEvent ? (
              <button onClick={doInstall} className="px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-sm">
                Install
              </button>
            ) : null}
            <button onClick={() => setShowSettings(v => !v)} className="px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-sm">
              Settings
            </button>
          </div>
        </div>

        {showSettings ? (
          <div className="mt-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="font-semibold">API Base URL</div>
            <div className="text-slate-400 text-sm mt-1">
              Paste your Cloudflare Worker URL (no trailing slash).
            </div>
            <input
              className="mt-3 w-full rounded bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100"
              placeholder="https://your-worker.yourname.workers.dev"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
            />
            <div className="mt-3 flex gap-2">
              <button onClick={refreshAll} className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm">
                Test + Refresh
              </button>
              <button onClick={() => setShowSettings(false)} className="px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-sm">
                Close
              </button>
            </div>
            {status.error ? <div className="text-rose-400 text-sm mt-3">{status.error}</div> : null}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {GAMES.map(g => {
            const d = data[g.key];
            const jp = d?.jackpot ?? d?.estimatedJackpot ?? null;
            return (
              <button
                key={g.key}
                onClick={() => setSelected(g.key)}
                className={
                  "text-left p-3 rounded-xl border " +
                  (selected === g.key ? "bg-slate-900 border-indigo-500" : "bg-slate-950 border-slate-800 hover:bg-slate-900")
                }
              >
                <div className="font-semibold">{g.label}</div>
                <div className="text-slate-400 text-sm mt-1">{jp ? formatCurrency(jp) : "Tap for details"}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xl font-semibold">{selectedGame.label}</div>
              <div className="text-slate-400 text-sm mt-1">
                {selectedData?.nextDraw ? <>Next draw: {formatDateTime(selectedData.nextDraw)}</> : "—"}
              </div>
            </div>
            <button onClick={refreshAll} className="px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-sm">
              Refresh
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-slate-400 text-sm">Estimated jackpot</div>
              <div className="text-2xl font-bold mt-1">{formatCurrency(selectedData?.jackpot ?? selectedData?.estimatedJackpot)}</div>
              <div className="text-slate-500 text-sm mt-1">
                Cash option: {formatCurrency(selectedData?.cash ?? selectedData?.cashValue)}
              </div>
              {renderNumbersBlock(selectedData)}
              {selectedData?.ok === false ? <div className="text-rose-400 text-sm mt-2">API error: {selectedData.error || "Unknown"}</div> : null}
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div className="font-semibold">After-tax calculator</div>
              <div className="text-slate-400 text-sm mt-1">Quick estimate on the cash option (or any lump sum).</div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-slate-400 text-xs">Lump sum ($)</label>
                  <input
                    className="mt-1 w-full rounded bg-slate-900 border border-slate-800 px-3 py-2"
                    placeholder="e.g. 120000000"
                    value={lumpSum}
                    onChange={(e) => setLumpSum(e.target.value.replace(/[^0-9.]/g, ""))}
                  />
                  <div className="text-slate-500 text-xs mt-1">Tip: paste the cash option above.</div>
                </div>
                <div>
                  <label className="text-slate-400 text-xs">Tax %</label>
                  <input
                    className="mt-1 w-full rounded bg-slate-900 border border-slate-800 px-3 py-2"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value.replace(/[^0-9.]/g, ""))}
                  />
                </div>
              </div>

              <div className="mt-4">
                <div className="text-slate-400 text-sm">Estimated after tax</div>
                <div className="text-2xl font-bold mt-1">{calcOut === null ? "—" : formatCurrency(calcOut)}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div className="font-semibold">Quick Pick generator</div>
              <div className="text-slate-400 text-sm mt-1">Generate numbers fast, save your favorites.</div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    let nums = [];
                    if (selected === "ga_fantasy5") nums = quickPick(5, 42, true);
                    else if (selected === "ga_cash3") nums = quickPick(3, 10, false).map(n => n-1); // 0-9
                    else if (selected === "ga_cash4") nums = quickPick(4, 10, false).map(n => n-1);
                    else if (selected === "cash4life") nums = [...quickPick(5, 60, true), ...quickPick(1, 4, true)];
                    else if (selected === "pb") nums = [...quickPick(5, 69, true), ...quickPick(1, 26, true)];
                    else if (selected === "mm") nums = [...quickPick(5, 70, true), ...quickPick(1, 25, true)];
                    savePick(selected, nums, "Quick Pick");
                  }}
                  className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-sm"
                >
                  Generate + Save
                </button>
                <button
                  onClick={() => { localStorage.removeItem("gaLottoSavedPicks"); setSavedPicks([]); }}
                  className="px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-sm"
                >
                  Clear saved
                </button>
              </div>

              <div className="mt-3 text-slate-500 text-xs">
                Formats: PB/MM = 5 + Power/Mega ball. Cash4Life = 5 + Cash Ball. GA Cash games = digits.
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div className="font-semibold">Saved picks</div>
              <div className="text-slate-400 text-sm mt-1">Stored on your device only.</div>

              <div className="mt-3 max-h-56 overflow-auto space-y-2">
                {savedPicks.length === 0 ? <div className="text-slate-500 text-sm">No saved picks yet.</div> : null}
                {savedPicks.map(p => (
                  <div key={p.id} className="p-2 rounded bg-slate-900 border border-slate-800">
                    <div className="flex justify-between gap-2">
                      <div className="font-semibold text-sm">{(GAMES.find(g=>g.key===p.gameKey)?.label)||p.gameKey}</div>
                      <div className="text-slate-500 text-xs">{formatDateTime(p.createdAt)}</div>
                    </div>
                    <div className="text-white text-lg mt-1">{safeJoin(p.numbers)}</div>
                    {p.note ? <div className="text-slate-500 text-xs mt-1">{p.note}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="text-center text-slate-500 text-xs mt-8">
          <p>Must be 18+. Play responsibly.</p>
          <p className="mt-2">Problem gambling? Call 1-800-GAMBLER</p>
        </div>
      </div>
    </div>
  );
}

// Render
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<GeorgiaLotteryHub />);