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

function parseXaiDetails(detailsText) {
  const raw = String(detailsText || "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return String(parsed?.error?.message || parsed?.message || raw);
  } catch {
    return raw;
  }
}

function buildXaiErrorPayload(detailsText, statusCode, model) {
  const details = parseXaiDetails(detailsText);
  const lower = details.toLowerCase();

  if (statusCode === 401 || lower.includes("api key") || lower.includes("unauthorized") || lower.includes("invalid_api_key")) {
    return {
      error: "A chave da IA parece inválida ou expirada.",
      details,
      model
    };
  }

  if (statusCode === 429 || lower.includes("rate limit") || lower.includes("quota") || lower.includes("too many requests")) {
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

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.XAI_API_KEY) {
      return jsonResponse(
        { error: "XAI_API_KEY não configurada no Cloudflare." },
        500
      );
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

    const systemPrompt =
      "És o assistente virtual do White Sand Apartments. " +
      "Responde em português claro, curto e útil para hóspedes. " +
      "Se não souberes algo específico, orienta o hóspede a contactar o anfitrião.";

    const modelCandidates = [
      env.XAI_MODEL,
      "grok-beta",
      "grok-2",
      "grok-2-1212",
      "grok-3-mini-beta",
      "grok-3-fast-beta"
    ].filter(Boolean);

    let lastErrorDetails = "";

    for (const model of modelCandidates) {
      const xaiResponse = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.XAI_API_KEY}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage }
          ]
        })
      });

      if (!xaiResponse.ok) {
        const details = await xaiResponse.text();
        lastErrorDetails = details;
        if (details.includes("Model not found")) continue;
        return jsonResponse(buildXaiErrorPayload(details, xaiResponse.status, model), 502);
      }

      const data = await xaiResponse.json();
      const answer =
        data?.choices?.[0]?.message?.content?.trim() ||
        "Não consegui gerar resposta agora.";
      return jsonResponse({ answer, model });
    }

    return jsonResponse(
      {
        error: "Nenhum modelo Grok válido encontrado.",
        details: lastErrorDetails || "Configure XAI_MODEL com um modelo disponível na sua conta."
      },
      502
    );
  } catch (error) {
    return jsonResponse(
      {
        error: "Erro interno no endpoint de chat.",
        details: String(error)
      },
      500
    );
  }
}
