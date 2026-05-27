import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const N8N_BASE_URL = process.env.N8N_BASE_URL || "http://localhost:5678";
const N8N_API_KEY = process.env.N8N_API_KEY || "";

async function n8nRequest(method, path, body = null) {
  const url = `${N8N_BASE_URL}/api/v1${path}`;
  const headers = {
    "Content-Type": "application/json",
    "X-N8N-API-KEY": N8N_API_KEY,
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`n8n API error ${res.status}: ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const server = new Server(
  { name: "mcp-n8n", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "n8n_list_workflows",
      description: "Lista todos os workflows do n8n. Mostra nome, ID, status (ativo/inativo) e data de atualização.",
      inputSchema: {
        type: "object",
        properties: {
          active: {
            type: "boolean",
            description: "Filtrar apenas workflows ativos (true) ou inativos (false). Omitir para ver todos.",
          },
          limit: {
            type: "number",
            description: "Número máximo de resultados (padrão: 100)",
          },
        },
      },
    },
    {
      name: "n8n_get_workflow",
      description: "Obtém os detalhes completos de um workflow específico pelo ID, incluindo nós e conexões.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "ID do workflow" },
        },
      },
    },
    {
      name: "n8n_activate_workflow",
      description: "Ativa um workflow para que execute automaticamente conforme o trigger configurado.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "ID do workflow a ativar" },
        },
      },
    },
    {
      name: "n8n_deactivate_workflow",
      description: "Desativa um workflow, impedindo execuções automáticas.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "ID do workflow a desativar" },
        },
      },
    },
    {
      name: "n8n_execute_workflow",
      description: "Executa um workflow manualmente, com dados de entrada opcionais.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "ID do workflow a executar" },
          data: {
            type: "object",
            description: "Dados de entrada para o workflow (opcional)",
          },
        },
      },
    },
    {
      name: "n8n_list_executions",
      description: "Lista o histórico de execuções de workflows. Mostra status, data/hora e workflow associado.",
      inputSchema: {
        type: "object",
        properties: {
          workflowId: {
            type: "string",
            description: "Filtrar por ID de workflow específico (opcional)",
          },
          status: {
            type: "string",
            enum: ["success", "error", "waiting", "running"],
            description: "Filtrar por status da execução",
          },
          limit: {
            type: "number",
            description: "Número máximo de resultados (padrão: 20)",
          },
        },
      },
    },
    {
      name: "n8n_get_execution",
      description: "Obtém os detalhes completos de uma execução específica, incluindo dados de entrada/saída de cada nó.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "ID da execução" },
        },
      },
    },
    {
      name: "n8n_delete_execution",
      description: "Elimina uma execução do histórico.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "ID da execução a eliminar" },
        },
      },
    },
    {
      name: "n8n_list_credentials",
      description: "Lista todas as credenciais configuradas no n8n (apenas nomes e tipos, sem segredos).",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "n8n_get_tags",
      description: "Lista todas as tags/etiquetas criadas no n8n.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "n8n_health_check",
      description: "Verifica se a instância n8n está online e acessível.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "n8n_list_workflows": {
        const params = new URLSearchParams();
        if (args?.active !== undefined) params.set("active", args.active);
        if (args?.limit) params.set("limit", args.limit);
        const query = params.toString() ? `?${params}` : "";
        const data = await n8nRequest("GET", `/workflows${query}`);
        const workflows = data.data || data;
        const summary = workflows.map((w) => ({
          id: w.id,
          name: w.name,
          active: w.active,
          updatedAt: w.updatedAt,
          tags: w.tags?.map((t) => t.name) || [],
        }));
        return {
          content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        };
      }

      case "n8n_get_workflow": {
        const data = await n8nRequest("GET", `/workflows/${args.id}`);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "n8n_activate_workflow": {
        await n8nRequest("PATCH", `/workflows/${args.id}`, { active: true });
        return {
          content: [{ type: "text", text: `Workflow ${args.id} ativado com sucesso.` }],
        };
      }

      case "n8n_deactivate_workflow": {
        await n8nRequest("PATCH", `/workflows/${args.id}`, { active: false });
        return {
          content: [{ type: "text", text: `Workflow ${args.id} desativado com sucesso.` }],
        };
      }

      case "n8n_execute_workflow": {
        const body = args?.data ? { workflowData: { id: args.id }, runData: args.data } : {};
        const data = await n8nRequest("POST", `/workflows/${args.id}/run`, body);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "n8n_list_executions": {
        const params = new URLSearchParams();
        if (args?.workflowId) params.set("workflowId", args.workflowId);
        if (args?.status) params.set("status", args.status);
        params.set("limit", args?.limit || 20);
        const data = await n8nRequest("GET", `/executions?${params}`);
        const executions = data.data || data;
        const summary = executions.map((e) => ({
          id: e.id,
          workflowId: e.workflowId,
          status: e.status,
          startedAt: e.startedAt,
          stoppedAt: e.stoppedAt,
          mode: e.mode,
        }));
        return {
          content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        };
      }

      case "n8n_get_execution": {
        const data = await n8nRequest("GET", `/executions/${args.id}`);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "n8n_delete_execution": {
        await n8nRequest("DELETE", `/executions/${args.id}`);
        return {
          content: [{ type: "text", text: `Execução ${args.id} eliminada.` }],
        };
      }

      case "n8n_list_credentials": {
        const data = await n8nRequest("GET", "/credentials");
        const creds = (data.data || data).map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          createdAt: c.createdAt,
        }));
        return {
          content: [{ type: "text", text: JSON.stringify(creds, null, 2) }],
        };
      }

      case "n8n_get_tags": {
        const data = await n8nRequest("GET", "/tags");
        return {
          content: [{ type: "text", text: JSON.stringify(data.data || data, null, 2) }],
        };
      }

      case "n8n_health_check": {
        const url = `${N8N_BASE_URL}/healthz`;
        const res = await fetch(url);
        const status = res.ok ? "online" : "offline";
        return {
          content: [{ type: "text", text: `n8n está ${status} (${N8N_BASE_URL}) — HTTP ${res.status}` }],
        };
      }

      default:
        throw new Error(`Ferramenta desconhecida: ${name}`);
    }
  } catch (err) {
    return {
      content: [{ type: "text", text: `Erro: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
