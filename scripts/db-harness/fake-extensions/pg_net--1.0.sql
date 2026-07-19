-- Shim de pg_net: registra as chamadas numa tabela para inspeção nos testes,
-- sem fazer nenhuma requisição HTTP. Assinaturas espelham as do pg_net real
-- usadas pelas migrations (argumentos nomeados url/body/params/headers/
-- timeout_milliseconds).
CREATE SCHEMA net;

CREATE TABLE net.http_request_queue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  method text NOT NULL,
  url text NOT NULL,
  body jsonb,
  headers jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION net.http_post(
  url text,
  body jsonb DEFAULT '{}'::jsonb,
  params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer DEFAULT 5000
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE _id bigint;
BEGIN
  INSERT INTO net.http_request_queue (method, url, body, headers)
  VALUES ('POST', url, body, headers)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE FUNCTION net.http_get(
  url text,
  params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{}'::jsonb,
  timeout_milliseconds integer DEFAULT 5000
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE _id bigint;
BEGIN
  INSERT INTO net.http_request_queue (method, url, headers)
  VALUES ('GET', url, headers)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

GRANT USAGE ON SCHEMA net TO PUBLIC;
GRANT SELECT ON net.http_request_queue TO PUBLIC;
