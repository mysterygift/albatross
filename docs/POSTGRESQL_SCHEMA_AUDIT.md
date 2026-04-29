# PostgreSQL Schema Audit (Phase 2)

- Audit source: final SQLite schema after all `src-tauri/migrations/*.sql`.
- Migration strategy: consolidated PostgreSQL baseline schema; do not replay historical SQLite migrations.
- UUID defaults: `gen_random_uuid()` via `pgcrypto`.
- Boolean conversions: only audited 0/1 boolean-like columns.
- Timestamp semantics: `TIMESTAMPTZ` for `*_at` fields.
- Date semantics: `DATE` for date-only fields.
- Precision semantics: `NUMERIC` for financial/precision fields.
- JSON semantics: `JSONB` only for semantic JSON columns (`*_json`).

## 0054 budget_revisions semantic handling

- The SQLite historical migration backfilled UUIDs using `randomblob()/hex()`.
- PostgreSQL baseline does not replay that DML; it models final semantic state directly.
- A partial unique index enforces one live revision per production.

## Table mapping matrix

### api_cache

- Risk level: **medium**
- Foreign keys: 0
- Indexes: 0

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| key | TEXT | TEXT | (none) | PK |
| provider | TEXT | TEXT | (none) | NOT NULL |
| endpoint | TEXT | TEXT | (none) | NOT NULL |
| request_hash | TEXT | TEXT | (none) | NOT NULL |
| response_json | TEXT | JSONB | (none) | NOT NULL |
| created_at | INTEGER | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | INTEGER | TIMESTAMPTZ | (none) | NOT NULL |

### bookings

- Risk level: **high**
- Foreign keys: 3
- Indexes: 3

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| person_id | TEXT | UUID | (none) | NOT NULL |
| shoot_day_id | TEXT | UUID | (none) | (none) |
| start_date | TEXT | DATE | (none) | (none) |
| end_date | TEXT | DATE | (none) | (none) |
| role | TEXT | TEXT | (none) | (none) |
| notes | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_bookings_shoot_day_id: NON-UNIQUE FULL on (shoot_day_id)
- idx_bookings_person_id: NON-UNIQUE FULL on (person_id)
- idx_bookings_production_id: NON-UNIQUE FULL on (production_id)

### budget_accounts

- Risk level: **high**
- Foreign keys: 2
- Indexes: 4

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| code | TEXT | TEXT | (none) | NOT NULL |
| name | TEXT | TEXT | (none) | NOT NULL |
| parent_account_id | TEXT | UUID | (none) | (none) |
| sort_order | INTEGER | INTEGER | 0 | NOT NULL |
| is_postable | INTEGER | BOOLEAN | TRUE | NOT NULL, BOOLEAN_CONVERTED |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| archived_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| color_hex | TEXT | TEXT | (none) | (none) |

Indexes:
- idx_budget_accounts_production_archived: NON-UNIQUE FULL on (production_id, archived_at)
- idx_budget_accounts_parent: NON-UNIQUE FULL on (parent_account_id)
- idx_budget_accounts_production_id: NON-UNIQUE FULL on (production_id)
- sqlite_autoindex_budget_accounts_2: UNIQUE FULL on (production_id, code)

### budget_categories

- Risk level: **high**
- Foreign keys: 1
- Indexes: 1

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| code | TEXT | TEXT | (none) | NOT NULL |
| name | TEXT | TEXT | (none) | NOT NULL |
| phase | TEXT | TEXT | 'pre' | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_budget_categories_production_id: NON-UNIQUE FULL on (production_id)

### budget_item_details

- Risk level: **high**
- Foreign keys: 1
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| budget_item_id | TEXT | UUID | (none) | NOT NULL |
| line_item_type | TEXT | TEXT | (none) | NOT NULL |
| details_json | TEXT | JSONB | (none) | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |

Indexes:
- idx_budget_item_details_budget_item_id: NON-UNIQUE FULL on (budget_item_id)
- sqlite_autoindex_budget_item_details_2: UNIQUE FULL on (budget_item_id)

### budget_item_expense_links

- Risk level: **high**
- Foreign keys: 3
- Indexes: 5

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| budget_item_id | TEXT | UUID | (none) | NOT NULL |
| expense_id | TEXT | UUID | (none) | NOT NULL |
| matched_amount | REAL | NUMERIC | (none) | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| budget_revision_id | TEXT | UUID | (none) | (none) |

Indexes:
- idx_budget_item_expense_links_budget_revision_id: NON-UNIQUE FULL on (budget_revision_id)
- idx_budget_item_expense_links_expense_id: NON-UNIQUE FULL on (expense_id)
- idx_budget_item_expense_links_budget_item_id: NON-UNIQUE FULL on (budget_item_id)
- idx_budget_item_expense_links_production_id: NON-UNIQUE FULL on (production_id)
- idx_budget_item_expense_links_active_pair: UNIQUE PARTIAL on (budget_item_id, expense_id)

### budget_items

- Risk level: **high**
- Foreign keys: 4
- Indexes: 4

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| category_id | TEXT | UUID | (none) | (none) |
| account_id | TEXT | UUID | (none) | (none) |
| description | TEXT | TEXT | (none) | NOT NULL |
| estimated_cost | REAL | NUMERIC | 0 | NOT NULL |
| actual_cost | REAL | NUMERIC | 0 | NOT NULL |
| vendor | TEXT | TEXT | (none) | (none) |
| status | TEXT | TEXT | 'draft' | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| line_item_type | TEXT | TEXT | (none) | (none) |
| budget_revision_id | TEXT | UUID | (none) | (none) |

Indexes:
- idx_budget_items_budget_revision_id: NON-UNIQUE FULL on (budget_revision_id)
- idx_budget_items_account_id: NON-UNIQUE FULL on (account_id)
- idx_budget_items_category_id: NON-UNIQUE FULL on (category_id)
- idx_budget_items_production_id: NON-UNIQUE FULL on (production_id)

### budget_revisions

- Risk level: **high**
- Foreign keys: 2
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| name | TEXT | TEXT | (none) | NOT NULL |
| created_from_revision_id | TEXT | UUID | (none) | (none) |
| is_live | INTEGER | BOOLEAN | FALSE | NOT NULL, BOOLEAN_CONVERTED |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| approval | TEXT | TEXT | 'unapproved' | NOT NULL |

Indexes:
- idx_budget_revisions_one_live_per_production: UNIQUE PARTIAL on (production_id)
- idx_budget_revisions_production_id: NON-UNIQUE FULL on (production_id)

### call_sheets

- Risk level: **high**
- Foreign keys: 4
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| shoot_day_id | TEXT | UUID | (none) | NOT NULL |
| shoot_day_unit_id | TEXT | UUID | (none) | (none) |
| overrides_json | TEXT | JSONB | (none) | (none) |
| generated_document_id | TEXT | UUID | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_call_sheets_shoot_day_id: NON-UNIQUE FULL on (shoot_day_id)
- idx_call_sheets_production_id: NON-UNIQUE FULL on (production_id)

### cast_availability

- Risk level: **high**
- Foreign keys: 2
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| person_id | TEXT | UUID | (none) | NOT NULL |
| start_date | TEXT | DATE | (none) | NOT NULL |
| end_date | TEXT | DATE | (none) | NOT NULL |
| availability | TEXT | TEXT | 'AVAILABLE' | NOT NULL |
| notes | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_cast_availability_person_id: NON-UNIQUE FULL on (person_id)
- idx_cast_availability_production_id: NON-UNIQUE FULL on (production_id)

### clearances

- Risk level: **high**
- Foreign keys: 1
- Indexes: 1

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| type | TEXT | TEXT | (none) | NOT NULL |
| item_id | TEXT | UUID | (none) | NOT NULL |
| status | TEXT | TEXT | 'pending' | (none) |
| requested_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| granted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| expiry | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_clearances_production_id: NON-UNIQUE FULL on (production_id)

### contingency_rule_scopes

- Risk level: **high**
- Foreign keys: 2
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| rule_id | TEXT | UUID | (none) | NOT NULL |
| account_id | TEXT | UUID | (none) | NOT NULL |
| include_children | INTEGER | BOOLEAN | TRUE | NOT NULL, BOOLEAN_CONVERTED |

Indexes:
- idx_contingency_rule_scopes_rule: NON-UNIQUE FULL on (rule_id)
- sqlite_autoindex_contingency_rule_scopes_2: UNIQUE FULL on (rule_id, account_id)

### contingency_rules

- Risk level: **high**
- Foreign keys: 2
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| name | TEXT | TEXT | (none) | NOT NULL |
| rate | REAL | NUMERIC | (none) | NOT NULL |
| base_kind | TEXT | TEXT | 'budget' | NOT NULL |
| scope_mode | TEXT | TEXT | 'include_subtrees' | NOT NULL |
| is_enabled | INTEGER | BOOLEAN | TRUE | NOT NULL, BOOLEAN_CONVERTED |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| budget_revision_id | TEXT | UUID | (none) | (none) |

Indexes:
- idx_contingency_rules_budget_revision_id: NON-UNIQUE FULL on (budget_revision_id)
- idx_contingency_rules_production: NON-UNIQUE FULL on (production_id)

### cost_report_group_accounts

- Risk level: **high**
- Foreign keys: 2
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| group_id | TEXT | UUID | (none) | NOT NULL |
| account_id | TEXT | UUID | (none) | NOT NULL |

Indexes:
- idx_cost_report_group_accounts_group: NON-UNIQUE FULL on (group_id)
- sqlite_autoindex_cost_report_group_accounts_2: UNIQUE FULL on (group_id, account_id)

### cost_report_groups

- Risk level: **high**
- Foreign keys: 2
- Indexes: 4

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| budget_revision_id | TEXT | UUID | (none) | (none) |
| code | TEXT | TEXT | (none) | (none) |
| name | TEXT | TEXT | (none) | NOT NULL |
| sort_order | INTEGER | INTEGER | 0 | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_cost_report_groups_production_revision_code: UNIQUE PARTIAL on (production_id, budget_revision_id, code)
- idx_cost_report_groups_budget_revision_id: NON-UNIQUE FULL on (budget_revision_id)
- idx_cost_report_groups_production: NON-UNIQUE FULL on (production_id)
- sqlite_autoindex_cost_report_groups_2: UNIQUE FULL on (production_id, budget_revision_id, name)

### cue_sheets

- Risk level: **high**
- Foreign keys: 2
- Indexes: 1

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| generated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| document_id | TEXT | UUID | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_cue_sheets_production_id: NON-UNIQUE FULL on (production_id)

### deliverable_template_items

- Risk level: **high**
- Foreign keys: 1
- Indexes: 1

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| deliverable_template_id | TEXT | UUID | (none) | NOT NULL |
| name | TEXT | TEXT | (none) | NOT NULL |
| due_offset_days | INTEGER | INTEGER | (none) | (none) |
| default_status | TEXT | TEXT | (none) | (none) |
| spec_defaults_json | TEXT | JSONB | (none) | (none) |
| sort_order | INTEGER | INTEGER | 0 | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_deliverable_template_items_template: NON-UNIQUE FULL on (deliverable_template_id)

### deliverable_templates

- Risk level: **medium**
- Foreign keys: 0
- Indexes: 0

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| name | TEXT | TEXT | (none) | NOT NULL |
| description | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

### deliverables

- Risk level: **high**
- Foreign keys: 2
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| name | TEXT | TEXT | (none) | NOT NULL |
| due_date | TEXT | DATE | (none) | (none) |
| status | TEXT | TEXT | 'pending' | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| recipient | TEXT | TEXT | (none) | (none) |
| delivery_method | TEXT | TEXT | (none) | (none) |
| delivered_by | TEXT | TEXT | (none) | (none) |
| delivered_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| approval_status | TEXT | TEXT | (none) | (none) |
| episode_id | TEXT | UUID | (none) | (none) |

Indexes:
- idx_deliverables_production_episode: NON-UNIQUE FULL on (production_id, episode_id)
- idx_deliverables_production_id: NON-UNIQUE FULL on (production_id)

### documents

- Risk level: **high**
- Foreign keys: 1
- Indexes: 1

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | (none) |
| entity_type | TEXT | TEXT | (none) | (none) |
| entity_id | TEXT | UUID | (none) | (none) |
| file_name | TEXT | TEXT | (none) | NOT NULL |
| file_path | TEXT | TEXT | (none) | NOT NULL |
| mime_type | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_documents_production_id: NON-UNIQUE FULL on (production_id)

### episodes

- Risk level: **high**
- Foreign keys: 1
- Indexes: 1

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| name | TEXT | TEXT | (none) | NOT NULL |
| sort_order | INTEGER | INTEGER | (none) | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_episodes_production_sort: NON-UNIQUE FULL on (production_id, sort_order)

### equipment

- Risk level: **high**
- Foreign keys: 2
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| name | TEXT | TEXT | (none) | NOT NULL |
| source_type | TEXT | TEXT | 'rented' | NOT NULL |
| vendor | TEXT | TEXT | (none) | (none) |
| shoot_day_id | TEXT | UUID | (none) | (none) |
| notes | TEXT | TEXT | (none) | (none) |
| item_uuid | TEXT | TEXT | (none) | NOT NULL |
| category | TEXT | TEXT | 'other' | NOT NULL |
| status | TEXT | TEXT | 'planned' | NOT NULL |
| department | TEXT | TEXT | (none) | (none) |
| vendor_id | TEXT | UUID | (none) | (none) |
| invoice_id | TEXT | UUID | (none) | (none) |
| rental_start_date | TEXT | DATE | (none) | (none) |
| return_due_date | TEXT | DATE | (none) | (none) |
| returned_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| replacement_value | REAL | NUMERIC | (none) | (none) |
| serial_number | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| quantity | INTEGER | INTEGER | 1 | NOT NULL |

Indexes:
- idx_equipment_production_item_uuid: UNIQUE FULL on (production_id, item_uuid)
- idx_equipment_production_id: NON-UNIQUE FULL on (production_id)

### equipment_list_items

- Risk level: **high**
- Foreign keys: 2
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| equipment_list_id | TEXT | UUID | (none) | NOT NULL |
| equipment_id | TEXT | UUID | (none) | NOT NULL |
| sort_order | INTEGER | INTEGER | 0 | NOT NULL |
| checked_out | INTEGER | BOOLEAN | FALSE | NOT NULL, BOOLEAN_CONVERTED |
| checked_back_in | INTEGER | BOOLEAN | FALSE | NOT NULL, BOOLEAN_CONVERTED |
| notes | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |

Indexes:
- idx_equipment_list_items_equipment_id: NON-UNIQUE FULL on (equipment_id)
- idx_equipment_list_items_list_id: NON-UNIQUE FULL on (equipment_list_id)

### equipment_lists

- Risk level: **high**
- Foreign keys: 2
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| shoot_day_id | TEXT | UUID | (none) | (none) |
| name | TEXT | TEXT | (none) | NOT NULL |
| department | TEXT | TEXT | (none) | (none) |
| notes | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_equipment_lists_shoot_day_id: NON-UNIQUE PARTIAL on (shoot_day_id)
- idx_equipment_lists_production_id: NON-UNIQUE FULL on (production_id)

### equipment_terms

- Risk level: **high**
- Foreign keys: 1
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| type | TEXT | TEXT | (none) | NOT NULL |
| value | TEXT | TEXT | (none) | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_equipment_terms_production_type: NON-UNIQUE FULL on (production_id, type)
- sqlite_autoindex_equipment_terms_2: UNIQUE FULL on (production_id, type, value)

### exchange_rates

- Risk level: **medium**
- Foreign keys: 0
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| base_currency | TEXT | TEXT | (none) | NOT NULL |
| quote_currency | TEXT | TEXT | (none) | NOT NULL |
| rate | REAL | NUMERIC | (none) | NOT NULL |
| fetched_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |

Indexes:
- idx_exchange_rates_base_quote: NON-UNIQUE FULL on (base_currency, quote_currency)
- sqlite_autoindex_exchange_rates_2: UNIQUE FULL on (base_currency, quote_currency)

### expense_transaction_details

- Risk level: **high**
- Foreign keys: 1
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| expense_id | TEXT | UUID | (none) | NOT NULL |
| transaction_type | TEXT | TEXT | (none) | NOT NULL |
| details_json | TEXT | JSONB | (none) | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |

Indexes:
- idx_expense_transaction_details_expense_id: NON-UNIQUE FULL on (expense_id)
- sqlite_autoindex_expense_transaction_details_2: UNIQUE FULL on (expense_id)

### expenses

- Risk level: **high**
- Foreign keys: 4
- Indexes: 4

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| category_id | TEXT | UUID | (none) | (none) |
| amount | REAL | NUMERIC | (none) | NOT NULL |
| date | TEXT | DATE | (none) | NOT NULL |
| vendor | TEXT | TEXT | (none) | (none) |
| notes | TEXT | TEXT | (none) | (none) |
| expense_type | TEXT | TEXT | 'other' | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| account_id | TEXT | UUID | (none) | (none) |
| transaction_type | TEXT | TEXT | (none) | (none) |
| vendor_id | TEXT | UUID | (none) | (none) |

Indexes:
- idx_expenses_vendor_id: NON-UNIQUE FULL on (vendor_id)
- idx_expenses_account_id: NON-UNIQUE FULL on (account_id)
- idx_expenses_category_id: NON-UNIQUE FULL on (category_id)
- idx_expenses_production_id: NON-UNIQUE FULL on (production_id)

### float_expense_links

- Risk level: **high**
- Foreign keys: 3
- Indexes: 5

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| float_id | TEXT | UUID | (none) | NOT NULL |
| expense_id | TEXT | UUID | (none) | NOT NULL |
| matched_amount | REAL | NUMERIC | (none) | NOT NULL |
| created_at | INTEGER | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | INTEGER | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | INTEGER | TIMESTAMPTZ | (none) | (none) |
| budget_revision_id | TEXT | UUID | (none) | (none) |

Indexes:
- idx_float_expense_links_active_revision_expense: UNIQUE PARTIAL on (budget_revision_id, expense_id)
- idx_float_expense_links_budget_revision_id: NON-UNIQUE FULL on (budget_revision_id)
- idx_float_expense_links_expense_id: NON-UNIQUE FULL on (expense_id)
- idx_float_expense_links_float_id: NON-UNIQUE FULL on (float_id)
- idx_float_expense_links_active_pair: UNIQUE PARTIAL on (float_id, expense_id)

### floats

- Risk level: **high**
- Foreign keys: 4
- Indexes: 4

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| budget_item_id | TEXT | UUID | (none) | NOT NULL |
| person_id | TEXT | UUID | (none) | NOT NULL |
| amount | REAL | NUMERIC | (none) | NOT NULL |
| currency | TEXT | TEXT | (none) | NOT NULL |
| issued_date | TEXT | DATE | (none) | NOT NULL |
| notes | TEXT | TEXT | (none) | (none) |
| created_at | INTEGER | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | INTEGER | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | INTEGER | TIMESTAMPTZ | (none) | (none) |
| budget_revision_id | TEXT | UUID | (none) | (none) |

Indexes:
- idx_floats_budget_revision_id: NON-UNIQUE FULL on (budget_revision_id)
- idx_floats_budget_item_id: NON-UNIQUE FULL on (budget_item_id)
- idx_floats_person_id: NON-UNIQUE FULL on (person_id)
- idx_floats_production_id: NON-UNIQUE FULL on (production_id)

### fringe_rule_scopes

- Risk level: **high**
- Foreign keys: 2
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| rule_id | TEXT | UUID | (none) | NOT NULL |
| account_id | TEXT | UUID | (none) | NOT NULL |
| include_children | INTEGER | BOOLEAN | TRUE | NOT NULL, BOOLEAN_CONVERTED |

Indexes:
- idx_fringe_rule_scopes_rule: NON-UNIQUE FULL on (rule_id)
- sqlite_autoindex_fringe_rule_scopes_2: UNIQUE FULL on (rule_id, account_id)

### fringe_rules

- Risk level: **high**
- Foreign keys: 2
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| name | TEXT | TEXT | (none) | NOT NULL |
| rate | REAL | NUMERIC | (none) | NOT NULL |
| base_kind | TEXT | TEXT | 'budget' | NOT NULL |
| scope_mode | TEXT | TEXT | 'include_subtrees' | NOT NULL |
| is_enabled | INTEGER | BOOLEAN | TRUE | NOT NULL, BOOLEAN_CONVERTED |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| budget_revision_id | TEXT | UUID | (none) | (none) |

Indexes:
- idx_fringe_rules_budget_revision_id: NON-UNIQUE FULL on (budget_revision_id)
- idx_fringe_rules_production: NON-UNIQUE FULL on (production_id)

### key_contacts

- Risk level: **high**
- Foreign keys: 1
- Indexes: 1

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| department | TEXT | TEXT | (none) | NOT NULL |
| name | TEXT | TEXT | (none) | (none) |
| phone | TEXT | TEXT | (none) | (none) |
| email | TEXT | TEXT | (none) | (none) |
| notes | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_key_contacts_production_id: NON-UNIQUE FULL on (production_id)

### location_scene

- Risk level: **high**
- Foreign keys: 2
- Indexes: 3

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| location_id | TEXT | UUID | (none) | NOT NULL |
| scene_id | TEXT | UUID | (none) | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_location_scene_location_id: NON-UNIQUE FULL on (location_id)
- idx_location_scene_scene_id: NON-UNIQUE FULL on (scene_id)
- sqlite_autoindex_location_scene_2: UNIQUE FULL on (location_id, scene_id)

### locations

- Risk level: **high**
- Foreign keys: 1
- Indexes: 1

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| name | TEXT | TEXT | (none) | NOT NULL |
| booked_status | TEXT | TEXT | 'unbooked' | NOT NULL |
| address | TEXT | TEXT | (none) | (none) |
| availability_constraints | TEXT | TEXT | (none) | (none) |
| permit_fee | REAL | NUMERIC | (none) | (none) |
| location_fee | REAL | NUMERIC | (none) | (none) |
| notes | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| what3words | TEXT | TEXT | (none) | (none) |
| parking_info | TEXT | TEXT | (none) | (none) |

Indexes:
- idx_locations_production_id: NON-UNIQUE FULL on (production_id)

### music_tracks

- Risk level: **high**
- Foreign keys: 2
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| title | TEXT | TEXT | (none) | NOT NULL |
| artist | TEXT | TEXT | (none) | (none) |
| publisher_label | TEXT | TEXT | (none) | (none) |
| notes | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| episode_id | TEXT | UUID | (none) | (none) |

Indexes:
- idx_music_tracks_production_episode: NON-UNIQUE FULL on (production_id, episode_id)
- idx_music_tracks_production_id: NON-UNIQUE FULL on (production_id)

### outbox

- Risk level: **medium**
- Foreign keys: 0
- Indexes: 0

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| entity | TEXT | TEXT | (none) | NOT NULL |
| entity_id | TEXT | UUID | (none) | NOT NULL |
| operation | TEXT | TEXT | (none) | NOT NULL |
| payload_json | TEXT | JSONB | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |

### people

- Risk level: **high**
- Foreign keys: 1
- Indexes: 1

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| name | TEXT | TEXT | (none) | NOT NULL |
| is_cast | INTEGER | BOOLEAN | FALSE | NOT NULL, BOOLEAN_CONVERTED |
| email | TEXT | TEXT | (none) | (none) |
| phone | TEXT | TEXT | (none) | (none) |
| department | TEXT | TEXT | (none) | (none) |
| phases | TEXT | TEXT | (none) | (none) |
| notes | TEXT | TEXT | (none) | (none) |
| contributor_form_status | TEXT | TEXT | 'not_requested' | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| cast_number | TEXT | TEXT | (none) | (none) |
| agent_name | TEXT | TEXT | (none) | (none) |
| agent_email | TEXT | TEXT | (none) | (none) |
| agent_phone | TEXT | TEXT | (none) | (none) |
| role_name | TEXT | TEXT | (none) | (none) |

Indexes:
- idx_people_production_id: NON-UNIQUE FULL on (production_id)

### production_crew_hierarchy_configs

- Risk level: **high**
- Foreign keys: 1
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| config_json | TEXT | JSONB | (none) | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |

Indexes:
- idx_production_crew_hierarchy_configs_production_id: NON-UNIQUE FULL on (production_id)
- sqlite_autoindex_production_crew_hierarchy_configs_2: UNIQUE FULL on (production_id)

### production_task_sections

- Risk level: **high**
- Foreign keys: 1
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| name | TEXT | TEXT | (none) | NOT NULL |
| sort_order | INTEGER | INTEGER | 0 | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_task_sections_production: NON-UNIQUE FULL on (production_id)
- idx_task_sections_production_name: UNIQUE PARTIAL on (production_id, name)

### production_tasks

- Risk level: **high**
- Foreign keys: 4
- Indexes: 3

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| description | TEXT | TEXT | (none) | NOT NULL |
| is_complete | INTEGER | BOOLEAN | FALSE | NOT NULL, BOOLEAN_CONVERTED |
| notes | TEXT | TEXT | (none) | (none) |
| due_date | TEXT | DATE | (none) | (none) |
| assigned_department | TEXT | TEXT | (none) | (none) |
| priority | INTEGER | INTEGER | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| parent_task_id | TEXT | UUID | (none) | (none) |
| section_id | TEXT | UUID | (none) | (none) |
| vendor_invoice_id | TEXT | UUID | (none) | (none) |
| equipment_id | TEXT | UUID | (none) | (none) |

Indexes:
- idx_production_tasks_equipment_id: UNIQUE PARTIAL on (equipment_id)
- idx_production_tasks_vendor_invoice_id: UNIQUE PARTIAL on (vendor_invoice_id)
- idx_production_tasks_production_id: NON-UNIQUE FULL on (production_id)

### production_total_accounts

- Risk level: **high**
- Foreign keys: 2
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_total_id | TEXT | UUID | (none) | NOT NULL |
| account_id | TEXT | UUID | (none) | NOT NULL |

Indexes:
- idx_production_total_accounts_total: NON-UNIQUE FULL on (production_total_id)
- sqlite_autoindex_production_total_accounts_2: UNIQUE FULL on (production_total_id, account_id)

### production_totals

- Risk level: **high**
- Foreign keys: 2
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| name | TEXT | TEXT | (none) | NOT NULL |
| sort_order | INTEGER | INTEGER | 0 | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| budget_revision_id | TEXT | UUID | (none) | (none) |

Indexes:
- idx_production_totals_budget_revision_id: NON-UNIQUE FULL on (budget_revision_id)
- idx_production_totals_production: NON-UNIQUE FULL on (production_id)

### productions

- Risk level: **medium**
- Foreign keys: 0
- Indexes: 1

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| name | TEXT | TEXT | (none) | NOT NULL |
| notes | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| slug | TEXT | TEXT | (none) | (none) |
| currency_code | TEXT | TEXT | 'GBP' | NOT NULL |
| archived_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| wrapped_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| created_from_template | TEXT | TEXT | (none) | (none) |
| is_episodic | INTEGER | BOOLEAN | FALSE | NOT NULL, BOOLEAN_CONVERTED |

Indexes:
- productions_slug_unique: UNIQUE PARTIAL on (slug)

### scene_cast

- Risk level: **high**
- Foreign keys: 3
- Indexes: 4

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| scene_id | TEXT | UUID | (none) | NOT NULL |
| person_id | TEXT | UUID | (none) | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_scene_cast_person_id: NON-UNIQUE FULL on (person_id)
- idx_scene_cast_scene_id: NON-UNIQUE FULL on (scene_id)
- idx_scene_cast_production_id: NON-UNIQUE FULL on (production_id)
- sqlite_autoindex_scene_cast_2: UNIQUE FULL on (scene_id, person_id)

### scenes

- Risk level: **high**
- Foreign keys: 3
- Indexes: 3

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| scene_number | TEXT | TEXT | (none) | NOT NULL |
| heading | TEXT | TEXT | (none) | (none) |
| description | TEXT | TEXT | (none) | (none) |
| title | TEXT | TEXT | (none) | (none) |
| int_ext | TEXT | TEXT | (none) | (none) |
| day_night | TEXT | TEXT | (none) | (none) |
| page_eighths | INTEGER | INTEGER | (none) | (none) |
| location_id | TEXT | UUID | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| duration_minutes | INTEGER | INTEGER | (none) | (none) |
| episode_id | TEXT | UUID | (none) | (none) |

Indexes:
- idx_scenes_production_episode: NON-UNIQUE FULL on (production_id, episode_id)
- idx_scenes_location_id: NON-UNIQUE FULL on (location_id)
- idx_scenes_production_id: NON-UNIQUE FULL on (production_id)

### script_documents

- Risk level: **high**
- Foreign keys: 2
- Indexes: 1

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| document_id | TEXT | UUID | (none) | (none) |
| raw_text | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_script_documents_production_id: NON-UNIQUE FULL on (production_id)

### seed_meta

- Risk level: **low**
- Foreign keys: 0
- Indexes: 0

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| key | TEXT | TEXT | (none) | PK |
| value | TEXT | TEXT | (none) | (none) |

### settings

- Risk level: **low**
- Foreign keys: 0
- Indexes: 0

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| key | TEXT | TEXT | (none) | PK |
| value | TEXT | TEXT | (none) | NOT NULL |

### shoot_day_units

- Risk level: **high**
- Foreign keys: 2
- Indexes: 3

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| shoot_day_id | TEXT | UUID | (none) | NOT NULL |
| unit_id | TEXT | UUID | (none) | NOT NULL |
| notes | TEXT | TEXT | (none) | (none) |
| is_locked | INTEGER | BOOLEAN | FALSE | NOT NULL, BOOLEAN_CONVERTED |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_shoot_day_units_unit_id: NON-UNIQUE FULL on (unit_id)
- idx_shoot_day_units_shoot_day_id: NON-UNIQUE FULL on (shoot_day_id)
- sqlite_autoindex_shoot_day_units_2: UNIQUE FULL on (shoot_day_id, unit_id)

### shoot_days

- Risk level: **high**
- Foreign keys: 2
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| shoot_date | TEXT | DATE | (none) | NOT NULL |
| day_number | INTEGER | INTEGER | (none) | (none) |
| call_time | TEXT | TEXT | (none) | (none) |
| notes | TEXT | TEXT | (none) | (none) |
| weather_manual | TEXT | TEXT | (none) | (none) |
| wrap_time | TEXT | TEXT | (none) | (none) |
| meal_times_json | TEXT | JSONB | (none) | (none) |
| weather_json | TEXT | JSONB | (none) | (none) |
| parking_base_address | TEXT | TEXT | (none) | (none) |
| special_notes | TEXT | TEXT | (none) | (none) |
| hospital_name | TEXT | TEXT | (none) | (none) |
| hospital_address | TEXT | TEXT | (none) | (none) |
| police_station_name | TEXT | TEXT | (none) | (none) |
| police_station_address | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| shooting_bloc_id | TEXT | UUID | (none) | (none) |

Indexes:
- idx_shoot_days_shooting_bloc_id: NON-UNIQUE FULL on (shooting_bloc_id)
- idx_shoot_days_production_id: NON-UNIQUE FULL on (production_id)

### shooting_blocs

- Risk level: **high**
- Foreign keys: 1
- Indexes: 1

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| name | TEXT | TEXT | (none) | NOT NULL |
| start_date | TEXT | DATE | (none) | NOT NULL |
| end_date | TEXT | DATE | (none) | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_shooting_blocs_production: NON-UNIQUE FULL on (production_id)

### shot_cast

- Risk level: **high**
- Foreign keys: 3
- Indexes: 1

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| shot_id | TEXT | UUID | (none) | NOT NULL |
| person_id | TEXT | UUID | (none) | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- sqlite_autoindex_shot_cast_2: UNIQUE FULL on (shot_id, person_id)

### shots

- Risk level: **high**
- Foreign keys: 1
- Indexes: 1

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| scene_id | TEXT | UUID | (none) | NOT NULL |
| shot_number | TEXT | TEXT | (none) | NOT NULL |
| description | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| subject | TEXT | TEXT | (none) | (none) |
| action_description | TEXT | TEXT | (none) | (none) |
| shot_size | TEXT | TEXT | (none) | (none) |
| support | TEXT | TEXT | (none) | (none) |
| lens | TEXT | TEXT | (none) | (none) |
| duration_seconds | INTEGER | INTEGER | (none) | (none) |
| camera_movement | TEXT | TEXT | (none) | (none) |
| notes | TEXT | TEXT | (none) | (none) |
| estimated_shoot_minutes | INTEGER | INTEGER | (none) | (none) |
| shot_description | TEXT | TEXT | (none) | (none) |

Indexes:
- idx_shots_scene_id: NON-UNIQUE FULL on (scene_id)

### storyboard_images

- Risk level: **high**
- Foreign keys: 4
- Indexes: 4

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| scene_id | TEXT | UUID | (none) | NOT NULL |
| shot_id | TEXT | UUID | (none) | NOT NULL |
| storage_key | TEXT | TEXT | (none) | NOT NULL |
| original_filename | TEXT | TEXT | (none) | NOT NULL |
| mime_type | TEXT | TEXT | (none) | NOT NULL |
| width | INTEGER | INTEGER | (none) | (none) |
| height | INTEGER | INTEGER | (none) | (none) |
| sort_order | INTEGER | INTEGER | 0 | NOT NULL |
| source_type | TEXT | TEXT | (none) | NOT NULL |
| source_import_id | TEXT | UUID | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_storyboard_images_shot_sort: NON-UNIQUE FULL on (shot_id, sort_order, created_at)
- idx_storyboard_images_shot_id: NON-UNIQUE FULL on (shot_id)
- idx_storyboard_images_scene_id: NON-UNIQUE FULL on (scene_id)
- idx_storyboard_images_production_id: NON-UNIQUE FULL on (production_id)

### storyboard_imports

- Risk level: **high**
- Foreign keys: 2
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| scene_id | TEXT | UUID | (none) | (none) |
| source_filename | TEXT | TEXT | (none) | NOT NULL |
| source_type | TEXT | TEXT | (none) | NOT NULL |
| status | TEXT | TEXT | 'pending' | NOT NULL |
| metadata_json | TEXT | JSONB | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_storyboard_imports_scene_id: NON-UNIQUE FULL on (scene_id)
- idx_storyboard_imports_production_id: NON-UNIQUE FULL on (production_id)

### stripboard_items

- Risk level: **high**
- Foreign keys: 2
- Indexes: 3

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| shoot_day_id | TEXT | UUID | (none) | NOT NULL |
| scene_id | TEXT | UUID | (none) | NOT NULL |
| sort_order | INTEGER | INTEGER | 0 | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_stripboard_items_scene_id: NON-UNIQUE FULL on (scene_id)
- idx_stripboard_items_shoot_day_id: NON-UNIQUE FULL on (shoot_day_id)
- sqlite_autoindex_stripboard_items_2: UNIQUE FULL on (shoot_day_id, scene_id)

### stripboard_strips

- Risk level: **high**
- Foreign keys: 5
- Indexes: 5

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| shoot_day_id | TEXT | UUID | (none) | (none) |
| shoot_day_unit_id | TEXT | UUID | (none) | (none) |
| strip_type | TEXT | TEXT | (none) | NOT NULL |
| scene_id | TEXT | UUID | (none) | (none) |
| shot_id | TEXT | UUID | (none) | (none) |
| title | TEXT | TEXT | (none) | (none) |
| description | TEXT | TEXT | (none) | (none) |
| estimated_minutes | INTEGER | INTEGER | (none) | (none) |
| sort_index | REAL | NUMERIC | 0 | NOT NULL |
| color_tag | TEXT | TEXT | (none) | (none) |
| strip_status | TEXT | TEXT | 'SCHEDULED' | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_stripboard_strips_shot_id: NON-UNIQUE FULL on (shot_id)
- idx_stripboard_strips_strip_status: NON-UNIQUE FULL on (strip_status)
- idx_stripboard_strips_scene_id: NON-UNIQUE FULL on (scene_id)
- idx_stripboard_strips_shoot_day_id: NON-UNIQUE FULL on (shoot_day_id)
- idx_stripboard_strips_production_id: NON-UNIQUE FULL on (production_id)

### task_template_items

- Risk level: **high**
- Foreign keys: 2
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| task_template_id | TEXT | UUID | (none) | NOT NULL |
| description | TEXT | TEXT | (none) | NOT NULL |
| notes | TEXT | TEXT | (none) | (none) |
| due_offset_days | INTEGER | INTEGER | (none) | (none) |
| assigned_department | TEXT | TEXT | (none) | (none) |
| priority | INTEGER | INTEGER | (none) | (none) |
| section_name | TEXT | TEXT | (none) | (none) |
| parent_template_item_id | TEXT | UUID | (none) | (none) |
| sort_order | INTEGER | INTEGER | 0 | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_task_template_items_parent: NON-UNIQUE FULL on (parent_template_item_id)
- idx_task_template_items_template: NON-UNIQUE FULL on (task_template_id)

### task_templates

- Risk level: **medium**
- Foreign keys: 0
- Indexes: 0

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| name | TEXT | TEXT | (none) | NOT NULL |
| description | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

### technical_specs

- Risk level: **high**
- Foreign keys: 1
- Indexes: 1

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| deliverable_id | TEXT | UUID | (none) | NOT NULL |
| resolution | TEXT | TEXT | (none) | (none) |
| codec | TEXT | TEXT | (none) | (none) |
| audio | TEXT | TEXT | (none) | (none) |
| captions | TEXT | TEXT | (none) | (none) |
| aspect_ratio | TEXT | TEXT | (none) | (none) |
| platform | TEXT | TEXT | (none) | (none) |
| notes | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| bitrate | TEXT | TEXT | (none) | (none) |
| subtitles | TEXT | TEXT | (none) | (none) |
| graphics | TEXT | TEXT | (none) | (none) |
| language | TEXT | TEXT | (none) | (none) |
| audio_mix | TEXT | TEXT | (none) | (none) |

Indexes:
- idx_technical_specs_deliverable_id: NON-UNIQUE FULL on (deliverable_id)

### units

- Risk level: **high**
- Foreign keys: 1
- Indexes: 1

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| name | TEXT | TEXT | (none) | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_units_production_id: NON-UNIQUE FULL on (production_id)

### vendor_invoice_expenses

- Risk level: **high**
- Foreign keys: 2
- Indexes: 3

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| vendor_invoice_id | TEXT | UUID | (none) | NOT NULL |
| expense_id | TEXT | UUID | (none) | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |

Indexes:
- idx_vendor_invoice_expenses_expense: NON-UNIQUE FULL on (expense_id)
- idx_vendor_invoice_expenses_invoice: NON-UNIQUE FULL on (vendor_invoice_id)
- sqlite_autoindex_vendor_invoice_expenses_2: UNIQUE FULL on (vendor_invoice_id, expense_id)

### vendor_invoices

- Risk level: **high**
- Foreign keys: 3
- Indexes: 4

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| vendor_id | TEXT | UUID | (none) | NOT NULL |
| invoice_number | TEXT | TEXT | (none) | NOT NULL |
| issue_date | TEXT | DATE | (none) | (none) |
| due_date | TEXT | DATE | (none) | (none) |
| amount | REAL | NUMERIC | (none) | (none) |
| tax | REAL | NUMERIC | (none) | (none) |
| currency_code | TEXT | TEXT | (none) | (none) |
| status | TEXT | TEXT | (none) | NOT NULL |
| notes | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |
| po_id | TEXT | UUID | (none) | (none) |

Indexes:
- idx_vendor_invoices_po_id: NON-UNIQUE FULL on (po_id)
- idx_vendor_invoices_vendor_active: NON-UNIQUE PARTIAL on (vendor_id)
- idx_vendor_invoices_vendor_id: NON-UNIQUE FULL on (vendor_id)
- idx_vendor_invoices_production_id: NON-UNIQUE FULL on (production_id)

### vendor_purchase_order_expenses

- Risk level: **high**
- Foreign keys: 2
- Indexes: 3

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| vendor_purchase_order_id | TEXT | UUID | (none) | NOT NULL |
| expense_id | TEXT | UUID | (none) | NOT NULL |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |

Indexes:
- idx_vendor_po_expenses_expense: NON-UNIQUE FULL on (expense_id)
- idx_vendor_po_expenses_po: NON-UNIQUE FULL on (vendor_purchase_order_id)
- sqlite_autoindex_vendor_purchase_order_expenses_2: UNIQUE FULL on (vendor_purchase_order_id, expense_id)

### vendor_purchase_orders

- Risk level: **high**
- Foreign keys: 2
- Indexes: 3

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| vendor_id | TEXT | UUID | (none) | NOT NULL |
| po_number | TEXT | TEXT | (none) | NOT NULL |
| description | TEXT | TEXT | (none) | (none) |
| issue_date | TEXT | DATE | (none) | (none) |
| due_date | TEXT | DATE | (none) | (none) |
| amount | REAL | NUMERIC | (none) | (none) |
| status | TEXT | TEXT | (none) | NOT NULL |
| approval | INTEGER | BOOLEAN | FALSE | NOT NULL, BOOLEAN_CONVERTED |
| notes | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_vendor_purchase_orders_vendor_active: NON-UNIQUE PARTIAL on (vendor_id)
- idx_vendor_purchase_orders_vendor_id: NON-UNIQUE FULL on (vendor_id)
- idx_vendor_purchase_orders_production_id: NON-UNIQUE FULL on (production_id)

### vendors

- Risk level: **high**
- Foreign keys: 1
- Indexes: 2

| Column | SQLite type | PostgreSQL type | Default | Constraints |
|---|---|---|---|---|
| id | TEXT | UUID | gen_random_uuid() | PK |
| production_id | TEXT | UUID | (none) | NOT NULL |
| company_name | TEXT | TEXT | (none) | NOT NULL |
| primary_contact_full_name | TEXT | TEXT | (none) | (none) |
| primary_contact_email | TEXT | TEXT | (none) | (none) |
| created_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| updated_at | TEXT | TIMESTAMPTZ | (none) | NOT NULL |
| deleted_at | TEXT | TIMESTAMPTZ | (none) | (none) |

Indexes:
- idx_vendors_company_name: NON-UNIQUE FULL on (production_id, company_name)
- idx_vendors_production_id: NON-UNIQUE FULL on (production_id)
