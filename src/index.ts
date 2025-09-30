import { Hono } from "hono";

import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { z } from "zod";

// Create MCP server with Zod schema adapter
const mcp = new McpServer({
  name: "example-server",
  version: "1.0.0",
  schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType),
});
// Define schema
const EchoSchema = z.object({
  message: z.string(),
});

// Add a tool
mcp.tool("echo", {
  description: "Echoes the input message",
  inputSchema: EchoSchema,
  handler: (args) => ({
    // args is automatically typed as { message: string }
    content: [{ type: "text", text: args.message }],
  }),
});

// Create HTTP transport
const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcp);

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get("/message", (c) => {
  return c.text("Hello Hono!");
});

// Helper function to fetch arXiv paper abstract
async function fetchArxivAbstract(arxivId: string): Promise<string> {
  // Clean the arXiv ID (remove any version numbers like v1, v2)
  const cleanId = arxivId.replace(/v\d+$/, "");
  
  // Fetch from arXiv API
  const response = await fetch(
    `http://export.arxiv.org/api/query?id_list=${cleanId}`
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch arXiv paper: ${response.statusText}`);
  }
  
  const xmlText = await response.text();
  
  // Parse the XML to extract the abstract
  // arXiv API returns Atom XML format
  const summaryMatch = xmlText.match(/<summary>([\s\S]*?)<\/summary>/);
  
  if (!summaryMatch) {
    throw new Error("Could not find abstract in arXiv response");
  }
  
  // Clean up the abstract (remove extra whitespace)
  const abstract = summaryMatch[1]
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  
  return abstract;
}

// Helper function to summarize text using Cloudflare AI
async function summarizeText(
  text: string,
  env: CloudflareBindings
): Promise<string> {
  // Use Cloudflare Workers AI for summarization
  const response = await env.AI.run("@cf/facebook/bart-large-cnn", {
    input_text: text,
    max_length: 50,
  });
  
  return response.summary;
}

// ArXiv summarizer endpoint
app.get("/debug/:id", async (c) => {
  try {
    const arxivId = c.req.param("id");
    
    if (!arxivId) {
      return c.json({ error: "ArXiv ID is required" }, 400);
    }
    
    // Fetch the abstract
    const abstract = await fetchArxivAbstract(arxivId);
    
    return c.json({
      arxivId,
      abstract,
    });
  } catch (error) {
    console.error("Error summarizing arXiv paper:", error);
    return c.json(
      {
        error: "Failed to summarize paper",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// ArXiv summarizer endpoint
app.get("/summarize/:id", async (c) => {
  try {
    const arxivId = c.req.param("id");
    
    if (!arxivId) {
      return c.json({ error: "ArXiv ID is required" }, 400);
    }
    
    // Fetch the abstract
    const abstract = await fetchArxivAbstract(arxivId);
    
    // Summarize using Cloudflare AI
    const summary = await summarizeText(abstract, c.env);
    
    return c.json({
      arxivId,
      abstract,
      summary,
    });
  } catch (error) {
    console.error("Error summarizing arXiv paper:", error);
    return c.json(
      {
        error: "Failed to summarize paper",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

app.all("/mcp", async (c) => {
  const response = await httpHandler(c.req.raw);
  return response;
});

export default app;
