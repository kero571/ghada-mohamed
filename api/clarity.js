// Vercel Serverless Function: وسيط آمن بين الداشبورد و Microsoft Clarity Data Export API
// التوكن يُقرأ من Environment Variable اسمها CLARITY_API_TOKEN ولا يظهر أبدًا في كود المتصفح.
// حد Clarity: 10 طلبات فقط في اليوم لكل مشروع، لذلك الرد يُخزَّن مؤقتًا 6 ساعات.

const API = "https://www.clarity.ms/export-data/api/v1/project-live-insights";
const TTL = 6 * 60 * 60 * 1000;
const memory = new Map();

module.exports = async (req, res) => {
  const token = process.env.CLARITY_API_TOKEN;
  if (!token) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(500).json({ error: "missing_token" });
  }

  let days = parseInt(req.query && req.query.days, 10);
  if (![1, 2, 3].includes(days)) days = 3;

  const hit = memory.get(days);
  if (hit && Date.now() - hit.t < TTL) {
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=3600");
    return res.status(200).json({ data: hit.d, cached: true, fetchedAt: hit.t });
  }

  try {
    const r = await fetch(`${API}?numOfDays=${days}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    });

    if (r.status === 429) {
      res.setHeader("Cache-Control", "no-store");
      if (hit) return res.status(200).json({ data: hit.d, cached: true, stale: true, fetchedAt: hit.t });
      return res.status(429).json({ error: "rate_limited" });
    }
    if (!r.ok) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(r.status).json({ error: "clarity_error", status: r.status });
    }

    const d = await r.json();
    const t = Date.now();
    memory.set(days, { t, d });
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=3600");
    return res.status(200).json({ data: d, cached: false, fetchedAt: t });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    if (hit) return res.status(200).json({ data: hit.d, cached: true, stale: true, fetchedAt: hit.t });
    return res.status(502).json({ error: "fetch_failed" });
  }
};