// Fonction serveur Netlify — sert d'intermédiaire vers l'API Anthropic.
// La clé API reste secrète côté serveur (variable d'environnement ANTHROPIC_API_KEY),
// jamais exposée au navigateur. Le front-end appelle "/.netlify/functions/ai-lookup".

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Clé API Anthropic absente côté serveur (variable d'environnement ANTHROPIC_API_KEY non configurée sur Netlify)." })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Corps de requête invalide (JSON attendu).' }) };
  }

  const prompt = payload.prompt;
  if (!prompt || typeof prompt !== 'string') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Champ "prompt" manquant.' }) };
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1800,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]
      })
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        headers,
        body: JSON.stringify({ error: (data && data.error && data.error.message) || 'Erreur API Anthropic' })
      };
    }

    let text = (data.content || [])
      .map(function (c) { return c.type === 'text' ? c.text : ''; })
      .join('\n');

    // Retire d'éventuelles balises de citation (<cite index="...">...</cite>) qui peuvent
    // apparaître avec l'outil de recherche web et casser le JSON (guillemets internes).
    text = text.replace(/<cite[^>]*>/g, '').replace(/<\/cite>/g, '');

    return { statusCode: 200, headers, body: JSON.stringify({ text: text }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Échec de connexion à l\'API Anthropic : ' + (e && e.message ? e.message : String(e)) }) };
  }
};
