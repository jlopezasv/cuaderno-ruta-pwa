export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: { message: 'Method not allowed' },
      code: 'CHAT_METHOD_NOT_ALLOWED',
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: { message: 'API key not configured' },
      code: 'CHAT_NOT_CONFIGURED',
    });
  }

  try {
    const body = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: body.model || 'claude-sonnet-4-20250514',
        max_tokens: body.max_tokens || 1000,
        system: body.system || '',
        messages: body.messages || [],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const upstreamError =
        data?.error && typeof data.error === 'object'
          ? data.error
          : { message: data?.error || 'API error' };
      return res.status(response.status).json({
        ok: false,
        error: upstreamError,
        code: 'CHAT_UPSTREAM_ERROR',
      });
    }

    return res.status(200).json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: { message: error.message || 'Internal server error' },
      code: 'CHAT_INTERNAL',
    });
  }
}
