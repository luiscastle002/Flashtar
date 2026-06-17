import { env } from "@/lib/env";

/**
 * Utility to crop and resize an image file client-side to a square 128x128 WebP blob
 */
export function compressToIcon(file: File, size = 128): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // Check client-side limit: 5MB (5 * 1024 * 1024 bytes)
    if (file.size > 5 * 1024 * 1024) {
      return reject(new Error("File size exceeds the 5MB limit."));
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return reject(new Error("Failed to get 2D canvas context."));
        }

        // Center crop the image to a square
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        // Draw cropped image onto the canvas
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

        // Convert canvas content to WebP blob with 0.85 quality
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to compress image to WebP."));
            }
          },
          "image/webp",
          0.85
        );
      };
      img.onerror = () => {
        reject(new Error("Failed to load image for compression."));
      };
    };
    reader.onerror = () => {
      reject(new Error("Failed to read image file."));
    };
  });
}

/**
 * Converts a storage path like "deck-icons/userId/deckId.webp" to a fully-qualified public URL
 */
export function getDeckIconUrl(customIconPath: string | null | undefined): string | null {
  if (!customIconPath) return null;
  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${customIconPath}`;
}
