class SimpleScheduler {
  constructor() {
    this.jobs = new Map();
    this.intervals = new Map();
    this.timeouts = new Map();
    this.running = false;
    this.stats = {
      totalJobs: 0,
      executedJobs: 0,
      failedJobs: 0,
      lastExecution: null
    };
  }

  // Start the scheduler
  start() {
    if (this.running) {
      console.warn('Scheduler is already running');
      return;
    }

    this.running = true;
    console.log('Scheduler started');

    // Start all recurring jobs
    this.jobs.forEach((job, name) => {
      if (job.type === 'interval' && job.enabled) {
        this.startIntervalJob(name, job);
      } else if (job.type === 'cron' && job.enabled) {
        this.scheduleCronJob(name, job);
      }
    });
  }

  // Stop the scheduler
  stop() {
    if (!this.running) {
      console.warn('Scheduler is not running');
      return;
    }

    this.running = false;

    // Clear all intervals and timeouts
    this.intervals.forEach((intervalId) => {
      clearInterval(intervalId);
    });
    this.intervals.clear();

    this.timeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.timeouts.clear();

    console.log('Scheduler stopped');
  }

  // Add an interval job
  addIntervalJob(name, handler, interval, options = {}) {
    const job = {
      name,
      type: 'interval',
      handler,
      interval,
      enabled: options.enabled !== false,
      runImmediately: options.runImmediately || false,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      timeout: options.timeout || 30000,
      metadata: options.metadata || {},
      lastRun: null,
      nextRun: null,
      runCount: 0,
      errorCount: 0
    };

    this.jobs.set(name, job);
    this.stats.totalJobs++;

    if (this.running && job.enabled) {
      this.startIntervalJob(name, job);
    }

    console.log(`Added interval job: ${name} (${interval}ms)`);
    return job;
  }

  // Add a timeout job (runs once)
  addTimeoutJob(name, handler, delay, options = {}) {
    const job = {
      name,
      type: 'timeout',
      handler,
      delay,
      enabled: options.enabled !== false,
      maxRetries: options.maxRetries || 1,
      retryDelay: options.retryDelay || 1000,
      timeout: options.timeout || 30000,
      metadata: options.metadata || {},
      scheduledTime: Date.now() + delay,
      runCount: 0,
      errorCount: 0
    };

    this.jobs.set(name, job);
    this.stats.totalJobs++;

    if (this.running && job.enabled) {
      this.scheduleTimeoutJob(name, job);
    }

    console.log(`Added timeout job: ${name} (${delay}ms)`);
    return job;
  }

  // Add a daily job (simplified cron)
  addDailyJob(name, handler, hour = 0, minute = 0, options = {}) {
    const job = {
      name,
      type: 'daily',
      handler,
      hour,
      minute,
      enabled: options.enabled !== false,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      timeout: options.timeout || 30000,
      metadata: options.metadata || {},
      lastRun: null,
      nextRun: this.calculateNextDaily(hour, minute),
      runCount: 0,
      errorCount: 0
    };

    this.jobs.set(name, job);
    this.stats.totalJobs++;

    if (this.running && job.enabled) {
      this.scheduleDailyJob(name, job);
    }

    console.log(`Added daily job: ${name} (${hour}:${minute.toString().padStart(2, '0')})`);
    return job;
  }

  // Start interval job
  startIntervalJob(name, job) {
    if (job.runImmediately) {
      this.executeJob(name, job);
    }

    const intervalId = setInterval(() => {
      this.executeJob(name, job);
    }, job.interval);

    this.intervals.set(name, intervalId);
    job.nextRun = Date.now() + job.interval;
  }

  // Schedule timeout job
  scheduleTimeoutJob(name, job) {
    const timeoutId = setTimeout(() => {
      this.executeJob(name, job);
      this.jobs.delete(name); // Remove one-time job after execution
    }, job.delay);

    this.timeouts.set(name, timeoutId);
  }

  // Schedule daily job
  scheduleDailyJob(name, job) {
    const delay = job.nextRun - Date.now();

    if (delay <= 0) {
      // If scheduled time has passed, run now and schedule for next day
      this.executeJob(name, job);
      job.nextRun = this.calculateNextDaily(job.hour, job.minute);
      return this.scheduleDailyJob(name, job);
    }

    const timeoutId = setTimeout(() => {
      this.executeJob(name, job);
      job.nextRun = this.calculateNextDaily(job.hour, job.minute);
      this.scheduleDailyJob(name, job); // Schedule for next day
    }, delay);

    this.timeouts.set(name, timeoutId);
  }

  // Calculate next daily execution time
  calculateNextDaily(hour, minute) {
    const now = new Date();
    const next = new Date();

    next.setHours(hour, minute, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next.getTime();
  }

  // Execute a job
  async executeJob(name, job, retryCount = 0) {
    if (!job.enabled) {
      return;
    }

    console.log(`Executing job: ${name}`);

    const startTime = Date.now();
    job.lastRun = startTime;
    job.runCount++;

    try {
      // Set execution timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Job timeout')), job.timeout);
      });

      // Execute job with timeout
      const jobPromise = Promise.resolve(job.handler(job.metadata));
      await Promise.race([jobPromise, timeoutPromise]);

      const duration = Date.now() - startTime;
      this.stats.executedJobs++;
      this.stats.lastExecution = {
        job: name,
        success: true,
        duration,
        timestamp: startTime
      };

      console.log(`Job completed: ${name} (${duration}ms)`);

    } catch (error) {
      const duration = Date.now() - startTime;
      job.errorCount++;
      this.stats.failedJobs++;

      console.error(`Job failed: ${name}`, error.message);

      this.stats.lastExecution = {
        job: name,
        success: false,
        error: error.message,
        duration,
        timestamp: startTime
      };

      // Retry logic
      if (retryCount < job.maxRetries) {
        console.log(`Retrying job: ${name} (attempt ${retryCount + 1}/${job.maxRetries})`);

        setTimeout(() => {
          this.executeJob(name, job, retryCount + 1);
        }, job.retryDelay);
      }
    }
  }

  // Remove a job
  removeJob(name) {
    const job = this.jobs.get(name);
    if (!job) {
      console.warn(`Job not found: ${name}`);
      return false;
    }

    // Clear timers
    if (this.intervals.has(name)) {
      clearInterval(this.intervals.get(name));
      this.intervals.delete(name);
    }

    if (this.timeouts.has(name)) {
      clearTimeout(this.timeouts.get(name));
      this.timeouts.delete(name);
    }

    this.jobs.delete(name);
    console.log(`Removed job: ${name}`);
    return true;
  }

  // Enable/disable a job
  toggleJob(name, enabled) {
    const job = this.jobs.get(name);
    if (!job) {
      console.warn(`Job not found: ${name}`);
      return false;
    }

    job.enabled = enabled;

    if (enabled && this.running) {
      // Restart the job
      if (job.type === 'interval') {
        this.startIntervalJob(name, job);
      } else if (job.type === 'daily') {
        this.scheduleDailyJob(name, job);
      }
    } else {
      // Stop the job
      if (this.intervals.has(name)) {
        clearInterval(this.intervals.get(name));
        this.intervals.delete(name);
      }

      if (this.timeouts.has(name)) {
        clearTimeout(this.timeouts.get(name));
        this.timeouts.delete(name);
      }
    }

    console.log(`Job ${name} ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }

  // Run a job immediately
  async runJobNow(name) {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Job not found: ${name}`);
    }

    await this.executeJob(name, job);
  }

  // Get job status
  getJob(name) {
    const job = this.jobs.get(name);
    if (!job) {
      return null;
    }

    return {
      ...job,
      status: job.enabled ? 'enabled' : 'disabled',
      nextRun: job.nextRun ? new Date(job.nextRun).toISOString() : null,
      lastRun: job.lastRun ? new Date(job.lastRun).toISOString() : null
    };
  }

  // Get all jobs
  getAllJobs() {
    const jobs = [];
    this.jobs.forEach((job, name) => {
      jobs.push(this.getJob(name));
    });
    return jobs;
  }

  // Get scheduler statistics
  getStats() {
    return {
      ...this.stats,
      running: this.running,
      activeJobs: this.jobs.size,
      activeIntervals: this.intervals.size,
      activeTimeouts: this.timeouts.size,
      uptime: this.running ? Date.now() - this.stats.startTime : 0
    };
  }

  // Health check
  healthCheck() {
    const stats = this.getStats();
    const failureRate = stats.executedJobs > 0 ?
      (stats.failedJobs / (stats.executedJobs + stats.failedJobs)) * 100 : 0;

    return {
      status: this.running && failureRate < 10 ? 'healthy' : 'degraded',
      running: this.running,
      jobCount: this.jobs.size,
      failureRate: Math.round(failureRate * 100) / 100,
      lastExecution: this.stats.lastExecution
    };
  }

  // Utility: Add common maintenance jobs
  addMaintenanceJobs() {
    // Log cleanup - daily at 2 AM
    this.addDailyJob('log_cleanup', async () => {
      console.log('Running log cleanup...');
      // Add log cleanup logic here
    }, 2, 0);

    // Database maintenance - daily at 3 AM
    this.addDailyJob('db_maintenance', async () => {
      console.log('Running database maintenance...');
      // Add database maintenance logic here
    }, 3, 0);

    // Health check - every 5 minutes
    this.addIntervalJob('health_check', async () => {
      console.log('Running health check...');
      // Add health check logic here
    }, 5 * 60 * 1000);

    console.log('Added maintenance jobs');
  }
}

module.exports = new SimpleScheduler();