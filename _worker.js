const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type"
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS
  });
}

function normalizeApiKey(rawKey) {
  return String(rawKey || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "");
}

function parseApiDetails(detailsText) {
  const raw = String(detailsText || "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return String(parsed?.error?.message || parsed?.message || parsed?.error || raw);
  } catch {
    return raw;
  }
}

function buildApiErrorPayload(detailsText, statusCode, model) {
  const details = parseApiDetails(detailsText);
  const lower = details.toLowerCase();

  if (
    statusCode === 401 ||
    lower.includes("api key") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid_api_key")
  ) {
    return {
      error: "A chave da API parece inválida ou expirada.",
      details,
      model
    };
  }

  if (
    statusCode === 429 ||
    lower.includes("rate limit") ||
    lower.includes("quota") ||
    lower.includes("too many requests")
  ) {
    return {
      error: "A IA está com limite de pedidos neste momento.",
      details,
      model
    };
  }

  return {
    error: "Falha ao obter resposta da IA.",
    details,
    model
  };
}

async function handleChatRequest(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  const apiKey = normalizeApiKey(env.GEMINI_API_KEY);
  if (!apiKey) {
    return jsonResponse({ error: "GEMINI_API_KEY não configurada no Cloudflare." }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Pedido inválido (JSON)." }, 400);
  }

  const userMessage = String(payload?.message || payload?.userMessage || "").trim();
  if (!userMessage) {
    return jsonResponse({ error: "Mensagem vazia." }, 400);
  }
  if (userMessage.length > 2000) {
    return jsonResponse({ error: "Mensagem demasiado longa." }, 400);
  }

  const modelCandidates = [
    env.GEMINI_MODEL,
    "gemini-2.0-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash"
  ].filter(Boolean);
  const systemPrompt =
    "You are the virtual assistant of White Sand Apartments. " +
    "Reply in the same language as the guest message, with short and practical tips. " +
    "Focus on stay information, local recommendations in Albufeira, and clear guidance. " +
    "If uncertain, advise contacting the host.";

  let lastErrorDetails = "";

  for (const model of modelCandidates) {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }]
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userMessage }]
            }
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 320
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      const details = await geminiResponse.text();
      lastErrorDetails = details;
      if (details.includes("not found") || details.includes("not supported for generateContent")) {
        continue;
      }
      return jsonResponse(buildApiErrorPayload(details, geminiResponse.status, model), 502);
    }

    const data = await geminiResponse.json();
    const answer = (
      data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("\n") || ""
    ).trim();

    return jsonResponse({
      answer: answer || "Não consegui gerar resposta agora.",
      model
    });
  }

  return jsonResponse(
    {
      error: "Nenhum modelo Gemini disponível para esta conta.",
      details: parseApiDetails(lastErrorDetails) || "Defina GEMINI_MODEL com um modelo disponível no AI Studio."
    },
    502
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/chat") {
      return handleChatRequest(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};
