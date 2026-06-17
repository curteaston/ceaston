# Database Migrations

Add future schema changes here as SQL files named `NNN_lowercase_name.sql`.

`server/src/schema.sql` is the tracked baseline migration (`001_bootstrap_schema`).
After it has been applied to a database, change it only if you are intentionally
resetting that database. Normal schema changes belong in a new file in this
directory so the database history stays repeatable.
