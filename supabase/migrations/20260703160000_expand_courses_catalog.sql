-- Migration: 20260703160000_expand_courses_catalog.sql
-- Description: Seeding English and Spanish categories, and JLPT N5, CEFR A1 English, CEFR A1 Spanish decks with initial cards.

-- 1. Insert Categories
INSERT INTO public.shared_categories (id, name_key, position)
VALUES 
  ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 'english', 1),
  ('c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 'spanish', 2)
ON CONFLICT (id) DO NOTHING;

-- 2. Insert Decks
INSERT INTO public.shared_decks (id, category_id, name_key, description_key, emoji, color, difficulty, language, card_count, position)
VALUES
  ('92827161-0000-0000-0000-000000000002', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'jlpt_n5', 'jlpt_n5', '⛩️', '#10b981', 'beginner', 'ja', 10, 2),
  ('92827161-0000-0000-0000-000000000003', 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 'english_a1', 'english_a1', '🇬🇧', '#3b82f6', 'beginner', 'en', 10, 0),
  ('92827161-0000-0000-0000-000000000004', 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 'spanish_a1', 'spanish_a1', '🇪🇸', '#f59e0b', 'beginner', 'es', 10, 0)
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Cards for JLPT N5 (10 cards)
INSERT INTO public.shared_cards (shared_deck_id, front, back, position) VALUES
  ('92827161-0000-0000-0000-000000000002', '<div class="text-6xl font-bold text-center">日本</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Japan</div><div class="text-2xl text-center text-muted-foreground mt-2">にほん (Nihon)</div>', 0),
  ('92827161-0000-0000-0000-000000000002', '<div class="text-6xl font-bold text-center">先生</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Teacher</div><div class="text-2xl text-center text-muted-foreground mt-2">せんせい (Sensei)</div>', 1),
  ('92827161-0000-0000-0000-000000000002', '<div class="text-6xl font-bold text-center">学生</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Student</div><div class="text-2xl text-center text-muted-foreground mt-2">がくせい (Gakusei)</div>', 2),
  ('92827161-0000-0000-0000-000000000002', '<div class="text-6xl font-bold text-center">友達</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Friend</div><div class="text-2xl text-center text-muted-foreground mt-2">ともだち (Tomodachi)</div>', 3),
  ('92827161-0000-0000-0000-000000000002', '<div class="text-6xl font-bold text-center">本</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Book</div><div class="text-2xl text-center text-muted-foreground mt-2">ほん (Hon)</div>', 4),
  ('92827161-0000-0000-0000-000000000002', '<div class="text-6xl font-bold text-center">水</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Water</div><div class="text-2xl text-center text-muted-foreground mt-2">みず (Mizu)</div>', 5),
  ('92827161-0000-0000-0000-000000000002', '<div class="text-6xl font-bold text-center">猫</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Cat</div><div class="text-2xl text-center text-muted-foreground mt-2">ねこ (Neko)</div>', 6),
  ('92827161-0000-0000-0000-000000000002', '<div class="text-6xl font-bold text-center">犬</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Dog</div><div class="text-2xl text-center text-muted-foreground mt-2">いぬ (Inu)</div>', 7),
  ('92827161-0000-0000-0000-000000000002', '<div class="text-6xl font-bold text-center">車</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Car</div><div class="text-2xl text-center text-muted-foreground mt-2">くるま (Kuruma)</div>', 8),
  ('92827161-0000-0000-0000-000000000002', '<div class="text-6xl font-bold text-center">桜</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Cherry Blossom</div><div class="text-2xl text-center text-muted-foreground mt-2">さくら (Sakura)</div>', 9)
ON CONFLICT (id) DO NOTHING;

-- 4. Insert Cards for English CEFR A1 (10 cards)
INSERT INTO public.shared_cards (shared_deck_id, front, back, position) VALUES
  ('92827161-0000-0000-0000-000000000003', '<div class="text-5xl font-bold text-center">Hello</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>A polite greeting used to begin a conversation.</div>', 0),
  ('92827161-0000-0000-0000-000000000003', '<div class="text-5xl font-bold text-center">Thank you</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>An expression of gratitude.</div>', 1),
  ('92827161-0000-0000-0000-000000000003', '<div class="text-5xl font-bold text-center">Please</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Used to make a polite request.</div>', 2),
  ('92827161-0000-0000-0000-000000000003', '<div class="text-5xl font-bold text-center">Goodbye</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Used when parting or leaving.</div>', 3),
  ('92827161-0000-0000-0000-000000000003', '<div class="text-5xl font-bold text-center">Friend</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>A person whom one knows and has a bond of mutual affection.</div>', 4),
  ('92827161-0000-0000-0000-000000000003', '<div class="text-5xl font-bold text-center">Family</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>A group of one or more parents and their children living together as a unit.</div>', 5),
  ('92827161-0000-0000-0000-000000000003', '<div class="text-5xl font-bold text-center">Water</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>A colorless, transparent, odorless liquid that forms the seas, lakes, rivers, and rain.</div>', 6),
  ('92827161-0000-0000-0000-000000000003', '<div class="text-5xl font-bold text-center">Food</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Any nutritious substance that people or animals eat or drink or that plants absorb in order to maintain life and growth.</div>', 7),
  ('92827161-0000-0000-0000-000000000003', '<div class="text-5xl font-bold text-center">House</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>A building for human habitation, especially one that is lived in by a family or small group of people.</div>', 8),
  ('92827161-0000-0000-0000-000000000003', '<div class="text-5xl font-bold text-center">Love</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>An intense feeling of deep affection.</div>', 9)
ON CONFLICT (id) DO NOTHING;

-- 5. Insert Cards for Spanish CEFR A1 (10 cards)
INSERT INTO public.shared_cards (shared_deck_id, front, back, position) VALUES
  ('92827161-0000-0000-0000-000000000004', '<div class="text-5xl font-bold text-center">Hola</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Hello / Hi</div>', 0),
  ('92827161-0000-0000-0000-000000000004', '<div class="text-5xl font-bold text-center">Gracias</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Thank you</div>', 1),
  ('92827161-0000-0000-0000-000000000004', '<div class="text-5xl font-bold text-center">Por favor</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Please</div>', 2),
  ('92827161-0000-0000-0000-000000000004', '<div class="text-5xl font-bold text-center">Adiós</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Goodbye</div>', 3),
  ('92827161-0000-0000-0000-000000000004', '<div class="text-5xl font-bold text-center">Amigo</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Friend (male)</div>', 4),
  ('92827161-0000-0000-0000-000000000004', '<div class="text-5xl font-bold text-center">Familia</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Family</div>', 5),
  ('92827161-0000-0000-0000-000000000004', '<div class="text-5xl font-bold text-center">Agua</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Water</div>', 6),
  ('92827161-0000-0000-0000-000000000004', '<div class="text-5xl font-bold text-center">Comida</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Food / Meal</div>', 7),
  ('92827161-0000-0000-0000-000000000004', '<div class="text-5xl font-bold text-center">Casa</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>House / Home</div>', 8),
  ('92827161-0000-0000-0000-000000000004', '<div class="text-5xl font-bold text-center">Amor</div>', '<div class="text-3xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Love</div>', 9)
ON CONFLICT (id) DO NOTHING;
