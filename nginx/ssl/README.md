# SSL Certificate Setup for Soba DEX

This directory should contain SSL/TLS certificates for HTTPS configuration.

## Production Setup

### Option 1: Let's Encrypt (Recommended for production)

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Certificates will be generated at:
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/yourdomain.com/privkey.pem

# Copy to nginx/ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/ssl/key.pem
```

### Option 2: Self-Signed Certificate (Development/Testing only)

```bash
# Generate self-signed certificate (valid for 365 days)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# Set proper permissions
chmod 600 nginx/ssl/key.pem
chmod 644 nginx/ssl/cert.pem
```

### Option 3: Commercial Certificate

1. Purchase SSL certificate from provider (GoDaddy, DigiCert, etc.)
2. Download certificate files
3. Copy to this directory:
   - `cert.pem` - Certificate file
   - `key.pem` - Private key file

## Required Files

The nginx configuration expects these files:

- `cert.pem` - SSL certificate (or certificate chain)
- `key.pem` - Private key

## Security Best Practices

1. **Never commit private keys to version control**
   - The `.gitignore` should exclude `*.pem` and `*.key` files

2. **Use strong key sizes**
   - Minimum 2048-bit RSA or 256-bit ECC

3. **Keep certificates up to date**
   - Set up automatic renewal for Let's Encrypt
   - Monitor expiration dates

4. **Restrict file permissions**
   ```bash
   chmod 600 key.pem  # Private key - owner read/write only
   chmod 644 cert.pem # Certificate - owner write, all read
   ```

## Testing SSL Configuration

After setting up certificates, test the configuration:

```bash
# Test nginx configuration
docker-compose exec nginx nginx -t

# Check certificate validity
openssl x509 -in nginx/ssl/cert.pem -text -noout

# Check certificate expiration
openssl x509 -in nginx/ssl/cert.pem -noout -dates

# Test SSL/TLS setup (after starting nginx)
openssl s_client -connect localhost:443 -servername yourdomain.com
```

## Automatic Renewal (Let's Encrypt)

Set up a cron job for automatic renewal:

```bash
# Edit crontab
crontab -e

# Add renewal check (runs daily at 2:30 AM)
30 2 * * * certbot renew --quiet --deploy-hook "docker-compose -f /path/to/docker-compose.prod.yml restart nginx"
```

## Docker Volume Mounting

The docker-compose.prod.yml mounts this directory as:

```yaml
volumes:
  - ./nginx/ssl:/etc/nginx/ssl:ro
```

Ensure certificates are in place before starting the containers.

## Troubleshooting

### Certificate Not Found Error

```
nginx: [emerg] cannot load certificate "/etc/nginx/ssl/cert.pem"
```

**Solution**: Generate or copy certificates to `nginx/ssl/` directory

### Permission Denied Error

```
nginx: [emerg] SSL_CTX_use_PrivateKey_file() failed
```

**Solution**: Check file permissions and ownership

```bash
ls -la nginx/ssl/
chmod 600 nginx/ssl/key.pem
```

### Certificate Chain Issues

**Solution**: Ensure cert.pem includes the full certificate chain

```bash
# Combine certificate and intermediate certificates
cat your_certificate.crt intermediate.crt > cert.pem
```

## For Development

For local development without HTTPS, you can:

1. Comment out the HTTPS server block in nginx.conf
2. Use only the HTTP server (port 80)
3. Update docker-compose.prod.yml to remove SSL volume mount

Or generate a self-signed certificate as shown above.
