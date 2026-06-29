import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { MediaNodeView } from "@/components/flashcards/media-node-view";

declare module "@tiptap/core" {
  interface AllExtensions {
    media: typeof MediaExtension;
  }
}

export const MediaExtension = Node.create({
  name: "media",
  group: "block",
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-src") || element.getAttribute("src"),
        renderHTML: (attributes) => ({
          "data-src": attributes.src,
          src: attributes.src,
        }),
      },
      mediaType: {
        default: "image",
        parseHTML: (element) => element.getAttribute("data-media-type") || "image",
        renderHTML: (attributes) => ({
          "data-media-type": attributes.mediaType,
        }),
      },
      width: {
        default: "100%",
        parseHTML: (element) => element.getAttribute("data-width") || element.getAttribute("width") || "100%",
        renderHTML: (attributes) => ({
          "data-width": attributes.width,
          width: attributes.width,
        }),
      },
      height: {
        default: "auto",
        parseHTML: (element) => element.getAttribute("data-height") || element.getAttribute("height") || "auto",
        renderHTML: (attributes) => ({
          "data-height": attributes.height,
          height: attributes.height,
        }),
      },
      fit: {
        default: "contain",
        parseHTML: (element) => element.getAttribute("data-fit") || "contain",
        renderHTML: (attributes) => ({
          "data-fit": attributes.fit,
        }),
      },
      alignment: {
        default: "center",
        parseHTML: (element) => element.getAttribute("data-alignment") || "center",
        renderHTML: (attributes) => ({
          "data-alignment": attributes.alignment,
        }),
      },
      alt: {
        default: "",
        parseHTML: (element) => element.getAttribute("alt") || "",
        renderHTML: (attributes) => ({
          alt: attributes.alt,
        }),
      },
      caption: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-caption") || "",
        renderHTML: (attributes) => ({
          "data-caption": attributes.caption,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="media-attachment"]',
      },
      {
        tag: 'img[src]',
        // Support backward-compatibility: promote legacy <img> tags to new media nodes
        getAttrs: (element) => {
          if (typeof element === "string") return false;
          const htmlEl = element as HTMLElement;
          return {
            src: htmlEl.getAttribute("src"),
            mediaType: "image",
            alignment: "center",
            width: htmlEl.getAttribute("width") || "100%",
            alt: htmlEl.getAttribute("alt") || "",
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "media-attachment" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaNodeView);
  },
});
