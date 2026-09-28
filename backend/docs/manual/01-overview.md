# Overview

Pravnya Admin is the multi-tenant management system behind the Pravnya platform. It has two
layers:

- **Superadmin** (platform level, no tenant) — manages `Tenant` records (therapy centres) and the
  canonical clinical taxonomy: the shared library of Domains, Skills, and Items that every
  tenant's goals are built from.
- **Tenant** (a therapy centre) — manages its own offered Disciplines, Therapists, Kids, and
  Goals. Three roles inside a tenant: **Tenant Admin** (full control), **Therapist** (sees and
  manages only their own assigned kids), **Viewer** (read-only).

## Why a shared taxonomy

Different centres write the same clinical goal in different words — "identify animals" at one
centre, "point to pictures when named" at another. Without a shared reference, activity content
gets duplicated and there's no way to see that two centres are working on the same underlying
skill. The canonical taxonomy (Domain → Skill → Item) exists to collapse that: every goal, from
any centre, resolves to one shared Skill, tagged with a Discipline and a Modality. See
`02-definitions.md` for what each of those terms means and `03-business-logic.md` for the rule
that decides when something is a new Skill versus just an Item under an existing one.

## How this manual stays current

This page and the database structure below it are generated the same way as the rest of the app:
markdown files in this repo (`backend/docs/manual/`) and a live introspection of the deployed
Prisma schema. Both ship through the exact same build-and-deploy pipeline as any code change —
there's no separate "update the docs" step to forget. If the schema changes, the Database
Structure page reflects it on the next deploy automatically; if the business rules change, editing
these markdown files and shipping a normal commit is the update.
