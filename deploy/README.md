# Deploy

Merging to `main` runs `.github/workflows/deploy.yml`: tests, build, then on the server
`~/apps/deploy-pravnyaadmin.sh` (copy here for reference) installs the build.

## Settings live in GitHub

The server's `backend/.env` is written by every deploy from this repo's **production** environment
(GitHub → Settings → Environments → production): plain settings as **variables**, keys and passwords as
**secrets**. To change one, edit it there and re-run the Deploy workflow (Actions → Deploy → Run workflow,
or merge any change). Don't edit the file on the server; the next deploy replaces it.

| Variables | Secrets |
|---|---|
| `NODE_ENV`, `PORT`, `JWT_EXPIRES_IN`, `BCRYPT_SALT_ROUNDS`, `CORS_ORIGIN`, `EMAIL_PROVIDER`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`*, `APP_BASE_URL`*, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `RETAIL_TENANT_ID`, `STORAGE_DRIVER`*, `S3_ENDPOINT`*, `S3_REGION`*, `S3_BUCKET`*, `S3_FORCE_PATH_STYLE`*, `VAPID_PUBLIC_KEY`* | `DATABASE_URL`, `JWT_SECRET`, `SMTP_USER`, `SMTP_PASS`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `S3_ACCESS_KEY_ID`*, `S3_SECRET_ACCESS_KEY`*, `VAPID_PRIVATE_KEY`* |

\* optional, not set today. `install-env.sh` (also here for reference, installed as `~/apps/install-env.sh`)
refuses the deploy if `NODE_ENV`, `PORT`, `DATABASE_URL` or `JWT_SECRET` is missing, keeps the previous file
as `.env.bak`, and logs only the names of settings that changed.

Repository-level secrets used to reach the server: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`.
