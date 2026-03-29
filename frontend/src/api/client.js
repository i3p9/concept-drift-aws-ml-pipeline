const API_BASE = import.meta.env.VITE_API_URL;
const API_KEY = import.meta.env.VITE_API_KEY;

const headers = { 'x-api-key': API_KEY };
const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

async function request(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    throw new Error(`Network error — check your connection`);
  }
  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch {}
    // Try to parse JSON error
    try {
      const json = JSON.parse(body);
      throw new Error(json.error || json.message || `API error ${res.status}`);
    } catch (e) {
      if (e.message.includes('API error') || e.message.includes('Network')) throw e;
      throw new Error(`API error ${res.status}: ${body.slice(0, 100)}`);
    }
  }
  return res.json();
}

export function fetchMetrics() {
  return request(`${API_BASE}/metrics`, { headers });
}

export function fetchLatestMetrics() {
  return request(`${API_BASE}/metrics/latest`, { headers });
}

export function fetchPredictions(storeId) {
  return request(`${API_BASE}/predictions/${storeId}/history`, { headers });
}

export function fetchPrediction(storeId) {
  return request(`${API_BASE}/predictions/${storeId}`, { headers });
}

export function fetchInventory(storeId) {
  return request(`${API_BASE}/stores/${storeId}/inventory`, { headers });
}

export function ingestBatch(records) {
  return request(`${API_BASE}/ingest`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ records })
  });
}

export function triggerRetrain(usePrevData = false) {
  return request(`${API_BASE}/retrain`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ usePrevData })
  });
}

export function resetDemo() {
  return request(`${API_BASE}/reset`, {
    method: 'POST',
    headers
  });
}
