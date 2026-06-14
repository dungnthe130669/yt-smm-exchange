// Anti-abuse utility — centralized fraud check logic

export interface FraudCheckResult {
  ok: boolean
  error?: string
  message?: string
}

// Verify channel URL is a real YouTube channel
export async function validateChannelUrl(url: string): Promise<{ valid: boolean; channelId?: string | undefined }> {
  // Accept /channel/UC..., /@handle, /c/name
  const patterns = [
    /youtube\.com\/channel\/(UC[\w-]{22})/,
    /youtube\.com\/@([\w.-]+)/,
    /youtube\.com\/c\/([\w.-]+)/,
    /youtube\.com\/user\/([\w.-]+)/,
  ]
  const isYT = patterns.some((p) => p.test(url))
  if (!isYT) return { valid: false }

  const ucMatch = url.match(/\/channel\/(UC[\w-]{22})/)
  return { valid: true, channelId: ucMatch?.[1] ?? undefined }
}

// Get daily IP task count from KV
export async function getIpDailyCount(kv: KVNamespace, ipHash: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const val = await kv.get(`ip:${ipHash}:${today}`)
  return parseInt(val ?? '0')
}

// Increment IP daily count in KV (TTL 24h)
export async function incrementIpDailyCount(kv: KVNamespace, ipHash: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const key = `ip:${ipHash}:${today}`
  const current = parseInt((await kv.get(key)) ?? '0')
  await kv.put(key, String(current + 1), { expirationTtl: 86400 })
}

// Calculate random delay between 20-45 minutes
export function randomDelaySec(): number {
  const min = 20 * 60
  const max = 45 * 60
  return Math.floor(Math.random() * (max - min) + min)
}
