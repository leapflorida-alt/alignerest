// api/segment.js
// Vercel serverless function — proxies tooth point to Roboflow SAM
// Called by the app as: POST /api/segment

export const config = { bodyParser: { sizeLimit: '10mb' } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageBase64, cx, cy, imageId } = req.body || {};

  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

  // If no Roboflow key configured, return null so app uses bbox fallback
  if (!process.env.ROBOFLOW_API_KEY) {
    return res.status(200).json({ polygon: null, fallback: true });
  }

  try {
    const payload = {
      image: { type: 'base64', value: imageBase64 },
      prompts: [{ type: 'point', x: cx, y: cy, label: 1 }],
      image_id: imageId || `tooth_${Date.now()}`,
    };

    const rfRes = await fetch(
      `https://serverless.roboflow.com/sam2/embed_image?api_key=${process.env.ROBOFLOW_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    if (!rfRes.ok) {
      // Graceful fallback — don't crash the whole detection
      return res.status(200).json({ polygon: null, fallback: true, status: rfRes.status });
    }

    const data = await rfRes.json();

    if (data.masks && data.masks.length > 0) {
      const mask = data.masks[0];
      if (mask.polygon && mask.polygon.length > 2) {
        return res.status(200).json({ polygon: mask.polygon });
      }
      if (mask.points && mask.points.length > 4) {
        const pts = [];
        for (let i = 0; i < mask.points.length; i += 2) {
          pts.push([mask.points[i], mask.points[i+1]]);
        }
        return res.status(200).json({ polygon: pts });
      }
    }

    // No usable mask — app will use bbox
    return res.status(200).json({ polygon: null, fallback: true });

  } catch (err) {
    // Never crash — always graceful fallback
    return res.status(200).json({ polygon: null, fallback: true, error: err.message });
  }
}
