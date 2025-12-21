# Quick Start: Deploy as Web Service on Digital Ocean

This is a step-by-step guide to deploy your ECONNECT Backend as a **Web Service** on Digital Ocean App Platform.

## Prerequisites Checklist

- [ ] Digital Ocean account created
- [ ] GitHub repository: `EConnectLtd/ECONNECT-BACKEND`
- [ ] MongoDB database ready (connection string)
- [ ] Code pushed to GitHub (including `.do/app.yaml`)

---

## Step-by-Step Deployment

### Step 1: Access Digital Ocean App Platform

1. Go to [Digital Ocean Control Panel](https://cloud.digitalocean.com)
2. Click the **"Create"** button (top right)
3. Select **"Apps"** from the dropdown

### Step 2: Connect Your GitHub Repository

1. On the "Create App" page, click **"GitHub"** as your source
2. If not connected, authorize Digital Ocean to access your GitHub account
3. Select your repository: **`EConnectLtd/ECONNECT-BACKEND`**
4. Select branch: **`main`** (or your default branch)
5. Click **"Next"**

### Step 3: Configure Your Web Service

Digital Ocean should automatically detect your `.do/app.yaml` file. You should see:

- **Service Type:** Web Service
- **Name:** api
- **Build Command:** `npm install`
- **Run Command:** `npm start`
- **HTTP Port:** 4000

**If auto-detection doesn't work, manually configure:**
1. Click **"Edit"** on the detected service
2. Ensure **"Web Service"** is selected (not Worker or Static Site)
3. Set:
   - **Source Directory:** `/`
   - **Build Command:** `npm install`
   - **Run Command:** `npm start`
   - **HTTP Port:** `4000`
   - **Health Check Path:** `/api/health`

### Step 4: Configure Environment Variables

1. Click on **"Environment Variables"** tab
2. Add the following **Required** variables:

#### Required Environment Variables:

| Variable Name | Value | Type | Notes |
|--------------|-------|------|-------|
| `NODE_ENV` | `production` | Plain | Already in app.yaml |
| `PORT` | `4000` | Plain | Already in app.yaml |
| `JWT_SECRET` | `your-secret-key-here` | **SECRET** | Generate a strong random string |
| `MONGODB_URI` | `mongodb+srv://...` | **SECRET** | Your MongoDB connection string |

**To mark as SECRET:**
- Click the toggle next to the variable name
- This hides the value in the UI

#### Optional Environment Variables (Add as needed):

| Variable Name | Type | When to Use |
|--------------|------|-------------|
| `REDIS_HOST` | SECRET | If using Redis queues |
| `REDIS_PORT` | Plain | If using Redis (default: 6379) |
| `REDIS_PASSWORD` | SECRET | If Redis requires password |
| `ALLOWED_ORIGINS` | Plain | Comma-separated frontend URLs |
| `FRONTEND_URL` | Plain | Your frontend domain |
| `BEEM_API_KEY` | SECRET | If using Beem SMS |
| `BEEM_SECRET_KEY` | SECRET | If using Beem SMS |
| `AZAMPAY_CLIENT_ID` | SECRET | If using AzamPay |
| `AZAMPAY_CLIENT_SECRET` | SECRET | If using AzamPay |

### Step 5: Choose Instance Size

1. Go to **"Settings"** tab
2. Under **"App-Level Settings"**:
   - **Instance Size:** Start with `Basic ($5/month)` or `Professional ($12/month)`
   - **Instance Count:** `1` (can scale later)
   - **Region:** Choose closest to your users (e.g., `NYC`, `SFO`, `AMS`)

### Step 6: Review and Deploy

1. Review all settings:
   - ✅ Service type is **Web Service**
   - ✅ Environment variables are set
   - ✅ Health check path is `/api/health`
   - ✅ Port is `4000`

2. Click **"Create Resources"** or **"Deploy"**

3. Wait for deployment (usually 5-10 minutes):
   - Build phase: Installing dependencies
   - Deploy phase: Starting the service
   - Health check: Verifying `/api/health` endpoint

### Step 7: Verify Deployment

Once deployment completes:

1. **Check the URL:**
   - Your app will be at: `https://econnect-backend-xxxxx.ondigitalocean.app`
   - The exact URL is shown in the App Platform dashboard

2. **Test Health Endpoint:**
   ```
   https://your-app-url.ondigitalocean.app/api/health
   ```
   Should return: `{"success":true,"message":"Server is healthy"}`

3. **Check Logs:**
   - Go to **"Runtime Logs"** tab in Digital Ocean
   - Look for: `✅ Server: http://localhost:4000`
   - Look for: `✅ MongoDB Connected Successfully`

4. **Test API:**
   ```
   POST https://your-app-url.ondigitalocean.app/api/auth/login
   ```

---

## Common Issues & Solutions

### Issue: Build Fails
**Solution:** Check build logs. Common causes:
- Missing dependencies in `package.json`
- Node version mismatch (ensure Node 18+)

### Issue: Health Check Fails
**Solution:** 
- Verify `/api/health` endpoint exists in your code
- Check that PORT is set to 4000
- Review runtime logs for errors

### Issue: MongoDB Connection Error
**Solution:**
- Verify `MONGODB_URI` is correct
- Check MongoDB allows connections from Digital Ocean IPs
- For MongoDB Atlas: Whitelist `0.0.0.0/0` or specific Digital Ocean IPs

### Issue: App Crashes on Start
**Solution:**
- Check runtime logs
- Verify all required environment variables are set
- Ensure `JWT_SECRET` is set (required)

---

## Post-Deployment

### Update CORS Settings

Once deployed, update `ALLOWED_ORIGINS` to include your production frontend URL:

```
ALLOWED_ORIGINS=https://your-frontend.com,https://www.your-frontend.com
```

### Set Up Custom Domain (Optional)

1. Go to **Settings** → **Domains**
2. Add your custom domain
3. Update DNS records as instructed
4. SSL certificate is automatically provisioned

### Monitor Your App

- **Metrics:** View CPU, Memory, Request metrics
- **Logs:** Real-time application logs
- **Alerts:** Set up alerts for errors or downtime

### Scale Your App

To scale up:
1. Go to **Settings** → **App-Level Settings**
2. Increase **Instance Count** for horizontal scaling
3. Upgrade **Instance Size** for more resources

---

## Next Steps

- [ ] Test all API endpoints
- [ ] Set up monitoring and alerts
- [ ] Configure custom domain
- [ ] Set up Redis (if using queues)
- [ ] Configure payment gateways (AzamPay)
- [ ] Set up SMS service (Beem)

---

## Support

If you encounter issues:
1. Check **Runtime Logs** in Digital Ocean dashboard
2. Verify all environment variables are set correctly
3. Test health endpoint: `/api/health`
4. Review MongoDB connection status

**Your app is now live! 🚀**

