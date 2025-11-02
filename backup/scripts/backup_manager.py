#!/usr/bin/env python3
"""
DEX Backup Manager
Automated backup system for database, Redis, and configuration files
"""

import os
import time
import subprocess
import schedule
import boto3
import logging
from datetime import datetime, timedelta
from pathlib import Path
import gzip
import shutil

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class BackupManager:
    def __init__(self):
        self.backup_dir = Path('/backups')
        self.retention_days = int(os.getenv('RETENTION_DAYS', 30))
        self.compression_level = int(os.getenv('COMPRESSION_LEVEL', 6))

        # AWS S3 configuration
        self.s3_enabled = bool(os.getenv('S3_BUCKET'))
        if self.s3_enabled:
            self.s3_bucket = os.getenv('S3_BUCKET')
            self.s3_client = boto3.client(
                's3',
                aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
                aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
                region_name=os.getenv('AWS_REGION', 'us-east-1')
            )

        # Database configuration
        self.db_host = os.getenv('DB_HOST', 'postgres')
        self.db_port = os.getenv('DB_PORT', '5432')
        self.db_name = os.getenv('DB_NAME', 'dex_production')
        self.db_user = os.getenv('DB_USER', 'dex_user')
        self.db_password = os.getenv('DB_PASSWORD')

        # Redis configuration
        self.redis_host = os.getenv('REDIS_HOST', 'redis')
        self.redis_port = os.getenv('REDIS_PORT', '6379')
        self.redis_password = os.getenv('REDIS_PASSWORD')

    def backup_database(self):
        """Backup PostgreSQL database"""
        logger.info("Starting database backup...")

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = self.backup_dir / 'database' / f'postgres_backup_{timestamp}.sql'
        backup_file.parent.mkdir(parents=True, exist_ok=True)

        # Set PGPASSWORD environment variable
        env = os.environ.copy()
        env['PGPASSWORD'] = self.db_password

        try:
            # Create database dump
            cmd = [
                'pg_dump',
                '-h', self.db_host,
                '-p', self.db_port,
                '-U', self.db_user,
                '-d', self.db_name,
                '--verbose',
                '--no-password',
                '--format=custom',
                '--compress=9'
            ]

            with open(backup_file, 'wb') as f:
                result = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE, env=env)

            if result.returncode == 0:
                # Compress the backup
                compressed_file = f"{backup_file}.gz"
                with open(backup_file, 'rb') as f_in:
                    with gzip.open(compressed_file, 'wb', compresslevel=self.compression_level) as f_out:
                        shutil.copyfileobj(f_in, f_out)

                # Remove uncompressed file
                backup_file.unlink()

                # Upload to S3 if enabled
                if self.s3_enabled:
                    self.upload_to_s3(compressed_file, f'database/postgres_backup_{timestamp}.sql.gz')

                logger.info(f"Database backup completed: {compressed_file}")
                return compressed_file
            else:
                logger.error(f"Database backup failed: {result.stderr.decode()}")
                return None

        except Exception as e:
            logger.error(f"Database backup error: {e}")
            return None

    def backup_redis(self):
        """Backup Redis data"""
        logger.info("Starting Redis backup...")

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = self.backup_dir / 'redis' / f'redis_backup_{timestamp}.rdb'
        backup_file.parent.mkdir(parents=True, exist_ok=True)

        try:
            # Create Redis backup using BGSAVE
            if self.redis_password:
                cmd = ['redis-cli', '-h', self.redis_host, '-p', self.redis_port, '-a', self.redis_password, 'BGSAVE']
            else:
                cmd = ['redis-cli', '-h', self.redis_host, '-p', self.redis_port, 'BGSAVE']

            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode == 0:
                # Wait for background save to complete
                time.sleep(5)

                # Copy the RDB file
                if self.redis_password:
                    cmd = ['redis-cli', '-h', self.redis_host, '-p', self.redis_port, '-a', self.redis_password, '--rdb', str(backup_file)]
                else:
                    cmd = ['redis-cli', '-h', self.redis_host, '-p', self.redis_port, '--rdb', str(backup_file)]

                result = subprocess.run(cmd, capture_output=True)

                if result.returncode == 0:
                    # Compress the backup
                    compressed_file = f"{backup_file}.gz"
                    with open(backup_file, 'rb') as f_in:
                        with gzip.open(compressed_file, 'wb', compresslevel=self.compression_level) as f_out:
                            shutil.copyfileobj(f_in, f_out)

                    # Remove uncompressed file
                    backup_file.unlink()

                    # Upload to S3 if enabled
                    if self.s3_enabled:
                        self.upload_to_s3(compressed_file, f'redis/redis_backup_{timestamp}.rdb.gz')

                    logger.info(f"Redis backup completed: {compressed_file}")
                    return compressed_file
                else:
                    logger.error("Failed to copy Redis RDB file")
                    return None
            else:
                logger.error(f"Redis BGSAVE failed: {result.stderr}")
                return None

        except Exception as e:
            logger.error(f"Redis backup error: {e}")
            return None

    def backup_config_files(self):
        """Backup configuration files"""
        logger.info("Starting configuration backup...")

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = self.backup_dir / 'config' / f'config_backup_{timestamp}.tar.gz'
        backup_file.parent.mkdir(parents=True, exist_ok=True)

        try:
            # List of configuration directories to backup
            config_paths = [
                '/app/nginx',
                '/app/monitoring',
                '/app/ssl',
                '/app/scripts'
            ]

            # Create tar archive
            cmd = ['tar', '-czf', str(backup_file)] + [path for path in config_paths if os.path.exists(path)]

            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode == 0:
                # Upload to S3 if enabled
                if self.s3_enabled:
                    self.upload_to_s3(backup_file, f'config/config_backup_{timestamp}.tar.gz')

                logger.info(f"Configuration backup completed: {backup_file}")
                return backup_file
            else:
                logger.error(f"Configuration backup failed: {result.stderr}")
                return None

        except Exception as e:
            logger.error(f"Configuration backup error: {e}")
            return None

    def upload_to_s3(self, local_file, s3_key):
        """Upload backup file to S3"""
        try:
            logger.info(f"Uploading {local_file} to S3...")
            self.s3_client.upload_file(str(local_file), self.s3_bucket, s3_key)
            logger.info(f"Successfully uploaded to S3: s3://{self.s3_bucket}/{s3_key}")
        except Exception as e:
            logger.error(f"S3 upload failed: {e}")

    def cleanup_old_backups(self):
        """Remove old backup files"""
        logger.info("Cleaning up old backups...")

        cutoff_date = datetime.now() - timedelta(days=self.retention_days)

        for backup_type in ['database', 'redis', 'config']:
            backup_path = self.backup_dir / backup_type
            if backup_path.exists():
                for file_path in backup_path.iterdir():
                    if file_path.is_file():
                        file_time = datetime.fromtimestamp(file_path.stat().st_mtime)
                        if file_time < cutoff_date:
                            file_path.unlink()
                            logger.info(f"Removed old backup: {file_path}")

        # Also cleanup old S3 backups if enabled
        if self.s3_enabled:
            self.cleanup_s3_backups()

    def cleanup_s3_backups(self):
        """Remove old S3 backup files"""
        try:
            cutoff_date = datetime.now() - timedelta(days=self.retention_days)

            response = self.s3_client.list_objects_v2(Bucket=self.s3_bucket)

            if 'Contents' in response:
                for obj in response['Contents']:
                    if obj['LastModified'].replace(tzinfo=None) < cutoff_date:
                        self.s3_client.delete_object(Bucket=self.s3_bucket, Key=obj['Key'])
                        logger.info(f"Removed old S3 backup: {obj['Key']}")

        except Exception as e:
            logger.error(f"S3 cleanup failed: {e}")

    def run_full_backup(self):
        """Run complete backup process"""
        logger.info("Starting full backup process...")

        start_time = datetime.now()
        success_count = 0
        total_backups = 3

        # Backup database
        if self.backup_database():
            success_count += 1

        # Backup Redis
        if self.backup_redis():
            success_count += 1

        # Backup configuration
        if self.backup_config_files():
            success_count += 1

        # Cleanup old backups
        self.cleanup_old_backups()

        # Create status file
        status_file = self.backup_dir / '.last_backup'
        with open(status_file, 'w') as f:
            f.write(f"Last backup: {datetime.now().isoformat()}\n")
            f.write(f"Success rate: {success_count}/{total_backups}\n")
            f.write(f"Duration: {datetime.now() - start_time}\n")

        end_time = datetime.now()
        duration = end_time - start_time

        logger.info(f"Backup process completed in {duration}")
        logger.info(f"Success rate: {success_count}/{total_backups} backups")

        return success_count == total_backups

    def health_check(self):
        """Health check for backup service"""
        try:
            # Check if last backup was successful
            status_file = self.backup_dir / '.last_backup'
            if status_file.exists():
                with open(status_file, 'r') as f:
                    content = f.read()
                    return {
                        'status': 'healthy',
                        'last_backup': content.split('\n')[0],
                        'timestamp': datetime.now().isoformat()
                    }
            else:
                return {
                    'status': 'warning',
                    'message': 'No backup status found',
                    'timestamp': datetime.now().isoformat()
                }
        except Exception as e:
            return {
                'status': 'unhealthy',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }

def main():
    """Main backup service function"""
    backup_manager = BackupManager()

    # Parse backup schedule
    backup_schedule = os.getenv('BACKUP_SCHEDULE', '0 2 * * *')  # Default: 2 AM daily

    # Schedule backup job
    if backup_schedule == '0 2 * * *':  # Daily at 2 AM
        schedule.every().day.at("02:00").do(backup_manager.run_full_backup)
    else:
        # For more complex schedules, you would parse the cron expression
        # For now, default to daily
        schedule.every().day.at("02:00").do(backup_manager.run_full_backup)

    logger.info(f"Backup service started with schedule: {backup_schedule}")

    # Run initial backup
    backup_manager.run_full_backup()

    # Main loop
    try:
        while True:
            schedule.run_pending()
            time.sleep(60)  # Check every minute
    except KeyboardInterrupt:
        logger.info("Backup service stopped by user")
    except Exception as e:
        logger.error(f"Backup service crashed: {e}")
        raise

if __name__ == "__main__":
    main()