# Smart Classroom — Production Development Blueprint

## Current Baseline
**Smart Classroom Master Specification v3.1**

Status: **Approved Development Baseline / Single Source of Truth**

This package is intended for Product Owner, Software Architect, Antigravity/Codex, Human Developers, QA, Security Reviewers, and DevOps.

## Source of Truth Hierarchy

1. `docs/01_Smart_Classroom_Master_Spec_v3.1.md` — SSOT
2. `docs/02_Architecture_Decisions.md` — approved ADRs
3. `docs/03_Database_Specification.md`
4. `docs/04_RLS_Authorization_Matrix.md`
5. `docs/05_Local_IndexedDB_Specification.md`
6. `docs/06_Sync_Protocol_Specification.md`
7. `docs/07_Offline_Authentication_Policy.md`
8. `docs/08_Security_Specification.md`
9. `docs/09_API_Mutation_Boundary.md`
10. `docs/10_Implementation_Roadmap.md`
11. `docs/11_Acceptance_Test_Plan.md`
12. `docs/12_AI_Development_Controller.md`

If implementation conflicts with the Master Specification, stop and resolve the conflict. Do not silently modify the specification to match the code.

## Approved Stack
- React + TypeScript + Vite
- PWA: Manifest + Service Worker
- Local DB: Dexie + IndexedDB
- Cloud: Supabase
- DB: PostgreSQL
- Auth: Supabase Auth
- Authorization: PostgreSQL Grants + RLS
- Server: PostgreSQL RPC + Supabase Edge Functions
- Notifications: LINE Messaging API / LINE OA
- Tests: Vitest + Playwright
- CI/CD: GitHub Actions

## Core Rules
- Local-first for classroom-critical workflows
- Local DB is an authorized offline projection, not a cloud mirror
- Critical mutations must not bypass the sync queue
- Sync pull uses server monotonic revision, not client clock
- Persistent server idempotency is mandatory
- Critical conflicts must not be silently overwritten
- Synced deletes use tombstones
- Critical audit is created in a trusted server/database layer
- Parent link codes use keyed HMAC/pepper, not plain hash
- Notifications use transactional outbox
- First login requires online authentication
- Trusted Teacher Board may use Offline Unlock under policy
- No production demo data
- No secrets in client or repository

## How to Start with Antigravity
1. Open this repository/project.
2. Ask Antigravity to read `README.md` and all `docs/` files in numeric order.
3. Treat `docs/01_Smart_Classroom_Master_Spec_v3.1.md` as SSOT.
4. Follow `docs/12_AI_Development_Controller.md`.
5. First run is analysis and Phase 0 planning only.
6. Do not allow implementation until Owner review.

Recommended first message:

> Read README.md and all documents under docs/ in numeric order. Treat docs/01_Smart_Classroom_Master_Spec_v3.1.md as the Single Source of Truth. Follow docs/12_AI_Development_Controller.md. For this first run, perform architecture review and Phase 0 planning only. Do not install packages, create source code, create databases, run migrations, or modify project files. Return the required reports and stop for Owner approval.

## Repository Target Structure
```text
smart-classroom/
├── README.md
├── apps/
├── supabase/
├── docs/
├── tests/
├── scripts/
├── .env.example
├── .gitignore
└── package.json
```

## Quality Priority
1. Data Integrity
2. Security
3. Offline Reliability
4. Authorization
5. Maintainability
6. Performance
7. UX
8. Visual Polish
