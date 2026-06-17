export interface SystemPrompt {
  id: string;
  title: string;
  name: string;
  content: string;
  is_system: boolean;
}

export const SYSTEM_PROMPTS: SystemPrompt[] = [
  {
    id: "system-japanese-flashcards",
    title: "Japanese Flashcards Example",
    name: "Japanese Flashcards Example",
    content: "Only the kanji on the front. On the back include the hiragana and the meaning.",
    is_system: true,
  },
];
