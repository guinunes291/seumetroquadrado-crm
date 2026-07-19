-- Shim de pg_cron: registra os jobs numa tabela para inspeção nos testes,
-- sem executar nada. As migrations usam cron.schedule(nome, cron, comando),
-- cron.unschedule(nome) e consultam cron.job.
CREATE SCHEMA cron;

CREATE TABLE cron.job (
  jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jobname text UNIQUE,
  schedule text NOT NULL,
  command text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE FUNCTION cron.schedule(job_name text, schedule text, command text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE _id bigint;
BEGIN
  INSERT INTO cron.job (jobname, schedule, command)
  VALUES (job_name, schedule, command)
  ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
  RETURNING jobid INTO _id;
  RETURN _id;
END;
$$;

CREATE FUNCTION cron.schedule(schedule text, command text)
RETURNS bigint LANGUAGE sql AS $$
  SELECT cron.schedule(md5(command), schedule, command);
$$;

CREATE FUNCTION cron.unschedule(job_name text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM cron.job WHERE jobname = job_name;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION cron.unschedule(job_id bigint)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM cron.job WHERE jobid = job_id;
  RETURN FOUND;
END;
$$;

GRANT USAGE ON SCHEMA cron TO PUBLIC;
GRANT SELECT ON cron.job TO PUBLIC;
