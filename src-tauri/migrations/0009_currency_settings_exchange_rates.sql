-- User settings (key-value). Ensure display_currency and enable_currency_conversion_api exist via ensureDefaults().
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Exchange rate cache (used only when conversion API is enabled). Rates valid 24h.
CREATE TABLE IF NOT EXISTS exchange_rates (
  id TEXT PRIMARY KEY,
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  rate REAL NOT NULL,
  fetched_at TEXT NOT NULL,
  UNIQUE(base_currency, quote_currency)
);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_base_quote ON exchange_rates(base_currency, quote_currency);

-- Per-production base currency. All stored budget numbers are in this currency.
ALTER TABLE productions ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'GBP';
