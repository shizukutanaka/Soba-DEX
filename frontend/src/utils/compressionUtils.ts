// Lightweight compression utility
export class CompressionUtils {
  static async compress(data: string): Promise<string> {
    // Simple base64 encoding for now - can be enhanced later if needed
    return btoa(data);
  }

  static async decompress(data: string): Promise<string> {
    // Simple base64 decoding
    return atob(data);
  }

  static shouldCompress(data: string, threshold: number = 1024): boolean {
    return data.length > threshold;
  }
}