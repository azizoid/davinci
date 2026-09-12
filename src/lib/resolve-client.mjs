export async function executeResolve(operationPlan, bridgeUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30 * 60 * 1000);
  try {
    const response = await fetch(`${bridgeUrl.replace(/\/$/u, "")}/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(operationPlan),
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Resolve bridge returned ${response.status}: ${body.slice(0, 1000)}`);
    return JSON.parse(body);
  } finally {
    clearTimeout(timeout);
  }
}
