// api/detect.js
// Vercel serverless function — proxies image to Claude Vision
// Called by the app as: POST /api/detect

export const config = { bodyParser: { sizeLimit: '10mb' } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageBase64, imageType, arch } = req.body || {};

  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
  if (!['upper','lower'].includes(arch)) return res.status(400).json({ error: 'arch must be upper or lower' });

  const UPPER_TEETH = [
    { id:6,  label:'#6',  name:'UR Canine',  widthMm:7.5  },
    { id:7,  label:'#7',  name:'UR Lateral', widthMm:6.5  },
    { id:8,  label:'#8',  name:'UR Central', widthMm:8.5  },
    { id:9,  label:'#9',  name:'UL Central', widthMm:8.5  },
    { id:10, label:'#10', name:'UL Lateral', widthMm:6.5  },
    { id:11, label:'#11', name:'UL Canine',  widthMm:7.5  },
  ];
  const LOWER_TEETH = [
    { id:22, label:'#22', name:'LL Canine',  widthMm:6.5  },
    { id:23, label:'#23', name:'LL Lateral', widthMm:6.0  },
    { id:24, label:'#24', name:'LL Central', widthMm:5.5  },
    { id:25, label:'#25', name:'LR Central', widthMm:5.5  },
    { id:26, label:'#26', name:'LR Lateral', widthMm:6.0  },
    { id:27, label:'#27', name:'LR Canine',  widthMm:6.5  },
  ];

  const teethDefs = arch === 'upper' ? UPPER_TEETH : LOWER_TEETH;
  const teethLabels = teethDefs.map(t => `${t.label} (${t.name})`).join(', ');
  const refTooth = arch === 'upper' ? '#8 is ~8.5mm wide' : '#24 is ~5.5mm wide';

  const prompt = `You are a dental imaging AI. Analyze this intraoral ${arch} arch photograph.

Identify these teeth: ${teethLabels}

For each tooth visible, return its CENTER point as a fraction of image dimensions (0-1 range).
Also estimate pixels-per-mm scale: tooth ${refTooth} (use this to calculate ppm).

Respond ONLY with valid JSON, no markdown, no extra text:
{
  "ppm": <number, pixels per mm>,
  "teeth": [
    {"id": <tooth_number>, "cx": <0-1 fraction>, "cy": <0-1 fraction>, "visible": <true|false>}
  ]
}

Include ALL teeth from the list even if not visible (set visible:false). Order by tooth id.`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageType || 'image/jpeg',
                data: imageBase64,
              }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      return res.status(500).json({ error: data.error?.message || 'Claude API error' });
    }

    const text = data.content.map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
