BEGIN;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
-- Restore the intended view privileges after the test harness table grants.
REVOKE ALL ON v_biometric_logs_computed, v_workout_set_logs_computed, v_workout_sessions_summary FROM anon;
INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
INSERT INTO user_profiles (id, name, birth_date, sex, height_cm, training_experience, current_phase, active_tdee)
VALUES ('11111111-1111-4111-8111-111111111111','A','1995-01-01','male',180,'novice','maintenance',2200),
       ('22222222-2222-4222-8222-222222222222','B','1995-01-01','female',170,'novice','maintenance',2000);
INSERT INTO biometric_logs (user_id,date,scale_weight_kg,trend_weight_kg,estimated_bf_percent,bf_method)
VALUES ('11111111-1111-4111-8111-111111111111','2026-11-01',80,80,18,'boer_fallback'),
       ('22222222-2222-4222-8222-222222222222','2026-11-01',65,65,24,'boer_fallback');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM biometric_logs) = 1, 'A must see only A in the table';
  ASSERT (SELECT count(*) FROM v_biometric_logs_computed) = 1, 'A must see only A in the view';
  ASSERT NOT EXISTS (SELECT 1 FROM v_biometric_logs_computed WHERE user_id <> auth.uid()), 'cross-user view leak';
  UPDATE biometric_logs SET scale_weight_kg = 99 WHERE user_id = '22222222-2222-4222-8222-222222222222';
  ASSERT NOT FOUND, 'A must not update B';
END $$;
SET LOCAL request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM v_biometric_logs_computed) = 1, 'B must see only B';
END $$;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claim.sub = '';
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM biometric_logs) = 0, 'anonymous table leak';
  BEGIN
    PERFORM * FROM v_biometric_logs_computed;
    RAISE EXCEPTION 'anonymous view access should be denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;
