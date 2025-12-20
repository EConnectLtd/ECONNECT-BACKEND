# Digital Ocean Deployment Guide

This guide will help you deploy the ECONNECT Backend to Digital Ocean using App Platform.

## Prerequisites

1. A Digital Ocean account ([Sign up here](https://www.digitalocean.com))
2. A MongoDB database (Digital Ocean Managed Database or MongoDB Atlas)
3. (Optional) A Redis instance for queues (Digital Ocean Managed Redis)
4. Your GitHub repository connected to Digital Ocean

## Deployment Options

### Option 1: Digital Ocean App Platform (Recommended)

App Platform is the easiest way to deploy and is similar to Render.

#### Step 1: Prepare Your Repository

1. Ensure your code is pushed to GitHub
2. Make sure `.do/app.yaml` is in your repository root

#### Step 2: Create App in Digital Ocean

1. Log in to [Digital Ocean Control Panel](https://cloud.digitalocean.com)
2. Click **Create** → **Apps**
3. Choose **GitHub** as your source
4. Select your repository: `EConnectLtd/ECONNECT-BACKEND`
5. Select the branch: `main`
6. Digital Ocean will detect the `.do/app.yaml` file automatically

#### Step 3: Configure Environment Variables

In the App Platform dashboard, go to **Settings** → **App-Level Environment Variables** and add:

**Required Variables:**
```
JWT_SECRET=<your-secret-key>
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/econnect?retryWrites=true&w=majority
NODE_ENV=production
PORT=4000
```

**Optional Variables (configure as needed):**
```
# Redis (if using queues)
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# CORS & Frontend
ALLOWED_ORIGINS=https://your-frontend-domain.com,https://another-domain.com
FRONTEND_URL=https://your-frontend-domain.com

# Beem SMS (if using)
BEEM_API_KEY=your-beem-api-key
BEEM_SECRET_KEY=your-beem-secret-key
BEEM_SOURCE_ADDR=ECONNECT

# AzamPay (if using)
AZAMPAY_APP_NAME=your-app-name
AZAMPAY_CLIENT_ID=your-client-id
AZAMPAY_CLIENT_SECRET=your-client-secret
AZAMPAY_API_URL=https://sandbox.azampay.co.tz

# File Uploads
MAX_FILE_SIZE=10485760
```

**Important:** Mark sensitive variables (JWT_SECRET, passwords, API keys) as **SECRET** in the Digital Ocean dashboard.

#### Step 4: Set Up Database

**Option A: Digital Ocean Managed MongoDB**
1. Create a MongoDB database in Digital Ocean
2. Copy the connection string
3. Set it as `MONGODB_URI` environment variable

**Option B: MongoDB Atlas**
1. Create a cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Whitelist Digital Ocean IPs (or use 0.0.0.0/0 for App Platform)
3. Get connection string and set as `MONGODB_URI`

#### Step 5: Set Up Redis (Optional)

If you're using Redis for queues:
1. Create a Redis database in Digital Ocean
2. Set `REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASSWORD` environment variables

#### Step 6: Deploy

1. Review your configuration
2. Click **Create Resources**
3. Wait for the build and deployment to complete
4. Your app will be available at: `https://your-app-name.ondigitalocean.app`

#### Step 7: Verify Deployment

1. Check health endpoint: `https://your-app-name.ondigitalocean.app/api/health`
2. Check application logs in the Digital Ocean dashboard
3. Test your API endpoints

---

### Option 2: Docker Deployment on Droplet

If you prefer more control, you can deploy using Docker on a Digital Ocean Droplet.

#### Step 1: Create a Droplet

1. Create a new Droplet (Ubuntu 22.04 LTS recommended)
2. Choose size based on your needs (minimum 2GB RAM recommended)
3. Add your SSH key

#### Step 2: Set Up the Server

SSH into your droplet:
```bash
ssh root@your-droplet-ip
```

Install Docker and Docker Compose:
```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt install docker-compose -y
```

#### Step 3: Clone Your Repository

```bash
# Install Git
apt install git -y

# Clone repository
git clone https://github.com/EConnectLtd/ECONNECT-BACKEND.git
cd ECONNECT-BACKEND
```

#### Step 4: Create Environment File

```bash
nano .env
```

Add your environment variables (see Step 3 above for required variables).

#### Step 5: Build and Run Docker Container

```bash
# Build the image
docker build -t econnect-backend .

# Run the container
docker run -d \
  --name econnect-backend \
  --restart unless-stopped \
  -p 4000:4000 \
  --env-file .env \
  econnect-backend
```

#### Step 6: Set Up Nginx (Optional but Recommended)

Install Nginx:
```bash
apt install nginx -y
```

Create Nginx configuration:
```bash
nano /etc/nginx/sites-available/econnect
```

Add:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:
```bash
ln -s /etc/nginx/sites-available/econnect /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

#### Step 7: Set Up SSL with Let's Encrypt

```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d your-domain.com
```

---

## Post-Deployment

### Monitoring

1. **Application Logs**: View logs in Digital Ocean App Platform dashboard
2. **Health Checks**: Monitor `/api/health` endpoint
3. **Database**: Monitor MongoDB connection and performance
4. **Redis**: Monitor Redis connection if using queues

### Scaling

**App Platform:**
- Go to **Settings** → **App-Level Settings**
- Adjust instance count and size as needed

**Droplet:**
- Use Docker Compose for easier scaling
- Consider load balancer for multiple instances

### Updates

**App Platform:**
- Push to your GitHub branch
- App Platform will automatically deploy

**Droplet:**
```bash
cd /path/to/ECONNECT-BACKEND
git pull
docker build -t econnect-backend .
docker stop econnect-backend
docker rm econnect-backend
docker run -d --name econnect-backend --restart unless-stopped -p 4000:4000 --env-file .env econnect-backend
```

### Troubleshooting

**Application won't start:**
- Check environment variables are set correctly
- Verify MongoDB connection string
- Check application logs

**Database connection errors:**
- Verify MongoDB URI is correct
- Check network/firewall rules
- Ensure database allows connections from Digital Ocean IPs

**Redis connection errors:**
- Redis is optional - app will continue without it
- Check Redis credentials if using queues

**File upload issues:**
- Ensure uploads directory has write permissions
- Check MAX_FILE_SIZE environment variable

## Support

For issues or questions:
- Check application logs in Digital Ocean dashboard
- Review MongoDB and Redis connection status
- Verify all environment variables are set correctly

---

**Note:** Remember to keep your environment variables secure and never commit `.env` files to your repository.

