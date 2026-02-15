# Railway Deployment Quick Start

## 5-Minute Setup Guide

### 1. Create Railway Account
- Go to https://railway.app
- Sign up with GitHub or email
- Create a new project

### 2. Connect Your Repository
- Click "New Project" → "Deploy from GitHub"
- Select your repository
- Railway auto-detects Node.js configuration

### 3. Add MySQL Database
- In Railway dashboard, click "Add Service"
- Select "MySQL"
- Railway provisions a database automatically

### 4. Configure Environment Variables
Copy these into Railway dashboard (Settings → Variables):

```
DATABASE_URL=<Railway MySQL connection string>
JWT_SECRET=<Generate with: openssl rand -base64 32>
NODE_ENV=production
VITE_APP_TITLE=AFGRO Poultry Manager
VITE_APP_LOGO=https://your-cdn-url/logo.png
```

**Optional (for Manus OAuth):**
```
VITE_APP_ID=your-manus-app-id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://manus.im/login
OWNER_NAME=Your Name
OWNER_OPEN_ID=your-open-id
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=your-forge-api-key
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im
VITE_FRONTEND_FORGE_API_KEY=your-frontend-forge-api-key
VITE_ANALYTICS_ENDPOINT=https://analytics.manus.im
VITE_ANALYTICS_WEBSITE_ID=your-website-id
```

### 5. Deploy
- Railway automatically deploys on push
- Check deployment status in "Deployments" tab
- Click the generated URL to access your app

### 6. Run Database Migrations
After first deployment:
```bash
railway run npm run db:push
```

Or via Railway CLI:
```bash
railway login
cd your-project-directory
railway up
```

### 7. Test Email/Password Login
1. Access your deployed application
2. Go to User Management
3. Create a test user account
4. Log out and test login with email/password

## Deployment Status

After deployment, your application will be available at:
```
https://your-project-name.up.railway.app
```

## Key Features Now Available

✅ Email/password authentication (no Manus account required)
✅ User management with role-based access
✅ All production features working
✅ Database persistence
✅ Automatic HTTPS/SSL
✅ Auto-scaling available

## Troubleshooting

**Build fails?**
- Check build logs in Railway dashboard
- Ensure Node.js version is compatible (v18+)

**Database connection error?**
- Verify DATABASE_URL is set correctly
- Run migrations: `railway run npm run db:push`

**Login not working?**
- Check that users exist in database
- Verify JWT_SECRET is set
- Check application logs in Railway dashboard

## Next Steps

1. Create user accounts for your team
2. Test all features in production
3. Set up custom domain (optional)
4. Configure monitoring and alerts
5. Set up automated backups

See `DEPLOYMENT.md` for detailed information.
