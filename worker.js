function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {

      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
      }

      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: corsHeaders()
        });
      }

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
        return new Response(JSON.stringify({ error: "Server is missing the GEMINI_API_KEYS secret." }), {
          status: 500,
          headers: corsHeaders()
        });
      }

      const model = env.GEMINI_MODEL || "gemini-3.5-flash";
      const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";

      let lastStatus = 500;
      let lastBody = JSON.stringify({ error: "Unknown error" });

      for (const key of keys) {
        let response;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 25000);
          response = await fetch(apiUrl, {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": key
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: "user", parts: [{ text: userPrompt }] }],
              generation_config: {
                temperature: temperature,
                top_p: 0.95,
                max_output_tokens: maxTokens,
                response_mime_type: "application/json"
              }
            })
          });
          clearTimeout(timeoutId);
        } catch (err) {
          lastStatus = 504;
          lastBody = JSON.stringify({ error: "Network/timeout error: " + String(err) });
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

    return env.ASSETS.fetch(request);
  }
};
