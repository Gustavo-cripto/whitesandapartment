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

    const userMessage = String(payload?.message || "").trim();
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

    const xaiResponse = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.XAI_API_KEY}`
      },
      body: JSON.stringify({
        model: env.XAI_MODEL || "grok-2-latest",
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ]
      })
    });

    if (!xaiResponse.ok) {
      const details = await xaiResponse.text();
      return jsonResponse(
        {
          error: "Falha ao obter resposta da IA.",
          details
        },
        502
      );
    }

    const data = await xaiResponse.json();
    const answer =
      data?.choices?.[0]?.message?.content?.trim() ||
      "Não consegui gerar resposta agora.";

    return jsonResponse({ answer });
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
