-- ============================================================================
-- FitNutrición — Esquema Relacional PostgreSQL / Supabase en 3ª Forma Normal (3FN)
-- ============================================================================
-- Cumplimiento estricto de Normalización:
-- • 1FN: Cero arreglos o listas JSONB multivaluadas; atributos 100% atómicos.
-- • 2FN: Toda columna no clave depende por completo de la clave primaria compuesta.
-- • 3FN: Cero dependencias transitivas ni columnas calculadas redundantes
--        (como total_macros, routine_name, total_volume_kg, lbm_kg o estimated_1rm).
-- • Relaciones N:M resueltas mediante tablas intermedias con claves compuestas:
--     1) recipe_ingredients (recipes <-> food_items)
--     2) exercise_muscle_groups (exercise_catalog_items <-> muscle_groups)
--     3) workout_routine_exercises (workout_routines <-> exercise_catalog_items)
--     4) workout_routine_days (workout_routines <-> días de la semana)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. CATÁLOGOS MAESTROS NORMALIZADOS (ENTIDADES FUERTES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS muscle_groups (
  id TEXT PRIMARY KEY,
  name_es TEXT NOT NULL UNIQUE,
  name_en TEXT
);

CREATE TABLE IF NOT EXISTS equipment_types (
  id TEXT PRIMARY KEY,
  name_es TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS exercise_categories (
  id TEXT PRIMARY KEY,
  name_es TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS food_categories (
  id TEXT PRIMARY KEY,
  name_es TEXT NOT NULL UNIQUE
);

-- Semilla base de catálogos maestros
INSERT INTO exercise_categories (id, name_es) VALUES
  ('fuerza', 'Fuerza'),
  ('hipertrofia', 'Hipertrofia'),
  ('calistenia', 'Calistenia'),
  ('cardio', 'Cardio'),
  ('movilidad', 'Movilidad')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. PERFIL DE USUARIO (3FN — Sin columnas calculadas redundantes)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  birth_date DATE NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('male', 'female')),
  height_cm NUMERIC(5,2) NOT NULL CHECK (height_cm > 0),
  initial_pal NUMERIC(3,2) NOT NULL DEFAULT 1.55 CHECK (initial_pal BETWEEN 1.20 AND 1.90),
  training_experience TEXT NOT NULL CHECK (training_experience IN ('novice', 'intermediate', 'advanced')),
  returning_from_inactivity BOOLEAN NOT NULL DEFAULT FALSE,
  weeks_in_current_deficit INTEGER NOT NULL DEFAULT 0,
  goal_physique_reached BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase TEXT NOT NULL CHECK (current_phase IN ('cut', 'recomp', 'maintenance', 'bulk')),
  phase_adjustment_percent NUMERIC(5,4) NOT NULL DEFAULT 0,
  active_tdee INTEGER NOT NULL CHECK (active_tdee > 0),
  ewma_alpha NUMERIC(4,3) NOT NULL DEFAULT 0.120 CHECK (ewma_alpha BETWEEN 0.100 AND 0.150),
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. BIOMETRÍA DIARIA (3FN — Sin masa magra, masa grasa ni WHtR redundantes)
-- ============================================================================

CREATE TABLE IF NOT EXISTS biometric_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  scale_weight_kg NUMERIC(5,2) NOT NULL CHECK (scale_weight_kg > 0),
  trend_weight_kg NUMERIC(5,2) NOT NULL CHECK (trend_weight_kg > 0),
  neck_cm NUMERIC(5,2),
  waist_cm NUMERIC(5,2),
  hip_cm NUMERIC(5,2),
  estimated_bf_percent NUMERIC(5,2) NOT NULL CHECK (estimated_bf_percent BETWEEN 2 AND 70),
  bf_method TEXT NOT NULL CHECK (bf_method IN ('us_navy', 'boer_fallback')),
  sleep_hours NUMERIC(4,2),
  steps INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- ============================================================================
-- 4. ALIMENTOS, RECETAS Y TABLA INTERMEDIA N:M (recipe_ingredients)
-- ============================================================================

CREATE TABLE IF NOT EXISTS food_items (
  id TEXT PRIMARY KEY,
  owner_user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES food_categories(id) ON DELETE SET NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  brand TEXT,
  kcal_per_100g NUMERIC(6,2) NOT NULL CHECK (kcal_per_100g >= 0),
  protein_per_100g NUMERIC(6,2) NOT NULL CHECK (protein_per_100g >= 0),
  carbs_per_100g NUMERIC(6,2) NOT NULL CHECK (carbs_per_100g >= 0),
  fat_per_100g NUMERIC(6,2) NOT NULL CHECK (fat_per_100g >= 0),
  fiber_per_100g NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (fiber_per_100g >= 0),
  default_serving_name TEXT NOT NULL DEFAULT 'Porción',
  default_serving_grams NUMERIC(6,2) NOT NULL DEFAULT 100 CHECK (default_serving_grams > 0),
  is_custom BOOLEAN NOT NULL DEFAULT FALSE,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  is_bridge_food BOOLEAN NOT NULL DEFAULT FALSE
);

-- Cabecera de Receta (3FN: sin arreglos JSONB ni total_macros redundante)
CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  owner_user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT
);

-- TABLA INTERMEDIA N:M (Recetas <-> Alimentos)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  food_id TEXT NOT NULL REFERENCES food_items(id) ON DELETE RESTRICT,
  grams NUMERIC(7,2) NOT NULL CHECK (grams > 0),
  PRIMARY KEY (recipe_id, food_id)
);

-- Pasos de preparación de la receta (1FN/3FN)
CREATE TABLE IF NOT EXISTS recipe_steps (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_number SMALLINT NOT NULL CHECK (step_number > 0),
  instruction_text TEXT NOT NULL,
  PRIMARY KEY (recipe_id, step_number)
);

-- Etiquetas de receta normalizadas
CREATE TABLE IF NOT EXISTS recipe_tags (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_name TEXT NOT NULL,
  PRIMARY KEY (recipe_id, tag_name)
);

-- ============================================================================
-- 5. REGISTRO DIARIO DE COMIDAS (3FN — Sin calculated_macros redundante)
-- ============================================================================

CREATE TABLE IF NOT EXISTS timeline_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  hour SMALLINT NOT NULL CHECK (hour BETWEEN 0 AND 23),
  food_id TEXT REFERENCES food_items(id) ON DELETE RESTRICT,
  recipe_id TEXT REFERENCES recipes(id) ON DELETE RESTRICT,
  custom_label TEXT,
  grams_consumed NUMERIC(7,2) NOT NULL CHECK (grams_consumed > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (food_id IS NOT NULL OR recipe_id IS NOT NULL)
);

-- ============================================================================
-- 6. REVISIONES METABÓLICAS SEMANALES (3FN)
-- ============================================================================

CREATE TABLE IF NOT EXISTS metabolic_checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  week_date DATE NOT NULL,
  avg_daily_intake_kcal INTEGER NOT NULL,
  weight_slope_kg_per_week NUMERIC(5,3) NOT NULL,
  calculated_real_tdee INTEGER NOT NULL,
  previous_tdee INTEGER NOT NULL,
  applied_tdee INTEGER NOT NULL,
  user_approved BOOLEAN NOT NULL DEFAULT FALSE,
  logged_days_in_window INTEGER,
  imputed_days_in_window INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 7. CATÁLOGO DE EJERCICIOS Y TABLA INTERMEDIA N:M (exercise_muscle_groups)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exercise_catalog_items (
  id TEXT PRIMARY KEY,
  name_es TEXT NOT NULL,
  name_en TEXT NOT NULL,
  equipment_id TEXT REFERENCES equipment_types(id) ON DELETE RESTRICT,
  category_id TEXT NOT NULL REFERENCES exercise_categories(id) ON DELETE RESTRICT,
  is_unilateral BOOLEAN NOT NULL DEFAULT FALSE
);

-- TABLA INTERMEDIA N:M (Ejercicios <-> Grupos Musculares)
-- Resuelve la relación muchos a muchos indicando si el músculo actúa como primario o secundario.
CREATE TABLE IF NOT EXISTS exercise_muscle_groups (
  exercise_id TEXT NOT NULL REFERENCES exercise_catalog_items(id) ON DELETE CASCADE,
  muscle_group_id TEXT NOT NULL REFERENCES muscle_groups(id) ON DELETE RESTRICT,
  involvement_role TEXT NOT NULL CHECK (involvement_role IN ('primary', 'secondary')),
  PRIMARY KEY (exercise_id, muscle_group_id)
);

-- Instrucciones paso a paso normalizadas (1FN)
CREATE TABLE IF NOT EXISTS exercise_instructions (
  exercise_id TEXT NOT NULL REFERENCES exercise_catalog_items(id) ON DELETE CASCADE,
  step_number SMALLINT NOT NULL CHECK (step_number > 0),
  instruction_es TEXT NOT NULL,
  PRIMARY KEY (exercise_id, step_number)
);

-- Imágenes del ejercicio normalizadas (1FN)
CREATE TABLE IF NOT EXISTS exercise_images (
  exercise_id TEXT NOT NULL REFERENCES exercise_catalog_items(id) ON DELETE CASCADE,
  image_order SMALLINT NOT NULL CHECK (image_order >= 0),
  image_url TEXT NOT NULL,
  PRIMARY KEY (exercise_id, image_order)
);

-- Alias de búsqueda normalizados (1FN)
CREATE TABLE IF NOT EXISTS exercise_aliases (
  exercise_id TEXT NOT NULL REFERENCES exercise_catalog_items(id) ON DELETE CASCADE,
  alias_text TEXT NOT NULL,
  PRIMARY KEY (exercise_id, alias_text)
);

-- ============================================================================
-- 8. RUTINAS Y TABLAS INTERMEDIAS N:M (workout_routine_exercises / days)
-- ============================================================================

CREATE TABLE IF NOT EXISTS workout_routines (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABLA INTERMEDIA N:M (Rutinas <-> Ejercicios)
-- Cada fila representa la asignación de un ejercicio a una rutina con sus parámetros.
CREATE TABLE IF NOT EXISTS workout_routine_exercises (
  routine_id TEXT NOT NULL REFERENCES workout_routines(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercise_catalog_items(id) ON DELETE RESTRICT,
  exercise_order SMALLINT NOT NULL CHECK (exercise_order > 0),
  target_sets SMALLINT NOT NULL DEFAULT 3 CHECK (target_sets > 0),
  min_reps SMALLINT NOT NULL DEFAULT 8 CHECK (min_reps > 0),
  max_reps SMALLINT NOT NULL DEFAULT 12 CHECK (max_reps >= min_reps),
  target_rir SMALLINT NOT NULL DEFAULT 1 CHECK (target_rir BETWEEN 0 AND 5),
  rest_seconds INTEGER NOT NULL DEFAULT 120 CHECK (rest_seconds >= 0),
  progression_rule TEXT NOT NULL DEFAULT 'double_progression',
  superset_group TEXT,
  notes TEXT,
  PRIMARY KEY (routine_id, exercise_order),
  UNIQUE (routine_id, exercise_id, exercise_order)
);

-- TABLA INTERMEDIA (Rutinas <-> Días de la semana asignados)
CREATE TABLE IF NOT EXISTS workout_routine_days (
  routine_id TEXT NOT NULL REFERENCES workout_routines(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  PRIMARY KEY (routine_id, day_of_week)
);

-- ============================================================================
-- 9. SESIONES Y SERIES DE ENTRENAMIENTO (3FN — Sin columnas derivadas)
-- ============================================================================

-- 3FN: Se eliminaron routine_name (dependencia transitiva de routine_id)
-- y total_volume_kg (calculado desde workout_set_logs).
CREATE TABLE IF NOT EXISTS workout_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  routine_id TEXT REFERENCES workout_routines(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0),
  bodyweight_kg_at_session NUMERIC(5,2) NOT NULL CHECK (bodyweight_kg_at_session > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3FN: Se eliminó estimated_1rm (dependencia transitiva de weight_kg y reps).
CREATE TABLE IF NOT EXISTS workout_set_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercise_catalog_items(id) ON DELETE RESTRICT,
  set_number SMALLINT NOT NULL CHECK (set_number > 0),
  set_type TEXT NOT NULL CHECK (set_type IN ('warmup', 'working', 'dropset', 'failure')),
  weight_kg NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (weight_kg >= 0),
  reps SMALLINT NOT NULL DEFAULT 0 CHECK (reps >= 0),
  rir SMALLINT CHECK (rir BETWEEN 0 AND 5),
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  is_pr_weight BOOLEAN NOT NULL DEFAULT FALSE,
  is_pr_1rm BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================================================
-- 10. VISTAS CALCULADAS (MANTIENEN 3FN SIN PERDER DATOS DERIVADOS)
-- ============================================================================

-- Vista de Biometría con Masa Grasa, Masa Magra y WHtR calculados al vuelo
CREATE OR REPLACE VIEW v_biometric_logs_computed AS
SELECT
  b.*,
  ROUND((b.scale_weight_kg * (b.estimated_bf_percent / 100.0))::NUMERIC, 2) AS fat_mass_kg,
  ROUND((b.scale_weight_kg * (1.0 - (b.estimated_bf_percent / 100.0)))::NUMERIC, 2) AS lbm_kg,
  CASE
    WHEN b.waist_cm IS NOT NULL AND u.height_cm > 0
      THEN ROUND((b.waist_cm / u.height_cm)::NUMERIC, 3)
    ELSE NULL
  END AS whtr
FROM biometric_logs b
JOIN user_profiles u ON u.id = b.user_id;

-- Vista de Totales de Macronutrientes por Receta (calculados desde recipe_ingredients N:M)
CREATE OR REPLACE VIEW v_recipe_totals AS
SELECT
  ri.recipe_id,
  ROUND(SUM(ri.grams)::NUMERIC, 1) AS total_grams,
  ROUND(SUM((f.kcal_per_100g * ri.grams) / 100.0)::NUMERIC, 0) AS kcal,
  ROUND(SUM((f.protein_per_100g * ri.grams) / 100.0)::NUMERIC, 1) AS protein_g,
  ROUND(SUM((f.carbs_per_100g * ri.grams) / 100.0)::NUMERIC, 1) AS carbs_g,
  ROUND(SUM((f.fat_per_100g * ri.grams) / 100.0)::NUMERIC, 1) AS fat_g,
  ROUND(SUM((f.fiber_per_100g * ri.grams) / 100.0)::NUMERIC, 1) AS fiber_g
FROM recipe_ingredients ri
JOIN food_items f ON f.id = ri.food_id
GROUP BY ri.recipe_id;

-- Vista de Series con 1RM estimado calculado dinámicamente
CREATE OR REPLACE VIEW v_workout_set_logs_computed AS
SELECT
  s.*,
  CASE
    WHEN s.set_type = 'warmup' OR s.reps <= 0 OR s.weight_kg <= 0 THEN 0
    WHEN s.reps = 1 THEN s.weight_kg
    ELSE ROUND((s.weight_kg * (1.0 + (s.reps / 30.0)))::NUMERIC, 1)
  END AS estimated_1rm
FROM workout_set_logs s;

-- Vista de Sesiones con nombre de rutina (por JOIN) y volumen total efectivo calculado
CREATE OR REPLACE VIEW v_workout_sessions_summary AS
SELECT
  ws.id,
  ws.user_id,
  ws.routine_id,
  COALESCE(wr.name, 'Entrenamiento de Fuerza') AS routine_name,
  ws.date,
  ws.start_time,
  ws.end_time,
  ws.duration_minutes,
  ws.bodyweight_kg_at_session,
  COALESCE(
    SUM(
      CASE
        WHEN wsl.is_completed AND wsl.set_type <> 'warmup'
          THEN wsl.weight_kg * wsl.reps
        ELSE 0
      END
    ),
    0
  ) AS total_volume_kg
FROM workout_sessions ws
LEFT JOIN workout_routines wr ON wr.id = ws.routine_id
LEFT JOIN workout_set_logs wsl ON wsl.session_id = ws.id
GROUP BY ws.id, wr.name;

-- ============================================================================
-- 11. SEGURIDAD DE DATOS SENSIBLES: ROW-LEVEL SECURITY (RLS) EN TODAS LAS TABLAS
-- ============================================================================

ALTER TABLE muscle_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE biometric_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE metabolic_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_muscle_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_routine_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_routine_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_set_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de usuario propietario (aislamiento estricto por auth.uid())
CREATE POLICY "Perfil propio" ON user_profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Biometría propia" ON biometric_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Registro de comidas propio" ON timeline_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Revisiones semanales propias" ON metabolic_checkins
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Rutinas propias" ON workout_routines
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Ejercicios de rutinas propias" ON workout_routine_exercises
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workout_routines wr
      WHERE wr.id = workout_routine_exercises.routine_id AND wr.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_routines wr
      WHERE wr.id = workout_routine_exercises.routine_id AND wr.user_id = auth.uid()
    )
  );

CREATE POLICY "Días de rutinas propias" ON workout_routine_days
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workout_routines wr
      WHERE wr.id = workout_routine_days.routine_id AND wr.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_routines wr
      WHERE wr.id = workout_routine_days.routine_id AND wr.user_id = auth.uid()
    )
  );

CREATE POLICY "Sesiones propias" ON workout_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Series de sesiones propias" ON workout_set_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workout_sessions ws
      WHERE ws.id = workout_set_logs.session_id AND ws.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_sessions ws
      WHERE ws.id = workout_set_logs.session_id AND ws.user_id = auth.uid()
    )
  );

-- Lectura de catálogos públicos
CREATE POLICY "Lectura pública grupos musculares" ON muscle_groups FOR SELECT USING (true);
CREATE POLICY "Lectura pública equipamiento" ON equipment_types FOR SELECT USING (true);
CREATE POLICY "Lectura pública categorías ejercicio" ON exercise_categories FOR SELECT USING (true);
CREATE POLICY "Lectura pública categorías alimento" ON food_categories FOR SELECT USING (true);
CREATE POLICY "Lectura pública ejercicios" ON exercise_catalog_items FOR SELECT USING (true);
CREATE POLICY "Lectura pública ejercicio_musculos" ON exercise_muscle_groups FOR SELECT USING (true);
CREATE POLICY "Lectura pública instrucciones" ON exercise_instructions FOR SELECT USING (true);
CREATE POLICY "Lectura pública imágenes" ON exercise_images FOR SELECT USING (true);
CREATE POLICY "Lectura pública alias" ON exercise_aliases FOR SELECT USING (true);

CREATE POLICY "Lectura alimentos públicos o propios" ON food_items
  FOR SELECT USING (owner_user_id IS NULL OR owner_user_id = auth.uid());
CREATE POLICY "Escritura alimentos propios" ON food_items
  FOR ALL USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Lectura recetas públicas o propias" ON recipes
  FOR SELECT USING (owner_user_id IS NULL OR owner_user_id = auth.uid());
CREATE POLICY "Lectura ingredientes de recetas accesibles" ON recipe_ingredients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_ingredients.recipe_id
        AND (r.owner_user_id IS NULL OR r.owner_user_id = auth.uid())
    )
  );
CREATE POLICY "Lectura pasos de recetas accesibles" ON recipe_steps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_steps.recipe_id
        AND (r.owner_user_id IS NULL OR r.owner_user_id = auth.uid())
    )
  );
CREATE POLICY "Lectura tags de recetas accesibles" ON recipe_tags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_tags.recipe_id
        AND (r.owner_user_id IS NULL OR r.owner_user_id = auth.uid())
    )
  );

-- ============================================================================
-- 12. REGLAS DE NEGOCIO EN EL SERVIDOR (RPC)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_compute_daily_targets(
  p_sex TEXT,
  p_weight_kg NUMERIC,
  p_height_cm NUMERIC,
  p_age INTEGER,
  p_activity_factor NUMERIC,
  p_goal_phase TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_bmr NUMERIC;
  v_tdee INTEGER;
  v_target_kcal INTEGER;
  v_protein_g INTEGER;
  v_fat_g INTEGER;
  v_carbs_g INTEGER;
  v_adjustment NUMERIC := 0;
BEGIN
  IF p_sex = 'male' THEN
    v_bmr := (10 * p_weight_kg) + (6.25 * p_height_cm) - (5 * p_age) + 5;
  ELSE
    v_bmr := (10 * p_weight_kg) + (6.25 * p_height_cm) - (5 * p_age) - 161;
  END IF;

  v_tdee := ROUND(v_bmr * p_activity_factor);

  IF p_goal_phase = 'cut' THEN
    v_adjustment := -0.18;
  ELSIF p_goal_phase = 'recomp' THEN
    v_adjustment := -0.08;
  ELSIF p_goal_phase = 'bulk' THEN
    v_adjustment := 0.10;
  ELSE
    v_adjustment := 0.0;
  END IF;

  v_target_kcal := GREATEST(1200, ROUND(v_tdee * (1 + v_adjustment)));
  v_protein_g := ROUND(p_weight_kg * 2.0);
  v_fat_g := ROUND((v_target_kcal * 0.25) / 9.0);
  v_carbs_g := GREATEST(50, ROUND((v_target_kcal - (v_protein_g * 4) - (v_fat_g * 9)) / 4.0));

  RETURN jsonb_build_object(
    'activeTdee', v_tdee,
    'targetKcal', v_target_kcal,
    'targetProteinG', v_protein_g,
    'targetCarbsG', v_carbs_g,
    'targetFatG', v_fat_g,
    'targetFiberG', GREATEST(20, ROUND((v_target_kcal / 1000.0) * 14)),
    'targetWaterMl', ROUND(p_weight_kg * 35)
  );
END;
$$;
