export interface ChatLine {
  username: string;
  displayName: string;
  text: string;
}

export function parseChatLine(line: string): ChatLine | null {
  const tags: Record<string, string> = {};
  if (line.startsWith("@")) {
    const spaceIdx = line.indexOf(" ");
    if (spaceIdx > 1) {
      line.slice(1, spaceIdx).split(";").forEach(kv => {
        const eq = kv.indexOf("=");
        if (eq > 0) tags[kv.slice(0, eq)] = decodeURIComponent(kv.slice(eq + 1).replace(/\\s/g, " ").replace(/\\/g, ""));
      });
    }
  }
  const m = line.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)$/);
  if (!m) return null;
  return {
    username: m[1].toLowerCase(),
    displayName: tags["display-name"] || m[1],
    text: m[2].trim(),
  };
}
