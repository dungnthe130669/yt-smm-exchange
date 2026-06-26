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

// Refresh an access token using a stored refresh token
export async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json<{ access_token?: string; error?: string }>()
  if (!data.access_token) throw new Error(data.error ?? 'refresh_failed')
  return data.access_token
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

// Like a video on behalf of earner
export async function likeVideo(
  accessToken: string,
  videoId: string
): Promise<{ ok: boolean; error?: string }> {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos/rate')
  url.searchParams.set('id', videoId)
  url.searchParams.set('rating', 'like')
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 204 || res.ok) return { ok: true }
  const data = await res.json<{ error?: { message?: string } }>()
  return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` }
}

// Verify earner has liked a video
export async function verifyLike(
  accessToken: string,
  videoId: string
): Promise<boolean> {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos/getRating')
  url.searchParams.set('id', videoId)
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return false
  const data = await res.json<{ items?: Array<{ videoId: string; rating: string }> }>()
  return data.items?.[0]?.rating === 'like'
}

// Post a comment on a video
export async function postComment(
  accessToken: string,
  videoId: string,
  text: string
): Promise<{ ok: boolean; comment_id?: string; error?: string }> {
  const res = await fetch('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      snippet: {
        videoId,
        topLevelComment: {
          snippet: { textOriginal: text },
        },
      },
    }),
  })
  if (!res.ok) {
    const data = await res.json<{ error?: { message?: string } }>()
    return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` }
  }
  const data = await res.json<{ id?: string }>()
  if (data.id !== undefined) {
    return { ok: true, comment_id: data.id }
  }
  return { ok: true }
}

// Verify a comment exists by ID
export async function verifyComment(
  accessToken: string,
  commentId: string
): Promise<boolean> {
  // commentId from commentThreads is the thread ID
  const url = new URL('https://www.googleapis.com/youtube/v3/commentThreads')
  url.searchParams.set('part', 'id')
  url.searchParams.set('id', commentId)
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return false
  const data = await res.json<{ pageInfo?: { totalResults: number } }>()
  return (data.pageInfo?.totalResults ?? 0) > 0
}

// Subscribe earner's channel to a target channel via stored access token
export async function subscribeToChannel(
  accessToken: string,
  targetChannelId: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('https://www.googleapis.com/youtube/v3/subscriptions?part=snippet', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      snippet: {
        resourceId: {
          kind: 'youtube#channel',
          channelId: targetChannelId,
        },
      },
    }),
  })

  if (res.status === 409) {
    // Already subscribed — treat as success
    return { ok: true }
  }

  if (!res.ok) {
    const data = await res.json<{ error?: { message?: string; errors?: Array<{ reason?: string }> } }>()
    const reason = data.error?.errors?.[0]?.reason ?? ''
    const msg = data.error?.message ?? `HTTP ${res.status}`
    // subscriptionForbidden = trying to sub own channel
    if (reason === 'subscriptionForbidden') {
      return { ok: false, error: 'Cannot subscribe to your own channel' }
    }
    return { ok: false, error: msg }
  }

  return { ok: true }
}
