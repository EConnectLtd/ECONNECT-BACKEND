# 🔗 Configure Backend URL in Frontend

Guide to connect your frontend at **https://econnect.co.tz/** to your Digital Ocean backend.

## Step 1: Get Your Backend URL

Based on your Digital Ocean setup, you have two options:

### Option A: Use Default Digital Ocean URL

Your backend URL is likely:
```
https://econnect-app-vo4td.ondigitalocean.app
```

**To verify:**
1. Go to [Digital Ocean App Platform](https://cloud.digitalocean.com/apps)
2. Click on your app: **econnect-app**
3. Look at the **Components** section
4. Click on **econnect-backend** (the web service)
5. The URL will be shown at the top or in the **Settings** → **Domains** section

### Option B: Set Up Custom Subdomain (Recommended)

For a cleaner setup, use: `api.econnect.co.tz`

**Steps:**
1. In Digital Ocean → Your App → **Settings** → **Domains**
2. Click **"Add Domain"**
3. Enter: `api.econnect.co.tz`
4. Update your DNS:
   - Add a CNAME record: `api` → `econnect-app-vo4td.ondigitalocean.app`
   - Or use the DNS instructions provided by Digital Ocean
5. Wait for SSL certificate (5-10 minutes)

**Your backend URL will be:** `https://api.econnect.co.tz`

---

## Step 2: Test Your Backend URL

Before configuring the frontend, test that your backend is accessible:

**Test Health Endpoint:**
```
https://econnect-app-vo4td.ondigitalocean.app/api/health
```

Or if using custom domain:
```
https://api.econnect.co.tz/api/health
```

**Expected Response:**
```json
{"success":true,"message":"Server is healthy"}
```

---

## Step 3: Configure CORS in Backend

Your backend needs to allow requests from `https://econnect.co.tz`.

**In Digital Ocean:**
1. Go to your app → **Settings** → **App-Level Environment Variables**
2. Click **"Edit"**
3. Add or update `ALLOWED_ORIGINS`:
   ```
   https://econnect.co.tz,https://www.econnect.co.tz,https://econnectz.netlify.app
   ```
4. Also add `FRONTEND_URL`:
   ```
   https://econnect.co.tz
   ```
5. Click **"Save"**
6. The app will automatically redeploy

---

## Step 4: Configure Frontend

### If Your Frontend is in a Separate Repository

**Find your frontend repository** and update the API URL:

#### For Vite/React (Vite):
Create or update `.env.production`:
```env
VITE_API_URL=https://econnect-app-vo4td.ondigitalocean.app
```

Or if using custom domain:
```env
VITE_API_URL=https://api.econnect.co.tz
```

#### For Create React App:
Create or update `.env.production`:
```env
REACT_APP_API_URL=https://econnect-app-vo4td.ondigitalocean.app
```

Or if using custom domain:
```env
REACT_APP_API_URL=https://api.econnect.co.tz
```

#### For Next.js:
Create or update `.env.production`:
```env
NEXT_PUBLIC_API_URL=https://econnect-app-vo4td.ondigitalocean.app
```

Or if using custom domain:
```env
NEXT_PUBLIC_API_URL=https://api.econnect.co.tz
```

### If Your Frontend is in Digital Ocean (Static Site)

If your frontend is the **econnect-frontend** static site in Digital Ocean:

1. Go to your app → **Components** → **econnect-frontend**
2. Click **"Edit"**
3. Go to **"Environment Variables"**
4. Add:
   - `VITE_API_URL` or `REACT_APP_API_URL` = `https://econnect-app-vo4td.ondigitalocean.app`
   - Or `https://api.econnect.co.tz` if you set up the subdomain
5. **Rebuild and redeploy** the frontend

---

## Step 5: Update Frontend Code (If Needed)

If your frontend code has hardcoded API URLs, update them:

### Example: API Configuration File

**Before:**
```javascript
const API_URL = 'http://localhost:4000';
// or
const API_URL = 'https://old-backend-url.com';
```

**After:**
```javascript
const API_URL = import.meta.env.VITE_API_URL || 'https://econnect-app-vo4td.ondigitalocean.app';
// or for CRA:
const API_URL = process.env.REACT_APP_API_URL || 'https://econnect-app-vo4td.ondigitalocean.app';
```

### Example: Axios/Fetch Configuration

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://econnect-app-vo4td.ondigitalocean.app',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // If using cookies
});

export default api;
```

---

## Step 6: Rebuild and Redeploy Frontend

After updating the configuration:

1. **Commit your changes:**
   ```bash
   git add .env.production
   git commit -m "Update API URL to Digital Ocean backend"
   git push
   ```

2. **Rebuild your frontend:**
   - If using Digital Ocean: It will auto-redeploy
   - If using Netlify/Vercel: It will auto-redeploy
   - If manual: Run `npm run build` and deploy

---

## Step 7: Verify Connection

1. **Open your frontend:** https://econnect.co.tz
2. **Open browser DevTools** (F12) → **Network** tab
3. **Try to login or make an API call**
4. **Check the requests:**
   - Should see requests to: `https://econnect-app-vo4td.ondigitalocean.app/api/...`
   - Status should be `200 OK` (not CORS errors)

---

## Troubleshooting

### CORS Error

**Error:** `Access to fetch at '...' from origin 'https://econnect.co.tz' has been blocked by CORS policy`

**Solution:**
1. Verify `ALLOWED_ORIGINS` includes `https://econnect.co.tz`
2. Check it's set in **App-Level Environment Variables** (not component-level)
3. Redeploy the backend after adding the variable

### 404 Not Found

**Error:** API requests return 404

**Solution:**
1. Verify the backend URL is correct
2. Test the health endpoint directly in browser
3. Check backend logs in Digital Ocean

### Connection Refused

**Error:** Cannot connect to backend

**Solution:**
1. Verify backend is running (check Digital Ocean dashboard)
2. Check backend health: `/api/health`
3. Verify the URL has no typos

---

## Quick Reference

**Backend URL Options:**
- Default: `https://econnect-app-vo4td.ondigitalocean.app`
- Custom: `https://api.econnect.co.tz` (if configured)

**Frontend URL:**
- `https://econnect.co.tz`

**Environment Variables to Set:**
- Backend: `ALLOWED_ORIGINS=https://econnect.co.tz,https://www.econnect.co.tz`
- Backend: `FRONTEND_URL=https://econnect.co.tz`
- Frontend: `VITE_API_URL` or `REACT_APP_API_URL` = your backend URL

---

**✅ Once configured, your frontend at https://econnect.co.tz will communicate with your Digital Ocean backend!**

