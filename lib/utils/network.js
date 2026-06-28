/**
 * Network Utilities
 * 
 * Provides robust retry and timeout logic for external API calls
 * to ensure institutional-grade resilience against rate limits (429)
 * and transient server errors (5xx).
 */

const breakers = new Map();

/**
 * Wrapper for API functions to add exponential backoff, timeout, and circuit breaker logic.
 * 
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry options
 * @param {string} options.domain - Domain for circuit breaker (default 'default')
 * @param {number} options.maxRetries - Max number of retries (default 3)
 * @param {number} options.baseDelay - Base delay in ms (default 500)
 * @param {number} options.timeoutMs - Execution timeout per attempt (default 8000)
 * @param {number} options.maxFailures - Circuit breaker max failures (default 5)
 * @param {number} options.resetTimeout - Circuit breaker reset timeout in ms (default 30000)
 * @returns {Promise<any>}
 */
export async function withRetry(fn, options = {}) {
  const domain = options.domain || 'default';
  const maxRetries = options.maxRetries || 3;
  const baseDelay = options.baseDelay || 500;
  const timeoutMs = options.timeoutMs || 8000;
  const maxFailures = options.maxFailures || 5;
  const resetTimeout = options.resetTimeout || 30000;

  let breaker = breakers.get(domain);
  if (!breaker) {
    breaker = { state: 'CLOSED', failures: 0, nextTry: 0 };
    breakers.set(domain, breaker);
  }

  if (breaker.state === 'OPEN') {
    if (Date.now() > breaker.nextTry) {
      breaker.state = 'HALF_OPEN';
    } else {
      throw new Error(`CIRCUIT_BREAKER_OPEN: Requests to ${domain} are blocked due to repeated failures.`);
    }
  }

  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      // Execute the function with a timeout race
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_ERROR')), timeoutMs)
      );

      const result = await Promise.race([fn(), timeoutPromise]);
      
      // Success: Reset circuit breaker
      breaker.state = 'CLOSED';
      breaker.failures = 0;
      
      return result;
    } catch (error) {
      attempt++;
      
      // Track failures for circuit breaker
      breaker.failures++;
      if (breaker.failures >= maxFailures) {
        breaker.state = 'OPEN';
        breaker.nextTry = Date.now() + resetTimeout;
        console.warn(`[CircuitBreaker] Tripped OPEN for ${domain}. Pausing requests for ${resetTimeout}ms.`);
      }

      const isRateLimit = error.message && error.message.includes('429');
      const isServerError = error.message && error.message.match(/50\d/);
      const isTimeout = error.message === 'TIMEOUT_ERROR';
      const isYahooError = error.message && error.message.includes('TooManyRequests');

      if (!isRateLimit && !isServerError && !isTimeout && !isYahooError && attempt >= maxRetries) {
        throw error;
      }
      
      if (attempt >= maxRetries) {
        throw new Error(`Failed after ${maxRetries} attempts. Last error: ${error.message}`);
      }

      // Exponential backoff with jitter
      const jitter = Math.random() * 200;
      const delay = baseDelay * Math.pow(2, attempt - 1) + jitter;
      
      console.warn(`[Network] Attempt ${attempt} failed: ${error.message}. Retrying in ${Math.round(delay)}ms...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

