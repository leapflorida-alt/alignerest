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

  const UPPER_TEETH = [{id:6,label:'#6',name:'UR Canine',widthMm:7.5},{id:7,label:'#7',name:'UR Lateral',widthMm:6.5},{id:8,label:'#8',name:'UR Central',widthMm:8.5},{id:9,label:'#9',name:'UL Central',widthMm:8.5},{id:10,label:'#10',name:'UL Lateral',widthMm:6.5},{id:11,label:'#11',name:'UL Canine',widthMm:7.5}];
  const LOWER_TEETH = [{id:22,label:'#22',name:'LL Canine',widthMm:6.5},{id:23,label:'#23',name:'LL Lateral',widthMm:6.0},{id:24,label:'#24',name:'LL Central',widthMm:5.5},{id:25,label:'#25',name:'LR Central',widthMm:5.5},{id:26,label:'#26',name:'LR Lateral',widthMm:6.0},{id:27,label:'#27',name:'LR Canine',widthMm:6.5}];

  const td = arch === 'upper' ? UPPER_TEETH : LOWER_TEETH;
  const prompt = `You are a dental imaging AI. Analyze this intraoral ${arch} arch photograph.
Identify these teeth: ${td.map(t=>`${t.label} (${t.name})`).join(', ')}
Return CENTER points as 0-1 fractions of image dimensions.
Estimate ppm: central incisor is ${arch==='upper'?'8.5mm':'5.5mm'} wide.
Respond ONLY with valid JSON, no markdown:
{"ppm":<number>,"teeth":[{"id":<number>,"cx":<0-1>,"cy":<0-1>,"visible":<true|false>}]}
Include ALL teeth even if not visible. Order by tooth id.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imageType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: data.error?.message || 'Claude API error' });
    const text = data.content.map(b => b.text || '').join('');
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    console.log('PPM from AI:', parsed.ppm);
return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
