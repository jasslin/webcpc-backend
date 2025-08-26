# Contributing Guide

## Core Rules

- Quality is enforced by CI. Lint, format, type-check, build, test, and SonarQube quality gate must pass.
- Schema-as-Code. All DB changes are done via migrations under `migrations/`.
- Strict TypeScript. Do not disable strictness to work around types.
- Code coverage must meet minimum thresholds (80% lines, branches, functions, statements).
- Keep commits focused and messages clear.

## Development

1. Install dependencies:
   - `npm install`
2. Run locally:
   - `npm run dev`
3. Lint and format:
   - `npm run lint`
   - `npm run format`
4. Tests:
   - `npm test`
   - `npm run test:coverage` (with coverage)
5. Build:
   - `npm run build`

## Database

- Configure `DATABASE_URL` env var.
- Create a migration: `npm run db:migrate:create <name>`
- Apply migrations: `npm run db:migrate`

## SonarQube Setup

For CI/CD integration, configure these repository secrets:
- `SONAR_TOKEN`: Your SonarQube project token
- `SONAR_HOST_URL`: Your SonarQube server URL (e.g., https://sonarcloud.io)

SonarQube will analyze:
- Code quality issues (bugs, vulnerabilities, code smells)
- Test coverage from Jest (minimum 80% required)
- Code duplication and complexity metrics

## Pull Requests

- Include description, rationale, and testing notes.
- Ensure CI is green including SonarQube quality gate.
- Coverage must not drop below thresholds.
- Prefer small, logical changes. Avoid unrelated refactors.

---

### Changes to Core Infrastructure

This project considers its CI/CD pipeline (`.github/workflows/`), Docker configuration (`Dockerfile`, `docker-compose.yml`), dependency management (`package.json`), and this governance document (`CONTRIBUTING.md`) as **core infrastructure**.

Any changes to these core infrastructure files must follow the mandatory process outlined below:

1. **Open an Issue**: An issue must be created first, detailing the **motivation**, **goal**, and **potential impact** of the change.

2. **Gain Approval**: The change must be discussed and explicitly approved within the issue by at least one of the **Code Owners** specified in the `CODEOWNERS` file.

3. **Submit a Pull Request**: Only after approval can a corresponding Pull Request be submitted. The PR description must link back to the approved issue.

This process is technically enforced by the `CODEOWNERS` mechanism to ensure maximum project stability and security.
