-- Migration: drop_redundant_servermetricminute_index
--
-- The @@index([serverId, minuteStart]) on ServerMetricMinute is fully
-- redundant: the @@unique([serverId, minuteStart]) constraint already
-- creates a B-tree index on the same column pair with identical selectivity.
-- SQLite will never choose the plain index over the unique one for any query.
-- Dropping it reduces write amplification on every agent metric ingestion.

DROP INDEX IF EXISTS "ServerMetricMinute_serverId_minuteStart_idx";
