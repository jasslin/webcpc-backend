# Project Security & Governance - Manual Setup Guide

To fully activate the project's defense-in-depth mechanisms, the project administrator must perform a one-time manual configuration.

**Goal**: To enable branch protection rules and enforce mandatory approvals from `CODEOWNERS`.

## Prerequisites

Before proceeding, ensure you have:
- Admin access to the GitHub repository
- Updated the `CODEOWNERS` file with your actual GitHub username or team name
- Committed and pushed the `CODEOWNERS` file to the repository

## Step-by-Step Configuration

### 1. Navigate to Repository Settings

1. Go to your GitHub repository
2. Click on **"Settings"** in the top right corner
3. In the left sidebar, click on **"Branches"**

### 2. Configure Branch Protection Rules

1. In the "Branch protection rules" section, click the **"Add rule"** button
2. In the **"Branch name pattern"** field, enter the name of the branch to protect (e.g., `main`)
3. **Enable all of the following critical options:**

   #### Require Pull Request Reviews
   - `[✔] Require a pull request before merging`
   - `[✔] Require approvals: 1`

   #### Require Status Checks
   - `[✔] Require status checks to pass before merging`
   - `[✔] Require branches to be up to date before merging`
   - In the status check list below, **select all of your CI jobs**:
     - `🚨 Security Check`
     - `Lint & Unit Tests`
     - `Database Migration Validation`
     - `SonarCloud Scan`

   #### Require Code Owner Review
   - **`[✔] Require review from Code Owners`**
   - **This is the critical switch that activates the `CODEOWNERS` file!**

   #### Prevent Bypass
   - `[✔] Do not allow bypassing the above settings`

4. **Ensure that `Allow force pushes` is ABSOLUTELY NOT checked**
5. Click the **"Create"** button to save the rule

### 3. Repeat for Other Critical Branches

**Repeat the steps above** for the `develop` branch and any other critical branches that require protection.

### 4. Verify Configuration

After saving, you should see:
- A green checkmark next to your protected branches
- The protection rules listed under each branch
- The `CODEOWNERS` file being enforced for critical file changes

## How It Works

### Automatic Enforcement

Once configured, the system will automatically:

1. **Block unauthorized changes** to core infrastructure files
2. **Require Code Owner approval** for any modifications to protected files
3. **Enforce all CI checks** before allowing merges
4. **Prevent force pushes** and other dangerous operations

### File Protection Matrix

| File Category | Protection Level | Required Approval |
|---------------|------------------|-------------------|
| `.github/workflows/` | **CRITICAL** | Code Owner |
| `Dockerfile` | **CRITICAL** | Code Owner |
| `docker-compose.yml` | **CRITICAL** | Code Owner |
| `package.json` | **CRITICAL** | Code Owner |
| `CONTRIBUTING.md` | **CRITICAL** | Code Owner |
| `CODEOWNERS` | **CRITICAL** | Code Owner |
| Source code (`src/`) | **STANDARD** | Any reviewer |
| Documentation (`docs/`) | **STANDARD** | Any reviewer |

## Testing the Protection

To verify the protection is working:

1. Try to create a PR that modifies a protected file
2. The system should automatically request a Code Owner review
3. Without Code Owner approval, the PR cannot be merged
4. All CI checks must pass before merging is allowed

## Troubleshooting

### Common Issues

**"No code owners found"**
- Ensure the `CODEOWNERS` file is committed to the repository
- Verify the GitHub username/team in `CODEOWNERS` exists and has access

**"Status checks not showing"**
- Make sure the CI workflow names match exactly
- Check that the workflow files are in `.github/workflows/`

**"Branch protection not working"**
- Verify you have admin access to the repository
- Check that the branch name pattern matches exactly

## Security Benefits

This configuration provides:

- **Defense in Depth**: Multiple layers of protection
- **Automated Governance**: Rules enforced by GitHub, not human memory
- **Audit Trail**: Complete history of who approved what changes
- **Prevention of Accidents**: No accidental bypass of critical checks
- **Compliance**: Meets enterprise security requirements

## Next Steps

After completing this setup:

1. **Test the protection** with a small change to a protected file
2. **Document the process** for your team
3. **Regularly review** the protection rules and Code Owners
4. **Monitor CI/CD performance** and adjust as needed

Your project is now equipped with enterprise-grade security and governance capabilities!
