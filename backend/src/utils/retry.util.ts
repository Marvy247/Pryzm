/**
 * Retries a function with exponential backoff
 * @param fn The async function to retry
 * @param retries Maximum number of retries (default: 10)
 * @param delay Initial delay in ms (default: 1000)
 * @param backoffFactor Factor to multiply delay by after each failure (default: 2)
 */
export async function retry<T>(
  fn: () => Promise<T>,
  retries: number = 10,
  delay: number = 1000,
  backoffFactor: number = 2,
  shouldRetry?: (error: any) => boolean
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0 || (shouldRetry && !shouldRetry(error))) {
      throw error;
    }
    
    console.warn(`Operation failed, retrying in ${delay}ms... (${retries} retries left)`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    return retry(fn, retries - 1, delay * backoffFactor, backoffFactor, shouldRetry);
  }
}
