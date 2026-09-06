## Understand before changing

- Read the relevant instructions and code before proposing a solution. Trace affected callers, contracts, and failure paths; keep investigation proportional to risk.
- Establish the repository's mission and intended lifespan from its documentation and the user's request. Ask when missing context would change the design.
- Clarify material ambiguity before acting, especially around public behavior, data, security, dependencies, or compatibility. For low-risk choices, follow repository conventions and state assumptions.

## Architecture and implementation

- Propose architecture that supports the repository's intended growth in features, contributors, and workload. Explain which concrete requirement justifies each significant boundary.
- For an application expected to grow in complexity, organize around cohesive features or domains with explicit interfaces. Do not default to a flat collection of files merely because today's implementation is small.
- Keep small utilities small. Avoid speculative services, empty layers, generic frameworks, and abstractions without a demonstrated need.
- Prefer designs that let a likely next feature fit within a module without changing unrelated modules. Separate concerns where they change independently; follow framework conventions unless they conflict with the mission.
- Reuse existing code, platform capabilities, and installed dependencies before adding custom machinery. Discuss new dependencies and substantial restructuring before implementation.
- Make the smallest coherent change that solves the underlying problem. Fix shared causes rather than patching individual callers. Preserve unrelated behavior.
- Preserve validation, authorization, accessibility, and error handling. Never trade these away to reduce code.

## Human readability

- Write code with human readability in mind. A maintainer should be able to follow its intent, data flow, and failure paths without mentally decoding it. Code that works but is largely unreadable is unacceptable.
- Use names that explain purpose and domain meaning. Avoid cryptic abbreviations, misleading names, and generic names that hide what a value represents.
- Prefer straightforward control flow over nested conditionals, dense expressions, and clever tricks. Use intermediate variables when they make a calculation or condition easier to understand; do not compress logic merely to save lines.
- Keep functions focused on a coherent responsibility and at a consistent level of detail. Extract helpers when they clarify intent or isolate complexity, not simply to make functions shorter. Avoid needless indirection that forces readers to jump between files.
- Make dependencies, side effects, and error handling explicit. Keep related logic together so readers can understand a behavior without reconstructing scattered state changes.
- Comment on non-obvious decisions, constraints, and trade-offs rather than narrating syntax. Rewrite confusing code instead of relying on comments to decipher it.
- Before finishing, reread the change from an unfamiliar maintainer's perspective. Simplify anything that requires unnecessary mental bookkeeping; never sacrifice correctness or necessary performance for cosmetic simplicity.

## Verification

- Discover commands from repository tooling and instructions. Run the smallest check that meaningfully covers the affected behavior.
- Do not run full suites, E2E tests, or production builds by default. Use them when the change's regression surface requires them, local instructions require them, or the user requests them.

## Working style

- Keep routine work direct. Use task tracking and independent subagents only when their coordination benefits justify the overhead.
- Answer concisely. Report the result, verification, and remaining risks; cite file paths for findings. Keep unrelated improvements separate.

# Typical Stack

The user's preferred tools for new work. Follow the repository's existing stack unless a change is justified.

- Frontend: TypeScript, Next.js, React, Tailwind CSS.
- Backend: Python, FastAPI; PyTorch for ML.
- Tooling: Bun, uv.
- Database: PostgreSQL.
- Hosting: AWS, Vercel, Railway.
