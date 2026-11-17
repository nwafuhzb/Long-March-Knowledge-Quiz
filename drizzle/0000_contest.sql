CREATE TABLE contest (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL,
  state TEXT NOT NULL
);
