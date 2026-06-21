import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { AudioChip } from "./audio-chip";

declare module "@tiptap/core" {
  interface AllExtensions {
    audio: typeof AudioExtension;
  }
}

export const AudioExtension = Node.create({
  name: "audio",
  group: "inline",
  inline: true,
  selectable: true,
  draggable: false,
  atom: true,

  addAttributes() {
    return {
      audioId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-audio-id"),
        renderHTML: (attributes) => {
          if (!attributes.audioId) {
            return {};
          }
          return {
            "data-audio-id": attributes.audioId,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="audio"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "audio" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AudioChip);
  },

  addStorage() {
    return {
      audios: [],
      onMoveSide: null,
      onDelete: null,
    };
  },
});
