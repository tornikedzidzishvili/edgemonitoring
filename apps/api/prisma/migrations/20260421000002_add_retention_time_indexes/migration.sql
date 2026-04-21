-- Migration: add_retention_time_indexes
--
-- Adds single-column indexes on the timestamp columns used by the data
-- retention service to locate rows to delete.  Without these, each
-- retention batch-delete issues a full-table scan on every iteration.
--
-- Each table already has a composite index that *starts* with a foreign-key
-- column (webAppId, domainId, serverId).  Those composite indexes are not
-- useful for the unbounded time-range scan the retention job issues because
-- the planner cannot skip the leading FK column.  The single-column indexes
-- below give the planner a direct range-scan entry point.
--
-- Affected tables and their retention windows:
--   UptimeCheckResult   30 days  (checkedAt)
--   DomainCheckResult   30 days  (checkedAt)
--   ServerReport         7 days  (reportedAt)
--   ServerMetricMinute  30 days  (minuteStart)

CREATE INDEX IF NOT EXISTS "UptimeCheckResult_checkedAt_idx"
    ON "UptimeCheckResult" ("checkedAt");

CREATE INDEX IF NOT EXISTS "DomainCheckResult_checkedAt_idx"
    ON "DomainCheckResult" ("checkedAt");

CREATE INDEX IF NOT EXISTS "ServerReport_reportedAt_idx"
    ON "ServerReport" ("reportedAt");

CREATE INDEX IF NOT EXISTS "ServerMetricMinute_minuteStart_idx"
    ON "ServerMetricMinute" ("minuteStart");
