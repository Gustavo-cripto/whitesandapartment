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
    const apiKey = normalizeApiKey(env.XAI_API_KEY);

    if (!apiKey) {
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

    const lang = String(payload?.lang || "pt").trim().slice(0, 5);
    const langMap = { en: "English", fr: "French", es: "Spanish", de: "German" };
    const replyLang = langMap[lang] || "Portuguese";

    const systemPrompt =
      `You are the virtual assistant for White Sand Apartments in Albufeira, Portugal. ` +
      `Always reply in ${replyLang}. Keep replies short, friendly and useful for guests. ` +
      `Key facts about the property:\n` +
      `- Address: Rua do MFA, n.15, 8200-157 Albufeira, Portugal (coords: 37.0891053, -8.2507170)\n` +
      `- Check-in: from 16:00 | Check-out: by 10:00\n` +
      `- Key access via key-safe or in person (code sent on arrival day)\n` +
      `- Wi-Fi: network and password shown in the Wi-Fi section after email validation\n` +
      `- No smoking indoors | No parties | No extra guests without consent | No pets | Quiet hours 22:00–08:00\n` +
      `- Emergency: call 112. Hospital Lusíadas Albufeira: 289 892 040. Fire: 289 586 333. Police: 289 590 790\n` +
      `- Faro Airport: 45 km (~35 min). Taxi: 289 583 230. Bus line 10 is 50 m away. Train: Ferreiras-Albufeira station\n` +
      `- Host contact: +351 910 000 000 | reservas@whitesand.pt\n` +
      `- Nearby beaches: Praia dos Pescadores (300 m), Praia da Gale, Praia da Falesia\n` +
      `- Recommended restaurants: Tasca do Viegas, Taberna do Pescador, Franguinho de Albufeira, Clay Oven\n` +
      `- Nightlife: Oura strip and Albufeira Old Town\n` +
      `- Attractions: Benagil caves, Silves Castle, Zoomarine, Albufeira Old Town, marina\n` +
      `If you don't know something specific, direct the guest to contact the host.`;

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
          authorization: `Bearer ${apiKey}`
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
