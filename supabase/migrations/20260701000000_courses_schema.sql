-- Migration: 20260701000000_courses_schema.sql
-- Description: Sets up the Courses schema, seeds Hiragana/Katakana, and updates study progress relations.

-- 1. Create Course Difficulty Enum
CREATE TYPE public.course_difficulty AS ENUM ('beginner', 'intermediate', 'advanced');

-- 2. Create Shared Categories Table
CREATE TABLE public.shared_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   UUID        REFERENCES public.shared_categories(id) ON DELETE CASCADE,
  name_key    TEXT        NOT NULL,
  position    INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create Shared Decks Table
CREATE TABLE public.shared_decks (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     UUID              NOT NULL REFERENCES public.shared_categories(id) ON DELETE RESTRICT,
  name_key        TEXT              NOT NULL,
  description_key TEXT,
  emoji           TEXT,
  color           TEXT              DEFAULT '#6366f1',
  difficulty      public.course_difficulty NOT NULL DEFAULT 'beginner',
  language        TEXT              NOT NULL DEFAULT 'ja',
  card_count      INTEGER           NOT NULL DEFAULT 0,
  is_active       BOOLEAN           NOT NULL DEFAULT TRUE,
  position        INTEGER           NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- 4. Create Shared Cards Table
CREATE TABLE public.shared_cards (
  id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_deck_id  UUID             NOT NULL REFERENCES public.shared_decks(id) ON DELETE CASCADE,
  front           TEXT             NOT NULL,
  back            TEXT             NOT NULL DEFAULT '',
  front_audio_url TEXT,
  back_audio_url  TEXT,
  card_type       public.card_type NOT NULL DEFAULT 'basic',
  position        INTEGER          NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.shared_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_cards ENABLE ROW LEVEL SECURITY;

-- 6. Define RLS Policies
CREATE POLICY "Anyone can view active shared categories" ON public.shared_categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can view active shared decks" ON public.shared_decks
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "Anyone can view shared cards" ON public.shared_cards
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can modify shared categories" ON public.shared_categories
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can modify shared decks" ON public.shared_decks
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can modify shared cards" ON public.shared_cards
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- 7. Add columns to link user progress to Shared content
ALTER TABLE public.study_decks 
  ADD COLUMN shared_deck_id UUID REFERENCES public.shared_decks(id) ON DELETE SET NULL,
  ADD CONSTRAINT unique_user_shared_deck UNIQUE (user_id, shared_deck_id);

ALTER TABLE public.study_cards
  ADD COLUMN shared_card_id UUID REFERENCES public.shared_cards(id) ON DELETE SET NULL,
  ALTER COLUMN front DROP NOT NULL,
  ADD CONSTRAINT check_front_or_shared 
    CHECK ((shared_card_id IS NULL AND front IS NOT NULL) OR (shared_card_id IS NOT NULL));

-- 8. Seed Japanese Category & Hiragana/Katakana Decks
INSERT INTO public.shared_categories (id, name_key, position)
VALUES ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'japanese', 0);

INSERT INTO public.shared_decks (id, category_id, name_key, description_key, emoji, color, difficulty, language, card_count, position)
VALUES 
  ('92827161-0000-0000-0000-000000000000', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'hiragana', 'hiragana', '🇯🇵', '#4f46e5', 'beginner', 'ja', 46, 0),
  ('92827161-0000-0000-0000-000000000001', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'katakana', 'katakana', '🎌', '#ef4444', 'beginner', 'ja', 46, 1);

-- 9. Seed 46 Hiragana Cards
INSERT INTO public.shared_cards (shared_deck_id, front, back, front_audio_url, position) VALUES
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">あ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>a</div>', '/audio/courses/japanese/hiragana/a.mp3', 0),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">い</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>i</div>', '/audio/courses/japanese/hiragana/i.mp3', 1),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">う</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>u</div>', '/audio/courses/japanese/hiragana/u.mp3', 2),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">え</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>e</div>', '/audio/courses/japanese/hiragana/e.mp3', 3),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">お</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>o</div>', '/audio/courses/japanese/hiragana/o.mp3', 4),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">か</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ka</div>', '/audio/courses/japanese/hiragana/ka.mp3', 5),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">き</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ki</div>', '/audio/courses/japanese/hiragana/ki.mp3', 6),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">く</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ku</div>', '/audio/courses/japanese/hiragana/ku.mp3', 7),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">け</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ke</div>', '/audio/courses/japanese/hiragana/ke.mp3', 8),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">こ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ko</div>', '/audio/courses/japanese/hiragana/ko.mp3', 9),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">さ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>sa</div>', '/audio/courses/japanese/hiragana/sa.mp3', 10),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">し</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>shi</div>', '/audio/courses/japanese/hiragana/shi.mp3', 11),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">す</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>su</div>', '/audio/courses/japanese/hiragana/su.mp3', 12),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">せ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>se</div>', '/audio/courses/japanese/hiragana/se.mp3', 13),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">そ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>so</div>', '/audio/courses/japanese/hiragana/so.mp3', 14),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">た</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ta</div>', '/audio/courses/japanese/hiragana/ta.mp3', 15),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">ち</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>chi</div>', '/audio/courses/japanese/hiragana/chi.mp3', 16),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">つ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>tsu</div>', '/audio/courses/japanese/hiragana/tsu.mp3', 17),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">て</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>te</div>', '/audio/courses/japanese/hiragana/te.mp3', 18),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">と</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>to</div>', '/audio/courses/japanese/hiragana/to.mp3', 19),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">な</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>na</div>', '/audio/courses/japanese/hiragana/na.mp3', 20),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">に</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ni</div>', '/audio/courses/japanese/hiragana/ni.mp3', 21),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">ぬ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>nu</div>', '/audio/courses/japanese/hiragana/nu.mp3', 22),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">ね</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ne</div>', '/audio/courses/japanese/hiragana/ne.mp3', 23),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">の</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>no</div>', '/audio/courses/japanese/hiragana/no.mp3', 24),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">は</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ha</div>', '/audio/courses/japanese/hiragana/ha.mp3', 25),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">ひ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>hi</div>', '/audio/courses/japanese/hiragana/hi.mp3', 26),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">ふ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>fu</div>', '/audio/courses/japanese/hiragana/fu.mp3', 27),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">へ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>he</div>', '/audio/courses/japanese/hiragana/he.mp3', 28),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">ほ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ho</div>', '/audio/courses/japanese/hiragana/ho.mp3', 29),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">ま</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ma</div>', '/audio/courses/japanese/hiragana/ma.mp3', 30),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">み</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>mi</div>', '/audio/courses/japanese/hiragana/mi.mp3', 31),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">む</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>mu</div>', '/audio/courses/japanese/hiragana/mu.mp3', 32),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">め</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>me</div>', '/audio/courses/japanese/hiragana/me.mp3', 33),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">も</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>mo</div>', '/audio/courses/japanese/hiragana/mo.mp3', 34),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">や</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ya</div>', '/audio/courses/japanese/hiragana/ya.mp3', 35),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">ゆ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>yu</div>', '/audio/courses/japanese/hiragana/yu.mp3', 36),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">よ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>yo</div>', '/audio/courses/japanese/hiragana/yo.mp3', 37),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">ら</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ra</div>', '/audio/courses/japanese/hiragana/ra.mp3', 38),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">り</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ri</div>', '/audio/courses/japanese/hiragana/ri.mp3', 39),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">る</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ru</div>', '/audio/courses/japanese/hiragana/ru.mp3', 40),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">れ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>re</div>', '/audio/courses/japanese/hiragana/re.mp3', 41),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">ろ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ro</div>', '/audio/courses/japanese/hiragana/ro.mp3', 42),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">わ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>wa</div>', '/audio/courses/japanese/hiragana/wa.mp3', 43),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">を</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>wo</div>', '/audio/courses/japanese/hiragana/wo.mp3', 44),
  ('92827161-0000-0000-0000-000000000000', '<div class="text-6xl font-bold text-center">ん</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>n</div>', '/audio/courses/japanese/hiragana/n.mp3', 45);

-- 10. Seed 46 Katakana Cards
INSERT INTO public.shared_cards (shared_deck_id, front, back, front_audio_url, position) VALUES
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ア</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>a</div>', '/audio/courses/japanese/katakana/a.mp3', 0),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">イ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>i</div>', '/audio/courses/japanese/katakana/i.mp3', 1),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ウ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>u</div>', '/audio/courses/japanese/katakana/u.mp3', 2),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">エ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>e</div>', '/audio/courses/japanese/katakana/e.mp3', 3),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">オ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>o</div>', '/audio/courses/japanese/katakana/o.mp3', 4),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">カ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ka</div>', '/audio/courses/japanese/katakana/ka.mp3', 5),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">キ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ki</div>', '/audio/courses/japanese/katakana/ki.mp3', 6),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ク</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ku</div>', '/audio/courses/japanese/katakana/ku.mp3', 7),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ケ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ke</div>', '/audio/courses/japanese/katakana/ke.mp3', 8),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">コ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ko</div>', '/audio/courses/japanese/katakana/ko.mp3', 9),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">サ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>sa</div>', '/audio/courses/japanese/katakana/sa.mp3', 10),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">シ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>shi</div>', '/audio/courses/japanese/katakana/shi.mp3', 11),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ス</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>su</div>', '/audio/courses/japanese/katakana/su.mp3', 12),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">セ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>se</div>', '/audio/courses/japanese/katakana/se.mp3', 13),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ソ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>so</div>', '/audio/courses/japanese/katakana/so.mp3', 14),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">タ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ta</div>', '/audio/courses/japanese/katakana/ta.mp3', 15),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">チ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>chi</div>', '/audio/courses/japanese/katakana/chi.mp3', 16),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ツ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>tsu</div>', '/audio/courses/japanese/katakana/tsu.mp3', 17),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">テ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>te</div>', '/audio/courses/japanese/katakana/te.mp3', 18),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ト</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>to</div>', '/audio/courses/japanese/katakana/to.mp3', 19),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ナ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>na</div>', '/audio/courses/japanese/katakana/na.mp3', 20),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ニ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ni</div>', '/audio/courses/japanese/katakana/ni.mp3', 21),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ヌ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>nu</div>', '/audio/courses/japanese/katakana/nu.mp3', 22),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ネ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ne</div>', '/audio/courses/japanese/katakana/ne.mp3', 23),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ノ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>no</div>', '/audio/courses/japanese/katakana/no.mp3', 24),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ハ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ha</div>', '/audio/courses/japanese/katakana/ha.mp3', 25),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ヒ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>hi</div>', '/audio/courses/japanese/katakana/hi.mp3', 26),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">フ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>fu</div>', '/audio/courses/japanese/katakana/fu.mp3', 27),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ヘ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>he</div>', '/audio/courses/japanese/katakana/he.mp3', 28),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ホ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ho</div>', '/audio/courses/japanese/katakana/ho.mp3', 29),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">マ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ma</div>', '/audio/courses/japanese/katakana/ma.mp3', 30),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ミ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>mi</div>', '/audio/courses/japanese/katakana/mi.mp3', 31),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ム</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>mu</div>', '/audio/courses/japanese/katakana/mu.mp3', 32),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">メ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>me</div>', '/audio/courses/japanese/katakana/me.mp3', 33),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">モ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>mo</div>', '/audio/courses/japanese/katakana/mo.mp3', 34),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ヤ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ya</div>', '/audio/courses/japanese/katakana/ya.mp3', 35),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ユ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>yu</div>', '/audio/courses/japanese/katakana/yu.mp3', 36),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ヨ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>yo</div>', '/audio/courses/japanese/katakana/yo.mp3', 37),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ラ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ra</div>', '/audio/courses/japanese/katakana/ra.mp3', 38),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">リ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ri</div>', '/audio/courses/japanese/katakana/ri.mp3', 39),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ル</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ru</div>', '/audio/courses/japanese/katakana/ru.mp3', 40),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">レ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>re</div>', '/audio/courses/japanese/katakana/re.mp3', 41),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ロ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>ro</div>', '/audio/courses/japanese/katakana/ro.mp3', 42),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ワ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>wa</div>', '/audio/courses/japanese/katakana/wa.mp3', 43),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ヲ</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>wo</div>', '/audio/courses/japanese/katakana/wo.mp3', 44),
  ('92827161-0000-0000-0000-000000000001', '<div class="text-6xl font-bold text-center">ン</div>', '<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Romaji</span>n</div>', '/audio/courses/japanese/katakana/n.mp3', 45);
