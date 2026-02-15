# Deployment Guide: AFGRO Poultry Manager to Railway

This guide explains how to deploy the AFGRO Poultry Manager application to Railway.

## Prerequisites

1. **Railway Account** - Sign up at https://railway.app
2. **GitHub Account** - Your code repository (optional, but recommended)
3. **MySQL Database** - Railway will provision this for you
4. **Environment Variables** - See section below

## Step 1: Prepare Your Repository

The application is already configured for Railway deployment with:
- `Procfile` - Specifies the start command
- `railway.json` - Railway-specific configuration
- `.railwayignore` - Files to exclude from deployment

## Step 2: Deploy to Railway

### Option A: Deploy via GitHub (Recommended)

1. Push your code to GitHub (if not already done)
2. Go to https://railway.app/dashboard
3. Click "New Project" → "Deploy from GitHub"
4. Select your repository
5. Railway will automatically detect the Node.js application
6. Configure environment variables (see Step 3)
7. Click "Deploy"

### Option B: Deploy via Railway CLI

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init

# Deploy
railway up
```

## Step 3: Configure Environment Variables

After creating the project, add these environment variables in Railway dashboard:

### Database Configuration
Railway will automatically create a MySQL database. Get the connection string from the MySQL plugin:
- `DATABASE_URL` - MySQL connection string (Railway provides this)

### Authentication & Security
- `JWT_SECRET` - Generate a secure random string (min 32 characters)
  ```bash
  # Generate on your machine:
  openssl rand -base64 32
  ```

### Manus OAuth Configuration
If you want to keep Manus OAuth support (optional):
- `VITE_APP_ID` - Your Manus application ID
- `OAUTH_SERVER_URL` - https://api.manus.im
- `VITE_OAUTH_PORTAL_URL` - https://manus.im/login
- `OWNER_NAME` - Your name
- `OWNER_OPEN_ID` - Your Manus Open ID
- `BUILT_IN_FORGE_API_URL` - https://api.manus.im
- `BUILT_IN_FORGE_API_KEY` - Your Forge API key
- `VITE_FRONTEND_FORGE_API_URL` - https://api.manus.im
- `VITE_FRONTEND_FORGE_API_KEY` - Your Frontend Forge API key

### Application Settings
- `NODE_ENV` - Set to `production`
- `PORT` - Leave blank (Railway assigns automatically)

### Branding
- `VITE_APP_TITLE` - AFGRO Poultry Manager
- `VITE_APP_LOGO` - URL to your logo image

## Step 4: Database Migration

After deployment, run database migrations:

```bash
# Via Railway CLI
railway run npm run db:push

# Or via Railway dashboard:
# 1. Go to your project
# 2. Click "Deployments"
# 3. Click "Logs" on the latest deployment
# 4. Run the command in the terminal
```

## Step 5: Verify Deployment

1. Go to your Railway project dashboard
2. Click the "Deployments" tab
3. Check the latest deployment status
4. Click the URL to access your application
5. Test email/password login with your created user accounts

## Troubleshooting

### Build Fails
- Check the build logs in Railway dashboard
- Ensure all dependencies are listed in `package.json`
- Verify `npm run build` works locally

### Database Connection Issues
- Verify `DATABASE_URL` is correctly set
- Check that the MySQL database is running
- Ensure migrations have been run

### Application Won't Start
- Check the runtime logs in Railway dashboard
- Verify `NODE_ENV=production` is set
- Ensure all required environment variables are configured

### Email/Password Login Not Working
- Verify database migrations ran successfully
- Check that user accounts exist in the database
- Verify JWT_SECRET is set correctly

## Production Checklist

Before going live, ensure:

- [ ] Database is configured and migrations are run
- [ ] All environment variables are set correctly
- [ ] JWT_SECRET is a secure random string
- [ ] Email/password login is tested
- [ ] User accounts are created for staff
- [ ] Role-based access control is verified
- [ ] Application logs are monitored
- [ ] Database backups are configured
- [ ] SSL/HTTPS is enabled (Railway provides this automatically)
- [ ] Custom domain is configured (optional)

## Scaling & Performance

Railway provides several options for scaling:

1. **Increase Memory** - Go to project settings and increase RAM allocation
2. **Add More Instances** - Configure auto-scaling in project settings
3. **Database Optimization** - Add indexes to frequently queried columns
4. **Caching** - Consider adding Redis for session caching

## Monitoring & Logs

In Railway dashboard:
- **Logs** - View application and error logs in real-time
- **Metrics** - Monitor CPU, memory, and network usage
- **Deployments** - View deployment history and rollback if needed

## Rollback

If something goes wrong:
1. Go to "Deployments" tab
2. Find the previous working deployment
3. Click "Redeploy" to rollback

## Support

For Railway-specific issues:
- Railway Documentation: https://docs.railway.app
- Railway Support: https://railway.app/support

For application-specific issues:
- Check application logs in Railway dashboard
- Review error messages and stack traces
- Test features on the dev server first

## Next Steps

After successful deployment:
1. Create user accounts for all staff members
2. Test all features in production
3. Set up monitoring and alerts
4. Configure backups and disaster recovery
5. Train staff on the email/password login system
