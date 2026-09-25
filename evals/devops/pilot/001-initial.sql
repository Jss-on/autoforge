-- Apply with the isolated migration principal, never the runtime app role.
CREATE TABLE forge_notes (id text PRIMARY KEY, body text NOT NULL);
-- Provision an app role separately; grant only CONNECT, schema USAGE,
-- and SELECT/INSERT on forge_notes. Do not grant schema CREATE or table ownership.
