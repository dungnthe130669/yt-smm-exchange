// YouTube Data API v3 wrapper
// Docs: https://developers.google.com/youtube/v3/docs
//
// IMPORTANT: Never store OAuth tokens long-term (YouTube API TOS Section 5)
// Tokens used here are single-use: verify action → discard immediately

export interface YouTubeChannel {
  id: string
  title: string
  subscriberCount: number
  publishedAt: string
}

// Get channel stats by channel ID (public, no OAuth)
export async function getChannelStats(
  channelId: string,
  apiKey: string
): Promise<YouTubeChannel | null> {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels')
  url.searchParams.set('part', 'snippet,statistics')
  url.searchParams.set('id', channelId)
  url.searchParams.set('key', apiKey)

  const res = await fetch(url.toString())
  if (!res.ok) return null

  const data = await res.json<{
    items?: Array<{
      id: string
      snippet: { title: string; publishedAt: string }
      statistics: { subscriberCount: string }
    }>
  }>()

  const item = data.items?.[0]
  if (!item) return null

  return {
    id: item.id,
    title: item.snippet.title,
    subscriberCount: parseInt(item.statistics.subscriberCount ?? '0'),
    publishedAt: item.snippet.publishedAt,
  }
}

// Verify channel exists and extract ID from URL
// Supports: /channel/UC..., /c/name, /@handle
export async function resolveChannelId(
  channelUrl: string,
  apiKey: string
): Promise<string | null> {
  // Direct UC... ID
  const ucMatch = channelUrl.match(/\/channel\/(UC[\w-]{22})/)
  if (ucMatch) return ucMatch[1] ?? null

  // Handle @username or /c/name → search API
  const handleMatch = channelUrl.match(/\/@([\w.-]+)/) ?? channelUrl.match(/\/c\/([\w.-]+)/)
  if (!handleMatch) return null

  const handle = handleMatch[1]
  const url = new URL('https://www.googleapis.com/youtube/v3/channels')
  url.searchParams.set('part', 'id')
  url.searchParams.set('forHandle', `@${handle}`)
  url.searchParams.set('key', apiKey)

  const res = await fetch(url.toString())
  if (!res.ok) return null

  const data = await res.json<{ items?: Array<{ id: string }> }>()
  return data.items?.[0]?.id ?? null
}

// Verify earner is subscribed to a channel via OAuth access token
// Token is single-use: call → check → discard (never stored)
export async function verifySubscription(
  accessToken: string,
  targetChannelId: string
): Promise<boolean> {
  const url = new URL('https://www.googleapis.com/youtube/v3/subscriptions')
  url.searchParams.set('part', 'id')
  url.searchParams.set('mine', 'true')
  url.searchParams.set('forChannelId', targetChannelId)
  url.searchParams.set('maxResults', '1')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) return false

  const data = await res.json<{ pageInfo?: { totalResults: number } }>()
  return (data.pageInfo?.totalResults ?? 0) > 0
}

// Get earner's active YouTube channel ID from OAuth token
// Returns the channel ID (UC...) of the authenticated user
export async function getMyChannelId(accessToken: string): Promise<string | null> {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels')
  url.searchParams.set('part', 'id')
  url.searchParams.set('mine', 'true')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) return null

  const data = await res.json<{ items?: Array<{ id: string }> }>()
  return data.items?.[0]?.id ?? null
}
