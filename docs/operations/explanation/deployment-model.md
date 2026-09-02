# Deployment model

Home and every lab are separate Cloudflare Workers. Static assets and optional Worker code ship as
one project artifact, so server behavior does not force a hosting migration. Shared package changes
trigger dependent builds without creating a shared runtime.

## Routing and environments

### Public routes

Home owns `labs.lasvegasfortransit.org` as a custom domain and hostname fallback. Each lab owns its
exact slug path and subtree. Generated routes reject prefix collisions, and the project route takes
precedence over home.

### Development and preview

Local development runs one selected project through Wrangler simulation. Existing Workers use
version previews for same-repository pull requests; new labs use temporary preview Workers. Forks
receive checks but no credentials or remote preview.

The repository preview composes every local Worker behind one origin. Project slug paths take
precedence over the home fallback, matching the production hostname closely enough to exercise
catalog navigation, route refreshes, and built asset paths before deployment.

Durable Object projects use dedicated staging Workers because version previews do not represent that
runtime. Production analytics and secrets stay out of all other previews.

## Delivery and recovery

### Deployment order

GitHub Actions builds every affected artifact before publishing any of them. Project Workers deploy
first and pass route checks. Home deploys last when a catalog change points to those projects.

### Rollback

Cloudflare retains independent versions for every Worker. Rollback targets the smallest failed
deployable and leaves unrelated labs untouched.
