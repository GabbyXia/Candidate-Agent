import { integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const sourcePlanVersions=sqliteTable('source_plan_versions',{
  id:text('id').primaryKey(),
  scopeKey:text('scope_key').notNull(),
  version:integer('version').notNull(),
  planJson:text('plan_json').notNull(),
  digest:text('digest').notNull(),
  createdAt:text('created_at').notNull(),
  createdBy:text('created_by').notNull(),
},table=>[uniqueIndex('source_plan_scope_version').on(table.scopeKey,table.version)]);

export const sourcePlanChecks=sqliteTable('source_plan_checks',{
  id:text('id').primaryKey(),
  planId:text('plan_id').notNull(),
  planDigest:text('plan_digest').notNull(),
  contentDigest:text('content_digest').notNull(),
  reportJson:text('report_json').notNull(),
  checkedAt:text('checked_at').notNull(),
},table=>[index('source_plan_check_history').on(table.planId,table.checkedAt)]);

export const sourcePlanHeads=sqliteTable('source_plan_heads',{
  scopeKey:text('scope_key').primaryKey(),
  activePlanId:text('active_plan_id').notNull(),
  updatedAt:text('updated_at').notNull(),
});

export const sourceCollectionCache=sqliteTable('source_collection_cache',{
  scopeKey:text('scope_key').primaryKey(),
  objectKey:text('object_key'),
  retrievedAt:text('retrieved_at'),
  coverageJson:text('coverage_json'),
  lastAttemptJson:text('last_attempt_json'),
});

export const mappingRuns=sqliteTable('mapping_runs',{
  id:text('id').primaryKey(),
  inputJson:text('input_json').notNull(),
  planJson:text('plan_json').notNull(),
  state:text('state').notNull(),
  stage:text('stage').notNull(),
  progressJson:text('progress_json').notNull(),
  resultObjectKey:text('result_object_key'),
  leaseOwner:text('lease_owner'),
  leaseExpiresAt:text('lease_expires_at'),
  revision:integer('revision').notNull().default(0),
  createdAt:text('created_at').notNull(),
  updatedAt:text('updated_at').notNull(),
  error:text('error'),
},table=>[index('mapping_run_updated').on(table.updatedAt)]);

export const mappingTasks=sqliteTable('mapping_tasks',{
  id:text('id').primaryKey(),
  runId:text('run_id').notNull(),
  kind:text('kind').notNull(),
  scopeJson:text('scope_json').notNull(),
  state:text('state').notNull(),
  payloadJson:text('payload_json').notNull().default('{}'),
  resultObjectKey:text('result_object_key'),
  attempts:integer('attempts').notNull().default(0),
  leaseOwner:text('lease_owner'),
  leaseExpiresAt:text('lease_expires_at'),
  createdAt:text('created_at').notNull(),
  updatedAt:text('updated_at').notNull(),
  error:text('error'),
},table=>[
  uniqueIndex('mapping_task_scope').on(table.runId,table.kind,table.scopeJson),
  index('mapping_task_queue').on(table.runId,table.kind,table.state,table.createdAt),
  index('mapping_task_leases').on(table.runId,table.state,table.leaseExpiresAt),
]);
