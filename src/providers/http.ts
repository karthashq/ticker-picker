import https from "https";

// Minimal HTTP options shared by the data providers. The app avoids a runtime
// HTTP dependency so the first install stays small.
export interface HttpRequestOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
}

// Fetch text and parse JSON with a helpful error that includes the first part
// of the body. This makes provider issues much easier to diagnose.
export async function getJson<T>(
  url: string,
  options: HttpRequestOptions = {}
): Promise<T> {
  const text = await getText(url, options);
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON from ${url}: ${message}. Body starts: ${text.slice(0, 160)}`);
  }
}

// Small Promise wrapper around https.get. It handles status errors, timeouts,
// and a consistent User-Agent for external data providers.
export function getText(
  url: string,
  options: HttpRequestOptions = {}
): Promise<string> {
  return requestText(url, { ...options, method: "GET" });
}

export async function postJson<T>(
  url: string,
  body: unknown,
  options: HttpRequestOptions = {}
): Promise<T> {
  const text = await requestText(url, {
    ...options,
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON from ${url}: ${message}. Body starts: ${text.slice(0, 160)}`);
  }
}

export function postForm(
  url: string,
  form: Record<string, string>,
  options: HttpRequestOptions = {}
): Promise<string> {
  return requestText(url, {
    ...options,
    method: "POST",
    body: new URLSearchParams(form).toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(options.headers ?? {})
    }
  });
}

function requestText(
  url: string,
  options: HttpRequestOptions = {}
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 20000;
  const headers = {
    "User-Agent":
      "TickerPicker/0.1 (+https://local.app; investment research automation)",
    Accept: "application/json,text/plain,*/*",
    ...(options.headers ?? {})
  };

  return new Promise((resolve, reject) => {
    const request = https.request(url, { headers, method: options.method ?? "GET" }, response => {
      const statusCode = response.statusCode ?? 0;
      const chunks: Buffer[] = [];

      response.on("data", chunk => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (statusCode >= 400) {
          reject(new Error(`HTTP ${statusCode} for ${url}: ${body.slice(0, 240)}`));
          return;
        }

        resolve(body);
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Request timed out after ${timeoutMs}ms: ${url}`));
    });

    request.on("error", reject);
    if (options.body) {
      request.write(options.body);
    }
    request.end();
  });
}

// Build URLs through URLSearchParams rather than manual string concatenation so
// provider query strings are encoded safely.
export function withQuery(
  baseUrl: string,
  params: Record<string, string | number | boolean | undefined>
): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}
