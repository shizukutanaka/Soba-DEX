// Lightweight performance monitor - only essential metrics
export class PerformanceMonitor {
  private startTime: number = Date.now();
  private apiCallCount: number = 0;
  private apiTotalTime: number = 0;

  recordApiCall(duration: number): void {
    this.apiCallCount++;
    this.apiTotalTime += duration;
  }

  getAverageApiTime(): number {
    return this.apiCallCount > 0 ? this.apiTotalTime / this.apiCallCount : 0;
  }

  getUptime(): number {
    return Date.now() - this.startTime;
  }

  getMetrics(): { uptime: number; apiCalls: number; avgApiTime: number } {
    return {
      uptime: this.getUptime(),
      apiCalls: this.apiCallCount,
      avgApiTime: this.getAverageApiTime()
    };
  }

  reset(): void {
    this.apiCallCount = 0;
    this.apiTotalTime = 0;
    this.startTime = Date.now();
  }
}