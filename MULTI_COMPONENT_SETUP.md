# 🔗 Configure Multiple Components in Same Digital Ocean App

Your app has **3 components** in the same Digital Ocean app:

1. **econnect-backend** (Web Service) - Your API
2. **econnect-frontend** (Static Site) - Your frontend
3. **econnect-db-mongodb** (Database) - Your MongoDB

This guide shows how to connect them.

---

## Step 1: Backend Route Configuration

Since your **frontend is on the main route** (`/`), your backend should be configured to use the `/api` route.

**Your setup:**

- **Frontend:** `https://econnect.co.tz/` (root route - already configured)
- **Backend:** `https://econnect.co.tz/api` (API route - needs to be configured)

**To configure backend route:**

1. Go to [Digital Ocean App Platform](https://cloud.digitalocean.com/apps)
2. Click on your app: **econnect-app**
3. In **Components**, click on **econnect-backend** (Web Service)
4. Go to **Settings** → **HTTP Routes**
5. Configure the route to: `/api`
6. Save the changes

**Your backend URLs will be:**

- `https://econnect.co.tz/api` (custom domain)
- `https://econnect-app-vo4td.ondigitalocean.app/api` (Digital Ocean domain)

---

## Step 2: Configure Frontend Component Environment Variables

Since your frontend is a **Static Site** component in the same app, you need to configure it to use the backend URL.

**Steps:**

1. In Digital Ocean → Your App → **Components**
2. Click on **econnect-frontend** (Static Site)
3. Click **"Edit"** or go to **Settings**
4. Go to **"Environment Variables"** section
5. Click **"Edit"** or **"Add Variable"**

**Add these environment variables:**

**Since frontend is on root (`/`) and backend is on `/api` route:**

### For Vite/React (Vite):

```
VITE_API_URL=https://econnect.co.tz/api
```

Or if you want to use the Digital Ocean domain:

```
VITE_API_URL=https://econnect-app-vo4td.ondigitalocean.app/api
```

### For Create React App:

```
REACT_APP_API_URL=https://econnect.co.tz/api
```

Or:

```
REACT_APP_API_URL=https://econnect-app-vo4td.ondigitalocean.app/api
```

### For Next.js:

```
NEXT_PUBLIC_API_URL=https://econnect.co.tz/api
```

Or:

```
NEXT_PUBLIC_API_URL=https://econnect-app-vo4td.ondigitalocean.app/api
```

**Important:** Notice the `/api` at the end - this is because your backend is configured on the `/api` route!

6. Click **"Save"**
7. The frontend will automatically rebuild and redeploy

---

## Step 3: Configure CORS in Backend Component

Your backend needs to allow requests from your frontend domain.

**Steps:**

1. Go to your app → **Settings** → **App-Level Environment Variables**
   - **OR** go to **econnect-backend** component → **Settings** → **Environment Variables**
2. Click **"Edit"**
3. Add or update `ALLOWED_ORIGINS`:
   ```
   https://econnect.co.tz,https://www.econnect.co.tz,https://econnect-app-vo4td.ondigitalocean.app
   ```
4. Add `FRONTEND_URL`:
   ```
   https://econnect.co.tz
   ```
5. Click **"Save"**
6. Backend will automatically redeploy

---

## Step 4: Verify Route Configuration

**Your current setup (Frontend on root, Backend on /api):**

✅ **Frontend:** `https://econnect.co.tz/` (root route - already configured)  
✅ **Backend:** `https://econnect.co.tz/api` (API route - configure this)

**To verify routes are correct:**

1. **Backend Route:**

   - Go to **econnect-backend** component → **Settings** → **HTTP Routes**
   - Should be: `/api`

2. **Frontend Route:**
   - Go to **econnect-frontend** component → **Settings** → **HTTP Routes**
   - Should be: `/` (root)

**This setup means:**

- Frontend serves all pages at: `https://econnect.co.tz/`, `https://econnect.co.tz/login`, etc.
- Backend API endpoints at: `https://econnect.co.tz/api/health`, `https://econnect.co.tz/api/auth/login`, etc.

---

## Step 5: Verify Component URLs

**Check each component's URL:**

1. **Backend URL:**

   - Go to **econnect-backend** → **Settings** → **Domains**
   - Note the URL

2. **Frontend URL:**

   - Go to **econnect-frontend** → **Settings** → **Domains**
   - Note the URL (should be `https://econnect.co.tz` if configured)

3. **Test Backend:**

   ```
   https://econnect.co.tz/api/health
   ```

   Or:

   ```
   https://econnect-app-vo4td.ondigitalocean.app/api/health
   ```

4. **Test Frontend:**
   ```
   https://econnect.co.tz
   ```

---

## Step 6: Update Frontend Code (If Needed)

If your frontend code has hardcoded API URLs, update them to use the environment variable:

### Example: API Configuration

**Before:**

```javascript
const API_URL = "http://localhost:4000";
```

**After:**

```javascript
// For Vite
const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://econnect-app-vo4td.ondigitalocean.app";

// For CRA
const API_URL =
  process.env.REACT_APP_API_URL ||
  "https://econnect-app-vo4td.ondigitalocean.app";
```

### Example: Axios Configuration

```javascript
import axios from "axios";

const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ||
    "https://econnect-app-vo4td.ondigitalocean.app",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

export default api;
```

---

## Step 7: Rebuild Frontend

After updating environment variables:

1. **If using GitHub auto-deploy:**

   - Push any code changes to your frontend repository
   - Digital Ocean will automatically rebuild

2. **If manual rebuild needed:**
   - Go to **econnect-frontend** component
   - Click **"Actions"** → **"Force Rebuild"**

---

## Troubleshooting

### Frontend Can't Find Backend

**Problem:** Frontend makes requests but gets 404 or connection errors

**Solutions:**

1. Verify the backend URL in frontend environment variables
2. Check backend is running (check **econnect-backend** component status)
3. Test backend health endpoint directly
4. Check routes configuration

### CORS Errors

**Problem:** `Access to fetch blocked by CORS policy`

**Solutions:**

1. Verify `ALLOWED_ORIGINS` includes your frontend domain
2. Check it's set in **App-Level Environment Variables** (affects all components)
3. Ensure `FRONTEND_URL` is set correctly
4. Redeploy backend after adding variables

### Environment Variables Not Working

**Problem:** Frontend still uses old API URL

**Solutions:**

1. Verify environment variable name matches your framework:
   - Vite: `VITE_API_URL`
   - CRA: `REACT_APP_API_URL`
   - Next.js: `NEXT_PUBLIC_API_URL`
2. Rebuild the frontend component
3. Check frontend build logs for errors

### Components Not Communicating

**Problem:** Components can't reach each other

**Solutions:**

1. Verify both components are in the same app
2. Check component status (both should be "Running")
3. Use the full URL (not relative paths) in environment variables
4. Check network/firewall settings

---

## Quick Reference

**Your Components:**

- **Backend:** `econnect-backend` (Web Service)
- **Frontend:** `econnect-frontend` (Static Site)
- **Database:** `econnect-db-mongodb` (Managed MongoDB)

**Backend URL (with /api route):**

- `https://econnect.co.tz/api`
- `https://econnect-app-vo4td.ondigitalocean.app/api`

**Frontend URL (root route):**

- `https://econnect.co.tz`

**Environment Variables to Set:**

**In Frontend Component:**

- `VITE_API_URL` or `REACT_APP_API_URL` = `https://econnect.co.tz/api` (include `/api`!)

**In Backend Component (App-Level):**

- `ALLOWED_ORIGINS` = `https://econnect.co.tz,https://www.econnect.co.tz`
- `FRONTEND_URL` = `https://econnect.co.tz`

---

## Summary

1. ✅ Find backend component URL from Digital Ocean dashboard
2. ✅ Add API URL to frontend component environment variables
3. ✅ Configure CORS in backend (App-Level Environment Variables)
4. ✅ Update frontend code to use environment variable
5. ✅ Rebuild frontend component
6. ✅ Test connection

**✅ Your frontend and backend components in the same app are now connected!**
