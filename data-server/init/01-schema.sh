#!/bin/sh
# Runs once, the first time the database starts. Creates the table Distill uses and the two roles
# PostgREST needs: "authenticator" (logs in) and "distill_web" (what each request may do).
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
create schema if not exists api;

create table if not exists api.user_state (
  user_id    text primary key check (length(user_id) between 1 and 100),
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

create role distill_web nologin;
grant usage on schema api to distill_web;
grant select, insert, update on api.user_state to distill_web;

create role authenticator noinherit login password '${AUTHENTICATOR_PASSWORD}';
grant distill_web to authenticator;
SQL
