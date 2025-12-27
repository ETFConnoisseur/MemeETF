'use client';

import { Tweet } from 'react-tweet';

interface TweetEmbedProps {
  tweetUrl: string;
  className?: string;
}

// Extract tweet ID from various X/Twitter URL formats
function extractTweetId(url: string): string | null {
  if (!url) return null;

  // Handle various URL formats:
  // https://x.com/username/status/1234567890
  // https://twitter.com/username/status/1234567890
  // https://x.com/username/status/1234567890?s=20
  const patterns = [
    /(?:x\.com|twitter\.com)\/\w+\/status\/(\d+)/,
    /status\/(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // If it's just a numeric ID
  if (/^\d+$/.test(url.trim())) {
    return url.trim();
  }

  return null;
}

export function TweetEmbed({ tweetUrl, className = '' }: TweetEmbedProps) {
  const tweetId = extractTweetId(tweetUrl);

  if (!tweetId) {
    return null;
  }

  return (
    <div className={`tweet-embed-container ${className}`}>
      <div className="[&_.react-tweet-theme]:!bg-transparent [&_.react-tweet-theme]:!border-white/10 [&_article]:!bg-black/40 [&_article]:!border-white/10 [&_a]:!text-blue-400 [&_span]:!text-white/80 [&_p]:!text-white/90">
        <Tweet id={tweetId} />
      </div>
    </div>
  );
}
