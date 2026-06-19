import { isYouTubeUrl, getYouTubeVideoId } from "../youtube-parser";

describe("YouTube URL Parser", () => {
  const targetId = "dQw4w9WgXcQ";

  describe("isYouTubeUrl", () => {
    it("should return true for valid YouTube URLs", () => {
      expect(isYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
      expect(isYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
      expect(isYouTubeUrl("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe(true);
      expect(isYouTubeUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
      expect(isYouTubeUrl("https://youtube.com/embed/dQw4w9WgXcQ")).toBe(true);
      expect(isYouTubeUrl("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toBe(true);
    });

    it("should return false for non-YouTube URLs", () => {
      expect(isYouTubeUrl("https://google.com")).toBe(false);
      expect(isYouTubeUrl("https://vimeo.com/12345")).toBe(false);
      expect(isYouTubeUrl("invalid-string")).toBe(false);
    });
  });

  describe("getYouTubeVideoId", () => {
    it("should parse standard watch URLs", () => {
      expect(getYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(targetId);
      expect(getYouTubeVideoId("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(targetId);
    });

    it("should parse short URLs", () => {
      expect(getYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe(targetId);
      expect(getYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?si=abcdef")).toBe(targetId);
      expect(getYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ&t=40")).toBe(targetId);
    });

    it("should parse Shorts URLs", () => {
      expect(getYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(targetId);
      expect(getYouTubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ?feature=share")).toBe(targetId);
    });

    it("should parse mobile URLs", () => {
      expect(getYouTubeVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(targetId);
      expect(getYouTubeVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=xyz")).toBe(targetId);
    });

    it("should parse embed URLs", () => {
      expect(getYouTubeVideoId("https://youtube.com/embed/dQw4w9WgXcQ")).toBe(targetId);
      expect(getYouTubeVideoId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toBe(targetId);
    });

    it("should parse playlist and extra parameter URLs", () => {
      expect(getYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL12345&index=2")).toBe(targetId);
      expect(getYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=45s")).toBe(targetId);
      expect(getYouTubeVideoId("https://www.youtube.com/watch?t=45s&v=dQw4w9WgXcQ")).toBe(targetId);
    });

    it("should return null for malformed or non-matching inputs", () => {
      expect(getYouTubeVideoId("https://youtube.com/")).toBe(null);
      expect(getYouTubeVideoId("https://youtu.be/")).toBe(null);
      expect(getYouTubeVideoId("https://google.com/watch?v=dQw4w9WgXcQ")).toBe(null);
      expect(getYouTubeVideoId("https://youtube.com/watch?v=short")).toBe(null); // Less than 11 chars
      expect(getYouTubeVideoId("https://youtube.com/watch?v=dQw4w9WgXcQ_extra")).toBe(null); // More than 11 chars
    });
  });
});
