export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type Health = {
  status: string;
  service: string;
  version: string;
};

export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch(`${API_BASE_URL}/healthz`, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  return response.json() as Promise<Health>;
}
