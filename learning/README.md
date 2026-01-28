# Masi App - Learning Journey
### Building a World-Class Offline-First Mobile Application

---

## Introduction

This directory contains the architectural decisions, engineering patterns, and design philosophy behind building the Masi Field Staff App. Whether you're a junior developer learning mobile development or an experienced engineer interested in offline-first architecture, these chapters walk through every critical decision and explain the "why" behind the "how."

Each chapter can be read independently, but they build on each other to tell the complete story of how we built a resilient, field-tested application for nonprofit staff working in environments with unreliable internet connectivity.

---

## Chapters

### [Chapter 1: Foundation - Understanding the Problem Space](01-foundation.md)
Explores the unique constraints of building for field staff with unreliable connectivity. Learn why offline-first isn't just a nice-to-have but a fundamental requirement that drives every architectural decision.

**Key topics**: The challenge of offline work, critical requirements, constraints that shape architecture

### [Chapter 2: Technology Stack - Why These Choices?](02-technology-stack.md)
A detailed look at why we chose React Native + Expo, Supabase, AsyncStorage, React Native Paper, and React Navigation. Understand the trade-offs and why these decisions were right for this project.

**Key topics**: Cross-platform development, database choice, UI framework selection, navigation patterns

### [Chapter 3: Offline-First Architecture - The Core Pattern](03-offline-first-architecture.md)
The heart of our system. Understand how we invert the traditional online-first model to build a truly offline-first app, complete with sync queue architecture, retry logic, and conflict resolution.

**Key topics**: Sync patterns, queue-based processing, exponential backoff, sync triggers

### [Chapter 4: Database Design - Schema as Contract](04-database-design.md)
How we use PostgreSQL to enforce data integrity at the database level. Learn about our schema evolution, especially the many-to-many group system and why structure matters.

**Key topics**: Schema design, constraints, foreign keys, many-to-many relationships, group management

### [Chapter 5: Authentication & Security - Layers of Protection](05-authentication-security.md)
A deep dive into security architecture using Supabase's invitation system and Row Level Security. Learn defense-in-depth principles and why database-level security matters.

**Key topics**: Invitation system, RLS policies, security layers, email verification

### [Chapter 6: Geolocation - Balancing Accuracy and Battery](06-geolocation.md)
Time tracking requires location capture, but accuracy needs must be balanced against battery consumption. Learn how we chose medium accuracy and built resilient permission handling.

**Key topics**: Accuracy levels, battery optimization, permission flows, expo-location usage

### [Chapter 7: State Management - React Context Pattern](07-state-management.md)
Why we chose React Context API over Redux, MobX, or Zustand. Learn about our context architecture and how different pieces of global state are organized.

**Key topics**: Context API, AuthContext, OfflineContext, ChildrenContext, best practices

### [Chapter 8: Form Design - Job-Specific Session Recording](08-form-design.md)
Four different job titles require four different session forms. Learn the router pattern we use to keep code maintainable and avoid complex conditionals.

**Key topics**: Job-specific forms, form routing, react-hook-form integration, validation patterns

### [Chapter 9: The Group Selection Feature - User Experience Design](09-group-selection.md)
A case study in how user experience requirements shape database architecture. Learn how we designed group selection to be intuitive while maintaining data integrity.

**Key topics**: Multi-step selection UX, group-child relationships, bulk + individual operations

### [Chapter 10: What We've Built So Far - Progress Update](10-progress-so-far.md)
A checkpoint on our implementation journey. See what's been completed, the current file structure, and what's coming next.

**Key topics**: Current architecture, completed features, file structure, roadmap

---

## How to Use This Guide

**For New Developers**: Start with Chapter 1 to understand the "why," then read through sequentially. Each chapter builds context for the next.

**For Architecture Reviews**: Chapters 3-5 contain the critical architectural decisions. Chapter 4-9 are good references for implementation details.

**For Learning Specific Patterns**:
- Offline sync? → Chapter 3
- Security? → Chapter 5
- Forms? → Chapter 8
- State management? → Chapter 7

**For Context on Decisions**: Every major decision includes the trade-offs considered and why we made our choice.

---

## Key Takeaways for Developers

1. **Offline-first is a mindset**: Write to local storage first, sync is secondary
2. **Database schema is a contract**: Use constraints and foreign keys to enforce integrity
3. **Context is enough for most apps**: Don't over-engineer state management
4. **Separate forms are cleaner than conditionals**: Even if they share some code
5. **Battery matters**: Balance accuracy needs with power consumption
6. **Security in layers**: RLS + app logic + validation = defense in depth
7. **UX drives architecture**: The group selection feature shaped our database design

---

## Contributing to This Documentation

When making architectural decisions or implementing complex features, add a learning document explaining:
- The problem you were solving
- The decision you made
- Why you made that choice (this is key!)
- What you considered but didn't choose
- Code examples showing the pattern

Remember: **LEARNING.md/learning/** is a teaching tool. Each entry should help someone understand both **what** we built and **why** we built it that way.

---

**Document Status**: Living documentation - chapters are updated as we build and learn

Last updated: 2026-01-27
