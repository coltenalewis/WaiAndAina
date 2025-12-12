// src/lib/notion.ts
const NOTION_TOKEN = process.env.NOTION_TOKEN!;
const NOTION_VERSION = process.env.NOTION_VERSION || "2022-06-28";

if (!NOTION_TOKEN) {
  throw new Error("Missing NOTION_TOKEN env var");
}

const NOTION_BASE_URL = "https://api.notion.com/v1";

export async function retrievePage(pageId: string) {
  const res = await fetch(`${NOTION_BASE_URL}/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Notion retrieve page error:", res.status, text);
    throw new Error(`Failed to retrieve Notion page: ${res.status}`);
  }

  return res.json();
}

export async function queryDatabase(databaseId: string, body: any = {}) {
  const res = await fetch(`${NOTION_BASE_URL}/databases/${databaseId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Notion error:", res.status, text);
    throw new Error(`Failed to query Notion: ${res.status}`);
  }

  return res.json();
}

export async function queryAllDatabasePages(
  databaseId: string,
  body: any = {}
) {
  let startCursor: string | undefined = undefined;
  let hasMore = true;
  const allResults: any[] = [];
  let lastResponse: any = null;

  while (hasMore) {
    const response = await queryDatabase(databaseId, {
      ...body,
      start_cursor: startCursor,
    });

    lastResponse = response;
    allResults.push(...(response.results || []));

    hasMore = Boolean(response.has_more && response.next_cursor);
    startCursor = response.next_cursor as string | undefined;
  }

  return {
    ...(lastResponse || {}),
    results: allResults,
  };
}

export async function createPageInDatabase(
  databaseId: string,
  properties: any
) {
  const res = await fetch(`${NOTION_BASE_URL}/pages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ parent: { database_id: databaseId }, properties }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Notion create page error:", res.status, text);
    throw new Error(`Failed to create Notion page: ${res.status}`);
  }

  return res.json();
}

export async function retrieveDatabase(databaseId: string) {
  const res = await fetch(`${NOTION_BASE_URL}/databases/${databaseId}`, {
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Notion retrieve database error:", res.status, text);
    throw new Error(`Failed to retrieve Notion database: ${res.status}`);
  }

  return res.json();
}

export async function updatePage(pageId: string, properties: any) {
  const res = await fetch(`${NOTION_BASE_URL}/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ properties }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Notion update error:", res.status, text);
    throw new Error(`Failed to update Notion page: ${res.status}`);
  }

  return res.json();
}

export async function retrieveComments(blockId: string) {
  const res = await fetch(
    `${NOTION_BASE_URL}/comments?block_id=${encodeURIComponent(blockId)}`,
    {
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("Notion comments error:", res.status, text);
    throw new Error(`Failed to fetch comments: ${res.status}`);
  }

  return res.json();
}

export async function createComment(blockId: string, richText: any[]) {
  const res = await fetch(`${NOTION_BASE_URL}/comments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ parent: { block_id: blockId }, rich_text: richText }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Notion create comment error:", res.status, text);
    throw new Error(`Failed to create comment: ${res.status}`);
  }

  return res.json();
}

export async function listBlockChildren(
  blockId: string,
  startCursor?: string
) {
  const search = startCursor ? `?start_cursor=${encodeURIComponent(startCursor)}` : "";

  const res = await fetch(
    `${NOTION_BASE_URL}/blocks/${blockId}/children${search}`,
    {
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("Notion block children error:", res.status, text);
    throw new Error(`Failed to fetch block children: ${res.status}`);
  }

  return res.json();
}

export async function retrieveBlock(blockId: string) {
  const res = await fetch(`${NOTION_BASE_URL}/blocks/${blockId}`, {
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Notion retrieve block error:", res.status, text);
    throw new Error(`Failed to retrieve Notion block: ${res.status}`);
  }

  return res.json();
}
