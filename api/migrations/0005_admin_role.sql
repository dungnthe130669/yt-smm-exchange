-- Migration 0005: add role column to Better Auth user table
ALTER TABLE "user" ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
