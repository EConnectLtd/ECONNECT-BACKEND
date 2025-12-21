# Post-Deployment Checklist 🚀

Congratulations! Your ECONNECT Backend is now live on Digital Ocean. Here's what to do next.

## ✅ Immediate Actions

### 1. Test Your Deployed API

**Get your app URL:**
- Go to Digital Ocean App Platform dashboard
- Your app URL: `https://your-app-name.ondigitalocean.app`

**Test the health endpoint:**
```bash
curl https://your-app-name.ondigitalocean.app/api/health
```

Expected response:
```json
{"success":true,"message":"Server is healthy"}
```

**Test authentication:**
```bash
# Test login endpoint
curl -X POST https://your-app-name.ondigitalocean.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### 2. Update Frontend Configuration

Update your frontend to use the new backend URL:

**If using environment variables:**
```env
# .env.production
REACT_APP_API_URL=https://your-app-name.ondigitalocean.app
# or
VITE_API_URL=https://your-app-name.ondigitalocean.app
```

**Update CORS settings:**
In Digital Ocean, add your frontend URL to `ALLOWED_ORIGINS`:
```
ALLOWED_ORIGINS=https://your-frontend-domain.com,https://www.your-frontend-domain.com
```

### 3. Verify Environment Variables

Check that all required variables are set in Digital Ocean:

**Required:**
- ✅ `JWT_SECRET` (marked as SECRET)
- ✅ `MONGODB_URI` (marked as SECRET)
- ✅ `NODE_ENV=production`
- ✅ `PORT=4000`

**Recommended:**
- `ALLOWED_ORIGINS` - Your frontend domains
- `FRONTEND_URL` - For payment redirects

**Optional (if using):**
- Redis variables (if using queues)
- Beem SMS variables
- AzamPay variables

---

## 🔧 Configuration & Optimization

### 4. Set Up Custom Domain (Optional but Recommended)

1. **In Digital Ocean:**
   - Go to **Settings** → **Domains**
   - Click **"Add Domain"**
   - Enter your domain: `api.yourdomain.com` or `backend.yourdomain.com`

2. **Update DNS Records:**
   - Add a CNAME record pointing to your Digital Ocean app
   - Digital Ocean will provide the exact record to add

3. **SSL Certificate:**
   - Automatically provisioned by Digital Ocean
   - Usually takes 5-10 minutes

4. **Update Environment Variables:**
   - Update `ALLOWED_ORIGINS` to include your custom domain
   - Update `FRONTEND_URL` if needed

### 5. Set Up Redis (If Using Queues)

If your app uses Redis for queues (email, SMS, notifications):

**Option A: Digital Ocean Managed Redis**
1. Create a Redis database in Digital Ocean
2. Get connection details
3. Add to environment variables:
   - `REDIS_HOST=your-redis-host`
   - `REDIS_PORT=6379`
   - `REDIS_PASSWORD=your-password` (SECRET)

**Option B: Redis Cloud or Other Provider**
- Get connection string
- Add to environment variables

### 6. Configure Payment Gateway (AzamPay)

If using AzamPay:

1. **Get Production Credentials:**
   - Contact AzamPay for production API credentials
   - Update environment variables:
     - `AZAMPAY_APP_NAME`
     - `AZAMPAY_CLIENT_ID` (SECRET)
     - `AZAMPAY_CLIENT_SECRET` (SECRET)
     - `AZAMPAY_API_URL=https://checkout.azampay.co.tz` (production)

2. **Update Frontend URLs:**
   - Ensure `FRONTEND_URL` is set correctly
   - Payment redirects will use this URL

### 7. Configure SMS Service (Beem)

If using Beem SMS:

1. **Get Production Credentials:**
   - Update environment variables:
     - `BEEM_API_KEY` (SECRET)
     - `BEEM_SECRET_KEY` (SECRET)
     - `BEEM_SOURCE_ADDR=ECONNECT` (or your approved sender ID)

---

## 📊 Monitoring & Maintenance

### 8. Set Up Monitoring

**Digital Ocean Metrics:**
- Go to **Metrics** tab in App Platform
- Monitor:
  - CPU usage
  - Memory usage
  - Request rate
  - Response times

**Application Logs:**
- Go to **Runtime Logs** tab
- Monitor for errors
- Set up alerts for critical errors

**Health Checks:**
- Digital Ocean automatically checks `/api/health`
- Monitor health check status

### 9. Set Up Alerts

1. **In Digital Ocean:**
   - Go to **Settings** → **Alerts**
   - Set up alerts for:
     - High CPU usage (>80%)
     - High memory usage (>80%)
     - Failed health checks
     - Deployment failures

2. **Application-Level Alerts:**
   - Monitor error rates
   - Set up notifications for critical issues

### 10. Database Monitoring

**MongoDB Atlas:**
- Monitor connection count
- Check database size
- Set up alerts for high usage

**Digital Ocean Managed Database:**
- Monitor in Digital Ocean dashboard
- Set up alerts for resource limits

---

## 🔒 Security Best Practices

### 11. Security Checklist

- [ ] All sensitive variables marked as **SECRET** in Digital Ocean
- [ ] `JWT_SECRET` is strong and unique (not default)
- [ ] MongoDB connection string uses strong password
- [ ] CORS configured to only allow your frontend domains
- [ ] Rate limiting enabled (check your code)
- [ ] HTTPS enabled (automatic with Digital Ocean)
- [ ] Regular security updates (monitor npm audit)

**Run security audit:**
```bash
npm audit
npm audit fix
```

### 12. Backup Strategy

**Database Backups:**
- MongoDB Atlas: Automatic backups enabled
- Digital Ocean Managed DB: Enable automated backups
- Set up regular backup schedule

**Code Backups:**
- GitHub repository is your backup
- Tag releases: `git tag v1.0.0`

---

## 🚀 Scaling & Performance

### 13. Performance Optimization

**Current Setup:**
- Instance: `basic-xxs` (starter plan)
- Instance Count: 1

**When to Scale:**
- High CPU usage (>70% consistently)
- High memory usage (>70% consistently)
- Slow response times
- High request volume

**How to Scale:**
1. **Vertical Scaling:** Upgrade instance size
   - Go to **Settings** → **App-Level Settings**
   - Change **Instance Size** to larger plan

2. **Horizontal Scaling:** Add more instances
   - Increase **Instance Count**
   - Digital Ocean will load balance automatically

### 14. Optimize Build Times

- Use `.dockerignore` (already configured)
- Cache dependencies in build process
- Consider using buildpacks optimization

---

## 📝 Documentation Updates

### 15. Update API Documentation

Update your API documentation with:
- New production URL
- Environment-specific endpoints
- Authentication examples using production URL

### 16. Update Team Documentation

- Document deployment process
- Share environment variable requirements
- Document monitoring and alerting setup

---

## 🔄 Continuous Deployment

### 17. Verify Auto-Deploy

Your app is configured to auto-deploy on push to `main` branch:
- ✅ `deploy_on_push: true` in `.do/app.yaml`

**Test it:**
1. Make a small change
2. Push to `main` branch
3. Check Digital Ocean dashboard for new deployment

### 18. Set Up Staging Environment (Optional)

Consider creating a staging environment:
- Create another app in Digital Ocean
- Use different branch (e.g., `staging`)
- Test changes before production

---

## 🎯 Next Steps Summary

**Priority 1 (Do Now):**
1. ✅ Test API endpoints
2. ✅ Update frontend to use new backend URL
3. ✅ Configure CORS with frontend domain
4. ✅ Set up monitoring alerts

**Priority 2 (This Week):**
5. ⏳ Set up custom domain
6. ⏳ Configure Redis (if needed)
7. ⏳ Set up payment gateway (if needed)
8. ⏳ Configure SMS service (if needed)

**Priority 3 (Ongoing):**
9. ⏳ Monitor performance
10. ⏳ Set up backups
11. ⏳ Security audits
12. ⏳ Scale as needed

---

## 🆘 Troubleshooting

**If something goes wrong:**

1. **Check Logs:**
   - Digital Ocean → Runtime Logs
   - Look for error messages

2. **Check Health:**
   - Test `/api/health` endpoint
   - Verify MongoDB connection

3. **Check Environment Variables:**
   - Ensure all required variables are set
   - Verify values are correct

4. **Rollback if Needed:**
   - Digital Ocean → Deployments
   - Rollback to previous successful deployment

---

## 📞 Support Resources

- **Digital Ocean Docs:** https://docs.digitalocean.com/products/app-platform/
- **Digital Ocean Support:** Available in dashboard
- **Application Logs:** Check Runtime Logs tab
- **Health Status:** Monitor in App Platform dashboard

---

**Congratulations! Your backend is live and ready to serve your application! 🎉**

