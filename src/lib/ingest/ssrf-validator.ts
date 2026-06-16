import dns from "dns";

/**
 * Validates a URL to prevent SSRF (Server-Side Request Forgery) attacks.
 * Resolves the URL host to an IP address and blocks loopback, private, and link-local ranges.
 */
export async function isSafeUrl(urlStr: string): Promise<boolean> {
  try {
    const parsedUrl = new URL(urlStr);
    
    // 1. Validate Protocol
    const protocol = parsedUrl.protocol.toLowerCase();
    const isLocalhostDev = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";

    if (protocol === "http:") {
      // Allow http only for localhost development
      if (!isLocalhostDev && process.env.NODE_ENV === "production") {
        return false;
      }
    } else if (protocol !== "https:") {
      // Reject any other protocols (ftp, file, data, blob, javascript, etc.)
      return false;
    }

    const host = parsedUrl.hostname;
    if (!host) {
      return false;
    }

    // 2. Resolve Host to IP Address
    const ip = await new Promise<string>((resolve, reject) => {
      dns.lookup(host, (err, address) => {
        if (err) reject(err);
        else resolve(address);
      });
    });

    // 3. Block Private/Local Networks
    return isSafeIp(ip);
  } catch (error) {
    console.error("SSRF_URL_VALIDATION_ERROR:", error);
    return false;
  }
}

/**
 * Checks if an IP address is safe (i.e. not loopback, private, or link-local).
 */
export function isSafeIp(ip: string): boolean {
  // Check if it's a valid IPv4 address
  if (ip.includes(".")) {
    const parts = ip.split(".").map((x) => parseInt(x, 10));
    if (parts.length !== 4 || parts.some(isNaN)) {
      return false;
    }

    const [o1, o2, o3, o4] = parts;

    // Loopback: 127.0.0.0/8
    if (o1 === 127) return false;

    // Private Networks (RFC 1918):
    // 10.0.0.0/8
    if (o1 === 10) return false;
    // 172.16.0.0/12
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return false;
    // 192.168.0.0/16
    if (o1 === 192 && o2 === 168) return false;

    // Link-local: 169.254.0.0/16 (includes AWS/metadata IP 169.254.169.254)
    if (o1 === 169 && o2 === 254) return false;

    // Unspecified (0.0.0.0) or Broadcast (255.255.255.255)
    if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) return false;
    if (o1 === 255 && o2 === 255 && o3 === 255 && o4 === 255) return false;

    return true;
  }

  // Check if it's a valid IPv6 address
  if (ip.includes(":")) {
    const cleanIp = ip.toLowerCase().trim();

    // Loopback (::1)
    if (cleanIp === "::1" || cleanIp === "0:0:0:0:0:0:0:1") return false;
    // Unspecified (::)
    if (cleanIp === "::" || cleanIp === "0:0:0:0:0:0:0:0") return false;

    // Unique Local: fc00::/7 (fc00... or fd00...)
    if (cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) return false;

    // Link Local: fe80::/10 (fe80... to febf...)
    if (cleanIp.startsWith("fe8") || cleanIp.startsWith("fe9") || cleanIp.startsWith("fea") || cleanIp.startsWith("feb")) {
      return false;
    }

    return true;
  }

  return false;
}
