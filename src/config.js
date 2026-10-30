export const API_BASE_URL =
  ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://localhost:8788/v4"
    : "https://kickbase-worker.better-kickbase.workers.dev/v4";
