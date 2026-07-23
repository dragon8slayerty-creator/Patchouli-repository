function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: corsHeaders()
    });
  }

  const systemPrompt = body && body.systemPrompt;
  const userPrompt = body && body.userPrompt;
  const temperature = (body && typeof body.temperature === "number") ? body.temperature : 1.0;
  const maxTokens = (body && typeof body.maxTokens === "number") ? body.maxTokens : 2000;

  if (!systemPrompt || !userPrompt) {
    return new Response(JSON.stringify({ error: "systemPrompt and userPrompt are required" }), {
      status: 400,
      headers: corsHeaders()
    });
  }

  const rawKeys = env.GEMINI_API_KEYS || env.GEMINI_API_KEY || "";
  const keys = rawKeys.split(/[,\n]/).map(k => k.trim()).filter(Boolean);

  if (keys.length === 0) {
    return new Response(JSON.stringify({ error: "Server is missing the GEMINI_API_KEYS secret. Set it in the Cloudflare Pages project settings." }), {
      status: 500,
      headers: corsHeaders()
    });
  }

  const model = env.GEMINI_MODEL || "gemini-3.5-flash";
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";

  let lastStatus = 500;
  let lastBody = JSON.stringify({ error: "Unknown error" });

  for (const key of keys) {
    let response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: temperature,
            topP: 0.95,
            maxOutputTokens: maxTokens,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingLevel: "low" }
          }
        })
      });
      clearTimeout(timeoutId);
    } catch (err) {
      lastStatus = 504;
      lastBody = JSON.stringify({ error: "Network/timeout error contacting Gemini: " + String(err) });
      continue;
    }

    const text = await response.text();

    if (response.status === 429) {
      lastStatus = 429;
      lastBody = text;
      continue;
    }

    return new Response(text, { status: response.status, headers: corsHeaders() });
  }

  return new Response(lastBody, { status: lastStatus, headers: corsHeaders() });
}
