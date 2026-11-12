import { writeFile } from "node:fs/promises";

const CHANNEL_URL = "https://www.youtube.com/@AnderEditorVideo";
const USER_AGENT = "Mozilla/5.0 (compatible; PortfolioVideoSync/1.0)";

function decodeXml(value = "") {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function tag(entry, name) {
  const match = entry.match(new RegExp("<(?:[A-Za-z0-9_-]+:)?" + name + "[^>]*>(.*?)</(?:[A-Za-z0-9_-]+:)?" + name + ">", "is"));
  return match ? decodeXml(match[1].trim()) : "";
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, "accept-language": "en-US,en;q=0.9" } });
  if (!response.ok) throw new Error("Request failed (HTTP " + response.status + "): " + url);
  return response.text();
}

async function main() {
  const html = await fetchText(CHANNEL_URL);
  const channelId = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/)?.[1]
    || html.match(/"externalId":"(UC[a-zA-Z0-9_-]{22})"/)?.[1]
    || html.match(/<meta itemprop="channelId" content="(UC[a-zA-Z0-9_-]{22})"/)?.[1];
  if (!channelId) throw new Error("Could not resolve the YouTube channel ID.");

  const [xml, shortsHtml] = await Promise.all([
    fetchText("https://www.youtube.com/feeds/videos.xml?channel_id=" + channelId),
    fetchText(CHANNEL_URL + "/shorts")
  ]);
  const shortIds = new Set([...shortsHtml.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map(match => match[1]));
  const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, entry]) => {
    const id = tag(entry, "videoId");
    return { id, title: tag(entry, "title"), published: tag(entry, "published"), author: tag(entry, "name") };
  }).filter(video => /^[a-zA-Z0-9_-]{11}$/.test(video.id) && video.title)
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published));

  const shortFormVideos = videos.filter(video => shortIds.has(video.id));
  const longFormVideos = videos.filter(video => !shortIds.has(video.id));
  await writeFile("videos.json", JSON.stringify({
    channelId, channelUrl: CHANNEL_URL, updatedAt: new Date().toISOString(),
    longFormVideos, shortFormVideos
  }, null, 2) + "\n");
  console.log("Synced " + longFormVideos.length + " long-form and " + shortFormVideos.length + " Shorts.");
}

main().catch(error => { console.error(error); process.exit(1); });
