/**
 * Cloudflare Worker - Georgia Lottery Hub API
 *
 * Deploy for FREE on Cloudflare Workers.
 * Endpoints:
 *   /api/pb
 *   /api/mm
 *   /api/cash4life
 *   /api/ga/fantasy5
 *   /api/ga/cash3
 *   /api/ga/cash4
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/json; charset=utf-8"
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    try {
      if (path === "" || path === "/") {
        return ok({
          ok: true,
          endpoints: ["/api/pb", "/api/mm", "/api/cash4life", "/api/ga/fantasy5", "/api/ga/cash3", "/api/ga/cash4"]
        }, headers);
      }

      if (path === "/api/pb") return json(await getPowerball(), headers);
      if (path === "/api/mm") return json(await getMegaMillions(), headers);
      if (path === "/api/cash4life") return json(await getCash4LifeGA(), headers);
      if (path === "/api/ga/fantasy5") return json(await getFantasy5GA(), headers);
      if (path === "/api/ga/cash3") return json(await getCash3GA(), headers);
      if (path === "/api/ga/cash4") return json(await getCash4GA(), headers);

      return json({ ok: false, error: "Not found", path }, headers, 404);
    } catch (e) {
      return json({ ok: false, error: String(e) }, headers, 500);
    }
  }
};

function ok(body, headers) {
  return new Response(JSON.stringify(body, null, 2), { status: 200, headers });
}
function json(body, headers, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers });
}

async function fetchText(u) {
  const res = await fetch(u, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ga-lotto-hub/1.0; +https://workers.dev)"
    }
  });
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${u}`);
  return await res.text();
}

function parseMoneyToNumber(str) {
  // "$26.5 Million" -> 26500000
  if (!str) return null;
  const m = str.replace(/[,]/g, "").match(/\$?\s*([\d.]+)\s*(Billion|Million|Thousand)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] || "").toLowerCase();
  const mult = unit === "billion" ? 1e9 : unit === "million" ? 1e6 : unit === "thousand" ? 1e3 : 1;
  return Math.round(n * mult);
}

function parseUSDateMMDDYYYY(s) {
  // "01/31/2026" -> ISO
  const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [_, mm, dd, yyyy] = m;
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00-05:00`).toISOString();
}

async function getPowerball() {
  // Official draw-result page (state=GA)
  const html = await fetchText("https://www.powerball.com/draw-result?gc=powerbal&oc=ga");

  // Date: "Sat, Jan 31, 2026"
  const dateMatch = html.match(/<h5[^>]*>\s*([A-Za-z]{3},\s*[A-Za-z]{3}\s*\d{1,2},\s*\d{4})\s*<\/h5>/);
  const drawDateText = dateMatch ? dateMatch[1] : null;

  // Numbers appear as standalone lines in the HTML; grab first 6 integers after "Winning Numbers"
  const winBlock = html.split(/Winning Numbers/i)[1] || "";
  const nums = (winBlock.match(/\b\d{1,2}\b/g) || []).slice(0, 6).map(n => String(Number(n)).padStart(2, "0"));

  // Power Play "Power Play 3x"
  const pp = (html.match(/Power Play\s*([0-9]{1,2})x/i) || [])[1] || null;

  // Estimated Jackpot "$59 Million"
  const jpText = (html.match(/Estimated Jackpot:\s*<\/?[^>]*>\s*([^<]+)</i) || [])[1] || null;
  const cashText = (html.match(/Cash Value:\s*<\/?[^>]*>\s*([^<]+)</i) || [])[1] || null;

  return {
    ok: true,
    game: "Powerball",
    drawDate: drawDateText ? new Date(drawDateText + " 00:00:00 ET").toISOString() : null,
    numbers: nums.length ? nums.slice(0, 5).concat(nums[5]) : null, // 5 + PB
    multiplier: pp ? `${pp}x` : null,
    estimatedJackpot: parseMoneyToNumber(jpText),
    cashValue: parseMoneyToNumber(cashText),
    source: "powerball.com"
  };
}

async function getMegaMillions() {
  // Official Mega Millions latest numbers page
  const html = await fetchText("https://www.megamillions.com/winning-numbers.aspx");

  // "DRAWING DATE: Fri., 1/30."
  const dateLine = (html.match(/DRAWING DATE:\s*<\/?[^>]*>\s*([A-Za-z]{3}\.,\s*\d{1,2}\/\d{1,2}\.?)\s*</i) || [])[1] || null;

  // Winning numbers rendered with semicolons in snippet; fallback: grab 6 numbers after "Latest Winning Numbers"
  const block = html.split(/Latest Winning Numbers/i)[1] || html;
  const nums = (block.match(/\b\d{1,2}\b/g) || []).slice(0, 6).map(n => String(Number(n)).padStart(2, "0"));

  // Megaplier
  const mp = (html.match(/Megaplier[^0-9]*([0-9]{1,2})x/i) || [])[1] || null;

  // Jackpot / cash
  const jpText = (html.match(/Estimated Jackpot:\s*<\/?[^>]*>\s*\$?\s*([^<]+)</i) || [])[1] || null;
  const cashText = (html.match(/Cash Option:\s*<\/?[^>]*>\s*\$?\s*([^<]+)</i) || [])[1] || null;

  // Next drawing (from check-your-numbers page tends to include)
  let nextDraw = null;
  try {
    const html2 = await fetchText("https://www.megamillions.com/winning-numbers/check-your-numbers.aspx");
    const nd = (html2.match(/Next\s*Drawing\s*<\/?[^>]*>\s*([A-Za-z]{3}\.,\s*\d{1,2}\/\d{1,2}\s*@\s*\d{1,2}\s*p\.m\.)/i) || [])[1] || null;
    nextDraw = nd || null;
  } catch {}

  return {
    ok: true,
    game: "Mega Millions",
    drawDate: dateLine ? null : null,
    numbers: nums.length ? nums.slice(0, 5).concat(nums[5]) : null, // 5 + Mega Ball
    multiplier: mp ? `${mp}x` : null,
    estimatedJackpot: parseMoneyToNumber(jpText),
    cashValue: parseMoneyToNumber(cashText),
    nextDraw,
    source: "megamillions.com"
  };
}

async function getFantasy5GA() {
  const html = await fetchText("https://gas-origin2.galottery.com/en-us/games/draw-games/fantasy-five.html");

  const jpText = (html.match(/JACKPOT\s*\$([0-9,]+)/i) || [])[1] || null;
  const jackpot = jpText ? Number(jpText.replace(/,/g, "")) : null;

  const drawDate = parseUSDateMMDDYYYY((html.match(/LAST DRAW RESULTS:\s*\(\s*(\d{2}\/\d{2}\/\d{4})\s*\)/i) || [])[1]);
  const nums = (html.match(/LAST DRAW RESULTS:[\s\S]*?\)\.\s*([0-9\s]{10,})/i) || [])[1];
  const numbers = nums ? (nums.match(/\b\d{1,2}\b/g) || []).slice(0, 5).map(n => String(Number(n)).padStart(2, "0")) : null;

  return { ok: true, game: "GA Fantasy 5", jackpot, drawDate, numbers, source: "gas-origin2.galottery.com" };
}

async function getCash4LifeGA() {
  const html = await fetchText("https://gas-origin2.galottery.com/en-us/games/draw-games/cash-for-life.html");
  const drawDate = parseUSDateMMDDYYYY((html.match(/LAST DRAW RESULTS:\s*\(\s*(\d{2}\/\d{2}\/\d{4})\s*\)/i) || [])[1]);
  const nums = (html.match(/LAST DRAW RESULTS:[\s\S]*?\)\.\s*([0-9\s]{10,})/i) || [])[1];
  const all = nums ? (nums.match(/\b\d{1,2}\b/g) || []).slice(0, 6).map(n => String(Number(n)).padStart(2, "0")) : null;

  return { ok: true, game: "Cash4Life (GA)", drawDate, numbers: all, source: "gas-origin2.galottery.com" };
}

function parseCashX(html, gameLabel) {
  // Pull Midday/Evening/Night blocks like:
  // "LAST DRAW RESULTS: Midday ( 02/01/2026 ). 4 4 8. Evening ( 02/01/2026 ). ..."
  const section = html.match(/LAST DRAW RESULTS:[\s\S]*?(?:About|How To Play|Odds)/i);
  const s = section ? section[0] : html;

  function parsePart(label, digits) {
    const re = new RegExp(label + "\\\\s*\\\\(\\\\s*(\\\\d{2}\\\\/\\\\d{2}\\\\/\\\\d{4})\\\\s*\\\\)\\\\s*\\\\.\\\\s*([0-9\\\\s]{"+(digits*2)+",})", "i");
    const m = s.match(re);
    if (!m) return null;
    const dt = parseUSDateMMDDYYYY(m[1]);
    const nums = (m[2].match(/\b\d\b/g) || []).slice(0, digits).map(n => String(Number(n)));
    return { drawDate: dt, numbers: nums };
  }

  return {
    ok: true,
    game: gameLabel,
    midday: parsePart("Midday", gameLabel.includes("Cash 4") ? 4 : 3),
    evening: parsePart("Evening", gameLabel.includes("Cash 4") ? 4 : 3),
    night: parsePart("Night", gameLabel.includes("Cash 4") ? 4 : 3),
    source: "gas-origin2.galottery.com"
  };
}

async function getCash3GA() {
  const html = await fetchText("https://gas-origin2.galottery.com/en-us/games/draw-games/cash-three.html");
  return parseCashX(html, "GA Cash 3");
}

async function getCash4GA() {
  const html = await fetchText("https://gas-origin2.galottery.com/en-us/games/draw-games/cash-four.html");
  return parseCashX(html, "GA Cash 4");
}