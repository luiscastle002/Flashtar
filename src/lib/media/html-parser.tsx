import React from "react";
import { MediaRenderer, type MediaRendererProps } from "@/components/shared/media-renderer";

/**
 * Parses an HTML string from the database and returns an array of React elements.
 * Custom <div data-type="media-attachment"> elements are intercepted and rendered
 * as React `<MediaRenderer />` components. Other text segment blocks are safely
 * rendered via dangerouslySetInnerHTML wrappers.
 */
export function parseHtmlContent(html: string, options?: { isPreview?: boolean }): React.ReactNode[] {
  if (!html) return [];

  // Match the entire <div data-type="media-attachment"...></div> block
  const mediaRegex = /<div\s+([^>]*data-type="media-attachment"[^>]*)>([\s\S]*?)<\/div>/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mediaRegex.exec(html)) !== null) {
    const startIndex = match.index;
    const attributesStr = match[1];

    // Push the preceding HTML block if it exists
    if (startIndex > lastIndex) {
      const precedingHtml = html.substring(lastIndex, startIndex);
      elements.push(
        <span 
          key={`html-${lastIndex}`}
          dangerouslySetInnerHTML={{ __html: precedingHtml }}
        />
      );
    }

    // Helper to extract attribute values out of the raw string block
    const getAttr = (name: string) => {
      const matchAttr = attributesStr.match(new RegExp(`data-${name}="([^"]*)"`)) || 
                        attributesStr.match(new RegExp(`${name}="([^"]*)"`));
      return matchAttr ? matchAttr[1] : "";
    };

    const src = getAttr("src");
    const mediaType = (getAttr("media-type") || "image") as MediaRendererProps["mediaType"];
    const width = getAttr("width") || "100%";
    const fit = (getAttr("fit") || "contain") as MediaRendererProps["fit"];
    const alignment = (getAttr("alignment") || "center") as MediaRendererProps["alignment"];
    const alt = getAttr("alt") || "";
    const caption = getAttr("caption") || "";

    if (src) {
      if (options?.isPreview) {
        const label = mediaType.charAt(0).toUpperCase() + mediaType.slice(1);
        elements.push(
          <strong key={`media-preview-${startIndex}`} className="text-muted-foreground mx-1 text-xs select-none">
            [{label}]
          </strong>
        );
      } else {
        elements.push(
          <MediaRenderer
            key={`media-${startIndex}`}
            src={src}
            mediaType={mediaType}
            width={width}
            fit={fit}
            alignment={alignment}
            alt={alt}
            caption={caption}
          />
        );
      }
    }

    lastIndex = mediaRegex.lastIndex;
  }

  // Push any remaining HTML block
  if (lastIndex < html.length) {
    const remainingHtml = html.substring(lastIndex);
    elements.push(
      <span 
        key={`html-${lastIndex}`}
        dangerouslySetInnerHTML={{ __html: remainingHtml }}
      />
    );
  }

  return elements;
}
