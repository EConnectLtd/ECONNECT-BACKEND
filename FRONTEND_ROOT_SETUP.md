# 🎯 Quick Setup: Frontend on Root, Backend on /api

Since your **frontend is already on the root route** (`/`), here's the quick setup to add your backend on the `/api` route.

---

## ✅ Current Setup

- **Frontend:** `https://econnect.co.tz/` (root - already configured)
- **Backend:** `https://econnect.co.tz/api` (needs configuration)

---

## Step 1: Configure Backend Route to `/api`

1. Go to [Digital Ocean App Platform](https://cloud.digitalocean.com/apps)
2. Click on **econnect-app**
3. In **Components**, click **econnect-backend** (Web Service)
4. Go to **Settings** → **HTTP Routes**
5. Change route from `/` to `/api`
6. **Save**

---

## Step 2: Add Backend URL to Frontend Environment Variables

1. In **Components**, click **econnect-frontend** (Static Site)
2. Go to **Settings** → **Environment Variables**
3. Click **Edit** or **Add Variable**

**Add:**
- **For Vite:** `VITE_API_URL=https://econnect.co.tz/api`
- **For CRA:** `REACT_APP_API_URL=https://econnect.co.tz/api`

4. **Save** (frontend will auto-rebuild)

---

## Step 3: Configure CORS in Backend

1. Go to **Settings** → **App-Level Environment Variables**
2. Click **Edit**
3. Add:
   - `ALLOWED_ORIGINS` = `https://econnect.co.tz,https://www.econnect.co.tz`
   - `FRONTEND_URL` = `https://econnect.co.tz`
4. **Save** (backend will auto-redeploy)

---

## Step 4: Test

**Test Backend:**
```
https://econnect.co.tz/api/health
```

Should return: `{"success":true,"message":"Server is healthy"}`

**Test Frontend:**
- Open: `https://econnect.co.tz`
- Check browser DevTools → Network tab
- Make an API call (e.g., login)
- Should see requests to: `https://econnect.co.tz/api/...`

---

## 📝 Summary

**Routes:**
- Frontend: `/` → `https://econnect.co.tz/`
- Backend: `/api` → `https://econnect.co.tz/api/*`

**Environment Variables:**

**Frontend Component:**
```
VITE_API_URL=https://econnect.co.tz/api
```

**App-Level (Backend):**
```
ALLOWED_ORIGINS=https://econnect.co.tz,https://www.econnect.co.tz
FRONTEND_URL=https://econnect.co.tz
```

---

**✅ Done! Your frontend on root and backend on /api are now connected!**

