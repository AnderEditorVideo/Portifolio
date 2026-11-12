import { writeFile } from "node:fs/promises";

const CHANNEL_URL = "https://www.youtube.com/@AnderEditorVideo";
const USER_AGENT = "Mozilla/5.0 (compatible; PortfolioVideoSync/1.0)";

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function tag(entry, name) {
  const match = entry.match(new RegExp(`<(?:[\\w-]+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${name}>`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
}

async function main() {
  const channelResponse = await fetch(CHANNEL_URL, {
    headers: { "user-agent": USER_AGENT, "accept-language": "en-US,en;q=0.9" }
  });
  if (!channelResponse.ok) throw new Error(`Could not load channel page: HTTP ${channelResponse.status}`);
  const html = await channelResponse.text();
  const channelId =
    html.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/)?.[1] ||
    html.match(/"externalId":"(UC[a-zA-Z0-9_-]{22})"/)?.[1] ||
    html.match(/<meta itemprop="channelId" content="(UC[a-zA-Z0-9_-]{22})"/)?.[1];

  if (!channelId) throw new Error("Could not resolve the YouTube channel ID from its public page.");

  const feedResponse = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
    headers: { "user-agent": USER_AGENT }
  });
  if (!feedResponse.ok) throw new Error(`Could not load YouTube RSS feed: HTTP ${feedResponse.status}`);
  const xml = await feedResponse.text();

  const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, entry]) => {
    const id = tag(entry, "videoId");
    const title = tag(entry, "title");
    const published = tag(entry, "published");
    const author = tag(entry, "name");
    return {
      id,
      title,
      published,
      author,
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    };
  }).filter(video => /^[a-zA-Z0-9_-]{11}$/.test(video.id) && video.title)
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published));

  await writeFile("videos.json", JSON.stringify({
    channelId,
    channelUrl: CHANNEL_URL,
    updatedAt: new Date().toISOString(),
    videos
  }, null, 2) + "\n");

  console.log(`Updated videos.json with ${videos.length} public uploads from ${channelId}.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
