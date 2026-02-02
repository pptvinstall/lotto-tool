export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    try {
      if (path === "/api/pb") return json(await getPowerball(), headers);
      if (path === "/api/mm") return json(await getMegaMillions(), headers);
      if (path === "/api/cash4life") return json(await getCash4Life(), headers);
      if (path === "/api/ga/fantasy5") return json(await getFantasy5(), headers);
      // Default / Ping
      return json({ ok: true, msg: "GA Lotto Worker Online" }, headers);
    } catch (e) {
      return json({ ok: false, error: String(e) }, headers, 500);
    }
  }
};

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers });
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function parseMoney(str) {
  if (!str) return 0;
  const m = str.replace(/,/g, "").match(/(\d+(\.\d+)?)\s*(Billion|Million|Thousand)?/i);
  if (!m) return 0;
  let val = parseFloat(m[1]);
  const unit = (m[3] || "").toLowerCase();
  if (unit === "billion") val *= 1e9;
  else if (unit === "million") val *= 1e6;
  else if (unit === "thousand") val *= 1e3;
  return Math.round(val);
}

// SCRAPERS
async function getPowerball() {
  const html = await fetchText("https://www.powerball.com/draw-result?gc=powerbal&oc=ga");
  // Extract numbers
  const numBlock = html.split("Winning Numbers")[1] || "";
  const nums = (numBlock.match(/item-powerball">(\d+)</) || [])[1]; // PB
  const white = (numBlock.match(/item-white">(\d+)</g) || []).map(s => parseInt(s.match(/\d+/)[0]));
  
  // Extract Jackpot
  const jp = (html.match(/Estimated Jackpot:\s*<span[^>]*>([^<]+)/i) || [])[1];
  const cash = (html.match(/Cash Value:\s*<span[^>]*>([^<]+)/i) || [])[1];

  return {
    game: "Powerball",
    numbers: white.length ? [...white, parseInt(nums || 0)] : [],
    special: parseInt(nums || 0),
    jackpot: parseMoney(jp),
    cash: parseMoney(cash),
    date: new Date().toLocaleDateString() // Approximate for caching
  };
}

async function getMegaMillions() {
  const html = await fetchText("https://www.megamillions.com/winning-numbers.aspx");
  const block = html.split("Latest Winning Numbers")[1] || "";
  // Simple regex for standard balls
  const balls = (block.match(/ball">(\d+)</g) || []).map(s => parseInt(s.match(/\d+/)[0]));
  const mb = (block.match(/goldball">(\d+)</) || [])[1];

  const jp = (html.match(/estJackpot">([^<]+)/i) || [])[1];
  const cash = (html.match(/cashOption">([^<]+)/i) || [])[1];

  return {
    game: "Mega Millions",
    numbers: balls.length ? [...balls, parseInt(mb || 0)] : [],
    special: parseInt(mb || 0),
    jackpot: parseMoney(jp),
    cash: parseMoney(cash),
    date: new Date().toLocaleDateString()
  };
}

async function getFantasy5() {
  const html = await fetchText("https://gas-origin2.galottery.com/en-us/games/draw-games/fantasy-five.html");
  const jp = (html.match(/JACKPOT\s*\$([\d,]+)/i) || [])[1];
  const nums = (html.match(/LAST DRAW RESULTS:[\s\S]*?\)\.\s*([\d\s]+)/i) || [])[1];
  const parsedNums = nums ? nums.match(/\d+/g).map(Number) : [];

  return {
    game: "Fantasy 5",
    numbers: parsedNums,
    special: null,
    jackpot: parseMoney(jp),
    cash: parseMoney(jp) // Rolling jackpot is cash
  };
}

async function getCash4Life() {
  const html = await fetchText("https://gas-origin2.galottery.com/en-us/games/draw-games/cash-for-life.html");
  const nums = (html.match(/LAST DRAW RESULTS:[\s\S]*?\)\.\s*([\d\s]+)/i) || [])[1];
  const parsedNums = nums ? nums.match(/\d+/g).map(Number) : [];
  
  return {
    game: "Cash4Life",
    numbers: parsedNums, // First 5 + 1 CB
    special: parsedNums[5] || 0,
    jackpot: 7000000, // Fixed
    cash: 1000000
  };
}
