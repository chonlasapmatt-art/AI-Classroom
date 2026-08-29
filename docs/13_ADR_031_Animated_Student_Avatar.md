# ADR-031 — Animated Student Avatar Enhancement

Status: **Approved by Product Owner / Implemented**  
Date: 2026-08-29

## Context and reason

Master Specification v3.1 requires a stable `students.avatar_index`, at least 14 archetypes and more than 100 palette variants. The Owner additionally approved animated avatars with 18 education-oriented archetypes and 8 palettes.

## Decision

Keep `avatar_index` as the stable backward-compatible identity and add nullable `avatar_config jsonb` plus `avatar_animation_set`. The renderer falls back deterministically to `avatar_index`; names never determine identity. Rendering uses inline SVG and transform/opacity CSS animations with a `prefers-reduced-motion` static fallback.

## Impact

- Modules: student profile/list, board, leaderboard and achievements.
- Database: additive nullable/config fields only; existing records remain valid.
- Sync: avatar fields travel with the student payload and its version.
- Migration: forward-only `202608290001_core_schema.sql`.
- Tests: catalog cardinality, deterministic identity, persistence, reduced-motion E2E/visual verification.
- Compatibility: clients that only understand `avatar_index` continue to render the same identity.
